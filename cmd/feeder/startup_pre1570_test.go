package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

// prepareDatabase takes feeder-pre-1570.db before the beta.9 migrations 1570 to 1577 (docs/dev/design/b9-snap.md,
// plan section 7), after the 1400, 1500, 1540, 1550 and 1560 ones in the ordered table. One snapshot covers all eight
// files. Like startup_pre1560_test.go the tests call prepareDatabaseWith with the real migrations below 1500
// (realPlus) plus synthetic 15NN files, so they keep passing whatever is embedded.

const pre1570Name = "feeder-pre-1570.db"

var beta8Files = []string{"1500_a.sql", "1540_b.sql", "1550_c.sql", "1560_d.sql"}

// plus is the beta.8 set with extra synthetic files.
func plus(t *testing.T, extra ...string) fstest.MapFS {
	t.Helper()
	return realPlus(t, append(append([]string{}, beta8Files...), extra...)...)
}

func TestPrepareDatabaseSnapshotsBeforeBeta9Migrations(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, plus(t)) // a beta.8 database
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, plus(t, "1570_x.sql", "1571_y.sql")); err != nil {
		t.Fatalf("prepareDatabaseWith: %v", err)
	}
	if !hasTable(t, d, "s_1570_x") || !hasTable(t, d, "s_1571_y") {
		t.Error("the database was not migrated")
	}
	snap := openSnapshot(t, dir, pre1570Name)
	var res string
	if err := snap.QueryRow(`PRAGMA integrity_check`).Scan(&res); err != nil || res != "ok" {
		t.Errorf("integrity_check = %q, %v", res, err)
	}
	if hasTable(t, snap, "s_1570_x") || hasTable(t, snap, "s_1571_y") {
		t.Error("the snapshot was taken after 1570: it must be the pre-1570 database")
	}
	if !hasTable(t, snap, "s_1560_d") {
		t.Error("the pre-1570 snapshot must hold the beta.8 schema")
	}
	if st, err := os.Stat(filepath.Join(dir, "backups", pre1570Name)); err != nil || st.Mode().Perm() != 0o600 {
		t.Errorf("stat = %v, %v; want a 0600 file", st, err)
	}
	for _, n := range []string{pre1400Name, pre1500Name, pre1540Name, pre1550Name, pre1560Name} {
		if exists(dir, n) {
			t.Errorf("a beta.8 database must get only the pre-1570 snapshot, found %s", n)
		}
	}
}

// Every one of 1570 to 1577 triggers the snapshot, so a package adding 1572 needs no change here or in db.go.
func TestPrepareDatabaseTakesThePre1570SnapshotForAnyOf1570To1577(t *testing.T) {
	for _, n := range []string{"1570_a.sql", "1571_a.sql", "1572_a.sql", "1573_a.sql", "1574_a.sql", "1575_a.sql", "1576_a.sql", "1577_a.sql"} {
		dir := t.TempDir()
		d := openIn(t, dir)
		migrateFS(t, d, plus(t))
		if err := prepareDatabaseWith(context.Background(), d, dir, quiet, plus(t, n)); err != nil {
			t.Fatal(err)
		}
		if !exists(dir, pre1570Name) {
			t.Errorf("%s pending: feeder-pre-1570.db was not taken", n)
		}
	}
}

func TestPrepareDatabaseTakesNoPre1570SnapshotOnAFreshInstall(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, plus(t, "1570_x.sql", "1571_y.sql")); err != nil {
		t.Fatal(err)
	}
	for _, n := range []string{pre1400Name, pre1500Name, pre1540Name, pre1550Name, pre1560Name, pre1570Name} {
		if exists(dir, n) {
			t.Errorf("a fresh install must not take %s", n)
		}
	}
}

