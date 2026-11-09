package store_test

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/plantest"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	rstore "github.com/fabbarix/feeder-ng/internal/recipe/store"
)

var ctx = context.Background()

type fixture struct {
	db      *sql.DB
	st      *store.Store
	clk     *clock.Fake
	dinner  int64 // a Meal Slot
	lunch   int64
	chicken int64 // Recipes
	pasta   int64
	soup    int64
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	d := plantest.NewDB(t)
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	return &fixture{
		db: d, st: store.New(d, clk), clk: clk,
		dinner:  plantest.SeedMealSlot(t, d, 1, "Dinner", "19:00"),
		lunch:   plantest.SeedMealSlot(t, d, 1, "Lunch", "12:30"),
		chicken: plantest.SeedRecipe(t, d, "Chicken", 4),
		pasta:   plantest.SeedRecipe(t, d, "Pasta", 4),
		soup:    plantest.SeedRecipe(t, d, "Soup", 6),
	}
}

func (f *fixture) key(date string, slot int64) plan.Key {
	return plan.Key{Date: date, MealSlotID: slot}
}

func (f *fixture) meal(date string, slot, recipe int64) plan.Meal {
	return plan.Meal{Key: f.key(date, slot), RecipeID: recipe, Batches: 1, Portions: 3, State: plan.StatePlanned}
}

func TestSaveAndReadAPlannedMealWithItsWhyChipsAndLeftoverSource(t *testing.T) {
	f := newFixture(t)
	fresh, err := f.st.SaveMeal(ctx, plan.Meal{Key: f.key("2026-11-10", f.dinner), RecipeID: f.chicken, Batches: 2, Portions: 5.5,
		State: plan.StatePlanned, Pinned: true,
		Why: []plan.Why{{Code: "favourite", Value: 2, MemberIDs: []int64{1, 2}}, {Code: "slot_rule", Tag: "chicken"}}})
	if err != nil || fresh.ID == 0 {
		t.Fatalf("SaveMeal = %+v, %v", fresh, err)
	}
	served, err := f.st.SaveMeal(ctx, plan.Meal{Key: f.key("2026-11-11", f.dinner), RecipeID: f.chicken, Portions: 2, State: plan.StatePlanned,
		From: &plan.Source{From: f.key("2026-11-10", f.dinner)}})
	if err != nil {
		t.Fatal(err)
	}
	got, err := f.st.Meal(ctx, fresh.Key)
	if err != nil || !reflect.DeepEqual(got, fresh) {
		t.Fatalf("Meal = %+v, %v; want %+v", got, err, fresh)
	}
	if got.Fresh() != true || !got.Pinned || got.Batches != 2 || got.Portions != 5.5 {
		t.Errorf("fresh meal fields lost: %+v", got)
	}
	got2, _ := f.st.Meal(ctx, served.Key)
	if got2.From == nil || got2.From.From != f.key("2026-11-10", f.dinner) || got2.From.LeftoverID != 0 || got2.Fresh() {
		t.Errorf("served-from-Leftover meal = %+v", got2)
	}
	if _, err := f.st.Meal(ctx, f.key("2026-12-01", f.dinner)); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Meal on an empty slot: err = %v, want ErrNotFound", err)
	}
}

func TestSaveMealReplacesTheMealInTheSlotAndKeepsItsId(t *testing.T) {
	f := newFixture(t)
	first, _ := f.st.SaveMeal(ctx, f.meal("2026-11-10", f.dinner, f.chicken))
	second, err := f.st.SaveMeal(ctx, f.meal("2026-11-10", f.dinner, f.pasta))
	if err != nil {
		t.Fatal(err)
	}
	if second.ID != first.ID || second.RecipeID != f.pasta {
		t.Errorf("replace: %+v then %+v; want the same id and the new Recipe", first, second)
	}
	all, _ := f.st.Meals(ctx, "", "")
	if len(all) != 1 {
		t.Errorf("%d meals, want 1 (one Planned Meal per Meal Slot and date)", len(all))
	}
}

