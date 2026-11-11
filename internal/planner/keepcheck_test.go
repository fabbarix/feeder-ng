package planner

import "testing"

// The keep check (spec 7.2 step 2b, ADR 0009 point 4): on every Plan (not Regenerate) every unpinned fresh Planned
// Meal the planner would keep is checked against the Cool-down, recency and Variety history, with its own cook
// left out, before the walk, in walk order.

func TestKeepCheckReplacesARelaxedPickWhenAStrictCandidateAppears(t *testing.T) {
	// Recipe 1 was a relaxed pick on day 0 (cooked yesterday); the Household has since added Recipe 2.
	slots := []Slot{withExisting(dinner(0), relaxedMeal(1))}
	in := baseInput(slots, rcp(1, 2), rcp(2, 2))
	in.LastPlanned = map[RecipeID]Date{1: day(-1)}
	r := mustPlan(t, in)
	if isKept(r, key(0)) {
		t.Fatalf("Kept = %v, the relaxed pick must be replaced", r.Kept)
	}
	if p := placementAt(t, r, key(0)); p.RecipeID != 2 || p.Relaxed {
		t.Errorf("replacement = %+v, want a strict Recipe 2", p)
	}
}

func TestKeepCheckKeepsARelaxedPickWhenNothingBetterExists(t *testing.T) {
	build := func(seed int64) Input {
		in := baseInput([]Slot{withExisting(dinner(0), relaxedMeal(1))}, rcp(1, 2))
		in.LastPlanned = map[RecipeID]Date{1: day(-1)}
		in.Weights, in.Seed = nil, seed // jitter on: the seed differs between plans
		return in
	}
	for _, seed := range []int64{1, 2, 77} {
		r := mustPlan(t, build(seed))
		if !isKept(r, key(0)) || len(r.Placements) != 0 {
			t.Fatalf("seed %d: result = %+v, want the relaxed pick kept (no churn)", seed, r)
		}
		c := recheckAt(t, r, key(0))
		if !c.Relaxed || c.Why == nil || c.Why.Code != ReasonCooldownRelaxed || c.Why.Date != day(-1) || c.Why.RecipeID != 1 {
			t.Errorf("seed %d: recheck = %+v %+v", seed, c, c.Why)
		}
	}
}

func TestKeepCheckLeavesOutTheMealsOwnCook(t *testing.T) {
	t.Run("a kept strict pick is not inside its own Cool-down", func(t *testing.T) {
		in := baseInput([]Slot{withExisting(dinner(0), plannedMeal(1))}, rcp(1, 2), rcp(2, 2))
		r := mustPlan(t, in)
		if !isKept(r, key(0)) || len(r.Placements) != 0 {
			t.Fatalf("result = %+v, want Recipe 1 kept", r)
		}
		if c := recheckAt(t, r, key(0)); c.Relaxed || c.Why != nil {
			t.Errorf("recheck = %+v, want strict", c)
		}
	})
	t.Run("and does not count twice towards its own Variety Rule", func(t *testing.T) {
		in := baseInput([]Slot{withExisting(dinner(0), plannedMeal(1))}, rcp(1, 2, tags("fish")), rcp(2, 2))
		in.VarietyRules = []VarietyRule{{Tag: "fish", MaxPerWeek: 1}}
		r := mustPlan(t, in)
		if c := recheckAt(t, r, key(0)); !isKept(r, key(0)) || c.Relaxed {
			t.Errorf("result = %+v, want the fish meal kept and strict", r)
		}
	})
	t.Run("nor next to itself on consecutive days", func(t *testing.T) {
		in := baseInput([]Slot{withExisting(dinner(0), plannedMeal(1))}, rcp(1, 2, tags("fish")), rcp(2, 2))
		in.VarietyRules = []VarietyRule{{Tag: "fish", NotConsecutiveDays: true}}
		r := mustPlan(t, in)
		if c := recheckAt(t, r, key(0)); !isKept(r, key(0)) || c.Relaxed {
			t.Errorf("result = %+v", r)
		}
	})
}

func TestKeepCheckClearsTheFlagOfAPickThatNowKeepsEveryRule(t *testing.T) {
	// Recipe 1 was relaxed when planned; its Cool-down cook is long gone.
	in := baseInput([]Slot{withExisting(dinner(0), relaxedMeal(1))}, rcp(1, 2))
	in.LastPlanned = map[RecipeID]Date{1: day(-20)}
	r := mustPlan(t, in)
	c := recheckAt(t, r, key(0))
	if !isKept(r, key(0)) || c.Relaxed || c.Why != nil {
		t.Errorf("result = %+v, recheck = %+v; want kept, not relaxed, no chip", r, c)
	}
}

