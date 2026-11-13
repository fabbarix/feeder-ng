package runner_test

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
)

// B5-LO (ADR 0012, docs/dev/design/b5-lo.md §5): Leftovers by hand in the runner. The clock reads Monday 2026-11-09
// 12:00 UTC (newEnv); a Leftover is made by the Cooked Thursday dinner of 2026-11-05. Test-first: red until the runner
// methods in leftover.go are written.

const loUser = 7 // the User who acts

func (e *env) loPlace(name, kind string) int64 {
	e.t.Helper()
	res, err := e.db.Exec(`INSERT INTO storage_places (name, name_key, kind, is_default, created_at) VALUES (?, lower(?), ?, 0, '2026-11-01T00:00:00Z')`, name, name, kind)
	if err != nil {
		e.t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func (e *env) loSrc() plan.Key {
	return plan.Key{Date: "2026-11-05", MealSlotID: e.slotIDs[4], CourseID: e.main}
}

// loLeftover records a Leftover of the Recipe, as Cooked would.
func (e *env) loLeftover(recipe string, portions float64, useBy string) plan.Leftover {
	e.t.Helper()
	l, err := e.st.AddLeftover(ctx, plan.Leftover{RecipeID: e.rec[recipe], From: e.loSrc(), Portions: portions, CookedOn: "2026-11-05", UseBy: useBy})
	if err != nil {
		e.t.Fatal(err)
	}
	return l
}

// loFrozen records a Leftover frozen on a date in the Freezer; written with SQL so the set-up does not depend on the store.
func (e *env) loFrozen(recipe string, portions float64, useBy string, freezer int64, frozenOn string) plan.Leftover {
	e.t.Helper()
	l := e.loLeftover(recipe, portions, useBy)
	var place any
	if freezer != 0 {
		place = freezer
	}
	if _, err := e.db.Exec(`UPDATE leftovers SET storage_place_id = ?, frozen_on = ? WHERE id = ?`, place, frozenOn, l.ID); err != nil {
		e.t.Fatal(err)
	}
	l.StoragePlaceID, l.FrozenOn = freezer, frozenOn
	return l
}

// loServe plans the Dinner of a day in November served from the Leftover.
func (e *env) loServe(day int, l plan.Leftover, pinned bool) {
	e.t.Helper()
	if _, err := e.st.SaveMeal(ctx, plan.Meal{Key: e.key(day), RecipeID: l.RecipeID, Portions: 2, State: plan.StatePlanned, Pinned: pinned,
		From: &plan.Source{LeftoverID: l.ID, From: l.From}}); err != nil {
		e.t.Fatal(err)
	}
}

func (e *env) loGet(id int64) plan.Leftover {
	e.t.Helper()
	l, err := e.st.Leftover(ctx, id)
	if err != nil {
		e.t.Fatalf("Leftover %d: %v", id, err)
	}
	return l
}

func (e *env) loGone(id int64) bool {
	_, err := e.st.Leftover(ctx, id)
	return err != nil
}

// loServedFrom says whether the Dinner of the day is a Planned Meal served from that Leftover.
func (e *env) loServedFrom(day int, id int64) bool {
	m, err := e.st.Meal(ctx, e.key(day))
	return err == nil && m.From != nil && m.From.LeftoverID == id
}

func (e *env) loPinned(day int) bool {
	m, err := e.st.Meal(ctx, e.key(day))
	return err == nil && m.Pinned
}

func (e *env) loEvents(id int64) []plan.LeftoverEvent {
	e.t.Helper()
	evs, err := e.st.LeftoverEvents(ctx, id)
	if err != nil {
		e.t.Fatal(err)
	}
	for i := range evs {
		evs[i].ID = 0
	}
	return evs
}

func (e *env) loTxStock() { // waste is recorded inside the action's transaction
	e.r = runner.New(runner.Deps{DB: e.db, Clock: e.clk, Store: e.st, Source: e.src, Stock: txStock{e.stock}, Events: e.bus})
}

func ip(v int) *int { return &v }

func keys(ks ...plan.Key) []plan.Key { return ks }

// ---- 03:00: no automatic waste ----

func TestNightlyDoesNotDiscardLeftoversPastTheirUseBy(t *testing.T) {
	e := newEnv(t)
	old := e.loLeftover("chicken", 3, "2026-11-08") // past its Use-by since yesterday
	for i := 0; i < 2; i++ {
		if err := e.r.Nightly(ctx, "2026-11-09"); err != nil {
			t.Fatal(err)
		}
	}
	if len(e.stock.waste) != 0 {
		t.Errorf("waste = %+v; the 03:00 job asks before waste and records none", e.stock.waste)
	}
	got := e.loGet(old.ID)
	if got.Status != plan.LeftoverAvailable || got.Portions != 3 {
		t.Errorf("Leftover = %+v, want it still available with its 3 portions", got)
	}
	if n := len(e.planMeals()); n == 0 {
		t.Error("Nightly must still plan")
	}
}

func TestALeftoverToAnswerKeepsAskingAndIsListedAsSuch(t *testing.T) {
	e := newEnv(t)
	old := e.loLeftover("chicken", 3, "2026-11-08")
	e.loLeftover("stew", 2, "2026-11-09") // good today: not to answer
	if err := e.r.Nightly(ctx, "2026-11-09"); err != nil {
		t.Fatal(err)
	}
	e.clk.Set(time.Date(2026, 11, 10, 3, 0, 0, 0, time.UTC)) // a day later, still unanswered
	if err := e.r.Nightly(ctx, "2026-11-10"); err != nil {
		t.Fatal(err)
	}
	views, err := e.r.LeftoverViews(ctx)
	if err != nil {
		t.Fatal(err)
	}
	asks := map[int64]bool{}
	for _, v := range views {
		asks[v.ID] = v.ToAnswer
	}
	if len(views) != 2 || !asks[old.ID] {
		t.Errorf("views = %+v; want both listed and the chicken still to answer two nights later", views)
	}
}

func TestThePlannerSkipsFrozenAndToAnswerLeftoversButUsesAnOrdinaryOne(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	ordinary := e.loLeftover("curry", 2, "2026-11-12")
	frozen := e.loFrozen("soup", 6, "2027-02-07", freezer, "2026-11-02")
	toAnswer := e.loLeftover("pizza", 6, "2026-11-08")
	e.mustPlan()
	used := map[int64]bool{}
	for _, m := range e.planMeals() {
		if m.From != nil {
			used[m.From.LeftoverID] = true
		}
	}
	if !used[ordinary.ID] {
		t.Errorf("planned meals served from %v; Leftover first must use the ordinary Leftover (set-up check)", used)
	}
	if used[frozen.ID] {
		t.Error("a frozen Leftover was planned automatically; it is used only when a User picks it")
	}
	if used[toAnswer.ID] {
		t.Error("a Leftover to answer was planned; the planner ignores it")
	}
}

func TestAPinnedMealServedFromALeftoverToAnswerStaysPinnedUntilAnswered(t *testing.T) {
	e := newEnv(t)
	old := e.loLeftover("chicken", 4, "2026-11-08")
	e.loServe(10, old, true)
	if err := e.r.Nightly(ctx, "2026-11-09"); err != nil {
		t.Fatal(err)
	}
	if !e.loServedFrom(10, old.ID) || !e.loPinned(10) {
		t.Error("the User chose that meal: it stays Pinned and served from the Leftover while the Leftover waits for an answer")
	}
}

// ---- Had it ----

func TestHadItTakesPortionsOffWithoutWasteAndRecordsIt(t *testing.T) {
	e := newEnv(t)
	l := e.loLeftover("chicken", 4, "2026-11-12")
	before := e.bus.count("plan")
	res, err := e.r.HadIt(ctx, l.ID, 2, loUser)
	if err != nil {
		t.Fatal(err)
	}
	if res.Leftover.ID != l.ID || res.Leftover.Portions != 2 || len(res.Replanned) != 0 {
		t.Errorf("result = %+v, want the same Leftover with 2 portions and nothing replanned", res)
	}
	if got := e.loGet(l.ID); got.Portions != 2 {
		t.Errorf("stored portions = %v, want 2", got.Portions)
	}
	if len(e.stock.waste) != 0 {
		t.Errorf("waste = %+v; Had it is not waste", e.stock.waste)
	}
	want := []plan.LeftoverEvent{{LeftoverID: l.ID, RecipeID: e.rec["chicken"], Kind: plan.EventHadIt, Portions: 2, On: "2026-11-09", UserID: loUser}}
	if got := e.loEvents(l.ID); !reflect.DeepEqual(got, want) {
		t.Errorf("events = %+v, want %+v", got, want)
	}
	if e.bus.count("plan") == before {
		t.Error("Had it must publish a plan change")
	}
}

func TestHadItEverythingLeavesNoPortions(t *testing.T) {
	e := newEnv(t)
	l := e.loLeftover("chicken", 1.5, "2026-11-12")
	if _, err := e.r.HadIt(ctx, l.ID, 1.5, loUser); err != nil {
		t.Fatal(err)
	}
	if got := e.loGet(l.ID); got.Portions != 0 {
		t.Errorf("portions = %v, want 0", got.Portions)
	}
	if views, _ := e.r.LeftoverViews(ctx); len(views) != 0 {
		t.Errorf("views = %+v; a Leftover with nothing left is not listed", views)
	}
}

func TestHadItRefusesWhatIsNotLeftAndWritesNothing(t *testing.T) {
	e := newEnv(t)
	l := e.loLeftover("chicken", 3, "2026-11-12")
	for _, p := range []float64{0, -1, 3.5} {
		if _, err := e.r.HadIt(ctx, l.ID, p, loUser); !errors.Is(err, plan.ErrPortionsInvalid) {
			t.Errorf("HadIt(%v) = %v, want ErrPortionsInvalid", p, err)
		}
	}
	if _, err := e.r.HadIt(ctx, 9999, 1, loUser); !errors.Is(err, runner.ErrNotFound) {
		t.Errorf("unknown Leftover: %v, want ErrNotFound", err)
	}
	if got := e.loGet(l.ID); got.Portions != 3 || len(e.loEvents(l.ID)) != 0 {
		t.Errorf("Leftover = %+v, events %v; a refused action changes nothing", got, e.loEvents(l.ID))
	}
}

func TestHadItOnAFrozenLeftoverKeepsTheRestFrozen(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	l := e.loFrozen("chicken", 4, "2027-02-07", freezer, "2026-11-02")
	if _, err := e.r.HadIt(ctx, l.ID, 1, loUser); err != nil {
		t.Fatal(err)
	}
	got := e.loGet(l.ID)
	if got.Portions != 3 || got.FrozenOn != "2026-11-02" || got.StoragePlaceID != freezer || got.UseBy != "2027-02-07" {
		t.Errorf("Leftover = %+v, want 3 portions still frozen on 2026-11-02 in the Freezer until 2027-02-07", got)
	}
}

func TestHadItBelowTheClaimsUnpinsAndReplansTheMealsThatLoseOut(t *testing.T) {
	e := newEnv(t)
	l := e.loLeftover("chicken", 4, "2026-11-12")
	e.loServe(10, l, true)                      // Tuesday, Pinned, 2 portions
	e.loServe(11, l, false)                     // Wednesday, 2 portions
	res, err := e.r.HadIt(ctx, l.ID, 3, loUser) // 1 portion left: neither meal fits
	if err != nil {
		t.Fatal(err)
	}
	if want := keys(e.key(10), e.key(11)); !reflect.DeepEqual(res.Replanned, want) {
		t.Errorf("Replanned = %v, want %v (in the order the meals are served)", res.Replanned, want)
	}
	if e.loServedFrom(10, l.ID) || e.loServedFrom(11, l.ID) || e.loPinned(10) {
		t.Error("Tuesday and Wednesday must be planned again: unpinned and no longer served from the Leftover")
	}
}

func TestHadItThatLeavesEnoughKeepsTheMealsServedFromIt(t *testing.T) {
	e := newEnv(t)
	l := e.loLeftover("chicken", 5, "2026-11-12")
	e.loServe(10, l, true)
	e.loServe(11, l, false)
	res, err := e.r.HadIt(ctx, l.ID, 1, loUser) // 4 left: exactly what the two meals use
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Replanned) != 0 || !e.loServedFrom(10, l.ID) || !e.loPinned(10) || !e.loServedFrom(11, l.ID) {
		t.Errorf("Replanned = %v; both meals still fit and must be left alone", res.Replanned)
	}
}

// ---- Threw it out ----

func TestThrewItOutRecordsWasteDatedTodayAndTakesPortionsOff(t *testing.T) {
	e := newEnv(t)
	l := e.loLeftover("chicken", 4, "2026-11-12")
	res, err := e.r.ThrewOut(ctx, l.ID, 2, loUser)
	if err != nil {
		t.Fatal(err)
	}
	if res.Leftover.Portions != 2 || e.loGet(l.ID).Portions != 2 {
		t.Errorf("result = %+v, want 2 portions left", res)
	}
	want := []runner.LeftoverWaste{{LeftoverID: l.ID, RecipeID: e.rec["chicken"], Portions: 2, On: "2026-11-09"}}
	if !reflect.DeepEqual(e.stock.waste, want) {
		t.Errorf("waste = %+v, want %+v", e.stock.waste, want)
	}
	ev := []plan.LeftoverEvent{{LeftoverID: l.ID, RecipeID: e.rec["chicken"], Kind: plan.EventThrewOut, Portions: 2, On: "2026-11-09", UserID: loUser}}
	if got := e.loEvents(l.ID); !reflect.DeepEqual(got, ev) {
		t.Errorf("events = %+v, want %+v", got, ev)
	}
}

func TestThrewItOutPublishesTheStockWasteAfterAnInTransactionRecord(t *testing.T) {
	e := newEnv(t)
	e.loTxStock()
	l := e.loLeftover("chicken", 3, "2026-11-12")
	if _, err := e.r.ThrewOut(ctx, l.ID, 3, loUser); err != nil {
		t.Fatal(err)
	}
	if len(e.stock.waste) != 1 || e.bus.count("stock") != 1 {
		t.Errorf("waste %+v, %d stock events; want one record and one stock event after the commit", e.stock.waste, e.bus.count("stock"))
	}
}

func TestThrewItOutIsAllOrNothingWhenTheWasteCannotBeRecorded(t *testing.T) {
	e := newEnv(t)
	e.loTxStock()
	l := e.loLeftover("chicken", 3, "2026-11-12")
	e.stock.wasteErr = errBoom
	if _, err := e.r.ThrewOut(ctx, l.ID, 3, loUser); err == nil {
		t.Fatal("ThrewOut succeeded although the waste could not be recorded")
	}
	if got := e.loGet(l.ID); got.Portions != 3 || len(e.loEvents(l.ID)) != 0 {
		t.Errorf("Leftover = %+v, events %v; the failed action must change nothing", got, e.loEvents(l.ID))
	}
}

func TestThrewItOutAfterTheUseByCountsTheDayAfterTheUseBy(t *testing.T) {
	e := newEnv(t)
	l := e.loLeftover("chicken", 3, "2026-11-04")
	if _, err := e.r.ThrewOut(ctx, l.ID, 3, loUser); err != nil {
		t.Fatal(err)
	}
	want := []runner.LeftoverWaste{{LeftoverID: l.ID, RecipeID: e.rec["chicken"], Portions: 3, On: "2026-11-05"}}
	if !reflect.DeepEqual(e.stock.waste, want) {
		t.Errorf("waste = %+v, want %+v (a Leftover past its Use-by wasted on the day after it)", e.stock.waste, want)
	}
}

func TestThrewItOutRefusesWhatIsNotLeft(t *testing.T) {
	e := newEnv(t)
	l := e.loLeftover("chicken", 3, "2026-11-12")
	for _, p := range []float64{0, 3.5} {
		if _, err := e.r.ThrewOut(ctx, l.ID, p, loUser); !errors.Is(err, plan.ErrPortionsInvalid) {
			t.Errorf("ThrewOut(%v) = %v, want ErrPortionsInvalid", p, err)
		}
	}
	if len(e.stock.waste) != 0 {
		t.Errorf("waste = %+v, want none", e.stock.waste)
	}
}

func TestThrewItOutBelowTheClaimsReplansTheMealsThatLoseOut(t *testing.T) {
	e := newEnv(t)
	l := e.loLeftover("chicken", 4, "2026-11-12")
	e.loServe(11, l, true)
	res, err := e.r.ThrewOut(ctx, l.ID, 3, loUser)
	if err != nil {
		t.Fatal(err)
	}
	if want := keys(e.key(11)); !reflect.DeepEqual(res.Replanned, want) || e.loServedFrom(11, l.ID) || e.loPinned(11) {
		t.Errorf("Replanned = %v, served from it %v; want Wednesday planned again", res.Replanned, e.loServedFrom(11, l.ID))
	}
}

// ---- Freeze it ----

func TestFreezeItMovesAllOfItToTheFreezerWithAFrozenUseBy(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	l := e.loLeftover("chicken", 3, "2026-11-12")
	res, err := e.r.Freeze(ctx, l.ID, freezer, nil, loUser)
	if err != nil {
		t.Fatal(err)
	}
	if res.Left != nil || res.Frozen.ID != l.ID || len(res.Replanned) != 0 {
		t.Fatalf("result = %+v, want the same Leftover frozen whole", res)
	}
	got := e.loGet(l.ID)
	if got.Portions != 3 || got.StoragePlaceID != freezer || got.FrozenOn != "2026-11-09" || got.UseBy != "2027-02-07" || !got.Frozen() {
		t.Errorf("Leftover = %+v, want 3 portions in the Freezer, frozen on 2026-11-09, Use-by 2027-02-07 (90 days)", got)
	}
	if len(e.stock.waste) != 0 {
		t.Errorf("waste = %+v; freezing is not waste", e.stock.waste)
	}
	ev := []plan.LeftoverEvent{{LeftoverID: l.ID, RecipeID: e.rec["chicken"], Kind: plan.EventFroze, Portions: 3, On: "2026-11-09", StoragePlaceID: freezer, UserID: loUser}}
	if got := e.loEvents(l.ID); !reflect.DeepEqual(got, ev) {
		t.Errorf("events = %+v, want %+v", got, ev)
	}
}

func TestFreezeItUsesTheRecipesFrozenUseByWhenItHasOne(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	if _, err := e.db.Exec(`UPDATE recipes SET frozen_use_by_days = 30 WHERE id = ?`, e.rec["chicken"]); err != nil {
		t.Fatal(err)
	}
	l := e.loLeftover("chicken", 3, "2026-11-12")
	if _, err := e.r.Freeze(ctx, l.ID, freezer, nil, loUser); err != nil {
		t.Fatal(err)
	}
	if got := e.loGet(l.ID); got.UseBy != "2026-12-09" {
		t.Errorf("Use-by = %q, want 2026-12-09 (the Recipe's 30 days, not the Household's 90)", got.UseBy)
	}
}

func TestFreezeItOnTheUseByDayIsStillAllowed(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	l := e.loLeftover("chicken", 3, "2026-11-09")
	if _, err := e.r.Freeze(ctx, l.ID, freezer, nil, loUser); err != nil {
		t.Errorf("Freeze on the Use-by date = %v; a Leftover is still good that day", err)
	}
}

func TestFreezingPartSplitsOffANewFrozenLeftoverAndTheRestStaysAsItWas(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	l := e.loLeftover("chicken", 4, "2026-11-12")
	res, err := e.r.Freeze(ctx, l.ID, freezer, f64(1.5), loUser)
	if err != nil {
		t.Fatal(err)
	}
	if res.Left == nil || res.Left.ID != l.ID || res.Left.Portions != 2.5 {
		t.Fatalf("Left = %+v, want the original Leftover with 2.5 portions", res.Left)
	}
	if res.Frozen.ID == l.ID || res.Frozen.ID == 0 || res.Frozen.Portions != 1.5 || res.Frozen.FrozenOn != "2026-11-09" || res.Frozen.StoragePlaceID != freezer {
		t.Fatalf("Frozen = %+v, want a new Leftover of 1.5 portions in the Freezer", res.Frozen)
	}
	stays := e.loGet(l.ID)
	if stays.Frozen() || stays.UseBy != "2026-11-12" || stays.StoragePlaceID != 0 || stays.Portions != 2.5 {
		t.Errorf("the part that stayed = %+v, want 2.5 portions, not frozen, Use-by 2026-11-12", stays)
	}
	part := e.loGet(res.Frozen.ID)
	if part.RecipeID != l.RecipeID || part.From != l.From || part.CookedOn != l.CookedOn || part.UseBy != "2027-02-07" || part.Status != plan.LeftoverAvailable {
		t.Errorf("the frozen part = %+v, want the same Recipe, source and cooked date and Use-by 2027-02-07", part)
	}
	ev := e.loEvents(res.Frozen.ID)
	if len(ev) != 1 || ev[0].Kind != plan.EventFroze || ev[0].Portions != 1.5 || ev[0].LeftoverID != res.Frozen.ID {
		t.Errorf("events of the frozen part = %+v, want one froze of 1.5 portions", ev)
	}
}

func TestFreezingPartKeepsThePortionsThePlannedMealsNeed(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	l := e.loLeftover("chicken", 4, "2026-11-12")
	e.loServe(11, l, true) // Wednesday needs 2
	res, err := e.r.Freeze(ctx, l.ID, freezer, f64(2), loUser)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Replanned) != 0 || !e.loServedFrom(11, l.ID) || !e.loPinned(11) {
		t.Errorf("Replanned = %v; the 2 portions that stayed cover Wednesday, which must keep its Leftover and its Pin", res.Replanned)
	}
}

