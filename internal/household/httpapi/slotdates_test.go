package httpapi_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// A Meal Slot on one date (ADR 0014; spec §18; docs/dev/design/b5-sd.md). The fixture is crsc2: Monday Dinner at
// 19:00 serving Main then Side for Anna and Sam; today is Monday 2026-11-09 12:00, so the Dinner is still ahead.
// Team B5-SD, test-first: red until the handlers, the store and the planner honour the date's facts.

const (
	sdToday = crsc2.Today  // 2026-11-09, a Monday
	sdPast  = "2026-11-02" // a Monday in the past
	sdNext  = "2026-11-16" // the next Monday
	sdTues  = "2026-11-10" // not a Monday
)

type slotDateBody struct {
	Date      string  `json:"date"`
	NotServed bool    `json:"notServed"`
	Time      *string `json:"time"`
	UsualTime string  `json:"usualTime"`
	Guests    int     `json:"guests"`
}

type removedBody struct {
	CourseID   int64    `json:"courseId"`
	CourseName string   `json:"courseName"`
	RecipeName string   `json:"recipeName"`
	Pinned     bool     `json:"pinned"`
	Bought     []string `json:"bought"`
}

func sdURL(w *crsc2.World, date string) string {
	return path("/api/meal-slots/%d/dates/%s", w.Slot, date)
}

func sdGet(t *testing.T, w *crsc2.World, date string) slotDateBody {
	t.Helper()
	r := w.User.Get(sdURL(w, date))
	if r.Status != 200 {
		t.Fatalf("GET %s = %d %s", sdURL(w, date), r.Status, r.Body)
	}
	var b slotDateBody
	r.MustJSON(t, &b)
	return b
}

func sdSettle(t *testing.T, w *crsc2.World) {
	t.Helper()
	time.Sleep(150 * time.Millisecond)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := w.Env.App.WaitIdle(ctx); err != nil {
		t.Fatalf("the planner did not settle: %v", err)
	}
}

func sdMeals(w *crsc2.World, date string) int {
	return w.Count(`SELECT count(*) FROM planned_meals WHERE date = ? AND meal_slot_id = ?`, date, w.Slot)
}

func sdRecipe(w *crsc2.World) int64 {
	return w.Recipe("Roast chicken", crsc2.RecipeSpec{})
}

func TestTheDateOfASlotStartsAsTheUsualOne(t *testing.T) {
	w := crsc2.New(t)
	b := sdGet(t, w, sdToday)
	if b.Date != sdToday || b.NotServed || b.Time != nil || b.UsualTime != "19:00" || b.Guests != 0 {
		t.Errorf("date = %+v, want served, no own time (null), usually 19:00, no Guests", b)
	}
	// "time" is present and null, not absent.
	var raw map[string]json.RawMessage
	w.User.Get(sdURL(w, sdToday)).MustJSON(t, &raw)
	if string(raw["time"]) != "null" {
		t.Errorf("time = %s, want null", raw["time"])
	}
}

func TestSlotDateReadErrors(t *testing.T) {
	w := crsc2.New(t)
	if r := w.Env.Anonymous().Get(sdURL(w, sdToday)); r.Status != 401 {
		t.Errorf("signed out = %d, want 401", r.Status)
	}
	if r := w.User.Get(path("/api/meal-slots/%d/dates/%s", 99999, sdToday)); r.Status != 404 {
		t.Errorf("unknown Meal Slot = %d, want 404", r.Status)
	}
	if r := w.User.Get(sdURL(w, sdTues)); r.Status != 422 {
		t.Errorf("a Tuesday for a Monday slot = %d, want 422 weekday_mismatch", r.Status)
	}
	if r := w.User.Get(sdURL(w, "soon")); r.Status != 422 {
		t.Errorf("a date that is not a date = %d, want 422", r.Status)
	}
}

