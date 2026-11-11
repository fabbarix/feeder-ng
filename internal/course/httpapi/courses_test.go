package httpapi_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func TestCourseRoutesAreSignedInReadsAndAdminWrites(t *testing.T) {
	env := testkit.Start(t)
	user, anon := env.LoginUser(t), env.Anonymous()
	side := courseID(t, env, "Side")
	reads := []string{"/api/courses", path("/api/courses/%d/impact", side)}
	for _, p := range reads {
		if r := anon.Get(p); r.Status != 401 {
			t.Errorf("anonymous GET %s = %d, want 401", p, r.Status)
		}
		if r := user.Get(p); r.Status != 200 {
			t.Errorf("User GET %s = %d, want 200", p, r.Status)
		}
	}
	writes := []struct {
		method, path string
		body         any
	}{
		{"POST", "/api/courses", map[string]any{"name": "Cheese"}},
		{"PATCH", path("/api/courses/%d", side), map[string]any{"name": "Sides"}},
		{"PUT", "/api/courses/order", map[string]any{"ids": []int64{side}}},
		{"DELETE", path("/api/courses/%d", side), nil},
		{"POST", path("/api/courses/%d/archive", side), map[string]any{}},
		{"POST", path("/api/courses/%d/unarchive", side), nil},
	}
	for _, w := range writes {
		if r := anon.Do(w.method, w.path, w.body); r.Status != 401 {
			t.Errorf("anonymous %s %s = %d, want 401", w.method, w.path, r.Status)
		}
		if r := user.Do(w.method, w.path, w.body); r.Status != 403 {
			t.Errorf("User %s %s = %d, want 403", w.method, w.path, r.Status)
		}
	}
	if got := names(listCourses(t, env.LoginAdmin(t), "")); !sameStrings(got, []string{"Main", "Side", "Starter", "Dessert"}) {
		t.Errorf("a refused write changed the list: %v", got)
	}
}

func TestListCoursesInHouseholdOrderWithTheirUse(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	list := listCourses(t, env.LoginUser(t), "")
	if got := names(list); !sameStrings(got, []string{"Main", "Side", "Starter", "Dessert"}) {
		t.Fatalf("a new install lists %v", got)
	}
	for i, c := range list {
		if c.Main != (c.Name == "Main") || c.Archived || c.Planned || c.RecipeCount != 0 || c.MealSlotCount != 0 {
			t.Errorf("fresh Course %d = %+v", i, c)
		}
		if i > 0 && c.Position <= list[i-1].Position {
			t.Errorf("positions do not rise: %+v", list)
		}
	}

	main, side, dessert := courseID(t, env, "Main"), courseID(t, env, "Side"), courseID(t, env, "Dessert")
	seedRecipe(t, env, "Roast", main)
	seedRecipe(t, env, "Greens", side)
	seedRecipe(t, env, "Gratin", main, side)
	slot := seedSlot(t, env, 4, "Dinner", main, side)
	seedPlannedMeal(t, env, "2026-11-12", slot, side, seedRecipe(t, env, "Peas", side), "planned", false)

	got := map[string]courseBody{}
	for _, c := range listCourses(t, admin, "") {
		got[c.Name] = c
	}
	if c := got["Main"]; c.RecipeCount != 2 || c.MealSlotCount != 1 || c.Planned {
		t.Errorf("Main = %+v, want 2 Recipes, 1 Meal Slot, not planned", c)
	}
	if c := got["Side"]; c.RecipeCount != 3 || c.MealSlotCount != 1 || !c.Planned {
		t.Errorf("Side = %+v, want 3 Recipes, 1 Meal Slot, planned", c)
	}
	if c := got["Dessert"]; c.ID != dessert || c.RecipeCount != 0 || c.Planned {
		t.Errorf("Dessert = %+v", c)
	}
}

func TestListCoursesHidesArchivedOnesUnlessAsked(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	starter := courseID(t, env, "Starter")
	if r := admin.Post(path("/api/courses/%d/archive", starter), map[string]any{}); r.Status != 200 {
		t.Fatalf("archive Starter = %d %s", r.Status, r.Body)
	}
	if got := names(listCourses(t, admin, "")); !sameStrings(got, []string{"Main", "Side", "Dessert"}) {
		t.Errorf("default list = %v, want Starter hidden", got)
	}
	all := listCourses(t, admin, "?archived=1")
	if len(all) != 4 {
		t.Fatalf("?archived=1 = %v", names(all))
	}
	for _, c := range all {
		if c.Archived != (c.Name == "Starter") {
			t.Errorf("%s archived = %v", c.Name, c.Archived)
		}
	}
}

