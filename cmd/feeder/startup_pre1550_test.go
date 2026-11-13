package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// prepareDatabase takes feeder-pre-1550.db before the beta.7 migration 1550 Supplies (docs/dev/design/b7-snap.md;
// ADR 0017), after the 1400, 1500 and 1540 ones in the ordered table. Like startup_pre1540_test.go the tests call
// prepareDatabaseWith with the real migrations below 1500 (realPlus) plus synthetic 1500/1510/1540/1550 files, so
// they keep passing whatever is embedded. They reuse the helpers of startup_pre1500_test.go and startup_test.go.
// Red until startup.go has the fourth row.

const pre1550Name = "feeder-pre-1550.db"

func TestPrepareDatabaseSnapshotsBeforeBeta7Migration(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	beta6 := realPlus(t, "1500_a.sql", "1510_b.sql", "1540_c.sql") // a beta.6 database
	migrateFS(t, d, beta6)
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1510_b.sql", "1540_c.sql", "1550_x.sql")); err != nil {
		t.Fatalf("prepareDatabaseWith: %v", err)
	}
	if !hasTable(t, d, "s_1550_x") {
		t.Error("the database was not migrated")
	}
	snap := openSnapshot(t, dir, pre1550Name)
	var res string
	if err := snap.QueryRow(`PRAGMA integrity_check`).Scan(&res); err != nil || res != "ok" {
		t.Errorf("integrity_check = %q, %v", res, err)
	}
	if hasTable(t, snap, "s_1550_x") {
		t.Error("the snapshot was taken after 1550: it must be the pre-1550 database")
	}
	if !hasTable(t, snap, "s_1540_c") {
		t.Error("the pre-1550 snapshot must hold the beta.6 schema")
	}
	if st, err := os.Stat(filepath.Join(dir, "backups", pre1550Name)); err != nil || st.Mode().Perm() != 0o600 {
		t.Errorf("stat = %v, %v; want a 0600 file", st, err)
	}
	for _, n := range []string{pre1400Name, pre1500Name, pre1540Name} {
		if exists(dir, n) {
			t.Errorf("a beta.6 database must get only the pre-1550 snapshot, found %s", n)
		}
	}
}

func TestPrepareDatabaseTakesNoPre1550SnapshotOnAFreshInstall(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_x.sql")); err != nil {
		t.Fatal(err)
	}
	if !hasTable(t, d, "s_1550_x") {
		t.Error("the database was not migrated")
	}
	for _, n := range []string{pre1400Name, pre1500Name, pre1540Name, pre1550Name} {
		if exists(dir, n) {
			t.Errorf("a fresh install must not take %s", n)
		}
	}
}

func TestPrepareDatabaseDoesNotRetakePre1550OnceMigrated(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	fsys := realPlus(t, "1500_a.sql", "1540_b.sql", "1550_x.sql")
	migrateFS(t, d, realPlus(t, "1500_a.sql", "1540_b.sql"))
	ctx := context.Background()
	if err := prepareDatabaseWith(ctx, d, dir, quiet, fsys); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "backups", pre1550Name)
	if err := os.WriteFile(path, []byte("marker: the pre-1550 file must be left as it is"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := prepareDatabaseWith(ctx, d, dir, quiet, fsys); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(path); !strings.HasPrefix(string(got), "marker:") {
		t.Error("a start-up after 1550 replaced feeder-pre-1550.db")
	}
}

func TestPrepareDatabaseKeepsAnExistingPre1550SnapshotWhenTheMigrationIsStillPending(t *testing.T) {
	// 1550 failed last time (rolled back, still pending) and the file already holds the true pre-1550 database.
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t, "1500_a.sql", "1540_b.sql"))
	path := filepath.Join(dir, "backups", pre1550Name)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("marker: the first pre-1550 snapshot"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_x.sql")); err != nil {
		t.Fatal(err)
	}
	if !hasTable(t, d, "s_1550_x") {
		t.Error("1550 was not applied")
	}
	if got, _ := os.ReadFile(path); !strings.HasPrefix(string(got), "marker:") {
		t.Error("the existing feeder-pre-1550.db was replaced")
	}
}

