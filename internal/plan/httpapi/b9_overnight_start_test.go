package httpapi_test

import (
	"encoding/json"
	"testing"
	"time"
)

// A2 (B9-58): GET /api/plan carries meal.startsAt {date, time} (household zone) on a Planned Meal still to cook whose
// cooking would start on an earlier day than the meal, whatever its state of holding; absent otherwise. earlyStart
// ("HH:MM", B9-12) now flags a Pinned or Bought meal whose start is in the hours between Latest start and Earliest
// start (a start after Latest start counts, whatever its day). The two fields are independent: a held meal that starts
// the evening before at 23:00 carries both. World: Wednesday 2026-11-11 Supper at 19:00, Main only; Earliest start
// 06:30 and Latest start 22:00 by default; the clock reads Monday 12:00.

type startsAt struct {
	Date string `json:"date"`
	Time string `json:"time"`
}

type overnightCell struct {
	StartsAt   *startsAt `json:"startsAt"`
	EarlyStart *string   `json:"earlyStart"`
	RecipeID   int64     `json:"recipeId"`
}

type overnightWorld struct {
	*boWorld
	supper int64
	raw    map[string]json.RawMessage
}

const wed, tue = "2026-11-11", "2026-11-10"

func newOvernightWorld(t *testing.T, minutes int) *overnightWorld {
	w := newBoWorld(t)
	w.Exec(`UPDATE recipes SET total_minutes = ? WHERE id = ?`, minutes, w.roast)
	return &overnightWorld{boWorld: w, supper: w.AddSlot(3, "Supper", "19:00", w.Main)}
}

// meal reads the Main Course meal of Wednesday: nil when the cell has none.
func (w *overnightWorld) meal(t *testing.T) (*overnightCell, map[string]json.RawMessage) {
	t.Helper()
	r := w.User.Get("/api/plan?from=" + wed + "&to=" + wed)
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
		if c.CourseID != w.Main || c.Meal == nil {
			continue
		}
		raw, _ := json.Marshal(c.Meal)
		var cell overnightCell
		if err := json.Unmarshal(raw, &cell); err != nil {
			t.Fatal(err)
		}
		return &cell, c.Meal
	}
	return nil, nil
}

func wantStartsAt(t *testing.T, cell *overnightCell, raw map[string]json.RawMessage, date, at string) {
	t.Helper()
	if cell == nil {
		t.Fatal("no meal")
	}
	if cell.StartsAt == nil || cell.StartsAt.Date != date || cell.StartsAt.Time != at {
		t.Errorf("startsAt = %s, want {date %s, time %s}", raw["startsAt"], date, at)
	}
}

func wantNoStartsAt(t *testing.T, cell *overnightCell, raw map[string]json.RawMessage) {
	t.Helper()
	if cell == nil {
		t.Fatal("no meal")
	}
	if _, ok := raw["startsAt"]; ok {
		t.Errorf("startsAt = %s, want it omitted", raw["startsAt"])
	}
}

func TestAMealStartedTheDayBeforeCarriesItsStartInThePlan(t *testing.T) {
	cases := []struct {
		name    string
		minutes int
		date    string
		time    string
		early   string // earlyStart of a Pinned meal; "" omitted
	}{
		{"22 h: Tuesday 21:00, between the Earliest and the Latest start", 22 * 60, tue, "21:00", ""},
		{"21 h: Tuesday 22:00, exactly the Latest start", 21 * 60, tue, "22:00", ""},
		{"30 h: Tuesday 13:00, more than a day ahead", 30 * 60, tue, "13:00", ""},
		{"20 h: Tuesday 23:00, after the Latest start (a held meal is flagged too)", 20 * 60, tue, "23:00", "23:00"},
		{"13 h: Wednesday 06:00, the day of the meal, before the Earliest start", 13 * 60, "", "", "06:00"},
		{"6 h: Wednesday 13:00", 6 * 60, "", "", ""},
		{"unknown length", 0, "", "", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := newOvernightWorld(t, c.minutes)
			w.Meal(wed, w.supper, w.Main, w.roast, "planned", true)
			cell, raw := w.meal(t)
			if c.date == "" {
				wantNoStartsAt(t, cell, raw)
			} else {
				wantStartsAt(t, cell, raw, c.date, c.time)
			}
			switch {
			case c.early == "" && cell.EarlyStart != nil:
				t.Errorf("earlyStart = %q, want it omitted", *cell.EarlyStart)
			case c.early != "" && (cell.EarlyStart == nil || *cell.EarlyStart != c.early):
				t.Errorf("earlyStart = %s, want %q", raw["earlyStart"], c.early)
			}
		})
	}
}

