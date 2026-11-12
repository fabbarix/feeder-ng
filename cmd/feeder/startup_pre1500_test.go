package main

import (
	"context"
	"database/sql"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// prepareDatabase takes feeder-pre-1500.db before the beta.5 migrations 1500 to 1530, whichever of them is
// pending (docs/dev/design/b5-snap.md; reconcile Q28 A). The tests call prepareDatabaseWith with the real
// migrations plus synthetic 1500 and 1510 files, so they keep passing once the real files land.

const pre1500Name = "feeder-pre-1500.db"

func realPlus(t *testing.T, extra ...string) fstest.MapFS {
	t.Helper()
	real := os.DirFS("../../internal/db/migrations")
	out := fstest.MapFS{}
	entries, err := fs.ReadDir(real, ".")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		// Drop any real 15NN file: the synthetic ones stand in for them.
		if strings.HasSuffix(e.Name(), ".sql") && e.Name() < "1500_" {
			b, _ := fs.ReadFile(real, e.Name())
			out[e.Name()] = &fstest.MapFile{Data: b}
		}
	}
	for _, n := range extra {
		out[n] = &fstest.MapFile{Data: []byte("CREATE TABLE s_" + strings.TrimSuffix(n, ".sql") + " (id INTEGER PRIMARY KEY);")}
	}
	return out
}

func migrateFS(t *testing.T, d *sql.DB, fsys fs.FS) {
	t.Helper()
	if err := db.Migrate(context.Background(), d, fsys); err != nil {
		t.Fatal(err)
	}
}

func openSnapshot(t *testing.T, dir, name string) *sql.DB {
	t.Helper()
	if !exists(dir, name) {
		t.Fatalf("snapshot %s was not written", name) // db.Open would create an empty file
	}
	snap, err := db.Open(filepath.Join(dir, "backups", name))
	if err != nil {
		t.Fatalf("snapshot %s missing or unreadable: %v", name, err)
	}
	t.Cleanup(func() { snap.Close() })
	return snap
}

func exists(dir, name string) bool {
	_, err := os.Stat(filepath.Join(dir, "backups", name))
	return err == nil
}

func TestPrepareDatabaseSnapshotsBeforeBeta5Migrations(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t)) // a beta.4.1 database
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1510_b.sql")); err != nil {
		t.Fatalf("prepareDatabaseWith: %v", err)
	}
	if !hasTable(t, d, "s_1500_a") || !hasTable(t, d, "s_1510_b") {
		t.Error("the database was not migrated")
	}
	snap := openSnapshot(t, dir, pre1500Name)
	var res string
	if err := snap.QueryRow(`PRAGMA integrity_check`).Scan(&res); err != nil || res != "ok" {
		t.Errorf("integrity_check = %q, %v", res, err)
	}
	if hasTable(t, snap, "s_1500_a") {
		t.Error("the snapshot was taken after 1500: it must be the pre-1500 database")
	}
	if exists(dir, pre1400Name) {
		t.Error("a database that already has 1400 must not get a pre-1400 snapshot")
	}
}

func TestPrepareDatabaseTakesNoPre1500SnapshotOnAFreshInstall(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql")); err != nil {
		t.Fatal(err)
	}
	if !hasTable(t, d, "s_1500_a") {
		t.Error("the database was not migrated")
	}
	if exists(dir, pre1500Name) {
		t.Error("a fresh install must not take a pre-1500 snapshot")
	}
}

func TestPrepareDatabaseDoesNotRetakePre1500OnceMigrated(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	fsys := realPlus(t, "1500_a.sql", "1510_b.sql")
	migrateFS(t, d, realPlus(t))
	ctx := context.Background()
	if err := prepareDatabaseWith(ctx, d, dir, quiet, fsys); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "backups", pre1500Name)
	if err := os.WriteFile(path, []byte("marker: the pre-1500 file must be left as it is"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := prepareDatabaseWith(ctx, d, dir, quiet, fsys); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(path); !strings.HasPrefix(string(got), "marker:") {
		t.Error("a start-up after 1500 to 1530 replaced feeder-pre-1500.db")
	}
}

func TestPrepareDatabaseKeepsAnExistingPre1500SnapshotWhenAMigrationIsStillPending(t *testing.T) {
	// 1500 applied, 1510 failed last time and is still pending: the file holds the true pre-1500 database,
	// and a second snapshot would replace it with a half-migrated one.
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t))
	ctx := context.Background()
	if err := prepareDatabaseWith(ctx, d, dir, quiet, realPlus(t, "1500_a.sql")); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "backups", pre1500Name)
	if err := os.WriteFile(path, []byte("marker: the first pre-1500 snapshot"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := prepareDatabaseWith(ctx, d, dir, quiet, realPlus(t, "1500_a.sql", "1510_b.sql")); err != nil {
		t.Fatal(err)
	}
	if !hasTable(t, d, "s_1510_b") {
		t.Error("1510 was not applied")
	}
	if got, _ := os.ReadFile(path); !strings.HasPrefix(string(got), "marker:") {
		t.Error("the existing feeder-pre-1500.db was replaced")
	}
}

func TestPrepareDatabaseTakesTheSnapshotWhenOnlyALaterBeta5MigrationIsPending(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t, "1500_a.sql")) // 1500 applied, no snapshot file yet
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1530_c.sql")); err != nil {
		t.Fatal(err)
	}
	snap := openSnapshot(t, dir, pre1500Name)
	if hasTable(t, snap, "s_1530_c") {
		t.Error("the snapshot was taken after 1530")
	}
	if !hasTable(t, d, "s_1530_c") {
		t.Error("1530 was not applied")
	}
}

func TestPrepareDatabaseStopsWhenThePre1500SnapshotFailsAndDoesNotMigrate(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t))
	if err := os.WriteFile(filepath.Join(dir, "backups"), []byte("in the way"), 0o600); err != nil {
		t.Fatal(err)
	}
	err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql"))
	if err == nil {
		t.Fatal("prepareDatabaseWith succeeded without a snapshot")
	}
	if !strings.Contains(err.Error(), pre1500Name) {
		t.Errorf("err = %v, want it to name %s", err, pre1500Name)
	}
	if hasTable(t, d, "s_1500_a") {
		t.Error("1500 was applied although the snapshot failed")
	}
}

func TestPrepareDatabaseTakesBothSnapshotsWhenSkippingFromBeforeCourses(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateBefore1400(t, d)
	addPlannedMeal(t, d)
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql")); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{pre1400Name, pre1500Name} {
		snap := openSnapshot(t, dir, name)
		if hasTable(t, snap, "courses") {
			t.Errorf("%s was taken after 1400", name)
		}
	}
	if !hasTable(t, d, "courses") || !hasTable(t, d, "s_1500_a") {
		t.Error("the database was not fully migrated")
	}
}