func TestPrepareDatabaseKeepsAnExistingPre1570Snapshot(t *testing.T) {
	// 1570 failed last time (rolled back, still pending), or ran already: the file is never replaced.
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, plus(t))
	path := filepath.Join(dir, "backups", pre1570Name)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("marker: the first pre-1570 snapshot"), 0o600); err != nil {
		t.Fatal(err)
	}
	fsys := plus(t, "1570_x.sql", "1571_y.sql")
	for i := 0; i < 2; i++ {
		if err := prepareDatabaseWith(context.Background(), d, dir, quiet, fsys); err != nil {
			t.Fatal(err)
		}
	}
	if !hasTable(t, d, "s_1570_x") {
		t.Error("1570 was not applied")
	}
	if got, _ := os.ReadFile(path); !strings.HasPrefix(string(got), "marker:") {
		t.Error("the existing feeder-pre-1570.db was replaced")
	}
}

func TestPrepareDatabaseStopsWhenThePre1570SnapshotFailsAndDoesNotMigrate(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, plus(t))
	if err := os.WriteFile(filepath.Join(dir, "backups"), []byte("in the way"), 0o600); err != nil {
		t.Fatal(err)
	}
	err := prepareDatabaseWith(context.Background(), d, dir, quiet, plus(t, "1570_x.sql", "1571_y.sql"))
	if err == nil {
		t.Fatal("prepareDatabaseWith succeeded without a snapshot")
	}
	if !strings.Contains(err.Error(), pre1570Name) {
		t.Errorf("err = %v, want it to name %s", err, pre1570Name)
	}
	if hasTable(t, d, "s_1570_x") || hasTable(t, d, "s_1571_y") {
		t.Error("a 157x migration was applied although the snapshot failed")
	}
}

// Skipping beta.8: a beta.7 database has 1560 and 1570 both pending, so both snapshots are taken before any migration
// and both are the beta.7 database.
func TestPrepareDatabaseTakesPre1560AndPre1570WhenSkippingFromBeta7ToBeta9(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_c.sql")) // a beta.7 database
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, plus(t, "1570_x.sql", "1571_y.sql")); err != nil {
		t.Fatalf("prepareDatabaseWith: %v", err)
	}
	for _, name := range []string{pre1560Name, pre1570Name} {
		snap := openSnapshot(t, dir, name)
		if hasTable(t, snap, "s_1560_d") || hasTable(t, snap, "s_1570_x") {
			t.Errorf("%s was taken after a migration ran: both snapshots are the beta.7 database", name)
		}
		if !hasTable(t, snap, "s_1550_c") {
			t.Errorf("%s must hold the beta.7 schema", name)
		}
	}
	for _, n := range []string{pre1400Name, pre1500Name, pre1540Name, pre1550Name} {
		if exists(dir, n) {
			t.Errorf("a beta.7 database must not get %s", n)
		}
	}
	if !hasTable(t, d, "s_1560_d") || !hasTable(t, d, "s_1570_x") {
		t.Error("the database was not fully migrated")
	}
}

// Skipping from beta.4.2 (before Courses): all six snapshots, all the same pre-1400 database.
func TestPrepareDatabaseTakesAllSixSnapshotsWhenSkippingFromBeforeCourses(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateBefore1400(t, d)
	addPlannedMeal(t, d)
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, plus(t, "1570_x.sql", "1571_y.sql")); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{pre1400Name, pre1500Name, pre1540Name, pre1550Name, pre1560Name, pre1570Name} {
		snap := openSnapshot(t, dir, name)
		if hasTable(t, snap, "courses") || hasTable(t, snap, "s_1500_a") || hasTable(t, snap, "s_1570_x") {
			t.Errorf("%s was taken after a migration ran: all six are the pre-1400 database", name)
		}
	}
	if !hasTable(t, d, "courses") || !hasTable(t, d, "s_1570_x") {
		t.Error("the database was not fully migrated")
	}
}

// The real start-up wiring: preSnapshots has the sixth row, after 1560, and it keeps an existing file.
func TestPreSnapshotsTableHasThe1570RowLast(t *testing.T) {
	if len(preSnapshots) != 6 {
		t.Fatalf("preSnapshots has %d rows, want 6 (1400, 1500, 1540, 1550, 1560, 1570)", len(preSnapshots))
	}
	last := preSnapshots[len(preSnapshots)-1]
	if last.file != pre1570Name || last.migration != "1570" || !last.keep {
		t.Errorf("last row = %+v, want feeder-pre-1570.db, migration 1570, keep", last)
	}
}
