package httpapi_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// fixture for Side: Recipes Greens (Side only) and Gratin (Main and Side); Dinner (Thursday, Main and Side)
// and Snack (Friday, Side only); Planned Meals and a Slot Rule on Side.
type sideFixture struct {
	main, side, starter, dessert int64
	greens, gratin               int64
	dinner, snack                int64
	ruleID                       int64
}

func seedSide(t *testing.T, env *testkit.Env) sideFixture {
	t.Helper()
	f := sideFixture{main: courseID(t, env, "Main"), side: courseID(t, env, "Side"), starter: courseID(t, env, "Starter"), dessert: courseID(t, env, "Dessert")}
	f.greens = seedRecipe(t, env, "Greens", f.side)
	f.gratin = seedRecipe(t, env, "Gratin", f.main, f.side)
	f.dinner = seedSlot(t, env, 4, "Dinner", f.main, f.side)
	f.snack = seedSlot(t, env, 5, "Snack", f.side)
	seedPlannedMeal(t, env, "2026-11-12", f.dinner, f.side, f.greens, "planned", true)  // Pinned, unresolved, ahead
	seedPlannedMeal(t, env, "2026-11-13", f.snack, f.side, f.gratin, "planned", false)  // unresolved, ahead
	seedPlannedMeal(t, env, "2026-11-19", f.dinner, f.side, f.gratin, "cooked", false)  // resolved: stays as history
	seedPlannedMeal(t, env, "2026-11-05", f.dinner, f.side, f.greens, "planned", false) // before today: stays
	// Somebody eats both Meal Slots, so a replan keeps their Side meals.
	m := mustExec(t, env, `INSERT INTO members (name, colour, portion_factor, created_at) VALUES ('Anna','#fff',1,'2026-11-01T00:00:00Z')`)
	mustExec(t, env, `INSERT INTO meal_slot_attendees (slot_id, member_id) VALUES (?, ?)`, f.dinner, m)
	mustExec(t, env, `INSERT INTO meal_slot_attendees (slot_id, member_id) VALUES (?, ?)`, f.snack, m)
	f.ruleID = seedSlotRule(t, env, f.dinner, f.side, f.greens)
	return f
}

func TestImpactNamesWhatARemovalChanges(t *testing.T) {
	env := testkit.Start(t)
	f := seedSide(t, env)
	seedPlannedMeal(t, env, "2026-11-12", f.dinner, f.main, f.gratin, "planned", false) // Main: not listed
	var im impactBody
	r := env.LoginUser(t).Get(path("/api/courses/%d/impact", f.side))
	r.MustJSON(t, &im)
	if r.Status != 200 {
		t.Fatalf("impact = %d %s", r.Status, r.Body)
	}
	if !im.Planned || im.Recipes != 2 || im.RecipesOnlyThis != 1 || im.MealSlots != 2 || im.MealSlotsOnlyThis != 1 {
		t.Errorf("counts = %+v, want planned, 2 Recipes (1 only this), 2 Meal Slots (1 only this)", im)
	}
	if len(im.PlannedMeals) != 2 {
		t.Fatalf("plannedMeals = %+v, want the two unresolved ones from today on", im.PlannedMeals)
	}
	first, second := im.PlannedMeals[0], im.PlannedMeals[1]
	if first.Date != "2026-11-12" || first.MealSlotID != f.dinner || first.MealSlotName != "Dinner" || first.RecipeID != f.greens || first.RecipeName != "Greens" || !first.Pinned {
		t.Errorf("first = %+v", first)
	}
	if second.Date != "2026-11-13" || second.MealSlotName != "Snack" || second.RecipeName != "Gratin" || second.Pinned {
		t.Errorf("second = %+v", second)
	}
	if len(im.SlotRules) != 1 || im.SlotRules[0].ID != f.ruleID || im.SlotRules[0].MealSlotID != f.dinner || im.SlotRules[0].RecipeName != "Greens" {
		t.Errorf("slotRules = %+v", im.SlotRules)
	}

	var empty impactBody
	env.LoginUser(t).Get(path("/api/courses/%d/impact", f.dessert)).MustJSON(t, &empty)
	if empty.Planned || empty.Recipes != 0 || empty.MealSlots != 0 || empty.PlannedMeals == nil || empty.SlotRules == nil {
		t.Errorf("an unused Course = %+v, want zero counts and empty (not null) lists", empty)
	}
	if r := env.LoginUser(t).Get("/api/courses/99999/impact"); r.Status != 404 {
		t.Errorf("unknown Course = %d, want 404", r.Status)
	}
}

