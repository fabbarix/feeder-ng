package planner

import (
	"reflect"
	"testing"
)

// B5-BO: a Bought Planned Meal is held (ADR 0013; docs/dev/design/b5-bo.md §5). ExistingMeal.Held makes every Plan
// leave the cell as it is, like a Pinned one; only Regenerate (and Swap) replaces it. Its relaxed flag and chip are
// still recomputed, so the chip stays true; the keep check and the Slot Rule reservations pass over it; it is a
// Kept cell (never in Placements) so Reconcile writes its recheck and raised Batches in place.

func heldMeal(r RecipeID) ExistingMeal {
	m := plannedMeal(r)
	m.Held = true
	return m
}

func heldRelaxed(r RecipeID) ExistingMeal {
	m := heldMeal(r)
	m.Relaxed = true
	return m
}

// asPinned is the same cell with the meal Pinned instead of held.
func asPinned(in Input) Input {
	out := in
	out.Slots = append([]Slot(nil), in.Slots...)
	for i, s := range out.Slots {
		if s.Existing != nil && s.Existing.Held {
			m := *s.Existing
			m.Held, m.State = false, MealPinned
			out.Slots[i].Existing = &m
		}
	}
	return out
}

// asUnheld is the same cell with an ordinary unpinned Planned Meal.
func asUnheld(in Input) Input {
	out := in
	out.Slots = append([]Slot(nil), in.Slots...)
	for i, s := range out.Slots {
		if s.Existing != nil && s.Existing.Held {
			m := *s.Existing
			m.Held = false
			out.Slots[i].Existing = &m
		}
	}
	return out
}

// wantHeld asserts the cell is left where it is: Kept, never placed, no Couldn't plan reason, no Not served cause.
func wantHeld(t *testing.T, r Result, k SlotKey) {
	t.Helper()
	if !isKept(r, k) {
		t.Errorf("cell %+v is not Kept: Kept %v, placements %+v, unfilled %+v", k, r.Kept, r.Placements, r.Unfilled)
	}
	if p, ok := placedAt(r, k); ok {
		t.Errorf("cell %+v was replaced: %+v", k, p)
	}
	if isUnfilled(r, k) {
		t.Errorf("cell %+v has a Couldn't plan reason", k)
	}
	if c, ok := notServedAt(r, k); ok {
		t.Errorf("cell %+v is Not served (%q)", k, c)
	}
}

// wantReplaced asserts the control (the same meal not held) was replanned.
func wantReplaced(t *testing.T, r Result, k SlotKey) {
	t.Helper()
	if _, ok := placedAt(r, k); !ok {
		t.Errorf("control: cell %+v was not replaced (the set-up must make an unheld meal invalid): Kept %v", k, r.Kept)
	}
}

func TestAHeldMealIsLeftAloneWhateverMakesAnUnheldOneInvalid(t *testing.T) {
	cases := []struct {
		name  string
		build func() Input
	}{
		{"its Recipe was archived", func() Input {
			return baseInput([]Slot{withExisting(dinner(0), heldMeal(1))}, rcp(1, 2, archived()), rcp(2, 2), rcp(3, 2))
		}},
		{"a Member now excludes the Recipe", func() Input {
			return prefs(baseInput([]Slot{withExisting(dinner(0), heldMeal(1))}, rcp(1, 2), rcp(2, 2)), ben, Preferences{ExcludedRecipes: []RecipeID{1}})
		}},
		{"a Member now excludes one of its Ingredients", func() Input {
			return prefs(baseInput([]Slot{withExisting(dinner(0), heldMeal(1))}, rcp(1, 2, needs(need(garlic, 5))), rcp(2, 2)), anna, Preferences{ExcludedIngredients: []IngredientID{garlic}})
		}},
		{"the Recipe lost the cell's Course", func() Input {
			return baseInput([]Slot{mainCell(0, holding(heldMeal(1)))}, rcp(1, 2, courses(sideC)), rcp(2, 2, courses(mainC)))
		}},
		{"a strict Recipe appeared for a relaxed pick (new Recipes)", func() Input {
			in := baseInput([]Slot{withExisting(dinner(0), heldRelaxed(1))}, rcp(1, 2), rcp(2, 2))
			in.LastPlanned = map[RecipeID]Date{1: day(-1)}
			return in
		}},
		{"a Variety Rule it now breaks (Slot or Variety Rules changed)", func() Input {
			in := baseInput([]Slot{withExisting(dinner(0), heldMeal(1)), dinner(1)}, rcp(1, 2, tags("fish")), rcp(2, 2), rcp(3, 2, tags("fish")))
			in.VarietyRules = []VarietyRule{{Tag: "fish", NotConsecutiveDays: true}}
			in.LastPlanned = map[RecipeID]Date{3: day(-1)}
			return in
		}},
		{"its Cool-down now overlaps a cook that was planned before (nightly plan)", func() Input {
			in := baseInput([]Slot{withExisting(dinner(0), heldMeal(1))}, rcp(1, 2), rcp(2, 2))
			in.LastPlanned = map[RecipeID]Date{1: day(-2)}
			return in
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			in := c.build()
			k := in.Slots[0].Key // a Course cell is keyed by its Course
			wantHeld(t, mustPlan(t, in), k)
			wantReplaced(t, mustPlan(t, asUnheld(in)), k)
		})
	}
}

