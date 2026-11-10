package db_test

import (
	"context"
	"database/sql"
	"io/fs"
	"os"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// Tables whose ids clients cache or link to (B11): they must never reuse an id.
var autoincrementTables = []string{
	"ingredients", "recipes", "products", "shops", "members", "meal_slots", "planned_meals", "stock_lots",
}

// upTo returns the real migrations whose name sorts before stop ("1100_" excludes the rebuild).
func upTo(t *testing.T, stop string) fs.FS {
	t.Helper()
	real := os.DirFS("migrations")
	out := fstest.MapFS{}
	entries, err := fs.ReadDir(real, ".")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".sql") && e.Name() < stop {
			b, _ := fs.ReadFile(real, e.Name())
			out[e.Name()] = &fstest.MapFile{Data: b}
		}
	}
	return out
}

func mustExec(t *testing.T, d *sql.DB, q string, args ...any) {
	t.Helper()
	if _, err := d.Exec(q, args...); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
}

func count(t *testing.T, d *sql.DB, q string, args ...any) int {
	t.Helper()
	var n int
	if err := d.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
	return n
}

// seed fills every table of autoincrementTables, plus children that reference them with
// ON DELETE CASCADE / SET NULL, using ids that are not 1 so a renumbering would show.
func seed(t *testing.T, d *sql.DB) {
	t.Helper()
	const ts = "2026-01-01T00:00:00Z"
	mustExec(t, d, `INSERT INTO ingredients(id,name,name_key,base_unit,created_at,updated_at) VALUES (7,'Garlic','garlic','g',?,?)`, ts, ts)
	mustExec(t, d, `INSERT INTO ingredient_conversions(ingredient_id,unit,to_base) VALUES (7,'clove',5)`)
	mustExec(t, d, `INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (11,'Soup',4,?,?)`, ts, ts)
	mustExec(t, d, `INSERT INTO recipe_lines(recipe_id,ingredient_id,position,quantity,unit) VALUES (11,7,1,2,'clove')`)
	mustExec(t, d, `INSERT INTO shops(id,name,name_key,created_at) VALUES (5,'Lidl','lidl',?)`, ts)
	mustExec(t, d, `INSERT INTO products(id,name,ingredient_id,pack_size,created_at,updated_at) VALUES (9,'Garlic 100 g',7,100,?,?)`, ts, ts)
	mustExec(t, d, `INSERT INTO product_shops(product_id,shop_id) VALUES (9,5)`)
	mustExec(t, d, `INSERT INTO members(id,name,colour,portion_factor,created_at) VALUES (3,'Anna','#fff',1,?)`, ts)
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (4,1,'Dinner','19:00')`)
	mustExec(t, d, `INSERT INTO meal_slot_attendees(slot_id,member_id) VALUES (4,3)`)
	mustExec(t, d, `INSERT INTO planned_meals(id,date,meal_slot_id,recipe_id,batches,portions,created_at,updated_at) VALUES (21,'2026-11-10',4,11,1,4,?,?)`, ts, ts)
	mustExec(t, d, `INSERT INTO stock_lots(id,ingredient_id,quantity,purchased,source,created_at) VALUES (31,7,100,'2026-11-01','manual',?)`, ts)
}

func TestRebuildKeepsDataKeysAndForeignKeys(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.Migrate(ctx, d, upTo(t, "1100_")); err != nil {
		t.Fatal(err)
	}
	seed(t, d)
	// Apply the rest (the 11xx rebuild) through the real embedded set.
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatalf("rebuild: %v", err)
	}
	for _, table := range autoincrementTables {
		var ddl string
		d.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&ddl)
		if !strings.Contains(strings.ToUpper(ddl), "AUTOINCREMENT") {
			t.Errorf("%s is not AUTOINCREMENT after the rebuild", table)
		}
	}
	// Data and ids preserved, children still attached (a plain DROP TABLE would have cascaded them away).
	for q, want := range map[string]int{
		`SELECT count(*) FROM ingredients WHERE id=7 AND name='Garlic'`:                      1,
		`SELECT count(*) FROM ingredient_conversions WHERE ingredient_id=7`:                  1,
		`SELECT count(*) FROM recipes WHERE id=11`:                                           1,
		`SELECT count(*) FROM recipe_lines WHERE recipe_id=11 AND ingredient_id=7`:           1,
		`SELECT count(*) FROM shops WHERE id=5`:                                              1,
		`SELECT count(*) FROM products WHERE id=9 AND ingredient_id=7`:                       1,
		`SELECT count(*) FROM product_shops WHERE product_id=9 AND shop_id=5`:                1,
		`SELECT count(*) FROM members WHERE id=3`:                                            1,
		`SELECT count(*) FROM meal_slots WHERE id=4`:                                         1,
		`SELECT count(*) FROM meal_slot_attendees WHERE slot_id=4 AND member_id=3`:           1,
		`SELECT count(*) FROM planned_meals WHERE id=21 AND meal_slot_id=4 AND recipe_id=11`: 1,
		`SELECT count(*) FROM stock_lots WHERE id=31 AND ingredient_id=7`:                    1,
	} {
		if got := count(t, d, q); got != want {
			t.Errorf("%s = %d, want %d", q, got, want)
		}
	}
	rows, err := d.Query(`PRAGMA foreign_key_check`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	if rows.Next() {
		t.Error("PRAGMA foreign_key_check reports violations after the rebuild")
	}
	if count(t, d, `PRAGMA foreign_keys`) != 1 {
		t.Error("foreign_keys must be back ON on the pool after the migration")
	}
	// Indexes survived.
	for _, idx := range []string{"recipes_archived", "products_ingredient", "stock_lots_ingredient", "planned_meals_recipe", "planned_meals_state_date"} {
		if count(t, d, `SELECT count(*) FROM sqlite_master WHERE type='index' AND name=?`, idx) != 1 {
			t.Errorf("index %s missing after the rebuild", idx)
		}
	}
	// Foreign keys are still enforced (and still cascade).
	if _, err := d.Exec(`INSERT INTO products(name,ingredient_id,pack_size,created_at,updated_at) VALUES ('x',999,1,'t','t')`); err == nil {
		t.Error("inserting a Product for a missing Ingredient must fail")
	}
	mustExec(t, d, `DELETE FROM meal_slots WHERE id=4`)
	if count(t, d, `SELECT count(*) FROM planned_meals`) != 0 || count(t, d, `SELECT count(*) FROM meal_slot_attendees`) != 0 {
		t.Error("deleting a Meal Slot must still cascade to its Planned Meals and attendees")
	}
	// The unique/trigger behaviour on other tables is untouched.
	if count(t, d, `SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name='users_last_admin_on_delete'`) != 1 {
		t.Error("last-admin trigger lost")
	}
}

func TestIdsAreNotReusedAfterDelete(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	const ts = "2026-01-01T00:00:00Z"
	ids := func(insert, del string, args ...any) (first, second int64) {
		r, err := d.Exec(insert, args...)
		if err != nil {
			t.Fatalf("%s: %v", insert, err)
		}
		first, _ = r.LastInsertId()
		mustExec(t, d, del, first)
		r, err = d.Exec(insert, args...)
		if err != nil {
			t.Fatalf("%s: %v", insert, err)
		}
		second, _ = r.LastInsertId()
		return
	}
	cases := []struct {
		table, insert string
		args          []any
	}{
		{"shops", `INSERT INTO shops(name,name_key,created_at) VALUES ('S','s',?)`, []any{ts}},
		{"members", `INSERT INTO members(name,colour,portion_factor,created_at) VALUES ('M','#fff',1,?)`, []any{ts}},
		{"meal_slots", `INSERT INTO meal_slots(weekday,name,time) VALUES (1,'Lunch','12:00')`, nil},
		{"recipes", `INSERT INTO recipes(name,yield,created_at,updated_at) VALUES ('R',1,?,?)`, []any{ts, ts}},
		{"ingredients", `INSERT INTO ingredients(name,name_key,base_unit,created_at,updated_at) VALUES ('I','i','g',?,?)`, []any{ts, ts}},
	}
	for _, c := range cases {
		first, second := ids(c.insert, `DELETE FROM `+c.table+` WHERE id=?`, c.args...)
		if second <= first {
			t.Errorf("%s: id %d reused or went backwards after delete (next was %d)", c.table, first, second)
		}
	}
}

// The runner must let a migration rebuild a parent table without cascading its children:
// foreign_keys is OFF during such a file (it cannot be changed inside a transaction), a
// foreign_key_check runs before commit, and foreign_keys is back ON afterwards.
func TestMigrateForeignKeysOffDirective(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	fsys := fstest.MapFS{
		"0001_base.sql": {Data: []byte(`
CREATE TABLE parent(id INTEGER PRIMARY KEY, v TEXT);
CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id) ON DELETE CASCADE);
INSERT INTO parent VALUES (5,'a'); INSERT INTO child VALUES (1,5);`)},
		"0002_rebuild.sql": {Data: []byte(`-- feeder:foreign-keys=off
