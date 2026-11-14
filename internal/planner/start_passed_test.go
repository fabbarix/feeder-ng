package planner

import "testing"

// A2 ruling 2 (B9-58): a fresh Recipe whose start falls on an earlier day than the meal and before Now can no longer be
// started in time: it is not a candidate, and it counts in TooEarly. A kept meal is not dropped for that (its cooking may
// have begun). A start on the meal's own day is not checked against Now. Now is Monday 08:00.

func TestAFreshRecipeWhoseStartTheDayBeforeIsAlreadyPastIsNotACandidate(t *testing.T) {
	tests := []struct {
		name    string
		minutes int
		want    bool
	}{
		{"Monday 07:30 (25 h before Tuesday 08:30) is past", 25 * 60, false},
		{"Monday 08:00, exactly Now, can still be started", 24*60 + 30, true},
		{"Monday 09:30 is still ahead", 23 * 60, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := pickedFor(t, tue(8, 30), tt.minutes, "06:30", "22:00"); got != tt.want {
				t.Errorf("%d min: Recipe 1 allowed = %v, want %v", tt.minutes, got, tt.want)
			}
		})
	}
}

func TestACellLeftEmptyBecauseEveryStartIsPastCountsTooEarly(t *testing.T) {
	in := withBoth(baseInput([]Slot{tue(8, 30)}, rcp(1, 2, total(25*60)), rcp(2, 2, total(26*60))), "06:30", "22:00")
	u := unfilledAt(t, mustPlan(t, in), tueKey())
	if want := (Eliminations{Considered: 2, TooEarly: 2}); u.Reason != UnfilledNoCandidates || u.Eliminated != want {
		t.Errorf("unfilled = %q %+v, want no_candidates %+v", u.Reason, u.Eliminated, want)
	}
}

func TestAKeptMealWhoseStartTheDayBeforeIsPastStays(t *testing.T) {
	slot := withExisting(tue(8, 30), plannedMeal(1)) // starts Monday 07:30, before Now, inside the start window
	in := withBoth(baseInput([]Slot{slot}, rcp(1, 2, total(25*60)), rcp(2, 2, total(20))), "06:30", "22:00")
	if r := mustPlan(t, in); !isKept(r, tueKey()) {
		t.Errorf("Kept = %v, want the meal kept (its cooking may have begun)", r.Kept)
	}
}

func TestASameDayStartIsNotCheckedAgainstNow(t *testing.T) {
	// Monday 09:00 lunch, 2 h: starts Monday 07:00, before Now but on the meal's own day.
	s := slotAt(0, breakfastSlot, 9, 0, nil)
	if !pickedFor(t, s, 120, "06:30", "22:00") {
		t.Error("a same-day start before Now: refused, want allowed (as before A2)")
	}
	if !pickedFor(t, s, 120, "06:30", "") {
		t.Error("Latest start Off: a same-day start before Now: refused, want allowed")
	}
}
