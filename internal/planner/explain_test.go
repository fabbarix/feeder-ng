package planner

import (
	"reflect"
	"testing"
)

// B-RX (docs/dev/design/rx-pt.md 2, crs-brx.md): a cell that ends no_candidates with an Exclusion count above zero
// records which Exclusions ruled its Recipes out. Weights are zero, so everything here is deterministic.

func rec(m MemberID, ing IngredientID, count int, ids ...RecipeID) ExclusionRecord {
	return ExclusionRecord{MemberID: m, IngredientID: ing, RecipeIDs: ids, RecipeCount: count}
}

func withGarlic(id RecipeID, opts ...recipeOpt) Recipe {
	return rcp(id, 2, append([]recipeOpt{needs(need(garlic, 10))}, opts...)...)
}

func wantRecords(t *testing.T, u Unfilled, more int, want ...ExclusionRecord) {
	t.Helper()
	if !reflect.DeepEqual(u.Exclusions, want) || u.MoreExclusions != more {
		t.Errorf("Exclusions = %+v (more %d)\nwant        %+v (more %d)", u.Exclusions, u.MoreExclusions, want, more)
	}
}

func TestExclusionRecords(t *testing.T) {
	t.Run("an Ingredient Exclusion is one record with the Recipes it removed", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0)}, withGarlic(1), withGarlic(2), withGarlic(3), withGarlic(4))
		in = prefs(in, anna, Preferences{ExcludedIngredients: []IngredientID{garlic}})
		u := unfilledAt(t, mustPlan(t, in), key(0))
		if u.Eliminated.Exclusion != 4 {
			t.Fatalf("Eliminated = %+v", u.Eliminated)
		}
		wantRecords(t, u, 0, rec(anna, garlic, 4, 1, 2, 3, 4))
	})
	t.Run("direct Exclusions are one record per Member with Ingredient 0, ordered by count then Member", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2), rcp(3, 2))
		in = prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{1, 2}})
		in = prefs(in, ben, Preferences{ExcludedRecipes: []RecipeID{1, 2, 3}})
		u := unfilledAt(t, mustPlan(t, in), key(0))
		wantRecords(t, u, 0, rec(ben, 0, 3, 1, 2, 3), rec(anna, 0, 2, 1, 2))
	})
	t.Run("a Recipe excluded by two Members is in both records but counted once", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0)}, withGarlic(1), withGarlic(2))
		in = prefs(in, anna, Preferences{ExcludedIngredients: []IngredientID{garlic}})
		in = prefs(in, ben, Preferences{ExcludedRecipes: []RecipeID{1}})
		u := unfilledAt(t, mustPlan(t, in), key(0))
		if u.Eliminated.Exclusion != 2 {
			t.Fatalf("Eliminated = %+v, want Exclusion 2", u.Eliminated)
		}
		wantRecords(t, u, 0, rec(anna, garlic, 2, 1, 2), rec(ben, 0, 1, 1))
	})
	t.Run("one Member's direct and Ingredient Exclusions on the same Recipes: the direct record first", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0)}, withGarlic(1), withGarlic(2))
		in = prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{1, 2}, ExcludedIngredients: []IngredientID{garlic}})
		u := unfilledAt(t, mustPlan(t, in), key(0))
		wantRecords(t, u, 0, rec(anna, 0, 2, 1, 2), rec(anna, garlic, 2, 1, 2))
	})
	t.Run("equal counts order by Ingredient id", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0)},
			rcp(1, 2, needs(need(garlic, 1), need(rice, 1))), rcp(2, 2, needs(need(garlic, 1), need(rice, 1))))
		in = prefs(in, anna, Preferences{ExcludedIngredients: []IngredientID{garlic, rice}})
		u := unfilledAt(t, mustPlan(t, in), key(0))
		wantRecords(t, u, 0, rec(anna, rice, 2, 1, 2), rec(anna, garlic, 2, 1, 2))
	})
	t.Run("a Member's Ingredient that no Recipe of the cell uses is not recorded", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0)}, withGarlic(1))
		in = prefs(in, anna, Preferences{ExcludedIngredients: []IngredientID{garlic, spinach}})
		u := unfilledAt(t, mustPlan(t, in), key(0))
		wantRecords(t, u, 0, rec(anna, garlic, 1, 1))
	})
	t.Run("an optional Ingredient line counts", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0)}, rcp(1, 2, needs(need(rice, 1), optional(garlic, 5))))
		in = prefs(in, ben, Preferences{ExcludedIngredients: []IngredientID{garlic}})
		u := unfilledAt(t, mustPlan(t, in), key(0))
		wantRecords(t, u, 0, rec(ben, garlic, 1, 1))
	})
	t.Run("a Member who is not attending, or eats with Portion Factor 0, is never listed", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0, Attendee{anna, 1}, Attendee{ben, 0})}, withGarlic(1), withGarlic(2))
		in = prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{1, 2}})
		in = prefs(in, ben, Preferences{ExcludedIngredients: []IngredientID{garlic}})
		in = prefs(in, carl, Preferences{ExcludedRecipes: []RecipeID{1}})
		u := unfilledAt(t, mustPlan(t, in), key(0))
		wantRecords(t, u, 0, rec(anna, 0, 2, 1, 2))
	})
}

