package main

import (
	"context"
	"database/sql"
	"io"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// prepareDatabase takes feeder-pre-1400.db before migration 1400 on a database that already has Planned Meals
// (docs/dev/design/crs-plan.md §1.3, team A). The tests call it, not main.

const pre1400Name = "feeder-pre-1400.db"

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

func openIn(t *testing.T, dataDir string) *sql.DB {
	t.Helper()
	d, err := db.Open(filepath.Join(dataDir, "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

// migrateBefore applies every real migration that sorts before 1400.
func migrateBefore1400(t *testing.T, d *sql.DB) {
	t.Helper()
	real := os.DirFS("../../internal/db/migrations")
	out := fstest.MapFS{}
	entries, err := fs.ReadDir(real, ".")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".sql") && e.Name() < "1400_" {
			b, _ := fs.ReadFile(real, e.Name())
			out[e.Name()] = &fstest.MapFile{Data: b}
		}
	}
	if err := db.Migrate(context.Background(), d, out); err != nil {
		t.Fatal(err)
	}
}

func addPlannedMeal(t *testing.T, d *sql.DB) {
	t.Helper()
	for _, q := range []string{
		`INSERT INTO meal_slots(id,weekday,name,time) VALUES (4,1,'Dinner','19:00')`,
		`INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (11,'Soup',4,'t','t')`,
		`INSERT INTO planned_meals(id,date,meal_slot_id,recipe_id,batches,portions,created_at,updated_at) VALUES (21,'2026-11-10',4,11,1,4,'t','t')`,
	} {
		if _, err := d.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
}

func hasTable(t *testing.T, d *sql.DB, name string) bool {
	t.Helper()
	var n int
	if err := d.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?`, name).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n == 1
}

func TestPrepareDatabaseSnapshotsBeforeMigratingADatabaseWithPlannedMeals(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateBefore1400(t, d)
	addPlannedMeal(t, d)

	if err := prepareDatabase(context.Background(), d, dir, quiet); err != nil {
		t.Fatalf("prepareDatabase: %v", err)
	}
	if !hasTable(t, d, "courses") {
		t.Error("the database was not migrated")
	}
	snapPath := filepath.Join(dir, "backups", pre1400Name)
	snap, err := db.Open(snapPath)
	if err != nil {
		t.Fatalf("snapshot missing or unreadable: %v", err)
	}
	defer snap.Close()
	var res string
	if err := snap.QueryRow(`PRAGMA integrity_check`).Scan(&res); err != nil || res != "ok" {
		t.Errorf("integrity_check = %q, %v", res, err)
	}
	if hasTable(t, snap, "courses") {
		t.Error("the snapshot was taken after 1400: it must be the pre-1400 database")
	}
	var n int
	if err := snap.QueryRow(`SELECT count(*) FROM planned_meals`).Scan(&n); err != nil || n != 1 {
		t.Errorf("snapshot has %d Planned Meals, %v; want the 1 that was there", n, err)
	}
}

func TestPrepareDatabaseTakesNoSnapshotOnAFreshInstall(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	if err := prepareDatabase(context.Background(), d, dir, quiet); err != nil {
		t.Fatalf("prepareDatabase: %v", err)
	}
	if !hasTable(t, d, "courses") {
		t.Error("the database was not migrated")
	}
	if _, err := os.Stat(filepath.Join(dir, "backups", pre1400Name)); !os.IsNotExist(err) {
		t.Errorf("a fresh install must not take a pre-1400 snapshot (stat err = %v)", err)
	}
}

func TestPrepareDatabaseTakesNoSnapshotWithoutPlannedMeals(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateBefore1400(t, d) // upgrading Household that never planned anything
	if err := prepareDatabase(context.Background(), d, dir, quiet); err != nil {
		t.Fatalf("prepareDatabase: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "backups", pre1400Name)); !os.IsNotExist(err) {
		t.Errorf("no Planned Meals, no snapshot (stat err = %v)", err)
	}
}

func TestPrepareDatabaseDoesNotSnapshotAgainOnceMigrated(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateBefore1400(t, d)
	addPlannedMeal(t, d)
	ctx := context.Background()
	if err := prepareDatabase(ctx, d, dir, quiet); err != nil {
		t.Fatal(err)
	}
	snapPath := filepath.Join(dir, "backups", pre1400Name)
	if err := os.WriteFile(snapPath, []byte("marker: the pre-1400 file must be left as it is"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := prepareDatabase(ctx, d, dir, quiet); err != nil {
		t.Fatalf("second prepareDatabase: %v", err)
	}
	if got, _ := os.ReadFile(snapPath); !strings.HasPrefix(string(got), "marker:") {
		t.Error("a start-up after 1400 replaced feeder-pre-1400.db")
	}
}

func TestPrepareDatabaseStopsWhenTheSnapshotFailsAndDoesNotMigrate(t *testing.T) {
	dir := t.TempDir()
	d := openIn(t, dir)
	migrateBefore1400(t, d)
	addPlannedMeal(t, d)
	// A file where the backups folder must go: the snapshot cannot be written.
	if err := os.WriteFile(filepath.Join(dir, "backups"), []byte("in the way"), 0o600); err != nil {
		t.Fatal(err)
	}
	err := prepareDatabase(context.Background(), d, dir, quiet)
	if err == nil {
		t.Fatal("prepareDatabase succeeded without a snapshot")
	}
	if !strings.Contains(err.Error(), pre1400Name) && !strings.Contains(err.Error(), "backup") {
		t.Errorf("err = %v, want a clear message about the snapshot", err)
	}
	if hasTable(t, d, "courses") {
		t.Error("1400 was applied although the snapshot failed")
	}
	var planned int
	if err := d.QueryRow(`SELECT count(*) FROM planned_meals`).Scan(&planned); err != nil || planned != 1 {
		t.Errorf("planned_meals = %d, %v; the database must be unchanged", planned, err)
	}
}
