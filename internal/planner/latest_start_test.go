package planner

import (
	"testing"
	"time"
)

// A2 (B9-58): the Household's Latest start. A fresh Recipe is allowed when its start (slot time less TotalMinutes, real
// elapsed minutes) has a time of day from the Earliest start to the Latest start, both ends allowed, on whatever day
// the start falls. Latest start Off keeps the PC-14 rule as built (the start is on the meal's date, at or after the
// Earliest start). Earliest start Off: nothing is too early. TotalMinutes 0 is never too early.
// Cells are on Friday (day 4), so even a 35 h start is after baseInput's now (Monday 08:00).

func fri(h, m int) Slot { return slotAt(4, breakfastSlot, h, m, nil) }

func friKey() SlotKey { return SlotKey{Date: day(4), MealSlotID: breakfastSlot} }

func withLatest(in Input, hhmm string) Input { in.LatestStart = hhmm; return in }

func withBoth(in Input, earliest, latest string) Input {
	in.EarliestStart, in.LatestStart = earliest, latest
	return in
}

// pickedFor plans one cell of the slot with Recipe 1 (of the given length) against a 0 minute Recipe 2 and says
// whether Recipe 1 was allowed.
func pickedFor(t *testing.T, s Slot, minutes int, earliest, latest string) bool {
	t.Helper()
	in := withBoth(baseInput([]Slot{s}, rcp(1, 2, total(minutes)), rcp(2, 2)), earliest, latest)
	return placementAt(t, mustPlan(t, in), SlotKey{Date: s.Key.Date, MealSlotID: s.Key.MealSlotID}).RecipeID == 1
}

func TestAStartTheDayBeforeIsAllowedBetweenTheEarliestAndTheLatestStart(t *testing.T) {
	// Friday 08:30 breakfast, Earliest start 06:30, Latest start 22:00.
	tests := []struct {
		name    string
		minutes int
		want    bool
	}{
		{"starting exactly at the Earliest start (06:30 the same day) is allowed", 120, true},
		{"a minute before the Earliest start (06:29) is not", 121, false},
		{"Thursday 22:01, a minute after the Latest start, is not", 629, false},
		{"starting exactly at the Latest start (Thursday 22:00) is allowed", 630, true},
		{"Thursday 21:59 is allowed", 631, true},
		{"Thursday 21:30 is allowed", 660, true},
		{"Thursday 08:30, exactly 24 h before, is allowed", 24 * 60, true},
		{"Thursday 07:30 (a Recipe over 24 h) is allowed", 25 * 60, true},
		{"Thursday 06:30 exactly (26 h) is allowed", 26 * 60, true},
		{"Thursday 06:29 is not", 26*60 + 1, false},
		{"Thursday 02:30 (30 h) is not", 30 * 60, false},
		{"Wednesday 21:30 (35 h) is allowed", 35 * 60, true},
		{"a Recipe of unknown length (0 minutes) is never too early", 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := pickedFor(t, fri(8, 30), tt.minutes, "06:30", "22:00"); got != tt.want {
				t.Errorf("%d min: Recipe 1 allowed = %v, want %v", tt.minutes, got, tt.want)
			}
		})
	}
}

func TestLatestStartOffKeepsTheRuleAsFirstBuilt(t *testing.T) {
	// The start must be on the day of the meal, at or after the Earliest start.
	for minutes, want := range map[int]bool{120: true, 121: false, 660: false, 24 * 60: false, 0: true} {
		if got := pickedFor(t, fri(8, 30), minutes, "06:30", ""); got != want {
			t.Errorf("Latest start Off, %d min: allowed = %v, want %v", minutes, got, want)
		}
	}
	// A same-day start late in the evening is fine: there is no Latest start.
	if !pickedFor(t, fri(23, 30), 30, "06:30", "") {
		t.Error("Latest start Off: a 23:00 start for a 23:30 meal is allowed")
	}
}