func TestAHeldMealKeepsItsRecipeWhenNobodyEatsItsCourse(t *testing.T) {
	// Attendance falls to nobody for that Course on the date: the cell is not served; a held meal is kept and shown
	// like a Pinned one (ADR 0013 point 6, step 0b). An unheld Planned Meal in the same cell is removed.
	in := baseInput([]Slot{mainCell(0, optedOut(), holding(heldMeal(1)))}, rcp(1, 2, courses(mainC)))
	wantHeld(t, mustPlan(t, in), ck(0, mainC))
	r := mustPlan(t, asUnheld(in))
	if _, ok := notServedAt(r, ck(0, mainC)); !ok {
		t.Errorf("control: an unheld meal in a Course nobody eats must be Not served: %+v", r)
	}
}

func TestAHeldMealIsReplacedByRegenerateAndOnlyByIt(t *testing.T) {
	in := baseInput([]Slot{withExisting(dinner(0), heldMeal(1)), dinner(1)}, rcp(1, 2), rcp(2, 2), rcp(3, 2))
	r, err := Regenerate(in)
	if err != nil {
		t.Fatal(err)
	}
	if isKept(r, key(0)) {
		t.Errorf("Regenerate kept the held meal: Kept %v", r.Kept)
	}
	if _, ok := placedAt(r, key(0)); !ok {
		t.Errorf("Regenerate did not redo the held cell: placements %+v unfilled %+v", r.Placements, r.Unfilled)
	}
	// A Pinned meal is never replaced, even by Regenerate (contrast: Bought is not Pinned).
	pr, _ := Regenerate(asPinned(in))
	if _, ok := placedAt(pr, key(0)); ok {
		t.Errorf("Regenerate replaced a Pinned meal: %+v", pr.Placements)
	}
	if len(r.Rechecks) != 0 {
		t.Errorf("Rechecks after Regenerate = %+v, want none", r.Rechecks)
	}
}

func TestSwapOfAHeldMealOffersAlternativesWithoutItsRecipe(t *testing.T) {
	in := baseInput([]Slot{withExisting(dinner(0), heldMeal(2)), dinner(1)}, rcp(1, 2), rcp(2, 2), rcp(3, 2), rcp(4, 2))
	got, err := Swap(in, key(0))
	if err != nil {
		t.Fatal(err)
	}
	if want := []RecipeID{1, 3, 4}; !reflect.DeepEqual(recipeIDs(got), want) {
		t.Errorf("alternatives = %v, want %v: the User can still swap a Bought meal", recipeIDs(got), want)
	}
}

