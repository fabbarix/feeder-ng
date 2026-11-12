package httpapi_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// Set / Pin / Confirm / Unpin / Swap / Cook preview per Course (spec §16 Plan).

func TestPutSetsAndPinsTheRecipeOfThatCourse(t *testing.T) {
	w := crsc2.New(t)
	w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	r := w.User.Put(path(w, crsc2.Today, w.Side, ""), map[string]any{"recipeId": beans})
	if !strings.Contains(string(r.Body), `"covered":[]`) {
		t.Errorf("a PUT answers covered as a list, [] when nothing is covered: %s", r.Body)
	}
	m := decodeMeal(t, r)
	if m.CourseID != w.Side || m.CourseName != "Side" || m.RecipeID != beans || !m.Pinned || m.State != "planned" {
		t.Errorf("meal = %+v", m)
	}
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE course_id = ? AND recipe_id = ? AND pinned = 1`, w.Side, beans); n != 1 {
		t.Errorf("%d pinned Side rows, want 1", n)
	}
	if c := courseOf(t, slotOf(t, w, crsc2.Today), w.Side); c.Meal == nil || !c.Meal.Pinned {
		t.Errorf("the plan shows the Side as %+v", c)
	}
}

func TestPutRefusals(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	salad := w.Recipe("Salad", crsc2.RecipeSpec{Courses: []int64{w.Main, w.Side}})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	old := w.Recipe("Old stew", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Exec(`UPDATE recipes SET archived = 1 WHERE id = ?`, old)
	w.Settle()
	do := func(date string, course int64, recipe int64) (status int, code string) {
		r := w.User.Put(path(w, date, course, ""), map[string]any{"recipeId": recipe})
		var e errBody
		_ = r.JSON(&e)
		return r.Status, e.Error.Code
	}
	check := func(label, date string, course, recipe int64, status int, code string) {
		t.Helper()
		if s, c := do(date, course, recipe); s != status || c != code {
			t.Errorf("%s = %d %s, want %d %s", label, s, c, status, code)
		}
	}
	check("a Recipe not marked with the Course", crsc2.Today, w.Side, roast, 422, "recipe_not_in_course")
	check("a Course the slot does not serve", crsc2.Today, w.Dessert, beans, 422, "course_not_in_slot")
	check("an unknown Course", crsc2.Today, 9999, beans, 422, "course_not_in_slot")
	check("an unknown Recipe", crsc2.Today, w.Side, 9999, 422, "unknown_recipe")
	check("an archived Recipe", crsc2.Today, w.Side, old, 422, "recipe_archived")
	check("a day that is over", "2026-11-02", w.Side, beans, 422, "in_past")
	check("no Meal Slot on that weekday", "2026-11-10", w.Side, beans, 404, "unknown_slot")
	if r := w.User.Put("/api/plan/"+crsc2.Today+"/"+itoa(w.Slot)+"/side", map[string]any{"recipeId": beans}); r.Status != 404 {
		t.Errorf("a Course id that is not a number = %d, want 404", r.Status)
	}

	w.Meal(crsc2.Today, w.Slot, w.Main, salad, "planned", false)
	check("a Recipe already in another Course of that slot and date", crsc2.Today, w.Side, salad, 409, "recipe_in_slot")
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "cooked", true)
	check("a Course that is already Cooked", crsc2.Today, w.Side, beans, 409, "already_resolved")
	if n := w.Count(`SELECT count(*) FROM planned_meals`); n != 2 {
		t.Errorf("%d rows after the refusals, want the 2 seeded ones", n)
	}
}

func TestPutWholeMealInTheMainCourseCoversTheRestAndRemovesWhatIsNotFixed(t *testing.T) {
	w := crsc2.New(t)
	w.AddCourseToSlot(w.Slot, w.Starter, false)
	w.AddCourseToSlot(w.Slot, w.Dessert, false)
	stew := w.Recipe("Beef stew", crsc2.RecipeSpec{Whole: true})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	soup := w.Recipe("Soup", crsc2.RecipeSpec{Courses: []int64{w.Starter}})
	tart := w.Recipe("Fruit tart", crsc2.RecipeSpec{Courses: []int64{w.Dessert}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)  // unpinned, unresolved: goes
	w.Meal(crsc2.Today, w.Slot, w.Starter, soup, "cooked", true)  // resolved: stays
	w.Meal(crsc2.Today, w.Slot, w.Dessert, tart, "planned", true) // Pinned: stays

	m := decodeMeal(t, w.User.Put(path(w, crsc2.Today, w.Main, ""), map[string]any{"recipeId": stew}))
	if m.CourseID != w.Main || !m.WholeMeal || len(m.Covered) != 1 || m.Covered[0] != w.Side {
		t.Errorf("meal = %+v, want covered [Side] only", m)
	}
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE course_id = ?`, w.Side); n != 0 {
		t.Errorf("the unpinned Side stays (%d rows)", n)
	}
	if w.MealState(crsc2.Today, w.Slot, w.Starter) != "cooked" || w.MealState(crsc2.Today, w.Slot, w.Dessert) != "planned" {
		t.Error("a Cooked Course and a Pinned Course are not covered and stay")
	}
	s := slotOf(t, w, crsc2.Today)
	if c := courseOf(t, s, w.Side); c.CoveredBy == nil || c.CoveredBy.RecipeID != stew || c.Meal != nil {
		t.Errorf("Side = %+v, want covered by the stew", c)
	}
	if c := courseOf(t, s, w.Dessert); c.CoveredBy != nil || c.Meal == nil {
		t.Errorf("Dessert = %+v, want its own row", c)
	}
}

