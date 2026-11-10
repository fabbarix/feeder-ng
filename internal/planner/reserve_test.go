package planner

import (
	"reflect"
	"testing"
)

// Slot Rule reservation (spec §7.2, round 2, decision 2026-11-10): the planner keeps the Recipe a
// Slot Rule names for the rule's slot, and does not place it on an earlier slot where its Cool-down
// would then block the rule's slot. Day 4 is Friday (baseDay is a Monday). With all weights zero the
// lowest Recipe id wins ties, so the reserved Recipe is always id 1: without reservation it would be
// picked on Monday.

const pizzaR RecipeID = 1

func fridayRule(rules ...SlotRule) []Slot {
	slots := []Slot{dinner(0), dinner(1), dinner(2), dinner(3), withRules(dinner(4), rules...)}
	return slots
}

func fiveRecipes() []Recipe {
	return []Recipe{rcp(1, 2, tags("pizza")), rcp(2, 2), rcp(3, 2), rcp(4, 2), rcp(5, 2)}
}

func TestReserveSlotRuleRecipeKeepsItForItsSlot(t *testing.T) {
	in := baseInput(fridayRule(SlotRule{RecipeID: pizzaR}), fiveRecipes()...)
	for name, run := range map[string]func(Input) (Result, error){"Plan": Plan, "Regenerate": Regenerate} {
		t.Run(name, func(t *testing.T) {
			r, err := run(in)
			if err != nil {
				t.Fatal(err)
			}
			if got, want := planSignature(r), "2,3,4,5,1"; got != want {
				t.Fatalf("plan = %s, want %s (pizza reserved for Friday); unfilled %+v", got, want, r.Unfilled)
			}
			fri := placementAt(t, r, key(4))
			if len(fri.Why) == 0 || fri.Why[0].Code != ReasonSlotRule {
				t.Errorf("Friday's chips = %+v, want slot_rule first", fri.Why)
			}
			if len(r.Unfilled) != 0 {
				t.Errorf("unfilled = %+v", r.Unfilled)
			}
		})
	}
}

func TestReserveWindowIsTheReservedRecipesCooldown(t *testing.T) {
	// Pizza's own Cool-down is 3 days: Monday is 4 days before Friday, so Monday may still take it.
	recipes := []Recipe{rcp(1, 2, cooldown(3)), rcp(2, 2), rcp(3, 2), rcp(4, 2)}
	r := mustPlan(t, baseInput(fridayRule(SlotRule{RecipeID: pizzaR}), recipes...))
	if got, want := planSignature(r), "1,2,3,4,1"; got != want {
		t.Fatalf("plan = %s, want %s (Monday is outside the 3-day Cool-down of Friday)", got, want)
	}
	// With a Cool-down of 5 days Monday is blocked too (4 < 5), Tuesday (3) as well.
	recipes = append(recipes, rcp(5, 2))
	recipes[0] = rcp(1, 2, cooldown(5))
	r = mustPlan(t, baseInput(fridayRule(SlotRule{RecipeID: pizzaR}), recipes...))
	if got, want := planSignature(r), "2,3,4,5,1"; got != want {
		t.Fatalf("plan = %s, want %s", got, want)
	}
}

func TestReserveAlsoBlocksTheSameDayEarlierSlot(t *testing.T) {
	// Friday lunch is before Friday dinner on the same day; pizza (Cool-down 7) must wait for dinner.
	slots := []Slot{lunch(4), withRules(dinner(4), SlotRule{RecipeID: pizzaR})}
	r := mustPlan(t, baseInput(slots, rcp(1, 2), rcp(2, 2)))
	if got := placementAt(t, r, SlotKey{day(4), lunchSlot}).RecipeID; got != 2 {
		t.Errorf("Friday lunch = Recipe %d, want 2", got)
	}
	if got := placementAt(t, r, key(4)).RecipeID; got != pizzaR {
		t.Errorf("Friday dinner = Recipe %d, want pizza", got)
	}
}

