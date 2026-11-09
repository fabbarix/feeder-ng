package planner

import "testing"

// Leftover-first (§7.2 step 1). Zero weights: a fresh pick is always the
// lowest Recipe id (1); the Leftovers under test are Recipe 2 (or 3).
func TestLeftoverFirst(t *testing.T) {
	tests := []struct {
		name         string
		leftovers    []Leftover
		slotRules    []SlotRule
		attendance   []Attendee
		prefs        map[MemberID]Preferences
		wantLeftover int64 // 0 = a fresh Recipe is expected
		wantRecipe   RecipeID
	}{
		{name: "exactly covers the portions", leftovers: []Leftover{leftoverOf(7, 2, 2, day(3))}, wantLeftover: 7, wantRecipe: 2},
		{name: "more than covers the portions", leftovers: []Leftover{leftoverOf(7, 2, 4, day(3))}, wantLeftover: 7, wantRecipe: 2},
		{name: "does not fully cover the portions", leftovers: []Leftover{leftoverOf(7, 2, 1.5, day(3))}, wantRecipe: 1},
		{name: "Use-by on the slot date still counts", leftovers: []Leftover{leftoverOf(7, 2, 2, day(0))}, wantLeftover: 7, wantRecipe: 2},
		{name: "past its Use-by is never planned", leftovers: []Leftover{leftoverOf(7, 2, 2, day(-1))}, wantRecipe: 1},
		{
			name: "Exclusion on the Recipe by an attending Member", leftovers: []Leftover{leftoverOf(7, 2, 2, day(3))},
			prefs: map[MemberID]Preferences{ben: {ExcludedRecipes: []RecipeID{2}}}, wantRecipe: 1,
		},
		{
			name: "Exclusion on an Ingredient of the Recipe", leftovers: []Leftover{leftoverOf(7, 2, 2, day(3))},
			prefs: map[MemberID]Preferences{ben: {ExcludedIngredients: []IngredientID{spinach}}}, wantRecipe: 1,
		},
		{
			name: "Exclusion by a Member who is not attending is irrelevant", leftovers: []Leftover{leftoverOf(7, 2, 2, day(3))},
			attendance: []Attendee{{anna, 1}}, prefs: map[MemberID]Preferences{ben: {ExcludedRecipes: []RecipeID{2}}},
			wantLeftover: 7, wantRecipe: 2,
		},
		{
			name: "Dislikes are ignored for Leftovers", leftovers: []Leftover{leftoverOf(7, 2, 2, day(3))},
			prefs: map[MemberID]Preferences{ben: {Dislikes: []RecipeID{2}}}, wantLeftover: 7, wantRecipe: 2,
		},
		{
			name: "a Slot Rule claiming the slot beats the Leftover", leftovers: []Leftover{leftoverOf(7, 2, 2, day(3))},
			slotRules: []SlotRule{{RecipeID: 3}}, wantRecipe: 3,
		},
		{
			name: "a Slot Rule by Tag matching the Leftover's Recipe still cooks fresh", leftovers: []Leftover{leftoverOf(7, 2, 2, day(3))},
			slotRules: []SlotRule{{Tag: "pizza"}}, wantRecipe: 2,
		},
		{name: "Leftover of an unknown Recipe is not servable", leftovers: []Leftover{leftoverOf(7, 99, 2, day(3))}, wantRecipe: 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := dinner(0, tt.attendance...)
			s.Rules = tt.slotRules
			in := baseInput([]Slot{s},
				rcp(1, 2, needs(need(chicken, 500))),
				rcp(2, 2, tags("pizza"), needs(need(spinach, 300))),
				rcp(3, 2, needs(need(rice, 200))))
			in.Leftovers = tt.leftovers
			in.Members = tt.prefs
			p := placementAt(t, mustPlan(t, in), key(0))
			if p.RecipeID != tt.wantRecipe {
				t.Errorf("recipe = %d, want %d", p.RecipeID, tt.wantRecipe)
			}
			if tt.wantLeftover == 0 {
				if p.Source != SourceRecipe || p.From != nil || p.Batches < 1 {
					t.Errorf("want a freshly cooked placement, got %+v", p)
				}
				return
			}
			if p.Source != SourceLeftover || p.From == nil || p.From.LeftoverID != tt.wantLeftover || p.Batches != 0 {
				t.Errorf("want served from Leftover %d, got %+v", tt.wantLeftover, p)
			}
			if p.Surplus != nil || len(p.Purchases) != 0 {
				t.Errorf("a Leftover meal has no surplus or purchases: %+v", p)
			}
		})
	}
}

