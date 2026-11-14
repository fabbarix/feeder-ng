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
