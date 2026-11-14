package httpapi_test

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/testkit"
	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B9-24 (PC-08, ADR 0025): Away on the Member over the API. Fixture (internal/testkit/crsc2): Monday 2026-11-09 12:00 UTC,
// Anna and Sam (Portion Factor 1) eat at every Meal Slot below, so a Meal Slot is 2 portions and 1 with one of them away.
//
//	Mon 09: Breakfast 08:00 (over), Dinner 19:00      Tue 10: Breakfast 08:00, Dinner 19:00      Wed 11: Dinner 19:00
//	Mon 16 (outside the 7-day horizon): the same Monday slots
//
// Design choices the tests pin (the chapter leaves them open):
//   - Wire: an Away is {id, memberId, memberName, from, fromMealSlotId|null, through|null, throughMealSlotId|null, started}.
//     POST /api/members/{id}/away → 201, PATCH /api/away/{id}, POST /api/away/{id}/end, DELETE /api/away/{id} → 200;
//     each answer is the Away (DELETE: {id}) flat beside "changes" (never null) and "undoToken" (planhttp.Replan).
//   - Errors are 422 validation_failed with field and reason (first_day_past, last_before_first, date_invalid,
//     slot_not_on_day, overlap, away_started), 404 for an unknown Member or Away, 409 away_started (DELETE of a started
//     Away), 409 away_not_started and away_over (End).
//   - GET /api/members/{id}/away lists the running and coming Aways, soonest first ([] when none); an ended one is not listed.
//   - ?dryRun=1 on POST and PATCH validates, writes nothing, publishes nothing, issues no token, and answers the summary.
//   - An Away applies from now on: a Meal Slot that has started (its time has passed) or is Cooked or Not cooked never changes.
//   - A Member removed with Remove Member (B9-04) takes their Aways with them: not listed, no effect on the plan, back on
//     Undo within 10 minutes (same ids); gone for good with the snapshot.
//   - "Eats here anyway" is `despiteAway: true` on an attendee of the date's Attendance override; it is dropped (not stored)
//     for a Member who is not away at that Meal Slot on that date; an override alone never lifts an Away.
//   - Everyone away and no Guests: nothing is Not served; each Course is Couldn't plan with reason no_attendance and the
//     plan slot carries everyoneAway: true.
const (
	mon, tue, wed = "2026-11-09", "2026-11-10", "2026-11-11"
	nextMon       = "2026-11-16"
)

type fixture struct {
	*crsc2.World
	monBreakfast, tueBreakfast, tueDinner, wedDinner int64
}

func newFixture(t *testing.T) fixture {
	t.Helper()
	w := crsc2.New(t)
	f := fixture{World: w}
	f.monBreakfast = w.AddSlot(1, "Breakfast", "08:00", w.Main)
	f.tueBreakfast = w.AddSlot(2, "Breakfast", "08:00", w.Main)
	f.tueDinner = w.AddSlot(2, "Dinner", "19:00", w.Main)
	f.wedDinner = w.AddSlot(3, "Dinner", "19:00", w.Main)
	w.Settle()
	return f
}

type awayBody struct {
	ID                int64   `json:"id"`
	MemberID          int64   `json:"memberId"`
	MemberName        string  `json:"memberName"`
	From              string  `json:"from"`
	FromMealSlotID    *int64  `json:"fromMealSlotId"`
	Through           *string `json:"through"`
	ThroughMealSlotID *int64  `json:"throughMealSlotId"`
	Started           bool    `json:"started"`
	Changes           []any   `json:"changes"`
	UndoToken         string  `json:"undoToken"`
}

func (f fixture) post(member int64, body map[string]any) *testkit.Response {
	f.T.Helper()
	return f.User.Post(fmt.Sprintf("/api/members/%d/away", member), body)
}

// add makes an Away and fails the test unless it is created.
func (f fixture) add(member int64, body map[string]any) awayBody {
	f.T.Helper()
	r := f.post(member, body)
	if r.Status != 201 {
		f.T.Fatalf("POST away %v = %d %s", body, r.Status, r.Body)
	}
	var a awayBody
	r.MustJSON(f.T, &a)
	return a
}

func (f fixture) settle() {
	f.T.Helper()
	time.Sleep(120 * time.Millisecond)
	f.Settle0()
}

// Settle0 waits for the planner without forgetting the plan rows (World.Settle does).
func (f fixture) Settle0() {
	f.T.Helper()
	ctxWait(f.T, f.Env)
}

type planSlot struct {
	Date         string  `json:"date"`
	MealSlotID   int64   `json:"mealSlotId"`
	Portions     float64 `json:"portions"`
	NotServed    bool    `json:"notServed"`
	EveryoneAway bool    `json:"everyoneAway"`
	Away         []int64 `json:"away"`
	Attendance   []struct {
		MemberID    int64 `json:"memberId"`
		DespiteAway bool  `json:"despiteAway"`
	} `json:"attendance"`
	Courses []struct {
		Unfilled *struct {
			Reason string `json:"reason"`
		} `json:"unfilled"`
	} `json:"courses"`
}

