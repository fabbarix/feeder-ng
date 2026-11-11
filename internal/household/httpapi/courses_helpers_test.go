package httpapi_test

import (
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Team C1: Courses on Meal Slots and Course Attendance (spec §3.1, §16). Fixtures that are not under test
// (Courses, Recipes, Planned Meals, Slot Rules) are written straight to the database.

// slotCourseBody is one Course of a Meal Slot as the API shows it.
type slotCourseBody struct {
	ID              int64   `json:"id"`
	Name            string  `json:"name"`
	Main            bool    `json:"main"`
	Optional        bool    `json:"optional"`
	OptOutMemberIDs []int64 `json:"optOutMemberIds"`
}

type slotC struct {
	slotBody
	Courses []slotCourseBody `json:"courses"`
}

type removedMeal struct {
	Date         string `json:"date"`
	MealSlotID   int64  `json:"mealSlotId"`
	MealSlotName string `json:"mealSlotName"`
	CourseID     int64  `json:"courseId"`
	CourseName   string `json:"courseName"`
	RecipeID     int64  `json:"recipeId"`
	RecipeName   string `json:"recipeName"`
	Pinned       bool   `json:"pinned"`
}

type removedRule struct {
	ID           int64  `json:"id"`
	MealSlotID   int64  `json:"mealSlotId"`
	MealSlotName string `json:"mealSlotName"`
	CourseID     int64  `json:"courseId"`
	CourseName   string `json:"courseName"`
	RecipeID     int64  `json:"recipeId"`
	RecipeName   string `json:"recipeName"`
	Tag          string `json:"tag"`
}

type removesBody struct {
	PlannedMeals []removedMeal `json:"plannedMeals"`
	SlotRules    []removedRule `json:"slotRules"`
}

type batchC struct {
	Match   string  `json:"match"`
	Updated []slotC `json:"updated"`
	Skipped []struct {
		Weekday int    `json:"weekday"`
		Reason  string `json:"reason"`
	} `json:"skipped"`
	Removes *removesBody `json:"removes"`
}

type errorBody struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Field   string `json:"field"`
		Reason  string `json:"reason"`
	} `json:"error"`
}

// wantRefusal checks status, code, field and reason of a refusal.
func wantRefusal(t *testing.T, label string, r *testkit.Response, status int, code, field, reason string) {
	t.Helper()
	var e errorBody
	r.MustJSON(t, &e)
	if r.Status != status || e.Error.Code != code || e.Error.Field != field || e.Error.Reason != reason {
		t.Errorf("%s: got %d %s field=%q reason=%q (%s), want %d %s field=%q reason=%q",
			label, r.Status, e.Error.Code, e.Error.Field, e.Error.Reason, r.Body, status, code, field, reason)
	}
}

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

func seedRecipe(t *testing.T, env *testkit.Env, name string, courses ...int64) int64 {
	t.Helper()
	id := mustExec(t, env, `INSERT INTO recipes (name, yield, created_at, updated_at) VALUES (?, 2, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`, name)
	for _, c := range courses {
		mustExec(t, env, `INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, id, c)
	}
	return id
}

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

// courseSpec is one entry of a request's "courses" list.
func courseSpec(id int64, optional bool, optOut ...int64) map[string]any {
	m := map[string]any{"id": id}
	if optional {
		m["optional"] = true
	}
	if optOut != nil {
		m["optOutMemberIds"] = optOut
	}
	return m
}

func slotWithCourses(t *testing.T, c *testkit.Client, id int64) slotC {
	t.Helper()
	var list []slotC
	c.Get("/api/meal-slots").MustJSON(t, &list)
	for _, s := range list {
		if s.ID == id {
			return s
		}
	}
	t.Fatalf("Meal Slot %d is not listed", id)
	return slotC{}
}

func courseNames(cs []slotCourseBody) []string {
	out := make([]string, 0, len(cs))
	for _, c := range cs {
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

func sameIDs(a, b []int64) bool {
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

// putSlot saves a Meal Slot with PATCH /api/meal-slots/{id} (the whole body, as the editor sends it).
func putSlot(c *testkit.Client, s slotBody, courses any) *testkit.Response {
	body := map[string]any{"weekday": s.Weekday, "name": s.Name, "time": s.Time, "attendance": s.Attendance}
	if courses != nil {
		body["courses"] = courses
	}
	return c.Patch(path("/api/meal-slots/%d", s.ID), body)
}

// drainHousehold collects the household events that arrive within a short window, as one string.
func drainHousehold(ch <-chan events.Event) string {
	var out []string
	for {
		select {
		case e := <-ch:
			out = append(out, e.Topic+" "+string(e.Data))
		case <-time.After(300 * time.Millisecond):
			return strings.Join(out, "|")
		}
	}
}

// slotCourse returns the i-th Course of a slot, failing the test (not panicking) when there is none.
func slotCourse(t *testing.T, cs []slotCourseBody, i int) slotCourseBody {
	t.Helper()
	if i >= len(cs) {
		t.Fatalf("courses = %+v, want at least %d", cs, i+1)
	}
	return cs[i]
}
