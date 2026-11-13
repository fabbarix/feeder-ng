package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// prepareDatabase takes feeder-pre-1540.db before the beta.6 migration 1540 Base recipes (docs/dev/design/b6-snap.md;
// ADR 0015), after the 1400 and 1500 ones in the ordered table. The tests call prepareDatabaseWith with the real
// migrations below 1500 (realPlus) plus synthetic 1500/1510/1540 files, so they keep passing whatever is embedded.
// They reuse the helpers of startup_pre1500_test.go (realPlus, migrateFS, openSnapshot, exists).

const pre1540Name = "feeder-pre-1540.db"

func TestPrepareDatabaseSnapshotsBeforeBeta6Migration(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t, "1500_a.sql", "1510_b.sql")) // a beta.5 database
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1510_b.sql", "1540_x.sql")); err != nil {
		t.Fatalf("prepareDatabaseWith: %v", err)
	}
	if !hasTable(t, d, "s_1540_x") {
		t.Error("the database was not migrated")
	}
	snap := openSnapshot(t, dir, pre1540Name)
	var res string
	if err := snap.QueryRow(`PRAGMA integrity_check`).Scan(&res); err != nil || res != "ok" {
		t.Errorf("integrity_check = %q, %v", res, err)
	}
	if hasTable(t, snap, "s_1540_x") {
		t.Error("the snapshot was taken after 1540: it must be the pre-1540 database")
	}
	if !hasTable(t, snap, "s_1510_b") {
		t.Error("the pre-1540 snapshot must hold the beta.5 schema")
	}
	if st, err := os.Stat(filepath.Join(dir, "backups", pre1540Name)); err != nil || st.Mode().Perm() != 0o600 {
		t.Errorf("stat = %v, %v; want a 0600 file", st, err)
	}
	if exists(dir, pre1400Name) || exists(dir, pre1500Name) {
		t.Error("a beta.5 database must get only the pre-1540 snapshot")
	}
}

func TestPrepareDatabaseTakesNoPre1540SnapshotOnAFreshInstall(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_x.sql")); err != nil {
		t.Fatal(err)
	}
	if !hasTable(t, d, "s_1540_x") {
		t.Error("the database was not migrated")
	}
	for _, n := range []string{pre1400Name, pre1500Name, pre1540Name} {
		if exists(dir, n) {
			t.Errorf("a fresh install must not take %s", n)
		}
	}
}

func TestPrepareDatabaseDoesNotRetakePre1540OnceMigrated(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	fsys := realPlus(t, "1500_a.sql", "1540_x.sql")
	migrateFS(t, d, realPlus(t, "1500_a.sql"))
	ctx := context.Background()
	if err := prepareDatabaseWith(ctx, d, dir, quiet, fsys); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "backups", pre1540Name)
	if err := os.WriteFile(path, []byte("marker: the pre-1540 file must be left as it is"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := prepareDatabaseWith(ctx, d, dir, quiet, fsys); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(path); !strings.HasPrefix(string(got), "marker:") {
		t.Error("a start-up after 1540 replaced feeder-pre-1540.db")
	}
}

func TestPrepareDatabaseKeepsAnExistingPre1540SnapshotWhenTheMigrationIsStillPending(t *testing.T) {
	// 1540 failed last time (rolled back, still pending) and the file already holds the true pre-1540 database.
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t, "1500_a.sql"))
	path := filepath.Join(dir, "backups", pre1540Name)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("marker: the first pre-1540 snapshot"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_x.sql")); err != nil {
		t.Fatal(err)
	}
	if !hasTable(t, d, "s_1540_x") {
		t.Error("1540 was not applied")
	}
	if got, _ := os.ReadFile(path); !strings.HasPrefix(string(got), "marker:") {
		t.Error("the existing feeder-pre-1540.db was replaced")
	}
}

func TestPrepareDatabaseStopsWhenThePre1540SnapshotFailsAndDoesNotMigrate(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t, "1500_a.sql"))
	if err := os.WriteFile(filepath.Join(dir, "backups"), []byte("in the way"), 0o600); err != nil {
		t.Fatal(err)
	}
	err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_x.sql"))
	if err == nil {
		t.Fatal("prepareDatabaseWith succeeded without a snapshot")
	}
	if !strings.Contains(err.Error(), pre1540Name) {
		t.Errorf("err = %v, want it to name %s", err, pre1540Name)
	}
	if hasTable(t, d, "s_1540_x") {
		t.Error("1540 was applied although the snapshot failed")
	}
}

func TestPrepareDatabaseTakesBothSnapshotsWhenSkippingBeta5(t *testing.T) {
	// A beta.4.2 database with 1500 and 1540 both pending: both files, both before any migration.
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t))
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_x.sql")); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{pre1500Name, pre1540Name} {
		snap := openSnapshot(t, dir, name)
		if hasTable(t, snap, "s_1500_a") || hasTable(t, snap, "s_1540_x") {
			t.Errorf("%s was taken after a migration ran: both snapshots are the pre-1500 database", name)
		}
	}
	if exists(dir, pre1400Name) {
		t.Error("a database that already has 1400 must not get a pre-1400 snapshot")
	}
	if !hasTable(t, d, "s_1500_a") || !hasTable(t, d, "s_1540_x") {
		t.Error("the database was not fully migrated")
	}
}

func TestPrepareDatabaseTakesAllThreeSnapshotsWhenSkippingFromBeforeCourses(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateBefore1400(t, d)
	addPlannedMeal(t, d)
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_x.sql")); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{pre1400Name, pre1500Name, pre1540Name} {
		snap := openSnapshot(t, dir, name)
		if hasTable(t, snap, "courses") || hasTable(t, snap, "s_1500_a") || hasTable(t, snap, "s_1540_x") {
			t.Errorf("%s was taken after a migration ran: all three are the pre-1400 database", name)
		}
	}
	if !hasTable(t, d, "courses") || !hasTable(t, d, "s_1500_a") || !hasTable(t, d, "s_1540_x") {
		t.Error("the database was not fully migrated")
	}
}

func TestPrepareDatabaseWritesNoSnapshotWhenAllThreeFailFirst(t *testing.T) {
	// The first snapshot to fail stops start-up: nothing is migrated, not even by 1400.
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateBefore1400(t, d)
	addPlannedMeal(t, d)
	if err := os.WriteFile(filepath.Join(dir, "backups"), []byte("in the way"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_x.sql")); err == nil {
		t.Fatal("prepareDatabaseWith succeeded without a snapshot")
	}
	if hasTable(t, d, "courses") || hasTable(t, d, "s_1500_a") || hasTable(t, d, "s_1540_x") {
		t.Error("a migration ran although a snapshot failed")
	}
}