type planDoc struct {
	Slots []planSlot `json:"slots"`
	Away  []awayBody `json:"away"`
}

func (f fixture) plan(from, to string) planDoc {
	f.T.Helper()
	r := f.User.Get("/api/plan?from=" + from + "&to=" + to)
	if r.Status != 200 {
		f.T.Fatalf("GET /api/plan = %d %s", r.Status, r.Body)
	}
	var d planDoc
	r.MustJSON(f.T, &d)
	return d
}

func (f fixture) slot(date string, id int64) planSlot {
	f.T.Helper()
	for _, s := range f.plan(date, date).Slots {
		if s.MealSlotID == id {
			return s
		}
	}
	f.T.Fatalf("no plan slot %d on %s", id, date)
	return planSlot{}
}

func (f fixture) portions(date string, id int64) float64 { return f.slot(date, id).Portions }

func (f fixture) revision() int {
	f.T.Helper()
	var n int
	if err := f.Env.DB.QueryRow(`SELECT revision FROM plan_state`).Scan(&n); err != nil {
		f.T.Fatalf("plan_state.revision: %v", err)
	}
	return n
}

func (f fixture) list(member int64) []awayBody {
	f.T.Helper()
	r := f.User.Get(fmt.Sprintf("/api/members/%d/away", member))
	if r.Status != 200 {
		f.T.Fatalf("GET away = %d %s", r.Status, r.Body)
	}
	var out []awayBody
	r.MustJSON(f.T, &out)
	if out == nil || strings.TrimSpace(string(r.Body)) == "null" {
		f.T.Fatalf("GET away = %s, want [] when there is none", r.Body)
	}
	return out
}

func (f fixture) restore(token string) *testkit.Response {
	return f.User.Post("/api/plan/restore", map[string]any{"undoToken": token})
}

// ---- create, read, replan ----

func TestAMemberIsMarkedAwayForThreeDaysInOneWrite(t *testing.T) {
	f := newFixture(t)
	r := f.post(f.Anna, map[string]any{"from": tue, "through": wed})
	if r.Status != 201 {
		t.Fatalf("POST = %d %s", r.Status, r.Body)
	}
	var a awayBody
	r.MustJSON(t, &a)
	if a.ID == 0 || a.MemberID != f.Anna || a.MemberName != "Anna" || a.From != tue || a.Through == nil || *a.Through != wed ||
		a.FromMealSlotID != nil || a.ThroughMealSlotID != nil || a.Started {
		t.Errorf("answer = %s, want the whole-day Away of Anna, not started", r.Body)
	}
	if a.Changes == nil || a.UndoToken == "" {
		t.Errorf("answer = %s, want \"changes\" ([] at least) and an \"undoToken\" (PC-01)", r.Body)
	}
	f.settle()
	for _, c := range []struct {
		date string
		slot int64
	}{{tue, f.tueBreakfast}, {tue, f.tueDinner}, {wed, f.wedDinner}} {
		if p := f.portions(c.date, c.slot); p != 1 {
			t.Errorf("%s slot %d = %v portions, want 1 (Sam only)", c.date, c.slot, p)
		}
	}
	if p := f.portions(mon, f.Slot); p != 2 {
		t.Errorf("Monday Dinner = %v portions, want 2: the Away starts on Tuesday", p)
	}
	if got := f.list(f.Anna); len(got) != 1 || got[0].ID != a.ID {
		t.Errorf("GET away = %+v, want the Away", got)
	}
	if got := f.list(f.Sam); len(got) != 0 {
		t.Errorf("Sam's Aways = %+v, want none", got)
	}
}

func TestTheAwayStartsAtTheFirstMealSlotMissedAndEndsAtTheLastOne(t *testing.T) {
	f := newFixture(t)
	f.add(f.Anna, map[string]any{"from": tue, "fromMealSlotId": f.tueDinner, "through": wed, "throughMealSlotId": f.wedDinner})
	f.settle()
	if p := f.portions(tue, f.tueBreakfast); p != 2 {
		t.Errorf("Tuesday Breakfast = %v portions, want 2: the first Meal Slot missed is Dinner", p)
	}
	if p := f.portions(tue, f.tueDinner); p != 1 {
		t.Errorf("Tuesday Dinner = %v portions, want 1", p)
	}
	if p := f.portions(wed, f.wedDinner); p != 1 {
		t.Errorf("Wednesday Dinner (the last Meal Slot missed) = %v portions, want 1", p)
	}
	got := f.list(f.Anna)
	if len(got) != 1 || got[0].FromMealSlotID == nil || *got[0].FromMealSlotID != f.tueDinner || got[0].ThroughMealSlotID == nil || *got[0].ThroughMealSlotID != f.wedDinner {
		t.Errorf("list = %+v, want the Meal Slots kept", got)
	}
}

func TestAnAwayWithNoLastDayLastsUntilItIsEnded(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": tue})
	if a.Through != nil {
		t.Errorf("through = %v, want null: No last day yet", *a.Through)
	}
	f.settle()
	if p := f.portions(nextMon, f.Slot); p != 1 {
		t.Errorf("a Monday five weeks on = %v portions, want 1: the Away has no end", p)
	}
	if got := f.list(f.Anna); len(got) != 1 || got[0].Through != nil {
		t.Errorf("list = %+v, want the open Away", got)
	}
}