func TestAddCourse(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	defer cancel()

	r := admin.Post("/api/courses", map[string]any{"name": "  Cheese   course "})
	if r.Status != 201 {
		t.Fatalf("add = %d %s", r.Status, r.Body)
	}
	var c courseBody
	r.MustJSON(t, &c)
	if c.ID == 0 || c.Name != "Cheese course" || c.Main || c.Archived || c.Planned || c.RecipeCount != 0 || c.MealSlotCount != 0 {
		t.Errorf("added Course = %+v, want a trimmed, collapsed, unused, non-main Course", c)
	}
	list := listCourses(t, admin, "")
	if got := names(list); !sameStrings(got, []string{"Main", "Side", "Starter", "Dessert", "Cheese course"}) {
		t.Errorf("list = %v, want the new Course last", got)
	}
	if last := list[len(list)-1]; last.ID != c.ID || last.Position != c.Position {
		t.Errorf("last row = %+v, added %+v", last, c)
	}
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, `"courses"`) {
		t.Errorf("event = %s %s, want household changed: courses", topic, data)
	}
}

func TestAddCourseValidationAndNameKey(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	post := func(name string) *testkit.Response { return admin.Post("/api/courses", map[string]any{"name": name}) }

	for label, name := range map[string]string{"empty": "", "blank": "   ", "41 characters": strings.Repeat("é", 41)} {
		wantError(t, label, post(name), 422, "validation_failed", "name", "")
	}
	if r := post(strings.Repeat("é", 40)); r.Status != 201 {
		t.Errorf("40 characters = %d %s, want 201 (characters, not bytes)", r.Status, r.Body)
	}
	// The key is the name trimmed, inner whitespace collapsed and lower-cased.
	for _, name := range []string{"side", "  SIDE ", " sIdE"} {
		wantError(t, name, post(name), 409, "course_name_taken", "", "")
	}
	if r := post("Cheese   board"); r.Status != 201 {
		t.Fatalf("Cheese board = %d %s", r.Status, r.Body)
	}
	wantError(t, "collapsed", post(" cheese board"), 409, "course_name_taken", "", "")
	if r := post("Entrée"); r.Status != 201 {
		t.Fatalf("Entrée = %d %s", r.Status, r.Body)
	}
	if r := post("Entree"); r.Status != 201 {
		t.Errorf("Entree = %d %s, want a second name (accents count)", r.Status, r.Body)
	}
	if r := admin.Do("POST", "/api/courses", []byte(`{"name": 7}`)); r.Status != 400 && r.Status != 422 {
		t.Errorf("a number as the name = %d", r.Status)
	}
}

func TestAddCourseStopsAtTwentyActiveCourses(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	for i := 5; i <= 20; i++ {
		if r := admin.Post("/api/courses", map[string]any{"name": fmt.Sprintf("Course %d", i)}); r.Status != 201 {
			t.Fatalf("Course %d = %d %s", i, r.Status, r.Body)
		}
	}
	wantError(t, "21st", admin.Post("/api/courses", map[string]any{"name": "One too many"}), 422, "too_many_courses", "", "")

	// Archived Courses do not count against the 20.
	starter := courseID(t, env, "Starter")
	if r := admin.Post(path("/api/courses/%d/archive", starter), map[string]any{}); r.Status != 200 {
		t.Fatalf("archive = %d %s", r.Status, r.Body)
	}
	if r := admin.Post("/api/courses", map[string]any{"name": "Room again"}); r.Status != 201 {
		t.Errorf("after archiving one = %d %s, want 201", r.Status, r.Body)
	}
}

