package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-32 (PC-07, main-session ruling 2): Undo of "Mark Recipes as Dessert" undoes what the action did. The Plan calls
// POST /api/courses/{id}/recipes/unmark {recipeIds} with the ids the mark answer listed in "markedIds": it takes the
// Course off those Recipes and replans, in one transaction, like the mark itself.

type unmarkAnswer struct {
	Unmarked    int     `json:"unmarked"`
	UnmarkedIDs []int64 `json:"unmarkedIds"`
	Changes     []struct {
		Date     string `json:"date"`
		CourseID int64  `json:"courseId"`
		Before   *struct {
			RecipeName string `json:"recipeName"`
		} `json:"before"`
		After *struct {
			RecipeName string `json:"recipeName"`
		} `json:"after"`
	} `json:"changes"`
}

func TestMarkRecipesAnswerListsTheNewlyMarkedIds(t *testing.T) {
	env := testkit.Start(t)
	f := seedMark(t, env)
	user := env.LoginUser(t)
	mustExec(t, env, `INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, f.peas, f.side)
	var out struct {
		Marked    int     `json:"marked"`
		MarkedIDs []int64 `json:"markedIds"`
	}
	r := user.Post(path("/api/courses/%d/recipes", f.side), map[string]any{"recipeIds": []int64{f.peas, f.greens}})
	if r.Status != 200 {
		t.Fatalf("mark = %d %s", r.Status, r.Body)
	}
	r.MustJSON(t, &out)
	if out.Marked != 1 || len(out.MarkedIDs) != 1 || out.MarkedIDs[0] != f.greens {
		t.Errorf("answer = %+v, want only Greens (%d) newly marked", out, f.greens)
	}
}

func TestUnmarkRecipesTakesTheCourseOffAndReplans(t *testing.T) {
	env := testkit.Start(t)
	f := seedMark(t, env)
	user := env.LoginUser(t)
	var marked markAnswer
	user.Post(path("/api/courses/%d/recipes", f.side), map[string]any{"recipeIds": []int64{f.peas}}).MustJSON(t, &marked)
	if n := count(t, env, `SELECT count(*) FROM planned_meals WHERE course_id = ? AND date = '2026-11-12'`, f.side); n != 1 {
		t.Fatalf("after marking, the Thursday Side holds %d meals, want 1", n)
	}
	ch, cancel := env.App.Deps.Events.Subscribe()
	defer cancel()

	r := user.Post(path("/api/courses/%d/recipes/unmark", f.side), map[string]any{"recipeIds": []int64{f.peas}})
	if r.Status != 200 {
		t.Fatalf("unmark = %d %s", r.Status, r.Body)
	}
	var out unmarkAnswer
	r.MustJSON(t, &out)
	if out.Unmarked != 1 || len(out.UnmarkedIDs) != 1 || out.UnmarkedIDs[0] != f.peas {
		t.Errorf("answer = %+v, want Peas unmarked", out)
	}
	if n := count(t, env, `SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, f.peas, f.side); n != 0 {
		t.Errorf("Peas still has the Side Course")
	}
	if n := count(t, env, `SELECT count(*) FROM planned_meals WHERE course_id = ? AND date = '2026-11-12'`, f.side); n != 0 {
		t.Errorf("after the unmark the Thursday Side holds %d meals, want none (no Side Recipe is left)", n)
	}
	emptied := false
	for _, c := range out.Changes {
		if c.Date == "2026-11-12" && c.CourseID == f.side && c.Before != nil && c.Before.RecipeName == "Peas" && c.After == nil {
			emptied = true
		}
	}
	if !emptied {
		t.Errorf("changes = %+v, want the Thursday Side emptied", out.Changes)
	}
	got := drain(ch)
	seen := map[string]bool{}
	for _, e := range got {
		for _, topic := range []string{"household", "recipes", "plan"} {
			if len(e) > len(topic) && e[:len(topic)+1] == topic+" " {
				seen[topic] = true
			}
		}
	}
	if !seen["household"] || !seen["recipes"] || !seen["plan"] {
		t.Errorf("events = %q, want household, recipes and plan", got)
	}
}

func TestUnmarkRecipesSkipsRecipesWithoutTheCourse(t *testing.T) {
	env := testkit.Start(t)
	f := seedMark(t, env)
	user := env.LoginUser(t)
	r := user.Post(path("/api/courses/%d/recipes/unmark", f.side), map[string]any{"recipeIds": []int64{f.greens}})
	if r.Status != 200 {
		t.Fatalf("unmark = %d %s", r.Status, r.Body)
	}
	var out unmarkAnswer
	r.MustJSON(t, &out)
	if out.Unmarked != 0 || len(out.UnmarkedIDs) != 0 || len(out.Changes) != 0 {
		t.Errorf("answer = %+v, want nothing unmarked and no changes", out)
	}
	// The Recipe's other Courses stay.
	if n := count(t, env, `SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, f.roast, f.main); n != 1 {
		t.Errorf("Roast lost its Main Course")
	}
}

func TestUnmarkRecipesRefusalsChangeNothing(t *testing.T) {
	env := testkit.Start(t)
	f := seedMark(t, env)
	user := env.LoginUser(t)
	mustExec(t, env, `INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, f.peas, f.side)
	p := path("/api/courses/%d/recipes/unmark", f.side)
	if r := env.Anonymous().Post(p, map[string]any{"recipeIds": []int64{f.peas}}); r.Status != 401 {
		t.Errorf("anonymous = %d, want 401", r.Status)
	}
	wantError(t, "unknown Recipe", user.Post(p, map[string]any{"recipeIds": []int64{f.peas, 99999}}), 422, "validation_failed", "recipeIds", "")
	wantError(t, "no Recipes", user.Post(p, map[string]any{"recipeIds": []int64{}}), 422, "validation_failed", "recipeIds", "")
	if r := user.Post("/api/courses/99999/recipes/unmark", map[string]any{"recipeIds": []int64{f.peas}}); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("unknown Course = %d %s, want 404 not_found", r.Status, r.ErrorCode())
	}
	if n := count(t, env, `SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, f.peas, f.side); n != 1 {
		t.Errorf("a refused call unmarked Peas")
	}
}