func TestEarliestStartOffMeansNothingIsTooEarlyWhateverTheLatestStartSays(t *testing.T) {
	for _, minutes := range []int{121, 629, 30 * 60, 35 * 60} {
		if !pickedFor(t, fri(8, 30), minutes, "", "22:00") {
			t.Errorf("Earliest start Off, Latest start 22:00, %d min: refused, want allowed", minutes)
		}
	}
	for _, minutes := range []int{121, 629, 30 * 60} {
		if !pickedFor(t, fri(8, 30), minutes, "", "") {
			t.Errorf("both Off, %d min: refused, want allowed", minutes)
		}
	}
}

func TestAStartAfterTheLatestStartOnTheDayOfTheMealIsRefusedToo(t *testing.T) {
	// A 23:30 supper that takes 30 minutes starts at 23:00: after the Latest start.
	if pickedFor(t, fri(23, 30), 30, "06:30", "22:00") {
		t.Error("a 23:00 start is after the Latest start 22:00: refused")
	}
	if !pickedFor(t, fri(23, 30), 90, "06:30", "22:00") {
		t.Error("a 22:00 start is exactly the Latest start: allowed")
	}
	if !pickedFor(t, fri(23, 30), 30, "06:30", "23:00") {
		t.Error("a 23:00 start with Latest start 23:00: allowed")
	}
	if pickedFor(t, fri(23, 30), 30, "06:30", "22:59") {
		t.Error("a 23:00 start with Latest start 22:59: refused")
	}
	// Unknown length: never too early, even in the middle of the night.
	if !pickedFor(t, fri(23, 30), 0, "06:30", "22:00") || !pickedFor(t, fri(5, 0), 0, "06:30", "22:00") {
		t.Error("TotalMinutes 0 is never too early")
	}
}

func TestADatesOwnSlotTimeDecidesTheStart(t *testing.T) {
	// The planner is handed each cell's instant (the date's own time when it has one): Friday 18:00 instead of the usual
	// 19:30 dinner, 20 h long, starts Thursday 22:00 (allowed); the usual 19:30 would start Thursday 23:30 (refused).
	own := slotAt(4, dinnerSlot, 18, 0, nil)
	usual := dinner(4)
	if !pickedFor(t, own, 20*60, "06:30", "22:00") {
		t.Error("the date's own 18:00 starts Thursday 22:00: allowed")
	}
	if pickedFor(t, usual, 20*60, "06:30", "22:00") {
		t.Error("the usual 19:30 starts Thursday 23:30: refused")
	}
}

// DST: TotalMinutes are real elapsed minutes, and the time of day of the start is read in the Household's zone.
func TestTheStartIsRealElapsedTimeAcrossTheEndOfDaylightSavingTime(t *testing.T) {
	rome, err := time.LoadLocation("Europe/Rome")
	if err != nil {
		t.Fatal(err)
	}
	// 2026-10-25 07:00 CET (06:00Z) less 10 h = 20:00Z = Saturday 22:00 CEST. Wall-clock subtraction would say 21:00.
	slot := Slot{Key: SlotKey{Date: "2026-10-25", MealSlotID: breakfastSlot}, At: time.Date(2026, 10, 25, 7, 0, 0, 0, rome), Attendance: both()}
	for latest, want := range map[string]bool{"22:00": true, "21:59": false, "21:30": false} {
		in := withBoth(baseInput([]Slot{slot}, rcp(1, 2, total(600)), rcp(2, 2)), "06:30", latest)
		in.Now = time.Date(2026, 10, 20, 8, 0, 0, 0, rome)
		got := placementAt(t, mustPlan(t, in), SlotKey{Date: "2026-10-25", MealSlotID: breakfastSlot}).RecipeID == 1
		if got != want {
			t.Errorf("Latest start %s: allowed = %v, want %v (the start is 22:00 CEST)", latest, got, want)
		}
	}
}

