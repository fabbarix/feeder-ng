package store_test

import "testing"

// B9-04 (SAFE-02): what changing a Recipe to Base removes does not name a removed Meal Slot: its rules are kept for
// Undo but do not apply, and nothing of it is planned (migration 1570, meal_slots.removed_at). Today is 2026-11-09.

func TestToBasePreviewIgnoresARemovedMealSlot(t *testing.T) {
	f := newBaseFixture(t)
	p := f.seedPesto(t)
	f.exec(t, `UPDATE meal_slots SET removed_at = '2026-11-09T11:00:00Z' WHERE id = ?`, p.slot)

	plan, err := f.s.ToBasePreview(ctx, p.pesto.ID)
	if err != nil {
		t.Fatalf("ToBasePreview: %v", err)
	}
	if len(plan.PlannedMeals) != 0 {
		t.Errorf("plannedMeals = %+v, want none: the only Meal Slot is removed", plan.PlannedMeals)
	}
	if len(plan.SlotRules) != 0 {
		t.Errorf("slotRules = %+v, want none: a removed Meal Slot's rules do not apply", plan.SlotRules)
	}
}