func TestFreezingMoreThanLeavesEnoughReplansTheMealThatLosesOut(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	l := e.loLeftover("chicken", 4, "2026-11-12")
	e.loServe(11, l, true)
	res, err := e.r.Freeze(ctx, l.ID, freezer, f64(3), loUser) // 1 stays, Wednesday needs 2
	if err != nil {
		t.Fatal(err)
	}
	if want := keys(e.key(11)); !reflect.DeepEqual(res.Replanned, want) || e.loServedFrom(11, l.ID) || e.loPinned(11) {
		t.Errorf("Replanned = %v; want Wednesday unpinned and planned again", res.Replanned)
	}
	if res.Left == nil || res.Left.Portions != 1 {
		t.Errorf("Left = %+v, want 1 portion", res.Left)
	}
}

func TestFreezingAllOfALeftoverThatMealsDependOnReplansThem(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	l := e.loLeftover("chicken", 4, "2026-11-12")
	e.loServe(10, l, true)
	res, err := e.r.Freeze(ctx, l.ID, freezer, nil, loUser)
	if err != nil {
		t.Fatal(err)
	}
	if want := keys(e.key(10)); !reflect.DeepEqual(res.Replanned, want) || e.loServedFrom(10, l.ID) || e.loPinned(10) {
		t.Errorf("Replanned = %v; a frozen Leftover is not planned automatically, so Tuesday is planned again", res.Replanned)
	}
}

