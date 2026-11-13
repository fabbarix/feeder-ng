package plan_test

import (
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

// B5-BO: Bought Planned Meals in the pure plan package (ADR 0013; docs/dev/design/b5-bo.md §6): BuildInput holds a
// Bought meal, Clear does not apply to it, and HardRuleWarning names the hard rule a Pinned or Bought meal breaks.

func boughtMeal(id int64, key plan.Key, recipe int64) plan.Meal {
	return plan.Meal{ID: id, Key: key, RecipeID: recipe, Batches: 1, Portions: 2, State: plan.StatePlanned, Bought: []int64{7}}
}

func boughtSnapshot(meals ...plan.Meal) plan.Snapshot {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{slotInfo("2026-11-10", 1, "19:00", 1, 2), slotInfo("2026-11-11", 1, "19:00", 1, 2)}
	s.Meals = meals
	return s
}

func TestMealIsBoughtWhenARecordNamesAnIngredient(t *testing.T) {
	if (plan.Meal{}).IsBought() || (plan.Meal{Bought: []int64{}}).IsBought() {
		t.Error("a Planned Meal with no records is not Bought")
	}
	if !(plan.Meal{Bought: []int64{3}}).IsBought() {
		t.Error("a Planned Meal with a record is Bought")
	}
}

func TestBuildInputHoldsABoughtUnpinnedFreshMeal(t *testing.T) {
	s := boughtSnapshot(boughtMeal(1, k("2026-11-10", 1), 5), plan.Meal{ID: 2, Key: k("2026-11-11", 1), RecipeID: 6, Batches: 1, State: plan.StatePlanned})
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	bought, plain := slotByKey(t, in, pk("2026-11-10", 1)).Existing, slotByKey(t, in, pk("2026-11-11", 1)).Existing
	if bought == nil || bought.State != planner.MealPlanned || !bought.Held || bought.RecipeID != 5 {
		t.Errorf("Bought meal = %+v, want a Planned meal of Recipe 5 with Held", bought)
	}
	if plain == nil || plain.Held {
		t.Errorf("a meal nothing was bought for = %+v, want it not Held", plain)
	}
}

func TestClearDoesNotApplyToABoughtMeal(t *testing.T) {
	// A Swap, a Cooked confirmation or changed Slot Rules clear the unpinned meals downstream; a Bought one is not cleared.
	s := boughtSnapshot(boughtMeal(1, k("2026-11-10", 1), 5), plan.Meal{ID: 2, Key: k("2026-11-11", 1), RecipeID: 6, Batches: 1, State: plan.StatePlanned})
	s.Clear = []plan.Key{k("2026-11-10", 1), k("2026-11-11", 1)}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	if e := slotByKey(t, in, pk("2026-11-10", 1)).Existing; e == nil || !e.Held {
		t.Errorf("Bought meal under Clear = %+v, want it still there and Held", e)
	}
	if e := slotByKey(t, in, pk("2026-11-11", 1)).Existing; e != nil {
		t.Errorf("an unbought meal under Clear = %+v, want it cleared (nil)", e)
	}
}

func TestOnlyAFreshUnresolvedUnpinnedMealIsHeld(t *testing.T) {
	cases := map[string]func(m *plan.Meal){
		"Pinned":     func(m *plan.Meal) { m.Pinned = true },
		"Cooked":     func(m *plan.Meal) { m.State = plan.StateCooked },
		"Not cooked": func(m *plan.Meal) { m.State = plan.StateSkipped },
		"served from a Leftover": func(m *plan.Meal) {
			m.Batches, m.From = 0, &plan.Source{From: k("2026-11-09", 1)}
		},
	}
	for name, change := range cases {
		t.Run(name, func(t *testing.T) {
			m := boughtMeal(1, k("2026-11-10", 1), 5)
			change(&m)
			in, err := plan.BuildInput(boughtSnapshot(m))
			if err != nil {
				t.Fatal(err)
			}
			if e := slotByKey(t, in, pk("2026-11-10", 1)).Existing; e == nil || e.Held {
				t.Errorf("%s meal with records = %+v, want it present and not Held", name, e)
			}
		})
	}
}

func TestABoughtMealWhoseSlotIsOverIsPassedAsPinnedLikeAnyUnconfirmedMeal(t *testing.T) {
	s := boughtSnapshot(boughtMeal(1, k("2026-11-10", 1), 5))
	s.Now = time.Date(2026, 11, 10, 20, 0, 0, 0, time.UTC) // after the 19:00 dinner
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	if e := slotByKey(t, in, pk("2026-11-10", 1)).Existing; e == nil || e.State != planner.MealPinned {
		t.Errorf("an over, unconfirmed Bought meal = %+v, want MealPinned: it happened, only Cooked or Not cooked resolves it", e)
	}
}

func TestReconcileDeletesAnUnplacedBoughtMealOnlyWhenThePlannerDroppedIt(t *testing.T) {
	// Held: the planner lists it in Kept (and no placement), so Reconcile leaves it. Regenerate replaced and could not
	// refill it: no Kept, no placement, an Unfilled reason: it is deleted (its records cascade).
	s := boughtSnapshot(boughtMeal(1, k("2026-11-10", 1), 5), boughtMeal(2, k("2026-11-11", 1), 6))
	res := planner.Result{
		Kept:     []planner.SlotKey{pk("2026-11-10", 1)},
		Unfilled: []planner.Unfilled{{Key: pk("2026-11-11", 1), Reason: planner.UnfilledNoCandidates}},
	}
	ch := plan.Reconcile(s, res)
	if len(ch.Deletes) != 1 || ch.Deletes[0] != k("2026-11-11", 1) {
		t.Errorf("Deletes = %+v, want only the cell the planner could not refill", ch.Deletes)
	}
}

func TestReconcileWritesAHeldMealsRecheckInPlace(t *testing.T) {
	m := boughtMeal(1, k("2026-11-10", 1), 5)
	s := boughtSnapshot(m)
	res := planner.Result{
		Kept:         []planner.SlotKey{pk("2026-11-10", 1)},
		KeptPortions: map[planner.SlotKey]float64{pk("2026-11-10", 1): 2},
		Rechecks: []planner.Recheck{{Key: pk("2026-11-10", 1), Relaxed: true,
			Why: &planner.Why{Code: planner.ReasonCooldownRelaxed, RecipeID: 5, Date: "2026-11-09"}}},
	}
	ch := plan.Reconcile(s, res)
	if len(ch.Upserts) != 1 || ch.Upserts[0].ID != 1 || ch.Upserts[0].RecipeID != 5 || !ch.Upserts[0].Relaxed || len(ch.Upserts[0].Why) != 1 {
		t.Errorf("Upserts = %+v, want the same row (id 1, Recipe 5) now relaxed with the Cool-down chip", ch.Upserts)
	}
	if len(ch.Deletes) != 0 {
		t.Errorf("Deletes = %+v, want none", ch.Deletes)
	}
}

// --- HardRuleWarning ---

func warnMeal(mut ...func(*plan.Meal)) plan.Meal {
	m := plan.Meal{ID: 1, Key: plan.Key{Date: "2026-11-10", MealSlotID: 1, CourseID: 3}, RecipeID: 5, Batches: 1, State: plan.StatePlanned, Bought: []int64{7}}
	for _, f := range mut {
		f(&m)
	}
	return m
}

func warnRecipe(mut ...func(*planner.Recipe)) planner.Recipe {
	r := planner.Recipe{ID: 5, Yield: 2, CourseIDs: []int64{3}, Needs: []planner.Need{{IngredientID: 40, Quantity: 5}, {IngredientID: 41, Quantity: 1, Optional: true}}}
	for _, f := range mut {
		f(&r)
	}
	return r
}

var warnAtt = []plan.Attendee{{MemberID: 1, Factor: 1}, {MemberID: 2, Factor: 1}}

func TestHardRuleWarningCleanMealsGetNone(t *testing.T) {
	if w := plan.HardRuleWarning(warnMeal(), warnRecipe(), true, warnAtt, nil); w != nil {
		t.Errorf("warning = %+v, want none", w)
	}
}

func TestHardRuleWarningArchivedAndMissingRecipes(t *testing.T) {
	archived := warnRecipe(func(r *planner.Recipe) { r.Archived = true })
	if w := plan.HardRuleWarning(warnMeal(), archived, true, warnAtt, nil); w == nil || w.Code != plan.WarnArchived {
		t.Errorf("archived: warning = %+v, want archived", w)
	}
	if w := plan.HardRuleWarning(warnMeal(), planner.Recipe{}, false, warnAtt, nil); w == nil || w.Code != plan.WarnArchived {
		t.Errorf("a Recipe that no longer exists: warning = %+v, want archived", w)
	}
}

func TestHardRuleWarningCourseLost(t *testing.T) {
	lost := warnRecipe(func(r *planner.Recipe) { r.CourseIDs = []int64{4} })
	if w := plan.HardRuleWarning(warnMeal(), lost, true, warnAtt, nil); w == nil || w.Code != plan.WarnCourseLost {
		t.Errorf("warning = %+v, want course_lost", w)
	}
	// A cell with no Course (a pure-planning fixture) skips Course fit.
	noCourse := warnMeal(func(m *plan.Meal) { m.Key.CourseID = 0 })
	if w := plan.HardRuleWarning(noCourse, lost, true, warnAtt, nil); w != nil {
		t.Errorf("Course 0: warning = %+v, want none", w)
	}
}

func TestHardRuleWarningExcluded(t *testing.T) {
	ingredient := map[int64]planner.Preferences{2: {ExcludedIngredients: []planner.IngredientID{40}}}
	if w := plan.HardRuleWarning(warnMeal(), warnRecipe(), true, warnAtt, ingredient); w == nil || w.Code != plan.WarnExcluded || w.MemberID != 2 || w.IngredientID != 40 {
		t.Errorf("an Ingredient: warning = %+v, want excluded by Member 2, Ingredient 40", w)
	}
	optional := map[int64]planner.Preferences{2: {ExcludedIngredients: []planner.IngredientID{41}}}
	if w := plan.HardRuleWarning(warnMeal(), warnRecipe(), true, warnAtt, optional); w == nil || w.IngredientID != 41 {
		t.Errorf("an optional line counts too: warning = %+v", w)
	}
	recipe := map[int64]planner.Preferences{1: {ExcludedRecipes: []planner.RecipeID{5}}}
	if w := plan.HardRuleWarning(warnMeal(), warnRecipe(), true, warnAtt, recipe); w == nil || w.Code != plan.WarnExcluded || w.MemberID != 1 || w.IngredientID != 0 {
		t.Errorf("the Recipe itself: warning = %+v, want excluded by Member 1 with no Ingredient", w)
	}
	// Someone who is not eating the Course excludes nothing.
	away := map[int64]planner.Preferences{9: {ExcludedRecipes: []planner.RecipeID{5}}}
	if w := plan.HardRuleWarning(warnMeal(), warnRecipe(), true, warnAtt, away); w != nil {
		t.Errorf("a Member who is not eating: warning = %+v, want none", w)
	}
	zero := []plan.Attendee{{MemberID: 1, Factor: 0}, {MemberID: 2, Factor: 1}}
	if w := plan.HardRuleWarning(warnMeal(), warnRecipe(), true, zero, recipe); w != nil {
		t.Errorf("a Member with Portion Factor 0: warning = %+v, want none", w)
	}
}

func TestHardRuleWarningPicksTheFirstRuleThenTheLowestMemberAndIngredient(t *testing.T) {
	both := map[int64]planner.Preferences{
		2: {ExcludedRecipes: []planner.RecipeID{5}},
		1: {ExcludedIngredients: []planner.IngredientID{41, 40}},
	}
	// The Recipe itself wins over an Ingredient, whoever excludes it.
	if w := plan.HardRuleWarning(warnMeal(), warnRecipe(), true, warnAtt, both); w == nil || w.MemberID != 2 || w.IngredientID != 0 {
		t.Errorf("warning = %+v, want Member 2 excluding the Recipe", w)
	}
	only := map[int64]planner.Preferences{
		2: {ExcludedIngredients: []planner.IngredientID{40}},
		1: {ExcludedIngredients: []planner.IngredientID{41, 40}},
	}
	if w := plan.HardRuleWarning(warnMeal(), warnRecipe(), true, warnAtt, only); w == nil || w.MemberID != 1 || w.IngredientID != 40 {
		t.Errorf("warning = %+v, want the lowest Member (1) and its lowest excluded Ingredient (40)", w)
	}
	// archived, then course_lost, then excluded.
	bad := warnRecipe(func(r *planner.Recipe) { r.Archived, r.CourseIDs = true, []int64{4} })
	if w := plan.HardRuleWarning(warnMeal(), bad, true, warnAtt, both); w == nil || w.Code != plan.WarnArchived {
		t.Errorf("warning = %+v, want archived first", w)
	}
	lost := warnRecipe(func(r *planner.Recipe) { r.CourseIDs = []int64{4} })
	if w := plan.HardRuleWarning(warnMeal(), lost, true, warnAtt, both); w == nil || w.Code != plan.WarnCourseLost {
		t.Errorf("warning = %+v, want course_lost before excluded", w)
	}
}

func TestHardRuleWarningOnlyForPinnedOrBoughtUnresolvedFreshMeals(t *testing.T) {
	archived := warnRecipe(func(r *planner.Recipe) { r.Archived = true })
	check := func(name string, m plan.Meal, want bool) {
		t.Helper()
		got := plan.HardRuleWarning(m, archived, true, warnAtt, nil) != nil
		if got != want {
			t.Errorf("%s: warning = %v, want %v", name, got, want)
		}
	}
	check("Bought", warnMeal(), true)
	check("Pinned", warnMeal(func(m *plan.Meal) { m.Bought = nil; m.Pinned = true }), true)
	check("Pinned and Bought", warnMeal(func(m *plan.Meal) { m.Pinned = true }), true)
	check("neither (the planner replans it)", warnMeal(func(m *plan.Meal) { m.Bought = nil }), false)
	check("Cooked", warnMeal(func(m *plan.Meal) { m.State = plan.StateCooked }), false)
	check("Not cooked", warnMeal(func(m *plan.Meal) { m.State = plan.StateSkipped }), false)
	check("served from a Leftover", warnMeal(func(m *plan.Meal) { m.Bought = nil; m.Pinned = true; m.From = &plan.Source{} }), false)
}