func TestSaveMealRejectsUnknownSlotsAndRecipes(t *testing.T) {
	f := newFixture(t)
	if _, err := f.st.SaveMeal(ctx, f.meal("2026-11-10", 999, f.chicken)); !errors.Is(err, store.ErrUnknownRef) {
		t.Errorf("unknown Meal Slot: err = %v, want ErrUnknownRef", err)
	}
	if _, err := f.st.SaveMeal(ctx, f.meal("2026-11-10", f.dinner, 999)); !errors.Is(err, store.ErrUnknownRef) {
		t.Errorf("unknown Recipe: err = %v, want ErrUnknownRef", err)
	}
}

func TestMealsAreFilteredByDateRangeAndOrdered(t *testing.T) {
	f := newFixture(t)
	for _, m := range []plan.Meal{
		f.meal("2026-11-12", f.dinner, f.soup), f.meal("2026-11-10", f.dinner, f.chicken),
		f.meal("2026-11-10", f.lunch, f.pasta), f.meal("2026-11-14", f.dinner, f.pasta),
	} {
		if _, err := f.st.SaveMeal(ctx, m); err != nil {
			t.Fatal(err)
		}
	}
	got, err := f.st.Meals(ctx, "2026-11-10", "2026-11-12")
	if err != nil {
		t.Fatal(err)
	}
	var keys []plan.Key
	for _, m := range got {
		keys = append(keys, m.Key)
	}
	want := []plan.Key{f.key("2026-11-10", f.dinner), f.key("2026-11-10", f.lunch), f.key("2026-11-12", f.dinner)}
	if !reflect.DeepEqual(keys, want) {
		t.Errorf("Meals(10..12) = %v, want %v (inclusive, by date then Meal Slot id)", keys, want)
	}
	if all, _ := f.st.Meals(ctx, "", ""); len(all) != 4 {
		t.Errorf("open range returned %d meals, want 4", len(all))
	}
}

func TestPinResolveAndDelete(t *testing.T) {
	f := newFixture(t)
	key := f.key("2026-11-10", f.dinner)
	f.st.SaveMeal(ctx, f.meal("2026-11-10", f.dinner, f.chicken))
	if err := f.st.SetPinned(ctx, key, true); err != nil {
		t.Fatal(err)
	}
	if m, _ := f.st.Meal(ctx, key); !m.Pinned {
		t.Error("SetPinned(true) did not stick")
	}
	if err := f.st.MarkResolved(ctx, key, plan.StateCooked); err != nil {
		t.Fatal(err)
	}
	if m, _ := f.st.Meal(ctx, key); m.State != plan.StateCooked || !m.Pinned {
		t.Errorf("after MarkResolved: %+v, want cooked and still Pinned", m)
	}
	if left, _ := f.st.UnresolvedBefore(ctx, "2026-12-01"); len(left) != 0 {
		t.Errorf("a Cooked meal is resolved, got %+v", left)
	}
	if err := f.st.DeleteMeal(ctx, key); err != nil {
		t.Fatal(err)
	}
	for name, err := range map[string]error{
		"SetPinned":    f.st.SetPinned(ctx, key, false),
		"MarkResolved": f.st.MarkResolved(ctx, key, plan.StateSkipped),
		"DeleteMeal":   f.st.DeleteMeal(ctx, key),
	} {
		if !errors.Is(err, store.ErrNotFound) {
			t.Errorf("%s on an empty slot: err = %v, want ErrNotFound", name, err)
		}
	}
}

func TestUnresolvedBeforeListsOnlyPlannedMealsBeforeTheDate(t *testing.T) {
	f := newFixture(t)
	f.st.SaveMeal(ctx, f.meal("2026-11-07", f.dinner, f.chicken))
	f.st.SaveMeal(ctx, f.meal("2026-11-08", f.dinner, f.pasta))
	f.st.SaveMeal(ctx, f.meal("2026-11-09", f.dinner, f.soup))
	f.st.MarkResolved(ctx, f.key("2026-11-08", f.dinner), plan.StateSkipped)
	got, err := f.st.UnresolvedBefore(ctx, "2026-11-09")
	if err != nil || len(got) != 1 || got[0].Key.Date != "2026-11-07" {
		t.Errorf("UnresolvedBefore(09) = %+v, %v; want only the 7th", got, err)
	}
}