func TestAnAwayReachesPastThePlanningHorizonAndShowsOnThosePlanDays(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": nextMon, "through": "2026-11-17"}) // the horizon is 7 days: Mon 9 to Sun 15
	f.settle()
	s := f.slot(nextMon, f.Slot)
	if s.Portions != 1 {
		t.Errorf("Monday 16 = %v portions, want 1: an Away past the horizon is applied when those days are planned and read", s.Portions)
	}
	if len(s.Away) != 1 || s.Away[0] != f.Anna {
		t.Errorf("plan slot away = %v, want [Anna]", s.Away)
	}
	doc := f.plan(nextMon, nextMon)
	if len(doc.Away) != 1 || doc.Away[0].ID != a.ID || doc.Away[0].MemberName != "Anna" {
		t.Errorf("plan \"away\" = %+v, want the Away that touches the range", doc.Away)
	}
	if got := f.plan(mon, mon).Away; got == nil || len(got) != 0 {
		t.Errorf("plan \"away\" for Monday 9 = %+v, want [] (never null)", got)
	}
}

func TestAMealSlotThatHasStartedIsNeverChanged(t *testing.T) {
	f := newFixture(t)
	porridge := f.Recipe("Porridge", crsc2.RecipeSpec{})
	f.Settle()
	f.Meal(mon, f.monBreakfast, f.Main, porridge, "cooked", false)
	f.add(f.Anna, map[string]any{"from": mon, "through": tue})
	f.settle()
	if p := f.portions(mon, f.monBreakfast); p != 2 {
		t.Errorf("Monday Breakfast (08:00, over, Cooked) = %v portions, want 2: an Away applies from now on", p)
	}
	if s := f.MealState(mon, f.monBreakfast, f.Main); s != "cooked" {
		t.Errorf("the Cooked meal is now %q", s)
	}
	if p := f.portions(mon, f.Slot); p != 1 {
		t.Errorf("Monday Dinner (19:00, ahead) = %v portions, want 1", p)
	}
}

func TestOneWriteIsOneReplan(t *testing.T) {
	f := newFixture(t)
	before := f.revision()
	a := f.add(f.Anna, map[string]any{"from": tue, "through": wed})
	f.settle()
	if got := f.revision(); got != before+1 {
		t.Errorf("plan revision after Add = %d, want %d: one replan per write", got, before+1)
	}
	before = f.revision()
	if r := f.User.Patch(fmt.Sprintf("/api/away/%d", a.ID), map[string]any{"through": "2026-11-12"}); r.Status != 200 {
		t.Fatalf("PATCH = %d %s", r.Status, r.Body)
	}
	f.settle()
	if got := f.revision(); got != before+1 {
		t.Errorf("plan revision after Change = %d, want %d", got, before+1)
	}
}

func TestAnAwayWriteTellsOpenScreensWithAHouseholdAwayEvent(t *testing.T) {
	f := newFixture(t)
	ch, cancel := f.Env.App.Deps.Events.Subscribe("household")
	defer cancel()
	f.add(f.Anna, map[string]any{"from": tue})
	var seen []string
	for done := false; !done; {
		select {
		case e := <-ch:
			seen = append(seen, string(e.Data))
		case <-time.After(300 * time.Millisecond):
			done = true
		}
	}
	for _, d := range seen {
		var p map[string]any
		if json.Unmarshal([]byte(d), &p) == nil && len(p) == 1 && p["changed"] == "away" {
			return
		}
	}
	t.Fatalf("household events = %v, want {\"changed\":\"away\"}", seen)
}

// ---- validation ----

func errorOf(t *testing.T, r *testkit.Response) (code, field, reason, message string) {
	t.Helper()
	var b struct {
		Error struct {
			Code    string `json:"code"`
			Field   string `json:"field"`
			Reason  string `json:"reason"`
			Message string `json:"message"`
		} `json:"error"`
	}
	r.MustJSON(t, &b)
	return b.Error.Code, b.Error.Field, b.Error.Reason, b.Error.Message
}

func TestAnAwayThatIsNotValidIsRefusedWithTheFieldAndTheReasonAndWritesNothing(t *testing.T) {
	f := newFixture(t)
	for _, c := range []struct {
		name          string
		body          map[string]any
		field, reason string
	}{
		{"first day in the past", map[string]any{"from": "2026-11-08", "through": tue}, "from", "first_day_past"},
		{"last day before the first", map[string]any{"from": wed, "through": tue}, "through", "last_before_first"},
		{"not a date", map[string]any{"from": "17 Nov"}, "from", "date_invalid"},
		{"first Meal Slot of another day", map[string]any{"from": tue, "fromMealSlotId": f.wedDinner}, "fromMealSlotId", "slot_not_on_day"},
		{"last Meal Slot of another day", map[string]any{"from": tue, "through": tue, "throughMealSlotId": f.wedDinner}, "throughMealSlotId", "slot_not_on_day"},
	} {
		before := f.revision()
		r := f.post(f.Anna, c.body)
		code, field, reason, _ := errorOf(t, r)
		if r.Status != 422 || code != "validation_failed" || field != c.field || reason != c.reason {
			t.Errorf("%s: %d %s, want 422 validation_failed on %q (%s)", c.name, r.Status, r.Body, c.field, c.reason)
		}
		if f.revision() != before {
			t.Errorf("%s: the plan was replanned by a refused write", c.name)
		}
	}
	if got := f.list(f.Anna); len(got) != 0 {
		t.Errorf("refused writes left %+v", got)
	}
}

