package runner_test

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

func f64(v float64) *float64 { return &v }

func attendees(n int) []plan.Attendee {
	var out []plan.Attendee
	for i := 1; i <= n; i++ {
		out = append(out, plan.Attendee{MemberID: int64(i), Factor: 1})
	}
	return out
}

// chickenOnMonday plans the horizon, then Pins Monday's dinner as chicken (yield 4 for 2 portions). Tuesday is then
// served from the 2 extra portions and Wednesday is a fresh yield-2 Recipe.
func chickenOnMonday(t *testing.T, e *env) {
	t.Helper()
	e.mustPlan()
	if _, err := e.r.SetMeal(ctx, e.key(9), e.rec["chicken"], nil); err != nil {
		t.Fatal(err)
	}
	tue := e.meal(10)
	if tue.Fresh() || tue.RecipeID != e.rec["chicken"] || tue.From.From != e.key(9) || tue.Pinned {
		t.Fatalf("set-up: Tuesday should be an unpinned chicken Leftover meal from Monday, got %+v", tue)
	}
}

func TestSetMealPinsItAndReplansOnlyTheUnpinnedSlotsAfterIt(t *testing.T) {
	e := newEnv(t)
	e.mustPlan()
	monday := e.meal(9)
	events := e.bus.count("plan")
	got, err := e.r.SetMeal(ctx, e.key(10), e.rec["curry"], nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.RecipeID != e.rec["curry"] || !got.Pinned || got.State != plan.StatePlanned || got.Batches != 1 {
		t.Errorf("SetMeal = %+v, want a Pinned planned curry for 1 Batch", got)
	}
	if after := e.meal(9); after.ID != monday.ID || after.RecipeID != monday.RecipeID {
		t.Errorf("Monday (before the new meal) was touched: %+v -> %+v", monday, after)
	}
	wed := e.meal(11)
	if wed.Pinned || wed.RecipeID == e.rec["curry"] {
		t.Errorf("Wednesday = %+v; it must be replanned, unpinned, and not curry (Cool-down)", wed)
	}
	if e.bus.count("plan") <= events {
		t.Error("SetMeal published no plan event")
	}
}

func TestSetMealDefaultsBatchesToCoverTheAttendanceAndAcceptsAFraction(t *testing.T) {
	e := newEnv(t)
	five := attendees(5)
	e.src.setAttendance(e.key(10).MealSlotID, "2026-11-10", five)
	m, err := e.r.SetMeal(ctx, e.key(10), e.rec["chicken"], nil)
	if err != nil || m.Batches != 2 || m.Portions != 5 {
		t.Errorf("chicken (yield 4) for 5 portions = %+v, %v; want 2 Batches", m, err)
	}
	m, err = e.r.SetMeal(ctx, e.key(11), e.rec["chicken"], f64(1.5))
	if err != nil || m.Batches != 1.5 {
		t.Errorf("explicit 1.5 Batches = %+v, %v", m, err)
	}
	e.src.setAttendance(e.key(10).MealSlotID, "2026-11-10", nil)
	if m, err = e.r.SetMeal(ctx, e.key(10), e.rec["pasta"], nil); err != nil || m.Batches != 1 {
		t.Errorf("nobody attending: %+v, %v; want 1 Batch", m, err)
	}
}

func TestSetMealRefusesWhatCannotBePlanned(t *testing.T) {
	e := newEnv(t)
	e.src.archive(e.rec["stew"])
	e.mustPlan()
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	wrongDay := plan.Key{Date: "2026-11-10", MealSlotID: e.slotIDs[1]} // Monday's Meal Slot on a Tuesday
	cases := []struct {
		name    string
		key     plan.Key
		recipe  int64
		batches *float64
		want    error
	}{
		{"unknown Recipe", e.key(10), 99999, nil, runner.ErrUnknownRecipe},
		{"archived Recipe", e.key(10), e.rec["stew"], nil, runner.ErrArchivedRecipe},
		{"zero Batches", e.key(10), e.rec["pasta"], f64(0), runner.ErrInvalidBatches},
		{"negative Batches", e.key(10), e.rec["pasta"], f64(-1), runner.ErrInvalidBatches},
		{"Meal Slot of another weekday", wrongDay, e.rec["pasta"], nil, runner.ErrUnknownSlot},
		{"unknown Meal Slot", plan.Key{Date: "2026-11-10", MealSlotID: 99999}, e.rec["pasta"], nil, runner.ErrUnknownSlot},
		{"a day that is over", e.key(8), e.rec["pasta"], nil, runner.ErrInPast},
		{"an already Cooked meal", e.key(9), e.rec["pasta"], nil, runner.ErrAlreadyResolved},
	}
	for _, c := range cases {
		if _, err := e.r.SetMeal(ctx, c.key, c.recipe, c.batches); !errors.Is(err, c.want) {
			t.Errorf("%s: err = %v, want %v", c.name, err, c.want)
		}
	}
}

func TestSetMealUnpinsPinnedDependantsOfTheMealItReplaces(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	if _, err := e.r.Confirm(ctx, e.key(10)); err != nil { // Tuesday's chicken leftover is now Pinned
		t.Fatal(err)
	}
	if _, err := e.r.SetMeal(ctx, e.key(9), e.rec["curry"], nil); err != nil {
		t.Fatal(err)
	}
	tue := e.meal(10)
	if tue.Pinned || !tue.Fresh() {
		t.Errorf("Tuesday = %+v; its source is no longer chicken, so it must be unpinned and replanned as a fresh meal", tue)
	}
}

func TestConfirmPinsTheMealAsItIsAndUnpinKeepsItButRunsAPlan(t *testing.T) {
	e := newEnv(t)
	e.mustPlan()
	before := e.meal(10)
	got, err := e.r.Confirm(ctx, e.key(10))
	if err != nil || !got.Pinned || got.RecipeID != before.RecipeID || got.Batches != before.Batches {
		t.Fatalf("Confirm = %+v, %v; want the same meal, Pinned", got, err)
	}
	runs := e.src.calls
	un, err := e.r.Unpin(ctx, e.key(10))
	if err != nil || un.Pinned || un.RecipeID != before.RecipeID {
		t.Fatalf("Unpin = %+v, %v; want the same meal, not Pinned", un, err)
	}
	if e.src.calls <= runs {
		t.Error("Unpin must run the planner (spec §7.1: a meal unpinned invalidates the plan)")
	}
	if _, err := e.r.Confirm(ctx, e.key(8)); !errors.Is(err, runner.ErrNotFound) {
		t.Errorf("Confirm on an empty slot: err = %v, want ErrNotFound", err)
	}
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	if _, err := e.r.Unpin(ctx, e.key(9)); !errors.Is(err, runner.ErrAlreadyResolved) {
		t.Errorf("Unpin on a Cooked meal: err = %v, want ErrAlreadyResolved", err)
	}
}

func TestAlternativesAreThreeOtherRecipesWithWhyChipsAndWriteNothing(t *testing.T) {
	e := newEnv(t)
	e.mustPlan()
	current := e.meal(10)
	before := e.planMeals()
	alts, err := e.r.Alternatives(ctx, e.key(10))
	if err != nil {
		t.Fatal(err)
	}
	if len(alts) != 3 {
		t.Fatalf("%d alternatives, want 3", len(alts))
	}
	seen := map[int64]bool{}
	for i, a := range alts {
		if a.RecipeID == current.RecipeID {
			t.Errorf("alternative %d is the current Recipe", i)
		}
		if seen[a.RecipeID] {
			t.Errorf("Recipe %d offered twice", a.RecipeID)
		}
		seen[a.RecipeID] = true
		if a.Batches < 1 || len(a.Why) < 1 {
			t.Errorf("alternative %d = %+v; want Batches and at least one why chip", i, a)
		}
		if i > 0 && a.Score > alts[i-1].Score {
			t.Errorf("alternatives not ordered by score: %v then %v", alts[i-1].Score, a.Score)
		}
	}
	if !reflect.DeepEqual(e.planMeals(), before) {
		t.Error("Alternatives changed the stored plan")
	}
}

func TestAlternativesRefuseCookedAndSkippedMealsAndUnknownSlots(t *testing.T) {
	e := newEnv(t)
	e.mustPlan()
	e.r.Cooked(ctx, e.key(9), nil)
	if _, err := e.r.Alternatives(ctx, e.key(9)); !errors.Is(err, runner.ErrNotSwappable) {
		t.Errorf("Cooked: err = %v, want ErrNotSwappable", err)
	}
	e.clk.Set(time.Date(2026, 11, 10, 8, 0, 0, 0, time.UTC))
	e.r.NotCooked(ctx, e.key(10))
	if _, err := e.r.Alternatives(ctx, e.key(10)); !errors.Is(err, runner.ErrNotSwappable) {
		t.Errorf("skipped: err = %v, want ErrNotSwappable", err)
	}
	if _, err := e.r.Alternatives(ctx, plan.Key{Date: "2026-11-10", MealSlotID: e.slotIDs[1]}); !errors.Is(err, runner.ErrUnknownSlot) {
		t.Errorf("wrong weekday: err = %v, want ErrUnknownSlot", err)
	}
}

func TestCookPreviewProposesTheLeftoverAndListsWhatStockWillLose(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	p, err := e.r.CookPreview(ctx, e.key(9))
	if err != nil {
		t.Fatal(err)
	}
	if !p.Fresh || p.Yield != 4 || p.PortionsNeeded != 2 || p.Proposed != 2 || p.Max != 4 || p.UseBy != "2026-11-12" {
		t.Errorf("CookPreview = %+v; want fresh, yield 4, need 2, proposed 2, max 4, use-by 2026-11-12", p)
	}
	if want := []runner.Need{{IngredientID: 11, Quantity: 400}, {IngredientID: 13, Quantity: 250}}; !reflect.DeepEqual(p.Needs, want) {
		t.Errorf("Needs = %+v, want %+v (optional lines are never deducted)", p.Needs, want)
	}
	tue, err := e.r.CookPreview(ctx, e.key(10))
	if err != nil || tue.Fresh || tue.Proposed != 0 || len(tue.Needs) != 0 {
		t.Errorf("a meal served from a Leftover = %+v, %v; want not fresh, nothing proposed, nothing to deduct", tue, err)
	}
	e.r.Cooked(ctx, e.key(9), nil)
	if _, err := e.r.CookPreview(ctx, e.key(9)); !errors.Is(err, runner.ErrAlreadyResolved) {
		t.Errorf("preview of a Cooked meal: err = %v", err)
	}
}

func TestCookedDeductsStockInTheSameTransactionAndRecordsTheActualLeftover(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	warning := runner.Warning{IngredientID: 11, Name: "chicken thighs", BaseUnit: "g", Have: 300, Need: 400, Shortfall: 100,
		Message: "Stock shows only 300 g chicken thighs, the recipe uses 400 g"}
	e.stock.warnings = []runner.Warning{warning}
	events := e.bus.count("plan")

	res, err := e.r.Cooked(ctx, e.key(9), nil)
	if err != nil {
		t.Fatal(err)
	}
	if want := [][]runner.Need{{{IngredientID: 11, Quantity: 400}, {IngredientID: 13, Quantity: 250}}}; !reflect.DeepEqual(e.stock.deductions, want) {
		t.Errorf("deductions = %+v, want %+v", e.stock.deductions, want)
	}
	if len(e.stock.inTx) != 1 || !e.stock.inTx[0] {
		t.Error("Stock must be deducted inside the planning transaction (a non-nil tx)")
	}
	if len(e.stock.published) != 1 {
		t.Errorf("PublishDeduction called %d times, want once, after the commit", len(e.stock.published))
	}
	if !reflect.DeepEqual(res.Warnings, []runner.Warning{warning}) {
		t.Errorf("Warnings = %+v, want the shortfall passed through (never an error)", res.Warnings)
	}
	if res.Meal.State != plan.StateCooked || !res.Meal.Pinned {
		t.Errorf("Meal = %+v, want Cooked", res.Meal)
	}
	l := res.Leftover
	if l == nil || l.Portions != 2 || l.CookedOn != "2026-11-09" || l.UseBy != "2026-11-12" || l.From != e.key(9) || l.RecipeID != e.rec["chicken"] {
		t.Fatalf("Leftover = %+v; want 2 portions of chicken cooked 2026-11-09, Use-by 2026-11-12 (default 3 days)", l)
	}
	if tue := e.meal(10); tue.Fresh() || tue.From.LeftoverID != l.ID {
		t.Errorf("Tuesday = %+v; it must now point at the actual Leftover #%d", tue, l.ID)
	}
	if e.bus.count("plan") <= events {
		t.Error("Cooked published no plan event")
	}
}

func TestCookedUsesTheRecipesOwnUseByDays(t *testing.T) {
	e := newEnv(t)
	one := 1
	for i := range e.src.recipes {
		if int64(e.src.recipes[i].ID) == e.rec["chicken"] {
			e.src.recipes[i].UseByDays = &one
		}
	}
	chickenOnMonday(t, e)
	res, err := e.r.Cooked(ctx, e.key(9), nil)
	if err != nil || res.Leftover == nil || res.Leftover.UseBy != "2026-11-10" {
		t.Errorf("Cooked = %+v, %v; want Use-by 2026-11-10 (Recipe override of 1 day)", res.Leftover, err)
	}
}

func TestCookedLateStillDatesTheLeftoverFromTheMealsDay(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	e.clk.Set(time.Date(2026, 11, 11, 8, 0, 0, 0, time.UTC)) // confirmed on Wednesday morning
	res, err := e.r.Cooked(ctx, e.key(9), nil)
	if err != nil || res.Leftover == nil || res.Leftover.CookedOn != "2026-11-09" || res.Leftover.UseBy != "2026-11-12" {
		t.Errorf("Leftover = %+v, %v; want cooked on the meal's day, 2026-11-09", res.Leftover, err)
	}
}

func TestCookedWithASmallerLeftoverReplansTheMealsThatDependedOnIt(t *testing.T) {
	for _, pinned := range []bool{false, true} {
		name := "unpinned dependant"
		if pinned {
			name = "Pinned dependant"
		}
		t.Run(name, func(t *testing.T) {
			e := newEnv(t)
			chickenOnMonday(t, e)
			if pinned {
				e.r.Confirm(ctx, e.key(10))
			}
			res, err := e.r.Cooked(ctx, e.key(9), f64(1)) // only 1 portion left, Tuesday needs 2
			if err != nil {
				t.Fatal(err)
			}
			if res.Leftover == nil || res.Leftover.Portions != 1 {
				t.Fatalf("Leftover = %+v, want the edited 1 portion", res.Leftover)
			}
			tue := e.meal(10)
			if !tue.Fresh() || tue.Pinned || tue.RecipeID == e.rec["chicken"] {
				t.Errorf("Tuesday = %+v; it must be replanned as a fresh, unpinned meal (chicken is in Cool-down)", tue)
			}
		})
	}
}

func TestCookedWithNoLeftoverRecordsNoneAndReplansDependants(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	res, err := e.r.Cooked(ctx, e.key(9), f64(0))
	if err != nil || res.Leftover != nil {
		t.Fatalf("Cooked = %+v, %v; want no Leftover", res.Leftover, err)
	}
	if ls, _ := e.r.Leftovers(ctx); len(ls) != 0 {
		t.Errorf("Leftovers = %+v, want none", ls)
	}
	if tue := e.meal(10); !tue.Fresh() {
		t.Errorf("Tuesday = %+v, want replanned fresh", tue)
	}
}

func TestCookedWithALargerLeftoverKeepsTheDependantsAndTheExtraIsPending(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	res, err := e.r.Cooked(ctx, e.key(9), f64(4)) // the whole second Batch is left
	if err != nil || res.Leftover == nil || res.Leftover.Portions != 4 {
		t.Fatalf("Cooked = %+v, %v", res.Leftover, err)
	}
	if tue := e.meal(10); tue.Fresh() || tue.RecipeID != e.rec["chicken"] || tue.From.LeftoverID != res.Leftover.ID {
		t.Errorf("Tuesday = %+v; it must keep being served from the (larger) Leftover", tue)
	}
	if ls, _ := e.r.Leftovers(ctx); len(ls) != 1 || ls[0].Portions != 4 {
		t.Errorf("Leftovers = %+v, want one with 4 portions", ls)
	}
}

func TestCookedRejectsLeftoverPortionsOutsideZeroToBatchesTimesYield(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	for _, bad := range []float64{-1, 4.5} {
		if _, err := e.r.Cooked(ctx, e.key(9), f64(bad)); !errors.Is(err, plan.ErrInvalidLeftover) {
			t.Errorf("portions %v: err = %v, want ErrInvalidLeftover", bad, err)
		}
	}
	if m := e.meal(9); m.State != plan.StatePlanned || len(e.stock.deductions) != 0 {
		t.Errorf("a rejected confirmation changed something: %+v, %d deductions", m, len(e.stock.deductions))
	}
}

func TestCookedIsAllOrNothingWhenStockFails(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	before := e.planMeals()
	published := e.bus.count("plan")
	e.stock.deductErr = errBoom
	if _, err := e.r.Cooked(ctx, e.key(9), nil); !errors.Is(err, errBoom) {
		t.Fatalf("err = %v, want the Stock error", err)
	}
	if !reflect.DeepEqual(e.planMeals(), before) {
		t.Error("the meal changed although the deduction failed")
	}
	if ls, _ := e.r.Leftovers(ctx); len(ls) != 0 {
		t.Errorf("a Leftover was recorded: %+v", ls)
	}
	if len(e.stock.published) != 0 || e.bus.count("plan") != published {
		t.Error("something was published for a rolled-back confirmation")
	}
}

func TestCookedTwiceIsRefusedAndDeductsOnce(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	if _, err := e.r.Cooked(ctx, e.key(9), nil); !errors.Is(err, runner.ErrAlreadyResolved) {
		t.Errorf("second Cooked: err = %v, want ErrAlreadyResolved", err)
	}
	if _, err := e.r.NotCooked(ctx, e.key(9)); !errors.Is(err, runner.ErrAlreadyResolved) {
		t.Errorf("NotCooked after Cooked: err = %v, want ErrAlreadyResolved", err)
	}
	if len(e.stock.deductions) != 1 {
		t.Errorf("%d deductions, want 1", len(e.stock.deductions))
	}
	if _, err := e.r.Cooked(ctx, plan.Key{Date: "2026-11-30", MealSlotID: e.slotIDs[1]}, nil); !errors.Is(err, runner.ErrNotFound) {
		t.Errorf("Cooked on an empty slot: err = %v, want ErrNotFound", err)
	}
}

func TestCookingAMealServedFromALeftoverDeductsNothingAndUsesUpItsPortions(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	first, _ := e.r.Cooked(ctx, e.key(9), nil)
	e.clk.Set(time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)) // Tuesday: its slot is due
	res, err := e.r.Cooked(ctx, e.key(10), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(e.stock.deductions) != 1 {
		t.Errorf("%d deductions; eating a Leftover deducts no Stock", len(e.stock.deductions))
	}
	if res.Leftover != nil || len(res.Warnings) != 0 {
		t.Errorf("result = %+v; a Leftover meal records no new Leftover", res)
	}
	if l, _ := e.st.Leftover(ctx, first.Leftover.ID); l.Portions != 0 {
		t.Errorf("source Leftover has %v portions left, want 0 (Tuesday took its 2)", l.Portions)
	}
}

func TestNotCookedSkipsTheMealWithoutTouchingStockAndReplansDependants(t *testing.T) {
	for _, pinned := range []bool{false, true} {
		e := newEnv(t)
		chickenOnMonday(t, e)
		if pinned {
			e.r.Confirm(ctx, e.key(10))
		}
		m, err := e.r.NotCooked(ctx, e.key(9))
		if err != nil || m.State != plan.StateSkipped {
			t.Fatalf("NotCooked = %+v, %v", m, err)
		}
		if len(e.stock.deductions) != 0 {
			t.Error("Not cooked must not change Stock")
		}
		if ls, _ := e.r.Leftovers(ctx); len(ls) != 0 {
			t.Errorf("Leftovers = %+v; a skipped meal leaves none", ls)
		}
		if tue := e.meal(10); !tue.Fresh() || tue.Pinned {
			t.Errorf("pinned=%v: Tuesday = %+v; it lost its source and must be replanned, fresh and unpinned", pinned, tue)
		}
	}
}

func TestToConfirmListsUnconfirmedMealsTwoHoursAfterTheirSlotTime(t *testing.T) {
	e := newEnv(t)
	e.mustPlan()
	e.clk.Set(time.Date(2026, 11, 9, 20, 59, 0, 0, time.UTC))
	if got, err := e.r.ToConfirm(ctx); err != nil || len(got) != 0 {
		t.Fatalf("at 20:59 ToConfirm = %+v, %v; want none (dinner was at 19:00)", got, err)
	}
	e.clk.Set(time.Date(2026, 11, 9, 21, 0, 0, 0, time.UTC))
	got, err := e.r.ToConfirm(ctx)
	if err != nil || len(got) != 1 || got[0].Key != e.key(9) || got[0].Meal == nil {
		t.Fatalf("at 21:00 ToConfirm = %+v, %v; want Monday's dinner", got, err)
	}
	e.r.Cooked(ctx, e.key(9), nil)
	if got, _ := e.r.ToConfirm(ctx); len(got) != 0 {
		t.Errorf("after Cooked ToConfirm = %+v, want none", got)
	}
}

func TestViewListsEverySlotOfTheHorizonWithMealsAndRules(t *testing.T) {
	e := newEnv(t)
	e.mustPlan()
	rule, err := e.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: e.slotIDs[3], Tag: "pizza"})
	if err != nil {
		t.Fatal(err)
	}
	v, err := e.r.View(ctx, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if v.Today != "2026-11-09" || v.HorizonDays != 3 || len(v.Slots) != 3 {
		t.Fatalf("View = today %q, horizon %d, %d slots; want 2026-11-09, 3, 3", v.Today, v.HorizonDays, len(v.Slots))
	}
	s := v.Slots[0]
	if s.Key != e.key(9) || s.Name != "Dinner" || s.Time != "19:00" || s.Portions != 2 || s.Meal == nil ||
		!s.At.Equal(time.Date(2026, 11, 9, 19, 0, 0, 0, time.UTC)) {
		t.Errorf("Monday = %+v", s)
	}
	if wed := v.Slots[2]; len(wed.Rules) != 1 || wed.Rules[0].ID != rule.ID {
		t.Errorf("Wednesday's Rules = %+v, want the pizza rule", wed.Rules)
	}
	narrow, _ := e.r.View(ctx, "2026-11-10", "2026-11-10")
	if len(narrow.Slots) != 1 || narrow.Slots[0].Key != e.key(10) {
		t.Errorf("View(10..10) = %+v", narrow.Slots)
	}
}