func TestAHeldMealBehavesAsAPinnedOneForEveryOtherCell(t *testing.T) {
	// The held meal consumes projected Stock, leaves its Leftover and counts for Cool-down and Variety exactly as a
	// Pinned one does: the plan of the other cells is the same. Each scenario makes an unheld meal invalid (archived),
	// so the control differs.
	scenarios := map[string]func() Input{
		"Stock and planned purchases": func() Input {
			in := baseInput([]Slot{withExisting(dinner(0), heldMeal(1)), dinner(1), dinner(2)},
				rcp(1, 4, archived(), needs(need(chicken, 400))), rcp(2, 2, needs(need(chicken, 400))), rcp(3, 2, needs(need(rice, 100))), rcp(4, 2))
			in.Lots = []StockLot{lot(1, chicken, 300, "")}
			return in
		},
		"the Leftover it leaves": func() Input {
			in := weighted(baseInput([]Slot{withExisting(dinner(0), heldMeal(1)), dinner(1)},
				rcp(1, 4, archived()), rcp(2, 2), rcp(3, 2)), Weights{LeftoverFits: 3})
			return in
		},
		"Cool-down": func() Input {
			return baseInput([]Slot{withExisting(dinner(0), heldMeal(1)), dinner(1), dinner(2)}, rcp(1, 2, archived()), rcp(2, 2), rcp(3, 2), rcp(4, 2))
		},
		"Variety Rules": func() Input {
			in := baseInput([]Slot{withExisting(dinner(0), heldMeal(1)), dinner(1), dinner(2)},
				rcp(1, 2, archived(), tags("fish")), rcp(2, 2, tags("fish")), rcp(3, 2), rcp(4, 2))
			in.VarietyRules = []VarietyRule{{Tag: "fish", MaxPerWeek: 1}}
			return in
		},
		"Ingredient Overlap": func() Input {
			in := weighted(baseInput([]Slot{withExisting(dinner(0), heldMeal(1)), dinner(1)},
				rcp(1, 2, archived(), needs(need(spinach, 100))), rcp(2, 2, needs(need(spinach, 50))), rcp(3, 2, needs(need(pasta, 50)))), Weights{IngredientOverlap: 3})
			return in
		},
	}
	for name, build := range scenarios {
		t.Run(name, func(t *testing.T) {
			in := build()
			held, pinned := mustPlan(t, in), mustPlan(t, asPinned(in))
			wantHeld(t, held, in.Slots[0].Key)
			if !reflect.DeepEqual(held.Placements, pinned.Placements) || !reflect.DeepEqual(held.Unfilled, pinned.Unfilled) ||
				!reflect.DeepEqual(held.Purchases, pinned.Purchases) || !reflect.DeepEqual(held.NotServed, pinned.NotServed) {
				t.Errorf("held and Pinned plans differ:\nheld   %+v\npinned %+v", held, pinned)
			}
			if control := mustPlan(t, asUnheld(in)); reflect.DeepEqual(control.Placements, held.Placements) {
				t.Errorf("control: the unheld meal gave the same plan, so the scenario proves nothing: %+v", control.Placements)
			}
		})
	}
}

func TestAHeldMealIsRaisedWhenItsPortionsGrowAndItsRecipeStays(t *testing.T) {
	m := heldMeal(1)
	m.PlacedPortions = 2
	in := baseInput([]Slot{mainCell(0, holding(m), withGuests(4))}, rcp(1, 2, courses(mainC), archived()))
	r := mustPlan(t, in)
	wantHeld(t, r, ck(0, mainC))
	if len(r.Raised) != 1 || r.Raised[0].Key != ck(0, mainC) || r.Raised[0].Batches != 3 || !approx(r.Raised[0].Portions, 6) {
		t.Errorf("Raised = %+v, want 3 Batches for 6 portions (2 Members + 4 Guests)", r.Raised)
	}
}