func TestAnUnpinnedMealStartedTheDayBeforeCarriesItsStartAndNoWarning(t *testing.T) {
	w := newOvernightWorld(t, 22*60)
	w.Meal(wed, w.supper, w.Main, w.roast, "planned", false)
	cell, raw := w.meal(t)
	wantStartsAt(t, cell, raw, tue, "21:00")
	if cell.EarlyStart != nil {
		t.Errorf("earlyStart = %q, want it omitted (the start is allowed)", *cell.EarlyStart)
	}
}

func TestABoughtMealStartedInTheHoursBetweenLatestAndEarliestStartCarriesBothFields(t *testing.T) {
	w := newOvernightWorld(t, 20*60)
	main := w.Meal(wed, w.supper, w.Main, w.roast, "planned", false)
	w.bought(main, w.chicken)
	cell, raw := w.meal(t)
	wantStartsAt(t, cell, raw, tue, "23:00")
	if cell.EarlyStart == nil || *cell.EarlyStart != "23:00" {
		t.Errorf("earlyStart = %s, want \"23:00\"", raw["earlyStart"])
	}
}

func TestACookedMealCarriesNoStart(t *testing.T) {
	w := newOvernightWorld(t, 22*60)
	w.Meal(wed, w.supper, w.Main, w.roast, "cooked", false)
	cell, raw := w.meal(t)
	wantNoStartsAt(t, cell, raw)
}

func TestLatestStartOffMakesTheStartTheDayBeforeAWarningToo(t *testing.T) {
	// The rule as first built: the start must be on the day of the meal, so a Tuesday 21:00 start of a Pinned meal is
	// before the Earliest start on Wednesday. The start is still reported.
	w := newOvernightWorld(t, 22*60)
	w.Exec(`UPDATE household_settings SET latest_start = NULL`)
	w.Meal(wed, w.supper, w.Main, w.roast, "planned", true)
	cell, raw := w.meal(t)
	wantStartsAt(t, cell, raw, tue, "21:00")
	if cell.EarlyStart == nil || *cell.EarlyStart != "21:00" {
		t.Errorf("earlyStart = %s, want \"21:00\"", raw["earlyStart"])
	}
}

func TestEarliestStartOffFlagsNothingButStillReportsTheStart(t *testing.T) {
	w := newOvernightWorld(t, 20*60)
	w.Exec(`UPDATE household_settings SET earliest_start = NULL`)
	w.Meal(wed, w.supper, w.Main, w.roast, "planned", true)
	cell, raw := w.meal(t)
	wantStartsAt(t, cell, raw, tue, "23:00")
	if cell.EarlyStart != nil {
		t.Errorf("earlyStart = %q, want it omitted (Earliest start Off: nothing is too early)", *cell.EarlyStart)
	}
}

func TestStartsAtFollowsTheDatesOwnSlotTime(t *testing.T) {
	// 10 h: the usual 19:00 starts Wednesday 09:00 (same day, no startsAt); the date's own 07:00 starts Tuesday 21:00.
	w := newOvernightWorld(t, 10*60)
	w.Meal(wed, w.supper, w.Main, w.roast, "planned", true)
	cell, raw := w.meal(t)
	wantNoStartsAt(t, cell, raw)
	w.Exec(`INSERT INTO meal_slot_dates (slot_id, date, time, updated_at) VALUES (?, ?, '07:00', '2026-11-09T10:00:00Z')`, w.supper, wed)
	cell, raw = w.meal(t)
	wantStartsAt(t, cell, raw, tue, "21:00")
}

func TestARegenerateMayPlanARecipeThatStartsTheEveningBefore(t *testing.T) {
	w := newOvernightWorld(t, 22*60)
	if r := w.User.Post("/api/plan/regenerate", nil); r.Status != 200 {
		t.Fatalf("POST /api/plan/regenerate = %d %s", r.Status, r.Body)
	}
	cell, raw := w.meal(t)
	if cell == nil {
		t.Fatal("the Main Course of Wednesday Supper is empty: a Tuesday 21:00 start is allowed")
	}
	wantStartsAt(t, cell, raw, tue, "21:00")
}

func TestARegenerateLeavesTheCourseEmptyWhenTheStartIsAfterTheLatestStart(t *testing.T) {
	for name, set := range map[string]func(w *overnightWorld){
		"a start at Tuesday 23:00, after the Latest start": func(w *overnightWorld) {},
		"Latest start Off and a start the day before": func(w *overnightWorld) {
			w.Exec(`UPDATE recipes SET total_minutes = ? WHERE id = ?`, 22*60, w.roast)
			w.Exec(`UPDATE household_settings SET latest_start = NULL`)
		},
	} {
		t.Run(name, func(t *testing.T) {
			w := newOvernightWorld(t, 20*60)
			set(w)
			if r := w.User.Post("/api/plan/regenerate", nil); r.Status != 200 {
				t.Fatalf("POST /api/plan/regenerate = %d %s", r.Status, r.Body)
			}
			r := w.User.Get("/api/plan?from=" + wed + "&to=" + wed)
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
			for _, c := range out.Slots[0].Courses {
				if c.CourseID == w.Main {
					if c.Unfilled == nil || c.Unfilled.Reason != "no_candidates" || c.Unfilled.Eliminated["tooEarly"] != 1 {
						t.Fatalf("Main = %+v, want no_candidates with eliminated.tooEarly 1: %s", c.Unfilled, r.Body)
					}
					return
				}
			}
			t.Fatalf("no Main Course: %s", r.Body)
		})
	}
}