func TestAnArchivedCoursesNameCannotBeReusedAndTheAnswerPointsToUnarchive(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	starter := courseID(t, env, "Starter")
	if r := admin.Post(path("/api/courses/%d/archive", starter), map[string]any{}); r.Status != 200 {
		t.Fatalf("archive = %d %s", r.Status, r.Body)
	}
	r := admin.Post("/api/courses", map[string]any{"name": " starter "})
	wantError(t, "add", r, 409, "course_name_taken", "", "")
	if e := decodeError(t, r); e.Error.ArchivedCourseID != starter || !strings.Contains(strings.ToLower(e.Error.Message), "unarchive") {
		t.Errorf("hint = archivedCourseId %d, message %q; want %d and a message that says to unarchive", e.Error.ArchivedCourseID, e.Error.Message, starter)
	}
	// Renaming another Course to it is refused the same way.
	side := courseID(t, env, "Side")
	r = admin.Patch(path("/api/courses/%d", side), map[string]any{"name": "Starter"})
	wantError(t, "rename", r, 409, "course_name_taken", "", "")
	if e := decodeError(t, r); e.Error.ArchivedCourseID != starter {
		t.Errorf("rename hint = %d, want %d", e.Error.ArchivedCourseID, starter)
	}
	// A name taken by an active Course carries no hint.
	r = admin.Post("/api/courses", map[string]any{"name": "Side"})
	if e := decodeError(t, r); r.Status != 409 || e.Error.ArchivedCourseID != 0 {
		t.Errorf("active clash = %d %+v, want 409 without archivedCourseId", r.Status, e.Error)
	}
}

