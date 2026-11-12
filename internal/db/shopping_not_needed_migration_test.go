package db_test

import (
	"context"
	"database/sql"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// Migration 1530 (docs/dev/design/beta5-plan.md 2.5; team B5-SH): shopping_not_needed, the Ingredients a User took
// off the Shopping List for one range. Plain table, kept per (range_to, ingredient_id) like shopping_ticks.

func migrate1530(t *testing.T) *sql.DB {
	t.Helper()
	d := tagsOpenAt(t, "1530_") // everything before 1530
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1530: %v", err)
	}
	return d
}

func TestMigration1530CreatesTheNotNeededTable(t *testing.T) {
	d := migrate1530(t)
	got := rows(t, d, `SELECT name, type, "notnull", pk FROM pragma_table_info('shopping_not_needed') ORDER BY cid`)
	want := []string{"range_to|TEXT|1|1", "ingredient_id|INTEGER|1|2", "needed|REAL|1|0", "user_id|INTEGER|0|0", "created_at|TEXT|1|0"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("columns =\n%v\nwant\n%v", got, want)
	}
	if n := count(t, d, `SELECT count(*) FROM schema_migrations WHERE name LIKE '1530\_%' ESCAPE '\'`); n != 1 {
		t.Errorf("1530 recorded %d times, want once", n)
	}
}

func TestMigration1530KeysAMarkByRangeAndIngredientAndGuardsIt(t *testing.T) {
	d := migrate1530(t)
	mustExec(t, d, `INSERT INTO ingredients(id,name,name_key,base_unit,created_at,updated_at) VALUES (5,'passata','passata','g',?,?)`, mts, mts)
	ins := func(to string, ing int, needed float64) error {
		_, err := d.Exec(`INSERT INTO shopping_not_needed(range_to,ingredient_id,needed,user_id,created_at) VALUES (?,?,?,NULL,?)`, to, ing, needed, mts)
		return err
	}
	if err := ins("2026-11-15", 5, 700); err != nil {
		t.Fatal(err)
	}
	if err := ins("2026-11-12", 5, 700); err != nil {
		t.Fatalf("the same Ingredient in another range: %v", err)
	}
	if err := ins("2026-11-15", 5, 1); err == nil {
		t.Error("the same Ingredient twice in a range must be refused")
	}
	if err := ins("2026-11-16", 5, -1); err == nil {
		t.Error("a negative quantity must be refused")
	}
	if err := ins("2026-11-16", 999, 1); err == nil {
		t.Error("an unknown Ingredient must be refused (foreign key)")
	}
}

func TestMigration1530KeepsTicksExtrasAndEveryOtherRow(t *testing.T) {
	d := tagsOpenAt(t, "1530_")
	mustExec(t, d, `INSERT INTO ingredients(id,name,name_key,base_unit,created_at,updated_at) VALUES (5,'passata','passata','g',?,?)`, mts, mts)
	mustExec(t, d, `INSERT INTO shopping_ticks(range_to,ingredient_id,needed,by,lot_id,ticked_at) VALUES ('2026-11-15',5,700,'hand',NULL,?)`, mts)
	mustExec(t, d, `INSERT INTO shopping_extras(text,created_at) VALUES ('candles',?)`, mts)
	before := rows(t, d, `SELECT * FROM shopping_ticks`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1530: %v", err)
	}
	if after := rows(t, d, `SELECT * FROM shopping_ticks`); !reflect.DeepEqual(before, after) {
		t.Errorf("ticks changed: %v -> %v", before, after)
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_extras`); n != 1 {
		t.Errorf("extras = %d, want 1", n)
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_not_needed`); n != 0 {
		t.Errorf("shopping_not_needed starts with %d rows, want none", n)
	}
}
