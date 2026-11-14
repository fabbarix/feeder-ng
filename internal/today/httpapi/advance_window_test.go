package httpapi_test

import (
	"context"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/notify"
	notifyapi "github.com/fabbarix/feeder-ng/internal/notify/httpapi"
	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// TB-02 (B9-12): GET /api/today/advance-steps lists every not-done Advance Step due within the next 24 hours (and
// any overdue one whose Planned Meal is not served), soonest first, from the same marks-aware source as the board's
// Next Advance Step and the push. The fixture's clock is Monday 2026-11-09 12:00 UTC (zone UTC); the Monday Dinner
// is at 19:00. A step carries scope and step (the key of PUT /api/cook/marks), overdue and mealSlotName beside the
// fields it already had.

const (
	tuesday   = "2026-11-10"
	wednesday = "2026-11-11"
)

type stepRow struct {
	Scope        string `json:"scope"`
	Step         int    `json:"step"`
	Overdue      bool   `json:"overdue"`
	MealDate     string `json:"mealDate"`
	MealSlotName string `json:"mealSlotName"`
	CourseName   string `json:"courseName"`
	RecipeName   string `json:"recipeName"`
	Description  string `json:"description"`
	DueAt        string `json:"dueAt"`
	DueTime      string `json:"dueTime"`
	State        string `json:"state"`
}

func advanceRows(t *testing.T, w *crsc2.World) []stepRow {
	t.Helper()
	var out struct {
		Steps []stepRow `json:"steps"`
	}
	r := w.User.Get("/api/today/advance-steps")
	if r.Status != 200 || r.JSON(&out) != nil {
		t.Fatalf("GET advance-steps = %d %s", r.Status, r.Body)
	}
	return out.Steps
}

func descriptions(rows []stepRow) []string {
	out := []string{}
	for _, r := range rows {
		out = append(out, r.Description)
	}
	return out
}

func eq(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// advanceRecipe is a Main Recipe with one Advance Step of the given lead and a 20 minute cook.
func advanceRecipe(w *crsc2.World, name, text string, leadMinutes int) int64 {
	return w.Recipe(name, crsc2.RecipeSpec{Steps: []crsc2.Step{
		{Text: text, Kind: "advance", Lead: leadMinutes}, {Text: "Cook " + name, Kind: "active", Minutes: 20}}})
}

func TestTodayListsTomorrowsAdvanceStepWhenItIsDueWithin24Hours(t *testing.T) {
	w := crsc2.New(t)
	tueDinner := w.AddSlot(2, "Dinner", "19:00", w.Main, w.Side)
	thaw := advanceRecipe(w, "Beef stew", "Take the beef out of the freezer", 24*60) // due Monday 19:00
	w.Settle()
	w.Meal(tuesday, tueDinner, w.Main, thaw, "planned", false)

	rows := advanceRows(t, w)
	if len(rows) != 1 {
		t.Fatalf("rows = %+v, want tomorrow's Step (the stage-2 reproduction returned none)", rows)
	}
	s := rows[0]
	if s.Description != "Take the beef out of the freezer" || s.MealDate != tuesday || s.MealSlotName != "Dinner" || s.CourseName != "Main" ||
		s.RecipeName != "Beef stew" || s.DueTime != "19:00" || s.Overdue || s.State != "upcoming" || s.Scope == "" {
		t.Errorf("row = %+v", s)
	}
}

func TestTodayOrdersSoonestFirstAndFlagsOverdueSteps(t *testing.T) {
	w := crsc2.New(t)
	tueDinner := w.AddSlot(2, "Dinner", "19:00", w.Main, w.Side)
	late := advanceRecipe(w, "Late", "Soak the beans", 8*60) // Monday dinner 19:00 less 8 h = 11:00, an hour ago
	soon := advanceRecipe(w, "Soon", "Marinate", 2*60)       // 17:00
	next := advanceRecipe(w, "Next", "Thaw", 24*60)          // Tuesday dinner less 24 h = Monday 19:00
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, late, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, soon, "planned", false)
	w.Meal(tuesday, tueDinner, w.Main, next, "planned", false)

	rows := advanceRows(t, w)
	if !eq(descriptions(rows), []string{"Soak the beans", "Marinate", "Thaw"}) {
		t.Fatalf("order = %v, want the overdue Step first, then 17:00, then 19:00", descriptions(rows))
	}
	if !rows[0].Overdue || rows[0].State != "due" || rows[1].Overdue || rows[2].Overdue {
		t.Errorf("overdue flags = %v %v %v, want true false false", rows[0].Overdue, rows[1].Overdue, rows[2].Overdue)
	}
}

func TestTodayLeavesOutWhatIsPastTheWindowCookedOrServedFromALeftover(t *testing.T) {
	w := crsc2.New(t)
	tueDinner := w.AddSlot(2, "Dinner", "19:00", w.Main, w.Side)
	wedDinner := w.AddSlot(3, "Dinner", "19:00", w.Main, w.Side)
	in := advanceRecipe(w, "In", "Due Tuesday 11:00", 8*60)       // Tuesday 19:00 less 8 h = 11:00 < Monday 12:00 + 24 h
	out := advanceRecipe(w, "Out", "Due Tuesday 18:00", 60)       // a minute... six hours after the window ends
	far := advanceRecipe(w, "Far", "Due Wednesday", 60)           // Wednesday 18:00
	cooked := advanceRecipe(w, "Cooked", "Cooked meal", 2*60)     // the meal is already Cooked
	left := advanceRecipe(w, "Leftover", "From a leftover", 2*60) // the Planned Meal is served from a Leftover
	w.Settle()
	w.Meal(tuesday, tueDinner, w.Main, in, "planned", false)
	w.Meal(tuesday, tueDinner, w.Side, out, "planned", false)
	w.Meal(wednesday, wedDinner, w.Main, far, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Main, cooked, "cooked", false)
	w.LeftoverMeal(crsc2.Today, w.Slot, w.Side, left, crsc2.Yesterday, w.Slot, w.Main)

	if got := descriptions(advanceRows(t, w)); !eq(got, []string{"Due Tuesday 11:00"}) {
		t.Errorf("rows = %v, want only the Step due within 24 h of a planned fresh meal", got)
	}
}

func TestAMealThatHasBeenServedHasNoStepsToDo(t *testing.T) {
	w := crsc2.New(t)
	r := advanceRecipe(w, "Roast", "Marinate", 24*60)
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, r, "planned", false)
	// Today's Dinner is moved to 11:00, an hour before now: the meal is behind us.
	w.Exec(`INSERT INTO meal_slot_dates (slot_id, date, time, updated_at) VALUES (?, ?, '11:00', '2026-11-08T12:00:00Z')`, w.Slot, crsc2.Today)
	if rows := advanceRows(t, w); len(rows) != 0 {
		t.Errorf("rows = %+v, want none: the meal was served at 11:00", rows)
	}
}

