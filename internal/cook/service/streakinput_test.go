package service_test

import (
	"database/sql"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/cook/service"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/stocktest"
)

// R11c: DB.StreakInput feeds cook.ZeroWasteStreak from the tables.

func exec(t *testing.T, d *sql.DB, q string, args ...any) {
	t.Helper()
	if _, err := d.Exec(q, args...); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
}

func TestStreakInputReadsCreatedLotsAndWaste(t *testing.T) {
	d := stocktest.NewDB(t)
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	ing := stocktest.SeedIngredient(t, d, "spinach", "g", nil)
	exec(t, d, `UPDATE household_settings SET created_at = '2026-10-01T09:00:00Z' WHERE id = 1`)
	exec(t, d, `INSERT INTO stock_lots(id,ingredient_id,quantity,purchased,goes_off,kept_on,source,created_at) VALUES
		(1,?,100,'2026-10-20','2026-11-03',NULL,'manual','2026-10-20T00:00:00Z'),
		(2,?,100,'2026-10-20','2026-11-04','2026-11-09','manual','2026-10-20T00:00:00Z'),
		(3,?,100,'2026-10-20',NULL,NULL,'manual','2026-10-20T00:00:00Z')`, ing, ing, ing)
	exec(t, d, `INSERT INTO stock_waste(ingredient_id,quantity,wasted_on,reason,lot_id,lot_goes_off,created_at) VALUES
		(?,100,'2026-11-08','spoiled',9,'2026-11-02','2026-11-08T00:00:00Z'),
		(NULL,50,'2026-11-07','leftover_discarded',NULL,NULL,'2026-11-07T00:00:00Z')`, ing)

	in, err := service.NewDB(d, clk).StreakInput(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if in.Created != "2026-10-01" {
		t.Errorf("Created = %q, want 2026-10-01", in.Created)
	}
	lots := map[int64]cook.LotGoOff{}
	for _, l := range in.Lots {
		lots[l.ID] = l
	}
	if lots[1].GoesOff != "2026-11-03" || lots[1].KeptOn != stock.None || lots[2].GoesOff != "2026-11-04" || lots[2].KeptOn != "2026-11-09" {
		t.Errorf("lots = %+v", in.Lots)
	}
	if l, ok := lots[3]; ok && l.GoesOff != stock.None {
		t.Errorf("undated lot = %+v", l)
	}
	if len(in.Waste) != 2 {
		t.Fatalf("waste = %+v", in.Waste)
	}
	byDate := map[stock.Date]cook.WasteEvent{}
	for _, w := range in.Waste {
		byDate[w.WastedOn] = w
	}
	if w := byDate["2026-11-08"]; w.LotID != 9 || w.LotGoesOff != "2026-11-02" {
		t.Errorf("thrown-out lot record = %+v", w)
	}
	if w := byDate["2026-11-07"]; w.LotID != 0 || w.LotGoesOff != stock.None {
		t.Errorf("discarded Leftover record = %+v", w)
	}
}

// The creation date is a household date: 2026-11-09 23:30 UTC is already 11-10 in Rome.
func TestStreakInputCreatedIsADateInTheHouseholdZone(t *testing.T) {
	d := stocktest.NewDB(t)
	clk := clock.NewFake(time.Date(2026, 11, 12, 12, 0, 0, 0, time.UTC))
	exec(t, d, `UPDATE household_settings SET time_zone = 'Europe/Rome', created_at = '2026-11-09T23:30:00Z' WHERE id = 1`)
	in, err := service.NewDB(d, clk).StreakInput(ctx)
	if err != nil || in.Created != "2026-11-10" {
		t.Fatalf("Created = %q (%v), want 2026-11-10", in.Created, err)
	}
	exec(t, d, `UPDATE household_settings SET time_zone = 'America/Los_Angeles' WHERE id = 1`)
	in, _ = service.NewDB(d, clk).StreakInput(ctx)
	if in.Created != "2026-11-09" {
		t.Errorf("Created = %q, want 2026-11-09", in.Created)
	}
}

// With no Lots at all the input is just the Household's age: the streak shows days since creation.
func TestStreakInputWithNoLotsIsTheHouseholdAge(t *testing.T) {
	d := stocktest.NewDB(t)
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	exec(t, d, `UPDATE household_settings SET created_at = '2026-11-02T08:00:00Z' WHERE id = 1`)
	in, err := service.NewDB(d, clk).StreakInput(ctx)
	if err != nil || len(in.Lots) != 0 || len(in.Waste) != 0 {
		t.Fatalf("input = %+v %v", in, err)
	}
	in.Today = "2026-11-09"
	if got := cook.ZeroWasteStreak(in); got != 7 {
		t.Errorf("streak = %d, want 7", got)
	}
}

// R11c: the go-off ledger (Lots used up or counted away after they went off) feeds the input, so
// the streak keeps the reset when the spoiled Lot is no longer in stock_lots.
func TestStreakInputReadsTheGoOffLedger(t *testing.T) {
	d := stocktest.NewDB(t)
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	exec(t, d, `UPDATE household_settings SET created_at = '2026-10-01T09:00:00Z' WHERE id = 1`)
	exec(t, d, `INSERT INTO stock_go_offs(lot_id, goes_off, recorded_on) VALUES (5,'2026-11-03','2026-11-06'), (6,'2026-11-01','2026-11-08')`)
	in, err := service.NewDB(d, clk).StreakInput(ctx)
	if err != nil {
		t.Fatal(err)
	}
	got := map[int64]stock.Date{}
	for _, g := range in.GoOffs {
		got[g.LotID] = g.GoesOff
	}
	if len(got) != 2 || got[5] != "2026-11-03" || got[6] != "2026-11-01" {
		t.Fatalf("GoOffs = %+v", in.GoOffs)
	}
	in.Today = "2026-11-09"
	if s := cook.ZeroWasteStreak(in); s != 5 { // newest go-off 11-03 went off 11-04
		t.Errorf("streak = %d, want 5", s)
	}
}
