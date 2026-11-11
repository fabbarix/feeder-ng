package db_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// R13: migration 1230 gives every Meal Slot that has no attendees all current Members, once, for
// an existing Household (Attendance now defaults to everyone). Slots that already have attendees,
// their overrides and per-date Attendance are left alone.

func TestAttendanceDefaultMigrationGivesEmptySlotsEveryMember(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.Migrate(ctx, d, upTo(t, "1230_")); err != nil {
		t.Fatal(err)
	}
	const ts = "2026-10-01T00:00:00Z"
	mustExec(t, d, `INSERT INTO members(id,name,colour,portion_factor,created_at) VALUES (3,'Anna','#fff',1,?),(5,'Sam','#fff',0.5,?),(9,'Marco','#fff',1,?)`, ts, ts, ts)
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (11,2,'Dinner','19:30'),(12,3,'Dinner','19:30'),(13,6,'Breakfast','09:00')`)
	// Slot 12 already has a deliberate list (Anna alone, at an override); slot 11 and 13 are empty.
	mustExec(t, d, `INSERT INTO meal_slot_attendees(slot_id,member_id,portion_factor_override) VALUES (12,3,1.5)`)
	// A per-date override on the empty slot 11 stays exactly as it is.
	mustExec(t, d, `INSERT INTO attendance_overrides(slot_id,date) VALUES (11,'2026-11-10')`)

	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	for _, slot := range []int{11, 13} {
		if n := count(t, d, `SELECT count(*) FROM meal_slot_attendees WHERE slot_id = ?`, slot); n != 3 {
			t.Errorf("slot %d has %d attendees, want all 3 Members", slot, n)
		}
		if n := count(t, d, `SELECT count(*) FROM meal_slot_attendees WHERE slot_id = ? AND portion_factor_override IS NOT NULL`, slot); n != 0 {
			t.Errorf("slot %d: %d attendees got a Portion Factor override, want none", slot, n)
		}
	}
	if n := count(t, d, `SELECT count(*) FROM meal_slot_attendees WHERE slot_id = 12`); n != 1 {
		t.Errorf("slot 12 had a list and must keep it: %d attendees, want 1", n)
	}
	if n := count(t, d, `SELECT count(*) FROM meal_slot_attendees WHERE slot_id = 12 AND member_id = 3 AND portion_factor_override = 1.5`); n != 1 {
		t.Errorf("slot 12 lost its override")
	}
	if n := count(t, d, `SELECT count(*) FROM attendance_overrides WHERE slot_id = 11`); n != 1 {
		t.Errorf("the per-date override on slot 11 was removed")
	}
	if n := count(t, d, `SELECT count(*) FROM attendance_override_attendees`); n != 0 {
		t.Errorf("per-date Attendance changed: %d rows, want 0 (an override stays empty)", n)
	}
}

func TestAttendanceDefaultMigrationLeavesAHouseholdWithoutMembersAlone(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.Migrate(ctx, d, upTo(t, "1230_")); err != nil {
		t.Fatal(err)
	}
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (11,2,'Dinner','19:30')`)
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n := count(t, d, `SELECT count(*) FROM meal_slot_attendees`); n != 0 {
		t.Errorf("%d attendees invented for a Household without Members", n)
	}
}

// Fresh install: nothing to backfill, and the migration is recorded so it never runs twice.
func TestAttendanceDefaultMigrationRunsOnceAndIsRecorded(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	if n := count(t, d, `SELECT count(*) FROM schema_migrations WHERE name = '1230_attendance_default.sql'`); n != 1 {
		t.Fatalf("migration 1230_attendance_default.sql recorded %d times, want 1", n)
	}
	// A Household that later empties a slot on purpose keeps it empty: a second run does nothing.
	mustExec(t, d, `INSERT INTO members(id,name,colour,portion_factor,created_at) VALUES (3,'Anna','#fff',1,'2026-10-01T00:00:00Z')`)
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (11,2,'Dinner','19:30')`)
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	if n := count(t, d, `SELECT count(*) FROM meal_slot_attendees`); n != 0 {
		t.Errorf("a second migrate run backfilled %d attendees", n)
	}
}