func TestAnyUserSetsTheDatesTimeAndSeesItEverywhere(t *testing.T) {
	w := crsc2.New(t)
	ch, cancel := w.Env.App.Deps.Events.Subscribe("household")
	defer cancel()
	r := w.User.Patch(sdURL(w, sdToday), map[string]any{"time": "20:15"})
	var b slotDateBody
	r.MustJSON(t, &b)
	if r.Status != 200 || b.Time == nil || *b.Time != "20:15" || b.UsualTime != "19:00" || b.NotServed {
		t.Fatalf("PATCH = %d %s, want 20:15 usually 19:00", r.Status, r.Body)
	}
	if got := sdGet(t, w, sdToday); got.Time == nil || *got.Time != "20:15" {
		t.Errorf("GET after PATCH = %+v", got)
	}
	if other := sdGet(t, w, sdNext); other.Time != nil {
		t.Errorf("next Monday = %+v, want its own usual time", other)
	}
	if ev := drainHousehold(ch); !strings.Contains(ev, `"changed":"slotDates"`) {
		t.Errorf("events = %q, want household {changed: slotDates}", ev)
	}
}

func TestBackToTheUsualTimeRemovesTheDatesTime(t *testing.T) {
	w := crsc2.New(t)
	w.User.Patch(sdURL(w, sdToday), map[string]any{"time": "20:15"})
	r := w.User.Patch(sdURL(w, sdToday), map[string]any{"time": nil})
	var b slotDateBody
	r.MustJSON(t, &b)
	if r.Status != 200 || b.Time != nil {
		t.Fatalf("PATCH time null = %d %s, want back to the usual time", r.Status, r.Body)
	}
	if n := w.Count(`SELECT count(*) FROM meal_slot_dates`); n != 0 {
		t.Errorf("%d rows stored, want the all-default row deleted", n)
	}
}

func TestPatchIsPresenceAwareAndLastWriteWinsPerField(t *testing.T) {
	w := crsc2.New(t)
	w.User.Patch(sdURL(w, sdToday), map[string]any{"time": "20:15"})
	w.User.Patch(sdURL(w, sdToday), map[string]any{"notServed": true})
	b := sdGet(t, w, sdToday)
	if !b.NotServed || b.Time == nil || *b.Time != "20:15" {
		t.Errorf("date = %+v, want Not served and the 20:15 kept: a field that is not sent is not touched", b)
	}
}

func TestSlotDatePatchIsValidated(t *testing.T) {
	w := crsc2.New(t)
	for _, tm := range []any{"25:00", "7pm", "19:60", 1930} {
		r := w.User.Patch(sdURL(w, sdToday), map[string]any{"time": tm})
		wantRefusal(t, "time "+string(mustJSON(tm)), r, 422, "validation_failed", "time", "time_invalid")
	}
	r := w.User.Patch(sdURL(w, sdPast), map[string]any{"notServed": true})
	wantRefusal(t, "Not served in the past", r, 422, "validation_failed", "notServed", "date_past")
	r = w.User.Patch(sdURL(w, sdPast), map[string]any{"time": "20:00"})
	wantRefusal(t, "a time in the past", r, 422, "validation_failed", "time", "date_past")
	if r := w.User.Patch(sdURL(w, sdTues), map[string]any{"notServed": true}); r.Status != 422 {
		t.Errorf("a Tuesday for a Monday slot = %d, want 422", r.Status)
	}
	if r := w.User.Patch(path("/api/meal-slots/%d/dates/%s", 99999, sdToday), map[string]any{"notServed": true}); r.Status != 404 {
		t.Errorf("unknown Meal Slot = %d, want 404", r.Status)
	}
	if n := w.Count(`SELECT count(*) FROM meal_slot_dates`); n != 0 {
		t.Errorf("%d rows after refused changes, want none", n)
	}
}

func mustJSON(v any) []byte { b, _ := json.Marshal(v); return b }

func TestNotServedRemovesTheUnresolvedMealsPinnedOnesToo(t *testing.T) {
	w := crsc2.New(t)
	roast := sdRecipe(w)
	w.Settle()
	w.Meal(sdToday, w.Slot, w.Main, roast, "planned", true)
	w.Meal(sdToday, w.Slot, w.Side, roast, "planned", false)
	r := w.User.Patch(sdURL(w, sdToday), map[string]any{"notServed": true})
	var b slotDateBody
	r.MustJSON(t, &b)
	if r.Status != 200 || !b.NotServed {
		t.Fatalf("PATCH = %d %s", r.Status, r.Body)
	}
	sdSettle(t, w)
	if n := sdMeals(w, sdToday); n != 0 {
		t.Errorf("%d Planned Meals left on the Not served date, want none (Pinned included, after the confirm)", n)
	}
	if n := w.Count(`SELECT count(*) FROM plan_unfilled WHERE date = ? AND meal_slot_id = ?`, sdToday, w.Slot); n != 0 {
		t.Errorf("%d Couldn't plan reasons on a Not served date, want none", n)
	}
}