func TestASlotRuleFixesItsMealSlotAndGetsASlotRuleChip(t *testing.T) {
	e := newEnv(t)
	e.src.settings.HorizonDays = 7 // Mon 9 .. Sun 15; Friday is the 13th
	// Pin four other Recipes on Monday to Thursday (no pizza among them), then add the Slot Rule and
	// replan with the rules-changed reason, which clears every unpinned meal. Pizza therefore appears
	// nowhere else in the horizon before Friday, so its Cool-down cannot block the rule (a Slot Rule never falls back).
	for day, name := range map[int]string{9: "pasta", 10: "soup", 11: "curry", 12: "stew"} {
		if _, err := e.r.SetMeal(ctx, e.key(day), e.rec[name], nil); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := e.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: e.slotIDs[5], RecipeID: e.rec["pizza"]}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.r.Plan(ctx, plan.ReasonRulesChanged); err != nil {
		t.Fatal(err)
	}
	fri := e.meal(13)
	if fri.RecipeID != e.rec["pizza"] {
		t.Fatalf("Friday = Recipe %d, want pizza (Slot Rule)", fri.RecipeID)
	}
	if len(fri.Why) == 0 || fri.Why[0].Code != string(planner.ReasonSlotRule) {
		t.Errorf("Friday's why chips = %+v; the first must be slot_rule", fri.Why)
	}
}