// C3: the course-less PUT is gone (404, crs_c3_routes_test.go); the Main is set by its own id.
func TestPutOnTheMainCourseByItsIDIsOneCell(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	w.Settle()
	m := decodeMeal(t, w.User.Put(path(w, crsc2.Today, w.Main, ""), map[string]any{"recipeId": roast}))
	if m.CourseID != w.Main || m.CourseName != "Main" || !m.Pinned {
		t.Errorf("meal = %+v, want the main Course with its real id", m)
	}
	if w.MealState(crsc2.Today, w.Slot, w.Main) != "planned" {
		t.Error("no row for the main Course")
	}
	// Again: the same cell.
	if m2 := decodeMeal(t, w.User.Put(path(w, crsc2.Today, w.Main, ""), map[string]any{"recipeId": roast})); m2.CourseID != w.Main {
		t.Errorf("PUT with the main id = %+v", m2)
	}
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE course_id = ?`, w.Main); n != 1 {
		t.Errorf("%d main rows, want 1", n)
	}
}

func TestConfirmAndUnpinActOnOneCourse(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)

	m := decodeMeal(t, w.User.Post(path(w, crsc2.Today, w.Side, "/confirm"), nil))
	if m.CourseID != w.Side || !m.Pinned {
		t.Errorf("confirm = %+v", m)
	}
	if c := courseOf(t, slotOf(t, w, crsc2.Today), w.Main); c.Meal.Pinned {
		t.Error("confirming the Side pinned the Main too")
	}
	m = decodeMeal(t, w.User.Post(path(w, crsc2.Today, w.Side, "/unpin"), nil))
	if m.CourseID != w.Side || m.Pinned {
		t.Errorf("unpin = %+v", m)
	}
	// The Main by its own id (the old course-less paths answer 404 after C3, crs_c3_routes_test.go).
	if m := decodeMeal(t, w.User.Post(path(w, crsc2.Today, w.Main, "/confirm"), nil)); m.CourseID != w.Main || !m.Pinned {
		t.Errorf("confirm on the Main = %+v", m)
	}
	if m := decodeMeal(t, w.User.Post(path(w, crsc2.Today, w.Main, "/unpin"), nil)); m.CourseID != w.Main || m.Pinned {
		t.Errorf("unpin on the Main = %+v", m)
	}
	wantErr(t, "confirm a Course with no Planned Meal", w.User.Post(path(w, crsc2.Today, w.Dessert, "/confirm"), nil), 404, "not_found")
}

type altBody struct {
	RecipeID   int64     `json:"recipeId"`
	RecipeName string    `json:"recipeName"`
	WholeMeal  bool      `json:"wholeMeal"`
	Covers     []string  `json:"covers"`
	Relaxed    bool      `json:"relaxed"`
	Why        []whyBody `json:"why"`
}

func alternatives(t *testing.T, w *crsc2.World, course int64) (alts []altBody, raw []byte) {
	t.Helper()
	r := w.User.Get(path(w, crsc2.Today, course, "/alternatives"))
	if r.Status != 200 {
		t.Fatalf("alternatives = %d %s", r.Status, r.Body)
	}
	var out struct {
		Alternatives []altBody `json:"alternatives"`
	}
	r.MustJSON(t, &out)
	return out.Alternatives, r.Body
}

func TestSideAlternativesAreSideRecipesStrictOnesFirstThenRelaxed(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	side := crsc2.RecipeSpec{Courses: []int64{w.Side}}
	s1, s2, s3, s4 := w.Recipe("Beans", side), w.Recipe("Peas", side), w.Recipe("Carrots", side), w.Recipe("Leeks", side)
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, s1, "planned", false)
	w.Meal(crsc2.Yesterday, w.Slot, w.Side, s3, "cooked", true) // Carrots yesterday: inside the Cool-down

	alts, raw := alternatives(t, w, w.Side)
	noNull(t, raw, "covers")
	if len(alts) != 3 {
		t.Fatalf("alternatives = %+v, want 3", alts)
	}
	got := map[int64]bool{alts[0].RecipeID: true, alts[1].RecipeID: true}
	if !got[s2] || !got[s4] || alts[0].Relaxed || alts[1].Relaxed {
		t.Errorf("first two = %+v, want Peas and Leeks, strict", alts[:2])
	}
	last := alts[2]
	if last.RecipeID != s3 || !last.Relaxed || len(last.Why) == 0 {
		t.Fatalf("third = %+v, want Carrots, relaxed", last)
	}
	if chip := last.Why[len(last.Why)-1]; chip.Code != "cooldown_relaxed" || chip.Date != crsc2.Yesterday {
		t.Errorf("last chip = %+v, want cooldown_relaxed naming %s", chip, crsc2.Yesterday)
	}
	for _, a := range alts {
		if a.RecipeID == roast || a.RecipeID == s1 {
			t.Errorf("alternative %d is not a Side Recipe or is the current one", a.RecipeID)
		}
	}
}

func TestMainAlternativesTellWhichCoverTheOtherCourses(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	stew := w.Recipe("Beef stew", crsc2.RecipeSpec{Whole: true})
	curry := w.Recipe("Curry", crsc2.RecipeSpec{})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	alts, raw := alternatives(t, w, w.Main)
	noNull(t, raw, "covers")
	by := map[int64]altBody{}
	for _, a := range alts {
		by[a.RecipeID] = a
	}
	if a := by[stew]; !a.WholeMeal || len(a.Covers) != 1 || a.Covers[0] != "Side" {
		t.Errorf("the stew = %+v, want wholeMeal covering [Side]", a)
	}
	if a := by[curry]; a.WholeMeal || len(a.Covers) != 0 || a.Relaxed {
		t.Errorf("the curry = %+v, want an ordinary Recipe", a)
	}
	// The Main by its own id; the old course-less path answers 404 after C3 (crs_c3_routes_test.go).
	if r := w.User.Get(path(w, crsc2.Today, w.Main, "/alternatives")); r.Status != 200 || !strings.Contains(string(r.Body), "Beef stew") {
		t.Errorf("alternatives of the Main = %d %s", r.Status, r.Body)
	}
}

func TestAlternativesRefusals(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "cooked", true)
	wantErr(t, "a Course the slot does not serve", w.User.Get(path(w, crsc2.Today, w.Dessert, "/alternatives")), 422, "course_not_in_slot")
	wantErr(t, "a Cooked meal", w.User.Get(path(w, crsc2.Today, w.Main, "/alternatives")), 409, "not_swappable")
	wantErr(t, "no Meal Slot that day", w.User.Get("/api/plan/2026-11-10/"+itoa(w.Slot)+"/"+itoa(w.Side)+"/alternatives"), 404, "unknown_slot")
}

func TestCookPreviewIsThatCoursesProposalAndPortions(t *testing.T) {
	w := crsc2.New(t)
	w.OptOut(w.Slot, w.Side, w.Sam) // Sam skips the Side: it feeds Anna only
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Yield: 4})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)
	var p struct {
		Meal             mealBody `json:"meal"`
		Fresh            bool     `json:"fresh"`
		PortionsNeeded   float64  `json:"portionsNeeded"`
		ProposedLeftover float64  `json:"proposedLeftover"`
		MaxLeftover      float64  `json:"maxLeftover"`
	}
	r := w.User.Get(path(w, crsc2.Today, w.Side, "/cook"))
	if r.Status != 200 {
		t.Fatalf("cook preview = %d %s", r.Status, r.Body)
	}
	r.MustJSON(t, &p)
	if p.Meal.CourseID != w.Side || !p.Fresh || p.PortionsNeeded != 1 || p.ProposedLeftover != 3 || p.MaxLeftover != 4 {
		t.Errorf("Side preview = %+v, want 1 portion needed (the Course's Attendance), 3 proposed, 4 max", p)
	}
	r = w.User.Get(path(w, crsc2.Today, w.Main, "/cook"))
	r.MustJSON(t, &p)
	if r.Status != 200 || p.Meal.CourseID != w.Main || p.PortionsNeeded != 2 {
		t.Errorf("Main cook preview = %d %+v, want the main Course, 2 portions", r.Status, p)
	}
}

// The one exception to "one Recipe per slot and date" (docs/dev/design/crs-c2.md §7, decision 13): the other meal
// holds the same Recipe, is planned and unpinned, and its Course is walked after the target. The replan after the PUT
// clears that later Course, so the duplicate never survives. Swap can offer the main Course a Recipe the unpinned Side
// holds, which is why the PUT must accept it.
func TestPutAcceptsARecipeHeldByALaterUnpinnedPlannedCourseAndClearsIt(t *testing.T) {
	w := crsc2.New(t)
	salad := w.Recipe("Salad", crsc2.RecipeSpec{Courses: []int64{w.Main, w.Side}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Side, salad, "planned", false)

	m := decodeMeal(t, w.User.Put(path(w, crsc2.Today, w.Main, ""), map[string]any{"recipeId": salad}))
	if m.CourseID != w.Main || m.RecipeID != salad || !m.Pinned {
		t.Errorf("meal = %+v, want the Salad pinned in the Main", m)
	}
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE course_id = ? AND recipe_id = ?`, w.Side, salad); n != 0 {
		t.Errorf("the Side still holds the Salad (%d rows): one Recipe per slot is broken", n)
	}
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE course_id = ? AND recipe_id = ?`, w.Main, salad); n != 1 {
		t.Errorf("%d Main rows with the Salad, want 1", n)
	}
}

func TestPutRefusesARecipeHeldByALaterPinnedCourse(t *testing.T) {
	w := crsc2.New(t)
	salad := w.Recipe("Salad", crsc2.RecipeSpec{Courses: []int64{w.Main, w.Side}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Side, salad, "planned", true)

	wantErr(t, "a Recipe held by a Pinned later Course", w.User.Put(path(w, crsc2.Today, w.Main, ""), map[string]any{"recipeId": salad}), 409, "recipe_in_slot")
	if w.MealState(crsc2.Today, w.Slot, w.Side) != "planned" {
		t.Error("the Pinned Side changed")
	}
}

func TestPutRefusesARecipeHeldByALaterCookedCourse(t *testing.T) {
	w := crsc2.New(t)
	salad := w.Recipe("Salad", crsc2.RecipeSpec{Courses: []int64{w.Main, w.Side}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Side, salad, "cooked", true)

	r := w.User.Put(path(w, crsc2.Today, w.Main, ""), map[string]any{"recipeId": salad})
	wantErr(t, "a Recipe held by a Cooked later Course", r, 409, "recipe_in_slot")
	if w.MealState(crsc2.Today, w.Slot, w.Side) != "cooked" {
		t.Error("the Cooked Side changed")
	}
}
