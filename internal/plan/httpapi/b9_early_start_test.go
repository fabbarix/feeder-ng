package httpapi_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B9-12 (PC-14, ruling: Pinned and Bought are flagged): GET /api/plan carries earlyStart "HH:MM" on a Pinned or Bought
// meal whose cooking would start before the Household's Earliest start (06:30 by default), and omits it otherwise.
// crsc2: Monday Dinner 19:00, household zone UTC. Roast chicken takes 13 h (starts 06:00), so it is too early.

func earlyStartOf(t *testing.T, w *boWorld, date string, course int64) (string, bool) {
	t.Helper()
	r := w.User.Get("/api/plan?from=" + date + "&to=" + date)
	var out struct {
		Slots []struct {
			Courses []struct {
				CourseID int64                      `json:"courseId"`
				Meal     map[string]json.RawMessage `json:"meal"`
			} `json:"courses"`
		} `json:"slots"`
	}
	r.MustJSON(t, &out)
	if r.Status != 200 || len(out.Slots) != 1 {
		t.Fatalf("GET /api/plan = %d %s", r.Status, r.Body)
	}
	for _, c := range out.Slots[0].Courses {
		if c.CourseID == course && c.Meal != nil {
			raw, ok := c.Meal["earlyStart"]
			if !ok {
				return "", false
			}
			var s string
			if err := json.Unmarshal(raw, &s); err != nil {
				t.Fatalf("earlyStart %s: %v", raw, err)
			}
			return s, true
		}
	}
	t.Fatalf("no meal in Course %d: %s", course, r.Body)
	return "", false
}

func newEarlyWorld(t *testing.T, minutes int) *boWorld {
	w := newBoWorld(t)
	w.Exec(`UPDATE recipes SET total_minutes = ? WHERE id = ?`, minutes, w.roast)
	return w
}

func TestAPinnedMealThatStartsBeforeTheEarliestStartCarriesEarlyStart(t *testing.T) {
	w := newEarlyWorld(t, 13*60)
	w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", true)
	if got, ok := earlyStartOf(t, w, crsc2.Today, w.Main); !ok || got != "06:00" {
		t.Errorf("earlyStart = %q (present %v), want \"06:00\"", got, ok)
	}
}

func TestABoughtMealThatStartsBeforeTheEarliestStartCarriesEarlyStart(t *testing.T) {
	w := newEarlyWorld(t, 13*60)
	main := w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", false)
	w.bought(main, w.chicken)
	if got, ok := earlyStartOf(t, w, crsc2.Today, w.Main); !ok || got != "06:00" {
		t.Errorf("earlyStart = %q (present %v), want \"06:00\"", got, ok)
	}
}

func TestEarlyStartIsOmittedWhenItDoesNotApply(t *testing.T) {
	cases := []struct {
		name    string
		minutes int
		set     func(w *boWorld)
	}{
		{"an unpinned meal nothing was bought for (the planner replans it instead)", 13 * 60, func(w *boWorld) {
			w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", false)
		}},
		{"a Pinned meal that starts after the Earliest start", 60, func(w *boWorld) {
			w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", true)
		}},
		{"a Pinned meal of unknown length (TotalMinutes 0)", 0, func(w *boWorld) {
			w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", true)
		}},
		{"Earliest start Off", 13 * 60, func(w *boWorld) {
			w.Exec(`UPDATE household_settings SET earliest_start = NULL`)
			w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", true)
		}},
		{"the slot has its own later time on the date (21:00, starts 08:00)", 13 * 60, func(w *boWorld) {
			w.Exec(`INSERT INTO meal_slot_dates (slot_id, date, time, updated_at) VALUES (?, ?, '21:00', '2026-11-09T10:00:00Z')`, w.Slot, crsc2.Today)
			w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", true)
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := newEarlyWorld(t, c.minutes)
			c.set(w)
			if got, ok := earlyStartOf(t, w, crsc2.Today, w.Main); ok {
				t.Errorf("earlyStart = %q, want it omitted", got)
			}
		})
	}
}

