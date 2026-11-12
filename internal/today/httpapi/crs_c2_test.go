package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// GET /api/today/advance-steps entries gain courseId (spec §16 Today and the board). The Advance Steps of two Courses
// of one slot are two entries, each with its own Course. This needs notify.StepDue to carry the Course
// (docs/dev/design/crs-c2.md §6, a one-field change in internal/notify that C2 does not own).

func TestTodaysAdvanceStepsNameTheirCourse(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{Steps: []crsc2.Step{
		{Text: "Marinate", Kind: "advance", Lead: 120}, {Text: "Roast", Kind: "active", Minutes: 20}}})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Steps: []crsc2.Step{
		{Text: "Soak", Kind: "advance", Lead: 60}, {Text: "Boil", Kind: "active", Minutes: 10}}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)

	var out struct {
		Steps []struct {
			MealSlotID  int64  `json:"mealSlotId"`
			RecipeName  string `json:"recipeName"`
			Description string `json:"description"`
			CourseID    int64  `json:"courseId"`
			CourseName  string `json:"courseName"`
		} `json:"steps"`
	}
	r := w.User.Get("/api/today/advance-steps")
	r.MustJSON(t, &out)
	if len(out.Steps) != 2 {
		t.Fatalf("steps = %s, want one per Course", r.Body)
	}
	for _, s := range out.Steps {
		switch s.Description {
		case "Marinate":
			if s.CourseID != w.Main || s.CourseName != "Main" || s.RecipeName != "Roast chicken" {
				t.Errorf("Marinate = %+v", s)
			}
		case "Soak":
			if s.CourseID != w.Side || s.CourseName != "Side" || s.RecipeName != "Green beans" {
				t.Errorf("Soak = %+v", s)
			}
		default:
			t.Errorf("unexpected step %+v", s)
		}
	}
}
