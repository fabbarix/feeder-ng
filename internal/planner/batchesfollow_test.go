package planner

import "testing"

// Batches follow portions (ADR 0014 point 6; beta5-plan 2.2). An unresolved fresh Planned Meal, unpinned or Pinned,
// whose Batches no longer cover its cell's portions keeps its Recipe and gets Batches = ceil(portions / Yield). Fewer
// portions never lower Batches. Team B5-SD, test-first.

func raisedAt(r Result, k SlotKey) (BatchRaise, bool) {
	for _, b := range r.Raised {
		if b.Key == k {
			return b, true
		}
	}
	return BatchRaise{}, false
}

func TestAnUnpinnedMealWhoseBatchesNoLongerCoverIsKeptAndRaised(t *testing.T) {
	// Moved from TestPlanDropsInvalidPlannedMeals: three Members eat now, the meal has 1 Batch of yield 2.
	meal := ExistingMeal{State: MealPlanned, RecipeID: 3, Batches: 1}
	in := baseInput([]Slot{withExisting(dinner(0, attendees(1, 1, 1)...), meal)}, rcp(1, 2), rcp(3, 2))
	r := mustPlan(t, in)
	if !isKept(r, key(0)) {
		t.Fatalf("Kept = %v, want the meal kept with its Recipe", r.Kept)
	}
	if _, ok := placedAt(r, key(0)); ok {
		t.Error("the meal was replanned instead of getting more Batches")
	}
	b, ok := raisedAt(r, key(0))
	if !ok || b.Batches != 2 || !approx(b.Portions, 3) {
		t.Errorf("Raised = %+v, want 2 Batches for 3 portions", r.Raised)
	}
	if !approx(r.KeptPortions[key(0)], 3) {
		t.Errorf("KeptPortions = %v, want 3", r.KeptPortions)
	}
}

func TestGuestsRaiseTheBatchesOfAKeptMeal(t *testing.T) {
	meal := ExistingMeal{State: MealPlanned, RecipeID: 3, Batches: 1}
	in := baseInput([]Slot{mainCell(0, withGuests(4), holding(meal))}, rcp(1, 2, courses(mainC)), rcp(3, 2, courses(mainC)))
	r := mustPlan(t, in)
	b, ok := raisedAt(r, ck(0, mainC))
	if !isKept(r, ck(0, mainC)) || !ok || b.Batches != 3 || !approx(b.Portions, 6) {
		t.Errorf("Kept = %v, Raised = %+v; want kept and 3 Batches for 6 portions (2 Members + 4 Guests)", r.Kept, r.Raised)
	}
}

func TestGuestsRaiseTheBatchesOfAPinnedMealAndItStaysPinned(t *testing.T) {
	meal := ExistingMeal{State: MealPinned, RecipeID: 3, Batches: 1}
	in := baseInput([]Slot{mainCell(0, withGuests(2), holding(meal))}, rcp(1, 2, courses(mainC)), rcp(3, 2, courses(mainC)))
	r := mustPlan(t, in)
	b, ok := raisedAt(r, ck(0, mainC))
	if !ok || b.Batches != 2 || !approx(b.Portions, 4) {
		t.Errorf("Raised = %+v, want the Pinned meal at 2 Batches for 4 portions", r.Raised)
	}
	if _, placed := placedAt(r, ck(0, mainC)); placed || isKept(r, ck(0, mainC)) {
		t.Error("a Pinned meal is neither placed nor in Kept: it is only raised")
	}
}

func TestARaisedPinnedMealUsesTheStockOfTheExtraBatches(t *testing.T) {
	meal := ExistingMeal{State: MealPinned, RecipeID: 3, Batches: 1}
	in := baseInput([]Slot{mainCell(0, withGuests(2), holding(meal))}, rcp(3, 2, courses(mainC), needs(need(chicken, 400))))
	r := mustPlan(t, in)
	if len(r.Purchases) != 1 || !approx(r.Purchases[0].Shortfall, 800) {
		t.Errorf("Purchases = %+v, want 800 g of chicken for the 2 Batches", r.Purchases)
	}
}