func TestDependantsAndLinkingTheActualLeftover(t *testing.T) {
	f := newFixture(t)
	source := f.key("2026-11-10", f.dinner)
	f.st.SaveMeal(ctx, f.meal("2026-11-10", f.dinner, f.chicken))
	f.st.SaveMeal(ctx, plan.Meal{Key: f.key("2026-11-11", f.dinner), RecipeID: f.chicken, Portions: 2, State: plan.StatePlanned, From: &plan.Source{From: source}})
	f.st.SaveMeal(ctx, plan.Meal{Key: f.key("2026-11-12", f.dinner), RecipeID: f.chicken, Portions: 2, State: plan.StatePlanned, Pinned: true, From: &plan.Source{From: source}})
	f.st.SaveMeal(ctx, plan.Meal{Key: f.key("2026-11-13", f.dinner), RecipeID: f.pasta, Portions: 2, State: plan.StatePlanned, From: &plan.Source{From: f.key("2026-11-09", f.dinner)}})
	deps, err := f.st.Dependants(ctx, source)
	if err != nil || len(deps) != 2 {
		t.Fatalf("Dependants = %+v, %v; want the two meals served from the 10th", deps, err)
	}
	l, err := f.st.AddLeftover(ctx, plan.Leftover{RecipeID: f.chicken, From: source, Portions: 4, CookedOn: "2026-11-10", UseBy: "2026-11-13"})
	if err != nil {
		t.Fatal(err)
	}
	if err := f.st.LinkLeftover(ctx, source, l.ID); err != nil {
		t.Fatal(err)
	}
	deps, _ = f.st.Dependants(ctx, source)
	for _, d := range deps {
		if d.From == nil || d.From.LeftoverID != l.ID {
			t.Errorf("dependant %v not linked to Leftover %d: %+v", d.Key, l.ID, d.From)
		}
	}
	other, _ := f.st.Meal(ctx, f.key("2026-11-13", f.dinner))
	if other.From.LeftoverID != 0 {
		t.Error("a meal served from another source must not be linked")
	}
}

func TestHistoryIsTheLatestFreshCookPerRecipeBeforeTheDate(t *testing.T) {
	f := newFixture(t)
	f.st.SaveMeal(ctx, f.meal("2026-11-02", f.dinner, f.chicken))
	f.st.SaveMeal(ctx, f.meal("2026-11-05", f.dinner, f.chicken))
	f.st.SaveMeal(ctx, f.meal("2026-11-08", f.dinner, f.chicken)) // not before the 8th
	f.st.SaveMeal(ctx, f.meal("2026-11-03", f.dinner, f.pasta))
	f.st.MarkResolved(ctx, f.key("2026-11-03", f.dinner), plan.StateCooked)
	f.st.SaveMeal(ctx, f.meal("2026-11-04", f.dinner, f.soup))
	f.st.MarkResolved(ctx, f.key("2026-11-04", f.dinner), plan.StateSkipped) // skipped counts for nothing
	f.st.SaveMeal(ctx, plan.Meal{Key: f.key("2026-11-06", f.dinner), RecipeID: f.pasta, Portions: 2, State: plan.StatePlanned,
		From: &plan.Source{From: f.key("2026-11-03", f.dinner)}}) // served from a Leftover: not a fresh cook
	got, err := f.st.History(ctx, "2026-11-08")
	if err != nil {
		t.Fatal(err)
	}
	byRecipe := map[int64]string{}
	for _, h := range got {
		byRecipe[h.RecipeID] = h.Date
	}
	want := map[int64]string{f.chicken: "2026-11-05", f.pasta: "2026-11-03"}
	if !reflect.DeepEqual(byRecipe, want) {
		t.Errorf("History = %v, want %v", byRecipe, want)
	}
}