func TestAVarietyRuleCapsTaggedRecipesPerISOWeek(t *testing.T) {
	e := newEnv(t)
	e.src.settings.HorizonDays = 7
	for i := range e.src.recipes { // pasta, soup and curry are all "Fish"
		switch int64(e.src.recipes[i].ID) {
		case e.rec["pasta"], e.rec["soup"], e.rec["curry"]:
			e.src.recipes[i].Tags = []planner.Tag{"Fish"}
		}
	}
	if err := e.st.SetVarietyRule(ctx, plan.VarietyRule{Tag: "fish", MaxPerWeek: 1}); err != nil {
		t.Fatal(err)
	}
	e.mustPlan()
	fish := 0
	for _, m := range e.planMeals() {
		if m.Fresh() && (m.RecipeID == e.rec["pasta"] || m.RecipeID == e.rec["soup"] || m.RecipeID == e.rec["curry"]) {
			fish++
		}
	}
	if fish > 1 {
		t.Errorf("%d fresh Fish meals in the week (Mon 9 - Sun 15), the Variety Rule allows 1", fish)
	}
}

func TestPlanAfterARuleChangeReplansUnpinnedMealsThatBreakIt(t *testing.T) {
	e := newEnv(t)
	e.mustPlan()
	// Pin Monday and Tuesday so the rule's Recipe cannot be used earlier (a Slot Rule never falls back).
	e.r.Confirm(ctx, e.key(9))
	e.r.Confirm(ctx, e.key(10))
	mon, tue := e.meal(9), e.meal(10)
	var rule int64
	for _, name := range simpleRecipes {
		if id := e.rec[name]; id != mon.RecipeID && id != tue.RecipeID {
			rule = id
			break
		}
	}
	if _, err := e.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: e.key(11).MealSlotID, RecipeID: rule}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.r.Plan(ctx, plan.ReasonRulesChanged); err != nil {
		t.Fatal(err)
	}
	if wed := e.meal(11); wed.RecipeID != rule {
		t.Errorf("Wednesday = Recipe %d, want %d (the new Slot Rule), even though a meal was already planned there", wed.RecipeID, rule)
	}
	for _, before := range []plan.Meal{mon, tue} {
		got, _ := e.st.Meal(ctx, before.Key)
		if got.ID != before.ID || got.RecipeID != before.RecipeID || !got.Pinned {
			t.Errorf("a Pinned meal changed on a rule edit: %+v -> %+v", before, got)
		}
	}
	if gen, _ := e.st.Generation(ctx); gen != 1 {
		t.Errorf("generation = %d; a rule edit must not reshuffle (no Regenerate)", gen)
	}
}

