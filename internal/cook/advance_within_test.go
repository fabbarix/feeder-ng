package cook_test

import (
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/cook"
)

// TB-02 (B9-12): one marks-aware source for "Advance Steps due in the next 24 h", used by Today, the board and the
// push. now is Sunday 2026-11-08 04:31, the day of the stage-2 reproduction.

var withinNow = time.Date(2026, 11, 8, 4, 31, 0, 0, time.UTC)

func within(t *testing.T, cands ...cook.AdvanceCandidate) []cook.AdvanceDue {
	t.Helper()
	return cook.AdvanceDueWithin(cands, withinNow, 24*time.Hour)
}

func names(ds []cook.AdvanceDue) []string {
	var out []string
	for _, d := range ds {
		out = append(out, d.RecipeName)
	}
	return out
}

func TestAdvanceDueWithinTakesWhatIsDueInTheNext24Hours(t *testing.T) {
	// now+24h = Monday 04:31. Each Step belongs to Monday's 19:00 dinner; the lead sets when it is due.
	monDinner := time.Date(2026, 11, 9, 19, 0, 0, 0, time.UTC)
	got := within(t,
		cand("due Mon 04:32", monDinner, 0, 14*60+28, false), // a minute after the window: out
		cand("due Mon 04:31", monDinner, 0, 14*60+29, false), // exactly at the edge: in
		cand("due Sun 12:00", monDinner, 0, 31*60, false),    // in
		cand("due Sun 04:25", monDinner, 0, 38*60+35, false), // 6 minutes overdue, the meal is still ahead: in
	)
	if n := names(got); len(n) != 3 || n[0] != "due Sun 04:25" || n[1] != "due Sun 12:00" || n[2] != "due Mon 04:31" {
		t.Errorf("got %v, want the last three, soonest first, and not the one due a minute after the window", n)
	}
}

func TestAdvanceDueWithinLeavesDoneStepsAndServedMealsOut(t *testing.T) {
	tomorrow := time.Date(2026, 11, 9, 19, 0, 0, 0, time.UTC)
	served := time.Date(2026, 11, 8, 3, 0, 0, 0, time.UTC) // Sunday 03:00, before now
	got := within(t,
		cand("done", tomorrow, 0, 24*60, true),
		cand("served meal", served, 0, 600, false), // due long ago, but its meal is behind us
		cand("kept", tomorrow, 1, 24*60, false),
	)
	if n := names(got); len(n) != 1 || n[0] != "kept" {
		t.Errorf("got %v, want only 'kept': a Step marked done or of a meal already served is not due", n)
	}
}

func TestAdvanceDueWithinKeepsAnOverdueStepOfAMealStillAheadAndFlagsIt(t *testing.T) {
	sunDinner := time.Date(2026, 11, 8, 19, 0, 0, 0, time.UTC)
	got := within(t, cand("marinade", sunDinner, 0, 24*60, false)) // was due Saturday 19:00
	if len(got) != 1 || !got[0].Overdue || !got[0].DueAt.Equal(sunDinner.Add(-24*time.Hour)) {
		t.Errorf("got %+v, want one overdue row", got)
	}
}

func TestAdvanceDueWithinIsInNextAdvanceOrderAndNextAdvanceIsItsFirst(t *testing.T) {
	sunDinner := time.Date(2026, 11, 8, 19, 0, 0, 0, time.UTC)
	monDinner := time.Date(2026, 11, 9, 19, 0, 0, 0, time.UTC)
	cands := []cook.AdvanceCandidate{
		cand("b", monDinner, 5, 40*60, false), // due Sun 03:00: overdue
		cand("a", sunDinner, 2, 60, false),    // due Sun 18:00
		cand("c", monDinner, 1, 24*60, false), // due Sun 19:00
		cand("d", sunDinner, 0, 60, false),    // due Sun 18:00, lower Step: before "a"
	}
	got := within(t, cands...)
	if n := names(got); len(n) != 4 || n[0] != "b" || n[1] != "d" || n[2] != "a" || n[3] != "c" {
		t.Fatalf("got %v, want b (overdue), d, a (same due time: lower Step first), c", n)
	}
	if next := cook.NextAdvance(cands, withinNow); next == nil || next.RecipeName != got[0].RecipeName || next.Step != got[0].Step {
		t.Errorf("NextAdvance = %+v, want the first of the list", next)
	}
}

func TestAdvanceDueWithinOfNothingIsEmpty(t *testing.T) {
	if got := within(t); len(got) != 0 {
		t.Errorf("got %+v", got)
	}
}