// saveSettings PUTs the Household settings with the given overrides and returns the cells the plan event changed.
func (w *overnightWorld) saveSettings(t *testing.T, set map[string]any) []struct {
	Date     string `json:"date"`
	CourseID int64  `json:"courseId"`
	Before   *struct {
		RecipeID int64 `json:"recipeId"`
	} `json:"before"`
	After *struct {
		RecipeID int64 `json:"recipeId"`
	} `json:"after"`
} {
	t.Helper()
	var body map[string]any
	if g := w.Admin.Get("/api/household/settings"); g.Status != 200 || g.JSON(&body) != nil {
		t.Fatalf("GET settings = %d %s", g.Status, g.Body)
	}
	for k, v := range set {
		body[k] = v
	}
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
					Date     string `json:"date"`
					CourseID int64  `json:"courseId"`
					Before   *struct {
						RecipeID int64 `json:"recipeId"`
					} `json:"before"`
					After *struct {
						RecipeID int64 `json:"recipeId"`
					} `json:"after"`
				} `json:"changes"`
			}
			if err := json.Unmarshal(ev.Data, &p); err != nil {
				t.Fatalf("plan event %s: %v", ev.Data, err)
			}
			return p.Changes
		case <-deadline:
			t.Fatal("the settings save published no plan event")
		}
	}
}

func TestTurningLatestStartOnReplansAKeptMealThatNowStartsAfterIt(t *testing.T) {
	w := newOvernightWorld(t, 20*60) // starts Tuesday 23:00
	w.Exec(`UPDATE household_settings SET latest_start = NULL, earliest_start = NULL`)
	w.Meal(wed, w.supper, w.Main, w.roast, "planned", false)
	changes := w.saveSettings(t, map[string]any{"earliestStart": "06:30", "latestStart": "22:00"})
	for _, c := range changes {
		if c.Date == wed && c.CourseID == w.Main {
			if c.Before == nil || c.Before.RecipeID != w.roast || c.After != nil {
				t.Fatalf("change = %+v, want before Roast chicken, after null", c)
			}
			if w.MealState(wed, w.supper, w.Main) != "" {
				t.Error("the meal that now starts after the Latest start is still planned")
			}
			return
		}
	}
	t.Fatalf("no change names the meal: %+v", changes)
}

func TestAKeptMealThatStartsTheEveningBeforeStaysWhenTheSettingsAreSavedAgain(t *testing.T) {
	w := newOvernightWorld(t, 22*60) // starts Tuesday 21:00, allowed
	w.Meal(wed, w.supper, w.Main, w.roast, "planned", false)
	for _, c := range w.saveSettings(t, map[string]any{"latestStart": "22:00"}) {
		if c.Date == wed && c.CourseID == w.Main {
			t.Errorf("the allowed overnight meal changed: %+v", c)
		}
	}
	if got := w.MealState(wed, w.supper, w.Main); got != "planned" {
		t.Errorf("state = %q, want planned (the meal stays)", got)
	}
}

func TestTurningLatestStartOffReplansAKeptMealThatStartsTheDayBefore(t *testing.T) {
	w := newOvernightWorld(t, 22*60)
	w.Meal(wed, w.supper, w.Main, w.roast, "planned", false)
	changes := w.saveSettings(t, map[string]any{"latestStart": nil})
	for _, c := range changes {
		if c.Date == wed && c.CourseID == w.Main && c.Before != nil && c.After == nil {
			return
		}
	}
	t.Fatalf("no change removed the meal that starts the day before: %+v", changes)
}

func TestAHeldMealInTheHoursBetweenLatestAndEarliestStartIsNeverMovedByASettingsSave(t *testing.T) {
	w := newOvernightWorld(t, 20*60)
	w.Meal(wed, w.supper, w.Main, w.roast, "planned", true)
	for _, c := range w.saveSettings(t, map[string]any{"latestStart": "21:00"}) {
		if c.Date == wed && c.CourseID == w.Main {
			t.Errorf("a Pinned meal changed: %+v", c)
		}
	}
	if got := w.MealState(wed, w.supper, w.Main); got != "planned" {
		t.Errorf("state = %q, want the Pinned meal kept", got)
	}
}
