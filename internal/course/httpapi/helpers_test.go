package httpapi_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Team C1: the Courses routes of spec §16, driven through the whole app (testkit). Fixtures that are not
// under test (Meal Slots, Recipes, Planned Meals) are written straight to the database, so a failure here
// is a failure of the Courses routes and nothing else.

// courseBody is a Course as GET /api/courses and every single-Course answer show it.
type courseBody struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	Position      int    `json:"position"`
	Main          bool   `json:"main"`
	Archived      bool   `json:"archived"`
	RecipeCount   int    `json:"recipeCount"`
	MealSlotCount int    `json:"mealSlotCount"`
	Planned       bool   `json:"planned"`
}

type listBody struct {
	Courses []courseBody `json:"courses"`
}

type impactBody struct {
	Planned           bool `json:"planned"`
	Recipes           int  `json:"recipes"`
	RecipesOnlyThis   int  `json:"recipesOnlyThis"`
	MealSlots         int  `json:"mealSlots"`
	MealSlotsOnlyThis int  `json:"mealSlotsOnlyThis"`
	PlannedMeals      []struct {
		Date         string `json:"date"`
		MealSlotID   int64  `json:"mealSlotId"`
		MealSlotName string `json:"mealSlotName"`
		RecipeID     int64  `json:"recipeId"`
		RecipeName   string `json:"recipeName"`
		Pinned       bool   `json:"pinned"`
	} `json:"plannedMeals"`
	SlotRules []struct {
		ID         int64  `json:"id"`
		MealSlotID int64  `json:"mealSlotId"`
		RecipeID   int64  `json:"recipeId"`
		RecipeName string `json:"recipeName"`
		Tag        string `json:"tag"`
	} `json:"slotRules"`
}

type errorBody struct {
	Error struct {
		Code             string `json:"code"`
		Message          string `json:"message"`
		Field            string `json:"field"`
		Reason           string `json:"reason"`
		ArchivedCourseID int64  `json:"archivedCourseId"`
	} `json:"error"`
}

func listCourses(t *testing.T, c *testkit.Client, query string) []courseBody {
	t.Helper()
	r := c.Get("/api/courses" + query)
	if r.Status != 200 {
		t.Fatalf("GET /api/courses%s = %d %s", query, r.Status, r.Body)
	}
	var l listBody
	r.MustJSON(t, &l)
	return l.Courses
}

func names(list []courseBody) []string {
	out := make([]string, 0, len(list))
	for _, c := range list {
		out = append(out, c.Name)
	}
	return out
}

func sameStrings(a, b []string) bool {
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

// courseID reads a seeded Course id straight from the database (Main, Side, Starter, Dessert).
func courseID(t *testing.T, env *testkit.Env, name string) int64 {
	t.Helper()
	var id int64
	if err := env.DB.QueryRow(`SELECT id FROM courses WHERE name = ?`, name).Scan(&id); err != nil {
		t.Fatalf("Course %q: %v", name, err)
	}
	return id
}

func mustExec(t *testing.T, env *testkit.Env, query string, args ...any) int64 {
	t.Helper()
	res, err := env.DB.Exec(query, args...)
	if err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	id, _ := res.LastInsertId()
	return id
}

func count(t *testing.T, env *testkit.Env, query string, args ...any) int {
	t.Helper()
	var n int
	if err := env.DB.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return n
}

// seedRecipe inserts a Recipe marked with exactly the given Courses.
func seedRecipe(t *testing.T, env *testkit.Env, name string, courses ...int64) int64 {
	t.Helper()
	id := mustExec(t, env, `INSERT INTO recipes (name, yield, created_at, updated_at) VALUES (?, 2, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`, name)
	for _, c := range courses {
		mustExec(t, env, `INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, id, c)
	}
	return id
}

// seedSlot inserts a Meal Slot serving the given Courses, in order, all required.
func seedSlot(t *testing.T, env *testkit.Env, weekday int, name string, courses ...int64) int64 {
	t.Helper()
	id := mustExec(t, env, `INSERT INTO meal_slots (weekday, name, time) VALUES (?, ?, '19:00')`, weekday, name)
	for i, c := range courses {
		mustExec(t, env, `INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional) VALUES (?, ?, ?, 0)`, id, c, i)
	}
	return id
}

// seedPlannedMeal inserts a Planned Meal. state is "planned", "cooked" or "skipped".
func seedPlannedMeal(t *testing.T, env *testkit.Env, date string, slot, course, recipe int64, state string, pinned bool) {
	t.Helper()
	p := 0
	if pinned {
		p = 1
	}
	mustExec(t, env, `INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, created_at, updated_at)
		VALUES (?, ?, ?, ?, 1, 2, ?, ?, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`, date, slot, course, recipe, state, p)
}

func seedSlotRule(t *testing.T, env *testkit.Env, slot, course, recipe int64) int64 {
	t.Helper()
	return mustExec(t, env, `INSERT INTO slot_rules (meal_slot_id, course_id, recipe_id) VALUES (?, ?, ?)`, slot, course, recipe)
}

// nextEvent waits for one event on ch and returns its topic and data.
func nextEvent(t *testing.T, ch <-chan events.Event) (string, string) {
	t.Helper()
	select {
	case e := <-ch:
		return e.Topic, string(e.Data)
	case <-time.After(2 * time.Second):
		t.Fatal("no event within 2 s")
	}
	return "", ""
}

// drain collects the events that arrive within a short window.
func drain(ch <-chan events.Event) []string {
	var out []string
	for {
		select {
		case e := <-ch:
			out = append(out, e.Topic+" "+string(e.Data))
		case <-time.After(300 * time.Millisecond):
			return out
		}
	}
}

func path(format string, a ...any) string { return fmt.Sprintf(format, a...) }

func decodeError(t *testing.T, r *testkit.Response) errorBody {
	t.Helper()
	var e errorBody
	r.MustJSON(t, &e)
	return e
}

// wantError checks status, code and (when given) field and reason of a refusal.
func wantError(t *testing.T, label string, r *testkit.Response, status int, code, field, reason string) {
	t.Helper()
	e := decodeError(t, r)
	if r.Status != status || e.Error.Code != code || e.Error.Field != field || e.Error.Reason != reason {
		t.Errorf("%s: got %d %s field=%q reason=%q (%s), want %d %s field=%q reason=%q",
			label, r.Status, e.Error.Code, e.Error.Field, e.Error.Reason, r.Body, status, code, field, reason)
	}
}
