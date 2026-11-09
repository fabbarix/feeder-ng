package runner_test

import (
	"context"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
)

func TestPlanFillsThePlanningHorizonWithDistinctRecipesAndWhyChips(t *testing.T) {
	e := newEnv(t)
	sum, err := e.r.Plan(ctx, plan.ReasonNightly)
	if err != nil {
		t.Fatal(err)
	}
	if sum.Placed != 3 || sum.Unfilled != 0 {
		t.Errorf("Summary = %+v, want 3 placed and none unfilled", sum)
	}
	seen := map[int64]bool{}
	for day := 9; day <= 11; day++ {
		m := e.meal(day)
		if m.State != plan.StatePlanned || m.Pinned || m.Batches != 1 || m.Portions != 2 || !m.Fresh() {
			t.Errorf("meal on the %dth = %+v; want planned, unpinned, 1 Batch for 2 portions", day, m)
		}
		if len(m.Why) < 1 || len(m.Why) > 3 {
			t.Errorf("meal on the %dth has %d why chips, want 1 to 3", day, len(m.Why))
		}
		if seen[m.RecipeID] {
			t.Errorf("Recipe %d planned twice within its Cool-down", m.RecipeID)
		}
		seen[m.RecipeID] = true
	}
	if n := len(e.planMeals()); n != 3 {
		t.Errorf("%d meals stored, want 3", n)
	}
	if e.bus.count("plan") != 1 {
		t.Errorf("published %d plan events, want 1", e.bus.count("plan"))
	}
}

