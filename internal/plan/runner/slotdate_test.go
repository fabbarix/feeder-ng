package runner_test

import (
	"errors"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

// A Meal Slot on one date in the runner (ADR 0014; docs/dev/design/b5-sd.md). The Sources are the fake, which serves
// the per-date facts through SlotDate. Team B5-SD, test-first.

const (
	tue = "2026-11-10"
	wed = "2026-11-11"
)

// simpleOnly leaves the yield-2 Recipes, so a Batch is exactly one slot's portions and nothing is a Leftover.
func (e *env) simpleOnly() {
	var simple []planner.Recipe
	for _, rec := range e.src.recipes {
		if rec.Yield == 2 {
			simple = append(simple, rec)
		}
	}
	e.src.recipes = simple
}

func (e *env) slotOn(day int) int64 { return e.key(day).MealSlotID }

func TestGuestsRaisePortionsAndBatches(t *testing.T) {
	e := newEnv(t)
	e.simpleOnly()
	e.src.setDate(e.slotOn(10), tue, runner.SlotDateDef{Guests: 2})
	e.mustPlan()
	m := e.meal(10)
	if m.Portions != 4 || m.Batches != 2 {
		t.Errorf("Tuesday = %+v, want 4 portions (2 Members + 2 Guests) in 2 Batches", m)
	}
	if other := e.meal(11); other.Portions != 2 || other.Batches != 1 {
		t.Errorf("Wednesday = %+v, want 2 portions in 1 Batch (no Guests)", other)
	}
}

func TestADateOfGuestsAndNoMemberIsPlannedAndNobodyAtAllIsNot(t *testing.T) {
	e := newEnv(t)
	e.simpleOnly()
	e.src.setAttendance(e.slotOn(10), tue, []plan.Attendee{})
	e.src.setDate(e.slotOn(10), tue, runner.SlotDateDef{Guests: 3})
	e.src.setAttendance(e.slotOn(11), wed, []plan.Attendee{}) // nobody and no Guest, and not Not served: the usual is empty
	e.mustPlan()
	if m := e.meal(10); m.Portions != 3 || m.Batches != 2 {
		t.Errorf("Tuesday = %+v, want the 3 Guests planned for (3 portions, 2 Batches)", m)
	}
	un, _ := e.st.Unfilled(ctx, wed, wed)
	if len(un) != 1 || un[0].Reason != "no_attendance" {
		t.Errorf("Wednesday unfilled = %+v, want no_attendance: nobody and no Guest stays Couldn't plan", un)
	}
	if un, _ := e.st.Unfilled(ctx, tue, tue); len(un) != 0 {
		t.Errorf("Tuesday unfilled = %+v, want none", un)
	}
}

func TestANotServedDateHasNoMealAndNoReason(t *testing.T) {
	e := newEnv(t)
	e.simpleOnly()
	e.src.setDate(e.slotOn(10), tue, runner.SlotDateDef{NotServed: true})
	e.mustPlan()
	if _, err := e.st.Meal(ctx, e.key(10)); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Tuesday has a Planned Meal (%v), want none", err)
	}
	if un, _ := e.st.Unfilled(ctx, tue, tue); len(un) != 0 {
		t.Errorf("Tuesday unfilled = %+v, want none: Not served is not Couldn't plan", un)
	}
	e.meal(9)
	e.meal(11)
	v, err := e.r.View(ctx, tue, tue)
	if err != nil || len(v.Slots) != 1 {
		t.Fatalf("View = %+v, %v", v, err)
	}
	s := v.Slots[0]
	if !s.NotServed || len(s.Courses) != 1 || s.Courses[0].Unserved != "not_served" || s.Courses[0].Meal != nil || s.Courses[0].Unfilled != nil {
		t.Errorf("slot = %+v, want Not served with the Course unserved \"not_served\" and no meal or reason", s)
	}
	if couldnt, _ := e.r.CouldntPlan(ctx); len(couldnt) != 0 {
		t.Errorf("Couldn't plan lists %d entries, want none", len(couldnt))
	}
}

