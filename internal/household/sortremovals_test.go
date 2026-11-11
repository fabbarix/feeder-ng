package household_test

import (
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

func TestSortRemovals(t *testing.T) {
	t.Run("meals: Pinned first, then date, Meal Slot id, Course id", func(t *testing.T) {
		in := household.Removals{PlannedMeals: []household.RemovedMeal{
			{Date: "2026-01-01", MealSlotID: 1, CourseID: 1},
			{Date: "2026-01-03", MealSlotID: 1, CourseID: 1, Pinned: true},
			{Date: "2026-01-02", MealSlotID: 2, CourseID: 2},
			{Date: "2026-01-02", MealSlotID: 2, CourseID: 1},
			{Date: "2026-01-02", MealSlotID: 1, CourseID: 5},
			{Date: "2026-01-02", MealSlotID: 3, CourseID: 1, Pinned: true},
			{Date: "2026-01-02", MealSlotID: 3, CourseID: 0, Pinned: true},
		}}
		want := []household.RemovedMeal{
			{Date: "2026-01-02", MealSlotID: 3, CourseID: 0, Pinned: true},
			{Date: "2026-01-02", MealSlotID: 3, CourseID: 1, Pinned: true},
			{Date: "2026-01-03", MealSlotID: 1, CourseID: 1, Pinned: true},
			{Date: "2026-01-01", MealSlotID: 1, CourseID: 1},
			{Date: "2026-01-02", MealSlotID: 1, CourseID: 5},
			{Date: "2026-01-02", MealSlotID: 2, CourseID: 1},
			{Date: "2026-01-02", MealSlotID: 2, CourseID: 2},
		}
		got := household.SortRemovals(in).PlannedMeals
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("got  %+v\nwant %+v", got, want)
		}
	})

	t.Run("rules: by id", func(t *testing.T) {
		in := household.Removals{SlotRules: []household.RemovedRule{
			{ID: 30, MealSlotID: 1, CourseID: 1, Tag: "a"},
			{ID: 10, MealSlotID: 2, CourseID: 2, RecipeID: 7},
			{ID: 20, MealSlotID: 1, CourseID: 3},
		}}
		want := []household.RemovedRule{
			{ID: 10, MealSlotID: 2, CourseID: 2, RecipeID: 7},
			{ID: 20, MealSlotID: 1, CourseID: 3},
			{ID: 30, MealSlotID: 1, CourseID: 1, Tag: "a"},
		}
		got := household.SortRemovals(in).SlotRules
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("got  %+v\nwant %+v", got, want)
		}
	})

	t.Run("the input is not modified", func(t *testing.T) {
		in := household.Removals{
			PlannedMeals: []household.RemovedMeal{{Date: "2026-01-02"}, {Date: "2026-01-01", Pinned: true}},
			SlotRules:    []household.RemovedRule{{ID: 2}, {ID: 1}},
		}
		before := household.Removals{
			PlannedMeals: append([]household.RemovedMeal(nil), in.PlannedMeals...),
			SlotRules:    append([]household.RemovedRule(nil), in.SlotRules...),
		}
		household.SortRemovals(in)
		if !reflect.DeepEqual(in, before) {
			t.Fatalf("input changed: %+v", in)
		}
	})

	t.Run("empty input stays empty", func(t *testing.T) {
		got := household.SortRemovals(household.Removals{})
		if len(got.PlannedMeals) != 0 || len(got.SlotRules) != 0 {
			t.Fatalf("got %+v", got)
		}
	})
}