func TestReserveTagRuleWithExactlyOneEligibleRecipe(t *testing.T) {
	tagRule := SlotRule{Tag: "pizza"}
	t.Run("one Recipe carries the Tag", func(t *testing.T) {
		r := mustPlan(t, baseInput(fridayRule(tagRule), fiveRecipes()...))
		if got, want := planSignature(r), "2,3,4,5,1"; got != want {
			t.Errorf("plan = %s, want %s", got, want)
		}
	})
	t.Run("archived Recipes with the Tag do not count", func(t *testing.T) {
		recipes := append(fiveRecipes(), rcp(6, 2, tags("pizza"), archived()))
		r := mustPlan(t, baseInput(fridayRule(tagRule), recipes...))
		if got := placementAt(t, r, key(0)).RecipeID; got == pizzaR {
			t.Errorf("Monday = pizza, which is reserved")
		}
		if got := placementAt(t, r, key(4)).RecipeID; got != pizzaR {
			t.Errorf("Friday = Recipe %d, want 1", got)
		}
	})
	t.Run("a Recipe an attendee excludes does not count", func(t *testing.T) {
		recipes := append(fiveRecipes(), rcp(6, 2, tags("pizza")))
		in := prefs(baseInput(fridayRule(tagRule), recipes...), ben, Preferences{ExcludedRecipes: []RecipeID{6}})
		r := mustPlan(t, in)
		if got := placementAt(t, r, key(0)).RecipeID; got == pizzaR {
			t.Errorf("Monday = pizza, which is reserved (Recipe 6 is excluded at Friday)")
		}
		if got := placementAt(t, r, key(4)).RecipeID; got != pizzaR {
			t.Errorf("Friday = Recipe %d, want 1", got)
		}
	})
	t.Run("two eligible Recipes: nothing is reserved", func(t *testing.T) {
		recipes := append(fiveRecipes(), rcp(6, 2, tags("pizza")))
		r := mustPlan(t, baseInput(fridayRule(tagRule), recipes...))
		if got := placementAt(t, r, key(0)).RecipeID; got != pizzaR {
			t.Errorf("Monday = Recipe %d, want 1 (the walk is unchanged when the Tag has several eligible Recipes)", got)
		}
	})
	t.Run("a Recipe rule plus a Tag rule matching other Recipes: nothing is reserved", func(t *testing.T) {
		recipes := append(fiveRecipes(), rcp(6, 2, tags("fish")))
		r := mustPlan(t, baseInput(fridayRule(SlotRule{RecipeID: pizzaR}, SlotRule{Tag: "fish"}), recipes...))
		if got := placementAt(t, r, key(0)).RecipeID; got != pizzaR {
			t.Errorf("Monday = Recipe %d, want 1", got)
		}
	})
}

func TestReserveIsVoidWhenAPinnedMealMakesItImpossible(t *testing.T) {
	// The User pinned pizza on Tuesday: pinned always wins, Friday (3 days later, Cool-down 7) cannot
	// be filled and shows its existing couldn't-plan reason. The reservation must not block other
	// Recipes, so every other slot is still filled.
	slots := fridayRule(SlotRule{RecipeID: pizzaR})
	slots[1] = withExisting(slots[1], ExistingMeal{State: MealPinned, RecipeID: pizzaR, Batches: 1})
	r := mustPlan(t, baseInput(slots, fiveRecipes()...))
	u := unfilledAt(t, r, key(4))
	if u.Reason != UnfilledNoCandidates || !u.SlotRuleClaimed || u.Eliminated.Considered != 1 || u.Eliminated.CoolDown != 1 {
		t.Errorf("Friday unfilled = %+v, want no_candidates, claimed, 1 considered, 1 in Cool-down", u)
	}
	for _, n := range []int{0, 2, 3} {
		if got := placementAt(t, r, key(n)).RecipeID; got == pizzaR {
			t.Errorf("day %d = pizza", n)
		}
	}
	// Same when the pinned pizza is after the rule's slot, inside its Cool-down.
	slots = append(fridayRule(SlotRule{RecipeID: pizzaR}), withExisting(dinner(5), ExistingMeal{State: MealPinned, RecipeID: pizzaR, Batches: 1}))
	r = mustPlan(t, baseInput(slots, fiveRecipes()...))
	unfilledAt(t, r, key(4))
}

