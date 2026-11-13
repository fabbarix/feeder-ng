package db_test

import (
	"context"
	"database/sql"
	"reflect"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// Migration 1540 (docs/adr/0015-base-recipes.md, docs/dev/design/base-recipes.md §12; team BR-B): additive columns
// for Base recipes, on a database shaped like beta.5's (migrations up to 1530, with Recipes, lines, Planned Meals,
// Stock and a taken-name Ingredient already in it). Red until 1540_base_recipes.sql exists.

// seedPre1540 is a beta.5 database: a Recipe with two lines (one on an Ingredient called "béchamel"), a Ready Meal,
// a Planned Meal, a Stock Lot, and a Member's Exclusion.
func seedPre1540(t *testing.T) *sql.DB {
	t.Helper()
	d := tagsOpenAt(t, "1540_")
	mustExec(t, d, `INSERT INTO ingredients(id,name,name_key,base_unit,created_at,updated_at) VALUES
		(7,'béchamel','béchamel','ml',?,?),(8,'pasta','pasta','g',?,?),(9,'Lasagne pack','lasagne pack','piece',?,?)`,
		mts, mts, mts, mts, mts, mts)
	mustExec(t, d, `INSERT INTO recipes(id,name,yield,ready_meal,created_at,updated_at) VALUES (5,'Lasagne',4,0,?,?),(6,'Lasagne pack',2,1,?,?)`,
		mts, mts, mts, mts)
	mustExec(t, d, `INSERT INTO recipe_lines(id,recipe_id,position,ingredient_id,quantity,unit) VALUES
		(50,5,0,8,300,'g'),(51,5,1,7,500,'ml'),(52,6,0,9,1,'piece')`)
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (1,1,'Dinner','19:00')`)
	var course int
	if err := d.QueryRow(`SELECT id FROM courses WHERE is_main = 1`).Scan(&course); err != nil {
		t.Fatal(err)
	}
	mustExec(t, d, `INSERT INTO planned_meals(id,date,meal_slot_id,course_id,recipe_id,batches,portions,state,created_at,updated_at)
		VALUES (40,'2026-11-09',1,?,5,1,2,'planned',?,?)`, course, mts, mts)
	mustExec(t, d, `INSERT INTO stock_lots(id,ingredient_id,quantity,purchased,source,created_at) VALUES (900,7,300,'2026-11-01','manual',?)`, mts)
	return d
}

func migrate1540(t *testing.T) *sql.DB {
	t.Helper()
	d := seedPre1540(t)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1540: %v", err)
	}
	return d
}

func TestMigration1540AddsTheBaseRecipeColumns(t *testing.T) {
	d := migrate1540(t)
	cols := func(table string) []string {
		return rows(t, d, `SELECT name, type, "notnull", dflt_value IS NULL FROM pragma_table_info('`+table+`') WHERE name IN
			('base_ingredient_id','yield_unit','needed_at_step','linked_from_ingredient_id') ORDER BY name`)
	}
	if got, want := cols("recipes"), []string{"base_ingredient_id|INTEGER|0|1", "yield_unit|TEXT|0|1"}; !reflect.DeepEqual(got, want) {
		t.Errorf("recipes columns = %v, want %v (nullable, no default: NULL = plannable / portions)", got, want)
	}
	if got, want := cols("recipe_lines"), []string{"linked_from_ingredient_id|INTEGER|0|1", "needed_at_step|INTEGER|0|1"}; !reflect.DeepEqual(got, want) {
		t.Errorf("recipe_lines columns = %v, want %v", got, want)
	}
	if n := count(t, d, `SELECT count(*) FROM schema_migrations WHERE name LIKE '1540\_%' ESCAPE '\'`); n != 1 {
		t.Errorf("1540 recorded %d times, want once", n)
	}
}

func TestMigration1540LeavesEveryExistingRecipeAndLinePlannableAndUntouched(t *testing.T) {
	d := migrate1540(t)
	if n := count(t, d, `SELECT count(*) FROM recipes WHERE base_ingredient_id IS NULL AND yield_unit IS NULL`); n != 2 {
		t.Errorf("%d of 2 existing Recipes are plannable after the upgrade, want both", n)
	}
	if n := count(t, d, `SELECT count(*) FROM recipe_lines WHERE needed_at_step IS NULL AND linked_from_ingredient_id IS NULL`); n != 3 {
		t.Errorf("%d of 3 existing lines have NULL Needed at and link, want all", n)
	}
	got := rows(t, d, `SELECT id, name, name_key, base_unit FROM ingredients ORDER BY id`)
	want := []string{"7|béchamel|béchamel|ml", "8|pasta|pasta|g", "9|Lasagne pack|lasagne pack|piece"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ingredients = %v, want %v: no row changes, the plain 'béchamel' keeps its name key", got, want)
	}
	if n := count(t, d, `SELECT count(*) FROM recipe_lines WHERE ingredient_id = 7 AND recipe_id = 5 AND quantity = 500`); n != 1 {
		t.Error("the Lasagne line on the plain béchamel must be unchanged")
	}
	if n := count(t, d, `SELECT count(*) FROM planned_meals`) + count(t, d, `SELECT count(*) FROM stock_lots`); n != 2 {
		t.Errorf("planned meals + stock lots = %d, want 2 untouched", n)
	}
}

