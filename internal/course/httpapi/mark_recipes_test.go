package httpapi_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-32 (PC-07): POST /api/courses/{id}/recipes {recipeIds} marks Recipes with a Course from the Plan ("Mark Recipes as
// Dessert"). It adds the Course to each Recipe in one transaction with ONE replan and answers like every plan write:
// {marked, changes, undoToken?}. Any signed-in User may do it (Recipes are household content, like PUT /api/recipes/{id}).
// TEST-AUTHOR tests: the route does not exist yet, so every one fails on a 404 or 405 until it is built.

type markAnswer struct {
	Marked  int `json:"marked"`
	Changes []struct {
		Date     string `json:"date"`
		CourseID int64  `json:"courseId"`
		Before   *struct {
			RecipeName string `json:"recipeName"`
		} `json:"before"`
		After *struct {
			RecipeName string `json:"recipeName"`
		} `json:"after"`
	} `json:"changes"`
	UndoToken string `json:"undoToken"`
}

// markFixture: a Thursday Dinner serving Main and Side, attended by Anna; Roast (Main only), Peas and Greens (no Course yet).
type markFixture struct {
	main, side, dessert int64
	roast, peas, greens int64
	dinner              int64
}

func seedMark(t *testing.T, env *testkit.Env) markFixture {
	t.Helper()
	f := markFixture{main: courseID(t, env, "Main"), side: courseID(t, env, "Side"), dessert: courseID(t, env, "Dessert")}
	f.roast = seedRecipe(t, env, "Roast", f.main)
	f.peas = seedRecipe(t, env, "Peas")
	f.greens = seedRecipe(t, env, "Greens")
	f.dinner = seedSlot(t, env, 4, "Dinner", f.main, f.side)
	m := mustExec(t, env, `INSERT INTO members (name, colour, portion_factor, created_at) VALUES ('Anna','#fff',1,'2026-11-01T00:00:00Z')`)
	mustExec(t, env, `INSERT INTO meal_slot_attendees (slot_id, member_id) VALUES (?, ?)`, f.dinner, m)
	return f
}

func TestMarkRecipesIsOpenToAnyUserAndNotToAnonymous(t *testing.T) {
	env := testkit.Start(t)
	f := seedMark(t, env)
	p := path("/api/courses/%d/recipes", f.side)
	if r := env.Anonymous().Post(p, map[string]any{"recipeIds": []int64{f.peas}}); r.Status != 401 {
		t.Errorf("anonymous = %d, want 401", r.Status)
	}
	if r := env.LoginUser(t).Post(p, map[string]any{"recipeIds": []int64{f.peas}}); r.Status != 200 {
		t.Errorf("a plain User = %d %s, want 200", r.Status, r.Body)
	}
}

func TestMarkRecipesAddsTheCourseToEachRecipeAndReplansOnce(t *testing.T) {
	env := testkit.Start(t)
	f := seedMark(t, env)
	user := env.LoginUser(t)
	ch, cancel := env.App.Deps.Events.Subscribe()
	defer cancel()

	r := user.Post(path("/api/courses/%d/recipes", f.side), map[string]any{"recipeIds": []int64{f.peas, f.greens}})
	if r.Status != 200 {
		t.Fatalf("mark = %d %s", r.Status, r.Body)
	}
	var out markAnswer
	r.MustJSON(t, &out)
	if out.Marked != 2 {
		t.Errorf("marked = %d, want 2", out.Marked)
	}
	for _, id := range []int64{f.peas, f.greens} {
		if n := count(t, env, `SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, id, f.side); n != 1 {
			t.Errorf("Recipe %d has the Side Course %d times, want once", id, n)
		}
	}
	// The Recipes were not Side Recipes before, so the Thursday Side was empty and the replan now fills it (the change is PC-01's).
	filled := false
	for _, c := range out.Changes {
		if c.Date == "2026-11-12" && c.CourseID == f.side && c.Before == nil && c.After != nil && (c.After.RecipeName == "Peas" || c.After.RecipeName == "Greens") {
			filled = true
		}
	}
	if !filled {
		t.Errorf("changes = %+v, want the Thursday Side filled with Peas or Greens", out.Changes)
	}
	if out.UndoToken == "" {
		t.Errorf("a replan that changed the plan has an undoToken; the answer has none: %s", r.Body)
	}
	// Open screens refresh: the plan (household) and the Recipes lists.
	got := strings.Join(drain(ch), "\n")
	if !strings.Contains(got, "household") || !strings.Contains(got, "recipes") {
		t.Errorf("events = %q, want a household and a recipes event", got)
	}
}

func TestMarkRecipesAlreadyMarkedChangesNothing(t *testing.T) {
	env := testkit.Start(t)
	f := seedMark(t, env)
	user := env.LoginUser(t)
	mustExec(t, env, `INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, f.peas, f.side)
	r := user.Post(path("/api/courses/%d/recipes", f.side), map[string]any{"recipeIds": []int64{f.peas}})
	if r.Status != 200 {
		t.Fatalf("mark = %d %s", r.Status, r.Body)
	}
	var out markAnswer
	r.MustJSON(t, &out)
	if out.Marked != 0 || len(out.Changes) != 0 || out.UndoToken != "" {
		t.Errorf("answer = %+v, want marked 0, no changes and no undo token", out)
	}
	if n := count(t, env, `SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, f.peas, f.side); n != 1 {
		t.Errorf("Peas has the Side Course %d times, want once", n)
	}
}

func TestMarkRecipesRefusalsChangeNothing(t *testing.T) {
	env := testkit.Start(t)
	f := seedMark(t, env)
	user := env.LoginUser(t)
	p := path("/api/courses/%d/recipes", f.side)
	// One unknown id refuses the whole call: all or nothing.
	wantError(t, "unknown Recipe", user.Post(p, map[string]any{"recipeIds": []int64{f.peas, 99999}}), 422, "validation_failed", "recipeIds", "")
	wantError(t, "no Recipes", user.Post(p, map[string]any{"recipeIds": []int64{}}), 422, "validation_failed", "recipeIds", "")
	wantError(t, "no body", user.Post(p, map[string]any{}), 422, "validation_failed", "recipeIds", "")
	if r := user.Post("/api/courses/99999/recipes", map[string]any{"recipeIds": []int64{f.peas}}); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("unknown Course = %d %s, want 404 not_found", r.Status, r.ErrorCode())
	}
	if n := count(t, env, `SELECT count(*) FROM recipe_courses WHERE course_id = ?`, f.side); n != 0 {
		t.Errorf("a refused call marked %d Recipes with Side, want none", n)
	}
}

func TestMarkRecipesUndoIsOnePlanRestore(t *testing.T) {
	env := testkit.Start(t)
	f := seedMark(t, env)
	user := env.LoginUser(t)
	var out markAnswer
	user.Post(path("/api/courses/%d/recipes", f.side), map[string]any{"recipeIds": []int64{f.peas}}).MustJSON(t, &out)
	if out.UndoToken == "" {
		t.Fatal("no undo token")
	}
	if r := user.Post("/api/plan/restore", map[string]any{"undoToken": out.UndoToken}); r.Status != 200 {
		t.Fatalf("restore = %d %s", r.Status, r.Body)
	}
	if n := count(t, env, `SELECT count(*) FROM planned_meals WHERE course_id = ? AND date = '2026-11-12'`, f.side); n != 0 {
		t.Errorf("after Undo the Thursday Side holds %d meals, want none", n)
	}
}