func TestExclusionRecordsFollowCourseAttendance(t *testing.T) {
	// Carl opts out of the Side: his garlic Exclusion is in no Side record but heads the Main's.
	both2 := courses(mainC, sideC)
	in := baseInput([]Slot{
		mainCell(0, eats(Attendee{anna, 1}, Attendee{ben, 1}, Attendee{carl, 1})),
		cell(0, sideC, eats(Attendee{anna, 1}, Attendee{ben, 1})),
	}, withGarlic(1, both2), withGarlic(2, both2))
	in = prefs(in, carl, Preferences{ExcludedIngredients: []IngredientID{garlic}})
	in = prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{1}})
	in = prefs(in, ben, Preferences{ExcludedRecipes: []RecipeID{2}})
	r := mustPlan(t, in)
	wantRecords(t, unfilledAt(t, r, ck(0, mainC)), 0, rec(carl, garlic, 2, 1, 2), rec(anna, 0, 1, 1), rec(ben, 0, 1, 2))
	wantRecords(t, unfilledAt(t, r, ck(0, sideC)), 0, rec(anna, 0, 1, 1), rec(ben, 0, 1, 2))
}

func TestExclusionRecordCaps(t *testing.T) {
	t.Run("ten records keep eight in order and count the rest", func(t *testing.T) {
		// Member m excludes Ingredient 100+m, which Recipes 1..m need: counts 1..10.
		var att []Attendee
		var recipes []Recipe
		for id := RecipeID(1); id <= 10; id++ {
			var ns []Need
			for m := MemberID(id); m <= 10; m++ {
				ns = append(ns, need(IngredientID(100+m), 1))
			}
			recipes = append(recipes, rcp(id, 2, needs(ns...)))
		}
		in := baseInput(nil, recipes...)
		for m := MemberID(1); m <= 10; m++ {
			att = append(att, Attendee{m, 1})
			in = prefs(in, m, Preferences{ExcludedIngredients: []IngredientID{IngredientID(100 + m)}})
		}
		in.Slots = []Slot{dinner(0, att...)}
		u := unfilledAt(t, mustPlan(t, in), key(0))
		want := []ExclusionRecord{
			rec(10, 110, 10, 1, 2, 3, 4, 5), rec(9, 109, 9, 1, 2, 3, 4, 5), rec(8, 108, 8, 1, 2, 3, 4, 5),
			rec(7, 107, 7, 1, 2, 3, 4, 5), rec(6, 106, 6, 1, 2, 3, 4, 5), rec(5, 105, 5, 1, 2, 3, 4, 5),
			rec(4, 104, 4, 1, 2, 3, 4), rec(3, 103, 3, 1, 2, 3),
		}
		wantRecords(t, u, 2, want...)
	})
	t.Run("seven Recipes keep the five lowest ids and the true count", func(t *testing.T) {
		var recipes []Recipe
		for id := RecipeID(9); id >= 3; id-- { // given out of order
			recipes = append(recipes, withGarlic(id))
		}
		in := prefs(baseInput([]Slot{dinner(0)}, recipes...), anna, Preferences{ExcludedIngredients: []IngredientID{garlic}})
		wantRecords(t, unfilledAt(t, mustPlan(t, in), key(0)), 0, rec(anna, garlic, 7, 3, 4, 5, 6, 7))
	})
}