func TestReserveIsVoidForLastPlannedInsideTheCooldown(t *testing.T) {
	// Pizza was cooked two days before the horizon starts: Friday is 6 days later (< 7), so the rule
	// cannot be met; earlier slots are in Cool-down anyway, and nothing else is disturbed.
	in := baseInput(fridayRule(SlotRule{RecipeID: pizzaR}), fiveRecipes()...)
	in.LastPlanned = map[RecipeID]Date{pizzaR: day(-2)}
	r := mustPlan(t, in)
	unfilledAt(t, r, key(4))
	if got, want := planSignature(r), "2,3,4,5"; got != want {
		t.Errorf("plan = %s, want %s", got, want)
	}
}

func TestReserveKeptPlannedMealInTheWindowIsReplanned(t *testing.T) {
	// An unpinned Planned pizza on Tuesday is valid in itself, but it would block Friday: Plan drops it
	// (it is not Kept) and the rule slot gets pizza. A Pinned one is not touched (test above).
	slots := fridayRule(SlotRule{RecipeID: pizzaR})
	slots[1] = withExisting(slots[1], ExistingMeal{State: MealPlanned, RecipeID: pizzaR, Batches: 1})
	r := mustPlan(t, baseInput(slots, fiveRecipes()...))
	for _, k := range r.Kept {
		if k == key(1) {
			t.Fatalf("Tuesday's unpinned pizza was kept although it blocks Friday's Slot Rule: %+v", r.Kept)
		}
	}
	if got := placementAt(t, r, key(1)).RecipeID; got == pizzaR {
		t.Errorf("Tuesday = pizza")
	}
	if got := placementAt(t, r, key(4)).RecipeID; got != pizzaR {
		t.Errorf("Friday = Recipe %d, want pizza", got)
	}
}

func TestReserveOnlyForSlotsTheWalkStillFills(t *testing.T) {
	t.Run("a Pinned rule slot reserves nothing", func(t *testing.T) {
		slots := fridayRule(SlotRule{RecipeID: pizzaR})
		slots[4] = withExisting(slots[4], ExistingMeal{State: MealPinned, RecipeID: 2, Batches: 1})
		r := mustPlan(t, baseInput(slots, fiveRecipes()...))
		if got := placementAt(t, r, key(0)).RecipeID; got != pizzaR {
			t.Errorf("Monday = Recipe %d, want 1 (Friday is Pinned to something else)", got)
		}
	})
	t.Run("a Cooked rule slot reserves nothing", func(t *testing.T) {
		slots := fridayRule(SlotRule{RecipeID: pizzaR})
		slots[4] = withExisting(slots[4], ExistingMeal{State: MealCooked, RecipeID: 2, Batches: 1})
		r := mustPlan(t, baseInput(slots, fiveRecipes()...))
		if got := placementAt(t, r, key(0)).RecipeID; got != pizzaR {
			t.Errorf("Monday = Recipe %d, want 1", got)
		}
	})
}