func TestTheDryRunListsWhatNotServedRemovesPerCourseAndWritesNothing(t *testing.T) {
	w := crsc2.New(t)
	roast := sdRecipe(w)
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	w.Meal(sdToday, w.Slot, w.Main, roast, "planned", true)
	w.Meal(sdToday, w.Slot, w.Side, beans, "planned", false)
	r := w.User.Patch(sdURL(w, sdToday)+"?dryRun=1", map[string]any{"notServed": true})
	var out struct {
		Removes struct {
			PlannedMeals []removedBody `json:"plannedMeals"`
		} `json:"removes"`
	}
	r.MustJSON(t, &out)
	if r.Status != 200 || len(out.Removes.PlannedMeals) != 2 {
		t.Fatalf("dry run = %d %s, want two Planned Meals", r.Status, r.Body)
	}
	main, side := out.Removes.PlannedMeals[0], out.Removes.PlannedMeals[1] // in the slot's Course order
	if main.CourseID != w.Main || main.CourseName != "Main" || main.RecipeName != "Roast chicken" || !main.Pinned || main.Bought == nil || len(main.Bought) != 0 {
		t.Errorf("main = %+v, want Roast chicken (Pinned), bought []", main)
	}
	if side.CourseID != w.Side || side.CourseName != "Side" || side.RecipeName != "Green beans" || side.Pinned {
		t.Errorf("side = %+v, want Green beans, not Pinned", side)
	}
	if sdGet(t, w, sdToday).NotServed {
		t.Error("the dry run marked the date Not served")
	}
	if n := sdMeals(w, sdToday); n != 2 {
		t.Errorf("%d Planned Meals after the dry run, want both still there", n)
	}
	if n := w.Count(`SELECT count(*) FROM meal_slot_dates`); n != 0 {
		t.Errorf("%d rows written by a dry run", n)
	}
}

func TestTheDryRunOfAnEmptyDateListsNothing(t *testing.T) {
	w := crsc2.New(t)
	w.Settle()
	r := w.User.Patch(sdURL(w, sdToday)+"?dryRun=1", map[string]any{"notServed": true})
	var raw struct {
		Removes struct {
			PlannedMeals []removedBody `json:"plannedMeals"`
		} `json:"removes"`
	}
	r.MustJSON(t, &raw)
	if r.Status != 200 || raw.Removes.PlannedMeals == nil || len(raw.Removes.PlannedMeals) != 0 {
		t.Errorf("dry run = %d %s, want an empty list (not null)", r.Status, r.Body)
	}
}

func TestNotServedIsRefusedOnceACourseIsCookedOrNotCooked(t *testing.T) {
	for _, state := range []string{"cooked", "skipped"} {
		w := crsc2.New(t)
		roast := sdRecipe(w)
		w.Settle()
		w.Meal(sdToday, w.Slot, w.Main, roast, state, false)
		w.Meal(sdToday, w.Slot, w.Side, roast, "planned", false)
		r := w.User.Patch(sdURL(w, sdToday), map[string]any{"notServed": true})
		wantRefusal(t, state, r, 422, "validation_failed", "notServed", "slot_started")
		r = w.User.Patch(sdURL(w, sdToday)+"?dryRun=1", map[string]any{"notServed": true})
		wantRefusal(t, state+" dry run", r, 422, "validation_failed", "notServed", "slot_started")
		// The time of a started slot can still move (a Start cooking reminder was already sent; one more goes out).
		if r := w.User.Patch(sdURL(w, sdToday), map[string]any{"time": "21:00"}); r.Status != 200 {
			t.Errorf("%s: time = %d %s, want 200", state, r.Status, r.Body)
		}
	}
}

func TestServingAgainClearsNotServed(t *testing.T) {
	w := crsc2.New(t)
	w.User.Patch(sdURL(w, sdToday), map[string]any{"notServed": true})
	r := w.User.Patch(sdURL(w, sdToday), map[string]any{"notServed": false})
	var b slotDateBody
	r.MustJSON(t, &b)
	if r.Status != 200 || b.NotServed {
		t.Fatalf("PATCH notServed false = %d %s", r.Status, r.Body)
	}
	if n := w.Count(`SELECT count(*) FROM meal_slot_dates`); n != 0 {
		t.Errorf("%d rows stored, want the all-default row deleted", n)
	}
}