func TestAnAwayThatOverlapsAnotherOfTheSameMemberIsRefusedWithAMessageThatNamesIt(t *testing.T) {
	f := newFixture(t)
	f.add(f.Anna, map[string]any{"from": tue, "through": wed})
	r := f.post(f.Anna, map[string]any{"from": wed, "through": "2026-11-13"})
	_, field, reason, msg := errorOf(t, r)
	if r.Status != 422 || field != "from" || reason != "overlap" {
		t.Fatalf("POST = %d %s, want 422 on from (overlap)", r.Status, r.Body)
	}
	if !strings.Contains(msg, "Anna is already away Tue 10 – Wed 11 Nov") || !strings.Contains(msg, "Change that Away instead.") {
		t.Errorf("message = %q, want \"Anna is already away Tue 10 – Wed 11 Nov. Change that Away instead.\"", msg)
	}
	if r := f.post(f.Sam, map[string]any{"from": wed, "through": "2026-11-13"}); r.Status != 201 {
		t.Errorf("another Member's Away on the same days = %d %s, want 201", r.Status, r.Body)
	}
}

func TestAdjacentAwaysOnTheSameDayDoNotOverlap(t *testing.T) {
	f := newFixture(t)
	f.add(f.Anna, map[string]any{"from": tue, "through": tue, "throughMealSlotId": f.tueBreakfast})
	if r := f.post(f.Anna, map[string]any{"from": tue, "fromMealSlotId": f.tueDinner, "through": wed}); r.Status != 201 {
		t.Errorf("an Away from Tuesday Dinner after one through Tuesday Breakfast = %d %s, want 201", r.Status, r.Body)
	}
}

func TestAnUnknownMemberOrAwayIsNotFound(t *testing.T) {
	f := newFixture(t)
	for _, r := range []*testkit.Response{
		f.post(9999, map[string]any{"from": tue}),
		f.User.Get("/api/members/9999/away"),
		f.User.Patch("/api/away/9999", map[string]any{"through": tue}),
		f.User.Post("/api/away/9999/end", nil),
		f.User.Delete("/api/away/9999"),
	} {
		if r.Status != 404 {
			t.Errorf("status = %d %s, want 404", r.Status, r.Body)
		}
	}
}

func TestAnonymousCannotReadOrWriteAway(t *testing.T) {
	f := newFixture(t)
	if r := f.Env.Anonymous().Get(fmt.Sprintf("/api/members/%d/away", f.Anna)); r.Status != 401 {
		t.Errorf("anonymous GET = %d, want 401", r.Status)
	}
}

// ---- I see which meals an Away changes before I save it ----

func TestADryRunSaysWhatWouldChangeAndWritesNothing(t *testing.T) {
	f := newFixture(t)
	pasta := f.Recipe("Pasta", crsc2.RecipeSpec{})
	f.Settle()
	f.Meal(tue, f.tueDinner, f.Main, pasta, "planned", true)
	ch, cancel := f.Env.App.Deps.Events.Subscribe("household", "plan")
	defer cancel()
	before := f.revision()
	r := f.User.Post(fmt.Sprintf("/api/members/%d/away?dryRun=1", f.Anna), map[string]any{"from": tue, "through": wed})
	if r.Status != 200 {
		t.Fatalf("dry run = %d %s", r.Status, r.Body)
	}
	var s struct {
		SlotsWithout int `json:"slotsWithout"`
		MealsChanged int `json:"mealsChanged"`
		Days         []struct {
			Date  string `json:"date"`
			Slots []struct {
				MealSlotID     int64   `json:"mealSlotId"`
				MealSlotName   string  `json:"mealSlotName"`
				PortionsBefore float64 `json:"portionsBefore"`
				PortionsAfter  float64 `json:"portionsAfter"`
				Changes        bool    `json:"changes"`
			} `json:"slots"`
		} `json:"days"`
		BeyondHorizon *string `json:"beyondHorizon"`
		UndoToken     string  `json:"undoToken"`
	}
	r.MustJSON(t, &s)
	if s.SlotsWithout != 3 || s.MealsChanged != 3 || len(s.Days) != 2 || s.Days[0].Date != tue || s.Days[1].Date != wed {
		t.Fatalf("summary = %s, want 3 Meal Slots without Anna, 3 meals change, over Tue and Wed", r.Body)
	}
	b := s.Days[0].Slots[0]
	if b.MealSlotName != "Breakfast" || b.PortionsBefore != 2 || b.PortionsAfter != 1 || !b.Changes || s.Days[0].Slots[1].MealSlotName != "Dinner" {
		t.Errorf("Tuesday = %+v, want Breakfast 2 → 1 then Dinner, by time of day", s.Days[0].Slots)
	}
	if s.BeyondHorizon != nil || s.UndoToken != "" {
		t.Errorf("beyondHorizon = %v, undoToken = %q, want null and none", s.BeyondHorizon, s.UndoToken)
	}
	f.settle()
	if got := f.list(f.Anna); len(got) != 0 {
		t.Errorf("a dry run saved %+v", got)
	}
	if f.revision() != before || f.portions(tue, f.tueDinner) != 2 {
		t.Error("a dry run changed the plan")
	}
	select {
	case e := <-ch:
		t.Errorf("a dry run published %s", e.Data)
	case <-time.After(200 * time.Millisecond):
	}
}

