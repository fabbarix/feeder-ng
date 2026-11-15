package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B9-38 (PC-10, user decision): "Other Recipes" in Choose a Recipe. The plan PUT for a Course takes an optional
// `markCourse: true`: the Recipe is marked with that Course and set there in one write (one transaction, one replan);
// without it the 422 recipe_not_in_course stays. The write's Undo restores the plan; the Recipe stays marked.

func TestPutWithMarkCourseMarksTheRecipeAndSetsTheMealInOneWrite(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	before := w.Count(`SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, roast, w.Side)
	if before != 0 {
		t.Fatalf("roast is already marked as Side")
	}
	r := w.User.Put(path(w, crsc2.Today, w.Side, ""), map[string]any{"recipeId": roast, "markCourse": true})
	m := decodeMeal(t, r)
	if m.CourseID != w.Side || m.RecipeID != roast || !m.Pinned || m.State != "planned" {
		t.Errorf("meal = %+v, want roast Pinned in the Side", m)
	}
	if n := w.Count(`SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, roast, w.Side); n != 1 {
		t.Errorf("roast marked as Side %d times, want 1", n)
	}
	var body struct {
		UndoToken string `json:"undoToken"`
	}
	r.MustJSON(t, &body)
	if body.UndoToken == "" {
		t.Fatalf("no undoToken: %s", r.Body)
	}
	if res := w.User.Post("/api/plan/restore", map[string]any{"undoToken": body.UndoToken}); res.Status != 200 {
		t.Fatalf("restore = %d %s", res.Status, res.Body)
	}
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE date = ? AND meal_slot_id = ? AND course_id = ? AND recipe_id = ?`, crsc2.Today, w.Slot, w.Side, roast); n != 0 {
		t.Errorf("after Undo the Side still has roast (%d rows)", n)
	}
	if n := w.Count(`SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, roast, w.Side); n != 1 {
		t.Errorf("after Undo roast is marked as Side %d times, want 1 (the mark stays)", n)
	}
}

func TestPutWithoutMarkCourseStillRefusesARecipeNotMarkedWithTheCourse(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	w.Settle()
	for _, body := range []map[string]any{{"recipeId": roast}, {"recipeId": roast, "markCourse": false}} {
		wantErr(t, "no markCourse", w.User.Put(path(w, crsc2.Today, w.Side, ""), body), 422, "recipe_not_in_course")
	}
	if n := w.Count(`SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, roast, w.Side); n != 0 {
		t.Errorf("a refused PUT marked roast as Side")
	}
}

func TestARefusedPutWithMarkCourseMarksNothing(t *testing.T) {
	w := crsc2.New(t)
	old := w.Recipe("Old stew", crsc2.RecipeSpec{})
	w.Exec(`UPDATE recipes SET archived = 1 WHERE id = ?`, old)
	w.Settle()
	// An archived Recipe is refused after the mark was made inside the write: the mark is rolled back with it.
	wantErr(t, "archived", w.User.Put(path(w, crsc2.Today, w.Side, ""), map[string]any{"recipeId": old, "markCourse": true}), 422, "recipe_archived")
	if n := w.Count(`SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, old, w.Side); n != 0 {
		t.Errorf("a refused PUT left the archived Recipe marked as Side")
	}
}
