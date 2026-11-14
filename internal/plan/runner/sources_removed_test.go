package runner_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// B9-04 (SAFE-02): DBSources feeds Plan, Today, To confirm, the board and the reminders from the ACTIVE Meal Slots
// only, so a removed Meal Slot is never planned (plan/runner/sources.go).

func TestDBSourcesMealSlotsOmitsARemovedMealSlot(t *testing.T) {
	h := newRealHousehold(t)
	lunch, err := h.hh.CreateSlot(ctx, household.MealSlotInput{Weekday: 2, Name: "Lunch", Time: "12:30", Attendance: []household.Attendee{}})
	if err != nil {
		t.Fatal(err)
	}
	if got, err := h.src.MealSlots(ctx); err != nil || len(got) != 2 {
		t.Fatalf("MealSlots = %+v, %v; want Dinner and Lunch", got, err)
	}
	if err := h.hh.RemoveSlot(ctx, h.slot); err != nil {
		t.Fatalf("RemoveSlot: %v", err)
	}
	got, err := h.src.MealSlots(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != lunch.ID {
		t.Errorf("MealSlots = %+v, want only Lunch: the removed Dinner is not planned", got)
	}
}