func TestADryRunOfAnAwayPastTheHorizonSaysFromWhenThePlannerLeavesThemOut(t *testing.T) {
	f := newFixture(t)
	r := f.User.Post(fmt.Sprintf("/api/members/%d/away?dryRun=1", f.Anna), map[string]any{"from": "2026-12-01", "through": "2026-12-05"})
	var s struct {
		SlotsWithout  int     `json:"slotsWithout"`
		MealsChanged  int     `json:"mealsChanged"`
		BeyondHorizon *string `json:"beyondHorizon"`
	}
	r.MustJSON(t, &s)
	if r.Status != 200 || s.SlotsWithout != 0 || s.MealsChanged != 0 || s.BeyondHorizon == nil || *s.BeyondHorizon != "2026-12-01" {
		t.Errorf("dry run = %d %s, want nothing changing this week and beyondHorizon 2026-12-01", r.Status, r.Body)
	}
}

func TestADryRunRefusesWhatASaveWouldRefuse(t *testing.T) {
	f := newFixture(t)
	r := f.User.Post(fmt.Sprintf("/api/members/%d/away?dryRun=1", f.Anna), map[string]any{"from": "2026-11-08"})
	if _, _, reason, _ := errorOf(t, r); r.Status != 422 || reason != "first_day_past" {
		t.Errorf("dry run = %d %s, want 422 first_day_past", r.Status, r.Body)
	}
}

// ---- change, end, delete ----

func TestChangingAnAwayReplansOnceAndAnAwayThatHasNotStartedMayMoveItsFirstDay(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": wed, "through": wed})
	r := f.User.Patch(fmt.Sprintf("/api/away/%d", a.ID), map[string]any{"from": tue, "through": nil})
	if r.Status != 200 {
		t.Fatalf("PATCH = %d %s", r.Status, r.Body)
	}
	var got awayBody
	r.MustJSON(t, &got)
	if got.ID != a.ID || got.From != tue || got.Through != nil || got.Changes == nil || got.UndoToken == "" {
		t.Errorf("answer = %s, want the same Away from Tuesday with no last day, changes and a token", r.Body)
	}
	f.settle()
	if p := f.portions(tue, f.tueDinner); p != 1 {
		t.Errorf("Tuesday Dinner = %v portions, want 1 after the change", p)
	}
}

func TestARunningAwayCannotMoveItsFirstDayButCanBeExtended(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": mon, "through": tue})
	f.Env.Clock.Set(time.Date(2026, 11, 9, 20, 0, 0, 0, time.UTC)) // Monday Dinner has started: the Away is running
	r := f.User.Patch(fmt.Sprintf("/api/away/%d", a.ID), map[string]any{"from": tue})
	if _, field, reason, _ := errorOf(t, r); r.Status != 422 || field != "from" || reason != "away_started" {
		t.Errorf("moving a running Away's first day = %d %s, want 422 on from (away_started)", r.Status, r.Body)
	}
	if r := f.User.Patch(fmt.Sprintf("/api/away/%d", a.ID), map[string]any{"through": wed}); r.Status != 200 {
		t.Errorf("extending a running Away = %d %s, want 200", r.Status, r.Body)
	}
	if got := f.list(f.Anna); len(got) != 1 || !got[0].Started {
		t.Errorf("list = %+v, want the Away marked started", got)
	}
}

func TestDeletingAnAwayThatHasStartedIsRefusedAndBeforeItStartsItIsDeleted(t *testing.T) {
	f := newFixture(t)
	running := f.add(f.Anna, map[string]any{"from": mon, "through": tue})
	coming := f.add(f.Sam, map[string]any{"from": tue, "through": wed})
	f.Env.Clock.Set(time.Date(2026, 11, 9, 20, 0, 0, 0, time.UTC))
	r := f.User.Delete(fmt.Sprintf("/api/away/%d", running.ID))
	if r.Status != 409 || r.ErrorCode() != "away_started" {
		t.Errorf("DELETE of a running Away = %d %s, want 409 away_started", r.Status, r.Body)
	}
	if got := f.list(f.Anna); len(got) != 1 {
		t.Errorf("the refused DELETE removed it: %+v", got)
	}
	r = f.User.Delete(fmt.Sprintf("/api/away/%d", coming.ID))
	var out awayBody
	r.MustJSON(t, &out)
	if r.Status != 200 || out.Changes == nil || out.UndoToken == "" {
		t.Errorf("DELETE = %d %s, want 200 with changes and an undoToken", r.Status, r.Body)
	}
	if got := f.list(f.Sam); len(got) != 0 {
		t.Errorf("list = %+v after DELETE", got)
	}
}

