package runner_test

import (
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

// B9-11 (SAFE-03): Cooked and Not cooked can be taken back until the end of the household day they were marked on.
// chickenWeek: Monday 2026-11-09 is a pinned chicken dinner (Yield 4, two eat, 400 g thighs + 250 g rice a Batch), Tuesday
// is served from its two extra portions. The fake Stock gives each Ingredient one Lot, id 1000 + the Ingredient's id.

// openRows is the plan rows without their timestamps: what "the same plan rows" means for Reopen.
func (e *env) openRows() []string {
	return e.rowsOf(`SELECT id, date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, from_leftover_id,
		from_date, from_meal_slot_id, from_course_id, relaxed, why_json, resolved_at FROM planned_meals ORDER BY date, meal_slot_id, course_id`)
}

func (e *env) leftoverPortions() []string {
	return e.rowsOf(`SELECT id, portions, status FROM leftovers ORDER BY id`)
}

func takenOf(calls [][]runner.Take) map[int64]float64 {
	out := map[int64]float64{}
	for _, c := range calls {
		for _, t := range c {
			out[t.IngredientID] += t.Taken
		}
	}
	return out
}

func TestCookedKeepsARecordOfWhatItTook(t *testing.T) {
	e := chickenWeek(t)
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	rows := e.rowsOf(`SELECT kind, marked_on, lot_json, reopened_at FROM cooked_takes`)
	if len(rows) != 1 {
		t.Fatalf("cooked_takes = %v, want one record", rows)
	}
	for _, want := range []string{"kind=cooked", "marked_on=2026-11-09", "1011", "1013", "reopened_at=<nil>"} {
		if !strings.Contains(rows[0], want) {
			t.Errorf("record %s lacks %s", rows[0], want)
		}
	}
}

func TestANotCookedKeepsARecordToo(t *testing.T) {
	e := chickenWeek(t)
	if _, err := e.r.NotCooked(ctx, e.key(9)); err != nil {
		t.Fatal(err)
	}
	rows := e.rowsOf(`SELECT kind, marked_on, reopened_at FROM cooked_takes`)
	if len(rows) != 1 || !strings.Contains(rows[0], "kind=not_cooked") || !strings.Contains(rows[0], "marked_on=2026-11-09") {
		t.Errorf("cooked_takes = %v, want one not_cooked record marked today", rows)
	}
}

func TestReopenCookedGivesTheStockBackRemovesTheLeftoverAndRelinksTheDependant(t *testing.T) {
	e := chickenWeek(t)
	e.stock.mu.Lock()
	e.stock.published = nil
	e.stock.mu.Unlock()
	before := e.openRows()
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	if e.meal(10).From == nil || e.meal(10).From.LeftoverID == 0 {
		t.Fatal("set-up: Tuesday should be linked to the recorded Leftover")
	}
	e.clk.Advance(time.Hour)
	res, err := e.r.Reopen(ctx, e.key(9))
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Meals) != 1 || res.Meals[0].Key != e.key(9) || res.Meals[0].State != plan.StatePlanned {
		t.Errorf("reopened = %+v, want Monday's meal, planned again", res.Meals)
	}
	if got := e.openRows(); !reflect.DeepEqual(got, before) {
		t.Errorf("plan rows after Cooked and Reopen differ from before Cooked:\n got  %v\n want %v", got, before)
	}
	if n := e.leftoverPortions(); len(n) != 0 {
		t.Errorf("leftovers = %v, want none: the Leftover Cooked made is removed", n)
	}
	if want := map[int64]float64{11: 400, 13: 250}; !reflect.DeepEqual(takenOf(e.stock.giveBacks), want) {
		t.Errorf("given back = %v, want what Cooked took %v", takenOf(e.stock.giveBacks), want)
	}
	if len(e.stock.giveBacks) != 1 || len(e.stock.giveBackPublished) != 1 {
		t.Errorf("give-backs %d, published %d, want one of each (the event comes after the commit)", len(e.stock.giveBacks), len(e.stock.giveBackPublished))
	}
	if n := e.rowsOf(`SELECT reopened_at FROM cooked_takes WHERE reopened_at IS NOT NULL`); len(n) != 1 {
		t.Errorf("the record is not marked reopened: %v", n)
	}
}

