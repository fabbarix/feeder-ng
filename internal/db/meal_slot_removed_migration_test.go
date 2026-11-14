package db_test

import (
	"context"
	"database/sql"
	"reflect"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// Migrations 1570 and 1571 (B9-04, ADR 0021, docs/design/ui-remediation-plan-3.md section 7). 1570 rebuilds meal_slots
// with removed_at and swaps UNIQUE (weekday, name) for a partial unique index over the active slots, and adds
// meal_slot_removals. 1571 adds member_removals. 1570 is a parent-table rebuild with foreign_keys=OFF (like 1100 and 1400):
// every child row must survive it, ids and AUTOINCREMENT counters stay, and foreign_key_check is empty.

// slotChildren are the tables that reference meal_slots, with the column that does.
var slotChildren = []struct{ table, col string }{
	{"meal_slot_attendees", "slot_id"},
	{"attendance_overrides", "slot_id"},
	{"planned_meals", "meal_slot_id"},
	{"slot_rules", "meal_slot_id"},
	{"plan_unfilled", "meal_slot_id"},
	{"meal_slot_courses", "meal_slot_id"},
	{"meal_slot_course_opt_outs", "meal_slot_id"},
	{"course_attendance_overrides", "slot_id"},
	{"meal_slot_dates", "slot_id"},
}

// beta8WithSlots is a beta.8 database with Meal Slots 3 (Dinner on Monday) and 4 (Dinner on Tuesday), a history of
// ids (slot 9 was added and deleted), and a row in every table that references meal_slots.
func beta8WithSlots(t *testing.T) *sql.DB {
	t.Helper()
	d := tagsOpenAt(t, "1570_")
	const ts = "2026-11-01T00:00:00Z"
	main := mainCourse(t, d)
	mustExec(t, d, `INSERT INTO members(id,name,colour,portion_factor,created_at) VALUES (5,'Anna','#336699',1,?)`, ts)
	mustExec(t, d, `INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (7,'Pasta',2,?,?)`, ts, ts)
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (9,3,'Temp','10:00')`)
	mustExec(t, d, `DELETE FROM meal_slots WHERE id = 9`) // the AUTOINCREMENT counter is now 9
	for _, s := range []struct {
		id      int64
		weekday int
	}{{3, 1}, {4, 2}} {
		mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (?,?,'Dinner','19:00')`, s.id, s.weekday)
		mustExec(t, d, `INSERT INTO meal_slot_attendees(slot_id,member_id,portion_factor_override) VALUES (?,5,1.5)`, s.id)
		mustExec(t, d, `INSERT INTO attendance_overrides(slot_id,date) VALUES (?,'2026-11-16')`, s.id)
		mustExec(t, d, `INSERT INTO attendance_override_attendees(slot_id,date,member_id) VALUES (?,'2026-11-16',5)`, s.id)
		mustExec(t, d, `INSERT INTO meal_slot_courses(meal_slot_id,course_id,position,optional) VALUES (?,?,0,0)`, s.id, main)
		mustExec(t, d, `INSERT INTO meal_slot_course_opt_outs(meal_slot_id,course_id,member_id) VALUES (?,?,5)`, s.id, main)
		mustExec(t, d, `INSERT INTO course_attendance_overrides(slot_id,date,course_id) VALUES (?,'2026-11-16',?)`, s.id, main)
		mustExec(t, d, `INSERT INTO meal_slot_dates(slot_id,date,guests,updated_at) VALUES (?,'2026-11-16',2,?)`, s.id, ts)
		mustExec(t, d, `INSERT INTO slot_rules(meal_slot_id,course_id,recipe_id) VALUES (?,?,7)`, s.id, main)
		mustExec(t, d, `INSERT INTO plan_unfilled(date,meal_slot_id,course_id,reason) VALUES ('2026-11-17',?,?,'no_candidates')`, s.id, main)
		mustExec(t, d, `INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,state,created_at,updated_at)
			VALUES ('2026-11-02',?,?,7,1,2,'cooked',?,?)`, s.id, main, ts, ts)
	}
	return d
}

