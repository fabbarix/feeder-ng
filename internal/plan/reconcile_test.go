package plan_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

func TestReconcileTurnsAResultIntoRowChanges(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{
		slotInfo("2026-11-10", 1, "19:00", 1), // A: empty, placed
		slotInfo("2026-11-11", 1, "19:00", 1), // B: unpinned meal kept
		slotInfo("2026-11-12", 1, "19:00", 1), // C: unpinned meal dropped, nothing fits
		slotInfo("2026-11-13", 1, "19:00", 1), // D: pinned
		slotInfo("2026-11-14", 1, "19:00", 1), // E: empty, unfilled
		slotInfo("2026-11-15", 1, "19:00", 1), // F: unpinned meal cleared and re-placed from a Leftover
	}
	s.Meals = []plan.Meal{
		{ID: 2, Key: k("2026-11-11", 1), RecipeID: 2, Batches: 1, State: plan.StatePlanned},
		{ID: 3, Key: k("2026-11-12", 1), RecipeID: 3, Batches: 1, State: plan.StatePlanned},
		{ID: 4, Key: k("2026-11-13", 1), RecipeID: 4, Batches: 1, State: plan.StatePlanned, Pinned: true},
		{ID: 6, Key: k("2026-11-15", 1), RecipeID: 6, Batches: 1, State: plan.StatePlanned},
	}
	s.Clear = []plan.Key{k("2026-11-15", 1)}
	res := planner.Result{
		Placements: []planner.Placement{
			{Key: pk("2026-11-10", 1), Source: planner.SourceRecipe, RecipeID: 11, Batches: 2, Portions: 3,
				Why: []planner.Why{{Code: planner.ReasonFavourite, Value: 2, MemberIDs: []planner.MemberID{1}}}},
			{Key: pk("2026-11-15", 1), Source: planner.SourceLeftover, RecipeID: 11, Portions: 3,
				From: &planner.LeftoverSource{LeftoverID: 8, FromSlot: pk("2026-11-10", 1)},
				Why:  []planner.Why{{Code: planner.ReasonLeftover, RecipeID: 11, Date: "2026-11-10"}}},
		},
		Kept: []planner.SlotKey{pk("2026-11-11", 1)},
		Unfilled: []planner.Unfilled{
			{Key: pk("2026-11-12", 1), Reason: planner.UnfilledNoCandidates, SlotRuleClaimed: true,
				Eliminated: planner.Eliminations{Considered: 4, Exclusion: 1, CoolDown: 3}},
			{Key: pk("2026-11-14", 1), Reason: planner.UnfilledNoAttendance},
		},
	}
	got := plan.Reconcile(s, res)

	wantUpserts := []plan.Meal{
		{Key: k("2026-11-10", 1), RecipeID: 11, Batches: 2, Portions: 3, State: plan.StatePlanned,
			Why: []plan.Why{{Code: "favourite", Value: 2, MemberIDs: []int64{1}}}},
		{Key: k("2026-11-15", 1), RecipeID: 11, Batches: 0, Portions: 3, State: plan.StatePlanned,
			From: &plan.Source{LeftoverID: 8, From: k("2026-11-10", 1)},
			Why:  []plan.Why{{Code: "leftover", RecipeID: 11, Date: "2026-11-10"}}},
	}
	if !reflect.DeepEqual(got.Upserts, wantUpserts) {
		t.Errorf("Upserts = %+v\nwant     %+v", got.Upserts, wantUpserts)
	}
	if want := []plan.Key{k("2026-11-12", 1)}; !reflect.DeepEqual(got.Deletes, want) {
		t.Errorf("Deletes = %v, want %v (only the dropped unpinned meal; kept, pinned and re-placed stay)", got.Deletes, want)
	}
	wantUnfilled := []plan.Unfilled{
		{Key: k("2026-11-12", 1), Reason: "no_candidates", SlotRuleClaimed: true, Eliminated: plan.Eliminations{Considered: 4, Exclusion: 1, CoolDown: 3}},
		{Key: k("2026-11-14", 1), Reason: "no_attendance"},
	}
	if !reflect.DeepEqual(got.Unfilled, wantUnfilled) {
		t.Errorf("Unfilled = %+v\nwant       %+v", got.Unfilled, wantUnfilled)
	}
	wantClear := []plan.Key{k("2026-11-10", 1), k("2026-11-11", 1), k("2026-11-13", 1), k("2026-11-15", 1)}
	if !reflect.DeepEqual(got.ClearUnfilled, wantClear) {
		t.Errorf("ClearUnfilled = %v, want %v (every considered slot that is not Unfilled, in snapshot order)", got.ClearUnfilled, wantClear)
	}
}

func TestReconcileNeverTouchesCookedOrSkippedMeals(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{slotInfo("2026-11-10", 1, "19:00", 1), slotInfo("2026-11-11", 1, "19:00", 1)}
	s.Meals = []plan.Meal{
		{Key: k("2026-11-10", 1), RecipeID: 1, Batches: 1, State: plan.StateCooked},
		{Key: k("2026-11-11", 1), RecipeID: 2, State: plan.StateSkipped},
	}
	got := plan.Reconcile(s, planner.Result{})
	if len(got.Upserts) != 0 || len(got.Deletes) != 0 {
		t.Errorf("Upserts=%v Deletes=%v; a Cooked or skipped meal must not change", got.Upserts, got.Deletes)
	}
}

func TestReconcileLeavesUnconfirmedMealsWhoseSlotIsOverAlone(t *testing.T) {
	s := baseSnapshot()
	s.Now = time.Date(2026, 11, 10, 8, 0, 0, 0, time.UTC)
	s.Slots = []plan.SlotInfo{slotInfo("2026-11-09", 1, "19:00", 1)}
	s.Meals = []plan.Meal{{Key: k("2026-11-09", 1), RecipeID: 1, Batches: 1, State: plan.StatePlanned}}
	got := plan.Reconcile(s, planner.Result{}) // the planner saw it as Pinned, so it is neither Kept nor placed
	if len(got.Deletes) != 0 {
		t.Errorf("Deletes = %v; last night's unconfirmed meal must stay in To confirm", got.Deletes)
	}
}

// N1: a placement served from a stored Leftover (planner.LeftoverSource with only LeftoverID) is stored with the
// Leftover's source slot, so "Leftover from <day>" survives the replan after Cooked.
func TestReconcileFillsTheSourceSlotOfAStoredLeftover(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{slotInfo("2026-11-11", 1, "19:00", 1)}
	s.Leftovers = []plan.Leftover{{ID: 8, RecipeID: 11, From: k("2026-11-10", 2), Portions: 2, Status: plan.LeftoverAvailable}}
	res := planner.Result{Placements: []planner.Placement{
		{Key: pk("2026-11-11", 1), Source: planner.SourceLeftover, RecipeID: 11, Portions: 2, From: &planner.LeftoverSource{LeftoverID: 8}},
	}}
	got := plan.Reconcile(s, res)
	if len(got.Upserts) != 1 || got.Upserts[0].From == nil {
		t.Fatalf("upserts = %+v", got.Upserts)
	}
	if want := (plan.Source{LeftoverID: 8, From: k("2026-11-10", 2)}); *got.Upserts[0].From != want {
		t.Errorf("From = %+v, want %+v", *got.Upserts[0].From, want)
	}
}