func TestReserveDoesNotBlockUnrelatedRecipesOrOtherSlots(t *testing.T) {
	r := mustPlan(t, baseInput(fridayRule(SlotRule{RecipeID: pizzaR}), fiveRecipes()...))
	// Recipes 2 to 5 are placed as if there were no rule, only the lowest-id order shifts by one.
	if got, want := planSignature(r), "2,3,4,5,1"; got != want {
		t.Fatalf("plan = %s, want %s", got, want)
	}
	// Slots after the rule's slot are not blocked by the reservation itself (pizza's own Cool-down applies).
	slots := append(fridayRule(SlotRule{RecipeID: pizzaR}), dinner(5))
	r = mustPlan(t, baseInput(slots, append(fiveRecipes(), rcp(6, 2))...))
	if got := placementAt(t, r, key(5)).RecipeID; got != 6 {
		t.Errorf("Saturday = Recipe %d, want 6", got)
	}
	// A rule with no Slot Rule in the horizon changes nothing: Monday is pizza.
	plain := mustPlan(t, baseInput([]Slot{dinner(0), dinner(1)}, fiveRecipes()...))
	if placementAt(t, plain, key(0)).RecipeID != pizzaR {
		t.Errorf("Monday without a rule = %+v", placementAt(t, plain, key(0)))
	}
}

func TestReserveTwoRulesForTheSameRecipeEarlierWins(t *testing.T) {
	// Pizza on both Wednesday and Friday is impossible with a 7-day Cool-down: the earlier rule slot
	// keeps the reservation, the later one is the one that ends up unfilled.
	slots := []Slot{dinner(0), dinner(1), withRules(dinner(2), SlotRule{RecipeID: pizzaR}), dinner(3), withRules(dinner(4), SlotRule{RecipeID: pizzaR})}
	r := mustPlan(t, baseInput(slots, fiveRecipes()...))
	if got := placementAt(t, r, key(2)).RecipeID; got != pizzaR {
		t.Errorf("Wednesday = Recipe %d, want pizza", got)
	}
	for _, n := range []int{0, 1} {
		if got := placementAt(t, r, key(n)).RecipeID; got == pizzaR {
			t.Errorf("day %d = pizza, reserved for Wednesday", n)
		}
	}
	u := unfilledAt(t, r, key(4))
	if !u.SlotRuleClaimed || u.Eliminated.CoolDown != 1 {
		t.Errorf("Friday unfilled = %+v", u)
	}
}

func TestSwapRespectsReservations(t *testing.T) {
	// Monday is Pinned to Recipe 6 and Tuesday to Recipe 2; Anna's Favourite is pizza (R1) which would otherwise rank first.
	build := func() Input {
		slots := fridayRule(SlotRule{RecipeID: pizzaR})
		slots[0] = withExisting(slots[0], ExistingMeal{State: MealPinned, RecipeID: 6, Batches: 1})
		slots[1] = withExisting(slots[1], ExistingMeal{State: MealPinned, RecipeID: 2, Batches: 1})
		in := weighted(baseInput(slots, append(fiveRecipes(), rcp(6, 2))...), Weights{Favourite: 3})
		in.Members = map[MemberID]Preferences{anna: {Favourites: []RecipeID{1}}}
		return in
	}
	t.Run("Swap does not offer the reserved Recipe on an earlier slot", func(t *testing.T) {
		got, err := Swap(build(), key(1))
		if err != nil {
			t.Fatal(err)
		}
		if want := []RecipeID{3, 4, 5}; !reflect.DeepEqual(recipeIDs(got), want) {
			t.Errorf("alternatives = %v, want %v (pizza is reserved for Friday)", recipeIDs(got), want)
		}
	})
	t.Run("the reservation window is the reserved Recipe's Cool-down", func(t *testing.T) {
		in := build()
		in.Recipes[0] = rcp(1, 2, tags("pizza"), cooldown(3))
		got, _ := Swap(in, key(1)) // Tuesday is exactly 3 days before Friday
		if len(got) == 0 || got[0].RecipeID != pizzaR {
			t.Errorf("alternatives = %v, want pizza first", recipeIDs(got))
		}
	})
	t.Run("Swap on the rule's own slot still ignores the rule", func(t *testing.T) {
		in := build()
		in.Slots[4] = withExisting(in.Slots[4], ExistingMeal{State: MealPinned, RecipeID: pizzaR, Batches: 1})
		got, err := Swap(in, key(4))
		if err != nil || len(got) == 0 {
			t.Fatalf("got %v, %v", recipeIDs(got), err)
		}
		for _, p := range got {
			if p.RecipeID == pizzaR {
				t.Errorf("the current Recipe was offered: %v", recipeIDs(got))
			}
		}
	})
}

