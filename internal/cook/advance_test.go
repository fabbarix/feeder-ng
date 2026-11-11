package cook_test

import (
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/cook"
)

func cand(recipe string, mealAt time.Time, step, leadMin int, done bool) cook.AdvanceCandidate {
	return cook.AdvanceCandidate{Scope: cook.MealScope(mealAt.Format("2006-01-02"), 2, 0), RecipeName: recipe, MealAt: mealAt, Step: step, Text: "prep " + recipe, LeadTimeMinutes: leadMin, Done: done}
}

func TestNextAdvancePicksTheEarliestDueNotDone(t *testing.T) {
	now := time.Date(2026, 11, 9, 9, 0, 0, 0, time.UTC)
	dinner := time.Date(2026, 11, 9, 19, 0, 0, 0, time.UTC)
	tomorrow := time.Date(2026, 11, 10, 19, 0, 0, 0, time.UTC)
	got := cook.NextAdvance([]cook.AdvanceCandidate{
		cand("stew", dinner, 0, 120, false),     // due 17:00 today
		cand("beans", tomorrow, 3, 1440, false), // due 19:00 today... 24 h before tomorrow dinner = 19:00 today
		cand("done", dinner, 1, 600, true),      // earlier but already done
	}, now)
	if got == nil || got.RecipeName != "stew" || !got.DueAt.Equal(dinner.Add(-2*time.Hour)) || got.Overdue {
		t.Fatalf("got %+v", got)
	}
}

func TestNextAdvanceOverdueFirstAndFlagged(t *testing.T) {
	now := time.Date(2026, 11, 9, 18, 0, 0, 0, time.UTC)
	dinner := time.Date(2026, 11, 9, 19, 0, 0, 0, time.UTC)
	got := cook.NextAdvance([]cook.AdvanceCandidate{
		cand("later", dinner.Add(24*time.Hour), 0, 60, false),
		cand("marinade", dinner, 0, 240, false), // was due 15:00
	}, now)
	if got == nil || got.RecipeName != "marinade" || !got.Overdue {
		t.Fatalf("got %+v", got)
	}
}

func TestNextAdvanceTieBreaksAndEmpty(t *testing.T) {
	now := time.Date(2026, 11, 9, 9, 0, 0, 0, time.UTC)
	meal := time.Date(2026, 11, 9, 19, 0, 0, 0, time.UTC)
	got := cook.NextAdvance([]cook.AdvanceCandidate{cand("b", meal, 5, 60, false), cand("a", meal, 2, 60, false)}, now)
	if got == nil || got.Step != 2 {
		t.Errorf("same due time: the lower Step index wins, got %+v", got)
	}
	if cook.NextAdvance(nil, now) != nil {
		t.Error("no candidates -> nil")
	}
	if cook.NextAdvance([]cook.AdvanceCandidate{cand("x", meal, 0, 60, true)}, now) != nil {
		t.Error("all done -> nil")
	}
}