// ---- Who's eating: Guests and the emptied date ----

type whoBody struct {
	IsOverride     bool           `json:"isOverride"`
	Attendance     []attendeeBody `json:"attendance"`
	PortionsNeeded float64        `json:"portionsNeeded"`
	Guests         int            `json:"guests"`
	Courses        []struct {
		CourseID       int64   `json:"courseId"`
		PortionsNeeded float64 `json:"portionsNeeded"`
	} `json:"courses"`
}

func whoURL(w *crsc2.World, date string) string {
	return path("/api/meal-slots/%d/attendance?date=%s", w.Slot, date)
}

func whoGet(t *testing.T, w *crsc2.World, date string) whoBody {
	t.Helper()
	var b whoBody
	r := w.User.Get(whoURL(w, date))
	if r.Status != 200 {
		t.Fatalf("GET attendance = %d %s", r.Status, r.Body)
	}
	r.MustJSON(t, &b)
	return b
}

func TestAttendanceHasNoGuestsByDefault(t *testing.T) {
	w := crsc2.New(t)
	b := whoGet(t, w, sdToday)
	if b.Guests != 0 || b.PortionsNeeded != 2 {
		t.Errorf("attendance = %+v, want 0 Guests and 2 portions", b)
	}
	var raw map[string]json.RawMessage
	w.User.Get(whoURL(w, sdToday)).MustJSON(t, &raw)
	if _, ok := raw["guests"]; !ok {
		t.Error("GET attendance has no guests key")
	}
}

func TestPutGuestsAddsOneStandardPortionEachToEveryCourse(t *testing.T) {
	w := crsc2.New(t)
	ch, cancel := w.Env.App.Deps.Events.Subscribe("household")
	defer cancel()
	r := w.User.Put(whoURL(w, sdToday), map[string]any{"guests": 2})
	var b whoBody
	r.MustJSON(t, &b)
	if r.Status != 200 || b.Guests != 2 || b.PortionsNeeded != 4 {
		t.Fatalf("PUT guests = %d %s, want 2 Guests and 4 portions", r.Status, r.Body)
	}
	for _, c := range b.Courses {
		if c.PortionsNeeded != 4 {
			t.Errorf("Course %d needs %v portions, want 4: Guests eat every Course", c.CourseID, c.PortionsNeeded)
		}
	}
	if b.IsOverride {
		t.Error("Guests alone must not turn the date's Members into an override")
	}
	if got := whoGet(t, w, sdToday); got.Guests != 2 {
		t.Errorf("GET after PUT = %+v", got)
	}
	if ev := drainHousehold(ch); !strings.Contains(ev, "household") {
		t.Errorf("no household event after saving Guests (%q): the plan must replan", ev)
	}
}

func TestGuestsAreRefusedOutsideZeroToTwentyAndNothingIsWritten(t *testing.T) {
	w := crsc2.New(t)
	for _, n := range []int{21, -1, 1000} {
		r := w.User.Put(whoURL(w, sdToday), map[string]any{"guests": n, "attendance": []attendeeBody{{MemberID: w.Anna}}})
		wantRefusal(t, path("%d Guests", n), r, 422, "validation_failed", "guests", "guests_invalid")
	}
	if b := whoGet(t, w, sdToday); b.IsOverride || b.Guests != 0 {
		t.Errorf("attendance = %+v after refused saves, want untouched", b)
	}
	if r := w.User.Put(whoURL(w, sdToday), map[string]any{"guests": 20}); r.Status != 200 {
		t.Errorf("20 Guests = %d %s, want 200", r.Status, r.Body)
	}
}

func TestSavingNoMemberAndNoGuestMakesTheDateNotServed(t *testing.T) {
	w := crsc2.New(t)
	r := w.User.Put(whoURL(w, sdToday), map[string]any{"attendance": []attendeeBody{}})
	if r.Status != 200 {
		t.Fatalf("PUT = %d %s", r.Status, r.Body)
	}
	if b := sdGet(t, w, sdToday); !b.NotServed {
		t.Errorf("date = %+v, want Not served (U1: an emptied date)", b)
	}
	// Plan Dinner again: served, and the usual Attendance applies again.
	if r := w.User.Patch(sdURL(w, sdToday), map[string]any{"notServed": false}); r.Status != 200 {
		t.Fatalf("PATCH = %d %s", r.Status, r.Body)
	}
	if b := sdGet(t, w, sdToday); b.NotServed {
		t.Errorf("date = %+v, want served again", b)
	}
	if b := whoGet(t, w, sdToday); b.IsOverride || len(b.Attendance) != 2 {
		t.Errorf("attendance = %+v, want the usual two Members back", b)
	}
}

