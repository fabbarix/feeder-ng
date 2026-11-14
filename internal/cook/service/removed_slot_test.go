package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook/service"
	"github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/plan/plantest"
)

// B9-04 (SAFE-02, SET-15): a removed Meal Slot keeps its Cooked history, and Cook Mode still reads the meal with the
// slot's name and its time (Store.Slot(id) returns a removed slot with Removed true).

func TestACookedMealOfARemovedMealSlotStillCarriesTheSlotNameAndTime(t *testing.T) {
	d := plantest.NewDB(t)
	ctx := context.Background()
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	slot := plantest.SeedMealSlot(t, d, 1, "Snack", "16:30")
	recipe := plantest.SeedRecipe(t, d, "Pasta", 4)
	var main int64
	if err := d.QueryRow(`SELECT id FROM courses WHERE is_main = 1`).Scan(&main); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, resolved_at, created_at, updated_at)
		VALUES ('2026-11-02', ?, ?, ?, 1, 4, 'cooked', '2026-11-02T17:00:00Z', '2026-11-01T12:00:00Z', '2026-11-02T17:00:00Z')`, slot, main, recipe); err != nil {
		t.Fatal(err)
	}
	if err := store.New(d, clk).RemoveSlot(ctx, slot); err != nil {
		t.Fatalf("RemoveSlot: %v", err)
	}

	got, err := service.NewDB(d, clk).Meals().Meal(ctx, "2026-11-02", slot, main)
	if err != nil {
		t.Fatalf("Meal of a removed Meal Slot = %v, want the Cooked meal", err)
	}
	if got.SlotName != "Snack" || got.State != "cooked" || !got.At.Equal(time.Date(2026, 11, 2, 16, 30, 0, 0, time.UTC)) {
		t.Errorf("meal = %+v, want slot Snack, Cooked, at 16:30", got)
	}
}