func TestTheStartIsRealElapsedTimeAcrossTheStartOfDaylightSavingTime(t *testing.T) {
	rome, err := time.LoadLocation("Europe/Rome")
	if err != nil {
		t.Fatal(err)
	}
	// 2026-03-29 08:00 CEST (06:00Z) less 8 h = 22:00Z the day before = Saturday 23:00 CET. Wall-clock subtraction
	// would say 00:00 on the meal's day (before the Earliest start).
	slot := Slot{Key: SlotKey{Date: "2026-03-29", MealSlotID: breakfastSlot}, At: time.Date(2026, 3, 29, 8, 0, 0, 0, rome), Attendance: both()}
	for latest, want := range map[string]bool{"23:30": true, "23:00": true, "22:30": false} {
		in := withBoth(baseInput([]Slot{slot}, rcp(1, 2, total(480)), rcp(2, 2)), "06:30", latest)
		in.Now = time.Date(2026, 3, 20, 8, 0, 0, 0, rome)
		got := placementAt(t, mustPlan(t, in), SlotKey{Date: "2026-03-29", MealSlotID: breakfastSlot}).RecipeID == 1
		if got != want {
			t.Errorf("Latest start %s: allowed = %v, want %v (the start is 23:00 CET)", latest, got, want)
		}
	}
	// And a start on the meal's own day after the change: 14:00 CEST less 6 h = 08:00 CEST, allowed with Latest start Off.
	later := Slot{Key: SlotKey{Date: "2026-03-29", MealSlotID: dinnerSlot}, At: time.Date(2026, 3, 29, 14, 0, 0, 0, rome), Attendance: both()}
	in := withBoth(baseInput([]Slot{later}, rcp(1, 2, total(360)), rcp(2, 2)), "06:30", "")
	in.Now = time.Date(2026, 3, 20, 8, 0, 0, 0, rome)
	if got := placementAt(t, mustPlan(t, in), SlotKey{Date: "2026-03-29", MealSlotID: dinnerSlot}).RecipeID; got != 1 {
		t.Errorf("a same-day 08:00 start on the DST day: Recipe %d, want 1", got)
	}
}

func TestACellLeftEmptyByTheLatestStartCountsTooEarly(t *testing.T) {
	// Both Recipes would start in the hours between Latest start and Earliest start (Thursday 22:30 and Friday 03:30).
	in := withBoth(baseInput([]Slot{fri(8, 30)}, rcp(1, 2, total(600)), rcp(2, 2, total(300))), "06:30", "22:00")
	u := unfilledAt(t, mustPlan(t, in), friKey())
	if u.Reason != UnfilledNoCandidates {
		t.Errorf("Reason = %q, want no_candidates", u.Reason)
	}
	if want := (Eliminations{Considered: 2, TooEarly: 2}); u.Eliminated != want {
		t.Errorf("eliminations = %+v, want %+v (the existing counter, no new one)", u.Eliminated, want)
	}
}

func TestAnOvernightStartKeepsTheAdvanceStepRule(t *testing.T) {
	// An Advance Step is not part of TotalMinutes: a 60 min Recipe with a 12 h Advance Step on a Friday 08:30 meal
	// starts cooking at 07:30 (allowed), and its Advance Step is a separate matter.
	in := withBoth(baseInput([]Slot{fri(8, 30)}, rcp(1, 2, total(60), lead(12*time.Hour)), rcp(2, 2)), "06:30", "22:00")
	if got := placementAt(t, mustPlan(t, in), friKey()).RecipeID; got != 1 {
		t.Errorf("recipe = %d, want 1", got)
	}
}

