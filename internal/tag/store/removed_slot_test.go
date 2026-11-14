package store_test

import "testing"

// B9-04 (SAFE-02): the Slot Rules of a removed Meal Slot are kept for Undo but do not apply, so a Tag's impact does not
// name them (migration 1570, meal_slots.removed_at).

func TestTagImpactIgnoresTheSlotRulesOfARemovedMealSlot(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	sat := f.slot(6, "Dinner", "19:00")
	fri := f.slot(5, "Dinner", "19:00")
	f.slotRule(sat, f.main, "fish")
	f.slotRule(fri, f.main, "fish")
	f.exec(`UPDATE meal_slots SET removed_at = '2026-11-09T11:00:00Z' WHERE id = ?`, sat)

	imp, err := f.st.Impact(ctx, fish)
	if err != nil {
		t.Fatal(err)
	}
	if len(imp.SlotRules) != 1 || imp.SlotRules[0].MealSlotID != fri {
		t.Errorf("SlotRules = %+v, want only Friday's Dinner: the removed Saturday Dinner is out", imp.SlotRules)
	}
}