func TestReopenIsIdempotent(t *testing.T) {
	e := chickenWeek(t)
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	if _, err := e.r.Reopen(ctx, e.key(9)); err != nil {
		t.Fatal(err)
	}
	rows := e.openRows()
	res, err := e.r.Reopen(ctx, e.key(9))
	if err != nil || len(res.Meals) != 0 {
		t.Errorf("second Reopen = %+v, %v, want no error and nothing reopened", res, err)
	}
	if len(e.stock.giveBacks) != 1 {
		t.Errorf("Stock was given back %d times, want once", len(e.stock.giveBacks))
	}
	if !reflect.DeepEqual(e.openRows(), rows) {
		t.Error("the second Reopen changed the plan")
	}
	// A meal that was never marked is open already.
	if res, err := e.r.Reopen(ctx, e.key(11)); err != nil || len(res.Meals) != 0 {
		t.Errorf("Reopen of an open meal = %+v, %v, want no error and nothing reopened", res, err)
	}
}

func TestReopenCookedIsRefusedOnceSomeOfItsLeftoverWasHad(t *testing.T) {
	for _, action := range []string{"had", "threw out"} {
		t.Run(action, func(t *testing.T) {
			e := chickenWeek(t)
			if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
				t.Fatal(err)
			}
			l := e.leftoverOf(9)
			var err error
			if action == "had" {
				_, err = e.r.HadIt(ctx, l.ID, 1, loUser)
			} else {
				_, err = e.r.ThrewOut(ctx, l.ID, 1, loUser)
			}
			if err != nil {
				t.Fatal(err)
			}
			rows := e.openRows()
			if _, err := e.r.Reopen(ctx, e.key(9)); !errors.Is(err, runner.ErrLeftoverUsed) {
				t.Fatalf("Reopen = %v, want ErrLeftoverUsed", err)
			}
			if e.meal(9).State != plan.StateCooked || !reflect.DeepEqual(e.openRows(), rows) || len(e.stock.giveBacks) != 0 {
				t.Error("a refused Reopen changed something: it must change nothing")
			}
		})
	}
}

func (e *env) leftoverOf(day int) plan.Leftover {
	e.t.Helper()
	l, ok, err := e.st.LeftoverFrom(ctx, e.key(day))
	if err != nil || !ok {
		e.t.Fatalf("no Leftover from the meal of the %dth: %v", day, err)
	}
	return l
}

func TestReopenIsAllowedUntilTheLastMinuteOfTheHouseholdDayAndRefusedAfter(t *testing.T) {
	e := chickenWeek(t)
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	e.clk.Advance(11*time.Hour + 58*time.Minute) // 23:59 on Monday
	e2 := chickenWeek(t)
	if _, err := e2.r.Cooked(ctx, e2.key(9), nil); err != nil {
		t.Fatal(err)
	}
	e2.clk.Advance(12*time.Hour + 29*time.Minute) // 00:30 on Tuesday
	if _, err := e2.r.Reopen(ctx, e2.key(9)); !errors.Is(err, runner.ErrReopenWindowOver) {
		t.Errorf("Reopen on the next day = %v, want ErrReopenWindowOver", err)
	}
	if e2.meal(9).State != plan.StateCooked || len(e2.stock.giveBacks) != 0 {
		t.Error("a refused Reopen changed something")
	}
	if _, err := e.r.Reopen(ctx, e.key(9)); err != nil {
		t.Errorf("Reopen at 23:59 = %v, want it allowed", err)
	}
}

