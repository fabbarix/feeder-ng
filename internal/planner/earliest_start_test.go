package planner

import (
	"testing"
	"time"
)

// PC-14 (B9-12, decision PC 5): the Household's Earliest start. A fresh Recipe whose cooking would have to start
// before it, on the date of its cell, is filtered like an Advance Step that is too late; a Pinned meal is never
// refused, only flagged (EarlyStarts). Advance Steps the day before are not part of the length (TotalMinutes leaves
// them out). baseInput's now is Monday 08:00; the cells below are on Tuesday so no slot is in the past.

const breakfastSlot int64 = 3

func total(minutes int) recipeOpt { return func(r *Recipe) { r.TotalMinutes = minutes } }

func tue(h, m int) Slot { return slotAt(1, breakfastSlot, h, m, nil) }

func tueKey() SlotKey { return SlotKey{Date: day(1), MealSlotID: breakfastSlot} }

func withEarliest(in Input, hhmm string) Input { in.EarliestStart = hhmm; return in }

func TestEarliestStartFiltersRecipesThatWouldStartTooEarly(t *testing.T) {
	long, short := rcp(1, 2, total(360)), rcp(2, 2, total(20)) // 6 h and 20 min; zero weights: the lowest id wins
	tests := []struct {
		name     string
		slot     Slot
		earliest string
		want     RecipeID
	}{
		{"A 6 h Recipe is not planned for an 08:30 slot with earliest start 06:30", tue(8, 30), "06:30", 2},
		{"A 6 h Recipe is planned for a 13:00 slot (starts 07:00)", tue(13, 0), "06:30", 1},
		{"Off restores today's behaviour", tue(8, 30), "", 1},
		{"a later earliest start moves the 13:00 slot too", tue(13, 0), "08:00", 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := withEarliest(baseInput([]Slot{tt.slot}, long, short), tt.earliest)
			if got := placementAt(t, mustPlan(t, in), tueKey()); got.RecipeID != tt.want {
				t.Errorf("recipe = %d, want %d", got.RecipeID, tt.want)
			}
		})
	}
}

func TestEarliestStartBoundaryIsToTheMinute(t *testing.T) {
	// slot 13:00 less 390 min = 06:30 exactly (allowed); 391 min = 06:29 (too early).
	for minutes, want := range map[int]RecipeID{390: 1, 391: 2} {
		in := withEarliest(baseInput([]Slot{tue(13, 0)}, rcp(1, 2, total(minutes)), rcp(2, 2)), "06:30")
		if got := placementAt(t, mustPlan(t, in), tueKey()); got.RecipeID != want {
			t.Errorf("%d min: recipe = %d, want %d", minutes, got.RecipeID, want)
		}
	}
}

func TestEarliestStartLeavesARecipeWithNoKnownLengthAlone(t *testing.T) {
	in := withEarliest(baseInput([]Slot{tue(7, 0)}, rcp(1, 2)), "06:30") // TotalMinutes 0
	if got := placementAt(t, mustPlan(t, in), tueKey()); got.RecipeID != 1 {
		t.Errorf("recipe = %d, want 1", got.RecipeID)
	}
}

func TestEarliestStartIgnoresAdvanceStepsTheDayBefore(t *testing.T) {
	// A 24 h Advance Step is not part of TotalMinutes: the 30 min of cooking start 08:00, after 06:30.
	in := withEarliest(baseInput([]Slot{tue(8, 30)}, rcp(1, 2, total(30), lead(24*time.Hour))), "06:30")
	if got := placementAt(t, mustPlan(t, in), tueKey()); got.RecipeID != 1 {
		t.Errorf("recipe = %d, want 1 (Advance Steps the day before are not affected)", got.RecipeID)
	}
}

func TestACellLeftEmptyByTheEarliestStartSaysSo(t *testing.T) {
	in := withEarliest(baseInput([]Slot{tue(8, 30)}, rcp(1, 2, total(360)), rcp(2, 2, total(300))), "06:30")
	u := unfilledAt(t, mustPlan(t, in), tueKey())
	if u.Reason != UnfilledNoCandidates {
		t.Errorf("Reason = %q, want no_candidates (the stored reason set does not grow)", u.Reason)
	}
	if want := (Eliminations{Considered: 2, TooEarly: 2}); u.Eliminated != want {
		t.Errorf("eliminations = %+v, want %+v", u.Eliminated, want)
	}
}