CREATE TABLE parent_new(id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT);
INSERT INTO parent_new SELECT id, v FROM parent;
DROP TABLE parent;
ALTER TABLE parent_new RENAME TO parent;`)},
	}
	if err := db.Migrate(ctx, d, fsys); err != nil {
		t.Fatal(err)
	}
	if n := count(t, d, `SELECT count(*) FROM child`); n != 1 {
		t.Fatalf("child rows = %d, want 1 (the rebuild must not cascade)", n)
	}
	if n := count(t, d, `PRAGMA foreign_keys`); n != 1 {
		t.Fatalf("foreign_keys = %d after the migration, want 1", n)
	}
	// Every pooled connection has it ON again.
	for i := 0; i < 3; i++ {
		c, _ := d.Conn(ctx)
		var fk int
		c.QueryRowContext(ctx, "PRAGMA foreign_keys").Scan(&fk)
		c.Close()
		if fk != 1 {
			t.Fatalf("pooled connection %d has foreign_keys=%d", i, fk)
		}
	}
}

func TestMigrateForeignKeysOffRollsBackOnViolation(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	fsys := fstest.MapFS{
		"0001_base.sql": {Data: []byte(`
CREATE TABLE parent(id INTEGER PRIMARY KEY);
CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id));
INSERT INTO parent VALUES (1); INSERT INTO child VALUES (1,1);`)},
		"0002_bad.sql": {Data: []byte("-- feeder:foreign-keys=off\nDELETE FROM parent;")}, // orphans the child
	}
	err := db.Migrate(ctx, d, fsys)
	if err == nil || !strings.Contains(err.Error(), "0002_bad.sql") {
		t.Fatalf("err = %v, want a failure naming 0002_bad.sql", err)
	}
	if n := count(t, d, `SELECT count(*) FROM parent`); n != 1 {
		t.Fatalf("parent rows = %d, want 1 (rolled back)", n)
	}
	if n := count(t, d, `SELECT count(*) FROM schema_migrations WHERE name='0002_bad.sql'`); n != 0 {
		t.Fatal("a failed migration must not be recorded")
	}
	if n := count(t, d, `PRAGMA foreign_keys`); n != 1 {
		t.Fatalf("foreign_keys = %d after the failure, want 1", n)
	}
}