func childCounts(t *testing.T, d *sql.DB) map[string]int {
	t.Helper()
	out := map[string]int{}
	for _, c := range slotChildren {
		out[c.table] = count(t, d, `SELECT count(*) FROM `+c.table)
	}
	out["attendance_override_attendees"] = count(t, d, `SELECT count(*) FROM attendance_override_attendees`)
	return out
}

func TestMigration1570CopiesEveryMealSlotAndKeepsEveryChildRow(t *testing.T) {
	d := beta8WithSlots(t)
	slotsBefore := rows(t, d, `SELECT id, weekday, name, time FROM meal_slots ORDER BY id`)
	childrenBefore := childCounts(t, d)
	if len(slotsBefore) != 2 {
		t.Fatalf("setup: %v", slotsBefore)
	}
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if got := rows(t, d, `SELECT id, weekday, name, time FROM meal_slots ORDER BY id`); !reflect.DeepEqual(got, slotsBefore) {
		t.Errorf("Meal Slots = %v, want the same rows and ids %v", got, slotsBefore)
	}
	if n := count(t, d, `SELECT count(*) FROM meal_slots WHERE removed_at IS NOT NULL`); n != 0 {
		t.Errorf("%d Meal Slots are removed after the migration, want none", n)
	}
	if got := childCounts(t, d); !reflect.DeepEqual(got, childrenBefore) {
		t.Errorf("child rows = %v, want %v (the rebuild must not cascade)", got, childrenBefore)
	}
	if bad := rows(t, d, `PRAGMA foreign_key_check`); len(bad) != 0 {
		t.Errorf("foreign_key_check = %v, want empty", bad)
	}
	if n := count(t, d, `PRAGMA foreign_keys`); n != 1 {
		t.Errorf("foreign_keys = %d after the migration, want 1 (ON)", n)
	}
	for _, name := range []string{"1570_", "1571_"} {
		if n := count(t, d, `SELECT count(*) FROM schema_migrations WHERE name LIKE ? ESCAPE '\'`, name+"%"); n != 1 {
			t.Errorf("%s recorded %d times, want once", name, n)
		}
	}
}

func TestMigration1570HasTheRemovedAtColumnAndNoDanglingReferences(t *testing.T) {
	d := beta8WithSlots(t)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	cols := rows(t, d, `SELECT name || '|' || type || '|' || "notnull" FROM pragma_table_info('meal_slots') ORDER BY cid`)
	want := []string{"id|INTEGER|0", "weekday|INTEGER|1", "name|TEXT|1", "time|TEXT|1", "removed_at|TEXT|0"}
	if !reflect.DeepEqual(cols, want) {
		t.Errorf("meal_slots columns = %v, want %v", cols, want)
	}
	for _, c := range slotChildren {
		for _, sqlText := range rows(t, d, `SELECT sql FROM sqlite_master WHERE name = ?`, c.table) {
			if strings.Contains(sqlText, "meal_slots_new") || strings.Contains(sqlText, "_old") {
				t.Errorf("%s references a temporary table name: %s", c.table, sqlText)
			}
			if !strings.Contains(sqlText, "meal_slots") {
				t.Errorf("%s no longer references meal_slots: %s", c.table, sqlText)
			}
		}
	}
	if n := count(t, d, `SELECT count(*) FROM sqlite_master WHERE sql LIKE '%meal_slots_new%'`); n != 0 {
		t.Errorf("%d schema objects still mention meal_slots_new", n)
	}
	// The children still cascade with a live Meal Slot (the foreign keys are real again).
	mustExec(t, d, `DELETE FROM meal_slots WHERE id = 4`)
	for _, c := range slotChildren {
		if n := count(t, d, `SELECT count(*) FROM `+c.table+` WHERE `+c.col+` = 4`); n != 0 {
			t.Errorf("%s keeps %d rows of a deleted Meal Slot", c.table, n)
		}
	}
}