func TestExclusionRecordsOnlyCoverTheCellsOwnRecipes(t *testing.T) {
	t.Run("Course fit and Slot Rule narrowing come first", func(t *testing.T) {
		in := baseInput([]Slot{cell(0, sideC, ruled(SlotRule{Tag: "green"}))},
			withGarlic(1, courses(sideC), tags("green")),
			withGarlic(2, courses(sideC)),                // not matched by the Slot Rule
			withGarlic(3, courses(mainC), tags("green")), // wrong Course
		)
		in = prefs(in, anna, Preferences{ExcludedIngredients: []IngredientID{garlic}})
		u := unfilledAt(t, mustPlan(t, in), ck(0, sideC))
		if !u.SlotRuleClaimed || u.Eliminated.Exclusion != 1 {
			t.Fatalf("got %+v", u)
		}
		wantRecords(t, u, 0, rec(anna, garlic, 1, 1))
	})
	t.Run("archived Recipes and Recipes with no Yield are not listed", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0)}, withGarlic(1), withGarlic(2, archived()), rcp(3, 0, needs(need(garlic, 1))))
		in = prefs(in, anna, Preferences{ExcludedIngredients: []IngredientID{garlic}})
		wantRecords(t, unfilledAt(t, mustPlan(t, in), key(0)), 0, rec(anna, garlic, 1, 1))
	})
	t.Run("a Recipe reserved for a later Slot Rule cell is not listed", func(t *testing.T) {
		// Recipe 1 is the only match of the second cell's rule, so the first cell never considers it.
		in := baseInput([]Slot{dinner(0), withRules(dinner(1), SlotRule{RecipeID: 1})}, withGarlic(1), withGarlic(2))
		in = prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{2}})
		u := unfilledAt(t, mustPlan(t, in), key(0))
		wantRecords(t, u, 0, rec(anna, 0, 1, 2))
	})
}

func TestExclusionRecordsAreAbsentWhenThereIsNothingToExplain(t *testing.T) {
	excludeAll := func(in Input) Input {
		return prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{1, 2}})
	}
	t.Run("no Recipe was removed by an Exclusion", func(t *testing.T) {
		u := unfilledAt(t, mustPlan(t, baseInput([]Slot{dinner(0)}, rcp(1, 2, archived()))), key(0))
		if u.Exclusions != nil || u.MoreExclusions != 0 {
			t.Errorf("got %+v", u)
		}
	})
	t.Run("only Advance Steps removed them", func(t *testing.T) {
		u := unfilledAt(t, mustPlan(t, baseInput([]Slot{dinner(0)}, rcp(1, 2, lead(48*3600e9)))), key(0))
		if u.Reason != UnfilledNoCandidates || u.Exclusions != nil {
			t.Errorf("got %+v", u)
		}
	})
	t.Run("no_attendance", func(t *testing.T) {
		in := excludeAll(baseInput([]Slot{mainCell(0, eats(Attendee{anna, 0}))}, rcp(1, 2), rcp(2, 2)))
		u := unfilledAt(t, mustPlan(t, in), ck(0, mainC))
		if u.Reason != UnfilledNoAttendance || u.Exclusions != nil {
			t.Errorf("got %+v", u)
		}
	})
	t.Run("no_course_recipes", func(t *testing.T) {
		in := excludeAll(baseInput([]Slot{cell(0, sideC)}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(mainC))))
		u := unfilledAt(t, mustPlan(t, in), ck(0, sideC))
		if u.Reason != UnfilledNoCourseRecipes || u.Exclusions != nil {
			t.Errorf("got %+v", u)
		}
	})
	t.Run("an optional Course is not served and has no reason to carry detail", func(t *testing.T) {
		in := excludeAll(baseInput([]Slot{cell(0, dessertC, isOptional())}, rcp(1, 2), rcp(2, 2)))
		r := mustPlan(t, in)
		if isUnfilled(r, ck(0, dessertC)) || len(r.NotServed) != 1 {
			t.Errorf("Unfilled %+v, NotServed %+v", r.Unfilled, r.NotServed)
		}
	})
	t.Run("a filled cell has no reason at all", func(t *testing.T) {
		in := prefs(baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2)), anna, Preferences{ExcludedRecipes: []RecipeID{1}})
		if r := mustPlan(t, in); len(r.Unfilled) != 0 {
			t.Errorf("Unfilled = %+v", r.Unfilled)
		}
	})
}

func TestExclusionRecordsAreDeterministic(t *testing.T) {
	build := func() Input {
		in := baseInput([]Slot{dinner(0), dinner(1), mainCell(2), cell(2, sideC)},
			withGarlic(1, courses(mainC, sideC)), withGarlic(2, courses(mainC, sideC)), withGarlic(3, courses(mainC, sideC)))
		in = prefs(in, anna, Preferences{ExcludedIngredients: []IngredientID{garlic}, ExcludedRecipes: []RecipeID{3}})
		in = prefs(in, ben, Preferences{ExcludedRecipes: []RecipeID{1, 2, 3}})
		return in
	}
	first := mustPlan(t, build())
	if len(first.Unfilled) == 0 || first.Unfilled[0].Exclusions == nil {
		t.Fatalf("expected recorded detail, got %+v", first.Unfilled)
	}
	for n := 0; n < 20; n++ {
		if got := mustPlan(t, build()); !reflect.DeepEqual(got, first) {
			t.Fatalf("run %d differs:\n%+v\n%+v", n, got, first)
		}
	}
}