func TestDeleteAnUnplannedCourseGivesItsOnlyOwnersTheReplacement(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	main, starter := courseID(t, env, "Main"), courseID(t, env, "Starter")
	soup := seedRecipe(t, env, "Soup", starter)
	both := seedRecipe(t, env, "Salad", main, starter)
	lunch := seedSlot(t, env, 2, "Lunch", starter)
	ch, cancel := env.App.Deps.Events.Subscribe()
	defer cancel()

	r := admin.Delete(path("/api/courses/%d?replacement=%d", starter, main))
	if r.Status != 204 {
		t.Fatalf("delete = %d %s", r.Status, r.Body)
	}
	if got := names(listCourses(t, admin, "?archived=1")); !sameStrings(got, []string{"Main", "Side", "Dessert"}) {
		t.Errorf("after delete (archived ones included) = %v: a Course that was never planned is removed for good", got)
	}
	if n := count(t, env, `SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, soup, main); n != 1 {
		t.Errorf("Soup did not get Main")
	}
	if n := count(t, env, `SELECT count(*) FROM recipe_courses WHERE recipe_id = ?`, both); n != 1 {
		t.Errorf("Salad (Main and Starter) has %d Courses, want only Main: the replacement goes to owners left with none", n)
	}
	if n := count(t, env, `SELECT count(*) FROM meal_slot_courses WHERE meal_slot_id = ? AND course_id = ?`, lunch, main); n != 1 {
		t.Errorf("Lunch did not get Main")
	}
	got := strings.Join(drain(ch), "|")
	for _, want := range []string{`household {"changed":"courses"}`, `household {"changed":"mealSlots"}`, `recipes `} {
		if !strings.Contains(got, want) {
			t.Errorf("events = %s, want %s among them (the plan is replanned and open Recipe and Meal Slot screens refresh)", got, want)
		}
	}
}

func TestDeleteNeedsNoReplacementWhenNobodyIsLeftWithoutACourse(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	dessert := courseID(t, env, "Dessert")
	if r := admin.Delete(path("/api/courses/%d", dessert)); r.Status != 204 {
		t.Errorf("delete an unused Course = %d %s, want 204", r.Status, r.Body)
	}
}

func TestDeleteRefusals(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	f := seedSide(t, env)
	soup := seedRecipe(t, env, "Soup", f.starter)
	del := func(id int64, q string) *testkit.Response { return admin.Delete(path("/api/courses/%d%s", id, q)) }

	wantError(t, "main", del(f.main, ""), 409, "course_main", "", "")
	wantError(t, "main with a replacement", del(f.main, path("?replacement=%d", f.side)), 409, "course_main", "", "")
	wantError(t, "planned (offer Archive)", del(f.side, path("?replacement=%d", f.main)), 409, "course_planned", "", "")
	// Starter is unused by any Planned Meal, but Soup would be left with no Course.
	wantError(t, "replacement missing", del(f.starter, ""), 422, "validation_failed", "replacement", "replacement_invalid")
	wantError(t, "replacement is the Course", del(f.starter, path("?replacement=%d", f.starter)), 422, "validation_failed", "replacement", "replacement_invalid")
	wantError(t, "replacement unknown", del(f.starter, "?replacement=99999"), 422, "validation_failed", "replacement", "replacement_invalid")
	wantError(t, "replacement not a number", del(f.starter, "?replacement=abc"), 422, "validation_failed", "replacement", "replacement_invalid")
	if r := admin.Post(path("/api/courses/%d/archive", f.dessert), map[string]any{}); r.Status != 200 {
		t.Fatalf("archive Dessert = %d %s", r.Status, r.Body)
	}
	wantError(t, "replacement archived", del(f.starter, path("?replacement=%d", f.dessert)), 422, "validation_failed", "replacement", "replacement_invalid")
	if r := del(99999, ""); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("unknown Course = %d %s", r.Status, r.Body)
	}

	// Nothing changed.
	if got := names(listCourses(t, admin, "")); !sameStrings(got, []string{"Main", "Side", "Starter"}) {
		t.Errorf("list = %v", got)
	}
	if n := count(t, env, `SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, soup, f.starter); n != 1 {
		t.Errorf("a refused delete changed Soup")
	}
	if n := count(t, env, `SELECT count(*) FROM planned_meals WHERE course_id = ? AND state = 'planned' AND date <= '2026-11-19'`, f.side); n != 3 {
		t.Errorf("a refused delete removed Planned Meals (%d left, want 3)", n)
	}
}

