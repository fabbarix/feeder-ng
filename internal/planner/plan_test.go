package planner

import (
	"errors"
	"reflect"
	"testing"
)

func keysOf(ks []SlotKey) map[SlotKey]bool {
	m := map[SlotKey]bool{}
	for _, k := range ks {
		m[k] = true
	}
	return m
}

func TestPlanNeverTouchesFixedMeals(t *testing.T) {
	slots := []Slot{
		withExisting(dinner(0), ExistingMeal{State: MealPinned, RecipeID: 1, Batches: 1}),
		withExisting(dinner(1), ExistingMeal{State: MealCooked, RecipeID: 2, Batches: 1}),
		withExisting(dinner(2), ExistingMeal{State: MealSkipped, RecipeID: 3, Batches: 1}),
		dinner(3),
	}
	in := baseInput(slots, rcp(1, 2), rcp(2, 2), rcp(3, 2), rcp(4, 2))
	for _, run := range []struct {
		name string
		f    func(Input) (Result, error)
	}{{"Plan", Plan}, {"Regenerate", Regenerate}} {
		t.Run(run.name, func(t *testing.T) {
			r, err := run.f(in)
			if err != nil {
				t.Fatal(err)
			}
			if len(r.Placements) != 1 || r.Placements[0].Key != key(3) || len(r.Unfilled) != 0 || len(r.Kept) != 0 {
				t.Errorf("result = %+v", r)
			}
		})
	}
}

func TestPlanKeepsValidPlannedMealsAndRegenerateReplacesThem(t *testing.T) {
	planned := withExisting(dinner(0), ExistingMeal{State: MealPlanned, RecipeID: 3, Batches: 1})
	pinned := withExisting(dinner(1), ExistingMeal{State: MealPinned, RecipeID: 4, Batches: 1})
	in := baseInput([]Slot{planned, pinned, dinner(2)}, rcp(1, 2), rcp(2, 2), rcp(3, 2), rcp(4, 2))

	r := mustPlan(t, in)
	if !keysOf(r.Kept)[key(0)] || len(r.Kept) != 1 {
		t.Errorf("Plan Kept = %v", r.Kept)
	}
	for _, p := range r.Placements {
		if p.Key == key(0) || p.Key == key(1) {
			t.Errorf("Plan must not place into %+v", p.Key)
		}
	}
	placementAt(t, r, key(2))

	g, err := Regenerate(in)
	if err != nil {
		t.Fatal(err)
	}
	if len(g.Kept) != 0 {
		t.Errorf("Regenerate keeps nothing: %v", g.Kept)
	}
	if p := placementAt(t, g, key(0)); p.RecipeID != 1 { // zero weights: lowest id
		t.Errorf("Regenerate day 0 = %+v", p)
	}
	for _, p := range g.Placements {
		if p.Key == key(1) {
			t.Errorf("Regenerate must not touch the Pinned meal")
		}
	}
}

func TestPlanDropsInvalidPlannedMeals(t *testing.T) {
	tests := []struct {
		name   string
		recipe []Recipe
		meal   ExistingMeal
		att    []Attendee
		prefs  map[MemberID]Preferences
	}{
		{name: "Recipe was archived", recipe: []Recipe{rcp(1, 2), rcp(3, 2, archived())}, meal: ExistingMeal{State: MealPlanned, RecipeID: 3, Batches: 1}},
		{
			name: "a Member attending now has an Exclusion on it", recipe: []Recipe{rcp(1, 2), rcp(3, 2)},
			meal: ExistingMeal{State: MealPlanned, RecipeID: 3, Batches: 1}, prefs: map[MemberID]Preferences{ben: {ExcludedRecipes: []RecipeID{3}}},
		},
		// "Attendance grew: not enough Batches" moved to batchesfollow_test.go (B5-SD, ADR 0014 point 6): the meal now
		// keeps its Recipe and gets more Batches instead of being replanned.
		{name: "Recipe no longer exists", recipe: []Recipe{rcp(1, 2)}, meal: ExistingMeal{State: MealPlanned, RecipeID: 3, Batches: 1}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := tt.meal
			in := baseInput([]Slot{withExisting(dinner(0, tt.att...), m)}, tt.recipe...)
			in.Members = tt.prefs
			r := mustPlan(t, in)
			if len(r.Kept) != 0 {
				t.Errorf("Kept = %v", r.Kept)
			}
			if p := placementAt(t, r, key(0)); p.RecipeID != 1 {
				t.Errorf("replanned as %+v", p)
			}
		})
	}
	t.Run("a Planned meal with enough Batches for the attendance is kept", func(t *testing.T) {
		in := baseInput([]Slot{withExisting(dinner(0, attendees(1, 1, 1)...), ExistingMeal{State: MealPlanned, RecipeID: 3, Batches: 2})}, rcp(1, 2), rcp(3, 2))
		if r := mustPlan(t, in); len(r.Kept) != 1 {
			t.Errorf("Kept = %v", r.Kept)
		}
	})
}

