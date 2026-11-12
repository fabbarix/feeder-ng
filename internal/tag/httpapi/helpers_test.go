package httpapi_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Team TG-API: the Tags routes of spec §17, driven through the whole app (testkit). Fixtures that are not
// under test (Recipes, Meal Slots, rules) are written straight to the database, so a failure here is a
// failure of the Tags routes and nothing else. Rules are seeded by key, so an orphan key can be tested.

// tagBody is a Tag as GET /api/tags and every single-Tag answer show it.
type tagBody struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Key         string `json:"key"`
	Colour      string `json:"colour"`
	Recipes     int    `json:"recipes"`
	SlotRules   int    `json:"slotRules"`
	VarietyRule bool   `json:"varietyRule"`
}

type impactSlotRule struct {
	ID           int64  `json:"id"`
	MealSlotID   int64  `json:"mealSlotId"`
	MealSlotName string `json:"mealSlotName"`
	Weekday      int    `json:"weekday"`
	CourseID     int64  `json:"courseId"`
	CourseName   string `json:"courseName"`
	Tag          string `json:"tag"`
}

type impactBody struct {
	Recipes     int              `json:"recipes"`
	SlotRules   []impactSlotRule `json:"slotRules"`
	VarietyRule *struct {
		Tag                string `json:"tag"`
		MaxPerWeek         int    `json:"maxPerWeek"`
		NotConsecutiveDays bool   `json:"notConsecutiveDays"`
	} `json:"varietyRule"`
	BothRecipes *int `json:"bothRecipes"`
}

type errorBody struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Field   string `json:"field"`
		Reason  string `json:"reason"`
		Tag     *struct {
			ID     int64  `json:"id"`
			Name   string `json:"name"`
			Colour string `json:"colour"`
		} `json:"tag"`
	} `json:"error"`
}

func path(format string, a ...any) string { return fmt.Sprintf(format, a...) }

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

func courseID(t *testing.T, env *testkit.Env, name string) int64 {
	t.Helper()
	return int64(count(t, env, `SELECT id FROM courses WHERE name = ?`, name))
}

// seedTag inserts a Tag row with a key made as the app makes it (lower-cased name).
func seedTag(t *testing.T, env *testkit.Env, name, colour string) int64 {
	t.Helper()
	return mustExec(t, env, `INSERT INTO tags (key, name, colour) VALUES (?, ?, ?)`, strings.ToLower(name), name, colour)
}

// seedRecipe inserts a Recipe (Main Course) carrying the given Tags in order.
func seedRecipe(t *testing.T, env *testkit.Env, name string, archived int, tags ...int64) int64 {
	t.Helper()
	id := mustExec(t, env, `INSERT INTO recipes (name, yield, archived, created_at, updated_at) VALUES (?, 2, ?, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`, name, archived)
	mustExec(t, env, `INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, id, courseID(t, env, "Main"))
	for i, tg := range tags {
		mustExec(t, env, `INSERT INTO recipe_tags (recipe_id, tag_id, position) VALUES (?, ?, ?)`, id, tg, i)
	}
	return id
}

// seedSlot inserts a Meal Slot serving Main then Side.
func seedSlot(t *testing.T, env *testkit.Env, weekday int, name, at string) int64 {
	t.Helper()
	id := mustExec(t, env, `INSERT INTO meal_slots (weekday, name, time) VALUES (?, ?, ?)`, weekday, name, at)
	mustExec(t, env, `INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional) VALUES (?, ?, 0, 0), (?, ?, 1, 0)`,
		id, courseID(t, env, "Main"), id, courseID(t, env, "Side"))
	return id
}

func seedSlotRule(t *testing.T, env *testkit.Env, slot, course int64, key string) int64 {
	t.Helper()
	return mustExec(t, env, `INSERT INTO slot_rules (meal_slot_id, course_id, tag) VALUES (?, ?, ?)`, slot, course, key)
}

func seedVariety(t *testing.T, env *testkit.Env, key string, perWeek int, consecutive int) {
	t.Helper()
	mustExec(t, env, `INSERT INTO variety_rules (tag, max_per_week, not_consecutive_days) VALUES (?, ?, ?)`, key, perWeek, consecutive)
}

// ruleKeys lists "slot/course=key" of every Slot Rule by Tag, sorted, then "variety=key" of every Variety Rule.
func ruleKeys(t *testing.T, env *testkit.Env) []string {
	t.Helper()
	var out []string
	rows, err := env.DB.Query(`SELECT meal_slot_id || '/' || course_id || '=' || tag FROM slot_rules WHERE tag IS NOT NULL ORDER BY 1`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var s string
		rows.Scan(&s)
		out = append(out, s)
	}
	rows.Close()
	rows, err = env.DB.Query(`SELECT 'variety=' || tag FROM variety_rules ORDER BY 1`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var s string
		rows.Scan(&s)
		out = append(out, s)
	}
	rows.Close()
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

// listTags reads GET /api/tags.
func listTags(t *testing.T, c *testkit.Client) []tagBody {
	t.Helper()
	r := c.Get("/api/tags")
	if r.Status != 200 {
		t.Fatalf("GET /api/tags = %d %s", r.Status, r.Body)
	}
	var out []tagBody
	r.MustJSON(t, &out)
	return out
}

func tagNames(list []tagBody) []string {
	out := make([]string, 0, len(list))
	for _, x := range list {
		out = append(out, x.Name)
	}
	return out
}

// wantError checks status, code and (when given) field and reason of a refusal.
func wantError(t *testing.T, label string, r *testkit.Response, status int, code, field, reason string) errorBody {
	t.Helper()
	var e errorBody
	r.MustJSON(t, &e)
	if r.Status != status || e.Error.Code != code || e.Error.Field != field || e.Error.Reason != reason {
		t.Errorf("%s: got %d %s field=%q reason=%q (%s), want %d %s field=%q reason=%q",
			label, r.Status, e.Error.Code, e.Error.Field, e.Error.Reason, r.Body, status, code, field, reason)
	}
	return e
}

// drain collects the events that arrive within a short window, as "topic data".
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
