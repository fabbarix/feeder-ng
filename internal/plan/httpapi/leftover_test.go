package httpapi_test

import (
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B5-LO (ADR 0012, docs/dev/design/b5-lo.md §6, plan 2.3 API table): Leftovers by hand over HTTP. The fixture is crsc2
// (Monday Dinner 19:00 serving Main and Side, Anna and Sam, so a Course needs 2 portions; today Monday 2026-11-09).
// Test-first: red until the handlers and the payload are written.

type loBody struct {
	ID               int64   `json:"id"`
	RecipeID         int64   `json:"recipeId"`
	RecipeName       string  `json:"recipeName"`
	Portions         float64 `json:"portions"`
	UseBy            string  `json:"useBy"`
	StoragePlaceID   *int64  `json:"storagePlaceId"`
	StoragePlaceName *string `json:"storagePlaceName"`
	Frozen           bool    `json:"frozen"`
	FrozenOn         *string `json:"frozenOn"`
	ToAnswer         bool    `json:"toAnswer"`
	PlannedPortions  float64 `json:"plannedPortions"`
}

type loReplanned struct {
	Date         string `json:"date"`
	MealSlotID   int64  `json:"mealSlotId"`
	MealSlotName string `json:"mealSlotName"`
	RecipeName   string `json:"recipeName"`
	CourseID     int64  `json:"courseId"`
}

type loAnswer struct {
	Leftover  loBody        `json:"leftover"`
	Replanned []loReplanned `json:"replanned"`
}

type loFreezeAnswer struct {
	Frozen    loBody        `json:"frozen"`
	Left      *loBody       `json:"left"`
	Replanned []loReplanned `json:"replanned"`
}

type loWorld struct {
	*crsc2.World
	chilli, stew int64
}

func newLO(t *testing.T) *loWorld {
	t.Helper()
	w := crsc2.New(t)
	lw := &loWorld{World: w, chilli: w.Recipe("Chilli", crsc2.RecipeSpec{}), stew: w.Recipe("Stew", crsc2.RecipeSpec{})}
	w.Settle()
	return lw
}

func (w *loWorld) place(name, kind string) int64 {
	w.T.Helper()
	r := w.Admin.Post("/api/storage-places", map[string]any{"name": name, "kind": kind})
	var out struct {
		ID int64 `json:"id"`
	}
	if r.Status != 201 || r.JSON(&out) != nil {
		w.T.Fatalf("create Storage Place %q = %d %s", name, r.Status, r.Body)
	}
	return out.ID
}

// leftover writes a Leftover row cooked on Thursday 2026-11-05 (frozenOn "" = not frozen; place 0 = none).
func (w *loWorld) leftover(recipe int64, portions float64, useBy string, place int64, frozenOn string) int64 {
	w.T.Helper()
	var p, f any
	if place != 0 {
		p = place
	}
	if frozenOn != "" {
		f = frozenOn
	}
	return w.Exec(`INSERT INTO leftovers (recipe_id, from_date, from_meal_slot_id, from_course_id, portions, cooked_on, use_by, status, created_at, storage_place_id, frozen_on)
		VALUES (?, '2026-11-05', ?, ?, ?, '2026-11-05', ?, 'available', '2026-11-05T20:00:00Z', ?, ?)`, recipe, w.Slot, w.Main, portions, useBy, p, f)
}

// serve plans today's Main from the Leftover (2 portions).
func (w *loWorld) serve(recipe, leftover int64, pinned bool) {
	w.T.Helper()
	p := 0
	if pinned {
		p = 1
	}
	w.Exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, from_leftover_id, from_date, from_meal_slot_id, from_course_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, 0, 2, 'planned', ?, ?, '2026-11-05', ?, ?, '2026-11-08T12:00:00Z', '2026-11-08T12:00:00Z')`, crsc2.Today, w.Slot, w.Main, recipe, p, leftover, w.Slot, w.Main)
}

func (w *loWorld) list() map[int64]loBody {
	w.T.Helper()
	r := w.User.Get("/api/plan/leftovers")
	var out struct {
		Leftovers []loBody `json:"leftovers"`
	}
	if r.Status != 200 || r.JSON(&out) != nil {
		w.T.Fatalf("GET /api/plan/leftovers = %d %s", r.Status, r.Body)
	}
	by := map[int64]loBody{}
	for _, l := range out.Leftovers {
		by[l.ID] = l
	}
	return by
}

func (w *loWorld) post(id int64, action string, body any) *testkit.Response {
	return w.User.Post(fmt.Sprintf("/api/plan/leftovers/%d/%s", id, action), body)
}

func (w *loWorld) count(q string, args ...any) int { return w.World.Count(q, args...) }

func (w *loWorld) streak() int {
	w.T.Helper()
	w.Exec(`UPDATE household_settings SET created_at = '2026-10-01T08:00:00Z' WHERE id = 1`)
	r := w.User.Get("/api/today/streak")
	var out struct {
		Days int `json:"days"`
	}
	if r.Status != 200 || r.JSON(&out) != nil {
		w.T.Fatalf("GET /api/today/streak = %d %s", r.Status, r.Body)
	}
	return out.Days
}

func loErrOf(r *testkit.Response) (code, field, reason string) {
	var b struct {
		Error struct {
			Code   string `json:"code"`
			Field  string `json:"field"`
			Reason string `json:"reason"`
		} `json:"error"`
	}
	_ = r.JSON(&b)
	return b.Error.Code, b.Error.Field, b.Error.Reason
}

func loWantErr(t *testing.T, what string, r *testkit.Response, status int, code string) {
	t.Helper()
	if got, _, _ := loErrOf(r); r.Status != status || got != code {
		t.Errorf("%s = %d %s, want %d %s", what, r.Status, r.Body, status, code)
	}
}

// ---- GET /api/plan/leftovers ----

func TestTheLeftoverListGivesPlaceFrozenToAnswerAndPlannedPortions(t *testing.T) {
	w := newLO(t)
	freezer := w.place("Garage Freezer", "freezer")
	frozen := w.leftover(w.chilli, 4, "2027-02-07", freezer, "2026-11-02")
	ordinary := w.leftover(w.stew, 3, "2026-11-12", 0, "")
	late := w.leftover(w.stew, 1, "2026-11-08", 0, "")
	w.serve(w.chilli, frozen, true)

	got := w.list()
	f := got[frozen]
	if f.StoragePlaceID == nil || *f.StoragePlaceID != freezer || f.StoragePlaceName == nil || *f.StoragePlaceName != "Garage Freezer" ||
		!f.Frozen || f.FrozenOn == nil || *f.FrozenOn != "2026-11-02" || f.ToAnswer || f.PlannedPortions != 2 || f.RecipeName != "Chilli" {
		t.Errorf("frozen Leftover = %+v, want the Garage Freezer, frozen on 2026-11-02, not to answer, 2 planned portions", f)
	}
	o := got[ordinary]
	if o.StoragePlaceID != nil || o.StoragePlaceName != nil || o.Frozen || o.FrozenOn != nil || o.ToAnswer || o.PlannedPortions != 0 {
		t.Errorf("ordinary Leftover = %+v, want no place, not frozen, not to answer, nothing planned (nulls, not zero values)", o)
	}
	if l := got[late]; !l.ToAnswer || l.Frozen {
		t.Errorf("late Leftover = %+v, want toAnswer", l)
	}
}

func TestAFrozenLeftoverWhoseFreezerWasDeletedListsWithNoPlace(t *testing.T) {
	w := newLO(t)
	freezer := w.place("Garage Freezer", "freezer")
	id := w.leftover(w.chilli, 4, "2027-02-07", freezer, "2026-11-02")
	if r := w.Admin.Delete(fmt.Sprintf("/api/storage-places/%d", freezer)); r.Status != 204 && r.Status != 200 {
		t.Fatalf("delete the Freezer = %d %s", r.Status, r.Body)
	}
	if l := w.list()[id]; !l.Frozen || l.StoragePlaceID != nil || l.StoragePlaceName != nil {
		t.Errorf("Leftover = %+v, want frozen with no place (the Pantry shows it under Not sorted)", l)
	}
}

// ---- Had it ----

func TestHadItTakesPortionsOffAndReportsWhatIsReplanned(t *testing.T) {
	w := newLO(t)
	id := w.leftover(w.chilli, 4, "2026-11-12", 0, "")
	r := w.post(id, "had-it", map[string]any{"portions": 2})
	var out loAnswer
	if r.Status != 200 || r.JSON(&out) != nil || out.Leftover.ID != id || out.Leftover.Portions != 2 || out.Replanned == nil || len(out.Replanned) != 0 {
		t.Fatalf("had-it = %d %s, want 200 with the Leftover at 2 portions and replanned: []", r.Status, r.Body)
	}
	if n := w.count(`SELECT count(*) FROM stock_waste`); n != 0 {
		t.Errorf("%d waste records; Had it is not waste", n)
	}
	if n := w.count(`SELECT count(*) FROM leftover_events WHERE leftover_id = ? AND kind = 'had_it' AND portions = 2 AND on_date = ?`, id, crsc2.Today); n != 1 {
		t.Errorf("%d had_it events, want 1", n)
	}
}

func TestHadItNamesTheMealsItReplans(t *testing.T) {
	w := newLO(t)
	id := w.leftover(w.chilli, 2, "2026-11-12", 0, "")
	w.serve(w.chilli, id, true)
	r := w.post(id, "had-it", map[string]any{"portions": 1})
	var out loAnswer
	if r.Status != 200 || r.JSON(&out) != nil || len(out.Replanned) != 1 {
		t.Fatalf("had-it = %d %s, want one replanned meal", r.Status, r.Body)
	}
	if m := out.Replanned[0]; m.Date != crsc2.Today || m.MealSlotID != w.Slot || m.CourseID != w.Main || m.RecipeName != "Chilli" || m.MealSlotName != "Dinner" {
		t.Errorf("replanned = %+v, want today's Dinner Main that was going to have the Chilli", m)
	}
}

func TestHadItDryRunNamesTheMealsAndWritesNothing(t *testing.T) {
	w := newLO(t)
	id := w.leftover(w.chilli, 2, "2026-11-12", 0, "")
	w.serve(w.chilli, id, true)
	r := w.User.Post(fmt.Sprintf("/api/plan/leftovers/%d/had-it?dryRun=1", id), map[string]any{"portions": 1})
	var out struct {
		Replanned []loReplanned `json:"replanned"`
	}
	if r.Status != 200 || r.JSON(&out) != nil || len(out.Replanned) != 1 {
		t.Fatalf("dry run = %d %s, want one meal named", r.Status, r.Body)
	}
	if l := w.list()[id]; l.Portions != 2 || w.count(`SELECT count(*) FROM leftover_events`) != 0 || w.count(`SELECT count(*) FROM planned_meals WHERE pinned = 1`) != 1 {
		t.Errorf("a dry run changed something: %+v", l)
	}
}

func TestHadItRefusals(t *testing.T) {
	w := newLO(t)
	id := w.leftover(w.chilli, 3, "2026-11-12", 0, "")
	for _, body := range []map[string]any{{"portions": 0}, {"portions": -1}, {"portions": 3.5}, {}} {
		r := w.post(id, "had-it", body)
		loWantErr(t, fmt.Sprintf("had-it %v", body), r, 422, "portions_invalid")
	}
	loWantErr(t, "unknown Leftover", w.post(9999, "had-it", map[string]any{"portions": 1}), 404, "not_found")
	if r := w.Env.Anonymous().Post(fmt.Sprintf("/api/plan/leftovers/%d/had-it", id), map[string]any{"portions": 1}); r.Status != 401 {
		t.Errorf("anonymous had-it = %d, want 401", r.Status)
	}
	if l := w.list()[id]; l.Portions != 3 {
		t.Errorf("portions = %v after refusals, want 3", l.Portions)
	}
}

// ---- Threw it out ----

func TestThrewItOutRecordsWasteTodayAndStartsTheStreakAgain(t *testing.T) {
	w := newLO(t)
	id := w.leftover(w.chilli, 4, "2026-11-12", 0, "")
	if got := w.streak(); got != 39 {
		t.Fatalf("set-up: the streak is %d days, want 39 (the Household's age)", got)
	}
	r := w.post(id, "threw-out", map[string]any{"portions": 3})
	var out loAnswer
	if r.Status != 200 || r.JSON(&out) != nil || out.Leftover.Portions != 1 {
		t.Fatalf("threw-out = %d %s, want 200 with 1 portion left", r.Status, r.Body)
	}
	if n := w.count(`SELECT count(*) FROM stock_waste WHERE reason = 'leftover_discarded' AND wasted_on = ? AND quantity = 3 AND ingredient_id IS NULL`, crsc2.Today); n != 1 {
		t.Errorf("%d matching waste records, want 1 dated today for 3 portions", n)
	}
	if got := w.streak(); got != 0 {
		t.Errorf("the streak is %d days, want 0: waste today", got)
	}
}

func TestThrewItOutRefusals(t *testing.T) {
	w := newLO(t)
	id := w.leftover(w.chilli, 3, "2026-11-12", 0, "")
	loWantErr(t, "too many", w.post(id, "threw-out", map[string]any{"portions": 4}), 422, "portions_invalid")
	loWantErr(t, "unknown", w.post(9999, "threw-out", map[string]any{"portions": 1}), 404, "not_found")
	if n := w.count(`SELECT count(*) FROM stock_waste`); n != 0 {
		t.Errorf("%d waste records after refusals, want none", n)
	}
}

// ---- Freeze it ----

func TestFreezeItAnswersTheFrozenPartAndWhatIsLeft(t *testing.T) {
	w := newLO(t)
	freezer := w.place("Garage Freezer", "freezer")
	id := w.leftover(w.chilli, 4, "2026-11-12", 0, "")
	r := w.post(id, "freeze", map[string]any{"storagePlaceId": freezer, "portions": 1})
	var out loFreezeAnswer
	if r.Status != 200 || r.JSON(&out) != nil {
		t.Fatalf("freeze = %d %s", r.Status, r.Body)
	}
	if out.Frozen.ID == id || out.Frozen.Portions != 1 || !out.Frozen.Frozen || out.Frozen.UseBy != "2027-02-07" || out.Frozen.StoragePlaceName == nil || *out.Frozen.StoragePlaceName != "Garage Freezer" {
		t.Errorf("frozen = %+v, want a new Leftover of 1 portion in the Garage Freezer until 2027-02-07", out.Frozen)
	}
	if out.Left == nil || out.Left.ID != id || out.Left.Portions != 3 || out.Left.Frozen || out.Left.UseBy != "2026-11-12" {
		t.Errorf("left = %+v, want the original Leftover with 3 portions, not frozen", out.Left)
	}
	if out.Replanned == nil {
		t.Error("replanned must be a list, never null")
	}
}

func TestFreezeItWholeAnswersLeftNull(t *testing.T) {
	w := newLO(t)
	freezer := w.place("Garage Freezer", "freezer")
	id := w.leftover(w.chilli, 4, "2026-11-12", 0, "")
	r := w.post(id, "freeze", map[string]any{"storagePlaceId": freezer})
	var out loFreezeAnswer
	if r.Status != 200 || r.JSON(&out) != nil || out.Frozen.ID != id || out.Left != nil || out.Frozen.Portions != 4 {
		t.Fatalf("freeze = %d %s, want the same Leftover frozen whole and left: null", r.Status, r.Body)
	}
	if got := w.list()[id]; !got.Frozen || got.FrozenOn == nil || *got.FrozenOn != crsc2.Today {
		t.Errorf("Leftover = %+v, want frozen on today", got)
	}
}

func TestFreezeItUsesTheRecipesFrozenUseBy(t *testing.T) {
	w := newLO(t)
	freezer := w.place("Garage Freezer", "freezer")
	w.Exec(`UPDATE recipes SET frozen_use_by_days = 30 WHERE id = ?`, w.chilli)
	id := w.leftover(w.chilli, 2, "2026-11-12", 0, "")
	r := w.post(id, "freeze", map[string]any{"storagePlaceId": freezer})
	var out loFreezeAnswer
	if r.Status != 200 || r.JSON(&out) != nil || out.Frozen.UseBy != "2026-12-09" {
		t.Fatalf("freeze = %d %s, want Use-by 2026-12-09", r.Status, r.Body)
	}
}

func TestFreezeItRefusals(t *testing.T) {
	w := newLO(t)
	freezer := w.place("Garage Freezer", "freezer")
	fridge := w.place("Kitchen Fridge", "fridge")
	fresh := w.leftover(w.chilli, 3, "2026-11-12", 0, "")
	late := w.leftover(w.stew, 3, "2026-11-08", 0, "")
	frozen := w.leftover(w.stew, 3, "2027-02-07", freezer, "2026-11-02")
	loWantErr(t, "past its Use-by", w.post(late, "freeze", map[string]any{"storagePlaceId": freezer}), 409, "leftover_past_use_by")
	loWantErr(t, "already frozen", w.post(frozen, "freeze", map[string]any{"storagePlaceId": freezer}), 409, "leftover_frozen")
	loWantErr(t, "a fridge", w.post(fresh, "freeze", map[string]any{"storagePlaceId": fridge}), 422, "storage_place_not_freezer")
	loWantErr(t, "too many portions", w.post(fresh, "freeze", map[string]any{"storagePlaceId": freezer, "portions": 4}), 422, "portions_invalid")
	loWantErr(t, "unknown Leftover", w.post(9999, "freeze", map[string]any{"storagePlaceId": freezer}), 404, "not_found")
	loWantErr(t, "unknown place", w.post(fresh, "freeze", map[string]any{"storagePlaceId": 9999}), 422, "storage_place_unknown")
	loWantErr(t, "no place", w.post(fresh, "freeze", map[string]any{}), 422, "storage_place_unknown")
	if got := w.list()[fresh]; got.Frozen || got.Portions != 3 {
		t.Errorf("a refused Freeze changed the Leftover: %+v", got)
	}
}

// ---- Take out ----

func TestTakeOutMakesItANormalLeftover(t *testing.T) {
	w := newLO(t)
	freezer := w.place("Garage Freezer", "freezer")
	id := w.leftover(w.chilli, 3, "2027-02-07", freezer, "2026-11-02")
	r := w.post(id, "take-out", map[string]any{"storagePlaceId": nil})
	var out loBody
	if r.Status != 200 || r.JSON(&out) != nil {
		t.Fatalf("take-out = %d %s", r.Status, r.Body)
	}
	if out.ID != id || out.Frozen || out.FrozenOn != nil || out.StoragePlaceID != nil || out.UseBy != "2026-11-12" {
		t.Errorf("Leftover = %+v, want not frozen, in no place, Use-by 2026-11-12 (today + the Household's 3 days)", out)
	}
}

func TestTakeOutToAFridge(t *testing.T) {
	w := newLO(t)
	freezer, fridge := w.place("Garage Freezer", "freezer"), w.place("Kitchen Fridge", "fridge")
	id := w.leftover(w.chilli, 3, "2027-02-07", freezer, "2026-11-02")
	r := w.post(id, "take-out", map[string]any{"storagePlaceId": fridge})
	var out loBody
	if r.Status != 200 || r.JSON(&out) != nil || out.StoragePlaceID == nil || *out.StoragePlaceID != fridge || out.Frozen {
		t.Fatalf("take-out = %d %s, want it in the Kitchen Fridge, not frozen", r.Status, r.Body)
	}
}

func TestTakeOutRefusals(t *testing.T) {
	w := newLO(t)
	freezer, chest := w.place("Garage Freezer", "freezer"), w.place("Chest Freezer", "freezer")
	plain := w.leftover(w.stew, 3, "2026-11-12", 0, "")
	frozen := w.leftover(w.chilli, 3, "2027-02-07", freezer, "2026-11-02")
	loWantErr(t, "not frozen", w.post(plain, "take-out", map[string]any{"storagePlaceId": nil}), 409, "leftover_not_frozen")
	loWantErr(t, "into a Freezer", w.post(frozen, "take-out", map[string]any{"storagePlaceId": chest}), 422, "storage_place_freezer")
	loWantErr(t, "unknown place", w.post(frozen, "take-out", map[string]any{"storagePlaceId": 9999}), 422, "storage_place_unknown")
	loWantErr(t, "unknown Leftover", w.post(9999, "take-out", map[string]any{"storagePlaceId": nil}), 404, "not_found")
}

// ---- Answers and the streak ----

func TestAnsweringThrewItOutDatesTheWasteTheDayAfterTheUseByAndLowersTheStreak(t *testing.T) {
	w := newLO(t)
	id := w.leftover(w.chilli, 3, "2026-11-04", 0, "")
	if got := w.streak(); got != 39 {
		t.Fatalf("unanswered, the Leftover counts nothing: the streak is %d days, want 39", got)
	}
	if r := w.post(id, "answer", map[string]any{"answer": "threw_out"}); r.Status != 204 {
		t.Fatalf("answer = %d %s, want 204", r.Status, r.Body)
	}
	if n := w.count(`SELECT count(*) FROM stock_waste WHERE reason = 'leftover_discarded' AND wasted_on = '2026-11-05' AND quantity = 3`); n != 1 {
		t.Errorf("%d waste records dated 2026-11-05 (Use-by + 1), want 1", n)
	}
	if got := w.streak(); got != 4 {
		t.Errorf("the streak is %d days, want 4 (2026-11-05 to today)", got)
	}
	if _, ok := w.list()[id]; ok {
		t.Error("an answered Leftover with no portions left is no longer listed")
	}
}

func TestAnsweringHadItOrWasntThereIsNotWasteAndKeepsTheStreak(t *testing.T) {
	w := newLO(t)
	had := w.leftover(w.chilli, 3, "2026-11-04", 0, "")
	gone := w.leftover(w.stew, 2, "2026-11-04", 0, "")
	if r := w.post(had, "answer", map[string]any{"answer": "had_it"}); r.Status != 204 {
		t.Fatalf("had_it = %d %s", r.Status, r.Body)
	}
	if r := w.post(gone, "answer", map[string]any{"answer": "wasnt_there"}); r.Status != 204 {
		t.Fatalf("wasnt_there = %d %s", r.Status, r.Body)
	}
	if n := w.count(`SELECT count(*) FROM stock_waste`); n != 0 {
		t.Errorf("%d waste records, want none", n)
	}
	if got := w.streak(); got != 39 {
		t.Errorf("the streak is %d days, want 39", got)
	}
	if n := w.count(`SELECT count(*) FROM leftovers WHERE id = ?`, gone); n != 0 {
		t.Error("Wasn't there must delete the Leftover")
	}
	if n := w.count(`SELECT count(*) FROM leftover_events WHERE kind IN ('had_it','wasnt_there')`); n != 2 {
		t.Errorf("%d events, want had_it and wasnt_there", n)
	}
}

func TestAnswerRefusals(t *testing.T) {
	w := newLO(t)
	good := w.leftover(w.chilli, 3, "2026-11-12", 0, "")
	late := w.leftover(w.stew, 3, "2026-11-04", 0, "")
	loWantErr(t, "not to answer", w.post(good, "answer", map[string]any{"answer": "had_it"}), 409, "leftover_not_to_answer")
	loWantErr(t, "unknown Leftover", w.post(9999, "answer", map[string]any{"answer": "had_it"}), 404, "not_found")
	r := w.post(late, "answer", map[string]any{"answer": "binned"})
	if code, field, _ := loErrOf(r); r.Status != 422 || code != "validation_failed" || field != "answer" {
		t.Errorf("unknown answer = %d %s, want 422 validation_failed on answer", r.Status, r.Body)
	}
	r = w.post(late, "answer", map[string]any{})
	if code, field, _ := loErrOf(r); r.Status != 422 || code != "validation_failed" || field != "answer" {
		t.Errorf("no answer = %d %s, want 422 validation_failed on answer", r.Status, r.Body)
	}
}

// ---- From the freezer: pick a Leftover for a Course ----

func TestPickingAFrozenLeftoverForTheCoursePinsItAsALeftoverMeal(t *testing.T) {
	w := newLO(t)
	freezer := w.place("Garage Freezer", "freezer")
	id := w.leftover(w.chilli, 4, "2027-02-07", freezer, "2026-11-02")
	r := w.User.Put(fmt.Sprintf("/api/plan/%s/%d/%d", crsc2.Today, w.Slot, w.Main), map[string]any{"leftoverId": id})
	var out struct {
		RecipeID           int64 `json:"recipeId"`
		State              string
		Pinned             bool `json:"pinned"`
		Batches            float64
		Portions           float64
		ServedFromLeftover *struct {
			LeftoverID *int64 `json:"leftoverId"`
		} `json:"servedFromLeftover"`
	}
	if r.Status != 200 || r.JSON(&out) != nil {
		t.Fatalf("PUT = %d %s", r.Status, r.Body)
	}
	if out.RecipeID != w.chilli || !out.Pinned || out.ServedFromLeftover == nil || out.ServedFromLeftover.LeftoverID == nil || *out.ServedFromLeftover.LeftoverID != id || out.Portions != 2 {
		t.Errorf("meal = %s, want a Pinned Chilli served from the frozen Leftover for 2 portions", r.Body)
	}
	if l := w.list()[id]; !l.Frozen || l.PlannedPortions != 2 {
		t.Errorf("Leftover = %+v, want it still frozen and 2 planned portions", l)
	}
}

func TestPickingALeftoverRefusals(t *testing.T) {
	w := newLO(t)
	freezer := w.place("Garage Freezer", "freezer")
	small := w.leftover(w.chilli, 1, "2027-02-07", freezer, "2026-11-02")
	soon := w.leftover(w.stew, 4, "2026-11-08", 0, "")
	cell := fmt.Sprintf("/api/plan/%s/%d/%d", crsc2.Today, w.Slot, w.Main)
	loWantErr(t, "too small", w.User.Put(cell, map[string]any{"leftoverId": small}), 422, "leftover_too_small")
	loWantErr(t, "past its Use-by", w.User.Put(cell, map[string]any{"leftoverId": soon}), 409, "leftover_past_use_by")
	loWantErr(t, "unknown Leftover", w.User.Put(cell, map[string]any{"leftoverId": 9999}), 404, "not_found")
}

// ---- Round 2 ----

func TestPickingAWholeMealLeftoverForTheMainCourseReportsTheCoursesItCovered(t *testing.T) {
	w := crsc2.New(t)
	stew := w.Recipe("Beef stew", crsc2.RecipeSpec{Whole: true})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false) // unpinned, unresolved: the Whole meal covers it
	lw := &loWorld{World: w, chilli: stew, stew: stew}
	id := lw.leftover(stew, 4, "2026-11-12", 0, "")
	m := decodeMeal(t, w.User.Put(fmt.Sprintf("/api/plan/%s/%d/%d", crsc2.Today, w.Slot, w.Main), map[string]any{"leftoverId": id}))
	if m.CourseID != w.Main || !m.WholeMeal || len(m.Covered) != 1 || m.Covered[0] != w.Side {
		t.Errorf("meal = %+v, want covered [Side], as the recipeId path answers", m)
	}
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE course_id = ?`, w.Side); n != 0 {
		t.Errorf("the covered Side still has %d rows", n)
	}
}