func TestEarlyStartsFlagsAHeldMealWhoseStartIsInTheHoursBetweenLatestAndEarliestStart(t *testing.T) {
	long := rcp(1, 2, total(629))  // Thursday 22:01
	exact := rcp(2, 2, total(630)) // Thursday 22:00, exactly the Latest start
	okNight := rcp(3, 2, total(660))
	pinned := func(id RecipeID, n int) Slot { return withExisting(slotAt(4, int64(10+n), 8, 30, nil), pinnedMeal(id)) }
	in := withBoth(baseInput([]Slot{pinned(1, 1), pinned(2, 2), pinned(3, 3)}, long, exact, okNight), "06:30", "22:00")

	got := EarlyStarts(in)
	if len(got) != 1 || got[0].Key != (SlotKey{Date: day(4), MealSlotID: 11}) {
		t.Fatalf("EarlyStarts = %+v, want only the Pinned meal that starts Thursday 22:01", got)
	}
	if want := baseDay.AddDate(0, 0, 3).Add(22*time.Hour + time.Minute); !got[0].StartAt.Equal(want) {
		t.Errorf("StartAt = %s, want %s", got[0].StartAt, want)
	}
	// Latest start Off: the start must be on the day of the meal, so all three (Thursday starts) are flagged.
	if got := EarlyStarts(withLatest(in, "")); len(got) != 3 {
		t.Errorf("Latest start Off: EarlyStarts = %+v, want all 3 (they start the day before)", got)
	}
	// Earliest start Off: nothing is early.
	if got := EarlyStarts(withEarliest(in, "")); len(got) != 0 {
		t.Errorf("Earliest start Off: EarlyStarts = %+v, want none", got)
	}
}

func TestAHeldOrPinnedMealInTheHoursBetweenLatestAndEarliestStartIsNeverMoved(t *testing.T) {
	slot := withExisting(fri(8, 30), heldMeal(1)) // starts Thursday 22:01
	in := withBoth(baseInput([]Slot{slot}, rcp(1, 2, total(629)), rcp(2, 2, total(20))), "06:30", "22:00")
	wantHeld(t, mustPlan(t, in), friKey())
	if r := mustPlan(t, asPinned(in)); len(r.Placements) != 0 || len(r.Unfilled) != 0 {
		t.Errorf("Pinned: replanned or removed: %+v %+v", r.Placements, r.Unfilled)
	}
	wantReplaced(t, mustPlan(t, asUnheld(in)), friKey())
}

func TestAKeptUnpinnedMealIsReplannedWhenItsStartIsNowInTheHoursBetweenLatestAndEarliestStart(t *testing.T) {
	slot := withExisting(fri(8, 30), plannedMeal(1)) // starts Thursday 22:01 with Latest start 22:00
	in := withBoth(baseInput([]Slot{slot}, rcp(1, 2, total(629)), rcp(2, 2, total(20))), "06:30", "22:00")
	r := mustPlan(t, in)
	if isKept(r, friKey()) {
		t.Fatalf("Kept = %v, the meal that now starts after the Latest start must be replaced", r.Kept)
	}
	if p := placementAt(t, r, friKey()); p.RecipeID != 2 {
		t.Errorf("replacement = %+v, want Recipe 2", p)
	}
	// Latest start moved to 23:00 (the meal's start became allowed): it stays.
	if r := mustPlan(t, withLatest(in, "23:00")); !isKept(r, friKey()) {
		t.Errorf("Latest start 23:00: Kept = %v, want the meal kept", r.Kept)
	}
	// Latest start Off while the start is Thursday: before the Earliest start on the meal's day, so still replanned.
	if r := mustPlan(t, withLatest(in, "")); isKept(r, friKey()) {
		t.Errorf("Latest start Off: a Thursday start is replanned, Kept = %v", r.Kept)
	}
}

func TestAKeptUnpinnedOvernightMealThatIsStillAllowedStays(t *testing.T) {
	slot := withExisting(fri(8, 30), plannedMeal(1)) // starts Thursday 21:30
	in := withBoth(baseInput([]Slot{slot}, rcp(1, 2, total(660)), rcp(2, 2, total(20))), "06:30", "22:00")
	if r := mustPlan(t, in); !isKept(r, friKey()) {
		t.Errorf("Kept = %v, want the overnight meal kept", r.Kept)
	}
	// A kept meal that became allowed: it was refused with Latest start Off, and stays now.
	if r := mustPlan(t, withLatest(in, "")); isKept(r, friKey()) {
		t.Errorf("Latest start Off: the Thursday 21:30 start is replanned, Kept = %v", r.Kept)
	}
}
