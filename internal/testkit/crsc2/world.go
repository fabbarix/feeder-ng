// Package crsc2 is the fixture of team C2's API tests (docs/dev/design/crs-c2.md): a household with two Members and
// a Monday Dinner at 19:00 serving Main and Side, built straight in the database (no events, so the planner stays
// quiet), plus Recipes made through the API and Planned Meals written as rows. The fixed clock reads Monday
// 2026-11-09 12:00 UTC and the household zone is UTC.
package crsc2

import (
	"context"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Dates around the fixed clock.
const (
	Yesterday = "2026-11-08"
	Today     = "2026-11-09" // Monday: the Dinner at 19:00 is still ahead
	NextMon   = "2026-11-16" // outside the 7-day horizon
)

// World is one running Feeder with the C2 household.
type World struct {
	T           *testing.T
	Env         *testkit.Env
	Admin, User *testkit.Client

	Anna, Sam                    int64 // Portion Factor 1 each
	Main, Side, Starter, Dessert int64 // the seeded Courses
	salt                         int64 // the Line of a Recipe made without Lines (a Recipe needs one)
	Slot                         int64 // Monday Dinner 19:00, Main then Side, both required, Anna and Sam attend
}

// New boots the household. Nothing is planned.
func New(t *testing.T) *World {
	t.Helper()
	env := testkit.Start(t)
	w := &World{T: t, Env: env, Admin: env.LoginAdmin(t), User: env.LoginUser(t)}
	w.Main, w.Side, w.Starter, w.Dessert = w.courseID("Main"), w.courseID("Side"), w.courseID("Starter"), w.courseID("Dessert")
	w.Anna = w.Exec(`INSERT INTO members (name, colour, portion_factor, created_at) VALUES ('Anna', '#3366cc', 1, '2026-11-01T00:00:00Z')`)
	w.Sam = w.Exec(`INSERT INTO members (name, colour, portion_factor, created_at) VALUES ('Sam', '#81b29a', 1, '2026-11-01T00:00:00Z')`)
	w.Slot = w.AddSlot(1, "Dinner", "19:00", w.Main, w.Side)
	return w
}

func (w *World) courseID(name string) int64 {
	w.T.Helper()
	var id int64
	if err := w.Env.DB.QueryRow(`SELECT id FROM courses WHERE name = ?`, name).Scan(&id); err != nil {
		w.T.Fatalf("Course %q: %v", name, err)
	}
	return id
}

// Exec runs a statement and returns the last insert id; a failure fails the test.
func (w *World) Exec(q string, args ...any) int64 {
	w.T.Helper()
	res, err := w.Env.DB.Exec(q, args...)
	if err != nil {
		w.T.Fatalf("%s: %v", q, err)
	}
	id, _ := res.LastInsertId()
	return id
}

// Count runs a COUNT query.
func (w *World) Count(q string, args ...any) int {
	w.T.Helper()
	var n int
	if err := w.Env.DB.QueryRow(q, args...).Scan(&n); err != nil {
		w.T.Fatalf("%s: %v", q, err)
	}
	return n
}

// AddSlot adds a Meal Slot on a weekday (1 Monday) attended by Anna and Sam, serving the Courses in order, all required.
func (w *World) AddSlot(weekday int, name, at string, courses ...int64) int64 {
	w.T.Helper()
	id := w.Exec(`INSERT INTO meal_slots (weekday, name, time) VALUES (?, ?, ?)`, weekday, name, at)
	w.Exec(`INSERT INTO meal_slot_attendees (slot_id, member_id) VALUES (?, ?)`, id, w.Anna)
	w.Exec(`INSERT INTO meal_slot_attendees (slot_id, member_id) VALUES (?, ?)`, id, w.Sam)
	for i, c := range courses {
		w.Exec(`INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional) VALUES (?, ?, ?, 0)`, id, c, i)
	}
	return id
}

// Optional makes a Course of the slot optional.
func (w *World) Optional(slot, course int64) {
	w.T.Helper()
	w.Exec(`UPDATE meal_slot_courses SET optional = 1 WHERE meal_slot_id = ? AND course_id = ?`, slot, course)
}

// AddCourseToSlot appends a Course to the slot's Courses.
func (w *World) AddCourseToSlot(slot, course int64, optional bool) {
	w.T.Helper()
	opt := 0
	if optional {
		opt = 1
	}
	w.Exec(`INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional)
		SELECT ?, ?, COALESCE(MAX(position), -1) + 1, ? FROM meal_slot_courses WHERE meal_slot_id = ?`, slot, course, opt, slot)
}

// OptOut makes a Member usually not eat a Course of the slot.
func (w *World) OptOut(slot, course, member int64) {
	w.T.Helper()
	w.Exec(`INSERT INTO meal_slot_course_opt_outs (meal_slot_id, course_id, member_id) VALUES (?, ?, ?)`, slot, course, member)
}

// OptOutOn replaces the usual opt-outs of a Course on one date with exactly these Members (none: everybody eats it).
func (w *World) OptOutOn(slot int64, date string, course int64, members ...int64) {
	w.T.Helper()
	w.Exec(`INSERT INTO course_attendance_overrides (slot_id, date, course_id) VALUES (?, ?, ?)`, slot, date, course)
	for _, m := range members {
		w.Exec(`INSERT INTO course_attendance_override_opt_outs (slot_id, date, course_id, member_id) VALUES (?, ?, ?, ?)`, slot, date, course, m)
	}
}

// Line is one Recipe Line.
type Line struct {
	Ingredient int64
	Grams      float64
}

// Step is one Recipe Step. Kind is "active", "passive" or "advance".
type Step struct {
	Text     string
	Kind     string
	Minutes  int
	Lead     int   // advance only
	After    []int // Recipe Step indexes
	UseGrams map[int64]float64
}

// RecipeSpec describes a Recipe; zero values give a 2-portion Recipe marked Main, no Lines, no Steps.
type RecipeSpec struct {
	Yield   float64
	Courses []int64
	Whole   bool
	Lines   []Line
	Steps   []Step
	Reheat  int // reheatMinutes, 0 none
	UseBy   int // leftoverUseByDays, 0 default
}

// Recipe creates a Recipe through the API and returns its id.
func (w *World) Recipe(name string, s RecipeSpec) int64 {
	w.T.Helper()
	if s.Yield == 0 {
		s.Yield = 2
	}
	if s.Courses == nil {
		s.Courses = []int64{w.Main}
	}
	if len(s.Lines) == 0 {
		if w.salt == 0 {
			w.salt = w.Ingredient("salt")
		}
		s.Lines = []Line{{Ingredient: w.salt, Grams: 1}}
	}
	lines := []map[string]any{}
	for _, l := range s.Lines {
		lines = append(lines, map[string]any{"ingredientId": l.Ingredient, "quantity": l.Grams, "unit": "g"})
	}
	steps := []map[string]any{}
	for _, st := range s.Steps {
		uses := []map[string]any{}
		for ing, g := range st.UseGrams {
			uses = append(uses, map[string]any{"ingredientId": ing, "quantity": g, "unit": "g"})
		}
		after := st.After
		if after == nil {
			after = []int{}
		}
		steps = append(steps, map[string]any{"text": st.Text, "kind": st.Kind, "durationMinutes": st.Minutes,
			"leadTimeMinutes": st.Lead, "after": after, "uses": uses})
	}
	body := map[string]any{"name": name, "yield": s.Yield, "courseIds": s.Courses, "wholeMeal": s.Whole, "lines": lines, "steps": steps}
	if s.Reheat > 0 {
		body["reheatMinutes"] = s.Reheat
	}
	if s.UseBy > 0 {
		body["leftoverUseByDays"] = s.UseBy
	}
	r := w.Admin.Post("/api/recipes", body)
	var out struct {
		ID int64 `json:"id"`
	}
	if r.Status != 201 || r.JSON(&out) != nil {
		w.T.Fatalf("create Recipe %q = %d %s", name, r.Status, r.Body)
	}
	return out.ID
}

// Ingredient creates an Ingredient measured in grams.
func (w *World) Ingredient(name string) int64 {
	w.T.Helper()
	r := w.Admin.Post("/api/ingredients", map[string]any{"name": name, "baseUnit": "g"})
	var out struct {
		ID int64 `json:"id"`
	}
	if r.Status != 201 || r.JSON(&out) != nil {
		w.T.Fatalf("create Ingredient %q = %d %s", name, r.Status, r.Body)
	}
	return out.ID
}

// Stock adds a Stock Lot of grams.
func (w *World) Stock(ingredient int64, grams float64) {
	w.T.Helper()
	if r := w.Admin.Post("/api/stock/lots", map[string]any{"ingredientId": ingredient, "quantity": grams}); r.Status != 201 {
		w.T.Fatalf("add a Stock Lot = %d %s", r.Status, r.Body)
	}
}

// StockTotal is the Stock of an Ingredient in grams.
func (w *World) StockTotal(ingredient int64) float64 {
	w.T.Helper()
	var total float64
	r := w.Admin.Get("/api/stock")
	var out struct {
		Ingredients []struct {
			IngredientID int64   `json:"ingredientId"`
			Total        float64 `json:"total"`
		} `json:"ingredients"`
	}
	if r.Status != 200 || r.JSON(&out) != nil {
		w.T.Fatalf("GET /api/stock = %d %s", r.Status, r.Body)
	}
	for _, i := range out.Ingredients {
		if i.IngredientID == ingredient {
			total = i.Total
		}
	}
	return total
}

// Settle waits for the planner to finish what the setup (Recipes, Stock) started, then forgets every plan row, so
// each test starts from an empty plan and writes exactly the rows it needs.
func (w *World) Settle() {
	w.T.Helper()
	for i := 0; i < 2; i++ {
		time.Sleep(120 * time.Millisecond)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err := w.Env.App.WaitIdle(ctx)
		cancel()
		if err != nil {
			w.T.Fatalf("the planner did not settle: %v", err)
		}
	}
	w.Exec(`DELETE FROM planned_meals`)
	w.Exec(`DELETE FROM plan_unfilled`)
	w.Exec(`DELETE FROM leftovers`)
}

// Meal writes a Planned Meal row: 1 Batch, 2 portions, state "planned", "cooked" or "skipped".
func (w *World) Meal(date string, slot, course, recipe int64, state string, pinned bool) int64 {
	w.T.Helper()
	p := 0
	if pinned {
		p = 1
	}
	return w.Exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, created_at, updated_at)
		VALUES (?, ?, ?, ?, 1, 2, ?, ?, '2026-11-08T12:00:00Z', '2026-11-08T12:00:00Z')`, date, slot, course, recipe, state, p)
}

// LeftoverMeal writes a Planned Meal served from a Leftover of an earlier meal (portions 2, Batches 0).
func (w *World) LeftoverMeal(date string, slot, course, recipe int64, fromDate string, fromSlot, fromCourse int64) int64 {
	w.T.Helper()
	return w.Exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, from_date, from_meal_slot_id, from_course_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, 0, 2, 'planned', 0, ?, ?, ?, '2026-11-08T12:00:00Z', '2026-11-08T12:00:00Z')`, date, slot, course, recipe, fromDate, fromSlot, fromCourse)
}

// MealState reads the state of the Planned Meal at a cell ("" when there is none).
func (w *World) MealState(date string, slot, course int64) string {
	w.T.Helper()
	var s string
	if err := w.Env.DB.QueryRow(`SELECT state FROM planned_meals WHERE date = ? AND meal_slot_id = ? AND course_id = ?`, date, slot, course).Scan(&s); err != nil {
		return ""
	}
	return s
}

// Unfilled writes a Couldn't plan reason for a cell.
func (w *World) Unfilled(date string, slot, course int64, reason string) {
	w.T.Helper()
	w.Exec(`INSERT INTO plan_unfilled (date, meal_slot_id, course_id, reason, slot_rule_claimed, eliminated_json) VALUES (?, ?, ?, ?, 0, '{}')`,
		date, slot, course, reason)
}