func TestFreezeItRefusals(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	fridge := e.loPlace("Kitchen Fridge", "fridge")
	fresh := e.loLeftover("chicken", 3, "2026-11-12")
	late := e.loLeftover("stew", 3, "2026-11-08") // past its Use-by
	frozen := e.loFrozen("curry", 3, "2027-02-07", freezer, "2026-11-02")
	cases := []struct {
		name      string
		id, place int64
		portions  *float64
		want      error
	}{
		{"past its Use-by", late.ID, freezer, nil, runner.ErrLeftoverPastUseBy},
		{"already frozen", frozen.ID, freezer, nil, runner.ErrLeftoverFrozen},
		{"not a Freezer", fresh.ID, fridge, nil, runner.ErrStoragePlaceNotFreezer},
		{"no such place", fresh.ID, 9999, nil, runner.ErrUnknownStoragePlace},
		{"no place at all", fresh.ID, 0, nil, runner.ErrUnknownStoragePlace},
		{"zero portions", fresh.ID, freezer, f64(0), plan.ErrPortionsInvalid},
		{"more than is left", fresh.ID, freezer, f64(3.5), plan.ErrPortionsInvalid},
		{"no such Leftover", 9999, freezer, nil, runner.ErrNotFound},
	}
	for _, tc := range cases {
		if _, err := e.r.Freeze(ctx, tc.id, tc.place, tc.portions, loUser); !errors.Is(err, tc.want) {
			t.Errorf("%s: Freeze = %v, want %v", tc.name, err, tc.want)
		}
	}
	if got := e.loGet(fresh.ID); got.Frozen() || got.Portions != 3 {
		t.Errorf("a refused Freeze changed the Leftover: %+v", got)
	}
	if len(e.loEvents(fresh.ID)) != 0 || len(e.loEvents(late.ID)) != 0 {
		t.Error("a refused Freeze wrote events")
	}
}

