package db_test

import (
	"context"
	"database/sql"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// Migration 1510 (docs/adr/0012-leftovers-stay-leftovers.md; team B5-LO): Leftovers by hand. A Storage Place and a frozen
// date on a Leftover, a Frozen Use-by on a Recipe and on the Household, and the leftover_events history.

func migrate1510(t *testing.T) *sql.DB {
	t.Helper()
	d := tagsOpenAt(t, "1510_") // everything before 1510
	mustExec(t, d, `INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (7,'Chilli',4,?,?)`, mts, mts)
	mustExec(t, d, `INSERT INTO storage_places(id,name,name_key,kind,is_default,created_at) VALUES (1,'Garage Freezer','garage freezer','freezer',0,?)`, mts)
	mustExec(t, d, `INSERT INTO leftovers(id,recipe_id,from_date,from_meal_slot_id,from_course_id,portions,cooked_on,use_by,status,created_at)
		VALUES (1,7,'2026-11-01',1,(SELECT id FROM courses WHERE is_main = 1),3,'2026-11-01','2026-11-04','available',?)`, mts)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1510: %v", err)
	}
	return d
}

func TestMigration1510AddsTheLeftoverColumnsAndKeepsTheRows(t *testing.T) {
	d := migrate1510(t)
	got := rows(t, d, `SELECT name, type, "notnull" FROM pragma_table_info('leftovers') WHERE name IN ('storage_place_id','frozen_on') ORDER BY cid`)
	want := []string{"storage_place_id|INTEGER|0", "frozen_on|TEXT|0"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("columns = %v, want %v", got, want)
	}
	if got := rows(t, d, `SELECT id, portions, use_by, storage_place_id IS NULL, frozen_on IS NULL FROM leftovers`); !reflect.DeepEqual(got, []string{"1|3|2026-11-04|1|1"}) {
		t.Errorf("the existing Leftover = %v, want it unchanged, not in a place and not frozen", got)
	}
	if n := count(t, d, `SELECT count(*) FROM schema_migrations WHERE name LIKE '1510\_%' ESCAPE '\'`); n != 1 {
		t.Errorf("1510 recorded %d times, want once", n)
	}
}

func TestMigration1510DeletingAStoragePlaceKeepsTheFrozenLeftover(t *testing.T) {
	d := migrate1510(t)
	mustExec(t, d, `UPDATE leftovers SET storage_place_id = 1, frozen_on = '2026-11-02' WHERE id = 1`)
	mustExec(t, d, `DELETE FROM storage_places WHERE id = 1`)
	got := rows(t, d, `SELECT storage_place_id IS NULL, frozen_on FROM leftovers WHERE id = 1`)
	if !reflect.DeepEqual(got, []string{"1|2026-11-02"}) {
		t.Errorf("after the Freezer is deleted: %v, want no place and still frozen on 2026-11-02 (it shows under Not sorted)", got)
	}
}

func TestMigration1510FrozenUseByOnTheRecipeAndTheHousehold(t *testing.T) {
	d := migrate1510(t)
	if got := rows(t, d, `SELECT frozen_use_by_days FROM household_settings`); !reflect.DeepEqual(got, []string{"90"}) {
		t.Errorf("household default = %v, want 90", got)
	}
	if got := rows(t, d, `SELECT frozen_use_by_days IS NULL FROM recipes WHERE id = 7`); !reflect.DeepEqual(got, []string{"1"}) {
		t.Errorf("a Recipe starts with the Household's (NULL), got %v", got)
	}
	for _, days := range []int{1, 365} {
		if _, err := d.Exec(`UPDATE recipes SET frozen_use_by_days = ? WHERE id = 7`, days); err != nil {
			t.Errorf("Recipe Frozen Use-by %d refused: %v", days, err)
		}
		if _, err := d.Exec(`UPDATE household_settings SET frozen_use_by_days = ?`, days); err != nil {
			t.Errorf("Household Frozen Use-by %d refused: %v", days, err)
		}
	}
	for _, days := range []int{0, 366, -1} {
		if _, err := d.Exec(`UPDATE recipes SET frozen_use_by_days = ? WHERE id = 7`, days); err == nil {
			t.Errorf("Recipe Frozen Use-by %d must be refused", days)
		}
		if _, err := d.Exec(`UPDATE household_settings SET frozen_use_by_days = ?`, days); err == nil {
			t.Errorf("Household Frozen Use-by %d must be refused", days)
		}
	}
	if _, err := d.Exec(`UPDATE household_settings SET frozen_use_by_days = NULL`); err == nil {
		t.Error("the Household's Frozen Use-by is never NULL")
	}
}

func TestMigration1510CreatesTheLeftoverEvents(t *testing.T) {
	d := migrate1510(t)
	got := rows(t, d, `SELECT name, type, "notnull", pk FROM pragma_table_info('leftover_events') ORDER BY cid`)
	want := []string{"id|INTEGER|0|1", "leftover_id|INTEGER|1|0", "recipe_id|INTEGER|1|0", "kind|TEXT|1|0", "portions|REAL|1|0",
		"on_date|TEXT|1|0", "storage_place_id|INTEGER|0|0", "user_id|INTEGER|0|0", "created_at|TEXT|1|0"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("columns =\n%v\nwant\n%v", got, want)
	}
	ins := func(kind string, portions float64) error {
		_, err := d.Exec(`INSERT INTO leftover_events(leftover_id,recipe_id,kind,portions,on_date,created_at) VALUES (1,7,?,?,'2026-11-09',?)`, kind, portions, mts)
		return err
	}
	for _, k := range []string{"had_it", "threw_out", "froze", "took_out", "wasnt_there"} {
		if err := ins(k, 1); err != nil {
			t.Errorf("kind %q refused: %v", k, err)
		}
	}
	if err := ins("binned", 1); err == nil {
		t.Error("an unknown kind must be refused")
	}
	if err := ins("had_it", -1); err == nil {
		t.Error("negative portions must be refused")
	}
	// No foreign key: Wasn't there deletes the Leftover and its history stays.
	mustExec(t, d, `DELETE FROM leftovers WHERE id = 1`)
	if n := count(t, d, `SELECT count(*) FROM leftover_events WHERE leftover_id = 1`); n != 5 {
		t.Errorf("%d events left after the Leftover was deleted, want the 5 written", n)
	}
}