func TestPrepareDatabaseStopsWhenThePre1550SnapshotFailsAndDoesNotMigrate(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t, "1500_a.sql", "1540_b.sql"))
	if err := os.WriteFile(filepath.Join(dir, "backups"), []byte("in the way"), 0o600); err != nil {
		t.Fatal(err)
	}
	err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_x.sql"))
	if err == nil {
		t.Fatal("prepareDatabaseWith succeeded without a snapshot")
	}
	if !strings.Contains(err.Error(), pre1550Name) {
		t.Errorf("err = %v, want it to name %s", err, pre1550Name)
	}
	if hasTable(t, d, "s_1550_x") {
		t.Error("1550 was applied although the snapshot failed")
	}
}

// The user's skip upgrade: 1.0.0-beta.5.x to 1.0.0-beta.7. 1540 and 1550 are both pending: both snapshots are taken,
// both before any migration, so both are the beta.5 database; no pre-1500 file (beta.5 has 1500 to 1530).
func TestPrepareDatabaseTakesPre1540AndPre1550WhenSkippingFromBeta5ToBeta7(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t, "1500_a.sql", "1510_b.sql", "1520_c.sql", "1530_d.sql")) // a beta.5 database
	fsys := realPlus(t, "1500_a.sql", "1510_b.sql", "1520_c.sql", "1530_d.sql", "1540_e.sql", "1550_f.sql")
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, fsys); err != nil {
		t.Fatalf("prepareDatabaseWith: %v", err)
	}
	for _, name := range []string{pre1540Name, pre1550Name} {
		snap := openSnapshot(t, dir, name)
		if hasTable(t, snap, "s_1540_e") || hasTable(t, snap, "s_1550_f") {
			t.Errorf("%s was taken after a migration ran: both snapshots are the beta.5 database", name)
		}
		if !hasTable(t, snap, "s_1530_d") {
			t.Errorf("%s must hold the beta.5 schema", name)
		}
	}
	for _, n := range []string{pre1400Name, pre1500Name} {
		if exists(dir, n) {
			t.Errorf("a beta.5 database must not get %s", n)
		}
	}
	if !hasTable(t, d, "s_1540_e") || !hasTable(t, d, "s_1550_f") {
		t.Error("the database was not fully migrated")
	}
}

func TestPrepareDatabaseTakesThreeSnapshotsWhenSkippingBeta5AndBeta6(t *testing.T) {
	// A beta.4.2 database with 1500, 1540 and 1550 pending: three files, all before any migration.
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateFS(t, d, realPlus(t))
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_c.sql")); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{pre1500Name, pre1540Name, pre1550Name} {
		snap := openSnapshot(t, dir, name)
		if hasTable(t, snap, "s_1500_a") || hasTable(t, snap, "s_1540_b") || hasTable(t, snap, "s_1550_c") {
			t.Errorf("%s was taken after a migration ran: all are the pre-1500 database", name)
		}
	}
	if exists(dir, pre1400Name) {
		t.Error("a database that already has 1400 must not get a pre-1400 snapshot")
	}
}

func TestPrepareDatabaseTakesAllFourSnapshotsWhenSkippingFromBeforeCourses(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateBefore1400(t, d)
	addPlannedMeal(t, d)
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_c.sql")); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{pre1400Name, pre1500Name, pre1540Name, pre1550Name} {
		snap := openSnapshot(t, dir, name)
		if hasTable(t, snap, "courses") || hasTable(t, snap, "s_1500_a") || hasTable(t, snap, "s_1540_b") || hasTable(t, snap, "s_1550_c") {
			t.Errorf("%s was taken after a migration ran: all four are the pre-1400 database", name)
		}
	}
	if !hasTable(t, d, "courses") || !hasTable(t, d, "s_1550_c") {
		t.Error("the database was not fully migrated")
	}
}

func TestPrepareDatabaseStopsAtTheFirstFailingSnapshotAndMigratesNothing(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateBefore1400(t, d)
	addPlannedMeal(t, d)
	if err := os.WriteFile(filepath.Join(dir, "backups"), []byte("in the way"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := prepareDatabaseWith(context.Background(), d, dir, quiet, realPlus(t, "1500_a.sql", "1540_b.sql", "1550_c.sql")); err == nil {
		t.Fatal("prepareDatabaseWith succeeded without a snapshot")
	}
	if hasTable(t, d, "courses") || hasTable(t, d, "s_1500_a") || hasTable(t, d, "s_1540_b") || hasTable(t, d, "s_1550_c") {
		t.Error("a migration ran although a snapshot failed")
	}
}