// ---- Take out ----

func TestTakeOutMakesItANormalLeftoverWithTheRecipesUseBy(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	l := e.loFrozen("chicken", 3, "2027-02-07", freezer, "2026-11-02")
	res, err := e.r.TakeOut(ctx, l.ID, 0, loUser)
	if err != nil {
		t.Fatal(err)
	}
	got := e.loGet(l.ID)
	if res.Leftover.ID != l.ID || got.Frozen() || got.StoragePlaceID != 0 || got.UseBy != "2026-11-12" || got.Portions != 3 {
		t.Errorf("Leftover = %+v, want not frozen, Not sorted, Use-by 2026-11-12 (today + the Household's 3 days)", got)
	}
	ev := []plan.LeftoverEvent{{LeftoverID: l.ID, RecipeID: e.rec["chicken"], Kind: plan.EventTookOut, Portions: 3, On: "2026-11-09", UserID: loUser}}
	if got := e.loEvents(l.ID); !reflect.DeepEqual(got, ev) {
		t.Errorf("events = %+v, want %+v", got, ev)
	}
}

func TestTakeOutUsesTheRecipesOwnUseByAndMayChooseAPlace(t *testing.T) {
	e := newEnv(t)
	freezer, fridge := e.loPlace("Garage Freezer", "freezer"), e.loPlace("Kitchen Fridge", "fridge")
	if _, err := e.db.Exec(`UPDATE recipes SET leftover_use_by_days = 5 WHERE id = ?`, e.rec["chicken"]); err != nil {
		t.Fatal(err)
	}
	e.src.recipes[len(e.src.recipes)-1].UseByDays = ip(5) // chicken, as Sources serves it
	l := e.loFrozen("chicken", 3, "2027-02-07", freezer, "2026-11-02")
	if _, err := e.r.TakeOut(ctx, l.ID, fridge, loUser); err != nil {
		t.Fatal(err)
	}
	if got := e.loGet(l.ID); got.StoragePlaceID != fridge || got.UseBy != "2026-11-14" || got.Frozen() {
		t.Errorf("Leftover = %+v, want it in the Kitchen Fridge until 2026-11-14 (5 days), not frozen", got)
	}
}