// ---- R4 (QA round 2) ----

// B8: the planner stores a "leftovers for <day>" chip on the meal that makes the Leftover. When the dependant is
// replanned, the chip must go (or stay when the dependant stays).
func withFitsChip(t *testing.T, e *env, day int, fitDate string) {
	t.Helper()
	m := e.meal(day)
	m.Why = append(m.Why, plan.Why{Code: "leftover_fits", Value: 1, Date: fitDate})
	if _, err := e.st.SaveMeal(ctx, m); err != nil {
		t.Fatal(err)
	}
}

func hasFitsChip(m plan.Meal, date string) bool {
	for _, w := range m.Why {
		if w.Code == "leftover_fits" && w.Date == date {
			return true
		}
	}
	return false
}

func TestCookedWithASmallerLeftoverDropsTheStaleLeftoversForChipOnTheSourceMeal(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	withFitsChip(t, e, 9, "2026-11-10")
	if _, err := e.r.Cooked(ctx, e.key(9), f64(1)); err != nil { // Tuesday needs 2: replanned fresh
		t.Fatal(err)
	}
	if mon := e.meal(9); hasFitsChip(mon, "2026-11-10") {
		t.Errorf("Monday still says leftovers for Tuesday: %+v", mon.Why)
	}
}

func TestCookedWithAnAdequateLeftoverKeepsTheLeftoversForChip(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	withFitsChip(t, e, 9, "2026-11-10")
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	if mon := e.meal(9); !hasFitsChip(mon, "2026-11-10") {
		t.Errorf("Monday lost its leftovers-for-Tuesday chip although Tuesday is still served from it: %+v", mon.Why)
	}
}