func TestEndingAnAwayTodayBringsTheMemberBackFromTheNextMealSlot(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": mon, "through": wed})
	f.Env.Clock.Set(time.Date(2026, 11, 9, 20, 0, 0, 0, time.UTC)) // Monday Dinner, the last Meal Slot of the day, has started
	r := f.User.Post(fmt.Sprintf("/api/away/%d/end", a.ID), nil)
	var got awayBody
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Through == nil || *got.Through != mon || got.ThroughMealSlotID == nil || *got.ThroughMealSlotID != f.Slot || got.UndoToken == "" {
		t.Fatalf("End = %d %s, want the Away through Monday Dinner, with a token", r.Status, r.Body)
	}
	f.settle()
	if p := f.portions(tue, f.tueBreakfast); p != 2 {
		t.Errorf("Tuesday Breakfast = %v portions, want 2: back from the next Meal Slot", p)
	}
	if r := f.User.Post(fmt.Sprintf("/api/away/%d/end", a.ID), nil); r.Status != 409 || r.ErrorCode() != "away_over" {
		t.Errorf("a second End = %d %s, want 409 away_over", r.Status, r.Body)
	}
}

func TestAnAwayThatHasNotStartedCannotBeEnded(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": wed})
	if r := f.User.Post(fmt.Sprintf("/api/away/%d/end", a.ID), nil); r.Status != 409 || r.ErrorCode() != "away_not_started" {
		t.Errorf("End = %d %s, want 409 away_not_started (delete it instead)", r.Status, r.Body)
	}
}

// ---- Undo: the Away row is restored by its undo participant, whatever the module mount order ----

// Modules mount in name order, so "away" mounts before "planning": the Away undo participant must be registered with the
// Replanner although it does not exist yet at that moment. These tests fail when it is not (an Away with no undo).
func TestUndoOfAnAddRemovesTheAwayAndPutsThePlanBack(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": tue, "through": wed})
	f.settle()
	if r := f.restore(a.UndoToken); r.Status != 200 {
		t.Fatalf("restore = %d %s", r.Status, r.Body)
	}
	if got := f.list(f.Anna); len(got) != 0 {
		t.Errorf("after Undo the Away is still there: %+v", got)
	}
	if p := f.portions(tue, f.tueDinner); p != 2 {
		t.Errorf("Tuesday Dinner = %v portions after Undo, want 2", p)
	}
}

func TestUndoOfAChangePutsTheOldRangeBack(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": tue, "through": tue})
	f.settle()
	r := f.User.Patch(fmt.Sprintf("/api/away/%d", a.ID), map[string]any{"through": wed})
	var ch awayBody
	r.MustJSON(t, &ch)
	f.settle()
	if r := f.restore(ch.UndoToken); r.Status != 200 {
		t.Fatalf("restore = %d %s", r.Status, r.Body)
	}
	got := f.list(f.Anna)
	if len(got) != 1 || got[0].ID != a.ID || got[0].Through == nil || *got[0].Through != tue {
		t.Errorf("after Undo = %+v, want Away %d through Tue", got, a.ID)
	}
	if p := f.portions(wed, f.wedDinner); p != 2 {
		t.Errorf("Wednesday Dinner = %v portions after Undo, want 2", p)
	}
}

func TestUndoOfADeleteBringsTheAwayBackWithTheSameId(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": tue, "through": wed})
	r := f.User.Delete(fmt.Sprintf("/api/away/%d", a.ID))
	var del awayBody
	r.MustJSON(t, &del)
	if r.Status != 200 || del.UndoToken == "" {
		t.Fatalf("DELETE = %d %s", r.Status, r.Body)
	}
	f.settle()
	if r := f.restore(del.UndoToken); r.Status != 200 {
		t.Fatalf("restore = %d %s", r.Status, r.Body)
	}
	if got := f.list(f.Anna); len(got) != 1 || got[0].ID != a.ID {
		t.Errorf("after Undo = %+v, want Away %d back", got, a.ID)
	}
}

func TestUndoOfEndingAnAwayRunsItAgain(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": mon, "through": wed})
	f.Env.Clock.Set(time.Date(2026, 11, 9, 20, 0, 0, 0, time.UTC))
	r := f.User.Post(fmt.Sprintf("/api/away/%d/end", a.ID), nil)
	var end awayBody
	r.MustJSON(t, &end)
	f.settle()
	if r := f.restore(end.UndoToken); r.Status != 200 {
		t.Fatalf("restore = %d %s", r.Status, r.Body)
	}
	if got := f.list(f.Anna); len(got) != 1 || got[0].Through == nil || *got[0].Through != wed || got[0].ThroughMealSlotID != nil {
		t.Errorf("after Undo = %+v, want the Away through Wednesday again", got)
	}
}