func TestNotServedRemovesAPinnedMealAndServingAgainPlansAfresh(t *testing.T) {
	e := newEnv(t)
	e.simpleOnly()
	e.mustPlan()
	pinned, err := e.r.SetMeal(ctx, e.key(10), e.rec["curry"], nil)
	if err != nil || !pinned.Pinned {
		t.Fatalf("SetMeal = %+v, %v", pinned, err)
	}
	e.src.setDate(e.slotOn(10), tue, runner.SlotDateDef{NotServed: true})
	if _, err := e.r.Plan(ctx, plan.ReasonSlotDateChanged); err != nil {
		t.Fatal(err)
	}
	if _, err := e.st.Meal(ctx, e.key(10)); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("the Pinned meal survived Not served (%v)", err)
	}
	e.src.setDate(e.slotOn(10), tue, runner.SlotDateDef{})
	if _, err := e.r.Plan(ctx, plan.ReasonSlotDateChanged); err != nil {
		t.Fatal(err)
	}
	if m := e.meal(10); m.Pinned || m.ID == pinned.ID {
		t.Errorf("after serving again: %+v; want a fresh, unpinned Planned Meal (the removed ones are planned afresh, not restored)", m)
	}
}

func TestNotServedDoesNotApplyOnceACourseIsCooked(t *testing.T) {
	e := newEnv(t)
	e.simpleOnly()
	e.mustPlan()
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	e.src.setDate(e.slotOn(9), "2026-11-09", runner.SlotDateDef{NotServed: true})
	if _, err := e.r.Plan(ctx, plan.ReasonSlotDateChanged); err != nil {
		t.Fatal(err)
	}
	if m := e.meal(9); m.State != plan.StateCooked {
		t.Errorf("Monday = %+v, want the Cooked meal kept as history (U2)", m)
	}
}

func TestTheDatesTimeIsInTheViewAndTheInstant(t *testing.T) {
	e := newEnv(t)
	e.src.setDate(e.slotOn(10), tue, runner.SlotDateDef{Time: "06:00"})
	v, err := e.r.View(ctx, tue, tue)
	if err != nil || len(v.Slots) != 1 {
		t.Fatalf("View = %+v, %v", v, err)
	}
	s := v.Slots[0]
	if s.Time != "06:00" || s.UsualTime != "19:00" || !s.At.Equal(time.Date(2026, 11, 10, 6, 0, 0, 0, time.UTC)) {
		t.Errorf("slot = Time %q, UsualTime %q, At %v; want 06:00, usually 19:00, at 06:00", s.Time, s.UsualTime, s.At)
	}
	v, _ = e.r.View(ctx, wed, wed)
	if s := v.Slots[0]; s.Time != "19:00" || s.UsualTime != "19:00" {
		t.Errorf("Wednesday = %q / %q, want 19:00 / 19:00", s.Time, s.UsualTime)
	}
}

func TestAMealIsToConfirmTwoHoursAfterTheDatesTime(t *testing.T) {
	e := newEnv(t)
	e.simpleOnly()
	if _, err := e.r.SetMeal(ctx, e.key(9), e.rec["curry"], nil); err != nil {
		t.Fatal(err)
	}
	toConfirm := func() int {
		list, err := e.r.ToConfirm(ctx)
		if err != nil {
			t.Fatal(err)
		}
		return len(list)
	}
	e.clk.Set(time.Date(2026, 11, 9, 21, 30, 0, 0, time.UTC))
	if toConfirm() != 1 {
		t.Fatal("baseline: 21:30 is more than 2 h after the usual 19:00")
	}
	e.src.setDate(e.slotOn(9), "2026-11-09", runner.SlotDateDef{Time: "21:00"})
	if toConfirm() != 0 {
		t.Error("the dinner moved to 21:00 is not to confirm before 23:00")
	}
	e.clk.Set(time.Date(2026, 11, 9, 23, 30, 0, 0, time.UTC))
	if toConfirm() != 1 {
		t.Error("23:30 is more than 2 h after the date's 21:00")
	}
}