func TestNotCookedAlsoDropsLeftoversForChipsWithNoDependant(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	withFitsChip(t, e, 9, "2026-11-10")
	if _, err := e.r.NotCooked(ctx, e.key(9)); err != nil {
		t.Fatal(err)
	}
	if mon := e.meal(9); hasFitsChip(mon, "2026-11-10") {
		t.Errorf("a skipped meal keeps a leftovers chip: %+v", mon.Why)
	}
}

// B10: only meals whose slot date is today or earlier (household zone) may be resolved.
func TestCookedAndNotCookedRefuseAFutureMealAndChangeNothing(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e) // clock: Monday 12:00; Tuesday is a future date
	if _, err := e.r.Cooked(ctx, e.key(10), nil); !errors.Is(err, plan.ErrFutureMeal) {
		t.Errorf("Cooked(future): err = %v, want plan.ErrFutureMeal", err)
	}
	if _, err := e.r.NotCooked(ctx, e.key(10)); !errors.Is(err, plan.ErrFutureMeal) {
		t.Errorf("NotCooked(future): err = %v, want plan.ErrFutureMeal", err)
	}
	if m := e.meal(10); m.State != plan.StatePlanned {
		t.Errorf("a refused future meal changed state: %+v", m)
	}
	if len(e.stock.deductions) != 0 {
		t.Error("a refused Cooked deducted Stock")
	}
}