func TestADoneStepLeavesTodayTheBoardAndThePush(t *testing.T) {
	w := crsc2.New(t)
	tueDinner := w.AddSlot(2, "Dinner", "19:00", w.Main, w.Side)
	thaw := advanceRecipe(w, "Beef stew", "Thaw the beef", 24*60)
	roast := advanceRecipe(w, "Roast", "Marinate", 2*60)
	w.Settle()
	w.Meal(tuesday, tueDinner, w.Main, thaw, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)

	rows := advanceRows(t, w)
	if !eq(descriptions(rows), []string{"Marinate", "Thaw the beef"}) {
		t.Fatalf("rows = %v", descriptions(rows))
	}
	// The board's Next Advance Step is the first row (one source).
	var b struct {
		NextAdvance *stepRow `json:"nextAdvance"`
	}
	w.User.Get("/api/board").MustJSON(t, &b)
	if b.NextAdvance == nil || b.NextAdvance.Scope != rows[0].Scope {
		t.Fatalf("board nextAdvance = %+v, want the first row %+v", b.NextAdvance, rows[0])
	}
	pushed := func() []string {
		f, err := notifyapi.DispatcherFor(w.Env.DB).Facts(context.Background(), w.Env.Clock.Now())
		if err != nil {
			t.Fatal(err)
		}
		var out []string
		for _, c := range notify.Compute(f, time.UTC) {
			if c.Type == notify.AdvanceStep {
				out = append(out, c.Body)
			}
		}
		return out
	}
	if len(pushed()) != 2 {
		t.Fatalf("before the mark: %d Advance Step pushes, want 2", len(pushed()))
	}

	if r := w.User.Put("/api/cook/marks", map[string]any{"scope": rows[0].Scope, "step": rows[0].Step, "done": true}); r.Status != 200 {
		t.Fatalf("mark = %d %s", r.Status, r.Body)
	}
	if got := descriptions(advanceRows(t, w)); !eq(got, []string{"Thaw the beef"}) {
		t.Errorf("Today after Done = %v, want only the other Step", got)
	}
	if p := pushed(); len(p) != 1 {
		t.Errorf("pushes after Done = %v, want one: a Step done on the board is not pushed (notify.Facts never read the marks)", p)
	}
	var after struct {
		NextAdvance *stepRow `json:"nextAdvance"`
	}
	w.User.Get("/api/board").MustJSON(t, &after)
	if after.NextAdvance == nil || after.NextAdvance.Scope == rows[0].Scope && after.NextAdvance.Step == rows[0].Step {
		t.Errorf("board after Done = %+v, want the other Step", after.NextAdvance)
	}
	// Undo clears the mark: it comes back in all three.
	w.User.Put("/api/cook/marks", map[string]any{"scope": rows[0].Scope, "step": rows[0].Step, "done": false})
	if len(advanceRows(t, w)) != 2 || len(pushed()) != 2 {
		t.Error("after Undo both Steps are due again")
	}
}
