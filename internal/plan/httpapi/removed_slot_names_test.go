package httpapi

import (
	"context"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/clock"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/plan/plantest"
)

// B9-04 (SAFE-02): names.load reads the Meal Slot names through AllSlots, so a removed Meal Slot keeps its name in
// every answer that names a past meal (plan/httpapi/names.go).

func TestNamesStillHoldTheNameOfARemovedMealSlot(t *testing.T) {
	d := plantest.NewDB(t)
	ctx := context.Background()
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	snack := plantest.SeedMealSlot(t, d, 1, "Snack", "16:30")
	dinner := plantest.SeedMealSlot(t, d, 2, "Dinner", "19:00")
	if err := householdstore.New(d, clk).RemoveSlot(ctx, snack); err != nil {
		t.Fatalf("RemoveSlot: %v", err)
	}
	tbl, err := newNames(app.Deps{DB: d, Clock: clk}).load(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if tbl.slots[snack] != "Snack" || tbl.slots[dinner] != "Dinner" {
		t.Errorf("slot names = %v, want both Snack (removed) and Dinner", tbl.slots)
	}
}