func TestTodayEvenLaterInTheEveningMayBeCooked(t *testing.T) {
	e := newEnv(t)
	e.mustPlan()
	e.clk.Set(time.Date(2026, 11, 9, 7, 0, 0, 0, time.UTC)) // before the 19:00 slot
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Errorf("today's dinner at 07:00: %v; the date is what counts, not the time", err)
	}
}

// B13: the Cooked result says where the Leftover went.
func TestCookedReportsTheMealsTheLeftoverIsPlannedFor(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	res, err := e.r.Cooked(ctx, e.key(9), nil)
	if err != nil {
		t.Fatal(err)
	}
	var got []plan.Key
	for _, p := range res.PlannedFor {
		got = append(got, plan.Key{Date: p.Date, MealSlotID: p.MealSlotID})
	}
	if want := []plan.Key{e.key(10)}; !reflect.DeepEqual(got, want) {
		t.Errorf("PlannedFor = %v, want %v (Tuesday is served from it)", got, want)
	}
	// 4 portions: Tuesday takes 2, the other 2 are kept.
	e2 := newEnv(t)
	chickenOnMonday(t, e2)
	res, _ = e2.r.Cooked(ctx, e2.key(9), f64(4))
	if res.Leftover == nil || len(res.PlannedFor) != 1 {
		t.Errorf("result = %+v; want a Leftover planned for Tuesday only", res)
	}
}

