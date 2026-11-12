package store_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/plan"
)

// Apply for a Meal Slot on one date (ADR 0014): raised Batches and the removal of a Not served slot's meals.
// Team B5-SD, test-first.

func TestApplyRaisesTheBatchesOfAnUnpinnedMeal(t *testing.T) {
	f := newFixture(t)
	f.st.SaveMeal(ctx, f.meal("2026-11-10", f.dinner, f.chicken))
	err := f.st.Apply(ctx, plan.Changes{RaiseBatches: []plan.BatchRaise{{Key: f.key("2026-11-10", f.dinner), Batches: 3, Portions: 6}}})
	if err != nil {
		t.Fatal(err)
	}
	got, _ := f.st.Meal(ctx, f.key("2026-11-10", f.dinner))
	if got.Batches != 3 || got.Portions != 6 || got.RecipeID != f.chicken || got.Pinned {
		t.Errorf("meal = %+v, want the same Recipe, unpinned, 3 Batches for 6 portions", got)
	}
}

func TestApplyRaisesTheBatchesOfAPinnedMealAndItStaysPinned(t *testing.T) {
	f := newFixture(t)
	m := f.meal("2026-11-10", f.dinner, f.chicken)
	m.Pinned = true
	pinned, _ := f.st.SaveMeal(ctx, m)
	if err := f.st.Apply(ctx, plan.Changes{RaiseBatches: []plan.BatchRaise{{Key: pinned.Key, Batches: 2, Portions: 5}}}); err != nil {
		t.Fatal(err)
	}
	got, _ := f.st.Meal(ctx, pinned.Key)
	if got.ID != pinned.ID || !got.Pinned || got.Batches != 2 || got.Portions != 5 || got.RecipeID != f.chicken {
		t.Errorf("meal = %+v, want the Pinned meal with 2 Batches for 5 portions", got)
	}
}

func TestApplyNeverRaisesACookedOrNotCookedMeal(t *testing.T) {
	f := newFixture(t)
	for i, state := range []plan.State{plan.StateCooked, plan.StateSkipped} {
		date := []string{"2026-11-10", "2026-11-11"}[i]
		m := f.meal(date, f.dinner, f.chicken)
		m.State = state
		saved, _ := f.st.SaveMeal(ctx, m)
		if err := f.st.Apply(ctx, plan.Changes{RaiseBatches: []plan.BatchRaise{{Key: saved.Key, Batches: 5, Portions: 20}}}); err != nil {
			t.Fatal(err)
		}
		if got, _ := f.st.Meal(ctx, saved.Key); got.Batches != 1 || got.Portions != 3 {
			t.Errorf("%s meal = %+v, want it untouched", state, got)
		}
	}
}

func TestApplyRaiseOfAnEmptySlotIsIgnored(t *testing.T) {
	f := newFixture(t)
	if err := f.st.Apply(ctx, plan.Changes{RaiseBatches: []plan.BatchRaise{{Key: f.key("2026-11-10", f.dinner), Batches: 2, Portions: 4}}}); err != nil {
		t.Fatalf("raising a slot with no meal = %v, want no error", err)
	}
	if all, _ := f.st.Meals(ctx, "", ""); len(all) != 0 {
		t.Errorf("%d meals, want none created", len(all))
	}
}

func TestApplyRemovesUnresolvedMealsPinnedOnesToo(t *testing.T) {
	f := newFixture(t)
	plain, _ := f.st.SaveMeal(ctx, f.meal("2026-11-10", f.dinner, f.chicken))
	p := f.meal("2026-11-11", f.dinner, f.pasta)
	p.Pinned = true
	pinned, _ := f.st.SaveMeal(ctx, p)
	if err := f.st.Apply(ctx, plan.Changes{RemoveUnresolved: []plan.Key{plain.Key, pinned.Key}}); err != nil {
		t.Fatal(err)
	}
	if all, _ := f.st.Meals(ctx, "", ""); len(all) != 0 {
		t.Errorf("%d meals left (%+v), want both gone", len(all), all)
	}
}

func TestApplyRemoveUnresolvedKeepsCookedAndNotCookedMeals(t *testing.T) {
	f := newFixture(t)
	c := f.meal("2026-11-10", f.dinner, f.chicken)
	c.State = plan.StateCooked
	cooked, _ := f.st.SaveMeal(ctx, c)
	s := f.meal("2026-11-11", f.dinner, f.pasta)
	s.State = plan.StateSkipped
	skipped, _ := f.st.SaveMeal(ctx, s)
	if err := f.st.Apply(ctx, plan.Changes{RemoveUnresolved: []plan.Key{cooked.Key, skipped.Key}}); err != nil {
		t.Fatal(err)
	}
	if all, _ := f.st.Meals(ctx, "", ""); len(all) != 2 {
		t.Errorf("%d meals left, want the Cooked and the Not cooked one (history)", len(all))
	}
}