func TestBatchesFollowPortionsWhenAMemberJoinsAKeptMeal(t *testing.T) {
	e := newEnv(t)
	e.simpleOnly()
	e.mustPlan()
	// Put a Recipe the planner did not pick on Tuesday: if the meal is replanned the planner picks its own again.
	planned := e.meal(10)
	other := e.rec["stew"]
	if planned.RecipeID == other {
		other = e.rec["pasta"]
	}
	if _, err := e.st.SaveMeal(ctx, plan.Meal{Key: planned.Key, RecipeID: other, Batches: 1, Portions: 2, State: plan.StatePlanned}); err != nil {
		t.Fatal(err)
	}
	e.src.setAttendance(e.slotOn(10), tue, []plan.Attendee{{MemberID: 1, Factor: 1}, {MemberID: 2, Factor: 1}, {MemberID: 3, Factor: 1}})
	if _, err := e.r.Plan(ctx, plan.ReasonAttendanceChanged); err != nil {
		t.Fatal(err)
	}
	got := e.meal(10)
	if got.RecipeID != other || got.Batches != 2 || got.Portions != 3 {
		t.Errorf("Tuesday = %+v; want the same Recipe %d with 2 Batches for 3 portions (kept and raised, not replanned)", got, other)
	}
}

func TestGuestsRaiseTheBatchesOfAPinnedMealAndItStaysPinned(t *testing.T) {
	e := newEnv(t)
	e.simpleOnly()
	pinned, err := e.r.SetMeal(ctx, e.key(11), e.rec["curry"], nil)
	if err != nil || pinned.Batches != 1 {
		t.Fatalf("SetMeal = %+v, %v", pinned, err)
	}
	e.src.setDate(e.slotOn(11), wed, runner.SlotDateDef{Guests: 2})
	if _, err := e.r.Plan(ctx, plan.ReasonSlotDateChanged); err != nil {
		t.Fatal(err)
	}
	got := e.meal(11)
	if got.ID != pinned.ID || !got.Pinned || got.RecipeID != e.rec["curry"] || got.Batches != 2 || got.Portions != 4 {
		t.Errorf("Wednesday = %+v, want the Pinned curry with 2 Batches for 4 portions", got)
	}
}

func TestFewerPortionsNeverLowerBatches(t *testing.T) {
	e := newEnv(t)
	e.simpleOnly()
	e.src.setDate(e.slotOn(10), tue, runner.SlotDateDef{Guests: 2})
	e.mustPlan()
	if m := e.meal(10); m.Batches != 2 {
		t.Fatalf("setup: Tuesday has %d Batches, want 2", int(m.Batches))
	}
	e.src.setDate(e.slotOn(10), tue, runner.SlotDateDef{})
	if _, err := e.r.Plan(ctx, plan.ReasonSlotDateChanged); err != nil {
		t.Fatal(err)
	}
	if m := e.meal(10); m.Batches != 2 || m.Portions != 2 {
		t.Errorf("Tuesday = %+v, want 2 Batches kept (the extra is Leftover) and the Portions it now needs", m)
	}
}

func TestACourseEveryMemberOptsOutOfIsServedForTheGuests(t *testing.T) {
	c := newCourseEnv(t)
	c.recipe("roast", false, c.main)
	c.recipe("tiramisu", false, c.dessert)
	c.serve(cspec{course: c.main}, c.eating(c.dessert)) // nobody among the Members eats the dessert
	c.oneDay()
	c.src.setDate(c.slotIDs[1], "2026-11-09", runner.SlotDateDef{Guests: 2})
	c.mustPlan()
	d := c.mustMeal(9, c.dessert)
	if d.RecipeID != c.rec["tiramisu"] || d.Portions != 2 || d.Batches != 1 {
		t.Errorf("dessert = %+v, want the tiramisu for the 2 Guests (2 portions, 1 Batch)", d)
	}
	if m := c.mustMeal(9, c.main); m.Portions != 4 || m.Batches != 2 {
		t.Errorf("main = %+v, want 4 portions (2 Members + 2 Guests)", m)
	}
	v, _ := c.r.View(ctx, "2026-11-09", "2026-11-09")
	for _, cv := range v.Slots[0].Courses {
		if cv.CourseID == c.dessert && (cv.Unserved != "" || cv.Portions != 2 || cv.Meal == nil) {
			t.Errorf("dessert row = %+v, want served, 2 portions, with its meal", cv)
		}
	}
	if v.Slots[0].Guests != 2 || v.Slots[0].Portions != 4 {
		t.Errorf("slot Guests %d, Portions %v; want 2 Guests and 4 portions", v.Slots[0].Guests, v.Slots[0].Portions)
	}
}

