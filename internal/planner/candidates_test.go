package planner

import (
	"testing"
	"time"
)

// Candidate filters (§7.2 step 2). Zero weights: the winner is the lowest
// eligible Recipe id, so each case removes Recipe 1 (or not) and checks who wins.
func TestCandidateFilters(t *testing.T) {
	tests := []struct {
		name   string
		recipe []Recipe // replaces the default three Recipes when non-nil
		mutate func(in *Input)
		want   RecipeID
	}{
		{name: "baseline: lowest id wins", want: 1},
		{
			name: "Exclusion on the Recipe", want: 2,
			mutate: func(in *Input) { *in = prefs(*in, anna, Preferences{ExcludedRecipes: []RecipeID{1}}) },
		},
		{
			name: "Exclusion on an Ingredient of the Recipe", want: 2,
			mutate: func(in *Input) { *in = prefs(*in, ben, Preferences{ExcludedIngredients: []IngredientID{chicken}}) },
		},
		{
			name: "Exclusion on an optional ingredient line still excludes", want: 2,
			recipe: []Recipe{rcp(1, 2, needs(optional(garlic, 10))), rcp(2, 2), rcp(3, 2)},
			mutate: func(in *Input) { *in = prefs(*in, anna, Preferences{ExcludedIngredients: []IngredientID{garlic}}) },
		},
		{
			name: "Exclusion by a Member who is not attending is ignored", want: 1,
			mutate: func(in *Input) {
				in.Slots[0].Attendance = []Attendee{{anna, 1}}
				*in = prefs(*in, ben, Preferences{ExcludedRecipes: []RecipeID{1}})
			},
		},
		{name: "Cool-down: 6 days ago is inside the default 7", want: 2, mutate: func(in *Input) { in.LastPlanned = map[RecipeID]Date{1: day(-6)} }},
		{name: "Cool-down: exactly 7 days ago is allowed", want: 1, mutate: func(in *Input) { in.LastPlanned = map[RecipeID]Date{1: day(-7)} }},
		{
			name: "Cool-down override shorter than the default", want: 1,
			recipe: []Recipe{rcp(1, 2, needs(need(chicken, 500)), cooldown(3)), rcp(2, 2), rcp(3, 2)},
			mutate: func(in *Input) { in.LastPlanned = map[RecipeID]Date{1: day(-4)} },
		},
		{
			name: "Cool-down override longer than the default", want: 2,
			recipe: []Recipe{rcp(1, 2, cooldown(10)), rcp(2, 2), rcp(3, 2)},
			mutate: func(in *Input) { in.LastPlanned = map[RecipeID]Date{1: day(-8)} },
		},
		{
			name: "archived Recipes are not candidates", want: 2,
			recipe: []Recipe{rcp(1, 2, archived()), rcp(2, 2), rcp(3, 2)},
		},
		{
			name: "Advance Step lead time already passed", want: 2,
			recipe: []Recipe{rcp(1, 2, lead(24*time.Hour)), rcp(2, 2), rcp(3, 2)},
		},
		{
			name: "Advance Step due exactly now is still possible", want: 1,
			// slot 19:30 minus 11h30 = 08:00 = now
			recipe: []Recipe{rcp(1, 2, lead(11*time.Hour+30*time.Minute)), rcp(2, 2), rcp(3, 2)},
		},
		{
			name: "Advance Step one minute too late", want: 2,
			recipe: []Recipe{rcp(1, 2, lead(11*time.Hour+31*time.Minute)), rcp(2, 2), rcp(3, 2)},
		},
		{
			name: "the longest Advance Step decides", want: 2,
			recipe: []Recipe{rcp(1, 2, lead(time.Hour), lead(48*time.Hour)), rcp(2, 2), rcp(3, 2)},
		},
		{
			name: "Slot Rule by Recipe", want: 3,
			mutate: func(in *Input) { in.Slots[0] = withRules(in.Slots[0], SlotRule{RecipeID: 3}) },
		},
		{
			name: "Slot Rule by Tag picks among the tagged Recipes", want: 2,
			recipe: []Recipe{rcp(1, 2), rcp(2, 2, tags("pizza")), rcp(3, 2, tags("pizza"))},
			mutate: func(in *Input) { in.Slots[0] = withRules(in.Slots[0], SlotRule{Tag: "pizza"}) },
		},
		{
			name: "several Slot Rules are alternatives", want: 2,
			recipe: []Recipe{rcp(1, 2), rcp(2, 2, tags("fish")), rcp(3, 2)},
			mutate: func(in *Input) { in.Slots[0] = withRules(in.Slots[0], SlotRule{RecipeID: 3}, SlotRule{Tag: "fish"}) },
		},
		{
			name: "Slot Rule narrowing still applies Exclusions", want: 3,
			recipe: []Recipe{rcp(1, 2), rcp(2, 2, tags("pizza")), rcp(3, 2, tags("pizza"))},
			mutate: func(in *Input) {
				in.Slots[0] = withRules(in.Slots[0], SlotRule{Tag: "pizza"})
				*in = prefs(*in, anna, Preferences{ExcludedRecipes: []RecipeID{2}})
			},
		},
		{
			name: "Dislikes do not remove a candidate", want: 1,
			mutate: func(in *Input) { *in = prefs(*in, anna, Preferences{Dislikes: []RecipeID{1}}) },
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recipes := tt.recipe
			if recipes == nil {
				recipes = []Recipe{rcp(1, 2, needs(need(chicken, 500))), rcp(2, 2), rcp(3, 2)}
			}
			in := baseInput([]Slot{dinner(0)}, recipes...)
			if tt.mutate != nil {
				tt.mutate(&in)
			}
			if got := placementAt(t, mustPlan(t, in), key(0)); got.RecipeID != tt.want {
				t.Errorf("recipe = %d, want %d", got.RecipeID, tt.want)
			}
		})
	}
}

