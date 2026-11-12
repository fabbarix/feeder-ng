package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// The kitchen board with Courses (spec §7.5, §16 Today and the board; docs/dev/design/crs-c2.md §6).

type boardBody struct {
	NextAdvance *struct {
		Scope      string `json:"scope"`
		RecipeName string `json:"recipeName"`
		Step       int    `json:"step"`
		Text       string `json:"text"`
		CourseID   int64  `json:"courseId"`
		CourseName string `json:"courseName"`
		MealDate   string `json:"mealDate"`
		MealSlotID int64  `json:"mealSlotId"`
	} `json:"nextAdvance"`
	Slots []struct {
		Date        string `json:"date"`
		MealSlotID  int64  `json:"mealSlotId"`
		Name        string `json:"name"`
		CookMinutes *int   `json:"cookMinutes"`
		Courses     []struct {
			CourseID int64  `json:"courseId"`
			Name     string `json:"name"`
			Main     bool   `json:"main"`
			Meal     *struct {
				RecipeName string `json:"recipeName"`
				CourseID   int64  `json:"courseId"`
				State      string `json:"state"`
			} `json:"meal"`
			CoveredBy *struct {
				RecipeName string `json:"recipeName"`
			} `json:"coveredBy"`
		} `json:"courses"`
	} `json:"slots"`
}

func TestBoardNextAdvanceStepNamesItsCourseAndUsesThatCoursesScope(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{Steps: []crsc2.Step{
		{Text: "Marinate", Kind: "advance", Lead: 120}, {Text: "Roast", Kind: "active", Minutes: 20}}})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Steps: []crsc2.Step{
		{Text: "Soak", Kind: "advance", Lead: 60}, {Text: "Boil", Kind: "active", Minutes: 10}}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)

	var b boardBody
	w.User.Get("/api/board").MustJSON(t, &b)
	n := b.NextAdvance
	if n == nil || n.Text != "Marinate" || n.CourseID != w.Main || n.CourseName != "Main" || n.RecipeName != "Roast chicken" || n.Scope != mainScope(w) {
		t.Fatalf("nextAdvance = %+v, want the Main's Marinate (due 17:00) with the real main Course id", n)
	}
	if r := w.User.Put("/api/cook/marks", map[string]any{"scope": mainScope(w), "step": 0, "done": true}); r.Status != 200 {
		t.Fatalf("mark = %d %s", r.Status, r.Body)
	}
	b = boardBody{}
	w.User.Get("/api/board").MustJSON(t, &b)
	n = b.NextAdvance
	if n == nil || n.Text != "Soak" || n.CourseID != w.Side || n.CourseName != "Side" || n.RecipeName != "Green beans" || n.Scope != sideScope(w) || n.MealSlotID != w.Slot {
		t.Errorf("nextAdvance after the Main's mark = %+v, want the Side's Soak", n)
	}
}

func TestBoardCarriesTonightAndTomorrowsSlotsWithTheirCoursesAndCookMinutes(t *testing.T) {
	w := crsc2.New(t)
	lunch := w.AddSlot(2, "Lunch", "12:30", w.Main)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{Steps: []crsc2.Step{{Text: "Roast", Kind: "active", Minutes: 20}}})
	stew := w.Recipe("Beef stew", crsc2.RecipeSpec{Whole: true, Steps: []crsc2.Step{{Text: "Stew", Kind: "active", Minutes: 40}}})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Steps: []crsc2.Step{{Text: "Boil", Kind: "active", Minutes: 10}}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)
	w.Meal("2026-11-10", lunch, w.Main, stew, "planned", false)
	w.Meal("2026-11-11", lunch, w.Main, stew, "planned", false) // the day after tomorrow: not on the board

	var b boardBody
	r := w.User.Get("/api/board")
	r.MustJSON(t, &b)
	if len(b.Slots) != 2 {
		t.Fatalf("board slots = %d (%s), want tonight's Dinner and tomorrow's Lunch", len(b.Slots), r.Body)
	}
	tonight, tomorrow := b.Slots[0], b.Slots[1]
	if tonight.Date != crsc2.Today || tonight.MealSlotID != w.Slot || tonight.CookMinutes == nil || *tonight.CookMinutes != 30 || len(tonight.Courses) != 2 {
		t.Fatalf("tonight = %+v", tonight)
	}
	if c := tonight.Courses[0]; c.CourseID != w.Main || !c.Main || c.Meal == nil || c.Meal.RecipeName != "Roast chicken" {
		t.Errorf("tonight's main row = %+v", c)
	}
	if c := tonight.Courses[1]; c.CourseID != w.Side || c.Meal == nil || c.Meal.RecipeName != "Green beans" {
		t.Errorf("tonight's side row = %+v", c)
	}
	if tomorrow.Date != "2026-11-10" || tomorrow.MealSlotID != lunch || tomorrow.CookMinutes == nil || *tomorrow.CookMinutes != 40 || len(tomorrow.Courses) != 1 {
		t.Errorf("tomorrow = %+v", tomorrow)
	}
}
