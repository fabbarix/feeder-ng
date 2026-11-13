package db_test

import (
	"context"
	"database/sql"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// Migration 1520 (docs/adr/0013-bought-planned-meals-held.md, docs/dev/design/b5-bo.md; team B5-BO):
// planned_meal_bought, what a purchase from the Shopping List was bought for. Rows go with the Planned Meal; the Lot
// has no foreign key (it may be used up while the record stays).

// seedBought has two Planned Meals (ids 40 and 41), two Ingredients (7, 8) and returns the database before 1520.
func seedPre1520(t *testing.T) *sql.DB {
	t.Helper()
	d := tagsOpenAt(t, "1520_")
	mustExec(t, d, `INSERT INTO ingredients(id,name,name_key,base_unit,created_at,updated_at) VALUES
		(7,'chicken thighs','chicken thighs','g',?,?),(8,'cream','cream','ml',?,?)`, mts, mts, mts, mts)
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (1,1,'Dinner','19:00')`)
	mustExec(t, d, `INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (5,'Roast chicken',4,?,?)`, mts, mts)
	var course int
	if err := d.QueryRow(`SELECT id FROM courses WHERE is_main = 1`).Scan(&course); err != nil {
		t.Fatal(err)
	}
	for _, id := range []int{40, 41} {
		mustExec(t, d, `INSERT INTO planned_meals(id,date,meal_slot_id,course_id,recipe_id,batches,portions,state,created_at,updated_at)
			VALUES (?,?,1,?,5,1,2,'planned',?,?)`, id, map[int]string{40: "2026-11-09", 41: "2026-11-16"}[id], course, mts, mts)
	}
	return d
}

func migrate1520(t *testing.T) *sql.DB {
	t.Helper()
	d := seedPre1520(t)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1520: %v", err)
	}
	return d
}

func TestMigration1520CreatesTheBoughtTable(t *testing.T) {
	d := migrate1520(t)
	got := rows(t, d, `SELECT name, type, "notnull", pk FROM pragma_table_info('planned_meal_bought') ORDER BY cid`)
	want := []string{"planned_meal_id|INTEGER|1|1", "ingredient_id|INTEGER|1|2", "lot_id|INTEGER|1|3", "quantity|REAL|1|0", "bought_at|TEXT|1|0"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("columns =\n%v\nwant\n%v", got, want)
	}
	if n := count(t, d, `SELECT count(*) FROM schema_migrations WHERE name LIKE '1520\_%' ESCAPE '\'`); n != 1 {
		t.Errorf("1520 recorded %d times, want once", n)
	}
	if n := count(t, d, `SELECT count(*) FROM planned_meal_bought`); n != 0 {
		t.Errorf("planned_meal_bought starts with %d rows, want none: purchases before the upgrade have no record (no backfill)", n)
	}
}

func TestMigration1520KeysARecordByMealIngredientAndLotAndGuardsTheColumns(t *testing.T) {
	d := migrate1520(t)
	ins := func(meal, ing, lot int, qty float64) error {
		_, err := d.Exec(`INSERT INTO planned_meal_bought(planned_meal_id,ingredient_id,lot_id,quantity,bought_at) VALUES (?,?,?,?,?)`,
			meal, ing, lot, qty, mts)
		return err
	}
	if err := ins(40, 7, 900, 400); err != nil {
		t.Fatal(err)
	}
	if err := ins(40, 7, 901, 100); err != nil {
		t.Errorf("a second Lot of the same Ingredient for the same Planned Meal: %v", err)
	}
	if err := ins(40, 8, 900, 200); err != nil {
		t.Errorf("a second Ingredient from the same Lot id: %v", err)
	}
	if err := ins(41, 7, 900, 100); err != nil {
		t.Errorf("the same Lot for another Planned Meal: %v", err)
	}
	if err := ins(40, 7, 900, 5); err == nil {
		t.Error("the same Planned Meal, Ingredient and Lot twice must be refused")
	}
	if err := ins(40, 7, 902, 0); err == nil {
		t.Error("a quantity of 0 must be refused")
	}
	if err := ins(40, 7, 902, -1); err == nil {
		t.Error("a negative quantity must be refused")
	}
	if err := ins(999, 7, 902, 1); err == nil {
		t.Error("an unknown Planned Meal must be refused (foreign key)")
	}
	if err := ins(40, 999, 902, 1); err == nil {
		t.Error("an unknown Ingredient must be refused (foreign key)")
	}
}