func TestApplyWritesUpsertsDeletesAndCouldntPlanReasons(t *testing.T) {
	f := newFixture(t)
	f.st.SaveMeal(ctx, f.meal("2026-11-10", f.dinner, f.chicken)) // will be dropped
	f.st.SaveMeal(ctx, plan.Meal{Key: f.key("2026-11-11", f.dinner), RecipeID: f.pasta, Batches: 1, Portions: 3, State: plan.StatePlanned, Pinned: true})
	f.st.Apply(ctx, plan.Changes{Unfilled: []plan.Unfilled{{Key: f.key("2026-11-14", f.dinner), Reason: "no_attendance"}}})

	err := f.st.Apply(ctx, plan.Changes{
		Upserts: []plan.Meal{
			{Key: f.key("2026-11-12", f.dinner), RecipeID: f.soup, Batches: 1, Portions: 5, State: plan.StatePlanned,
				Why: []plan.Why{{Code: "best_available"}}},
		},
		Deletes: []plan.Key{f.key("2026-11-10", f.dinner)},
		Unfilled: []plan.Unfilled{{Key: f.key("2026-11-13", f.dinner), Reason: "no_candidates", SlotRuleClaimed: true,
			Eliminated: plan.Eliminations{Considered: 3, Exclusion: 1, CoolDown: 2}}},
		ClearUnfilled: []plan.Key{f.key("2026-11-14", f.dinner)},
	})
	if err != nil {
		t.Fatal(err)
	}
	meals, _ := f.st.Meals(ctx, "", "")
	if len(meals) != 2 || meals[0].Key.Date != "2026-11-11" || meals[1].Key.Date != "2026-11-12" || meals[1].Why[0].Code != "best_available" {
		t.Errorf("meals after Apply = %+v", meals)
	}
	unfilled, _ := f.st.Unfilled(ctx, "", "")
	want := []plan.Unfilled{{Key: f.key("2026-11-13", f.dinner), Reason: "no_candidates", SlotRuleClaimed: true,
		Eliminated: plan.Eliminations{Considered: 3, Exclusion: 1, CoolDown: 2}}}
	if !reflect.DeepEqual(unfilled, want) {
		t.Errorf("Unfilled = %+v, want %+v", unfilled, want)
	}
}

func TestApplyLeavesPinnedCookedAndSkippedMealsAloneEvenIfAskedToDeleteThem(t *testing.T) {
	f := newFixture(t)
	f.st.SaveMeal(ctx, plan.Meal{Key: f.key("2026-11-10", f.dinner), RecipeID: f.chicken, Batches: 1, State: plan.StatePlanned, Pinned: true})
	f.st.SaveMeal(ctx, f.meal("2026-11-11", f.dinner, f.pasta))
	f.st.MarkResolved(ctx, f.key("2026-11-11", f.dinner), plan.StateCooked)
	f.st.SaveMeal(ctx, f.meal("2026-11-12", f.dinner, f.soup))
	f.st.MarkResolved(ctx, f.key("2026-11-12", f.dinner), plan.StateSkipped)
	err := f.st.Apply(ctx, plan.Changes{
		Deletes: []plan.Key{f.key("2026-11-10", f.dinner), f.key("2026-11-11", f.dinner), f.key("2026-11-12", f.dinner)},
		Upserts: []plan.Meal{f.meal("2026-11-10", f.dinner, f.soup)},
	})
	if err != nil {
		t.Fatal(err)
	}
	meals, _ := f.st.Meals(ctx, "", "")
	if len(meals) != 3 || meals[0].RecipeID != f.chicken || !meals[0].Pinned || meals[1].State != plan.StateCooked || meals[2].State != plan.StateSkipped {
		t.Errorf("fixed meals changed: %+v", meals)
	}
}

func TestApplyIsAtomic(t *testing.T) {
	f := newFixture(t)
	f.st.SaveMeal(ctx, f.meal("2026-11-10", f.dinner, f.chicken))
	err := f.st.Apply(ctx, plan.Changes{
		Deletes: []plan.Key{f.key("2026-11-10", f.dinner)},
		Upserts: []plan.Meal{f.meal("2026-11-11", f.dinner, f.pasta), f.meal("2026-11-12", f.dinner, 999)}, // the last one breaks
	})
	if err == nil {
		t.Fatal("Apply with an unknown Recipe must fail")
	}
	meals, _ := f.st.Meals(ctx, "", "")
	if len(meals) != 1 || meals[0].RecipeID != f.chicken {
		t.Errorf("a failed Apply left partial changes: %+v", meals)
	}
}

