package db_test

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// Migration 1440 (docs/dev/design/tg-plan.md §2, ADR 0010; team TG-A): tags gain a colour, a Tag row exists for
// every key a rule names, and colours follow name order.

func tagsOpenAt(t *testing.T, stop string) *sql.DB {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.Migrate(context.Background(), d, upTo(t, stop)); err != nil {
		t.Fatal(err)
	}
	return d
}

// seedPre1440 seeds Tags Fish (2 Recipes, one archived), pasta (1), Roast (none); a Slot Rule on key pizza and a
// Variety Rule on soup with no Tag; a Variety Rule on fish; and a Slot Rule whose key is ”.
func seedPre1440(t *testing.T, d *sql.DB) {
	t.Helper()
	mustExec(t, d, `INSERT INTO recipes(id,name,yield,archived,created_at,updated_at) VALUES
		(11,'Cod',4,0,?,?),(12,'Eel',4,1,?,?),(13,'Penne',4,0,?,?)`, mts, mts, mts, mts, mts, mts)
	mustExec(t, d, `INSERT INTO tags(id,key,name) VALUES (7,'fish','Fish'),(3,'pasta','pasta'),(9,'roast','Roast')`)
	mustExec(t, d, `INSERT INTO recipe_tags(recipe_id,tag_id,position) VALUES (11,7,0),(12,7,1),(13,3,0)`)
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (4,1,'Dinner','19:00')`)
	mustExec(t, d, `INSERT INTO slot_rules(id,meal_slot_id,course_id,recipe_id,tag) VALUES
		(31,4,(SELECT id FROM courses WHERE is_main = 1),NULL,'pizza'),
		(32,4,(SELECT id FROM courses WHERE is_main = 1),NULL,'')`)
	mustExec(t, d, `INSERT INTO variety_rules(tag,max_per_week,not_consecutive_days) VALUES ('soup',2,0),('fish',1,1)`)
}

func TestMigration1440ColoursTagsInNameOrderAndAddsRuleKeys(t *testing.T) {
	d := tagsOpenAt(t, "1440_")
	seedPre1440(t, d)
	beforeLinks := rows(t, d, `SELECT recipe_id, tag_id, position FROM recipe_tags ORDER BY 1,2`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1440: %v", err)
	}
	got := rows(t, d, `SELECT id, key, name, colour FROM tags ORDER BY lower(name), id`)
	want := []string{
		"7|fish|Fish|tomato", "3|pasta|pasta|apricot", fmt.Sprintf("%d|pizza|pizza|mustard", tagID(t, d, "pizza")),
		"9|roast|Roast|olive", fmt.Sprintf("%d|soup|soup|sage", tagID(t, d, "soup")),
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("tags =\n%v\nwant\n%v", got, want)
	}
	if n := count(t, d, `SELECT count(*) FROM tags WHERE key = ''`); n != 0 {
		t.Errorf("a Tag with key '' was created")
	}
	if after := rows(t, d, `SELECT recipe_id, tag_id, position FROM recipe_tags ORDER BY 1,2`); !equalRows(after, beforeLinks) {
		t.Errorf("recipe_tags changed:\n%v\n%v", beforeLinks, after)
	}
	counts := rows(t, d, `SELECT t.key, count(rt.recipe_id) FROM tags t LEFT JOIN recipe_tags rt ON rt.tag_id = t.id GROUP BY t.id ORDER BY t.key`)
	if !reflect.DeepEqual(counts, []string{"fish|2", "pasta|1", "pizza|0", "roast|0", "soup|0"}) {
		t.Errorf("Recipe counts = %v", counts)
	}
	// Rules are untouched.
	if n := count(t, d, `SELECT count(*) FROM slot_rules`); n != 2 {
		t.Errorf("slot_rules = %d", n)
	}
	if n := count(t, d, `SELECT count(*) FROM variety_rules`); n != 2 {
		t.Errorf("variety_rules = %d", n)
	}
}

func tagID(t *testing.T, d *sql.DB, key string) int64 {
	t.Helper()
	var id int64
	if err := d.QueryRow(`SELECT id FROM tags WHERE key = ?`, key).Scan(&id); err != nil {
		t.Fatalf("tag %q: %v", key, err)
	}
	return id
}

func TestMigration1440ColoursRepeatAfterTen(t *testing.T) {
	d := tagsOpenAt(t, "1440_")
	for i := 1; i <= 12; i++ {
		mustExec(t, d, `INSERT INTO tags(key,name) VALUES (?,?)`, fmt.Sprintf("t%02d", i), fmt.Sprintf("T%02d", i))
	}
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	got := rows(t, d, `SELECT colour FROM tags ORDER BY lower(name), id`)
	want := []string{"tomato", "apricot", "mustard", "olive", "sage", "teal", "sky", "blue", "plum", "rose", "tomato", "apricot"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("colours = %v, want %v", got, want)
	}
}

func TestMigration1440OrdersByNameNotById(t *testing.T) {
	d := tagsOpenAt(t, "1440_")
	mustExec(t, d, `INSERT INTO tags(id,key,name) VALUES (1,'zucchini','Zucchini'),(2,'apple','apple'),(3,'Bean','Bean')`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	got := rows(t, d, `SELECT key, colour FROM tags ORDER BY id`)
	if !reflect.DeepEqual(got, []string{"zucchini|mustard", "apple|tomato", "Bean|apricot"}) {
		t.Errorf("colours = %v", got)
	}
}

func TestMigration1440FreshAndUpgradedDatabasesHaveTheSameTagsTable(t *testing.T) {
	fresh, err := db.Open(filepath.Join(t.TempDir(), "fresh.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer fresh.Close()
	if err := db.MigrateEmbedded(context.Background(), fresh); err != nil {
		t.Fatal(err)
	}
	up := tagsOpenAt(t, "1440_")
	if err := db.MigrateEmbedded(context.Background(), up); err != nil {
		t.Fatal(err)
	}
	q := `SELECT sql FROM sqlite_master WHERE name = 'tags'`
	a, b := rows(t, fresh, q), rows(t, up, q)
	if !equalRows(a, b) || !strings.Contains(strings.Join(a, ""), "colour") {
		t.Errorf("tags DDL differs or has no colour:\nfresh:    %v\nupgraded: %v", a, b)
	}
}

func TestMigration1440IsANoOpTheSecondTime(t *testing.T) {
	d := tagsOpenAt(t, "1440_")
	seedPre1440(t, d)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	mustExec(t, d, `UPDATE tags SET colour = 'rose' WHERE key = 'fish'`)
	before := rows(t, d, `SELECT * FROM tags ORDER BY id`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	if after := rows(t, d, `SELECT * FROM tags ORDER BY id`); !equalRows(before, after) {
		t.Errorf("a second MigrateEmbedded changed tags:\n%v\n%v", before, after)
	}
	if n := count(t, d, `SELECT count(*) FROM schema_migrations WHERE name LIKE '1440_%'`); n != 1 {
		t.Errorf("1440 recorded %d times", n)
	}
}

// The Tag repository rewrites Tag keys only in slot_rules.tag and variety_rules.tag. A later migration that adds
// another column called tag (a key it would not rewrite) fails here until the repository and this test are updated.
func TestOnlyRuleTablesHaveATagColumn(t *testing.T) {
	d, err := db.Open(filepath.Join(t.TempDir(), "fresh.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	got := rows(t, d, `SELECT m.name || '.' || p.name FROM sqlite_master AS m, pragma_table_info(m.name) AS p
		WHERE m.type = 'table' AND p.name = 'tag' ORDER BY 1`)
	if want := []string{"slot_rules.tag", "variety_rules.tag"}; !reflect.DeepEqual(got, want) {
		t.Errorf("tables with a tag column = %v, want %v: update internal/tag/store to rewrite the new one", got, want)
	}
}