func TestTakeOutRefusals(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	other := e.loPlace("Chest Freezer", "freezer")
	plain := e.loLeftover("stew", 3, "2026-11-12")
	frozen := e.loFrozen("chicken", 3, "2027-02-07", freezer, "2026-11-02")
	cases := []struct {
		name      string
		id, place int64
		want      error
	}{
		{"not frozen", plain.ID, 0, runner.ErrLeftoverNotFrozen},
		{"into a Freezer", frozen.ID, other, runner.ErrStoragePlaceFreezer},
		{"no such place", frozen.ID, 9999, runner.ErrUnknownStoragePlace},
		{"no such Leftover", 9999, 0, runner.ErrNotFound},
	}
	for _, tc := range cases {
		if _, err := e.r.TakeOut(ctx, tc.id, tc.place, loUser); !errors.Is(err, tc.want) {
			t.Errorf("%s: TakeOut = %v, want %v", tc.name, err, tc.want)
		}
	}
	if got := e.loGet(frozen.ID); !got.Frozen() || got.UseBy != "2027-02-07" {
		t.Errorf("a refused Take out changed the Leftover: %+v", got)
	}
}

func TestTakeOutAfterTheFrozenUseByGivesAFreshUseByFromToday(t *testing.T) {
	// ADR 0012: Use-by = today + the Recipe's Use-by days. The plan's edge case says such a Leftover "is to answer at
	// once"; that contradicts the ADR (see the open question in docs/dev/design/b5-lo.md), so only the ADR is tested.
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	l := e.loFrozen("chicken", 3, "2026-11-01", freezer, "2026-08-03") // its Frozen Use-by passed
	if _, err := e.r.TakeOut(ctx, l.ID, 0, loUser); err != nil {
		t.Fatal(err)
	}
	if got := e.loGet(l.ID); got.UseBy != "2026-11-12" {
		t.Errorf("Use-by = %q, want 2026-11-12", got.UseBy)
	}
}