func TestAMealMarkedBeforeThereWereRecordsCannotBeReopened(t *testing.T) {
	e := chickenWeek(t)
	if err := e.st.MarkResolved(ctx, e.key(9), plan.StateCooked); err != nil { // as the app of before did: no record
		t.Fatal(err)
	}
	if _, err := e.r.Reopen(ctx, e.key(9)); !errors.Is(err, runner.ErrReopenWindowOver) {
		t.Errorf("Reopen with no record = %v, want ErrReopenWindowOver: the window never opened", err)
	}
}

func TestNotCookedThenReopenGivesTheSamePlanRows(t *testing.T) {
	e := chickenWeek(t)
	if _, err := e.r.Confirm(ctx, e.key(10)); err != nil { // Tuesday's Leftover meal is Pinned: Not cooked unpins it
		t.Fatal(err)
	}
	e.clk.Advance(time.Hour)
	before := e.openRows()
	if _, err := e.r.NotCooked(ctx, e.key(9)); err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(e.openRows(), before) || e.meal(10).Pinned {
		t.Fatal("set-up: Not cooked should have unpinned and replanned Tuesday")
	}
	e.clk.Advance(time.Hour)
	if _, err := e.r.Reopen(ctx, e.key(9)); err != nil {
		t.Fatal(err)
	}
	if got := e.openRows(); !reflect.DeepEqual(got, before) {
		t.Errorf("plan rows after Not cooked and Reopen differ from before:\n got  %v\n want %v", got, before)
	}
	if len(e.stock.giveBacks) != 0 {
		t.Error("Not cooked took no Stock, so Reopen gives none back")
	}
}

func TestReopenPutsBackThePortionsACookedLeftoverMealTook(t *testing.T) {
	e := chickenWeek(t)
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	e.clk.Advance(24 * time.Hour) // Tuesday noon: Monday can no longer be reopened, Tuesday's dinner is due
	if _, err := e.r.Cooked(ctx, e.key(10), nil); err != nil {
		t.Fatal(err)
	}
	if got := e.leftoverPortions(); len(got) != 1 || !strings.Contains(got[0], "portions=0") {
		t.Fatalf("set-up: leftovers = %v, want the Leftover used up", got)
	}
	res, err := e.r.Reopen(ctx, e.key(10))
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Meals) != 1 || e.meal(10).State != plan.StatePlanned {
		t.Errorf("Tuesday = %+v, want it planned again", e.meal(10))
	}
	if got := e.leftoverPortions(); len(got) != 1 || !strings.Contains(got[0], "portions=2") {
		t.Errorf("leftovers = %v, want the 2 portions Tuesday had taken put back", got)
	}
	if len(e.stock.giveBacks) != 0 {
		t.Error("a meal served from a Leftover took no Stock: nothing is given back")
	}
	if e.meal(9).State != plan.StateCooked {
		t.Error("Monday is still Cooked")
	}
}

func TestReopenReportsTheStockLotsThatAreGoneAndStillReopens(t *testing.T) {
	e := chickenWeek(t)
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	e.stock.gone = map[int64]bool{1011: true} // the chicken Lot was used up or deleted since
	res, err := e.r.Reopen(ctx, e.key(9))
	if err != nil {
		t.Fatal(err)
	}
	if res.StockGone != 1 || len(res.Meals) != 1 || e.meal(9).State != plan.StatePlanned {
		t.Errorf("result = %+v, Monday = %v; want 1 Lot gone, and the meal reopened all the same", res, e.meal(9).State)
	}
}

func TestAFailedGiveBackRollsTheWholeReopenBack(t *testing.T) {
	e := chickenWeek(t)
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	rows, lefts, n := e.openRows(), e.leftoverPortions(), e.bus.count("plan")
	e.stock.giveBackErr = errBoom
	if _, err := e.r.Reopen(ctx, e.key(9)); !errors.Is(err, errBoom) {
		t.Fatalf("Reopen = %v, want the Stock error", err)
	}
	if !reflect.DeepEqual(e.openRows(), rows) || !reflect.DeepEqual(e.leftoverPortions(), lefts) || e.bus.count("plan") != n || len(e.stock.giveBackPublished) != 0 {
		t.Error("a failed Reopen left rows changed or an event published")
	}
	if e.rowsOf(`SELECT 1 FROM cooked_takes WHERE reopened_at IS NOT NULL`) != nil {
		t.Error("the record was marked reopened although the Reopen failed")
	}
}