func TestAnAwayUndoIsRefusedOnceAnythingElseChangedThePlan(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": tue})
	f.settle()
	f.add(f.Sam, map[string]any{"from": wed, "through": wed}) // another write since
	f.settle()
	if r := f.restore(a.UndoToken); r.Status != 409 || r.ErrorCode() != "plan_changed" {
		t.Errorf("restore = %d %s, want 409 plan_changed", r.Status, r.Body)
	}
	if got := f.list(f.Anna); len(got) != 1 {
		t.Errorf("a refused Undo removed the Away: %+v", got)
	}
}

// ---- Who's eating: Eats here anyway ----

func (f fixture) putDate(slot int64, date string, body map[string]any) *testkit.Response {
	return f.User.Put(fmt.Sprintf("/api/meal-slots/%d/attendance?date=%s", slot, date), body)
}

func TestAMemberWhoIsAwayCanStillEatAtOneMealSlot(t *testing.T) {
	f := newFixture(t)
	f.add(f.Anna, map[string]any{"from": tue, "through": wed})
	r := f.putDate(f.tueDinner, tue, map[string]any{"attendance": []map[string]any{{"memberId": f.Anna, "despiteAway": true}, {"memberId": f.Sam}}})
	if r.Status != 200 {
		t.Fatalf("PUT attendance = %d %s", r.Status, r.Body)
	}
	var got struct {
		Attendance []struct {
			MemberID    int64 `json:"memberId"`
			DespiteAway bool  `json:"despiteAway"`
		} `json:"attendance"`
		Away []struct {
			MemberID int64  `json:"memberId"`
			AwayID   int64  `json:"awayId"`
			From     string `json:"from"`
		} `json:"away"`
		PortionsNeeded float64 `json:"portionsNeeded"`
	}
	r.MustJSON(t, &got)
	if got.PortionsNeeded != 2 || len(got.Attendance) != 2 || !got.Attendance[0].DespiteAway {
		t.Errorf("answer = %s, want Anna kept with despiteAway and 2 portions", r.Body)
	}
	if len(got.Away) != 1 || got.Away[0].MemberID != f.Anna || got.Away[0].From != tue || got.Away[0].AwayID == 0 {
		t.Errorf("answer away = %+v, want Anna's Away listed, so Who's eating can show its row", got.Away)
	}
	f.settle()
	if p := f.portions(tue, f.tueDinner); p != 2 {
		t.Errorf("Tuesday Dinner = %v portions, want 2 (Anna eats here anyway)", p)
	}
	if p := f.portions(tue, f.tueBreakfast); p != 1 {
		t.Errorf("Tuesday Breakfast = %v portions, want 1: the override is for one Meal Slot", p)
	}
	if p := f.portions(wed, f.wedDinner); p != 1 {
		t.Errorf("Wednesday Dinner = %v portions, want 1: the override is for one date", p)
	}
	var anna struct{ DespiteAway bool }
	for _, a := range f.slot(tue, f.tueDinner).Attendance {
		if a.MemberID == f.Anna {
			anna.DespiteAway = a.DespiteAway
		}
	}
	if !anna.DespiteAway {
		t.Error("the plan slot does not mark Anna despiteAway")
	}
}

func TestAnOverrideWithoutDespiteAwayDoesNotLiftAnAway(t *testing.T) {
	f := newFixture(t)
	f.add(f.Anna, map[string]any{"from": tue, "through": wed})
	r := f.putDate(f.tueDinner, tue, map[string]any{"attendance": []map[string]any{{"memberId": f.Anna}, {"memberId": f.Sam}}})
	if r.Status != 200 {
		t.Fatalf("PUT attendance = %d %s", r.Status, r.Body)
	}
	f.settle()
	if p := f.portions(tue, f.tueDinner); p != 1 {
		t.Errorf("Tuesday Dinner = %v portions, want 1: the Away still removes Anna", p)
	}
}

func TestDespiteAwayIsDroppedForAMemberWhoIsNotAway(t *testing.T) {
	f := newFixture(t)
	r := f.putDate(f.tueDinner, tue, map[string]any{"attendance": []map[string]any{{"memberId": f.Anna, "despiteAway": true}, {"memberId": f.Sam}}})
	if r.Status != 200 {
		t.Fatalf("PUT attendance = %d %s", r.Status, r.Body)
	}
	if strings.Contains(string(r.Body), "despiteAway\":true") {
		t.Errorf("answer = %s, want no despiteAway for a Member who is not away", r.Body)
	}
	if n := f.Count(`SELECT COUNT(*) FROM attendance_override_attendees WHERE despite_away = 1`); n != 0 {
		t.Errorf("%d rows keep despite_away for a Member who is not away", n)
	}
}

