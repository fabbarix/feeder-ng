package clock_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
)

func TestHouseholdTodayUsesTheHouseholdTimeZone(t *testing.T) {
	ctx := context.Background()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	// 2026-11-09 23:30 UTC is already the 10th in Tokyo and still the 9th in New York.
	clk := clock.NewFake(time.Date(2026, 11, 9, 23, 30, 0, 0, time.UTC))
	setZone := func(tz string) {
		t.Helper()
		if _, err := d.Exec(`UPDATE household_settings SET time_zone = ? WHERE id = 1`, tz); err != nil {
			t.Fatal(err)
		}
	}
	check := func(q *sql.DB, want, why string) {
		t.Helper()
		got, err := clock.HouseholdToday(ctx, q, clk)
		if err != nil {
			t.Fatalf("%s: %v", why, err)
		}
		if got != want {
			t.Errorf("%s: today = %s, want %s", why, got, want)
		}
	}
	setZone("Asia/Tokyo")
	check(d, "2026-11-10", "Tokyo")
	setZone("America/New_York")
	check(d, "2026-11-09", "New York")
	setZone("Not/AZone")
	check(d, "2026-11-09", "unknown zone falls back to UTC")

	// Through a transaction too, and with no settings row at all.
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM household_settings`); err != nil {
		t.Fatal(err)
	}
	got, err := clock.HouseholdToday(ctx, tx, clk)
	if err != nil || got != "2026-11-09" {
		t.Errorf("no settings row in a transaction: %q, %v; want 2026-11-09 (UTC)", got, err)
	}
}