// ---- Answers ----

func TestAnsweringHadItSettlesTheLeftoverWithoutWaste(t *testing.T) {
	e := newEnv(t)
	l := e.loLeftover("chicken", 3, "2026-11-04")
	if err := e.r.Answer(ctx, l.ID, plan.AnswerHadIt, loUser); err != nil {
		t.Fatal(err)
	}
	if got := e.loGet(l.ID); got.Portions != 0 {
		t.Errorf("portions = %v, want 0: every portion left was had", got.Portions)
	}
	if len(e.stock.waste) != 0 {
		t.Errorf("waste = %+v; Had it is not waste", e.stock.waste)
	}
	ev := []plan.LeftoverEvent{{LeftoverID: l.ID, RecipeID: e.rec["chicken"], Kind: plan.EventHadIt, Portions: 3, On: "2026-11-09", UserID: loUser}}
	if got := e.loEvents(l.ID); !reflect.DeepEqual(got, ev) {
		t.Errorf("events = %+v, want %+v", got, ev)
	}
}

func TestAnsweringThrewItOutRecordsWasteTheDayAfterTheUseBy(t *testing.T) {
	e := newEnv(t)
	l := e.loLeftover("chicken", 3, "2026-11-04")
	if err := e.r.Answer(ctx, l.ID, plan.AnswerThrewOut, loUser); err != nil {
		t.Fatal(err)
	}
	want := []runner.LeftoverWaste{{LeftoverID: l.ID, RecipeID: e.rec["chicken"], Portions: 3, On: "2026-11-05"}}
	if !reflect.DeepEqual(e.stock.waste, want) {
		t.Errorf("waste = %+v, want %+v", e.stock.waste, want)
	}
	if got := e.loGet(l.ID); got.Portions != 0 {
		t.Errorf("portions = %v, want 0", got.Portions)
	}
	if ev := e.loEvents(l.ID); len(ev) != 1 || ev[0].Kind != plan.EventThrewOut || ev[0].Portions != 3 || ev[0].On != "2026-11-09" {
		t.Errorf("events = %+v, want one threw_out of 3 portions answered on 2026-11-09", ev)
	}
}

func TestAnsweringWasntThereRemovesTheLeftoverWithoutWaste(t *testing.T) {
	e := newEnv(t)
	l := e.loLeftover("chicken", 3, "2026-11-04")
	if err := e.r.Answer(ctx, l.ID, plan.AnswerWasntThere, loUser); err != nil {
		t.Fatal(err)
	}
	if !e.loGone(l.ID) {
		t.Error("Wasn't there removes the Leftover")
	}
	if len(e.stock.waste) != 0 {
		t.Errorf("waste = %+v; Wasn't there is a mistake, not waste", e.stock.waste)
	}
	ev := []plan.LeftoverEvent{{LeftoverID: l.ID, RecipeID: e.rec["chicken"], Kind: plan.EventWasntThere, Portions: 3, On: "2026-11-09", UserID: loUser}}
	if got := e.loEvents(l.ID); !reflect.DeepEqual(got, ev) {
		t.Errorf("events = %+v, want %+v (kept after the row is gone)", got, ev)
	}
}