// §8: how actual Leftovers (and skipped meals) affect replanning.
func TestActualLeftoversAndReplanning(t *testing.T) {
	leftoverMeal := func(n int, st MealState, src LeftoverSource) Slot {
		return withExisting(dinner(n), ExistingMeal{State: st, RecipeID: 2, From: &src})
	}
	recipes := []Recipe{rcp(1, 2), rcp(2, 4)}

	t.Run("actual Leftover smaller than planned: the Leftover meal is replanned", func(t *testing.T) {
		in := baseInput([]Slot{leftoverMeal(1, MealPlanned, LeftoverSource{LeftoverID: 7})}, recipes...)
		in.Leftovers = []Leftover{leftoverOf(7, 2, 1, day(3))} // only 1 portion left, the slot needs 2
		r := mustPlan(t, in)
		if p := placementAt(t, r, key(1)); p.Source != SourceRecipe {
			t.Errorf("got %+v", p)
		}
	})
	t.Run("actual Leftover larger than planned: the extra becomes pending", func(t *testing.T) {
		in := baseInput([]Slot{leftoverMeal(0, MealPlanned, LeftoverSource{LeftoverID: 7}), dinner(1), dinner(2)}, recipes...)
		in.Leftovers = []Leftover{leftoverOf(7, 2, 6, day(5))}
		r := mustPlan(t, in)
		if !keysOf(r.Kept)[key(0)] {
			t.Errorf("day 0 should be kept: %v", r.Kept)
		}
		for _, d := range []int{1, 2} {
			if p := placementAt(t, r, key(d)); p.From == nil || p.From.LeftoverID != 7 {
				t.Errorf("day %d should be served from Leftover 7: %+v", d, p)
			}
		}
	})
	t.Run("a kept Leftover meal uses up its share before later slots", func(t *testing.T) {
		in := baseInput([]Slot{leftoverMeal(0, MealPlanned, LeftoverSource{LeftoverID: 7}), dinner(1), dinner(2)}, recipes...)
		in.Leftovers = []Leftover{leftoverOf(7, 2, 4, day(5))}
		r := mustPlan(t, in)
		if p := placementAt(t, r, key(1)); p.From == nil || p.From.LeftoverID != 7 {
			t.Errorf("day 1: %+v", p)
		}
		if p := placementAt(t, r, key(2)); p.Source != SourceRecipe {
			t.Errorf("day 2: %+v", p)
		}
	})
	t.Run("source meal marked Not cooked (skipped): dependants are replanned", func(t *testing.T) {
		src := withExisting(dinner(0), ExistingMeal{State: MealSkipped, RecipeID: 2, Batches: 1})
		in := baseInput([]Slot{src, leftoverMeal(1, MealPlanned, LeftoverSource{FromSlot: key(0)})}, recipes...)
		r := mustPlan(t, in)
		if p := placementAt(t, r, key(1)); p.Source != SourceRecipe {
			t.Errorf("got %+v", p)
		}
	})
	t.Run("source meal still planned: the dependant Leftover meal is kept", func(t *testing.T) {
		src := withExisting(dinner(0), ExistingMeal{State: MealPinned, RecipeID: 2, Batches: 1})
		in := baseInput([]Slot{src, leftoverMeal(1, MealPlanned, LeftoverSource{FromSlot: key(0)}), dinner(2)}, recipes...)
		r := mustPlan(t, in)
		if !keysOf(r.Kept)[key(1)] {
			t.Errorf("Kept = %v", r.Kept)
		}
		if p := placementAt(t, r, key(2)); p.Source != SourceRecipe {
			t.Errorf("Pinned Batch had only 2 spare portions and day 1 took them: %+v", p)
		}
	})
	t.Run("a Pinned Leftover meal is never replanned, even if its source is gone", func(t *testing.T) {
		in := baseInput([]Slot{leftoverMeal(0, MealPinned, LeftoverSource{LeftoverID: 99})}, recipes...)
		r := mustPlan(t, in)
		if len(r.Placements)+len(r.Unfilled)+len(r.Kept) != 0 {
			t.Errorf("result = %+v", r)
		}
	})
	t.Run("a Cooked meal's actual Leftover is what gets planned, not the proposed one", func(t *testing.T) {
		cooked := withExisting(dinner(0), ExistingMeal{State: MealCooked, RecipeID: 2, Batches: 1})
		in := baseInput([]Slot{cooked, dinner(1)}, recipes...)
		in.Leftovers = []Leftover{{ID: 7, RecipeID: 2, Portions: 2, CookedOn: day(0), UseBy: day(3)}}
		if p := placementAt(t, mustPlan(t, in), key(1)); p.From == nil || p.From.LeftoverID != 7 {
			t.Errorf("got %+v", p)
		}
	})
	t.Run("a Cooked meal with no recorded Leftover leaves none", func(t *testing.T) {
		cooked := withExisting(dinner(0), ExistingMeal{State: MealCooked, RecipeID: 2, Batches: 1}) // Yield 4, 2 portions "proposed"
		in := baseInput([]Slot{cooked, dinner(1)}, recipes...)
		if p := placementAt(t, mustPlan(t, in), key(1)); p.Source != SourceRecipe {
			t.Errorf("got %+v", p)
		}
	})
	t.Run("a Planned dependant of a Cooked source finds the actual Leftover through FromSlot", func(t *testing.T) {
		cooked := withExisting(dinner(0), ExistingMeal{State: MealCooked, RecipeID: 2, Batches: 1})
		dep := leftoverMeal(1, MealPlanned, LeftoverSource{FromSlot: key(0)})
		in := noCooldown(baseInput([]Slot{cooked, dep}, recipes...))
		in.Leftovers = []Leftover{{ID: 7, RecipeID: 2, Portions: 2, CookedOn: day(0), UseBy: day(3), FromSlot: key(0)}}
		r := mustPlan(t, in)
		if !keysOf(r.Kept)[key(1)] || len(r.Placements) != 0 {
			t.Errorf("the dependant should be kept, not replanned: %+v", r)
		}
	})
	t.Run("a Pinned dependant of a Cooked source consumes the actual Leftover once", func(t *testing.T) {
		cooked := withExisting(dinner(0), ExistingMeal{State: MealCooked, RecipeID: 2, Batches: 1})
		dep := leftoverMeal(1, MealPinned, LeftoverSource{FromSlot: key(0)})
		in := noCooldown(baseInput([]Slot{cooked, dep, dinner(2)}, recipes...))
		in.Leftovers = []Leftover{{ID: 7, RecipeID: 2, Portions: 2, CookedOn: day(0), UseBy: day(3), FromSlot: key(0)}}
		r := mustPlan(t, in)
		if p := placementAt(t, r, key(2)); p.Source != SourceRecipe {
			t.Errorf("Leftover 7 is already served on day 1, day 2 must cook fresh: %+v", p)
		}
	})
	t.Run("a Planned dependant is invalid when its source slot is replanned with a different Recipe", func(t *testing.T) {
		// Day 0 (anna and ben) is a Planned Recipe 2 meal that ben now excludes, so it is replanned as Recipe 1.
		// Day 1 (anna only) was planned to eat Recipe 2 from it.
		src := withExisting(dinner(0), ExistingMeal{State: MealPlanned, RecipeID: 2, Batches: 1})
		dep := withExisting(dinner(1, Attendee{anna, 1}), ExistingMeal{State: MealPlanned, RecipeID: 2, From: &LeftoverSource{FromSlot: key(0)}})
		in := baseInput([]Slot{src, dep}, rcp(1, 4), rcp(2, 4))
		in = prefs(in, ben, Preferences{ExcludedRecipes: []RecipeID{2}})
		r := mustPlan(t, in)
		if keysOf(r.Kept)[key(1)] {
			t.Errorf("the Recipe 2 dependant must not be kept: %v", r.Kept)
		}
		if p := placementAt(t, r, key(1)); p.RecipeID == 2 {
			t.Errorf("day 1 = %+v, must not be Recipe 2", p)
		}
	})
	t.Run("a Pinned fresh meal's extra portions is a pending Leftover", func(t *testing.T) {
		pinned := withExisting(dinner(0), ExistingMeal{State: MealPinned, RecipeID: 2, Batches: 1})
		in := baseInput([]Slot{pinned, dinner(1)}, recipes...)
		p := placementAt(t, mustPlan(t, in), key(1))
		if p.From == nil || p.From.LeftoverID != 0 || p.From.FromSlot != key(0) {
			t.Errorf("got %+v", p)
		}
	})
}