func TestMigration1570KeepsTheAutoincrementCounter(t *testing.T) {
	d := beta8WithSlots(t)
	before, ok := seqOf(t, d, "meal_slots")
	if !ok || before != 9 {
		t.Fatalf("setup: seq = %d, %v; want 9", before, ok)
	}
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	if after, ok := seqOf(t, d, "meal_slots"); !ok || after != before {
		t.Errorf("seq = %d, %v after the rebuild, want %d: a deleted id must never be handed out again", after, ok, before)
	}
	res, err := d.Exec(`INSERT INTO meal_slots(weekday,name,time) VALUES (5,'Lunch','12:30')`)
	if err != nil {
		t.Fatal(err)
	}
	if id, _ := res.LastInsertId(); id != 10 {
		t.Errorf("the next Meal Slot id = %d, want 10", id)
	}
}

func TestMigration1570TheNameIsUniqueAmongActiveSlotsOnly(t *testing.T) {
	d := beta8WithSlots(t)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`INSERT INTO meal_slots(weekday,name,time) VALUES (1,'dinner','20:00')`); err == nil {
		t.Error("a second active Dinner on Monday (any case) must be refused")
	}
	if n := count(t, d, `SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = 'meal_slots_active_name'`); n != 1 {
		t.Fatalf("index meal_slots_active_name missing")
	}
	var def string
	if err := d.QueryRow(`SELECT sql FROM sqlite_master WHERE name = 'meal_slots_active_name'`).Scan(&def); err != nil || !strings.Contains(strings.ToUpper(def), "WHERE REMOVED_AT IS NULL") {
		t.Errorf("meal_slots_active_name = %q, %v; want a partial index WHERE removed_at IS NULL", def, err)
	}
	mustExec(t, d, `UPDATE meal_slots SET removed_at = '2026-11-09T12:00:00Z' WHERE id = 3`)
	mustExec(t, d, `INSERT INTO meal_slots(weekday,name,time) VALUES (1,'Dinner','20:00')`)                                   // the name is free again
	mustExec(t, d, `INSERT INTO meal_slots(weekday,name,time,removed_at) VALUES (1,'Dinner','21:00','2026-11-09T12:05:00Z')`) // two removed ones may share it
	if n := count(t, d, `SELECT count(*) FROM meal_slots WHERE weekday = 1 AND name = 'Dinner'`); n != 3 {
		t.Errorf("%d Dinners on Monday, want the removed one, the new one and a second removed one", n)
	}
	// Putting the removed one back while the new one is active is the clash Restore refuses (409).
	if _, err := d.Exec(`UPDATE meal_slots SET removed_at = NULL WHERE id = 3`); err == nil {
		t.Error("clearing removed_at over an active slot with the same weekday and name must violate the index")
	}
}

func TestMigration1570CreatesTheRemovalsTable(t *testing.T) {
	d := beta8WithSlots(t)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	cols := rows(t, d, `SELECT name FROM pragma_table_info('meal_slot_removals')`)
	if !contains(cols, "meal_slot_id") {
		t.Errorf("meal_slot_removals columns = %v, want one named meal_slot_id (what Undo needs to restore the To confirm rows)", cols)
	}
}

func TestMigration1571CreatesTheMemberRemovalsTable(t *testing.T) {
	d := beta8WithSlots(t)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	cols := rows(t, d, `SELECT name FROM pragma_table_info('member_removals')`)
	if !contains(cols, "member_id") {
		t.Errorf("member_removals columns = %v, want one named member_id (the id Undo restores)", cols)
	}
	// Additive: the Members table is untouched.
	if n := count(t, d, `SELECT count(*) FROM members`); n != 1 {
		t.Errorf("members = %d rows, want 1", n)
	}
}

func contains(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}