func TestRenameCourseKeepsTheIdTheMainFlagAndTheReferences(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	main, side := courseID(t, env, "Main"), courseID(t, env, "Side")
	recipe := seedRecipe(t, env, "Greens", side)
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	defer cancel()

	r := admin.Patch(path("/api/courses/%d", main), map[string]any{"name": "Mains"})
	var c courseBody
	r.MustJSON(t, &c)
	if r.Status != 200 || c.ID != main || c.Name != "Mains" || !c.Main {
		t.Fatalf("rename Main = %d %+v, want 200, same id, still main", r.Status, c)
	}
	if r := admin.Patch(path("/api/courses/%d", side), map[string]any{"name": "SIDE"}); r.Status != 200 {
		t.Errorf("a new spelling of its own name = %d %s, want 200", r.Status, r.Body)
	}
	if n := count(t, env, `SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, recipe, side); n != 1 {
		t.Errorf("the Recipe lost its Course on rename")
	}
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, `"courses"`) {
		t.Errorf("event = %s %s", topic, data)
	}

	wantError(t, "taken", admin.Patch(path("/api/courses/%d", side), map[string]any{"name": " mains "}), 409, "course_name_taken", "", "")
	wantError(t, "empty", admin.Patch(path("/api/courses/%d", side), map[string]any{"name": ""}), 422, "validation_failed", "name", "")
	if r := admin.Patch("/api/courses/99999", map[string]any{"name": "Ghost"}); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("unknown Course = %d %s", r.Status, r.Body)
	}
	if r := admin.Patch("/api/courses/abc", map[string]any{"name": "Ghost"}); r.Status != 404 {
		t.Errorf("a non-numeric id = %d, want 404", r.Status)
	}
}

func TestMakeMainMovesTheFlagInOneStepAndNothingElseChanges(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	side := courseID(t, env, "Side")
	before := listCourses(t, admin, "")
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	defer cancel()

	r := admin.Patch(path("/api/courses/%d", side), map[string]any{"main": true})
	var c courseBody
	r.MustJSON(t, &c)
	if r.Status != 200 || c.ID != side || !c.Main {
		t.Fatalf("Make main = %d %+v", r.Status, c)
	}
	after := listCourses(t, admin, "")
	mains := 0
	for i, a := range after {
		if i >= len(before) {
			break
		}
		if a.Main {
			mains++
		}
		if a.Main != (a.ID == side) || a.Name != before[i].Name || a.Position != before[i].Position {
			t.Errorf("row %d changed beyond the flag: %+v -> %+v", i, before[i], a)
		}
	}
	if mains != 1 {
		t.Errorf("%d main Courses after Make main, want exactly 1", mains)
	}
	// The flag move changes the walk order of the planner and so replans: it publishes courses and mealSlots.
	got := strings.Join(drain(ch), "|")
	if !strings.Contains(got, `"courses"`) || !strings.Contains(got, `"mealSlots"`) {
		t.Errorf("events after Make main = %s, want household courses and mealSlots", got)
	}

	if r := admin.Patch(path("/api/courses/%d", side), map[string]any{"main": true}); r.Status != 200 {
		t.Errorf("Make main on the main Course = %d %s, want 200 (nothing to move)", r.Status, r.Body)
	}
}

func TestPatchCourseRefusals(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	main, side, starter := courseID(t, env, "Main"), courseID(t, env, "Side"), courseID(t, env, "Starter")
	wantError(t, "main false", admin.Patch(path("/api/courses/%d", main), map[string]any{"main": false}), 422, "validation_failed", "main", "")
	if r := admin.Post(path("/api/courses/%d/archive", starter), map[string]any{}); r.Status != 200 {
		t.Fatalf("archive = %d %s", r.Status, r.Body)
	}
	wantError(t, "main on an archived Course", admin.Patch(path("/api/courses/%d", starter), map[string]any{"main": true}), 422, "validation_failed", "main", "")
	wantError(t, "nothing to change", admin.Patch(path("/api/courses/%d", side), map[string]any{}), 422, "validation_failed", "name", "nothing_to_change")

	// Name and main together are one step: a taken name stops the flag from moving.
	wantError(t, "taken name with main", admin.Patch(path("/api/courses/%d", side), map[string]any{"name": "Main", "main": true}), 409, "course_name_taken", "", "")
	for _, c := range listCourses(t, admin, "") {
		if c.Main != (c.ID == main) {
			t.Errorf("a refused PATCH moved the main flag: %+v", c)
		}
	}
	// Renaming an archived Course is allowed.
	if r := admin.Patch(path("/api/courses/%d", starter), map[string]any{"name": "Antipasti"}); r.Status != 200 {
		t.Errorf("rename an archived Course = %d %s", r.Status, r.Body)
	}
}

func TestReorderCourses(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	ids := map[string]int64{}
	for _, c := range listCourses(t, admin, "") {
		ids[c.Name] = c.ID
	}
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	defer cancel()

	r := admin.Put("/api/courses/order", map[string]any{"ids": []int64{ids["Dessert"], ids["Main"], ids["Starter"], ids["Side"]}})
	var l listBody
	r.MustJSON(t, &l)
	if r.Status != 200 || !sameStrings(names(l.Courses), []string{"Dessert", "Main", "Starter", "Side"}) {
		t.Fatalf("reorder = %d %s", r.Status, r.Body)
	}
	if got := names(listCourses(t, admin, "")); !sameStrings(got, []string{"Dessert", "Main", "Starter", "Side"}) {
		t.Errorf("stored order = %v", got)
	}
	for _, c := range l.Courses {
		if c.Main != (c.Name == "Main") {
			t.Errorf("reordering moved the main flag: %+v", c)
		}
	}
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, `"courses"`) {
		t.Errorf("event = %s %s", topic, data)
	}

	// Every active Course once: a short, long, repeated or unknown list is refused and changes nothing.
	bad := map[string][]int64{
		"missing one": {ids["Main"], ids["Side"], ids["Starter"]},
		"repeated":    {ids["Main"], ids["Main"], ids["Side"], ids["Starter"], ids["Dessert"]},
		"unknown":     {ids["Main"], ids["Side"], ids["Starter"], 99999},
		"empty":       {},
	}
	for label, list := range bad {
		wantError(t, label, admin.Put("/api/courses/order", map[string]any{"ids": list}), 422, "validation_failed", "ids", "")
	}
	wantError(t, "no ids field", admin.Put("/api/courses/order", map[string]any{}), 422, "validation_failed", "ids", "")
	if got := names(listCourses(t, admin, "")); !sameStrings(got, []string{"Dessert", "Main", "Starter", "Side"}) {
		t.Errorf("a refused reorder changed the order: %v", got)
	}
}

func TestReorderListsOnlyActiveCoursesAndKeepsArchivedOnesAfterThem(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	ids := map[string]int64{}
	for _, c := range listCourses(t, admin, "") {
		ids[c.Name] = c.ID
	}
	if r := admin.Post(path("/api/courses/%d/archive", ids["Side"]), map[string]any{}); r.Status != 200 {
		t.Fatalf("archive = %d %s", r.Status, r.Body)
	}
	if r := admin.Put("/api/courses/order", map[string]any{"ids": []int64{ids["Dessert"], ids["Starter"], ids["Main"]}}); r.Status != 200 {
		t.Fatalf("reorder the active Courses = %d %s", r.Status, r.Body)
	}
	if got := names(listCourses(t, admin, "?archived=1")); !sameStrings(got, []string{"Dessert", "Starter", "Main", "Side"}) {
		t.Errorf("order with the archived Course = %v, want it last", got)
	}
	wantError(t, "archived id listed", admin.Put("/api/courses/order", map[string]any{"ids": []int64{ids["Main"], ids["Side"], ids["Starter"], ids["Dessert"]}}), 422, "validation_failed", "ids", "")
}
