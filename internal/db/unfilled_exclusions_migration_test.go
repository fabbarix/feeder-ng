package db_test

import (
	"context"
	"database/sql"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// Migration 1430 (docs/dev/design/rx-pt.md 2.4, team B-RX): plan_unfilled gains the nullable exclusions_json column.
// No backfill: an old row reads NULL until the startup replan rewrites it.

func TestMigration1430AddsANullableExclusionsColumn(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.Migrate(ctx, d, upTo(t, "1430_")); err != nil {
		t.Fatal(err)
	}
	if count(t, d, `SELECT count(*) FROM pragma_table_info('plan_unfilled') WHERE name = 'exclusions_json'`) != 0 {
		t.Fatal("the column must not exist before 1430")
	}
	var mainCourse int64
	if err := d.QueryRow(`SELECT id FROM courses WHERE is_main = 1`).Scan(&mainCourse); err != nil {
		t.Fatal(err)
	}
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (91,2,'Brunch','11:00')`)
	mustExec(t, d, `INSERT INTO plan_unfilled(date,meal_slot_id,course_id,reason,slot_rule_claimed,eliminated_json)
		VALUES ('2026-11-12',91,?,'no_candidates',1,'{"considered":4,"exclusion":4}')`, mainCourse)

	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	var notnull int
	if err := d.QueryRow(`SELECT "notnull" FROM pragma_table_info('plan_unfilled') WHERE name = 'exclusions_json'`).Scan(&notnull); err != nil || notnull != 0 {
		t.Fatalf("exclusions_json notnull = %d, %v; want a nullable column", notnull, err)
	}
	var reason, elim string
	var claimed int
	var excl sql.NullString
	if err := d.QueryRow(`SELECT reason, slot_rule_claimed, eliminated_json, exclusions_json FROM plan_unfilled`).
		Scan(&reason, &claimed, &elim, &excl); err != nil {
		t.Fatal(err)
	}
	if excl.Valid || reason != "no_candidates" || claimed != 1 || elim != `{"considered":4,"exclusion":4}` {
		t.Errorf("row = %q %d %q exclusions %v; want it unchanged with NULL detail", reason, claimed, elim, excl)
	}

	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	if got := count(t, d, `SELECT count(*) FROM plan_unfilled WHERE exclusions_json IS NULL`); got != 1 {
		t.Errorf("a second run must change nothing, NULL rows = %d", got)
	}
}

func TestMigration1430UpgradedMatchesFresh(t *testing.T) {
	ctx := context.Background()
	ddl := func(d *sql.DB) string {
		var s string
		if err := d.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name='plan_unfilled'`).Scan(&s); err != nil {
			t.Fatal(err)
		}
		return s
	}
	up, _ := openTemp(t)
	if err := db.Migrate(ctx, up, upTo(t, "1430_")); err != nil {
		t.Fatal(err)
	}
	if err := db.MigrateEmbedded(ctx, up); err != nil {
		t.Fatal(err)
	}
	fresh, _ := openTemp(t)
	if err := db.MigrateEmbedded(ctx, fresh); err != nil {
		t.Fatal(err)
	}
	if a, b := ddl(up), ddl(fresh); a != b {
		t.Errorf("upgraded plan_unfilled differs from a fresh one:\n%s\n%s", a, b)
	}
	if count(t, fresh, `SELECT count(*) FROM pragma_table_info('plan_unfilled') WHERE name = 'exclusions_json'`) != 1 {
		t.Errorf("a fresh database has no exclusions_json column")
	}
}