func TestFewerPortionsNeverLowerBatches(t *testing.T) {
	// 3 Batches of yield 2 stored; the cell now needs 2 portions. The extra is Leftover, as today.
	for _, state := range []MealState{MealPlanned, MealPinned} {
		meal := ExistingMeal{State: state, RecipeID: 3, Batches: 3}
		in := baseInput([]Slot{mainCell(0, holding(meal))}, rcp(1, 2, courses(mainC)), rcp(3, 2, courses(mainC)))
		r := mustPlan(t, in)
		if len(r.Raised) != 0 {
			t.Errorf("state %v: Raised = %+v, want nothing: 3 Batches already cover 2 portions", state, r.Raised)
		}
		if state == MealPlanned && !isKept(r, ck(0, mainC)) {
			t.Errorf("Kept = %v, want the meal kept", r.Kept)
		}
	}
}

func TestABatchCountThatStillCoversIsNotRaised(t *testing.T) {
	meal := ExistingMeal{State: MealPlanned, RecipeID: 3, Batches: 2}
	in := baseInput([]Slot{withExisting(dinner(0, attendees(1, 1, 1)...), meal)}, rcp(1, 2), rcp(3, 2))
	if r := mustPlan(t, in); len(r.Raised) != 0 || !isKept(r, key(0)) {
		t.Errorf("Raised = %+v, Kept = %v; want kept, nothing raised", r.Raised, r.Kept)
	}
}

func TestACookedOrNotCookedMealIsNeverRaised(t *testing.T) {
	for _, m := range []ExistingMeal{cookedMeal(3), skippedMeal(3)} {
		in := baseInput([]Slot{mainCell(0, withGuests(5), holding(m))}, rcp(3, 2, courses(mainC)))
		if r := mustPlan(t, in); len(r.Raised) != 0 {
			t.Errorf("state %v: Raised = %+v, want none", m.State, r.Raised)
		}
	}
}

func TestAMealWithAnExcludedRecipeIsStillReplannedNotRaised(t *testing.T) {
	meal := ExistingMeal{State: MealPlanned, RecipeID: 3, Batches: 1}
	in := prefs(baseInput([]Slot{mainCell(0, withGuests(2), holding(meal))}, rcp(1, 2, courses(mainC)), rcp(3, 2, courses(mainC))),
		ben, Preferences{ExcludedRecipes: []RecipeID{3}})
	r := mustPlan(t, in)
	wantPlaced(t, r, ck(0, mainC), 1)
	if len(r.Raised) != 0 || isKept(r, ck(0, mainC)) {
		t.Errorf("Kept = %v, Raised = %+v; the hard rules still replan an excluded Recipe", r.Kept, r.Raised)
	}
}

func TestARaisedMealMakesTheBiggerLeftover(t *testing.T) {
	// 4 portions needed, a yield-3 Recipe: 1 Batch becomes 2 Batches = 6 portions, 2 over. The Leftover is pending, so a
	// later slot can be served from it.
	meal := ExistingMeal{State: MealPlanned, RecipeID: 3, Batches: 1}
	in := baseInput([]Slot{mainCell(0, withGuests(2), holding(meal)), mainCell(1, eats(Attendee{anna, 1}, Attendee{ben, 1}))},
		rcp(3, 3, courses(mainC)), rcp(4, 2, courses(mainC)))
	r := mustPlan(t, in)
	if b, ok := raisedAt(r, ck(0, mainC)); !ok || b.Batches != 2 {
		t.Fatalf("Raised = %+v, want 2 Batches", r.Raised)
	}
	if p := wantPlaced(t, r, ck(1, mainC), 3); p.Source != SourceLeftover {
		t.Errorf("next day = %+v, want served from the raised meal's Leftover of 2", p)
	}
}
