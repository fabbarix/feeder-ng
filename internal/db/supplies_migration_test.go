package db_test

import (
	"context"
	"database/sql"
	"reflect"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// Migration 1550 (docs/adr/0017-supplies-are-ingredients-of-kind-supply.md, docs/dev/design/household-items.md §5.1):
// two additive columns on ingredients, on a database shaped like beta.6.5's. Red until 1550_supplies.sql exists.

const suppliesTS = "2026-11-13T12:00:00Z"

// seedPre1550 is a beta.6.5 database with food Ingredients (one with a Shelf Life, one a Base recipe's), a Product
// and a Stock Lot.
func seedPre1550(t *testing.T) *sql.DB {
	t.Helper()
	d := tagsOpenAt(t, "1550_")
	mustExec(t, d, `INSERT INTO ingredients(id,name,name_key,base_unit,shelf_life_days,created_at,updated_at) VALUES
		(7,'béchamel','béchamel','ml',5,?,?),(8,'pasta','pasta','g',NULL,?,?),(9,'Toilet paper','toilet paper','piece',NULL,?,?)`,
		suppliesTS, suppliesTS, suppliesTS, suppliesTS, suppliesTS, suppliesTS)
	mustExec(t, d, `INSERT INTO stock_lots(id,ingredient_id,quantity,purchased,goes_off,source,created_at) VALUES (900,7,300,'2026-11-01','2026-11-06','manual',?)`, suppliesTS)
	return d
}

func migrate1550(t *testing.T) *sql.DB {
	t.Helper()
	d := seedPre1550(t)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1550: %v", err)
	}
	return d
}

func TestMigration1550AddsKindAndRestockLevel(t *testing.T) {
	d := migrate1550(t)
	got := rows(t, d, `SELECT name, type, "notnull", dflt_value FROM pragma_table_info('ingredients') WHERE name IN ('kind','restock_level') ORDER BY name`)
	want := []string{"kind|TEXT|1|'food'", "restock_level|REAL|0|<nil>"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ingredients columns = %v, want %v (kind NOT NULL default 'food'; restock_level nullable, no default)", got, want)
	}
}

func TestEveryExistingIngredientIsFoodAfter1550(t *testing.T) {
	d := migrate1550(t)
	if n := count(t, d, `SELECT count(*) FROM ingredients WHERE kind <> 'food'`); n != 0 {
		t.Errorf("%d Ingredients are not food after the upgrade; every existing row must be food", n)
	}
	if n := count(t, d, `SELECT count(*) FROM ingredients WHERE kind = 'food'`); n != 3 {
		t.Errorf("food Ingredients = %d, want the 3 that existed", n)
	}
	if n := count(t, d, `SELECT count(*) FROM ingredients WHERE restock_level IS NOT NULL`); n != 0 {
		t.Errorf("%d Ingredients have a Restock level after the upgrade, want none", n)
	}
}

func TestMigration1550ChangesNoOtherData(t *testing.T) {
	d := migrate1550(t)
	var name string
	var shelf int
	if err := d.QueryRow(`SELECT name, shelf_life_days FROM ingredients WHERE id = 7`).Scan(&name, &shelf); err != nil || name != "béchamel" || shelf != 5 {
		t.Errorf("Ingredient 7 = %q, %d, %v; want unchanged", name, shelf, err)
	}
	if got := rows(t, d, `SELECT goes_off FROM stock_lots WHERE id = 900`); !reflect.DeepEqual(got, []string{"2026-11-06"}) {
		t.Errorf("stock lot goes_off = %v, want unchanged", got)
	}
}

func TestAnIngredientInsertedWithoutAKindIsFood(t *testing.T) {
	d := migrate1550(t)
	mustExec(t, d, `INSERT INTO ingredients(id,name,name_key,base_unit,created_at,updated_at) VALUES (20,'milk','milk','ml',?,?)`, suppliesTS, suppliesTS)
	if got := rows(t, d, `SELECT kind FROM ingredients WHERE id = 20`); !reflect.DeepEqual(got, []string{"food"}) {
		t.Errorf("kind = %v, want food (older code inserts no kind)", got)
	}
}

func TestMigration1550ChecksKindAndRestockLevel(t *testing.T) {
	d := migrate1550(t)
	ok := func(name, kind string, level any) {
		t.Helper()
		if _, err := d.Exec(`INSERT INTO ingredients(name,name_key,base_unit,kind,restock_level,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
			name, name, "piece", kind, level, suppliesTS, suppliesTS); err != nil {
			t.Errorf("kind %q level %v refused: %v", kind, level, err)
		}
	}
	bad := func(name, kind string, level any) {
		t.Helper()
		_, err := d.Exec(`INSERT INTO ingredients(name,name_key,base_unit,kind,restock_level,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
			name, name, "piece", kind, level, suppliesTS, suppliesTS)
		if err == nil || !strings.Contains(err.Error(), "CHECK") {
			t.Errorf("kind %q level %v accepted, want a CHECK failure (err = %v)", kind, level, err)
		}
	}
	ok("soap", "supply", 6)
	ok("bags", "supply", nil)
	ok("rice", "food", nil)
	bad("a", "item", nil)
	bad("b", "", nil)
	bad("c", "supply", 0)
	bad("d", "supply", -1)
}
