package household

import "sort"

// SortRemovals returns rem with its lists in display order: Planned Meals Pinned first, then by date, Meal
// Slot id and Course id; Slot Rules by id. The input is not modified.
func SortRemovals(rem Removals) Removals {
	meals := append([]RemovedMeal(nil), rem.PlannedMeals...)
	sort.SliceStable(meals, func(i, j int) bool {
		a, b := meals[i], meals[j]
		if a.Pinned != b.Pinned {
			return a.Pinned
		}
		if a.Date != b.Date {
			return a.Date < b.Date
		}
		if a.MealSlotID != b.MealSlotID {
			return a.MealSlotID < b.MealSlotID
		}
		return a.CourseID < b.CourseID
	})
	rules := append([]RemovedRule(nil), rem.SlotRules...)
	sort.SliceStable(rules, func(i, j int) bool { return rules[i].ID < rules[j].ID })
	return Removals{PlannedMeals: meals, SlotRules: rules}
}