func TestACookedMealCanBeCookedAgainAfterItWasReopened(t *testing.T) {
	e := chickenWeek(t)
	for i := 0; i < 2; i++ {
		if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
			t.Fatalf("Cooked #%d: %v", i+1, err)
		}
		if i == 0 {
			if _, err := e.r.Reopen(ctx, e.key(9)); err != nil {
				t.Fatal(err)
			}
		}
	}
	if e.meal(9).State != plan.StateCooked {
		t.Error("Monday is not Cooked after Cooked after all")
	}
	if got := e.rowsOf(`SELECT reopened_at IS NULL AS open FROM cooked_takes ORDER BY id`); !reflect.DeepEqual(got, []string{"open=0", "open=1"}) {
		t.Errorf("records = %v, want the first reopened and the second open", got)
	}
	if _, err := e.r.Reopen(ctx, e.key(9)); err != nil {
		t.Errorf("Reopen of the second Cooked = %v", err)
	}
}

func TestReopenPublishesAPlanEventNamingWhoDidIt(t *testing.T) {
	e := chickenWeek(t)
	if _, err := e.r.NotCooked(ctx, e.key(9)); err != nil {
		t.Fatal(err)
	}
	n := e.bus.count("plan")
	if _, err := e.r.Reopen(runner.WithActor(ctx, runner.Actor{UserID: 7, Name: "Anna"}), e.key(9)); err != nil {
		t.Fatal(err)
	}
	if e.bus.count("plan") != n+1 {
		t.Fatalf("plan events %d -> %d, want one more", n, e.bus.count("plan"))
	}
	ev := e.eventOf()
	by, _ := ev["by"].(map[string]any)
	if ev["reason"] != string(plan.ReasonReopened) || by["name"] != "Anna" {
		t.Errorf("event = %v, want reason %q by Anna", ev, plan.ReasonReopened)
	}
}