func TestACourseNobodyEatsWithoutGuestsStaysUnserved(t *testing.T) {
	c := newCourseEnv(t)
	c.recipe("roast", false, c.main)
	c.recipe("tiramisu", false, c.dessert)
	c.serve(cspec{course: c.main}, c.eating(c.dessert))
	c.oneDay()
	c.mustPlan()
	if _, ok := c.mealIn(9, c.dessert); ok {
		t.Error("the dessert nobody eats was planned")
	}
	v, _ := c.r.View(ctx, "2026-11-09", "2026-11-09")
	for _, cv := range v.Slots[0].Courses {
		if cv.CourseID == c.dessert && cv.Unserved != "no_course_attendance" {
			t.Errorf("dessert row Unserved = %q, want no_course_attendance (unchanged without Guests)", cv.Unserved)
		}
	}
}

// ---- the real adapter ----

func TestDBSourcesSlotDateDefaultsToTheUsualTimeServedNoGuests(t *testing.T) {
	h := newRealHousehold(t)
	got, err := h.src.SlotDate(ctx, h.slot, "2026-11-09")
	want := runner.SlotDateDef{Time: "19:00", UsualTime: "19:00"}
	if err != nil || got != want {
		t.Errorf("SlotDate = %+v, %v; want %+v", got, err, want)
	}
}

func TestDBSourcesSlotDateReadsTheDatesTimeNotServedAndGuests(t *testing.T) {
	h := newRealHousehold(t)
	if err := h.hh.SaveSlotDate(ctx, household.SlotDate{SlotID: h.slot, Date: "2026-11-09", NotServed: true, Time: "20:15", Guests: 2}); err != nil {
		t.Fatal(err)
	}
	got, err := h.src.SlotDate(ctx, h.slot, "2026-11-09")
	want := runner.SlotDateDef{Time: "20:15", UsualTime: "19:00", NotServed: true, Guests: 2}
	if err != nil || got != want {
		t.Errorf("SlotDate = %+v, %v; want %+v", got, err, want)
	}
	if other, _ := h.src.SlotDate(ctx, h.slot, "2026-11-16"); other != (runner.SlotDateDef{Time: "19:00", UsualTime: "19:00"}) {
		t.Errorf("next Monday = %+v, want untouched", other)
	}
}

func TestDBSourcesAnEmptiedDateIsNotServedUnlessGuestsEat(t *testing.T) {
	h := newRealHousehold(t)
	if err := h.hh.SetDateAttendance(ctx, h.slot, "2026-11-09", []household.Attendee{}); err != nil {
		t.Fatal(err)
	}
	if got, _ := h.src.SlotDate(ctx, h.slot, "2026-11-09"); !got.NotServed {
		t.Errorf("an override with no Member and no Guest = %+v, want Not served (U1)", got)
	}
	if err := h.hh.SaveSlotDate(ctx, household.SlotDate{SlotID: h.slot, Date: "2026-11-09", Guests: 2}); err != nil {
		t.Fatal(err)
	}
	if got, _ := h.src.SlotDate(ctx, h.slot, "2026-11-09"); got.NotServed || got.Guests != 2 {
		t.Errorf("an override with no Member but 2 Guests = %+v, want served (U3)", got)
	}
}

func TestDBSourcesAnEmptyUsualAttendanceIsNeverNotServed(t *testing.T) {
	h := newRealHousehold(t)
	if _, err := h.hh.UpdateSlot(ctx, h.slot, household.MealSlotInput{Weekday: 1, Name: "Dinner", Time: "19:00", Attendance: []household.Attendee{}}); err != nil {
		t.Fatal(err)
	}
	if got, _ := h.src.SlotDate(ctx, h.slot, "2026-11-09"); got.NotServed {
		t.Errorf("SlotDate = %+v; a slot nobody usually attends is Couldn't plan (Nobody attends), not Not served", got)
	}
}

func TestDBSourcesAttendanceStaysTheMembersOnly(t *testing.T) {
	h := newRealHousehold(t)
	if err := h.hh.SaveSlotDate(ctx, household.SlotDate{SlotID: h.slot, Date: "2026-11-09", Guests: 4}); err != nil {
		t.Fatal(err)
	}
	att, err := h.src.Attendance(ctx, h.slot, "2026-11-09")
	if err != nil || len(att) != 2 {
		t.Errorf("Attendance = %+v, %v; want the 2 Members: Guests are a number, not an Attendee", att, err)
	}
}