func TestPlanOrdersAndValidates(t *testing.T) {
	t.Run("placements are chronological whatever the input order", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{dinner(2), dinner(0), lunch(1), dinner(1)}, rcp(1, 2), rcp(2, 2)))
		r := mustPlan(t, in)
		want := []SlotKey{key(0), {Date: day(1), MealSlotID: lunchSlot}, key(1), key(2)}
		var got []SlotKey
		for _, p := range r.Placements {
			got = append(got, p.Key)
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("order = %v, want %v", got, want)
		}
	})
	t.Run("duplicate slot keys are rejected", func(t *testing.T) {
		_, err := Plan(baseInput([]Slot{dinner(0), dinner(0)}, rcp(1, 2)))
		if !errors.Is(err, ErrDuplicateSlot) {
			t.Errorf("err = %v", err)
		}
	})
	t.Run("an empty horizon is fine", func(t *testing.T) {
		r := mustPlan(t, baseInput(nil, rcp(1, 2)))
		if len(r.Placements)+len(r.Unfilled) != 0 {
			t.Errorf("result = %+v", r)
		}
	})
	t.Run("Recipes with a non-positive Yield are ignored", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0)}, rcp(1, 0), rcp(2, 2))
		if p := placementAt(t, mustPlan(t, in), key(0)); p.RecipeID != 2 {
			t.Errorf("got %+v", p)
		}
	})
}