func TestTheSlotDateReadListsWhoIsAway(t *testing.T) {
	f := newFixture(t)
	f.add(f.Anna, map[string]any{"from": tue, "through": wed})
	r := f.User.Get(fmt.Sprintf("/api/meal-slots/%d/dates/%s", f.tueDinner, tue))
	var got struct {
		Away      []int64 `json:"away"`
		NotServed bool    `json:"notServed"`
	}
	r.MustJSON(t, &got)
	if r.Status != 200 || len(got.Away) != 1 || got.Away[0] != f.Anna || got.NotServed {
		t.Errorf("slot date = %d %s, want away [Anna] and served", r.Status, r.Body)
	}
	r = f.User.Get(fmt.Sprintf("/api/meal-slots/%d/dates/%s", f.tueDinner, "2026-11-24"))
	if r.MustJSON(t, &got); len(got.Away) != 0 {
		t.Errorf("a date after the Away: %s, want away []", r.Body)
	}
}

// ---- nobody eating ----

func TestWhenEveryoneIsAwayTheMealSlotIsCouldntPlanNotNotServed(t *testing.T) {
	f := newFixture(t)
	f.add(f.Anna, map[string]any{"from": tue, "through": tue})
	f.add(f.Sam, map[string]any{"from": tue, "through": tue})
	f.settle()
	s := f.slot(tue, f.tueDinner)
	if s.NotServed || !s.EveryoneAway || s.Portions != 0 {
		t.Errorf("slot = %+v, want served, everyoneAway and 0 portions", s)
	}
	if len(s.Courses) == 0 || s.Courses[0].Unfilled == nil || s.Courses[0].Unfilled.Reason != "no_attendance" {
		t.Errorf("courses = %+v, want Couldn't plan with reason no_attendance", s.Courses)
	}
}

func TestEveryoneAwayButAGuestIsStillServed(t *testing.T) {
	f := newFixture(t)
	f.add(f.Anna, map[string]any{"from": tue, "through": tue})
	f.add(f.Sam, map[string]any{"from": tue, "through": tue})
	if r := f.putDate(f.tueDinner, tue, map[string]any{"guests": 2}); r.Status != 200 {
		t.Fatalf("PUT guests = %d %s", r.Status, r.Body)
	}
	f.settle()
	if s := f.slot(tue, f.tueDinner); s.Portions != 2 || s.EveryoneAway {
		t.Errorf("slot = %+v, want 2 portions for the 2 Guests and not everyoneAway", s)
	}
}

// ---- Remove Member (B9-04) ----

func TestARemovedMembersAwaysComeBackWithTheMember(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": tue, "through": wed})
	if r := f.Admin.Delete(fmt.Sprintf("/api/members/%d", f.Anna)); r.Status != 204 {
		t.Fatalf("remove Member = %d %s", r.Status, r.Body)
	}
	f.settle()
	if r := f.User.Get(fmt.Sprintf("/api/members/%d/away", f.Anna)); r.Status != 404 {
		t.Errorf("GET away of a removed Member = %d, want 404", r.Status)
	}
	if r := f.User.Patch(fmt.Sprintf("/api/away/%d", a.ID), map[string]any{"through": tue}); r.Status != 404 {
		t.Errorf("PATCH of a removed Member's Away = %d, want 404", r.Status)
	}
	if doc := f.plan(tue, tue); len(doc.Away) != 0 {
		t.Errorf("plan away = %+v, want none while the Member is removed", doc.Away)
	}
	if p := f.portions(tue, f.tueDinner); p != 1 {
		t.Errorf("Tuesday Dinner = %v portions, want 1 (Sam only; Anna is removed)", p)
	}
	if r := f.Admin.Post(fmt.Sprintf("/api/members/%d/restore", f.Anna), nil); r.Status != 200 {
		t.Fatalf("restore Member = %d %s", r.Status, r.Body)
	}
	f.settle()
	if got := f.list(f.Anna); len(got) != 1 || got[0].ID != a.ID || got[0].From != tue {
		t.Errorf("after restore = %+v, want Away %d back", got, a.ID)
	}
	if p := f.portions(tue, f.tueDinner); p != 1 {
		t.Errorf("Tuesday Dinner = %v portions after restore, want 1: Anna is back and away", p)
	}
	if p := f.portions(mon, f.Slot); p != 2 {
		t.Errorf("Monday Dinner = %v portions after restore, want 2: Anna is back and not away", p)
	}
}

func TestARemovedMembersAwaysAreDeletedWithTheExpiredSnapshot(t *testing.T) {
	f := newFixture(t)
	f.add(f.Anna, map[string]any{"from": tue, "through": wed})
	if r := f.Admin.Delete(fmt.Sprintf("/api/members/%d", f.Anna)); r.Status != 204 {
		t.Fatalf("remove Member = %d %s", r.Status, r.Body)
	}
	f.Env.Clock.Advance(11 * time.Minute)
	if r := f.Admin.Post(fmt.Sprintf("/api/members/%d/restore", f.Anna), nil); r.Status != 404 {
		t.Errorf("restore after 10 minutes = %d, want 404", r.Status)
	}
	if r := f.Admin.Delete(fmt.Sprintf("/api/members/%d", f.Sam)); r.Status != 204 { // the next removal clears expired snapshots
		t.Fatalf("remove Sam = %d %s", r.Status, r.Body)
	}
	if n := f.Count(`SELECT COUNT(*) FROM member_away`); n != 0 {
		t.Errorf("member_away rows after the snapshot expired = %d, want 0", n)
	}
}
