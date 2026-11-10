package planner

import "testing"

// A Cooked meal served from a Leftover consumes it at Cooked time: the runner
// reduces the Leftover's portions, so Input.Leftovers already carries the
// reduced portions. The planner must not consume them a second time.
func TestCookedLeftoverMealDoesNotConsumeTheLeftoverAgain(t *testing.T) {
	cookedFromLeftover := ExistingMeal{State: MealCooked, RecipeID: pizzaR, From: &LeftoverSource{LeftoverID: 7}}
	plannedFromLeftover := ExistingMeal{State: MealPlanned, RecipeID: pizzaR, From: &LeftoverSource{LeftoverID: 7}}

	t.Run("a later Planned Leftover meal stays valid on the reduced portions", func(t *testing.T) {
		// Leftover 7 held 4 portions; the Cooked meal on Monday served 2, so 2 remain.
		slots := []Slot{withExisting(dinner(0), cookedFromLeftover), withExisting(dinner(1), plannedFromLeftover), dinner(2)}
		in := baseInput(slots, fiveRecipes()...)
		in.Leftovers = []Leftover{leftoverOf(7, pizzaR, 2, day(3))}
		r := mustPlan(t, in)
		if !containsKey(r.Kept, key(1)) {
			t.Errorf("Kept = %v, want Tuesday kept (the Leftover is still valid)", r.Kept)
		}
		for _, p := range r.Placements {
			if p.Key == key(1) {
				t.Errorf("Tuesday was replanned as %+v, want it kept from Leftover 7", p)
			}
		}
	})
}

func containsKey(keys []SlotKey, k SlotKey) bool {
	for _, x := range keys {
		if x == k {
			return true
		}
	}
	return false
}
