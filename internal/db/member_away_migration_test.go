package db_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// 1577 (beta.9 Away, B9-24, PC-08): additive. member_away holds one Away per row (member_id, from_date, from_slot_id,
// through_date, through_slot_id; through_date NULL is "No last day yet"; a slot id NULL is the whole day), and the
// Attendance override's attendees gain despite_away (0 for every row that is there already: "Eats here anyway").
func TestMigration1577AddsMemberAwayAndKeepsTheExistingAttendanceOverrides(t *testing.T) {
	d := tagsOpenAt(t, "1577_")
	mustExec(t, d, `INSERT INTO members (id, name, colour, portion_factor, created_at) VALUES (1, 'Anna', '#3366cc', 1, '2026-11-01T00:00:00Z')`)
	mustExec(t, d, `INSERT INTO meal_slots (id, weekday, name, time) VALUES (4, 1, 'Dinner', '19:00')`)
	mustExec(t, d, `INSERT INTO attendance_overrides (slot_id, date) VALUES (4, '2026-11-09')`)
	mustExec(t, d, `INSERT INTO attendance_override_attendees (slot_id, date, member_id) VALUES (4, '2026-11-09', 1)`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1577: %v", err)
	}
	if n := count(t, d, `SELECT count(*) FROM attendance_override_attendees WHERE member_id = 1 AND despite_away = 0`); n != 1 {
		t.Errorf("the existing override attendee has despite_away 0: %d rows, want 1", n)
	}
	mustExec(t, d, `INSERT INTO member_away (member_id, from_date, through_date) VALUES (1, '2026-11-17', NULL)`)
	if n := count(t, d, `SELECT count(*) FROM member_away WHERE member_id = 1 AND through_date IS NULL AND from_slot_id IS NULL AND through_slot_id IS NULL`); n != 1 {
		t.Errorf("an Away with no last day and whole days does not store: %d rows, want 1", n)
	}
}

func TestMigration1577IsInThePre1570Snapshot(t *testing.T) {
	var found bool
	for _, p := range db.Pre1570Prefixes {
		found = found || p == "1577_"
	}
	if !found {
		t.Fatalf("Pre1570Prefixes = %v, want 1577_ in it", db.Pre1570Prefixes)
	}
}