func TestTheKeepCheckPassesOverAHeldMealAndRecomputesItsChip(t *testing.T) {
	t.Run("a relaxed held pick stays and keeps its chip when a strict Recipe appears", func(t *testing.T) {
		in := baseInput([]Slot{withExisting(dinner(0), heldRelaxed(1))}, rcp(1, 2), rcp(2, 2))
		in.LastPlanned = map[RecipeID]Date{1: day(-1)}
		r := mustPlan(t, in)
		wantHeld(t, r, key(0))
		c := recheckAt(t, r, key(0))
		if !c.Relaxed || c.Why == nil || c.Why.Code != ReasonCooldownRelaxed || c.Why.Date != day(-1) || c.Why.RecipeID != 1 {
			t.Errorf("recheck = %+v %+v, want relaxed with the Cool-down chip (had yesterday)", c, c.Why)
		}
	})
	t.Run("a held pick that now keeps every rule loses its relaxed flag and chip, and stays", func(t *testing.T) {
		in := baseInput([]Slot{withExisting(dinner(0), heldRelaxed(1))}, rcp(1, 2), rcp(2, 2))
		in.LastPlanned = map[RecipeID]Date{1: day(-20)}
		r := mustPlan(t, in)
		wantHeld(t, r, key(0))
		if c := recheckAt(t, r, key(0)); c.Relaxed || c.Why != nil {
			t.Errorf("recheck = %+v %+v, want strict, no chip", c, c.Why)
		}
	})
	t.Run("a held pick that is now inside a Cool-down gains the chip", func(t *testing.T) {
		in := baseInput([]Slot{withExisting(dinner(0), heldMeal(1))}, rcp(1, 2), rcp(2, 2))
		in.LastPlanned = map[RecipeID]Date{1: day(-2)}
		r := mustPlan(t, in)
		wantHeld(t, r, key(0))
		if c := recheckAt(t, r, key(0)); !c.Relaxed || c.Why == nil || c.Why.Code != ReasonCooldownRelaxed {
			t.Errorf("recheck = %+v %+v, want relaxed with the Cool-down chip", c, c.Why)
		}
	})
	t.Run("a Variety Rule it breaks becomes the chip", func(t *testing.T) {
		in := baseInput([]Slot{withExisting(dinner(0), heldMeal(1))}, rcp(1, 2, tags("fish")), rcp(2, 2))
		in.VarietyRules = []VarietyRule{{Tag: "fish", NotConsecutiveDays: true}}
		in.LastPlanned = map[RecipeID]Date{3: day(-1)}
		in.Recipes = append(in.Recipes, rcp(3, 2, tags("fish")))
		r := mustPlan(t, in)
		wantHeld(t, r, key(0))
		if c := recheckAt(t, r, key(0)); !c.Relaxed || c.Why == nil || c.Why.Code != ReasonVarietyRelaxed {
			t.Errorf("recheck = %+v %+v, want the Variety chip", c, c.Why)
		}
	})
	t.Run("the held meal's own cook is left out of its check", func(t *testing.T) {
		in := baseInput([]Slot{withExisting(dinner(0), heldMeal(1))}, rcp(1, 2, tags("fish")), rcp(2, 2))
		in.VarietyRules = []VarietyRule{{Tag: "fish", MaxPerWeek: 1}}
		r := mustPlan(t, in)
		wantHeld(t, r, key(0))
		if c := recheckAt(t, r, key(0)); c.Relaxed {
			t.Errorf("recheck = %+v, want strict: it does not count twice towards its own Variety Rule", c)
		}
	})
}

func TestASlotRuleReservationPassesOverAHeldMeal(t *testing.T) {
	// An unheld Planned pizza on Tuesday would block Friday's Slot Rule and is replanned (reserve_test). A held one
	// stays: the rule cell gets pizza as a relaxed pick, as it does beside a Pinned one (ADR 0013 point 4).
	slots := fridayRule(SlotRule{RecipeID: pizzaR})
	slots[1] = withExisting(slots[1], heldMeal(pizzaR))
	in := baseInput(slots, fiveRecipes()...)
	r := mustPlan(t, in)
	wantHeld(t, r, key(1))
	if p := placementAt(t, r, key(4)); p.RecipeID != pizzaR || !p.Relaxed {
		t.Errorf("Friday = %+v, want pizza as a relaxed pick", p)
	}
	if len(r.Unfilled) != 0 {
		t.Errorf("Unfilled = %+v", r.Unfilled)
	}
	for _, n := range []int{0, 2, 3} {
		if got := placementAt(t, r, key(n)).RecipeID; got == pizzaR {
			t.Errorf("day %d = pizza", n)
		}
	}
	control := mustPlan(t, asUnheld(in))
	if isKept(control, key(1)) {
		t.Errorf("control: the unheld pizza must be replanned (set-up check)")
	}
}