func TestTheViewSaysHowAResolvedMealWasMarkedAndWhetherItCanBeUndone(t *testing.T) {
	main := func(e *env, date string) *runner.Resolution {
		t.Helper()
		v, err := e.r.View(ctx, date, date)
		if err != nil {
			t.Fatal(err)
		}
		for _, c := range v.Slots[0].Courses {
			if c.Main {
				return c.Resolution
			}
		}
		t.Fatal("no main Course in the view")
		return nil
	}
	e := chickenWeek(t)
	if r := main(e, "2026-11-09"); r != nil {
		t.Errorf("an open meal has Resolution %+v, want nil", r)
	}
	if _, err := e.r.Cooked(runner.WithActor(ctx, runner.Actor{UserID: 7, Name: "Anna"}), e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	r := main(e, "2026-11-09")
	if r == nil || r.Kind != "cooked" || r.MarkedOn != "2026-11-09" || r.UserID != 7 || r.LeftoverPortions != 2 || !r.CanUndo || r.CannotUndo != "" || r.MarkedAt.IsZero() {
		t.Fatalf("resolution = %+v, want cooked today by user 7 with 2 Leftover portions, undoable", r)
	}
	if _, err := e.r.HadIt(ctx, e.leftoverOf(9).ID, 1, loUser); err != nil {
		t.Fatal(err)
	}
	if r := main(e, "2026-11-09"); r == nil || r.CanUndo || r.CannotUndo != "leftover_used" {
		t.Errorf("after some Leftover was had: %+v, want CanUndo false because leftover_used", r)
	}
	e.clk.Advance(24 * time.Hour)
	if r := main(e, "2026-11-09"); r == nil || r.CanUndo || r.CannotUndo != "window_over" {
		t.Errorf("the next day: %+v, want CanUndo false because window_over (the day over wins over a used Leftover)", r)
	}
}

func TestTheViewOfNotCookedIsUndoable(t *testing.T) {
	e := chickenWeek(t)
	if _, err := e.r.NotCooked(ctx, e.key(9)); err != nil {
		t.Fatal(err)
	}
	v, err := e.r.View(ctx, "2026-11-09", "2026-11-09")
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range v.Slots[0].Courses {
		if c.Main && (c.Resolution == nil || c.Resolution.Kind != "not_cooked" || !c.Resolution.CanUndo) {
			t.Errorf("resolution = %+v, want not_cooked and undoable", c.Resolution)
		}
	}
}

// --- Mark all Cooked: one action, undone as a whole ---

func markAllEnv(t *testing.T) *cenv {
	t.Helper()
	c := newCourseEnv(t)
	c.oneDay()
	roast := c.recipe("roast", false, c.main)
	beans := c.recipe("beans", false, c.side)
	for i := range c.src.recipes {
		switch int64(c.src.recipes[i].ID) {
		case roast:
			c.src.recipes[i].Needs = []planner.Need{{IngredientID: 11, Quantity: 300}}
		case beans:
			c.src.recipes[i].Needs = []planner.Need{{IngredientID: 12, Quantity: 100}}
		}
	}
	c.serve(cspec{course: c.main}, cspec{course: c.side})
	c.mustPlan()
	return c
}

func TestReopenAllReopensEveryCourseOfAMarkAllCookedAndGivesItsStockBackOnce(t *testing.T) {
	c := markAllEnv(t)
	rows := c.openRows()
	if _, err := c.r.CookedAll(ctx, "2026-11-09", c.slotIDs[1], nil); err != nil {
		t.Fatal(err)
	}
	res, err := c.r.ReopenAll(ctx, "2026-11-09", c.slotIDs[1])
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Meals) != 2 || res.Meals[0].Key.CourseID != c.main || res.Meals[1].Key.CourseID != c.side {
		t.Errorf("reopened = %+v, want the Main then the Side", res.Meals)
	}
	if len(c.stock.giveBacks) != 1 || !reflect.DeepEqual(takenOf(c.stock.giveBacks), map[int64]float64{11: 300, 12: 100}) {
		t.Errorf("give-backs = %v, want one call that gives back the Main's and the Side's Stock", c.stock.giveBacks)
	}
	if got := c.openRows(); !reflect.DeepEqual(got, rows) {
		t.Errorf("rows after Mark all Cooked and Reopen differ from before:\n got  %v\n want %v", got, rows)
	}
}

func TestReopeningOneCourseOfAMarkAllCookedReopensTheWholeAction(t *testing.T) {
	c := markAllEnv(t)
	if _, err := c.r.CookedAll(ctx, "2026-11-09", c.slotIDs[1], nil); err != nil {
		t.Fatal(err)
	}
	res, err := c.r.Reopen(ctx, c.cell(9, c.side))
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Meals) != 2 || c.mustMeal(9, c.main).State != plan.StatePlanned || c.mustMeal(9, c.side).State != plan.StatePlanned {
		t.Errorf("reopened = %+v: the Stock of a Mark all Cooked is taken in one go and is given back in one go", res.Meals)
	}
}

func TestNotCookedAllCanBeReopenedAsAWhole(t *testing.T) {
	c := markAllEnv(t)
	rows := c.openRows()
	if _, err := c.r.NotCookedAll(ctx, "2026-11-09", c.slotIDs[1]); err != nil {
		t.Fatal(err)
	}
	res, err := c.r.ReopenAll(ctx, "2026-11-09", c.slotIDs[1])
	if err != nil || len(res.Meals) != 2 {
		t.Fatalf("ReopenAll = %+v, %v, want both Courses", res, err)
	}
	if got := c.openRows(); !reflect.DeepEqual(got, rows) {
		t.Errorf("rows after Mark all Not cooked and Reopen differ from before:\n got  %v\n want %v", got, rows)
	}
}
