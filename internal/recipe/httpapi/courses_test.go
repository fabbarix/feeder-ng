package httpapi_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Team C1: Courses and Whole meal on the Recipe routes (spec §4, §16).

type recipeCourse struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type recipeC struct {
	ID        int64          `json:"id"`
	Name      string         `json:"name"`
	ReadyMeal bool           `json:"readyMeal"`
	WholeMeal bool           `json:"wholeMeal"`
	Courses   []recipeCourse `json:"courses"`
}

type summaryC struct {
	ID        int64   `json:"id"`
	Name      string  `json:"name"`
	WholeMeal bool    `json:"wholeMeal"`
	CourseIDs []int64 `json:"courseIds"`
}

type refusal struct {
	Error struct {
		Code   string `json:"code"`
		Field  string `json:"field"`
		Reason string `json:"reason"`
	} `json:"error"`
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

func seedIngredient(t *testing.T, env *testkit.Env) int64 {
	t.Helper()
	return mustExec(t, env, `INSERT INTO ingredients (name, name_key, base_unit, shelf_life_days, created_at, updated_at)
		VALUES ('rice', 'rice', 'g', NULL, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`)
}

// body is a plain Recipe; extra fields (courseIds, wholeMeal, readyMeal) are merged in.
func body(ing int64, name string, extra map[string]any) map[string]any {
	m := map[string]any{"name": name, "yield": 2, "tags": []string{},
		"lines": []map[string]any{{"ingredientId": ing, "quantity": 200, "unit": "g"}}}
	for k, v := range extra {
		m[k] = v
	}
	return m
}

func wantRefusal(t *testing.T, label string, r *testkit.Response, status int, code, field, reason string) {
	t.Helper()
	var e refusal
	r.MustJSON(t, &e)
	if r.Status != status || e.Error.Code != code || e.Error.Field != field || e.Error.Reason != reason {
		t.Errorf("%s: got %d %s field=%q reason=%q (%s), want %d %s field=%q reason=%q",
			label, r.Status, e.Error.Code, e.Error.Field, e.Error.Reason, r.Body, status, code, field, reason)
	}
}

func courseNames(cs []recipeCourse) string {
	var out []string
	for _, c := range cs {
		out = append(out, c.Name)
	}
	return strings.Join(out, ",")
}

func TestARecipeWithoutCoursesIsMarkedMainAndIsNotAWholeMeal(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	main := courseID(t, env, "Main")
	r := user.Post("/api/recipes", body(seedIngredient(t, env), "Roast", nil))
	var rec recipeC
	r.MustJSON(t, &rec)
	if r.Status != 201 || len(rec.Courses) != 1 || rec.Courses[0].ID != main || rec.Courses[0].Name != "Main" || rec.WholeMeal {
		t.Fatalf("create = %d %s, want courses [Main] and wholeMeal false", r.Status, r.Body)
	}
	var again recipeC
	user.Get(fmt.Sprintf("/api/recipes/%d", rec.ID)).MustJSON(t, &again)
	if courseNames(again.Courses) != "Main" || again.WholeMeal {
		t.Errorf("GET = %+v", again)
	}
}

func TestARecipeShowsItsCoursesInHouseholdOrderWhateverOrderWasSent(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	ing := seedIngredient(t, env)
	main, side, dessert := courseID(t, env, "Main"), courseID(t, env, "Side"), courseID(t, env, "Dessert")
	r := user.Post("/api/recipes", body(ing, "Gratin", map[string]any{"courseIds": []int64{dessert, side, main, side}, "wholeMeal": true}))
	var rec recipeC
	r.MustJSON(t, &rec)
	if r.Status != 201 || courseNames(rec.Courses) != "Main,Side,Dessert" || !rec.WholeMeal {
		t.Errorf("create = %d %s, want Main, Side, Dessert (household order, repeats dropped) and wholeMeal true", r.Status, r.Body)
	}
}

func TestAReadyMealIsAWholeMealByDefaultWhenItIsServedAsMain(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	main, dessert := courseID(t, env, "Main"), courseID(t, env, "Dessert")
	create := func(name string, extra map[string]any) recipeC {
		m := map[string]any{"name": name, "yield": 2, "readyMeal": true, "lines": []any{}}
		for k, v := range extra {
			m[k] = v
		}
		r := user.Post("/api/recipes", m)
		var rec recipeC
		r.MustJSON(t, &rec)
		if r.Status != 201 {
			t.Fatalf("create %s = %d %s", name, r.Status, r.Body)
		}
		return rec
	}
	if rec := create("Lasagne pack", nil); !rec.ReadyMeal || !rec.WholeMeal {
		t.Errorf("a Ready Meal served as Main = %+v, want wholeMeal true", rec)
	}
	if rec := create("Cake pack", map[string]any{"courseIds": []int64{dessert}}); rec.WholeMeal {
		t.Errorf("a Ready Meal that is only a Dessert = %+v, want wholeMeal false", rec)
	}
	if rec := create("Pizza pack", map[string]any{"courseIds": []int64{main}, "wholeMeal": false}); rec.WholeMeal {
		t.Errorf("an explicit wholeMeal false = %+v, want it respected", rec)
	}
}

func TestRecipeCourseValidation(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	ing := seedIngredient(t, env)
	main, starter := courseID(t, env, "Main"), courseID(t, env, "Starter")
	mustExec(t, env, `UPDATE courses SET archived = 1 WHERE id = ?`, starter)
	post := func(ids any) *testkit.Response {
		return user.Post("/api/recipes", body(ing, "Roast", map[string]any{"courseIds": ids}))
	}
	wantRefusal(t, "empty", post([]int64{}), 422, "validation_failed", "courses", "courses_empty")
	wantRefusal(t, "unknown", post([]int64{main, 99999}), 422, "validation_failed", "courses", "course_unknown")
	wantRefusal(t, "archived", post([]int64{starter}), 422, "validation_failed", "courses", "course_unknown")
	wantRefusal(t, "zero", post([]int64{0}), 422, "validation_failed", "courses", "course_unknown")
	var list []summaryC
	user.Get("/api/recipes").MustJSON(t, &list)
	if len(list) != 0 {
		t.Errorf("a refused create left %d Recipes", len(list))
	}
	// null is as good as absent: the main Course.
	r := user.Post("/api/recipes", body(ing, "Roast", map[string]any{"courseIds": nil, "wholeMeal": nil}))
	var rec recipeC
	r.MustJSON(t, &rec)
	if r.Status != 201 || courseNames(rec.Courses) != "Main" || rec.WholeMeal {
		t.Errorf("null = %d %s", r.Status, r.Body)
	}
}

func TestUpdateKeepsCoursesAndWholeMealWhenNotSentAndChangesThemWhenSent(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	ing := seedIngredient(t, env)
	main, side := courseID(t, env, "Main"), courseID(t, env, "Side")
	var rec recipeC
	user.Post("/api/recipes", body(ing, "Gratin", map[string]any{"courseIds": []int64{main, side}, "wholeMeal": true})).MustJSON(t, &rec)
	url := fmt.Sprintf("/api/recipes/%d", rec.ID)

	r := user.Put(url, body(ing, "Gratin dauphinois", nil))
	r.MustJSON(t, &rec)
	if r.Status != 200 || rec.Name != "Gratin dauphinois" || courseNames(rec.Courses) != "Main,Side" || !rec.WholeMeal {
		t.Fatalf("PUT without courseIds and wholeMeal = %d %s, want both kept", r.Status, r.Body)
	}
	r = user.Put(url, body(ing, "Gratin dauphinois", map[string]any{"courseIds": []int64{side}, "wholeMeal": false}))
	r.MustJSON(t, &rec)
	if r.Status != 200 || courseNames(rec.Courses) != "Side" || rec.WholeMeal {
		t.Fatalf("PUT with both = %d %s", r.Status, r.Body)
	}
	wantRefusal(t, "PUT empty", user.Put(url, body(ing, "Gratin", map[string]any{"courseIds": []int64{}})), 422, "validation_failed", "courses", "courses_empty")
	wantRefusal(t, "PUT unknown", user.Put(url, body(ing, "Gratin", map[string]any{"courseIds": []int64{99999}})), 422, "validation_failed", "courses", "course_unknown")
	// Taking the main Course off a Whole meal keeps the stored flag.
	user.Put(url, body(ing, "Gratin", map[string]any{"courseIds": []int64{main}, "wholeMeal": true})).MustJSON(t, &rec)
	r = user.Put(url, body(ing, "Gratin", map[string]any{"courseIds": []int64{side}}))
	r.MustJSON(t, &rec)
	if r.Status != 200 || !rec.WholeMeal {
		t.Errorf("moving a Whole meal off Main = %d %s, want the flag kept", r.Status, r.Body)
	}
}

func TestListSummariesCarryCoursesAndFilterByThem(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	ing := seedIngredient(t, env)
	main, side, dessert := courseID(t, env, "Main"), courseID(t, env, "Side"), courseID(t, env, "Dessert")
	user.Post("/api/recipes", body(ing, "Roast", nil))
	user.Post("/api/recipes", body(ing, "Gratin", map[string]any{"courseIds": []int64{main, side}, "wholeMeal": true}))
	user.Post("/api/recipes", body(ing, "Greens", map[string]any{"courseIds": []int64{side}}))

	names := func(query string) string {
		r := user.Get("/api/recipes" + query)
		if r.Status != 200 {
			t.Fatalf("GET /api/recipes%s = %d %s", query, r.Status, r.Body)
		}
		var list []summaryC
		r.MustJSON(t, &list)
		var out []string
		for _, s := range list {
			out = append(out, s.Name)
		}
		return strings.Join(out, ",")
	}
	var all []summaryC
	user.Get("/api/recipes").MustJSON(t, &all)
	got := map[string]summaryC{}
	for _, s := range all {
		got[s.Name] = s
	}
	if g := got["Gratin"]; !g.WholeMeal || len(g.CourseIDs) != 2 || g.CourseIDs[0] != main || g.CourseIDs[1] != side {
		t.Errorf("Gratin summary = %+v, want wholeMeal and courseIds [Main, Side]", g)
	}
	if g := got["Roast"]; g.WholeMeal || len(g.CourseIDs) != 1 || g.CourseIDs[0] != main {
		t.Errorf("Roast summary = %+v", g)
	}
	if n := names(fmt.Sprintf("?course=%d", side)); n != "Gratin,Greens" && n != "Greens,Gratin" {
		t.Errorf("?course=Side = %s", n)
	}
	if n := names(fmt.Sprintf("?notCourse=%d", side)); n != "Roast" {
		t.Errorf("?notCourse=Side = %s, want Roast (the Couldn't plan fix)", n)
	}
	if n := names(fmt.Sprintf("?course=%d&notCourse=%d", main, side)); n != "Roast" {
		t.Errorf("?course=Main&notCourse=Side = %s", n)
	}
	if n := names(fmt.Sprintf("?course=%d", dessert)); n != "" {
		t.Errorf("?course=Dessert = %s, want none", n)
	}
	wantRefusal(t, "course=abc", user.Get("/api/recipes?course=abc"), 422, "validation_failed", "course", "course_invalid")
	wantRefusal(t, "notCourse=abc", user.Get("/api/recipes?notCourse=abc"), 422, "validation_failed", "notCourse", "course_invalid")
}

func TestARecipeThatLosesACourseLosesItsRulesAndUnresolvedMealsThere(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	ing := seedIngredient(t, env)
	main, side := courseID(t, env, "Main"), courseID(t, env, "Side")
	var greens, other recipeC
	user.Post("/api/recipes", body(ing, "Greens", map[string]any{"courseIds": []int64{main, side}})).MustJSON(t, &greens)
	user.Post("/api/recipes", body(ing, "Peas", map[string]any{"courseIds": []int64{side}})).MustJSON(t, &other)
	slot := mustExec(t, env, `INSERT INTO meal_slots (weekday, name, time) VALUES (4, 'Dinner', '19:00')`)
	mustExec(t, env, `INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional) VALUES (?, ?, 0, 0), (?, ?, 1, 0)`, slot, main, slot, side)
	meal := func(date string, course, recipe int64, state string, pinned int) {
		mustExec(t, env, `INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, created_at, updated_at)
			VALUES (?, ?, ?, ?, 1, 2, ?, ?, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`, date, slot, course, recipe, state, pinned)
	}
	meal("2026-11-12", side, greens.ID, "planned", 0) // goes
	meal("2026-11-19", side, greens.ID, "planned", 1) // Pinned: stays
	meal("2026-11-26", side, greens.ID, "cooked", 0)  // history: stays
	meal("2026-12-03", side, other.ID, "planned", 0)  // another Recipe: stays
	ruleOf := func(course, recipe int64) {
		mustExec(t, env, `INSERT INTO slot_rules (meal_slot_id, course_id, recipe_id) VALUES (?, ?, ?)`, slot, course, recipe)
	}
	ruleOf(side, greens.ID) // goes
	ruleOf(main, greens.ID) // other Course: stays
	ruleOf(side, other.ID)  // other Recipe: stays
	ch, cancel := env.App.Deps.Events.Subscribe("recipes")
	defer cancel()

	r := user.Put(fmt.Sprintf("/api/recipes/%d", greens.ID), body(ing, "Greens", map[string]any{"courseIds": []int64{main}}))
	if r.Status != 200 {
		t.Fatalf("PUT = %d %s", r.Status, r.Body)
	}
	if n := count(t, env, `SELECT count(*) FROM slot_rules WHERE recipe_id = ? AND course_id = ?`, greens.ID, side); n != 0 {
		t.Errorf("the Slot Rule on the lost Course stayed")
	}
	if n := count(t, env, `SELECT count(*) FROM slot_rules`); n != 2 {
		t.Errorf("%d Slot Rules left, want the two on other Courses or Recipes", n)
	}
	if n := count(t, env, `SELECT count(*) FROM planned_meals WHERE recipe_id = ? AND course_id = ? AND state = 'planned' AND pinned = 0`, greens.ID, side); n != 0 {
		t.Errorf("an unpinned, unresolved Planned Meal in the lost Course stayed")
	}
	if n := count(t, env, `SELECT count(*) FROM planned_meals WHERE recipe_id = ? AND course_id = ? AND (pinned = 1 OR state = 'cooked')`, greens.ID, side); n != 2 {
		t.Errorf("Pinned and cooked meals must stay, found %d", n)
	}
	select {
	case e := <-ch:
		if e.Topic != "recipes" {
			t.Errorf("event %s", e.Topic)
		}
	case <-time.After(2 * time.Second):
		t.Errorf("no recipes event, so the plan is not replanned")
	}
}
