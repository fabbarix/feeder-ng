package away_test

import (
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/away"
	"github.com/fabbarix/feeder-ng/internal/plan"
)

// B9-24 review: an Away applies from the write that set its first day (Since), and a change never alters a Meal Slot
// that has started.

func TestAMealSlotThatStartedInTheMinuteOfTheWriteButBeforeItIsNotCovered(t *testing.T) {
	// Written at 08:00:30 today: Breakfast (08:00) started 30 seconds before, as the planner sees it (slot instant before
	// now), so the Away leaves it as it was; Lunch is covered.
	a := away.Away{MemberID: 1, From: today, Since: at(today, "08:00").Add(30 * time.Second)}
	if away.Covers(a, today, slotOn(t, 1, "08:00"), slots()) {
		t.Error("Breakfast at 08:00 is covered by an Away written at 08:00:30")
	}
	if !away.Covers(a, today, slotOn(t, 1, "12:30"), slots()) {
		t.Error("Lunch at 12:30 is not covered by an Away written at 08:00:30")
	}
	// Written at 08:00:00 exactly: Breakfast has not started yet (the planner still plans it), so it is covered.
	b := away.Away{MemberID: 1, From: today, Since: at(today, "08:00")}
	if !away.Covers(b, today, slotOn(t, 1, "08:00"), slots()) {
		t.Error("Breakfast at 08:00 is not covered by an Away written at 08:00:00")
	}
}

func TestSinceIsComparedAsTheInstantThePlannerGivesTheMealSlotOnTheNightTheClocksGoBack(t *testing.T) {
	london, err := time.LoadLocation("Europe/London")
	if err != nil {
		t.Skip("no zone data:", err)
	}
	// Sunday 2026-10-25: at 02:00 BST the clocks go back to 01:00 GMT, so 01:00–01:59 happens twice. Whatever instant the
	// planner gives a Meal Slot at 01:45 (plan.SlotInstant), the Away covers it exactly when the planner has not started
	// it at the write, for writes at every quarter hour of that night.
	sun := []away.Slot{{ID: 71, Weekday: 7, Time: "01:45"}}
	slotAt, err := plan.SlotInstant("2026-10-25", "01:45", london)
	if err != nil {
		t.Fatal(err)
	}
	for since := time.Date(2026, 10, 24, 23, 0, 0, 0, time.UTC); since.Before(time.Date(2026, 10, 25, 3, 0, 0, 0, time.UTC)); since = since.Add(10 * time.Minute) {
		a := away.Away{MemberID: 1, From: "2026-10-25", Since: since.In(london)}
		if got, want := away.Covers(a, "2026-10-25", sun[0], sun), !slotAt.Before(since); got != want {
			t.Errorf("written at %s (%s): Covers = %v, want %v (the planner's slot is %s)", since.Format(time.RFC3339),
				since.In(london).Format("15:04 MST"), got, want, slotAt.UTC().Format(time.RFC3339))
		}
	}
}

func TestAChangeCannotEndARunningAwayBeforeAMealSlotThatHasStarted(t *testing.T) {
	// Running since Sunday; now is Tuesday 13:00 (Breakfast and Lunch of Tuesday have started).
	stored := away.Away{ID: 3, MemberID: 1, From: "2026-11-15", Through: thu}
	now := at(tue, "13:00")
	cases := []struct {
		name        string
		through     string
		throughSlot int64
		wantField   string
	}{
		{"last day yesterday", "2026-11-16", 0, "through"},
		{"last Meal Slot today's Breakfast (Lunch has started)", tue, slotOn(t, 2, "08:00").ID, "through"},
	}
	for _, c := range cases {
		edited := stored
		edited.Through, edited.ThroughSlot = c.through, c.throughSlot
		err := away.CheckStart(edited, stored, now, slots())
		e, ok := err.(*away.Error)
		if !ok || e.Reason != "slot_started" || e.Field != c.wantField {
			t.Errorf("%s: CheckStart = %v, want %s slot_started", c.name, err, c.wantField)
		}
	}
	for _, c := range []struct {
		name        string
		through     string
		throughSlot int64
	}{
		{"last Meal Slot today's Lunch (it has started and stays covered)", tue, slotOn(t, 2, "12:30").ID},
		{"last day today (Dinner is still to come)", tue, 0},
		{"a later last day", fri, 0},
		{"no last day yet", "", 0},
	} {
		edited := stored
		edited.Through, edited.ThroughSlot = c.through, c.throughSlot
		if err := away.CheckStart(edited, stored, now, slots()); err != nil {
			t.Errorf("%s: CheckStart = %v, want nil", c.name, err)
		}
	}
}

func TestAChangeCannotStretchAnAwayThatIsOverOverMealSlotsThatHaveStarted(t *testing.T) {
	// Over since Monday 16 Dinner; now is Tuesday 13:00. Making it last to Thursday would take the Member out of Tuesday's
	// Breakfast and Lunch, which have started.
	stored := away.Away{ID: 3, MemberID: 1, From: "2026-11-15", Through: "2026-11-16", Since: at("2026-11-14", "10:00")}
	edited := stored
	edited.Through = thu
	if e, ok := away.CheckStart(edited, stored, at(tue, "13:00"), slots()).(*away.Error); !ok || e.Reason != "slot_started" {
		t.Errorf("CheckStart = %v, want slot_started", e)
	}
	// Before Tuesday's Breakfast, nothing between the two last days has started.
	if err := away.CheckStart(edited, stored, at(tue, "07:00"), slots()); err != nil {
		t.Errorf("CheckStart at 07:00 = %v, want nil", err)
	}
}

func TestTheMessagesOfARefusedAwayReadAsFieldErrors(t *testing.T) {
	for reason, want := range map[string]string{
		"first_day_past":    "The first day cannot be in the past.",
		"last_before_first": "The last day cannot be before the first.",
		"away_started":      "This Away has started, so its first day cannot change.",
	} {
		if got := away.Message(&away.Error{Reason: reason}, "Anna"); got != want {
			t.Errorf("Message(%s) = %q, want %q", reason, got, want)
		}
	}
}

func TestSummariseDoesNotCountTheMealSlotsAChangeGivesBack(t *testing.T) {
	s := away.Summarise([]away.Meal{
		{Date: tue, MealSlotID: 23, MealSlotName: "Dinner", Time: "19:00", Before: 2, After: 1},
		{Date: wed, MealSlotID: 33, MealSlotName: "Dinner", Time: "19:00", Before: 1, After: 2, Back: true},
	})
	if s.SlotsWithout != 1 || s.MealsChanged != 2 {
		t.Errorf("SlotsWithout = %d, MealsChanged = %d, want 1 (Tue Dinner) and 2 (both change)", s.SlotsWithout, s.MealsChanged)
	}
}