func TestCooldownCountsPlannedAndCookedDates(t *testing.T) {
	t.Run("a Recipe planned earlier in the run is in cool-down", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0), dinner(1), dinner(7)}, rcp(1, 2), rcp(2, 2))
		r := mustPlan(t, in)
		if got := placementAt(t, r, key(0)).RecipeID; got != 1 {
			t.Fatalf("day 0 = %d", got)
		}
		if got := placementAt(t, r, key(1)).RecipeID; got != 2 {
			t.Errorf("day 1 = %d, want 2 (1 is in cool-down)", got)
		}
		if got := placementAt(t, r, key(7)).RecipeID; got != 1 {
			t.Errorf("day 7 = %d, want 1 (7 days after day 0)", got)
		}
	})
	t.Run("a Pinned meal later in the horizon also blocks", func(t *testing.T) {
		pinned := withExisting(dinner(2), ExistingMeal{State: MealPinned, RecipeID: 1, Batches: 1})
		in := baseInput([]Slot{dinner(0), pinned}, rcp(1, 2), rcp(2, 2))
		if got := placementAt(t, mustPlan(t, in), key(0)).RecipeID; got != 2 {
			t.Errorf("day 0 = %d, want 2", got)
		}
	})
	t.Run("a Cooked meal blocks too", func(t *testing.T) {
		cooked := withExisting(dinner(-1), ExistingMeal{State: MealCooked, RecipeID: 1, Batches: 1})
		in := baseInput([]Slot{cooked, dinner(0)}, rcp(1, 2), rcp(2, 2))
		if got := placementAt(t, mustPlan(t, in), key(0)).RecipeID; got != 2 {
			t.Errorf("day 0 = %d, want 2", got)
		}
	})
	t.Run("a skipped meal does not", func(t *testing.T) {
		skipped := withExisting(dinner(-1), ExistingMeal{State: MealSkipped, RecipeID: 1, Batches: 1})
		in := baseInput([]Slot{skipped, dinner(0)}, rcp(1, 2), rcp(2, 2))
		if got := placementAt(t, mustPlan(t, in), key(0)).RecipeID; got != 1 {
			t.Errorf("day 0 = %d, want 1", got)
		}
	})
	t.Run("serving a Leftover does not restart cool-down", func(t *testing.T) {
		// Recipe 1 cooked day 0 (cool-down 1 day), Leftover on day 1; day 2 is 2 days after the cook.
		in := baseInput([]Slot{dinner(0), dinner(1), dinner(2)}, rcp(1, 4, cooldown(2)), rcp(2, 2, cooldown(100)))
		r := mustPlan(t, in)
		if got := placementAt(t, r, key(2)); got.RecipeID != 1 || got.Source != SourceRecipe {
			t.Errorf("day 2 = %+v, want Recipe 1 cooked fresh", got)
		}
	})
}

