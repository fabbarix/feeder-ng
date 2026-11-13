package db_test

import (
	"context"
	"database/sql"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// Migration 1500 (docs/adr/0014-meal-slot-on-one-date.md; team B5-SD): meal_slot_dates, the per-date facts of a Meal
// Slot: Not served, the date's own time and the number of Guests.

func migrate1500(t *testing.T) *sql.DB {
	t.Helper()
	d := tagsOpenAt(t, "1500_") // everything before 1500
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (1,1,'Dinner','19:00')`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1500: %v", err)
	}
	return d
}

func TestMigration1500CreatesTheSlotDatesTable(t *testing.T) {
	d := migrate1500(t)
	got := rows(t, d, `SELECT name, type, "notnull", pk FROM pragma_table_info('meal_slot_dates') ORDER BY cid`)
	want := []string{"slot_id|INTEGER|1|1", "date|TEXT|1|2", "not_served|INTEGER|1|0", "time|TEXT|0|0", "guests|INTEGER|1|0", "updated_at|TEXT|1|0"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("columns =\n%v\nwant\n%v", got, want)
	}
	if n := count(t, d, `SELECT count(*) FROM schema_migrations WHERE name LIKE '1500\_%' ESCAPE '\'`); n != 1 {
		t.Errorf("1500 recorded %d times, want once", n)
	}
}

func TestMigration1500GuardsTheColumns(t *testing.T) {
	d := migrate1500(t)
	ins := func(date string, notServed int, tm any, guests int) error {
		_, err := d.Exec(`INSERT INTO meal_slot_dates(slot_id,date,not_served,time,guests,updated_at) VALUES (1,?,?,?,?,?)`,
			date, notServed, tm, guests, mts)
		return err
	}
	if err := ins("2026-11-12", 1, "20:15", 20); err != nil {
		t.Fatalf("a full row: %v", err)
	}
	if err := ins("2026-11-12", 0, nil, 0); err == nil {
		t.Error("the same slot and date twice must be refused")
	}
	if err := ins("2026-11-13", 2, nil, 0); err == nil {
		t.Error("not_served 2 must be refused")
	}
	if err := ins("2026-11-13", 0, "7pm", 0); err == nil {
		t.Error("a time that is not HH:MM must be refused")
	}
	if err := ins("2026-11-13", 0, nil, 21); err == nil {
		t.Error("21 Guests must be refused")
	}
	if err := ins("2026-11-13", 0, nil, -1); err == nil {
		t.Error("-1 Guests must be refused")
	}
	if err := ins("2026-11-14", 0, nil, 3); err != nil {
		t.Fatalf("Guests with the usual time: %v", err)
	}
}

func TestMigration1500CascadesWithTheMealSlot(t *testing.T) {
	d := migrate1500(t)
	mustExec(t, d, `INSERT INTO meal_slot_dates(slot_id,date,not_served,time,guests,updated_at) VALUES (1,'2026-11-12',1,NULL,0,?)`, mts)
	mustExec(t, d, `DELETE FROM meal_slots WHERE id = 1`)
	if n := count(t, d, `SELECT count(*) FROM meal_slot_dates`); n != 0 {
		t.Errorf("%d date rows survive their Meal Slot, want none", n)
	}
	if _, err := d.Exec(`INSERT INTO meal_slot_dates(slot_id,date,updated_at) VALUES (99,'2026-11-12',?)`, mts); err == nil {
		t.Error("a row for an unknown Meal Slot must be refused (foreign key)")
	}
}

func TestMigration1500KeepsTheAttendanceOverrides(t *testing.T) {
	d := tagsOpenAt(t, "1500_")
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (1,1,'Dinner','19:00')`)
	mustExec(t, d, `INSERT INTO attendance_overrides(slot_id,date) VALUES (1,'2026-11-09')`)
	before := rows(t, d, `SELECT * FROM attendance_overrides`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1500: %v", err)
	}
	if after := rows(t, d, `SELECT * FROM attendance_overrides`); !reflect.DeepEqual(before, after) {
		t.Errorf("overrides changed: %v -> %v", before, after)
	}
	if n := count(t, d, `SELECT count(*) FROM meal_slot_dates`); n != 0 {
		t.Errorf("meal_slot_dates starts with %d rows, want none", n)
	}
}

// Review round 3: the standard migration tests (as for 1400 in courses_migration_test.go).

func TestMigration1500FreshDatabaseHasTheSameSchemaAsTheUpgradedOne(t *testing.T) {
	upgraded := migrate1500(t)
	fresh, _ := openTemp(t)
	if err := db.MigrateEmbedded(context.Background(), fresh); err != nil {
		t.Fatal(err)
	}
	q := `SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name`
	if got, want := rows(t, fresh, q), rows(t, upgraded, q); !equalRows(got, want) {
		t.Errorf("the fresh schema differs from the upgraded one:\nfresh    %v\nupgraded %v", got, want)
	}
	if n := count(t, fresh, `SELECT count(*) FROM meal_slot_dates`); n != 0 {
		t.Errorf("fresh meal_slot_dates has %d rows", n)
	}
}

func TestMigration1500IsIdempotent(t *testing.T) {
	d := migrate1500(t)
	mustExec(t, d, `INSERT INTO attendance_overrides(slot_id,date) VALUES (1,'2026-11-09')`)
	mustExec(t, d, `INSERT INTO meal_slot_dates(slot_id,date,not_served,time,guests,updated_at) VALUES (1,'2026-11-09',1,'20:00',2,?)`, mts)
	dates := rows(t, d, `SELECT * FROM meal_slot_dates`)
	overrides := rows(t, d, `SELECT * FROM attendance_overrides`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	if got := rows(t, d, `SELECT * FROM meal_slot_dates`); !equalRows(got, dates) {
		t.Errorf("a second migrate changed meal_slot_dates: %v, want %v", got, dates)
	}
	if got := rows(t, d, `SELECT * FROM attendance_overrides`); !equalRows(got, overrides) {
		t.Errorf("a second migrate changed attendance_overrides: %v, want %v", got, overrides)
	}
	if n := count(t, d, `SELECT count(*) FROM schema_migrations WHERE name LIKE '1500\_%' ESCAPE '\'`); n != 1 {
		t.Errorf("1500 recorded %d times, want once", n)
	}
}

func TestMigration1500LeavesNoForeignKeyViolationInASeededDatabase(t *testing.T) {
	d := tagsOpenAt(t, "1500_")
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (1,1,'Dinner','19:00')`)
	mustExec(t, d, `INSERT INTO attendance_overrides(slot_id,date) VALUES (1,'2026-11-09')`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1500: %v", err)
	}
	if got := rows(t, d, `PRAGMA foreign_key_check`); len(got) != 0 {
		t.Errorf("foreign_key_check reports %v", got)
	}
	if count(t, d, `PRAGMA foreign_keys`) != 1 {
		t.Error("foreign_keys must be ON")
	}
}