func TestTakeOutNamesTheMealsDatedAfterTheNewUseByAndItsDryRunToo(t *testing.T) {
	w := newLO(t)
	freezer := w.place("Garage Freezer", "freezer")
	id := w.leftover(w.chilli, 3, "2027-02-07", freezer, "2026-11-02")
	w.serve(w.chilli, id, true) // today, 2026-11-09: before the new Use-by 2026-11-12
	w.Exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, from_leftover_id, from_date, from_meal_slot_id, from_course_id, created_at, updated_at)
		VALUES ('2026-11-16', ?, ?, ?, 0, 2, 'planned', 1, ?, '2026-11-05', ?, ?, '2026-11-08T12:00:00Z', '2026-11-08T12:00:00Z')`, w.Slot, w.Main, w.chilli, id, w.Slot, w.Main)
	r := w.User.Post(fmt.Sprintf("/api/plan/leftovers/%d/take-out?dryRun=1", id), map[string]any{"storagePlaceId": nil})
	var dry loAnswer
	if r.Status != 200 || r.JSON(&dry) != nil || len(dry.Replanned) != 1 || dry.Replanned[0].Date != "2026-11-16" {
		t.Fatalf("dry run = %d %s, want the meal of 2026-11-16 named", r.Status, r.Body)
	}
	if l := w.list()[id]; !l.Frozen || l.UseBy != "2027-02-07" {
		t.Errorf("a dry run changed the Leftover: %+v", l)
	}
	r = w.post(id, "take-out", map[string]any{"storagePlaceId": nil})
	var out loAnswer
	if r.Status != 200 || r.JSON(&out) != nil || len(out.Replanned) != 1 || out.Replanned[0].Date != "2026-11-16" {
		t.Fatalf("take-out = %d %s, want the meal of 2026-11-16 in replanned", r.Status, r.Body)
	}
	if out.Leftover.ID != id || out.Leftover.UseBy != "2026-11-12" {
		t.Errorf("leftover = %+v, want Use-by 2026-11-12", out.Leftover)
	}
}

func TestALeftoverWithNoPortionsAnswers404ForFreezeHadItAndThrewItOut(t *testing.T) {
	w := newLO(t)
	freezer := w.place("Garage Freezer", "freezer")
	id := w.leftover(w.chilli, 0, "2026-11-12", 0, "")
	loWantErr(t, "freeze", w.post(id, "freeze", map[string]any{"storagePlaceId": freezer}), 404, "not_found")
	loWantErr(t, "had-it", w.post(id, "had-it", map[string]any{"portions": 1}), 404, "not_found")
	loWantErr(t, "threw-out", w.post(id, "threw-out", map[string]any{"portions": 1}), 404, "not_found")
}