func TestArchiveTakesTheCourseOffEverythingAndKeepsHistory(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	f := seedSide(t, env)
	ch, cancel := env.App.Deps.Events.Subscribe()
	defer cancel()

	r := admin.Post(path("/api/courses/%d/archive", f.side), map[string]any{"replacementId": f.main})
	var c courseBody
	r.MustJSON(t, &c)
	if r.Status != 200 || c.ID != f.side || !c.Archived || c.Main {
		t.Fatalf("archive = %d %s", r.Status, r.Body)
	}
	if got := names(listCourses(t, admin, "")); !sameStrings(got, []string{"Main", "Starter", "Dessert"}) {
		t.Errorf("default list = %v", got)
	}
	if got := names(listCourses(t, admin, "?archived=1")); !sameStrings(got, []string{"Main", "Starter", "Dessert", "Side"}) {
		t.Errorf("list with archived = %v, want Side kept, last", got)
	}
	// Taken off every Recipe, Meal Slot and Slot Rule; the replacement goes to owners left with none.
	if n := count(t, env, `SELECT count(*) FROM recipe_courses WHERE course_id = ?`, f.side); n != 0 {
		t.Errorf("%d Recipes still marked Side", n)
	}
	if n := count(t, env, `SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, f.greens, f.main); n != 1 {
		t.Errorf("Greens (Side only) did not get Main")
	}
	if n := count(t, env, `SELECT count(*) FROM meal_slot_courses WHERE course_id = ?`, f.side); n != 0 {
		t.Errorf("%d Meal Slots still serve Side", n)
	}
	if n := count(t, env, `SELECT count(*) FROM meal_slot_courses WHERE meal_slot_id = ? AND course_id = ?`, f.snack, f.main); n != 1 {
		t.Errorf("Snack (Side only) did not get Main")
	}
	if n := count(t, env, `SELECT count(*) FROM slot_rules WHERE course_id = ?`, f.side); n != 0 {
		t.Errorf("the Slot Rule on Side stayed")
	}
	// Unresolved Planned Meals from today on go (Pinned ones too); history stays with the Course.
	if n := count(t, env, `SELECT count(*) FROM planned_meals WHERE course_id = ? AND state = 'planned' AND date >= '2026-11-09'`, f.side); n != 0 {
		t.Errorf("%d unresolved Side Planned Meals from today on stayed", n)
	}
	if n := count(t, env, `SELECT count(*) FROM planned_meals WHERE course_id = ?`, f.side); n != 2 {
		t.Errorf("Side keeps %d Planned Meals as history, want the cooked one and the one before today", n)
	}
	got := strings.Join(drain(ch), "|")
	for _, want := range []string{`household {"changed":"courses"}`, `household {"changed":"mealSlots"}`, `recipes `} {
		if !strings.Contains(got, want) {
			t.Errorf("events = %s, want %s among them", got, want)
		}
	}
}

func TestArchiveNeedsAReplacementOnlyWhenSomeoneWouldBeLeftWithNoCourse(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	f := seedSide(t, env)

	wantError(t, "needed", admin.Post(path("/api/courses/%d/archive", f.side), map[string]any{}), 422, "validation_failed", "replacement", "replacement_invalid")
	wantError(t, "the Course itself", admin.Post(path("/api/courses/%d/archive", f.side), map[string]any{"replacementId": f.side}), 422, "validation_failed", "replacement", "replacement_invalid")
	wantError(t, "unknown", admin.Post(path("/api/courses/%d/archive", f.side), map[string]any{"replacementId": 99999}), 422, "validation_failed", "replacement", "replacement_invalid")
	wantError(t, "main", admin.Post(path("/api/courses/%d/archive", f.main), map[string]any{"replacementId": f.side}), 409, "course_main", "", "")
	if r := admin.Post("/api/courses/99999/archive", map[string]any{}); r.Status != 404 {
		t.Errorf("unknown = %d", r.Status)
	}
	if got := names(listCourses(t, admin, "")); !sameStrings(got, []string{"Main", "Side", "Starter", "Dessert"}) {
		t.Errorf("a refused archive changed the list: %v", got)
	}

	// A never-planned, unused Course archives without a replacement, and stays in the archive (Delete would remove it).
	r := admin.Post(path("/api/courses/%d/archive", f.dessert), map[string]any{})
	if r.Status != 200 {
		t.Fatalf("archive Dessert = %d %s", r.Status, r.Body)
	}
	found := false
	for _, c := range listCourses(t, admin, "?archived=1") {
		found = found || (c.ID == f.dessert && c.Archived)
	}
	if !found {
		t.Errorf("Dessert is not in the archive")
	}
}

func TestUnarchiveCourseGoesLastWithoutRestoringAnything(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	f := seedSide(t, env)
	if r := admin.Post(path("/api/courses/%d/archive", f.side), map[string]any{"replacementId": f.main}); r.Status != 200 {
		t.Fatalf("archive = %d %s", r.Status, r.Body)
	}
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	defer cancel()

	r := admin.Post(path("/api/courses/%d/unarchive", f.side), nil)
	var c courseBody
	r.MustJSON(t, &c)
	if r.Status != 200 || c.ID != f.side || c.Archived || c.RecipeCount != 0 || c.MealSlotCount != 0 {
		t.Fatalf("unarchive = %d %s", r.Status, r.Body)
	}
	if got := names(listCourses(t, admin, "")); !sameStrings(got, []string{"Main", "Starter", "Dessert", "Side"}) {
		t.Errorf("list = %v, want Side back, last", got)
	}
	if n := count(t, env, `SELECT count(*) FROM recipe_courses WHERE course_id = ? AND recipe_id IN (?, ?)`, f.side, f.greens, f.gratin); n != 0 {
		t.Errorf("Unarchive put Side back on %d Recipes", n)
	}
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, `"courses"`) {
		t.Errorf("event = %s %s", topic, data)
	}
	if r := admin.Post("/api/courses/99999/unarchive", nil); r.Status != 404 {
		t.Errorf("unknown = %d", r.Status)
	}
}

func TestUnarchiveNeedsRoomAmongTheTwentyActiveCourses(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	starter := courseID(t, env, "Starter")
	if r := admin.Post(path("/api/courses/%d/archive", starter), map[string]any{}); r.Status != 200 {
		t.Fatalf("archive = %d %s", r.Status, r.Body)
	}
	for i := 1; i <= 17; i++ { // 3 active + 17 = 20
		if r := admin.Post("/api/courses", map[string]any{"name": path("Extra %d", i)}); r.Status != 201 {
			t.Fatalf("Extra %d = %d %s", i, r.Status, r.Body)
		}
	}
	wantError(t, "unarchive", admin.Post(path("/api/courses/%d/unarchive", starter), nil), 422, "too_many_courses", "", "")
}
