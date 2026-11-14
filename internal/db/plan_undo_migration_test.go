package db_test

import (
	"context"
	"database/sql"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// Migrations 1573 (cooked_takes) and 1574 (plan_snapshots, plan_state.revision), B9-11 (SAFE-03, PC-01, SAFE-07;
// docs/design/ui-remediation-plan-3.md section 7). Both are additive. Any column the tests below do not name must be
// nullable or have a default, because the tests insert rows with only the columns they name.

func migrateAll(t *testing.T, stop string) *sql.DB {
	t.Helper()
	d := tagsOpenAt(t, stop)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("%s: %v", stop, err)
	}
	return d
}

func TestMigration1573CreatesCookedTakesWithItsLotJSONAndKeepsOnlyOneOpenRecordPerCell(t *testing.T) {
	d := migrateAll(t, "1573_")
	cols := rows(t, d, `SELECT name FROM pragma_table_info('cooked_takes')`)
	for _, want := range []string{"date", "meal_slot_id", "course_id", "kind", "marked_on", "lot_json", "reopened_at"} {
		if !contains(cols, want) {
			t.Errorf("cooked_takes columns = %v, want one named %s", cols, want)
		}
	}
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (4,1,'Dinner','19:00')`)
	course := count(t, d, `SELECT id FROM courses WHERE is_main = 1`)
	ins := `INSERT INTO cooked_takes(date,meal_slot_id,course_id,kind,marked_on,lot_json) VALUES ('2026-11-09',4,?,?,'2026-11-09','[]')`
	mustExec(t, d, ins, course, "cooked")
	if _, err := d.Exec(ins, course, "cooked"); err == nil {
		t.Error("a second open record for the same cell was accepted; a cell is Cooked once until it is reopened")
	}
	mustExec(t, d, `UPDATE cooked_takes SET reopened_at = '2026-11-09T12:00:00Z'`)
	mustExec(t, d, ins, course, "cooked") // Cooked again after it was reopened
	if _, err := d.Exec(ins, course, "unknown"); err == nil {
		t.Error("kind 'unknown' was accepted; the kinds are cooked and not_cooked")
	}
	mustExec(t, d, `DELETE FROM cooked_takes`)
	mustExec(t, d, ins, course, "not_cooked")
}

func TestMigration1574AddsPlanRevisionAndPlanSnapshots(t *testing.T) {
	d := migrateAll(t, "1574_")
	if n := count(t, d, `SELECT count(*) FROM plan_state WHERE id = 1 AND revision IS NOT NULL AND revision >= 0`); n != 1 {
		t.Errorf("plan_state revision on the existing row: %d rows, want 1 with a revision of 0 or more", n)
	}
	mustExec(t, d, `UPDATE plan_state SET revision = revision + 1 WHERE id = 1`)
	cols := rows(t, d, `SELECT name FROM pragma_table_info('plan_snapshots')`)
	for _, want := range []string{"token", "revision", "created_at", "state_json"} {
		if !contains(cols, want) {
			t.Errorf("plan_snapshots columns = %v, want one named %s", cols, want)
		}
	}
	ins := `INSERT INTO plan_snapshots(token,revision,created_at,state_json) VALUES (?,?,?,?)`
	mustExec(t, d, ins, "tok-1", 5, mts, "{}")
	if _, err := d.Exec(ins, "tok-1", 6, mts, "{}"); err == nil {
		t.Error("a second snapshot with the same token was accepted; the token is the key")
	}
}

func TestMigrations1573And1574LeaveThePlanRowsAlone(t *testing.T) {
	d := tagsOpenAt(t, "1573_")
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (4,1,'Dinner','19:00')`)
	mustExec(t, d, `INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (11,'Cod',4,?,?)`, mts, mts)
	mustExec(t, d, `INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,state,pinned,created_at,updated_at)
		VALUES ('2026-11-09',4,(SELECT id FROM courses WHERE is_main = 1),11,1,2,'cooked',1,?,?)`, mts, mts)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	if n := count(t, d, `SELECT count(*) FROM planned_meals WHERE state = 'cooked' AND pinned = 1`); n != 1 {
		t.Errorf("planned_meals after 1573 and 1574: %d cooked rows, want the 1 there was", n)
	}
	if n := count(t, d, `SELECT count(*) FROM cooked_takes`); n != 0 {
		t.Errorf("cooked_takes has %d rows after the upgrade, want none: a meal Cooked before has no record and cannot be reopened", n)
	}
	if bad := rows(t, d, `PRAGMA foreign_key_check`); len(bad) != 0 {
		t.Errorf("foreign_key_check = %v, want empty", bad)
	}
}
