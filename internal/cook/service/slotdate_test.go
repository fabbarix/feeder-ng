package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook/service"
	"github.com/fabbarix/feeder-ng/internal/plan/plantest"
)

// B5-SD (ADR 0014): the cook service reads a Planned Meal's slot instant through the date's time, so the cooking
// timeline's end, Start cooking and Confirm Cooked follow "Time today". The household zone here is UTC.

func TestPlannedMealsCarryTheDatesTimeAsTheirSlotInstant(t *testing.T) {
	d := plantest.NewDB(t)
	ctx := context.Background()
	slot := plantest.SeedMealSlot(t, d, 1, "Dinner", "19:00")
	recipe := plantest.SeedRecipe(t, d, "Pasta", 4)
	var main int64
	if err := d.QueryRow(`SELECT id FROM courses WHERE is_main = 1`).Scan(&main); err != nil {
		t.Fatal(err)
	}
	for _, date := range []string{"2026-11-09", "2026-11-16"} {
		if _, err := d.Exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, created_at, updated_at)
			VALUES (?, ?, ?, ?, 1, 4, 'planned', '2026-11-08T12:00:00Z', '2026-11-08T12:00:00Z')`, date, slot, main, recipe); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := d.Exec(`INSERT INTO meal_slot_dates (slot_id, date, time, updated_at) VALUES (?, '2026-11-09', '20:15', '2026-11-08T12:00:00Z')`, slot); err != nil {
		t.Fatal(err)
	}
	meals := service.NewDB(d, clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))).Meals()

	one, err := meals.Meal(ctx, "2026-11-09", slot, main)
	if err != nil {
		t.Fatal(err)
	}
	if want := time.Date(2026, 11, 9, 20, 15, 0, 0, time.UTC); !one.At.Equal(want) {
		t.Errorf("Meal.At = %v, want the date's 20:15", one.At)
	}
	inSlot, err := meals.Slot(ctx, "2026-11-09", slot)
	if err != nil || len(inSlot) != 1 || !inSlot[0].At.Equal(time.Date(2026, 11, 9, 20, 15, 0, 0, time.UTC)) {
		t.Errorf("Slot = %+v, %v; want the meal at 20:15", inSlot, err)
	}
	up, err := meals.Upcoming(ctx, "2026-11-09")
	if err != nil || len(up) != 2 {
		t.Fatalf("Upcoming = %+v, %v", up, err)
	}
	for _, m := range up {
		want := time.Date(2026, 11, 16, 19, 0, 0, 0, time.UTC)
		if m.Date == "2026-11-09" {
			want = time.Date(2026, 11, 9, 20, 15, 0, 0, time.UTC)
		}
		if !m.At.Equal(want) {
			t.Errorf("Upcoming %s At = %v, want %v", m.Date, m.At, want)
		}
	}
}
