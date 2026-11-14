package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// prepareDatabase takes feeder-pre-1560.db before the beta.8 migration 1560 (Undo of a tick, ADR 0019;
// docs/dev/design/b8-snap.md), after the 1400, 1500, 1540 and 1550 ones in the ordered table. Like
// startup_pre1550_test.go the tests call prepareDatabaseWith with the real migrations below 1500 (realPlus) plus
// synthetic 15NN files, so they keep passing whatever is embedded.

const pre1560Name = "feeder-pre-1560.db"

func TestPrepareDatabaseSnapshotsBeforeBeta8Migration(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_c.sql")) // a beta.7 database
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_c.sql", "1560_x.sql")); err != nil {
		t.Fatalf("prepareDatabaseWith: %v", err)
	}
	if !hasTable(t, d, "s_1560_x") {
		t.Error("the database was not migrated")
	}
	snap := openSnapshot(t, dir, pre1560Name)
	var res string
	if err := snap.QueryRow(`PRAGMA integrity_check`).Scan(&res); err != nil || res != "ok" {
		t.Errorf("integrity_check = %q, %v", res, err)
	}
	if hasTable(t, snap, "s_1560_x") {
		t.Error("the snapshot was taken after 1560: it must be the pre-1560 database")
	}
	if !hasTable(t, snap, "s_1550_c") {
		t.Error("the pre-1560 snapshot must hold the beta.7 schema")
	}
	if st, err := os.Stat(filepath.Join(dir, "backups", pre1560Name)); err != nil || st.Mode().Perm() != 0o600 {
		t.Errorf("stat = %v, %v; want a 0600 file", st, err)
	}
	for _, n := range []string{pre1400Name, pre1500Name, pre1540Name, pre1550Name} {
		if exists(dir, n) {
			t.Errorf("a beta.7 database must get only the pre-1560 snapshot, found %s", n)
		}
	}
}

func TestPrepareDatabaseTakesNoPre1560SnapshotOnAFreshInstall(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_c.sql", "1560_x.sql")); err != nil {
		t.Fatal(err)
	}
	for _, n := range []string{pre1400Name, pre1500Name, pre1540Name, pre1550Name, pre1560Name} {
		if exists(dir, n) {
			t.Errorf("a fresh install must not take %s", n)
		}
	}
}

func TestPrepareDatabaseKeepsAnExistingPre1560Snapshot(t *testing.T) {
	// 1560 failed last time (rolled back, still pending), or ran already: the file is never replaced.
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_c.sql"))
	path := filepath.Join(dir, "backups", pre1560Name)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("marker: the first pre-1560 snapshot"), 0o600); err != nil {
		t.Fatal(err)
	}
	fsys := realPlus(t, "1500_a.sql", "1540_b.sql", "1550_c.sql", "1560_x.sql")
	for i := 0; i < 2; i++ {
		if err := prepareDatabaseWith(context.Background(), d, dir, quiet, fsys); err != nil {
			t.Fatal(err)
		}
	}
	if !hasTable(t, d, "s_1560_x") {
		t.Error("1560 was not applied")
	}
	if got, _ := os.ReadFile(path); !strings.HasPrefix(string(got), "marker:") {
		t.Error("the existing feeder-pre-1560.db was replaced")
	}
}

func TestPrepareDatabaseStopsWhenThePre1560SnapshotFailsAndDoesNotMigrate(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_c.sql"))
	if err := os.WriteFile(filepath.Join(dir, "backups"), []byte("in the way"), 0o600); err != nil {
		t.Fatal(err)
	}
	err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_c.sql", "1560_x.sql"))
	if err == nil {
		t.Fatal("prepareDatabaseWith succeeded without a snapshot")
	}
	if !strings.Contains(err.Error(), pre1560Name) {
		t.Errorf("err = %v, want it to name %s", err, pre1560Name)
	}
	if hasTable(t, d, "s_1560_x") {
		t.Error("1560 was applied although the snapshot failed")
	}
}

// A skip upgrade from 1.0.0-beta.6.x to 1.0.0-beta.8: 1550 and 1560 are both pending, so both snapshots are taken
// before any migration, and both are the beta.6 database.
func TestPrepareDatabaseTakesPre1550AndPre1560WhenSkippingFromBeta6ToBeta8(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t, "1500_a.sql", "1540_b.sql")) // a beta.6 database
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_c.sql", "1560_d.sql")); err != nil {
		t.Fatalf("prepareDatabaseWith: %v", err)
	}
	for _, name := range []string{pre1550Name, pre1560Name} {
		snap := openSnapshot(t, dir, name)
		if hasTable(t, snap, "s_1550_c") || hasTable(t, snap, "s_1560_d") {
			t.Errorf("%s was taken after a migration ran: both snapshots are the beta.6 database", name)
		}
		if !hasTable(t, snap, "s_1540_b") {
			t.Errorf("%s must hold the beta.6 schema", name)
		}
	}
	for _, n := range []string{pre1400Name, pre1500Name, pre1540Name} {
		if exists(dir, n) {
			t.Errorf("a beta.6 database must not get %s", n)
		}
	}
	if !hasTable(t, d, "s_1550_c") || !hasTable(t, d, "s_1560_d") {
		t.Error("the database was not fully migrated")
	}
}

func TestPrepareDatabaseTakesAllFiveSnapshotsWhenSkippingFromBeforeCourses(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateBefore1400(t, d)
	addPlannedMeal(t, d)
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_c.sql", "1560_d.sql")); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{pre1400Name, pre1500Name, pre1540Name, pre1550Name, pre1560Name} {
		snap := openSnapshot(t, dir, name)
		if hasTable(t, snap, "courses") || hasTable(t, snap, "s_1500_a") || hasTable(t, snap, "s_1560_d") {
			t.Errorf("%s was taken after a migration ran: all five are the pre-1400 database", name)
		}
	}
	if !hasTable(t, d, "courses") || !hasTable(t, d, "s_1560_d") {
		t.Error("the database was not fully migrated")
	}
}