func TestInTxCommitsOnSuccessAndRollsBackOnError(t *testing.T) {
	f := newFixture(t)
	err := f.st.InTx(ctx, func(tx *sql.Tx, st *store.Store) error {
		_, err := st.SaveMeal(ctx, f.meal("2026-11-10", f.dinner, f.chicken))
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	boom := errors.New("boom")
	err = f.st.InTx(ctx, func(tx *sql.Tx, st *store.Store) error {
		if _, err := st.SaveMeal(ctx, f.meal("2026-11-11", f.dinner, f.pasta)); err != nil {
			return err
		}
		if tx == nil {
			t.Error("InTx must hand over the transaction")
		}
		return boom
	})
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want boom", err)
	}
	meals, _ := f.st.Meals(ctx, "", "")
	if len(meals) != 1 || meals[0].Key.Date != "2026-11-10" {
		t.Errorf("rollback failed: %+v", meals)
	}
}

func TestLeftoversLifecycle(t *testing.T) {
	f := newFixture(t)
	src := f.key("2026-11-10", f.dinner)
	a, err := f.st.AddLeftover(ctx, plan.Leftover{RecipeID: f.chicken, From: src, Portions: 2, CookedOn: "2026-11-10", UseBy: "2026-11-13"})
	if err != nil || a.ID == 0 || a.Status != plan.LeftoverAvailable {
		t.Fatalf("AddLeftover = %+v, %v", a, err)
	}
	b, _ := f.st.AddLeftover(ctx, plan.Leftover{RecipeID: f.pasta, From: f.key("2026-11-09", f.dinner), Portions: 3, CookedOn: "2026-11-09", UseBy: "2026-11-11"})
	empty, _ := f.st.AddLeftover(ctx, plan.Leftover{RecipeID: f.soup, From: f.key("2026-11-08", f.dinner), Portions: 1, CookedOn: "2026-11-08", UseBy: "2026-11-10"})

	got, _ := f.st.Leftovers(ctx)
	if len(got) != 3 || got[0].ID != empty.ID || got[1].ID != b.ID || got[2].ID != a.ID {
		t.Fatalf("Leftovers (soonest Use-by first) = %+v", got)
	}
	if err := f.st.SetLeftoverPortions(ctx, empty.ID, 0); err != nil {
		t.Fatal(err)
	}
	if err := f.st.DiscardLeftover(ctx, b.ID, "2026-11-12"); err != nil {
		t.Fatal(err)
	}
	got, _ = f.st.Leftovers(ctx)
	if len(got) != 1 || got[0].ID != a.ID {
		t.Errorf("available Leftovers with portions = %+v, want only #%d", got, a.ID)
	}
	d, err := f.st.Leftover(ctx, b.ID)
	if err != nil || d.Status != plan.LeftoverDiscarded {
		t.Errorf("Leftover(discarded) = %+v, %v", d, err)
	}
	if l, ok, err := f.st.LeftoverFrom(ctx, src); err != nil || !ok || l.ID != a.ID {
		t.Errorf("LeftoverFrom(src) = %+v, %v, %v", l, ok, err)
	}
	if _, ok, _ := f.st.LeftoverFrom(ctx, f.key("2026-11-09", f.dinner)); ok {
		t.Error("a discarded Leftover must not be returned by LeftoverFrom")
	}
	for name, err := range map[string]error{
		"Leftover":            func() error { _, e := f.st.Leftover(ctx, 999); return e }(),
		"SetLeftoverPortions": f.st.SetLeftoverPortions(ctx, 999, 1),
		"DiscardLeftover":     f.st.DiscardLeftover(ctx, 999, "2026-11-12"),
	} {
		if !errors.Is(err, store.ErrNotFound) {
			t.Errorf("%s(unknown): err = %v, want ErrNotFound", name, err)
		}
	}
}

func TestSlotRules(t *testing.T) {
	f := newFixture(t)
	byTag, err := f.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: f.dinner, Tag: "pizza"})
	if err != nil || byTag.ID == 0 {
		t.Fatalf("AddSlotRule(tag) = %+v, %v", byTag, err)
	}
	byRecipe, err := f.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: f.dinner, RecipeID: f.pasta})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: f.dinner, Tag: "pizza"}); !errors.Is(err, store.ErrDuplicateRule) {
		t.Errorf("same rule twice: err = %v, want ErrDuplicateRule", err)
	}
	for name, r := range map[string]plan.SlotRule{
		"both":    {MealSlotID: f.dinner, Tag: "x", RecipeID: f.pasta},
		"neither": {MealSlotID: f.dinner},
	} {
		if _, err := f.st.AddSlotRule(ctx, r); !errors.Is(err, store.ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
	if _, err := f.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: 999, Tag: "x"}); !errors.Is(err, store.ErrUnknownRef) {
		t.Errorf("unknown Meal Slot: err = %v, want ErrUnknownRef", err)
	}
	if _, err := f.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: f.dinner, RecipeID: 999}); !errors.Is(err, store.ErrUnknownRef) {
		t.Errorf("unknown Recipe: err = %v, want ErrUnknownRef", err)
	}
	rules, _ := f.st.SlotRules(ctx)
	if want := []plan.SlotRule{byTag, byRecipe}; !reflect.DeepEqual(rules, want) {
		t.Errorf("SlotRules = %+v, want %+v", rules, want)
	}
	if err := f.st.DeleteSlotRule(ctx, byTag.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.st.DeleteSlotRule(ctx, byTag.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("deleting twice: err = %v, want ErrNotFound", err)
	}
	// Deleting the Meal Slot removes its rules.
	if _, err := f.db.Exec(`DELETE FROM meal_slots WHERE id = ?`, f.dinner); err != nil {
		t.Fatal(err)
	}
	if rules, _ := f.st.SlotRules(ctx); len(rules) != 0 {
		t.Errorf("rules outlived their Meal Slot: %+v", rules)
	}
}