func TestAnsweringUnpinsAndReplansTheMealServedFromTheLeftover(t *testing.T) {
	for _, answer := range []plan.LeftoverAnswer{plan.AnswerHadIt, plan.AnswerThrewOut, plan.AnswerWasntThere} {
		t.Run(string(answer), func(t *testing.T) {
			e := newEnv(t)
			l := e.loLeftover("chicken", 4, "2026-11-08")
			e.loServe(10, l, true)
			if err := e.r.Answer(ctx, l.ID, answer, loUser); err != nil {
				t.Fatal(err)
			}
			if e.loServedFrom(10, l.ID) || e.loPinned(10) {
				t.Error("with the Leftover answered, the Pinned meal served from it is unpinned and planned again")
			}
		})
	}
}

func TestAnsweringAFrozenLeftoverPastItsFrozenUseByWorks(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	l := e.loFrozen("chicken", 2, "2026-11-01", freezer, "2026-08-03")
	if err := e.r.Answer(ctx, l.ID, plan.AnswerThrewOut, loUser); err != nil {
		t.Fatal(err)
	}
	want := []runner.LeftoverWaste{{LeftoverID: l.ID, RecipeID: e.rec["chicken"], Portions: 2, On: "2026-11-02"}}
	if !reflect.DeepEqual(e.stock.waste, want) {
		t.Errorf("waste = %+v, want %+v", e.stock.waste, want)
	}
}

func TestAnswerRefusals(t *testing.T) {
	e := newEnv(t)
	good := e.loLeftover("chicken", 3, "2026-11-09") // still good today
	late := e.loLeftover("stew", 3, "2026-11-04")
	if err := e.r.Answer(ctx, good.ID, plan.AnswerHadIt, loUser); !errors.Is(err, runner.ErrLeftoverNotToAnswer) {
		t.Errorf("a Leftover still good: %v, want ErrLeftoverNotToAnswer", err)
	}
	if err := e.r.Answer(ctx, late.ID, plan.LeftoverAnswer("binned"), loUser); !errors.Is(err, runner.ErrInvalidAnswer) {
		t.Errorf("unknown answer: %v, want ErrInvalidAnswer", err)
	}
	if err := e.r.Answer(ctx, 9999, plan.AnswerHadIt, loUser); !errors.Is(err, runner.ErrNotFound) {
		t.Errorf("unknown Leftover: %v, want ErrNotFound", err)
	}
	if err := e.r.Answer(ctx, late.ID, plan.AnswerHadIt, loUser); err != nil {
		t.Fatal(err)
	}
	if err := e.r.Answer(ctx, late.ID, plan.AnswerHadIt, loUser); !errors.Is(err, runner.ErrLeftoverNotToAnswer) {
		t.Errorf("answering twice: %v, want ErrLeftoverNotToAnswer (nothing is left to answer)", err)
	}
}

// ---- Views ----

func TestLeftoverViewsCarryPlaceFrozenToAnswerAndPlannedPortions(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	frozen := e.loFrozen("chicken", 4, "2027-02-07", freezer, "2026-11-02")
	e.loServe(10, frozen, true)
	e.loServe(11, frozen, false)
	ordinary := e.loLeftover("stew", 2, "2026-11-11")
	late := e.loLeftover("curry", 1, "2026-11-08")
	orphan := e.loFrozen("pizza", 2, "2027-01-01", 0, "2026-10-01") // its Freezer was deleted: Not sorted

	views, err := e.r.LeftoverViews(ctx)
	if err != nil {
		t.Fatal(err)
	}
	by := map[int64]runner.LeftoverView{}
	var order []int64
	for _, v := range views {
		by[v.ID] = v
		order = append(order, v.ID)
	}
	if want := []int64{late.ID, ordinary.ID, orphan.ID, frozen.ID}; !reflect.DeepEqual(order, want) {
		t.Errorf("order = %v, want soonest Use-by first %v", order, want)
	}
	if v := by[frozen.ID]; v.StoragePlaceName != "Garage Freezer" || !v.Frozen() || v.ToAnswer || v.PlannedPortions != 4 || v.StoragePlaceID != freezer {
		t.Errorf("frozen view = %+v, want the Garage Freezer, frozen, not to answer, 4 planned portions", v)
	}
	if v := by[ordinary.ID]; v.StoragePlaceName != "" || v.Frozen() || v.ToAnswer || v.PlannedPortions != 0 {
		t.Errorf("ordinary view = %+v, want no place, not frozen, nothing planned", v)
	}
	if v := by[late.ID]; !v.ToAnswer {
		t.Errorf("late view = %+v, want ToAnswer", v)
	}
	if v := by[orphan.ID]; !v.Frozen() || v.StoragePlaceID != 0 || v.StoragePlaceName != "" {
		t.Errorf("orphan view = %+v, want frozen with no place (shown under Not sorted)", v)
	}
}

// ---- From the freezer: picking a Leftover, and U5 ----