func TestLeftoverFirstPicksSoonestUseBy(t *testing.T) {
	in := baseInput([]Slot{dinner(0)},
		rcp(1, 2), rcp(2, 2), rcp(3, 2))
	in.Leftovers = []Leftover{leftoverOf(7, 2, 2, day(3)), leftoverOf(8, 3, 2, day(1))}
	p := placementAt(t, mustPlan(t, in), key(0))
	if p.From == nil || p.From.LeftoverID != 8 || p.RecipeID != 3 {
		t.Errorf("want Leftover 8 (soonest Use-by), got %+v", p)
	}
}

func TestLeftoverRemainderStaysPending(t *testing.T) {
	in := noCooldown(baseInput([]Slot{dinner(0), dinner(1), dinner(2)}, rcp(1, 2), rcp(2, 2)))
	in.Leftovers = []Leftover{leftoverOf(7, 2, 4, day(5))}
	r := mustPlan(t, in)
	for i := 0; i < 2; i++ {
		if p := placementAt(t, r, key(i)); p.From == nil || p.From.LeftoverID != 7 {
			t.Errorf("day %d should be served from Leftover 7, got %+v", i, p)
		}
	}
	if p := placementAt(t, r, key(2)); p.Source != SourceRecipe {
		t.Errorf("Leftover 7 is used up on day 2, got %+v", p)
	}
}

func TestLeftoverFromAnEarlierPlannedMeal(t *testing.T) {
	t.Run("served the next day, with the source slot recorded", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{dinner(0), dinner(1)}, rcp(1, 4), rcp(2, 2)))
		r := mustPlan(t, in)
		first := placementAt(t, r, key(0))
		if first.RecipeID != 1 || first.Batches != 1 || first.Surplus == nil || first.Surplus.Portions != 2 {
			t.Fatalf("day 0: %+v", first)
		}
		second := placementAt(t, r, key(1))
		if second.Source != SourceLeftover || second.From == nil || second.From.LeftoverID != 0 || second.From.FromSlot != key(0) || second.RecipeID != 1 {
			t.Errorf("day 1 should be served from day 0's surplus: %+v", second)
		}
	})
	t.Run("a later slot on the same day can use the lunch surplus", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{lunch(0), dinner(0)}, rcp(1, 4), rcp(2, 2)))
		r := mustPlan(t, in)
		if p := placementAt(t, r, SlotKey{day(0), dinnerSlot}); p.Source != SourceLeftover || p.From.FromSlot != (SlotKey{day(0), lunchSlot}) {
			t.Errorf("dinner should reuse lunch's surplus: %+v", p)
		}
	})
	t.Run("not after its Use-by", func(t *testing.T) {
		// default Use-by 3 days: cooked day 0, last servable day 3.
		in := noCooldown(baseInput([]Slot{dinner(0), dinner(4)}, rcp(1, 4), rcp(2, 2)))
		if p := placementAt(t, mustPlan(t, in), key(4)); p.Source != SourceRecipe {
			t.Errorf("day 4 is past the Use-by: %+v", p)
		}
	})
	t.Run("Variety Rules do not block serving a Leftover", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{dinner(0), dinner(1)}, rcp(1, 4, tags("fish")), rcp(2, 2)))
		in.VarietyRules = []VarietyRule{{Tag: "fish", MaxPerWeek: 1, NotConsecutiveDays: true}}
		if p := placementAt(t, mustPlan(t, in), key(1)); p.Source != SourceLeftover || p.RecipeID != 1 {
			t.Errorf("fish Leftover on day 1 is not a new fish meal: %+v", p)
		}
	})
}