func TestCookedWithASmallerLeftoverPlansItForNothingElse(t *testing.T) {
	e := newEnv(t)
	chickenOnMonday(t, e)
	res, err := e.r.Cooked(ctx, e.key(9), f64(1))
	if err != nil || res.Leftover == nil || len(res.PlannedFor) != 0 {
		t.Errorf("result = %+v, %v; want 1 kept portion planned for no meal", res, err)
	}
}

// N4: Cooked and Not cooked call Deps.OnResolved once, after the commit, with the meal's key; a refused or repeated
// resolution calls nothing.
func TestCookedAndNotCookedCallOnResolvedOncePerMeal(t *testing.T) {
	var got []plan.Key
	e := newEnvWith(t, func(d *runner.Deps) {
		d.OnResolved = func(_ context.Context, k plan.Key) { got = append(got, k) }
	})
	e.mustPlan()
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	if _, err := e.r.NotCooked(ctx, e.key(10)); err != nil {
		t.Fatal(err)
	}
	if _, err := e.r.Cooked(ctx, e.key(9), nil); !errors.Is(err, runner.ErrAlreadyResolved) {
		t.Fatalf("second Cooked: %v", err)
	}
	if want := []plan.Key{e.key(9), e.key(10)}; !reflect.DeepEqual(got, want) {
		t.Errorf("OnResolved keys = %v, want %v", got, want)
	}
}
