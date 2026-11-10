package db_test

import (
	"context"
	"database/sql"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// R11c: migration 1150 adds household_settings.created_at, stock_lots.kept_on and
// stock_waste.lot_goes_off. An existing install backfills created_at from its earliest
// user, Member or Stock Lot; a fresh database leaves it NULL (the app stamps it on first read).

func nullable(t *testing.T, d *sql.DB, q string) sql.NullString {
	t.Helper()
	var s sql.NullString
	if err := d.QueryRow(q).Scan(&s); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
	return s
}

func TestStreakMigrationBackfillsTheHouseholdCreatedAtFromTheEarliestRecord(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.Migrate(ctx, d, upTo(t, "1150_")); err != nil {
		t.Fatal(err)
	}
	mustExec(t, d, `INSERT INTO users(id,email,display_name,is_admin,created_at) VALUES (1,'a@x.org','A',1,'2026-10-05T08:00:00Z')`)
	mustExec(t, d, `INSERT INTO members(id,name,colour,portion_factor,created_at) VALUES (3,'Anna','#fff',1,'2026-10-03T08:00:00Z')`)
	mustExec(t, d, `INSERT INTO ingredients(id,name,name_key,base_unit,created_at,updated_at) VALUES (7,'Garlic','garlic','g','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z')`)
	mustExec(t, d, `INSERT INTO stock_lots(id,ingredient_id,quantity,purchased,source,created_at) VALUES (31,7,100,'2026-09-01','manual','2026-10-20T00:00:00Z')`)
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if got := nullable(t, d, `SELECT created_at FROM household_settings WHERE id = 1`); !got.Valid || got.String != "2026-10-03T08:00:00Z" {
		t.Errorf("household created_at = %+v, want the earliest record 2026-10-03T08:00:00Z", got)
	}
	// Existing Lots were never Kept.
	if got := nullable(t, d, `SELECT kept_on FROM stock_lots WHERE id = 31`); got.Valid {
		t.Errorf("kept_on = %+v, want NULL", got)
	}
}

func TestStreakMigrationLeavesAFreshHouseholdUnstamped(t *testing.T) {
	d, _ := openTemp(t)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	if got := nullable(t, d, `SELECT created_at FROM household_settings WHERE id = 1`); got.Valid {
		t.Errorf("fresh created_at = %+v, want NULL", got)
	}
	// The waste column exists and is nullable.
	mustExec(t, d, `INSERT INTO stock_waste(quantity, wasted_on, reason, created_at, lot_goes_off) VALUES (1, '2026-11-09', 'spoiled', '2026-11-09T00:00:00Z', NULL)`)
}

// The go-off ledger: a Lot that left Stock unthrown after it went off. Exists on a fresh install,
// keyed by lot id (one record per Lot).
func TestStreakMigrationCreatesTheGoOffLedger(t *testing.T) {
	d, _ := openTemp(t)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	mustExec(t, d, `INSERT INTO stock_go_offs(lot_id, goes_off, recorded_on) VALUES (7, '2026-11-03', '2026-11-06')`)
	if _, err := d.Exec(`INSERT INTO stock_go_offs(lot_id, goes_off, recorded_on) VALUES (7, '2026-11-03', '2026-11-06')`); err == nil {
		t.Error("a second record for the same Lot was accepted, want one per Lot")
	}
}
