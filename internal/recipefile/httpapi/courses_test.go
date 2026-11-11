package httpapi_test

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// crs-e1: Courses and Whole meal over HTTP (docs/dev/design/crs-e1.md). The Courses routes belong to team C;
// these tests set the Household's Courses with SQL. The migration seeds Main (main), Side, Starter, Dessert.

func agentPrompt(t *testing.T, c *testkit.Client) string {
	t.Helper()
	var v struct {
		Prompt string `json:"prompt"`
	}
	mustStatus(t, c.Get("/api/recipe-file/agent-prompt"), 200).MustJSON(t, &v)
	return v.Prompt
}

func promptFor(courses ...recipefile.PromptCourse) string {
	tpl, _ := recipefile.ExtractTemplate(spec.RecipeFileMD)
	return recipefile.AgentPrompt(tpl, string(spec.Schema), string(spec.Example), courses)
}

func TestTheAgentPromptIsBuiltPerRequestFromTheHouseholdsActiveCourses(t *testing.T) {
	env, c := start(t)
	if _, err := env.DB.Exec(`UPDATE courses SET name = 'Primo', name_key = 'primo' WHERE is_main = 1`); err != nil {
		t.Fatal(err)
	}
	if _, err := env.DB.Exec(`INSERT INTO courses (name, name_key, position, is_main, archived, created_at) VALUES
		('Soup', 'soup', 4, 0, 1, '2026-11-09T12:00:00Z'), ('Brunch', 'brunch', 5, 0, 0, '2026-11-09T12:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	got := agentPrompt(t, c)
	want := promptFor(recipefile.PromptCourse{Name: "Primo", Main: true}, recipefile.PromptCourse{Name: "Side"},
		recipefile.PromptCourse{Name: "Starter"}, recipefile.PromptCourse{Name: "Dessert"}, recipefile.PromptCourse{Name: "Brunch"})
	if got != want {
		t.Fatalf("the prompt must list Primo (default), Side, Starter, Dessert, Brunch; got the Courses part:\n%s", between(got, "13. Courses:", "14. Whole meal:"))
	}
	for _, line := range []string{"- Primo (default)\n", "- Brunch\n"} {
		if !strings.Contains(got, line) {
			t.Errorf("the prompt lacks the line %q", line)
		}
	}
	if strings.Contains(got, "Soup") {
		t.Error("an archived Course is not offered")
	}
}

func between(s, from, to string) string {
	i, j := strings.Index(s, from), strings.Index(s, to)
	if i < 0 || j < i {
		return s
	}
	return s[i:j]
}

func TestExportWritesCourseNamesAndWholeMeal(t *testing.T) {
	env, c := start(t)
	pancakes, _ := seed(t, c)
	if _, err := env.DB.Exec(`INSERT INTO recipe_courses (recipe_id, course_id) SELECT ?, id FROM courses WHERE name_key = 'dessert'`, pancakes); err != nil {
		t.Fatal(err)
	}
	if _, err := env.DB.Exec(`UPDATE recipes SET whole_meal = 1 WHERE id = ?`, pancakes); err != nil {
		t.Fatal(err)
	}
	var raw struct {
		Recipes []map[string]any `json:"recipes"`
	}
	mustStatus(t, c.Get("/api/recipe-file/export?all=1"), 200).MustJSON(t, &raw)
	byName := map[string]map[string]any{}
	for _, r := range raw.Recipes {
		byName[r["name"].(string)] = r
	}
	if got := byName["Pancakes"]["courses"]; !reflect.DeepEqual(got, []any{"Main", "Dessert"}) {
		t.Errorf("Pancakes courses = %v, want Main, Dessert in household order", got)
	}
	if got := byName["Pancakes"]["wholeMeal"]; got != true {
		t.Errorf("Pancakes wholeMeal = %v", got)
	}
	if got := byName["Milk"]["courses"]; !reflect.DeepEqual(got, []any{"Main"}) {
		t.Errorf("Milk courses = %v, want the main Course it was given", got)
	}
	if got, ok := byName["Milk"]["wholeMeal"]; !ok || got != false {
		t.Errorf("Milk wholeMeal = %v (present %v), want an explicit false", got, ok)
	}
}

// courseFile is a Recipe File with one Recipe that has the given courses.
func courseFile(name string, courses ...string) string {
	f := obj{
		"format": "feeder-recipe-file", "version": 1,
		"ingredients": []obj{{"name": "rice", "baseUnit": "g"}},
		"recipes": []obj{{"name": name, "yield": 2, "courses": courses,
			"ingredients": []obj{{"ingredient": "rice", "quantity": 100, "unit": "g"}}}},
	}
	b, _ := json.Marshal(f)
	return string(b)
}

func recipeCourseNames(t *testing.T, env *testkit.Env, recipe string) []string {
	t.Helper()
	rows, err := env.DB.Query(`SELECT c.name FROM recipe_courses rc JOIN courses c ON c.id = rc.course_id
		JOIN recipes r ON r.id = rc.recipe_id WHERE r.name = ? ORDER BY c.position`, recipe)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var n string
		rows.Scan(&n)
		out = append(out, n)
	}
	return out
}

func courseCount(t *testing.T, env *testkit.Env) int {
	t.Helper()
	var n int
	env.DB.QueryRow(`SELECT count(*) FROM courses`).Scan(&n)
	return n
}

func TestImportReviewShowsAnUnknownCourseAndConfirmNeverCreatesIt(t *testing.T) {
	env, c := start(t)
	rev := openReview(t, c, courseFile("Pancakes", "side", "Brunch"))
	if !rev.Plan.Ready || len(rev.Plan.Courses) != 2 {
		t.Fatalf("plan = %+v, want ready with two Course rows", rev.Plan)
	}
	var brunch recipefile.CourseMatch
	for _, m := range rev.Plan.Courses {
		if m.Key == "brunch" {
			brunch = m
		}
	}
	if brunch.Status != recipefile.CourseUnknown || brunch.Effective == nil || brunch.Effective.Action != recipefile.ActionUse || brunch.Effective.CourseID == 0 {
		t.Fatalf("brunch row = %+v, want unknown, defaulting to use the main Course", brunch)
	}
	var done struct {
		CoursesCreated int `json:"coursesCreated"`
	}
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": obj{}}), 200).MustJSON(t, &done)
	if done.CoursesCreated != 0 || courseCount(t, env) != 4 {
		t.Fatalf("a Course was created without an answer: %+v, %d Courses", done, courseCount(t, env))
	}
	if got := recipeCourseNames(t, env, "Pancakes"); !reflect.DeepEqual(got, []string{"Main", "Side"}) {
		t.Errorf("Courses = %v, want Main (the default for Brunch) and Side", got)
	}
}

func TestTheDecisionsOfThePlanRouteChangeTheCourseRow(t *testing.T) {
	_, c := start(t)
	rev := openReview(t, c, courseFile("Pancakes", "Brunch"))
	d := obj{"courses": []obj{{"key": "brunch", "action": "skip"}}}
	var p reviewResp
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/plan", obj{"decisions": d}), 200).MustJSON(t, &p)
	if len(p.Plan.Courses) != 1 || p.Plan.Courses[0].Effective == nil || p.Plan.Courses[0].Effective.Action != recipefile.ActionSkip {
		t.Fatalf("courses = %+v", p.Plan.Courses)
	}
}

func TestAnAdminCanAddTheCourseAtConfirm(t *testing.T) {
	env, _ := start(t)
	admin := env.LoginAdmin(t)
	rev := openReview(t, admin, courseFile("Pancakes", "Main", "  Brunch  "))
	d := obj{"courses": []obj{{"key": "brunch", "action": "add"}}}
	var done struct {
		CoursesCreated int `json:"coursesCreated"`
	}
	mustStatus(t, admin.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": d}), 200).MustJSON(t, &done)
	if done.CoursesCreated != 1 || courseCount(t, env) != 5 {
		t.Fatalf("done = %+v, %d Courses", done, courseCount(t, env))
	}
	if got := recipeCourseNames(t, env, "Pancakes"); !reflect.DeepEqual(got, []string{"Main", "Brunch"}) {
		t.Errorf("Courses = %v", got)
	}
}

func TestAnAdminCanUnarchiveTheCourseAtConfirm(t *testing.T) {
	env, _ := start(t)
	if _, err := env.DB.Exec(`INSERT INTO courses (name, name_key, position, is_main, archived, created_at) VALUES ('Soup', 'soup', 4, 0, 1, '2026-11-09T12:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	admin := env.LoginAdmin(t)
	rev := openReview(t, admin, courseFile("Lentil soup", "Soup"))
	if len(rev.Plan.Courses) != 1 || rev.Plan.Courses[0].Status != recipefile.CourseArchived {
		t.Fatalf("courses = %+v, want one archived row", rev.Plan.Courses)
	}
	d := obj{"courses": []obj{{"key": "soup", "action": "unarchive"}}}
	var done struct {
		CoursesUnarchived int `json:"coursesUnarchived"`
	}
	mustStatus(t, admin.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": d}), 200).MustJSON(t, &done)
	if done.CoursesUnarchived != 1 {
		t.Fatalf("done = %+v", done)
	}
	if got := recipeCourseNames(t, env, "Lentil soup"); !reflect.DeepEqual(got, []string{"Soup"}) {
		t.Errorf("Courses = %v", got)
	}
}

// subscribeHousehold returns a func that drains the events published on topic "household".
func subscribeHousehold(t *testing.T, env *testkit.Env) func() []string {
	t.Helper()
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	t.Cleanup(cancel)
	return func() []string {
		var out []string
		for {
			select {
			case e := <-ch:
				out = append(out, string(e.Data))
			case <-time.After(200 * time.Millisecond):
				return out
			}
		}
	}
}

func wantChangedCourses(t *testing.T, got []string) {
	t.Helper()
	for _, d := range got {
		var p map[string]any
		if json.Unmarshal([]byte(d), &p) == nil && len(p) == 1 && p["changed"] == "courses" {
			return
		}
	}
	t.Fatalf("household events = %v, want one with payload {\"changed\":\"courses\"} (spec 16, crs-e1 3.6)", got)
}

func TestAnImportThatAddsACourseEmitsTheHouseholdCoursesEvent(t *testing.T) {
	env, _ := start(t)
	admin := env.LoginAdmin(t)
	drain := subscribeHousehold(t, env)
	rev := openReview(t, admin, courseFile("Pancakes", "Main", "Brunch"))
	d := obj{"courses": []obj{{"key": "brunch", "action": "add"}}}
	mustStatus(t, admin.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": d}), 200)
	wantChangedCourses(t, drain())
}

func TestAnImportThatUnarchivesACourseEmitsTheHouseholdCoursesEvent(t *testing.T) {
	env, _ := start(t)
	if _, err := env.DB.Exec(`INSERT INTO courses (name, name_key, position, is_main, archived, created_at) VALUES ('Soup', 'soup', 4, 0, 1, '2026-11-09T12:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	admin := env.LoginAdmin(t)
	drain := subscribeHousehold(t, env)
	rev := openReview(t, admin, courseFile("Lentil soup", "Soup"))
	d := obj{"courses": []obj{{"key": "soup", "action": "unarchive"}}}
	mustStatus(t, admin.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": d}), 200)
	wantChangedCourses(t, drain())
}

func TestAnImportThatOnlyUsesCoursesEmitsNoHouseholdCoursesEvent(t *testing.T) {
	env, _ := start(t)
	admin := env.LoginAdmin(t)
	drain := subscribeHousehold(t, env)
	rev := openReview(t, admin, courseFile("Pancakes", "Main", "side"))
	mustStatus(t, admin.Post("/api/imports/"+rev.ID+"/confirm", obj{}), 200)
	for _, d := range drain() {
		if strings.Contains(d, `"courses"`) {
			t.Fatalf("unexpected household event %s for an import that only used Courses", d)
		}
	}
}

func TestAUserWhoIsNotAnAdminCannotAddOrUnarchiveACourse(t *testing.T) {
	env, user := start(t)
	if _, err := env.DB.Exec(`INSERT INTO courses (name, name_key, position, is_main, archived, created_at) VALUES ('Soup', 'soup', 4, 0, 1, '2026-11-09T12:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ name, action string }{{"Brunch", "add"}, {"Soup", "unarchive"}} {
		rev := openReview(t, user, courseFile("Pancakes", tc.name))
		d := obj{"courses": []obj{{"key": strings.ToLower(tc.name), "action": tc.action}}}
		r := user.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": d})
		if r.Status != 403 || r.ErrorCode() != "forbidden" {
			t.Fatalf("%s: confirm = %d %s, want 403 forbidden", tc.action, r.Status, r.Body)
		}
		if courseCount(t, env) != 5 {
			t.Fatalf("%s: a Course was created", tc.action)
		}
		var archived int
		env.DB.QueryRow(`SELECT archived FROM courses WHERE name_key = 'soup'`).Scan(&archived)
		if archived != 1 {
			t.Fatalf("%s: the Course was unarchived", tc.action)
		}
		// The refusal keeps the Review: the User answers with a Course they may use, and the import goes through.
		fix := obj{"courses": []obj{{"key": strings.ToLower(tc.name), "action": "skip"}}}
		mustStatus(t, user.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": fix}), 200)
		if n := len(recipeCourseNames(t, env, "Pancakes")); n != 1 {
			t.Fatalf("%s: Courses = %d, want just the main Course", tc.action, n)
		}
		env.DB.Exec(`DELETE FROM recipes WHERE name = 'Pancakes'`)
	}
	if n := courseCount(t, env); n != 5 {
		t.Fatalf("%d Courses, want the 4 seeded and the archived Soup", n)
	}
}

func TestAnExportedRecipeImportsBackWithItsCoursesAndWholeMealOverHTTP(t *testing.T) {
	envA, a := start(t)
	pancakes, _ := seed(t, a)
	envA.DB.Exec(`INSERT INTO recipe_courses (recipe_id, course_id) SELECT ?, id FROM courses WHERE name_key = 'side'`, pancakes)
	envA.DB.Exec(`UPDATE recipes SET whole_meal = 1 WHERE id = ?`, pancakes)
	exported := mustStatus(t, a.Get(fmt.Sprintf("/api/recipe-file/export?ids=%d", pancakes)), 200).Body

	envB, b := start(t)
	rev := openReview(t, b, string(exported))
	if !rev.Plan.Ready {
		t.Fatalf("plan = %+v", rev.Plan)
	}
	mustStatus(t, b.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": obj{}}), 200)
	if got := recipeCourseNames(t, envB, "Pancakes"); !reflect.DeepEqual(got, []string{"Main", "Side"}) {
		t.Errorf("Courses = %v", got)
	}
	var whole int
	envB.DB.QueryRow(`SELECT whole_meal FROM recipes WHERE name = 'Pancakes'`).Scan(&whole)
	if whole != 1 {
		t.Error("Whole meal was lost")
	}
}