func TestAHeldMealBesideAWholeMealMainStaysAndNoWholeMealIsPickedBesideIt(t *testing.T) {
	// U6: a Bought Side is kept like a Pinned one; Feeder does not pick a Whole meal beside it.
	recipes := func() []Recipe {
		return []Recipe{rcp(1, 2, courses(mainC), whole()), rcp(2, 2, courses(mainC)), rcp(3, 2, courses(sideC)), rcp(4, 2, courses(sideC))}
	}
	t.Run("the Whole meal is held back for the main Course", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, sideC, holding(heldMeal(3)))}, recipes()...)
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, mainC), 2)
		wantHeld(t, r, ck(0, sideC))
		if _, ok := notServedAt(r, ck(0, sideC)); ok {
			t.Errorf("the held Side is covered: %+v", r.NotServed)
		}
		// Control: an unheld Side lets the Whole meal in and is covered by it.
		c := mustPlan(t, asUnheld(in))
		wantPlaced(t, c, ck(0, mainC), 1)
		wantNotServed(t, c, ck(0, sideC), NotServedCovered)
	})
	t.Run("a Whole meal set by hand leaves it as a Course that is not covered", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0, holding(pinnedMeal(1))), cell(0, sideC, holding(heldMeal(3)))}, recipes()...)
		r := mustPlan(t, in)
		wantHeld(t, r, ck(0, sideC))
		if len(r.NotServed) != 0 {
			t.Errorf("NotServed = %+v, want none: the held Side is not covered", r.NotServed)
		}
	})
	t.Run("a held main with a Whole meal still covers an unheld Side", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0, holding(heldMeal(1))), cell(0, sideC, holding(plannedMeal(3)))}, recipes()...)
		r := mustPlan(t, in)
		wantHeld(t, r, ck(0, mainC))
		wantNotServed(t, r, ck(0, sideC), NotServedCovered)
	})
}

func TestAHeldMealIsIgnoredUnlessItIsAFreshPlannedMeal(t *testing.T) {
	// Held means nothing on a Pinned, Cooked or Not cooked meal or one served from a Leftover.
	for name, m := range map[string]ExistingMeal{
		"Pinned":     {State: MealPinned, RecipeID: 1, Batches: 1, Held: true},
		"Cooked":     {State: MealCooked, RecipeID: 1, Batches: 1, Held: true},
		"Not cooked": {State: MealSkipped, RecipeID: 1, Batches: 1, Held: true},
	} {
		t.Run(name, func(t *testing.T) {
			in := baseInput([]Slot{withExisting(dinner(0), m)}, rcp(1, 2))
			r := mustPlan(t, in)
			if isKept(r, key(0)) || len(r.Rechecks) != 0 {
				t.Errorf("%s meal flagged Held was treated as held: Kept %v Rechecks %+v", name, r.Kept, r.Rechecks)
			}
		})
	}
	t.Run("served from a Leftover", func(t *testing.T) {
		m := ExistingMeal{State: MealPlanned, RecipeID: 1, From: &LeftoverSource{LeftoverID: 7}, Held: true}
		in := baseInput([]Slot{withExisting(dinner(0), m)}, rcp(1, 2), rcp(2, 2))
		in.Leftovers = []Leftover{leftoverOf(7, 1, 2, day(3))}
		in.Members = map[MemberID]Preferences{ben: {ExcludedRecipes: []RecipeID{1}}}
		if r := mustPlan(t, in); isKept(r, key(0)) {
			t.Errorf("a Leftover-served meal flagged Held was held although its check fails: %+v", r.Kept)
		}
	})
}

func TestHeldPlansAreDeterministic(t *testing.T) {
	in := baseInput([]Slot{withExisting(dinner(0), heldMeal(1)), dinner(1), dinner(2)}, rcp(1, 2, archived()), rcp(2, 2), rcp(3, 2), rcp(4, 2))
	in.Weights, in.Seed = nil, 5
	a, b := mustPlan(t, in), mustPlan(t, in)
	if !equalResults(a, b) {
		t.Errorf("two plans of one input differ:\n%+v\n%+v", a, b)
	}
	wantHeld(t, a, key(0))
}