func TestPlanKeepsValidUnpinnedMealsAndNeverTouchesPinnedOnes(t *testing.T) {
	e := newEnv(t)
	e.mustPlan()
	before := e.planMeals()
	pinned, err := e.r.SetMeal(ctx, e.key(10), e.rec["curry"], nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.r.Plan(ctx, plan.ReasonRecipeChanged); err != nil {
		t.Fatal(err)
	}
	if got := e.meal(10); got.RecipeID != e.rec["curry"] || !got.Pinned || got.ID != pinned.ID {
		t.Errorf("Pinned meal changed: %+v", got)
	}
	if got := e.meal(9); got.RecipeID != before[0].RecipeID {
		t.Errorf("a valid unpinned meal changed on a plain Plan: %d -> %d", before[0].RecipeID, got.RecipeID)
	}
}

func TestPlanDoesNotPlanEmptySlotsWhoseTimeHasPassed(t *testing.T) {
	e := newEnv(t)
	e.clk.Set(time.Date(2026, 11, 9, 20, 0, 0, 0, time.UTC)) // after Monday's 19:00 dinner
	e.mustPlan()
	if _, err := e.st.Meal(ctx, e.key(9)); err == nil {
		t.Error("planned a meal in a slot that was already over")
	}
	if un, _ := e.st.Unfilled(ctx, "", ""); len(un) != 0 {
		t.Errorf("a past slot must not become a 'couldn't plan' entry: %+v", un)
	}
	if n := len(e.planMeals()); n != 2 {
		t.Errorf("%d meals, want 2 (Tuesday and Wednesday)", n)
	}
}

func TestRegenerateBumpsTheGenerationAndRedoesOnlyUnpinnedMeals(t *testing.T) {
	e := newEnv(t)
	e.mustPlan()
	if _, err := e.r.Confirm(ctx, e.key(9)); err != nil {
		t.Fatal(err)
	}
	pinned := e.meal(9)
	gen0, _ := e.st.Generation(ctx)
	sum, err := e.r.Regenerate(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if gen1, _ := e.st.Generation(ctx); gen1 != gen0+1 {
		t.Errorf("generation %d -> %d, want +1", gen0, gen1)
	}
	if sum.Kept != 0 {
		t.Errorf("Regenerate kept %d unpinned meals; it must redo them all", sum.Kept)
	}
	if got := e.meal(9); got.RecipeID != pinned.RecipeID || !got.Pinned {
		t.Errorf("Regenerate changed a Pinned meal: %+v -> %+v", pinned, got)
	}
	if n := len(e.planMeals()); n != 3 {
		t.Errorf("%d meals after Regenerate, want 3", n)
	}
}

func TestPlanReplansAMealWhoseRecipeWasArchived(t *testing.T) {
	e := newEnv(t)
	e.mustPlan()
	old := e.meal(10).RecipeID
	e.src.archive(old)
	if _, err := e.r.Plan(ctx, plan.ReasonRecipeChanged); err != nil {
		t.Fatal(err)
	}
	if got := e.meal(10); got.RecipeID == old {
		t.Error("an archived Recipe stayed planned")
	}
}

func TestPlanRecordsWhyASlotCouldNotBePlanned(t *testing.T) {
	e := newEnv(t)
	e.mustPlan()
	e.src.setAttendance(e.key(10).MealSlotID, "2026-11-10", nil) // nobody eats on Tuesday
	if _, err := e.r.Plan(ctx, plan.ReasonAttendanceChanged); err != nil {
		t.Fatal(err)
	}
	if _, err := e.st.Meal(ctx, e.key(10)); err == nil {
		t.Error("the planned meal of a slot with no Attendance must be removed")
	}
	un, _ := e.st.Unfilled(ctx, "", "")
	if len(un) != 1 || un[0].Key != e.key(10) || un[0].Reason != "no_attendance" {
		t.Fatalf("Unfilled = %+v, want Tuesday no_attendance", un)
	}
	cp, err := e.r.CouldntPlan(ctx)
	if err != nil || len(cp) != 1 || cp[0].Unfilled == nil || cp[0].Key != e.key(10) {
		t.Errorf("CouldntPlan = %+v, %v", cp, err)
	}
	// Attendance comes back: the next run fills the slot and the reason disappears.
	e.src.clearAttendance()
	e.mustPlan()
	if _, err := e.st.Meal(ctx, e.key(10)); err != nil {
		t.Errorf("Tuesday was not planned once Attendance returned: %v", err)
	}
	if un, _ := e.st.Unfilled(ctx, "", ""); len(un) != 0 {
		t.Errorf("stale reasons kept: %+v", un)
	}
}

func TestPlanExplainsEliminationsWhenEveryOptionIsInCoolDown(t *testing.T) {
	e := newEnv(t)
	e.src.recipes = e.src.recipes[:1] // a single Recipe: Tuesday and Wednesday are in its Cool-down
	e.mustPlan()
	un, _ := e.st.Unfilled(ctx, "", "")
	if len(un) != 2 {
		t.Fatalf("Unfilled = %+v, want Tuesday and Wednesday", un)
	}
	if un[0].Reason != "no_candidates" || un[0].Eliminated.Considered != 1 || un[0].Eliminated.CoolDown != 1 {
		t.Errorf("Tuesday's reason = %+v, want no_candidates with the one Recipe eliminated by Cool-down", un[0])
	}
}

func TestNightlyDiscardsExpiredLeftoversRecordsWasteOnceThenPlans(t *testing.T) {
	e := newEnv(t)
	src := plan.Key{Date: "2026-11-05", MealSlotID: e.slotIDs[4]}
	old, _ := e.st.AddLeftover(ctx, plan.Leftover{RecipeID: e.rec["chicken"], From: src, Portions: 3, CookedOn: "2026-11-05", UseBy: "2026-11-08"})
	fresh, _ := e.st.AddLeftover(ctx, plan.Leftover{RecipeID: e.rec["stew"], From: src, Portions: 2, CookedOn: "2026-11-08", UseBy: "2026-11-09"}) // good today
	if err := e.r.Nightly(ctx, "2026-11-09"); err != nil {
		t.Fatal(err)
	}
	if err := e.r.Nightly(ctx, "2026-11-09"); err != nil {
		t.Fatal(err)
	}
	if want := []runner.LeftoverWaste{{LeftoverID: old.ID, RecipeID: e.rec["chicken"], Portions: 3, On: "2026-11-09"}}; len(e.stock.waste) != 1 || e.stock.waste[0] != want[0] {
		t.Errorf("waste = %+v, want exactly %+v (once, even though Nightly ran twice)", e.stock.waste, want)
	}
	if l, _ := e.st.Leftover(ctx, old.ID); l.Status != plan.LeftoverDiscarded {
		t.Errorf("expired Leftover status = %q", l.Status)
	}
	if l, _ := e.st.Leftover(ctx, fresh.ID); l.Status != plan.LeftoverAvailable {
		t.Errorf("a Leftover is still good on its Use-by date, got %q", l.Status)
	}
	if n := len(e.planMeals()); n == 0 {
		t.Error("Nightly must plan after discarding")
	}
}

func TestDiscardExpiredUnpinsPinnedDependantsAndSurvivesAWasteRecordingFailure(t *testing.T) {
	e := newEnv(t)
	src := plan.Key{Date: "2026-11-05", MealSlotID: e.slotIDs[4]}
	l, _ := e.st.AddLeftover(ctx, plan.Leftover{RecipeID: e.rec["chicken"], From: src, Portions: 2, CookedOn: "2026-11-05", UseBy: "2026-11-08"})
	e.st.SaveMeal(ctx, plan.Meal{Key: e.key(9), RecipeID: e.rec["chicken"], Portions: 2, State: plan.StatePlanned, Pinned: true,
		From: &plan.Source{LeftoverID: l.ID, From: src}})
	e.stock.wasteErr = errBoom
	n, err := e.r.DiscardExpired(ctx)
	if n != 1 {
		t.Fatalf("discarded %d, want 1 (err %v)", n, err)
	}
	if got := e.meal(9); got.Pinned {
		t.Error("the meal served from a discarded Leftover must be unpinned for replanning")
	}
}

func TestInvalidateCoalescesIntoPlanRuns(t *testing.T) {
	e := newEnv(t)
	c, cancel := context.WithCancel(ctx)
	defer cancel()
	go e.r.Start(c)
	for i := 0; i < 5; i++ {
		e.r.Invalidate(plan.ReasonRecipeChanged)
	}
	if err := e.r.WaitIdle(c); err != nil {
		t.Fatal(err)
	}
	if n := len(e.planMeals()); n != 3 {
		t.Errorf("%d meals after the invalidations, want 3", n)
	}
	if e.src.calls < 1 || e.src.calls > 5 {
		t.Errorf("%d runs for 5 invalidations, want between 1 and 5 (coalesced, never zero)", e.src.calls)
	}
}

func TestInvalidateNeverBlocksTheCaller(t *testing.T) {
	e := newEnv(t) // no worker started
	done := make(chan struct{})
	go func() {
		for i := 0; i < 1000; i++ {
			e.r.Invalidate(plan.ReasonStockTake)
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Invalidate blocked without a worker")
	}
}