func TestTooEarlyComesAfterExclusionAndAdvanceStepInTheCount(t *testing.T) {
	// Each Recipe is counted once, by the first filter that removed it.
	in := withEarliest(baseInput([]Slot{tue(8, 30)},
		rcp(1, 2, total(360)),                               // too early only
		rcp(2, 2, total(360)),                               // excluded, and also too early
		rcp(3, 2, total(360), lead(48*time.Hour))), "06:30") // Advance Step too late, and also too early
	in = prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{2}})
	u := unfilledAt(t, mustPlan(t, in), tueKey())
	if want := (Eliminations{Considered: 3, Exclusion: 1, AdvanceStep: 1, TooEarly: 1}); u.Eliminated != want {
		t.Errorf("eliminations = %+v, want %+v", u.Eliminated, want)
	}
}

func TestAPinnedMealIsNeverRefusedByTheEarliestStart(t *testing.T) {
	slot := withExisting(tue(8, 30), pinnedMeal(1))
	in := withEarliest(baseInput([]Slot{slot}, rcp(1, 2, total(360)), rcp(2, 2, total(20))), "06:30")
	r := mustPlan(t, in)
	if len(r.Placements) != 0 || len(r.Unfilled) != 0 {
		t.Fatalf("a Pinned meal is not replanned or removed: %+v %+v", r.Placements, r.Unfilled)
	}
}

func TestEarlyStartsFlagsOnlyPinnedMealsThatStartBeforeTheEarliestStart(t *testing.T) {
	pinnedLong := withExisting(tue(8, 30), pinnedMeal(1))
	pinnedFine := withExisting(slotAt(1, lunchSlot, 13, 0, nil), pinnedMeal(1))
	planned := withExisting(slotAt(2, breakfastSlot, 8, 30, nil), plannedMeal(1))
	cooked := withExisting(slotAt(3, breakfastSlot, 8, 30, nil), cookedMeal(1))
	recipes := []Recipe{rcp(1, 2, total(360))}
	in := withEarliest(baseInput([]Slot{pinnedLong, pinnedFine, planned, cooked}, recipes...), "06:30")

	got := EarlyStarts(in)
	if len(got) != 1 || got[0].Key != tueKey() || !got[0].StartAt.Equal(baseDay.AddDate(0, 0, 1).Add(2*time.Hour+30*time.Minute)) {
		t.Fatalf("EarlyStarts = %+v, want only the Pinned 08:30 meal, starting 02:30", got)
	}
	if got := EarlyStarts(withEarliest(in, "")); len(got) != 0 {
		t.Errorf("Off: EarlyStarts = %+v, want none", got)
	}
	if got := EarlyStarts(withEarliest(in, "02:30")); len(got) != 0 {
		t.Errorf("starting exactly at the earliest start is not early: %+v", got)
	}
}

func TestAKeptUnpinnedMealThatNowStartsTooEarlyIsReplanned(t *testing.T) {
	// The upgrade note: existing Households get 06:30, so the next replan may move a long Recipe off an early slot.
	// Needs the keep check (state.go, B9-11's file): the meal is dropped for the walk to refill.
	slot := withExisting(tue(8, 30), plannedMeal(1))
	in := withEarliest(baseInput([]Slot{slot}, rcp(1, 2, total(360)), rcp(2, 2, total(20))), "06:30")
	r := mustPlan(t, in)
	if isKept(r, tueKey()) {
		t.Fatalf("Kept = %v, the too-early meal must be replaced", r.Kept)
	}
	if p := placementAt(t, r, tueKey()); p.RecipeID != 2 {
		t.Errorf("replacement = %+v, want Recipe 2", p)
	}
	// Off keeps it.
	r = mustPlan(t, withEarliest(in, ""))
	if !isKept(r, tueKey()) {
		t.Errorf("Off: Kept = %v, want the meal kept", r.Kept)
	}
}