func TestMigration1540HasAPartialUniqueIndexOnTheBaseIngredient(t *testing.T) {
	d := migrate1540(t)
	got := rows(t, d, `SELECT name, "unique", partial FROM pragma_index_list('recipes') WHERE name = 'recipes_base_ingredient'`)
	if want := []string{"recipes_base_ingredient|1|1"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("index = %v, want %v (unique and partial)", got, want)
	}
	mustExec(t, d, `INSERT INTO ingredients(id,name,name_key,base_unit,created_at,updated_at) VALUES (20,'Béchamel','base-recipe:10','ml',?,?)`, mts, mts)
	mustExec(t, d, `INSERT INTO recipes(id,name,yield,base_ingredient_id,yield_unit,created_at,updated_at) VALUES (10,'Béchamel',1,20,'l',?,?)`, mts, mts)
	if _, err := d.Exec(`INSERT INTO recipes(id,name,yield,base_ingredient_id,yield_unit,created_at,updated_at) VALUES (11,'Other',1,20,'l',?,?)`, mts, mts); err == nil {
		t.Error("a second Recipe on the same Base recipe Ingredient must be refused")
	}
	// Plannable Recipes (NULL) are many.
	for _, id := range []int{12, 13} {
		if _, err := d.Exec(`INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (?,?,2,?,?)`, id, "Plain", mts, mts); err != nil {
			t.Errorf("a plannable Recipe beside others: %v", err)
		}
	}
}

func TestMigration1540GuardsNeededAtStepAndRemembersTheLinkedIngredient(t *testing.T) {
	d := migrate1540(t)
	if _, err := d.Exec(`UPDATE recipe_lines SET needed_at_step = -1 WHERE id = 51`); err == nil {
		t.Error("a negative Needed at Step must be refused")
	}
	if _, err := d.Exec(`UPDATE recipe_lines SET needed_at_step = 0 WHERE id = 51`); err != nil {
		t.Errorf("Needed at Step 0: %v", err)
	}
	mustExec(t, d, `UPDATE recipe_lines SET linked_from_ingredient_id = 7 WHERE id = 51`)
	if _, err := d.Exec(`UPDATE recipe_lines SET linked_from_ingredient_id = 999 WHERE id = 51`); err == nil {
		t.Error("linked_from_ingredient_id must reference an Ingredient")
	}
}

func TestMigration1540ADeletedRememberedIngredientSetsTheLinkNullAndKeepsTheLine(t *testing.T) {
	d := migrate1540(t)
	mustExec(t, d, `INSERT INTO ingredients(id,name,name_key,base_unit,created_at,updated_at) VALUES (21,'old jar','old jar','ml',?,?)`, mts, mts)
	mustExec(t, d, `UPDATE recipe_lines SET linked_from_ingredient_id = 21 WHERE id = 51`)
	mustExec(t, d, `DELETE FROM ingredients WHERE id = 21`)
	var linked sql.NullInt64
	if err := d.QueryRow(`SELECT linked_from_ingredient_id FROM recipe_lines WHERE id = 51`).Scan(&linked); err != nil {
		t.Fatal(err)
	}
	if linked.Valid {
		t.Errorf("linked_from_ingredient_id = %v after the Ingredient was deleted, want NULL (ON DELETE SET NULL; it is no reference for the delete guard)", linked.Int64)
	}
}

func TestMigration1540IsTheOnlyNewMigrationAndAddsNoTable(t *testing.T) {
	d := migrate1540(t)
	tables := rows(t, d, `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%base%' ORDER BY name`)
	for _, name := range tables {
		if strings.Contains(name, "recipe_base") {
			t.Errorf("unexpected table %q: the design adds columns only (§12), no separate line table", name)
		}
	}
	if n := count(t, d, `SELECT count(*) FROM pragma_table_info('recipes') WHERE name IN ('base_ingredient_id','yield_unit')`); n != 2 {
		t.Errorf("recipes has %d of the 2 new columns", n)
	}
}