func TestVarietyRules(t *testing.T) {
	f := newFixture(t)
	if err := f.st.SetVarietyRule(ctx, plan.VarietyRule{Tag: "fish", MaxPerWeek: 2}); err != nil {
		t.Fatal(err)
	}
	if err := f.st.SetVarietyRule(ctx, plan.VarietyRule{Tag: "pasta", NotConsecutiveDays: true}); err != nil {
		t.Fatal(err)
	}
	if err := f.st.SetVarietyRule(ctx, plan.VarietyRule{Tag: "fish", MaxPerWeek: 1, NotConsecutiveDays: true}); err != nil {
		t.Fatal(err) // replaces
	}
	got, _ := f.st.VarietyRules(ctx)
	want := []plan.VarietyRule{{Tag: "fish", MaxPerWeek: 1, NotConsecutiveDays: true}, {Tag: "pasta", NotConsecutiveDays: true}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("VarietyRules = %+v, want %+v", got, want)
	}
	for name, r := range map[string]plan.VarietyRule{
		"limits nothing": {Tag: "soup"}, "negative": {Tag: "soup", MaxPerWeek: -1}, "over a week": {Tag: "soup", MaxPerWeek: 22}, "no tag": {MaxPerWeek: 2},
	} {
		if err := f.st.SetVarietyRule(ctx, r); !errors.Is(err, store.ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
	if err := f.st.DeleteVarietyRule(ctx, "fish"); err != nil {
		t.Fatal(err)
	}
	if err := f.st.DeleteVarietyRule(ctx, "fish"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("deleting twice: err = %v, want ErrNotFound", err)
	}
}

func TestGenerationStartsAtOneAndBumps(t *testing.T) {
	f := newFixture(t)
	if g, err := f.st.Generation(ctx); err != nil || g != 1 {
		t.Fatalf("Generation = %d, %v; want 1", g, err)
	}
	if g, err := f.st.BumpGeneration(ctx); err != nil || g != 2 {
		t.Fatalf("BumpGeneration = %d, %v; want 2", g, err)
	}
	if g, _ := f.st.Generation(ctx); g != 2 {
		t.Errorf("Generation after bump = %d, want 2", g)
	}
}

func TestPlannedCheckerKnowsRecipesThatWereEverPlanned(t *testing.T) {
	f := newFixture(t)
	other := plantest.SeedRecipe(t, f.db, "Never used", 2)
	byLeftover := plantest.SeedRecipe(t, f.db, "Only a Leftover", 2)
	byRule := plantest.SeedRecipe(t, f.db, "Only a Slot Rule", 2)
	f.st.SaveMeal(ctx, f.meal("2026-11-10", f.dinner, f.chicken))
	f.st.AddLeftover(ctx, plan.Leftover{RecipeID: byLeftover, From: f.key("2026-11-01", f.dinner), Portions: 1, CookedOn: "2026-11-01", UseBy: "2026-11-04"})
	f.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: f.lunch, RecipeID: byRule})
	// The checker is registered by the package's init().
	for id, want := range map[int64]bool{f.chicken: true, byLeftover: true, byRule: true, other: false} {
		got, err := rstore.DefaultPlannedCheckers.WasPlanned(ctx, f.db, id)
		if err != nil || got != want {
			t.Errorf("WasPlanned(%d) = %v, %v; want %v", id, got, err, want)
		}
	}
}
