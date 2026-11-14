package store_test

import (
	"reflect"
	"testing"
)

// B9-04 (SAFE-02): a removed Meal Slot (meal_slots.removed_at set, migration 1570) is not counted in the Course
// impact: its Planned Meals will not be planned and it does not need the Course. Today is 2026-11-09.

func TestCourseImpactIgnoresARemovedMealSlot(t *testing.T) {
	f := newFx(t)
	w := f.sideWorld() // s1 "Snack" serves Side only, s2 "Dinner" serves Main and Side
	f.exec(`UPDATE meal_slots SET removed_at = '2026-11-09T11:00:00Z' WHERE id = ?`, w.s1)

	im, err := f.st.Impact(ctx, f.side)
	if err != nil {
		t.Fatal(err)
	}
	if im.MealSlots != 1 || im.MealSlotsOnlyThis != 0 {
		t.Errorf("MealSlots = %d (only this %d), want 1 and 0: the removed Snack no longer counts", im.MealSlots, im.MealSlotsOnlyThis)
	}
	var dates []string
	for _, m := range im.PlannedMeals {
		if m.MealSlotID == w.s1 {
			t.Errorf("PlannedMeals lists a meal of the removed Meal Slot: %+v", m)
		}
		dates = append(dates, m.Date)
	}
	if want := []string{"2026-11-10", "2026-11-11"}; !reflect.DeepEqual(dates, want) {
		t.Errorf("PlannedMeals dates = %v, want %v (Dinner's only)", dates, want)
	}
}