func TestKeepCheckChecksEveryKeptFreshMealNotOnlyRelaxedOnes(t *testing.T) {
	t.Run("a new Pinned meal of the same Recipe puts a kept strict pick inside its Cool-down: replaced when a strict candidate exists", func(t *testing.T) {
		slots := []Slot{withExisting(dinner(0), plannedMeal(1)), withExisting(dinner(3), pinnedMeal(1))}
		r := mustPlan(t, baseInput(slots, rcp(1, 2), rcp(2, 2)))
		if isKept(r, key(0)) {
			t.Fatalf("Kept = %v, want the day 0 meal replaced", r.Kept)
		}
		if p := placementAt(t, r, key(0)); p.RecipeID != 2 || p.Relaxed {
			t.Errorf("replacement = %+v", p)
		}
	})
	t.Run("otherwise it is kept, relaxed, with the chip naming the Pinned date", func(t *testing.T) {
		slots := []Slot{withExisting(dinner(0), plannedMeal(1)), withExisting(dinner(3), pinnedMeal(1))}
		r := mustPlan(t, baseInput(slots, rcp(1, 2)))
		if !isKept(r, key(0)) {
			t.Fatalf("Kept = %v", r.Kept)
		}
		c := recheckAt(t, r, key(0))
		if !c.Relaxed || c.Why == nil || c.Why.Code != ReasonCooldownRelaxed || c.Why.Date != day(3) {
			t.Errorf("recheck = %+v %+v, want cooldown_relaxed naming %s", c, c.Why, day(3))
		}
	})
	t.Run("the same for a Variety Rule: a new Pinned fish meal makes a kept one the 2nd this week", func(t *testing.T) {
		pinned := withExisting(dinner(2), pinnedMeal(9))
		build := func(extra ...Recipe) Input {
			in := baseInput([]Slot{withExisting(dinner(0), plannedMeal(1)), pinned}, append([]Recipe{rcp(1, 2, tags("fish")), rcp(9, 2, tags("fish"), archived())}, extra...)...)
			in.VarietyRules = []VarietyRule{{Tag: "fish", MaxPerWeek: 1}}
			return in
		}
		r := mustPlan(t, build(rcp(2, 2)))
		if isKept(r, key(0)) || placementAt(t, r, key(0)).RecipeID != 2 {
			t.Errorf("with a strict candidate: %+v", r)
		}
		r = mustPlan(t, build())
		c := recheckAt(t, r, key(0))
		if !isKept(r, key(0)) || !c.Relaxed || c.Why == nil || c.Why.Code != ReasonVarietyRelaxed || c.Why.Tag != "fish" || c.Why.Value != 2 {
			t.Errorf("without one: kept=%v recheck=%+v %+v", isKept(r, key(0)), c, c.Why)
		}
	})
}

func TestKeepCheckDroppedMealLeavesTheHistoryBeforeTheNextIsChecked(t *testing.T) {
	// Two kept meals of Recipe 1, two days apart, Cool-down 7. Recipe 2 is a strict candidate for the first.
	slots := []Slot{withExisting(dinner(0), plannedMeal(1)), withExisting(dinner(2), plannedMeal(1))}
	r := mustPlan(t, baseInput(slots, rcp(1, 2), rcp(2, 2)))
	if isKept(r, key(0)) {
		t.Errorf("the first, in walk order, must be dropped: Kept = %v", r.Kept)
	}
	if p := placementAt(t, r, key(0)); p.RecipeID != 2 {
		t.Errorf("first = %+v, want the strict Recipe 2", p)
	}
	if !isKept(r, key(2)) {
		t.Fatalf("the second is then checked without it and stays: Kept = %v", r.Kept)
	}
	if c := recheckAt(t, r, key(2)); c.Relaxed {
		t.Errorf("second recheck = %+v, want strict", c)
	}
}

func TestKeepCheckDoesNotRunForRegeneratePinnedOrLeftoverMeals(t *testing.T) {
	t.Run("Regenerate redoes every unpinned meal anyway", func(t *testing.T) {
		in := baseInput([]Slot{withExisting(dinner(0), relaxedMeal(1))}, rcp(1, 2))
		in.LastPlanned = map[RecipeID]Date{1: day(-1)}
		r, err := Regenerate(in)
		if err != nil || len(r.Rechecks) != 0 || len(r.Kept) != 0 {
			t.Errorf("result = %+v, %v", r, err)
		}
	})
	t.Run("a Pinned meal is never rechecked, never relaxed", func(t *testing.T) {
		slots := []Slot{withExisting(dinner(0), pinnedMeal(1)), withExisting(dinner(2), pinnedMeal(1))}
		if r := mustPlan(t, baseInput(slots, rcp(1, 2))); len(r.Rechecks) != 0 {
			t.Errorf("Rechecks = %+v", r.Rechecks)
		}
	})
	t.Run("a kept meal served from a Leftover is not a fresh cook", func(t *testing.T) {
		src := withExisting(dinner(0), pinnedMeal(2))
		dep := withExisting(dinner(1), ExistingMeal{State: MealPlanned, RecipeID: 2, From: &LeftoverSource{FromSlot: key(0)}})
		r := mustPlan(t, baseInput([]Slot{src, dep}, rcp(1, 2), rcp(2, 4)))
		if !isKept(r, key(1)) {
			t.Fatalf("Kept = %v", r.Kept)
		}
		for _, c := range r.Rechecks {
			if c.Key == key(1) {
				t.Errorf("Recheck for a Leftover meal: %+v", c)
			}
		}
	})
}

func TestKeepCheckRecordsEveryKeptFreshMeal(t *testing.T) {
	slots := []Slot{withExisting(dinner(0), plannedMeal(1)), withExisting(dinner(1), plannedMeal(2)), withExisting(dinner(2), pinnedMeal(3))}
	r := mustPlan(t, baseInput(slots, rcp(1, 2), rcp(2, 2), rcp(3, 2)))
	if len(r.Kept) != 2 || len(r.Rechecks) != 2 {
		t.Errorf("Kept %v Rechecks %+v, want one Recheck for each of the two kept meals", r.Kept, r.Rechecks)
	}
}