func TestMigration1520TheLotHasNoForeignKeyAndTheRecordSurvivesAMissingLot(t *testing.T) {
	d := migrate1520(t)
	// No such Stock Lot exists: a Lot used up by a Cooked meal is deleted, and the record stays.
	mustExec(t, d, `INSERT INTO planned_meal_bought(planned_meal_id,ingredient_id,lot_id,quantity,bought_at) VALUES (40,7,31337,400,?)`, mts)
	if n := count(t, d, `SELECT count(*) FROM planned_meal_bought`); n != 1 {
		t.Errorf("%d records, want 1", n)
	}
	if fk := rows(t, d, `SELECT "table" FROM pragma_foreign_key_list('planned_meal_bought') ORDER BY "table"`); !reflect.DeepEqual(fk, []string{"ingredients", "planned_meals"}) {
		t.Errorf("foreign keys = %v, want planned_meals and ingredients only (no stock_lots)", fk)
	}
}

func TestMigration1520RecordsGoWithTheirPlannedMeal(t *testing.T) {
	d := migrate1520(t)
	mustExec(t, d, `INSERT INTO planned_meal_bought(planned_meal_id,ingredient_id,lot_id,quantity,bought_at) VALUES (40,7,900,400,?),(40,8,900,200,?),(41,7,900,100,?)`, mts, mts, mts)
	mustExec(t, d, `DELETE FROM planned_meals WHERE id = 40`)
	if n := count(t, d, `SELECT count(*) FROM planned_meal_bought WHERE planned_meal_id = 40`); n != 0 {
		t.Errorf("%d records survive their Planned Meal, want none (ON DELETE CASCADE)", n)
	}
	if n := count(t, d, `SELECT count(*) FROM planned_meal_bought WHERE planned_meal_id = 41`); n != 1 {
		t.Errorf("the other Planned Meal has %d records, want 1", n)
	}
	// An Ingredient with a record cannot be deleted by accident: the merge mover re-points it first.
	if _, err := d.Exec(`DELETE FROM ingredients WHERE id = 7`); err == nil {
		t.Error("deleting an Ingredient with a record must be refused (foreign key); the merge mover moves it first")
	}
}

func TestMigration1520KeepsEveryPlannedMealAndTheirIds(t *testing.T) {
	d := seedPre1520(t)
	before := rows(t, d, `SELECT id, date, recipe_id, state FROM planned_meals ORDER BY id`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1520: %v", err)
	}
	if after := rows(t, d, `SELECT id, date, recipe_id, state FROM planned_meals ORDER BY id`); !reflect.DeepEqual(before, after) {
		t.Errorf("planned_meals changed: %v -> %v", before, after)
	}
}

func TestMigration1520AddsTheLastCookedIndex(t *testing.T) {
	d := migrate1520(t)
	got := rows(t, d, `SELECT name FROM pragma_index_list('planned_meals') WHERE name = 'planned_meals_recipe_cooked'`)
	if len(got) != 1 {
		t.Errorf("indexes = %v, want planned_meals_recipe_cooked (for the Recipes list's Last cooked, plan 2.7)", got)
	}
	if cols := rows(t, d, `SELECT name FROM pragma_index_info('planned_meals_recipe_cooked') ORDER BY seqno`); !reflect.DeepEqual(cols, []string{"recipe_id", "date"}) {
		t.Errorf("index columns = %v, want recipe_id, date", cols)
	}
}