func TestReserveLeftoverMealIsNotAFreshCook(t *testing.T) {
	leftoverPizza := ExistingMeal{State: MealPinned, RecipeID: pizzaR, From: &LeftoverSource{LeftoverID: 7}}
	withLeftover := func(slots []Slot) Input {
		in := baseInput(slots, fiveRecipes()...)
		in.Leftovers = []Leftover{leftoverOf(7, pizzaR, 2, day(3))}
		return in
	}
	t.Run("a Pinned Leftover of R starts no Cool-down: the next day can still take R", func(t *testing.T) {
		slots := []Slot{withExisting(dinner(0), leftoverPizza), dinner(1)}
		r := mustPlan(t, withLeftover(slots))
		if got := placementAt(t, r, key(1)).RecipeID; got != pizzaR {
			t.Errorf("Tuesday = Recipe %d, want 1 (a Leftover is not a fresh cook)", got)
		}
	})
	t.Run("a Cooked Leftover of R does not void a reservation either", func(t *testing.T) {
		slots := fridayRule(SlotRule{RecipeID: pizzaR})
		slots[0] = withExisting(slots[0], ExistingMeal{State: MealCooked, RecipeID: pizzaR, From: &LeftoverSource{LeftoverID: 7}})
		r := mustPlan(t, withLeftover(slots))
		if got := placementAt(t, r, key(4)).RecipeID; got != pizzaR {
			t.Errorf("Friday = Recipe %d, want pizza (reservation stays)", got)
		}
		for _, n := range []int{1, 2, 3} {
			if got := placementAt(t, r, key(n)).RecipeID; got == pizzaR {
				t.Errorf("day %d = pizza, reserved for Friday", n)
			}
		}
	})
	t.Run("a Pinned Leftover of R does not void a reservation", func(t *testing.T) {
		slots := fridayRule(SlotRule{RecipeID: pizzaR})
		slots[0] = withExisting(slots[0], leftoverPizza)
		r := mustPlan(t, withLeftover(slots))
		if got := placementAt(t, r, key(4)).RecipeID; got != pizzaR {
			t.Errorf("Friday = Recipe %d, want pizza (reservation stays); unfilled %+v", got, r.Unfilled)
		}
		for _, n := range []int{1, 2, 3} {
			if got := placementAt(t, r, key(n)).RecipeID; got == pizzaR {
				t.Errorf("day %d = pizza, reserved for Friday", n)
			}
		}
	})
}

func TestReserveUsesTheRuleSlotsOwnAttendance(t *testing.T) {
	// Ben excludes pizza. He attends Monday but not Friday, so Friday's rule can still take pizza and
	// reserves it: Tuesday to Thursday (Anna only) must not use it up. Monday is attended by Ben, so
	// pizza is not an option there anyway.
	anna1 := Attendee{anna, 1}
	slots := []Slot{dinner(0), dinner(1, anna1), dinner(2, anna1), dinner(3, anna1), withRules(dinner(4, anna1), SlotRule{RecipeID: pizzaR})}
	in := prefs(baseInput(slots, fiveRecipes()...), ben, Preferences{ExcludedRecipes: []RecipeID{pizzaR}})
	r := mustPlan(t, in)
	if got := placementAt(t, r, key(4)).RecipeID; got != pizzaR {
		t.Errorf("Friday = Recipe %d, want pizza; unfilled %+v", got, r.Unfilled)
	}
	for _, n := range []int{0, 1, 2, 3} {
		if got := placementAt(t, r, key(n)).RecipeID; got == pizzaR {
			t.Errorf("day %d = pizza, reserved for Friday", n)
		}
	}
}