func TestVarietyRules(t *testing.T) {
	recipes := []Recipe{rcp(1, 2, tags("fish")), rcp(2, 2, tags("fish")), rcp(3, 2)}
	t.Run("max per week", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{dinner(0), dinner(1), dinner(6), dinner(7)}, recipes...))
		in.VarietyRules = []VarietyRule{{Tag: "fish", MaxPerWeek: 1}}
		r := mustPlan(t, in)
		want := map[int]RecipeID{0: 1, 1: 3, 6: 3, 7: 1} // day 7 is Monday of the next ISO week
		for d, rec := range want {
			if got := placementAt(t, r, key(d)).RecipeID; got != rec {
				t.Errorf("day %d = %d, want %d", d, got, rec)
			}
		}
	})
	t.Run("max two per week allows a second fish meal", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{dinner(0), dinner(2), dinner(4)}, recipes...))
		in.VarietyRules = []VarietyRule{{Tag: "fish", MaxPerWeek: 2}}
		r := mustPlan(t, in)
		want := []RecipeID{1, 1, 3}
		for i, d := range []int{0, 2, 4} {
			if got := placementAt(t, r, key(d)).RecipeID; got != want[i] {
				t.Errorf("day %d = %d, want %d", d, got, want[i])
			}
		}
	})
	t.Run("a Pinned meal counts towards the week", func(t *testing.T) {
		pinned := withExisting(dinner(3), ExistingMeal{State: MealPinned, RecipeID: 2, Batches: 1})
		in := noCooldown(baseInput([]Slot{dinner(0), pinned}, recipes...))
		in.VarietyRules = []VarietyRule{{Tag: "fish", MaxPerWeek: 1}}
		if got := placementAt(t, mustPlan(t, in), key(0)).RecipeID; got != 3 {
			t.Errorf("day 0 = %d, want 3", got)
		}
	})
	t.Run("not on consecutive days", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{dinner(0), dinner(1), dinner(2)}, recipes...))
		in.VarietyRules = []VarietyRule{{Tag: "fish", NotConsecutiveDays: true}}
		r := mustPlan(t, in)
		want := []RecipeID{1, 3, 1}
		for d := 0; d < 3; d++ {
			if got := placementAt(t, r, key(d)).RecipeID; got != want[d] {
				t.Errorf("day %d = %d, want %d", d, got, want[d])
			}
		}
	})
	t.Run("a Pinned meal the day after blocks consecutive days", func(t *testing.T) {
		pinned := withExisting(dinner(1), ExistingMeal{State: MealPinned, RecipeID: 2, Batches: 1})
		in := noCooldown(baseInput([]Slot{dinner(0), pinned}, recipes...))
		in.VarietyRules = []VarietyRule{{Tag: "fish", NotConsecutiveDays: true}}
		if got := placementAt(t, mustPlan(t, in), key(0)).RecipeID; got != 3 {
			t.Errorf("day 0 = %d, want 3", got)
		}
	})
	t.Run("a rule on one Tag does not affect other Tags", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{dinner(0), dinner(1)}, recipes...))
		in.VarietyRules = []VarietyRule{{Tag: "pasta", MaxPerWeek: 1}}
		if got := placementAt(t, mustPlan(t, in), key(1)).RecipeID; got != 1 {
			t.Errorf("day 1 = %d, want 1", got)
		}
	})
}

func TestSlotRuleWithoutFallback(t *testing.T) {
	t.Run("an excluded rule Recipe leaves the slot unfilled", func(t *testing.T) {
		in := baseInput([]Slot{withRules(dinner(0), SlotRule{RecipeID: 2})}, rcp(1, 2), rcp(2, 2))
		in = prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{2}})
		r := mustPlan(t, in)
		u := unfilledAt(t, r, key(0))
		if !u.SlotRuleClaimed || u.Reason != UnfilledNoCandidates {
			t.Errorf("got %+v", u)
		}
	})
}
