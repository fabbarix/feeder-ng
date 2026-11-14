package httpapi_test

import (
	"fmt"
	"testing"
)

// B9-24 with B9-58: an Away and the start window together. An Away changes who eats at a Meal Slot, never when its
// meal starts cooking, so a Member away leaves meal.startsAt and earlyStart as they were. World: the overnight one
// (Wednesday Supper 19:00, Anna and Sam, Earliest start 06:30, Latest start 22:00, the clock Monday 12:00).

func (w *overnightWorld) away(t *testing.T, member int64) {
	t.Helper()
	if r := w.User.Post(fmt.Sprintf("/api/members/%d/away", member), map[string]any{"from": wed, "through": wed}); r.Status != 200 && r.Status != 201 {
		t.Fatalf("POST away = %d %s", r.Status, r.Body)
	}
}

func TestAMemberAwayDoesNotChangeWhenAMealStarts(t *testing.T) {
	cases := []struct {
		name    string
		minutes int
		time    string // startsAt Tuesday
		early   string // earlyStart; "" omitted
	}{
		{"22 h: Tuesday 21:00, allowed", 22 * 60, "21:00", ""},
		{"20 h: Tuesday 23:00, after the Latest start", 20 * 60, "23:00", "23:00"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := newOvernightWorld(t, c.minutes)
			w.Meal(wed, w.supper, w.Main, w.roast, "planned", true)
			w.away(t, w.Anna)
			cell, raw := w.meal(t)
			wantStartsAt(t, cell, raw, tue, c.time)
			switch {
			case c.early == "" && cell.EarlyStart != nil:
				t.Errorf("earlyStart = %q, want it omitted", *cell.EarlyStart)
			case c.early != "" && (cell.EarlyStart == nil || *cell.EarlyStart != c.early):
				t.Errorf("earlyStart = %s, want %q", raw["earlyStart"], c.early)
			}
		})
	}
}

func TestASlotWithEveryoneAwayCarriesNoEarlyStart(t *testing.T) {
	// An unpinned meal that starts outside the window is never flagged; with everyone away the replan leaves the Course
	// Couldn't plan (no_attendance), so the slot has no meal and so no earlyStart and no startsAt.
	w := newOvernightWorld(t, 20*60)
	w.Meal(wed, w.supper, w.Main, w.roast, "planned", false)
	w.away(t, w.Anna)
	w.away(t, w.Sam)
	if cell, raw := w.meal(t); cell != nil {
		if cell.EarlyStart != nil {
			t.Errorf("earlyStart = %q, want none: everyone is away", *cell.EarlyStart)
		}
		if _, ok := raw["startsAt"]; ok {
			t.Errorf("startsAt = %s, want none: everyone is away", raw["startsAt"])
		}
	}
	if got := w.MealState(wed, w.supper, w.Main); got != "" {
		t.Errorf("state = %q, want no meal: everyone is away", got)
	}
}