func manyRecipes(n int) []Recipe {
	var rs []Recipe
	for i := 1; i <= n; i++ {
		rs = append(rs, rcp(RecipeID(i), 2))
	}
	return rs
}

func weekInput(seed int64) Input {
	var slots []Slot
	for d := 0; d < 7; d++ {
		slots = append(slots, dinner(d))
	}
	in := baseInput(slots, manyRecipes(14)...)
	in.Weights = nil // use Planner Style, jitter active
	in.Seed = seed
	return in
}

func TestDeterminismAndRegenerateVariation(t *testing.T) {
	t.Run("same input and seed: identical Result, input untouched", func(t *testing.T) {
		in, pristine := weekInput(5), weekInput(5)
		a, b := mustPlan(t, in), mustPlan(t, in)
		if !equalResults(a, b) {
			t.Error("Plan is not deterministic")
		}
		g1, _ := Regenerate(in)
		g2, _ := Regenerate(in)
		if !equalResults(g1, g2) {
			t.Error("Regenerate is not deterministic")
		}
		if !reflect.DeepEqual(in, pristine) {
			t.Error("Plan or Regenerate modified the Input")
		}
	})
	t.Run("a new seed gives a genuinely different plan", func(t *testing.T) {
		seen := map[string]bool{}
		for seed := int64(1); seed <= 10; seed++ {
			g, err := Regenerate(weekInput(seed))
			if err != nil {
				t.Fatal(err)
			}
			seen[planSignature(g)] = true
		}
		if len(seen) < 5 {
			t.Errorf("only %d distinct plans over 10 seeds", len(seen))
		}
	})
	t.Run("Regenerate ignores what was planned before", func(t *testing.T) {
		first := mustPlan(t, weekInput(1))
		in := weekInput(2)
		for i, p := range first.Placements {
			in.Slots[i] = withExisting(in.Slots[i], ExistingMeal{State: MealPlanned, RecipeID: p.RecipeID, Batches: float64(p.Batches)})
		}
		fresh, _ := Regenerate(weekInput(2))
		again, _ := Regenerate(in)
		if planSignature(fresh) != planSignature(again) {
			t.Errorf("Regenerate depends on the previous plan: %s vs %s", planSignature(fresh), planSignature(again))
		}
	})
}

func TestPlannerStyleMovesTheChoice(t *testing.T) {
	// Recipe 1 uses chicken that goes off tomorrow (perishable use); Recipe 2 is Anna's Favourite.
	// Use what we have: Recipe 1 = 6 (perishable) + 2 (coverage) = 8 vs Recipe 2 = 2 (Favourite).
	// Favourites: Recipe 1 = 2 + 0.5 = 2.5 vs Recipe 2 = 5 (jitter at most 0.5).
	build := func(style float64) Input {
		in := baseInput([]Slot{dinner(0)}, rcp(1, 2, needs(need(chicken, 500))), rcp(2, 2))
		in.Weights, in.Style = nil, style
		in = prefs(in, anna, Preferences{Favourites: []RecipeID{2}})
		in.Lots = []StockLot{lot(1, chicken, 500, day(1))}
		return in
	}
	if p := placementAt(t, mustPlan(t, build(0)), key(0)); p.RecipeID != 1 {
		t.Errorf("Use what we have chose %d", p.RecipeID)
	}
	if p := placementAt(t, mustPlan(t, build(1)), key(0)); p.RecipeID != 2 {
		t.Errorf("Favourites chose %d", p.RecipeID)
	}
}