func TestSavingNoMemberButGuestsKeepsTheDateServed(t *testing.T) {
	w := crsc2.New(t)
	r := w.User.Put(whoURL(w, sdToday), map[string]any{"attendance": []attendeeBody{}, "guests": 3})
	var b whoBody
	r.MustJSON(t, &b)
	if r.Status != 200 || b.Guests != 3 || b.PortionsNeeded != 3 {
		t.Fatalf("PUT = %d %s, want 3 Guests and 3 portions", r.Status, r.Body)
	}
	if d := sdGet(t, w, sdToday); d.NotServed || d.Guests != 3 {
		t.Errorf("date = %+v, want served with 3 Guests (U3)", d)
	}
}

func TestResetToUsualAttendanceClearsGuestsButNotNotServedNorTheTime(t *testing.T) {
	w := crsc2.New(t)
	w.User.Put(whoURL(w, sdToday), map[string]any{"attendance": []attendeeBody{{MemberID: w.Anna}}, "guests": 4})
	w.User.Patch(sdURL(w, sdToday), map[string]any{"time": "20:00", "notServed": true})
	if r := w.User.Delete(whoURL(w, sdToday)); r.Status != 204 {
		t.Fatalf("DELETE = %d %s", r.Status, r.Body)
	}
	d := sdGet(t, w, sdToday)
	if d.Guests != 0 || !d.NotServed || d.Time == nil || *d.Time != "20:00" {
		t.Errorf("date = %+v, want Guests 0 and Not served and 20:00 kept (decision Q5)", d)
	}
	if b := whoGet(t, w, sdToday); b.IsOverride {
		t.Error("the date's Members were not reset")
	}
}

func TestGuestsOfANotServedDateAreKeptForWhenItIsServedAgain(t *testing.T) {
	w := crsc2.New(t)
	w.User.Put(whoURL(w, sdToday), map[string]any{"guests": 2})
	w.User.Patch(sdURL(w, sdToday), map[string]any{"notServed": true})
	if d := sdGet(t, w, sdToday); d.Guests != 2 {
		t.Errorf("date = %+v, want the 2 Guests kept", d)
	}
	w.User.Patch(sdURL(w, sdToday), map[string]any{"notServed": false})
	if d := sdGet(t, w, sdToday); d.Guests != 2 || d.NotServed {
		t.Errorf("date = %+v, want served again with the 2 Guests", d)
	}
}

func TestDeletingAMealSlotDeletesItsDates(t *testing.T) {
	w := crsc2.New(t)
	w.Exec(`INSERT INTO meal_slot_dates (slot_id, date, time, guests, updated_at) VALUES (?, ?, '20:00', 2, '2026-11-09T09:00:00Z')`, w.Slot, sdToday)
	if n := w.Count(`SELECT count(*) FROM meal_slot_dates`); n != 1 {
		t.Fatalf("setup: %d rows", n)
	}
	if r := w.Admin.Delete(path("/api/meal-slots/%d", w.Slot)); r.Status != 204 {
		t.Fatalf("DELETE slot = %d %s", r.Status, r.Body)
	}
	if n := w.Count(`SELECT count(*) FROM meal_slot_dates`); n != 0 {
		t.Errorf("%d date rows survive the Meal Slot", n)
	}
}

func TestSavingANonEmptyWhoIsEatingServesANotServedDateAgain(t *testing.T) {
	w := crsc2.New(t)
	w.User.Patch(sdURL(w, sdToday), map[string]any{"notServed": true})
	if r := w.User.Put(whoURL(w, sdToday), map[string]any{"attendance": []attendeeBody{{MemberID: w.Anna}}}); r.Status != 200 {
		t.Fatalf("PUT = %d %s", r.Status, r.Body)
	}
	if d := sdGet(t, w, sdToday); d.NotServed {
		t.Errorf("date = %+v, want served again after a non-empty save", d)
	}
}