func TestPickingAFrozenLeftoverPinsItAsTheMealWithoutTakingItOut(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	l := e.loFrozen("stew", 4, "2027-02-07", freezer, "2026-11-02")
	e.mustPlan()
	m, err := e.r.UseLeftover(ctx, e.key(11), l.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !m.Pinned || m.State != plan.StatePlanned || m.From == nil || m.From.LeftoverID != l.ID || m.From.From != l.From ||
		m.RecipeID != l.RecipeID || m.Batches != 0 || m.Portions != 2 {
		t.Errorf("meal = %+v, want a Pinned Planned Meal of the stew served from the frozen Leftover for the 2 portions of the cell", m)
	}
	if got := e.loGet(l.ID); !got.Frozen() || got.UseBy != "2027-02-07" {
		t.Errorf("Leftover = %+v; picking it does not take it out of the Freezer", got)
	}
	e.mustPlan()
	if !e.loServedFrom(11, l.ID) {
		t.Error("the picked meal must survive the next plan")
	}
}

func TestPickingAFrozenLeftoverCountsWhatIsAlreadyPlannedFromIt(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	l := e.loFrozen("stew", 4, "2027-02-07", freezer, "2026-11-02")
	for _, day := range []int{10, 11} { // 2 + 2 portions: all 4
		if _, err := e.r.UseLeftover(ctx, e.key(day), l.ID); err != nil {
			t.Fatalf("day %d: %v", day, err)
		}
	}
	if _, err := e.r.UseLeftover(ctx, e.key(9), l.ID); !errors.Is(err, runner.ErrLeftoverTooSmall) {
		t.Errorf("a third meal from 4 portions: %v, want ErrLeftoverTooSmall", err)
	}
}

func TestPickingALeftoverRefusals(t *testing.T) {
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	soon := e.loFrozen("stew", 4, "2026-11-10", freezer, "2026-11-02")
	small := e.loFrozen("curry", 1, "2027-02-07", freezer, "2026-11-02")
	if _, err := e.r.UseLeftover(ctx, e.key(11), soon.ID); !errors.Is(err, runner.ErrLeftoverPastUseBy) {
		t.Errorf("Use-by before the meal's day: %v, want ErrLeftoverPastUseBy", err)
	}
	if _, err := e.r.UseLeftover(ctx, e.key(11), small.ID); !errors.Is(err, runner.ErrLeftoverTooSmall) {
		t.Errorf("1 portion for a 2-portion meal: %v, want ErrLeftoverTooSmall", err)
	}
	if _, err := e.r.UseLeftover(ctx, e.key(11), 9999); !errors.Is(err, runner.ErrNotFound) {
		t.Errorf("unknown Leftover: %v, want ErrNotFound", err)
	}
	if _, err := e.r.UseLeftover(ctx, plan.Key{Date: "2026-11-08", MealSlotID: e.slotIDs[7], CourseID: e.main}, small.ID); !errors.Is(err, runner.ErrInPast) {
		t.Errorf("yesterday: %v, want ErrInPast", err)
	}
}

func TestCookedFromAFrozenLeftoverTakesOnlyThePortionsUsedAndTheRestStaysFrozen(t *testing.T) { // U5
	e := newEnv(t)
	freezer := e.loPlace("Garage Freezer", "freezer")
	l := e.loFrozen("stew", 4, "2027-02-07", freezer, "2026-11-02")
	if _, err := e.r.UseLeftover(ctx, e.key(10), l.ID); err != nil {
		t.Fatal(err)
	}
	e.clk.Set(time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC))
	res, err := e.r.Cooked(ctx, e.key(10), nil) // no Take out first
	if err != nil {
		t.Fatal(err)
	}
	if len(e.stock.deductions) != 0 || res.Leftover != nil {
		t.Errorf("deductions %d, new Leftover %+v; eating a Leftover deducts no Stock and records none", len(e.stock.deductions), res.Leftover)
	}
	got := e.loGet(l.ID)
	if got.Portions != 2 || got.FrozenOn != "2026-11-02" || got.StoragePlaceID != freezer || got.UseBy != "2027-02-07" || !got.Frozen() {
		t.Errorf("Leftover = %+v, want 2 portions left, still frozen on 2026-11-02 in the Freezer, Use-by 2027-02-07", got)
	}
}

// ---- Naming the meals that lose out, before the User confirms ----

func TestLosingOutNamesTheMealsWithoutWritingAnything(t *testing.T) {
	e := newEnv(t)
	l := e.loLeftover("chicken", 4, "2026-11-12")
	e.loServe(10, l, true)
	e.loServe(11, l, false)
	got, err := e.r.LosingOut(ctx, l.ID, 2)
	if err != nil {
		t.Fatal(err)
	}
	if want := keys(e.key(11)); !reflect.DeepEqual(got, want) {
		t.Errorf("LosingOut(2 stay) = %v, want %v", got, want)
	}
	if got, _ := e.r.LosingOut(ctx, l.ID, 4); len(got) != 0 {
		t.Errorf("LosingOut(4 stay) = %v, want none", got)
	}
	if !e.loServedFrom(10, l.ID) || !e.loServedFrom(11, l.ID) || e.loGet(l.ID).Portions != 4 || len(e.loEvents(l.ID)) != 0 {
		t.Error("LosingOut changed something")
	}
	if _, err := e.r.LosingOut(ctx, 9999, 1); !errors.Is(err, runner.ErrNotFound) {
		t.Errorf("unknown Leftover: %v, want ErrNotFound", err)
	}
}