func TestEarlyStartFollowsTheDatesOwnEarlierTime(t *testing.T) {
	// The usual 19:00 with 12 h starts 07:00 (fine); the date's own 18:00 starts 06:00 (too early).
	w := newEarlyWorld(t, 12*60)
	w.Exec(`INSERT INTO meal_slot_dates (slot_id, date, time, updated_at) VALUES (?, ?, '18:00', '2026-11-09T10:00:00Z')`, w.Slot, crsc2.Today)
	w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", true)
	if got, ok := earlyStartOf(t, w, crsc2.Today, w.Main); !ok || got != "06:00" {
		t.Errorf("earlyStart = %q (present %v), want \"06:00\"", got, ok)
	}
}

func TestACourseLeftEmptyByTheEarliestStartCountsTooEarly(t *testing.T) {
	// Roast chicken is the only Main Recipe; at 13 h it would start 06:00, so the Main stays empty and says why.
	w := newEarlyWorld(t, 13*60)
	if r := w.User.Post("/api/plan/regenerate", nil); r.Status != 200 {
		t.Fatalf("POST /api/plan/regenerate = %d %s", r.Status, r.Body)
	}
	r := w.User.Get("/api/plan?from=" + crsc2.Today + "&to=" + crsc2.Today)
	var out struct {
		Slots []struct {
			Courses []struct {
				CourseID int64 `json:"courseId"`
				Unfilled *struct {
					Reason     string         `json:"reason"`
					Eliminated map[string]int `json:"eliminated"`
				} `json:"unfilled"`
			} `json:"courses"`
		} `json:"slots"`
	}
	r.MustJSON(t, &out)
	if len(out.Slots) != 1 {
		t.Fatalf("GET /api/plan = %d %s", r.Status, r.Body)
	}
	for _, c := range out.Slots[0].Courses {
		if c.CourseID != w.Main {
			continue
		}
		if c.Unfilled == nil || c.Unfilled.Reason != "no_candidates" || c.Unfilled.Eliminated["tooEarly"] != 1 {
			t.Fatalf("Main = %+v, want no_candidates with eliminated.tooEarly 1: %s", c.Unfilled, r.Body)
		}
		return
	}
	t.Fatalf("no Main Course: %s", r.Body)
}

func TestTurningEarliestStartOnReplansAKeptMealThatNowStartsTooEarly(t *testing.T) {
	// PC-14: the settings save publishes household "settings", which replans; the kept unpinned 13 h Roast chicken at
	// 19:00 (starting 06:00) is dropped, and the plan event's changes name the cell (was Roast chicken, now empty).
	w := newEarlyWorld(t, 13*60)
	w.Exec(`UPDATE household_settings SET earliest_start = NULL`)
	w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", false)
	var body map[string]any
	if g := w.Admin.Get("/api/household/settings"); g.Status != 200 || g.JSON(&body) != nil {
		t.Fatalf("GET settings = %d %s", g.Status, g.Body)
	}
	body["earliestStart"] = "06:30"
	ch, cancel := w.Env.App.Deps.Events.Subscribe("plan")
	defer cancel()
	if r := w.Admin.Put("/api/household/settings", body); r.Status != 200 {
		t.Fatalf("PUT settings = %d %s", r.Status, r.Body)
	}
	deadline := time.After(5 * time.Second)
	for {
		select {
		case ev := <-ch:
			var p struct {
				Changes []struct {
					Date       string `json:"date"`
					MealSlotID int64  `json:"mealSlotId"`
					CourseID   int64  `json:"courseId"`
					Before     *struct {
						RecipeID int64 `json:"recipeId"`
					} `json:"before"`
					After *struct {
						RecipeID int64 `json:"recipeId"`
					} `json:"after"`
					Why []json.RawMessage `json:"why"`
				} `json:"changes"`
			}
			if err := json.Unmarshal(ev.Data, &p); err != nil {
				t.Fatalf("plan event %s: %v", ev.Data, err)
			}
			for _, c := range p.Changes {
				if c.Date == crsc2.Today && c.MealSlotID == w.Slot && c.CourseID == w.Main {
					if c.Before == nil || c.Before.RecipeID != w.roast || c.After != nil || c.Why == nil {
						t.Fatalf("change = %s, want before Roast chicken, after null, why []", ev.Data)
					}
					if w.MealState(crsc2.Today, w.Slot, w.Main) != "" {
						t.Errorf("the too-early meal is still planned")
					}
					return
				}
			}
		case <-deadline:
			t.Fatal("no plan event named the too-early meal: the settings save did not replan it")
		}
	}
}
