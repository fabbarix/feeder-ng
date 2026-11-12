package httpapi_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// Team C2: the cooking timeline of a slot and the single-Course Cook view (spec §11, §16 Cook Mode;
// docs/dev/design/crs-c2.md §5). The fixture is internal/testkit/crsc2: the Monday Dinner of 2026-11-09 at 19:00,
// Main then Side. Scopes: until C3 the main Course's scope keeps the two-part form (crs-plan §2.2, the cook store
// shim); every other Course is three-part. The C3 clean-up flips those expectations.

type useBody struct {
	IngredientID int64   `json:"ingredientId"`
	Ingredient   string  `json:"ingredient"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit"`
}

type timerBody struct {
	Label           string `json:"label"`
	DurationSeconds int    `json:"durationSeconds"`
}

type itemBody struct {
	CourseID        int64      `json:"courseId"`
	Scope           string     `json:"scope"`
	Kind            string     `json:"kind"`
	Step            *int       `json:"step"`
	Number          int        `json:"number"`
	Text            string     `json:"text"`
	DurationMinutes int        `json:"durationMinutes"`
	StartSeconds    int        `json:"startSeconds"`
	EndSeconds      int        `json:"endSeconds"`
	Uses            []useBody  `json:"uses"`
	ImageURL        string     `json:"imageUrl"`
	Timer           *timerBody `json:"timer"`
	After           []int      `json:"after"`
}

type advanceBody struct {
	CourseID        int64   `json:"courseId"`
	Scope           string  `json:"scope"`
	Step            int     `json:"step"`
	Text            string  `json:"text"`
	LeadTimeMinutes int     `json:"leadTimeMinutes"`
	Done            bool    `json:"done"`
	DoneAt          *string `json:"doneAt"`
	Warning         bool    `json:"warning"`
}

type tlCourse struct {
	CourseID      int64   `json:"courseId"`
	Name          string  `json:"name"`
	RecipeID      int64   `json:"recipeId"`
	RecipeName    string  `json:"recipeName"`
	Scope         string  `json:"scope"`
	Batches       float64 `json:"batches"`
	Fresh         bool    `json:"fresh"`
	State         string  `json:"state"`
	ReheatSeconds *int    `json:"reheatSeconds"`
}

type timelineBody struct {
	Date         string        `json:"date"`
	MealSlotID   int64         `json:"mealSlotId"`
	SlotName     string        `json:"slotName"`
	Time         string        `json:"time"`
	StartAt      string        `json:"startAt"`
	TotalMinutes int           `json:"totalMinutes"`
	Courses      []tlCourse    `json:"courses"`
	Advance      []advanceBody `json:"advance"`
	Items        []itemBody    `json:"items"`
}

type errBody struct {
	Error struct {
		Code string `json:"code"`
	} `json:"error"`
}

func slotPath(w *crsc2.World, suffix string) string {
	return "/api/cook/meals/" + crsc2.Today + "/" + id(w.Slot) + suffix
}

func id(n int64) string { return itoa(n) }

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for ; n > 0; n /= 10 {
		b = append([]byte{byte('0' + n%10)}, b...)
	}
	return string(b)
}

func timeline(t *testing.T, w *crsc2.World) timelineBody {
	t.Helper()
	r := w.User.Get(slotPath(w, "/all"))
	if r.Status != 200 {
		t.Fatalf("GET timeline = %d %s", r.Status, r.Body)
	}
	for _, key := range []string{"items", "advance", "courses"} {
		if strings.Contains(string(r.Body), `"`+key+`":null`) {
			t.Errorf("%q is null; want []", key)
		}
	}
	var tl timelineBody
	r.MustJSON(t, &tl)
	return tl
}

func wantErr(t *testing.T, label string, r *testkit.Response, status int, code string) {
	t.Helper()
	var e errBody
	_ = r.JSON(&e)
	if r.Status != status || e.Error.Code != code {
		t.Errorf("%s = %d %s, want %d %s", label, r.Status, r.Body, status, code)
	}
}

func mainScope(w *crsc2.World) string { return "meal:" + crsc2.Today + "/" + id(w.Slot) }
func sideScope(w *crsc2.World) string { return mainScope(w) + "/" + id(w.Side) }

func twoCourses(t *testing.T) (w *crsc2.World, roast, beans int64) {
	t.Helper()
	w = crsc2.New(t)
	beansIng := w.Ingredient("beans")
	roast = w.Recipe("Roast chicken", crsc2.RecipeSpec{Steps: []crsc2.Step{{Text: "Roast", Kind: "active", Minutes: 20}}})
	beans = w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Steps: []crsc2.Step{
		{Text: "Boil", Kind: "active", Minutes: 10, UseGrams: map[int64]float64{beansIng: 100}}}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)
	return w, roast, beans
}

func TestTimelineInterleavesTheCoursesSoThatTheCookNeverHasTwoActiveStepsAndAllAreReadyTogether(t *testing.T) {
	w, roast, beans := twoCourses(t)
	w.Exec(`UPDATE planned_meals SET batches = 2 WHERE course_id = ?`, w.Side)
	tl := timeline(t, w)

	if tl.Date != crsc2.Today || tl.MealSlotID != w.Slot || tl.SlotName != "Dinner" || tl.Time != "19:00" {
		t.Errorf("header = %+v", tl)
	}
	// 20 min of Roast and 10 min of Boil are both Active: one cook, so 30 minutes, started at 18:30.
	if tl.TotalMinutes != 30 || tl.StartAt != "2026-11-09T18:30:00Z" {
		t.Errorf("totalMinutes %d startAt %q, want 30 and 18:30Z", tl.TotalMinutes, tl.StartAt)
	}
	if len(tl.Items) != 2 {
		t.Fatalf("items = %+v", tl.Items)
	}
	boil, roastIt := tl.Items[0], tl.Items[1]
	if boil.CourseID != w.Side || boil.Scope != sideScope(w) || boil.Kind != "active" || boil.Step == nil || *boil.Step != 0 ||
		boil.Number != 1 || boil.Text != "Boil" || boil.DurationMinutes != 10 || boil.StartSeconds != 0 || boil.EndSeconds != 600 {
		t.Errorf("first item = %+v, want the Side's Boil at 0..600 s", boil)
	}
	if len(boil.Uses) != 1 || boil.Uses[0].Ingredient != "beans" || boil.Uses[0].Quantity != 200 || boil.Uses[0].Unit != "g" {
		t.Errorf("uses = %+v, want 100 g scaled by the Side's 2 Batches", boil.Uses)
	}
	if roastIt.CourseID != w.Main || roastIt.Scope != mainScope(w) || roastIt.Number != 2 || roastIt.Text != "Roast" ||
		roastIt.StartSeconds != 600 || roastIt.EndSeconds != 1800 || boil.Timer != nil || roastIt.Timer != nil {
		t.Errorf("second item = %+v, want the Main's Roast at 600..1800 s and no timers on Active Steps", roastIt)
	}
	if boil.After == nil || roastIt.After == nil {
		t.Error("after must be [], never null")
	}
	if len(tl.Courses) != 2 {
		t.Fatalf("courses = %+v", tl.Courses)
	}
	if c := tl.Courses[0]; c.CourseID != w.Main || c.Name != "Main" || c.RecipeID != roast || c.RecipeName != "Roast chicken" || c.Scope != mainScope(w) || c.Batches != 1 || !c.Fresh || c.State != "planned" || c.ReheatSeconds != nil {
		t.Errorf("main course = %+v", c)
	}
	if c := tl.Courses[1]; c.CourseID != w.Side || c.RecipeID != beans || c.Scope != sideScope(w) || c.Batches != 2 {
		t.Errorf("side course = %+v", c)
	}
}

func TestTimelineNamesTheRecipeInATimerLabelOnlyWhenThereIsMoreThanOneCourse(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{Steps: []crsc2.Step{{Text: "Roast", Kind: "active", Minutes: 20}}})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Steps: []crsc2.Step{
		{Text: "Prep", Kind: "active", Minutes: 5},
		{Text: "Simmer", Kind: "passive", Minutes: 15, After: []int{0}},
	}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)

	tl := timeline(t, w)
	// Both Courses last 20 min. The Main goes last-placed-first: it ends at the slot time; the Side's Prep must clear
	// the Roast, so the Side block starts 25 min before the slot and its Simmer overlaps the Roast.
	if tl.TotalMinutes != 25 || len(tl.Items) != 3 {
		t.Fatalf("totalMinutes %d items %+v, want 25 and three items", tl.TotalMinutes, tl.Items)
	}
	want := []struct {
		course     int64
		text, kind string
		start, end int
	}{
		{w.Side, "Prep", "active", 0, 300},
		{w.Main, "Roast", "active", 300, 1500},
		{w.Side, "Simmer", "passive", 300, 1200}, // ties by the slot's Course order: Main before Side
	}
	for i, x := range want {
		g := tl.Items[i]
		if g.CourseID != x.course || g.Text != x.text || g.Kind != x.kind || g.StartSeconds != x.start || g.EndSeconds != x.end || g.Number != i+1 {
			t.Errorf("item %d = %+v, want %+v", i, g, x)
		}
	}
	simmer := tl.Items[2]
	if simmer.Timer == nil || simmer.Timer.Label != "Green beans · Simmer" || simmer.Timer.DurationSeconds != 900 || simmer.Step == nil || *simmer.Step != 1 || len(simmer.After) != 1 || simmer.After[0] != 0 {
		t.Errorf("Simmer = %+v, want a timer labelled with the Recipe and after [0]", simmer)
	}

	// One fresh Course left: the Recipe's own schedule, with the label the single-Course view uses.
	w.Exec(`UPDATE planned_meals SET state = 'cooked' WHERE course_id = ?`, w.Main)
	tl = timeline(t, w)
	if tl.TotalMinutes != 20 || len(tl.Items) != 2 || tl.Items[1].Timer == nil || tl.Items[1].Timer.Label != "Step 2: Simmer" {
		t.Errorf("one Course: total %d items %+v, want 20 and the plain label \"Step 2: Simmer\"", tl.TotalMinutes, tl.Items)
	}
}

func TestTimelineHasOneReheatItemPerLeftoverCourseWithTheReheatTimerLength(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{Steps: []crsc2.Step{{Text: "Roast", Kind: "active", Minutes: 20}}})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Steps: []crsc2.Step{{Text: "Boil", Kind: "active", Minutes: 10}}})
	w.Settle()
	w.Meal(crsc2.Yesterday, w.Slot, w.Side, beans, "cooked", true)
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.LeftoverMeal(crsc2.Today, w.Slot, w.Side, beans, crsc2.Yesterday, w.Slot, w.Side) // 2 portions: 120 s + 60 s

	tl := timeline(t, w)
	if tl.TotalMinutes != 20 || len(tl.Items) != 2 {
		t.Fatalf("total %d items %+v, want 20 and the Roast plus one Reheat", tl.TotalMinutes, tl.Items)
	}
	re := tl.Items[1]
	if re.CourseID != w.Side || re.Kind != "reheat" || re.Step != nil || re.Text != "Reheat Green beans" || re.DurationMinutes != 3 ||
		re.StartSeconds != 1020 || re.EndSeconds != 1200 || re.Scope != sideScope(w) {
		t.Errorf("reheat item = %+v, want 3 minutes ending with the slot", re)
	}
	if re.Timer == nil || re.Timer.Label != "Reheat" || re.Timer.DurationSeconds != 180 {
		t.Errorf("reheat timer = %+v, want the Reheat screen's free timer \"Reheat\" of 180 s", re.Timer)
	}
	if c := tl.Courses[1]; c.Fresh || c.ReheatSeconds == nil || *c.ReheatSeconds != 180 {
		t.Errorf("side course = %+v, want not fresh with reheatSeconds 180", c)
	}
	// The Recipe's own Reheat time wins (cook.DefaultReheatSeconds), here 5 minutes.
	w.Exec(`UPDATE recipes SET reheat_minutes = 5 WHERE id = ?`, beans)
	if re := timeline(t, w).Items[1]; re.DurationMinutes != 5 || re.Timer.DurationSeconds != 300 {
		t.Errorf("reheat with a Recipe Reheat time = %+v, want 5 minutes", re)
	}
}

func TestTimelineHasOneServeItemForAFreshCourseWithoutSteps(t *testing.T) {
	w := crsc2.New(t)
	w.AddCourseToSlot(w.Slot, w.Dessert, false)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{Steps: []crsc2.Step{{Text: "Roast", Kind: "active", Minutes: 20}}})
	tiramisu := w.Recipe("Tiramisu", crsc2.RecipeSpec{Courses: []int64{w.Dessert}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Dessert, tiramisu, "planned", false)
	tl := timeline(t, w)
	if tl.TotalMinutes != 20 || len(tl.Items) != 2 {
		t.Fatalf("total %d items %+v", tl.TotalMinutes, tl.Items)
	}
	s := tl.Items[1]
	if s.CourseID != w.Dessert || s.Kind != "serve" || s.Step != nil || s.Text != "Tiramisu: ready to serve" || s.DurationMinutes != 0 || s.StartSeconds != 1200 || s.EndSeconds != 1200 {
		t.Errorf("serve item = %+v, want a zero-length item at the slot time", s)
	}
}

func TestTimelineListsResolvedCoursesWithoutItemsAndRefusesWhenNothingIsLeft(t *testing.T) {
	w, _, _ := twoCourses(t)
	w.Exec(`UPDATE planned_meals SET state = 'cooked' WHERE course_id = ?`, w.Main)
	tl := timeline(t, w)
	if len(tl.Courses) != 2 || tl.Courses[0].State != "cooked" || tl.Courses[1].State != "planned" {
		t.Errorf("courses = %+v, want Main cooked and Side planned", tl.Courses)
	}
	for _, it := range tl.Items {
		if it.CourseID == w.Main {
			t.Errorf("a Cooked Course has an item: %+v", it)
		}
	}
	if tl.TotalMinutes != 10 {
		t.Errorf("totalMinutes = %d, want the Side's 10", tl.TotalMinutes)
	}
	w.Exec(`UPDATE planned_meals SET state = 'skipped' WHERE course_id = ?`, w.Side)
	wantErr(t, "nothing left to cook", w.User.Get(slotPath(w, "/all")), 409, "not_cookable")
}

func TestTimelineRefusals(t *testing.T) {
	w, _, _ := twoCourses(t)
	wantErr(t, "a day with no Planned Meal", w.User.Get("/api/cook/meals/2026-11-02/"+id(w.Slot)+"/all"), 404, "not_found")
	wantErr(t, "an unknown slot", w.User.Get("/api/cook/meals/"+crsc2.Today+"/9999/all"), 404, "not_found")
	wantErr(t, "a bad date", w.User.Get("/api/cook/meals/yesterday/"+id(w.Slot)+"/all"), 404, "not_found")
	if r := w.Env.Anonymous().Get(slotPath(w, "/all")); r.Status != 401 {
		t.Errorf("anonymous = %d, want 401", r.Status)
	}
}

func TestTimelineListsTheAdvanceStepsOfEveryFreshCourseAndMarksCountPerCourse(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{Steps: []crsc2.Step{
		{Text: "Marinate", Kind: "advance", Lead: 120}, {Text: "Roast", Kind: "active", Minutes: 20}}})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Steps: []crsc2.Step{
		{Text: "Soak", Kind: "advance", Lead: 60}, {Text: "Boil", Kind: "active", Minutes: 10}}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)

	tl := timeline(t, w)
	if len(tl.Advance) != 2 {
		t.Fatalf("advance = %+v", tl.Advance)
	}
	if a := tl.Advance[0]; a.CourseID != w.Main || a.Scope != mainScope(w) || a.Step != 0 || a.Text != "Marinate" || a.LeadTimeMinutes != 120 || a.Done || a.DoneAt != nil || !a.Warning {
		t.Errorf("first = %+v", a)
	}
	if a := tl.Advance[1]; a.CourseID != w.Side || a.Scope != sideScope(w) || a.Text != "Soak" || a.LeadTimeMinutes != 60 {
		t.Errorf("second = %+v", a)
	}
	// Advance Steps are outside the timeline: the items are the two Active Steps, numbered from 1, Recipe indexes 1.
	if len(tl.Items) != 2 || *tl.Items[0].Step != 1 || *tl.Items[1].Step != 1 {
		t.Errorf("items = %+v", tl.Items)
	}
	if r := w.User.Put("/api/cook/marks", map[string]any{"scope": sideScope(w), "step": 0, "done": true}); r.Status != 200 {
		t.Fatalf("mark = %d %s", r.Status, r.Body)
	}
	tl = timeline(t, w)
	if a := tl.Advance[1]; !a.Done || a.DoneAt == nil || a.Warning {
		t.Errorf("Side's Soak after the mark = %+v", a)
	}
	if a := tl.Advance[0]; a.Done {
		t.Errorf("Main's Marinate was marked by the Side's mark: %+v", a)
	}
}

func TestSingleCourseViewIsThatCoursesRecipeScopeAndCourse(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{Steps: []crsc2.Step{{Text: "Roast", Kind: "active", Minutes: 20}}})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Steps: []crsc2.Step{
		{Text: "Soak", Kind: "advance", Lead: 60},
		{Text: "Prep", Kind: "active", Minutes: 5},
		{Text: "Simmer", Kind: "passive", Minutes: 15, After: []int{1}}}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)

	type view struct {
		Scope      string `json:"scope"`
		RecipeID   int64  `json:"recipeId"`
		RecipeName string `json:"recipeName"`
		Meal       struct {
			Date       string `json:"date"`
			MealSlotID int64  `json:"mealSlotId"`
			SlotName   string `json:"slotName"`
			CourseID   int64  `json:"courseId"`
			CourseName string `json:"courseName"`
		} `json:"meal"`
		Advance []advanceBody `json:"advance"`
		Steps   []struct {
			Index  int        `json:"index"`
			Number int        `json:"number"`
			Of     int        `json:"of"`
			Text   string     `json:"text"`
			Timer  *timerBody `json:"timer"`
		} `json:"steps"`
	}
	get := func(course int64) (view, string) {
		r := w.User.Get(slotPath(w, "/"+id(course)))
		if r.Status != 200 {
			t.Fatalf("GET single Course %d = %d %s", course, r.Status, r.Body)
		}
		var v view
		r.MustJSON(t, &v)
		return v, string(r.Body)
	}
	side, raw := get(w.Side)
	if side.Scope != sideScope(w) || side.RecipeID != beans || side.Meal.CourseID != w.Side || side.Meal.CourseName != "Side" || side.Meal.SlotName != "Dinner" {
		t.Errorf("side view = %+v", side)
	}
	if strings.Contains(raw, "otherCourses") || strings.Contains(raw, `"items"`) {
		t.Errorf("the single-Course view carries no otherCourses and no timeline items: %s", raw)
	}
	if len(side.Steps) != 2 || side.Steps[0].Text != "Prep" || side.Steps[0].Number != 1 || side.Steps[0].Of != 2 || side.Steps[1].Timer == nil || side.Steps[1].Timer.Label != "Step 2: Simmer" {
		t.Errorf("steps = %+v, want the Recipe's own order and numbering", side.Steps)
	}
	if len(side.Advance) != 1 || side.Advance[0].Text != "Soak" {
		t.Errorf("advance = %+v", side.Advance)
	}
	main, _ := get(w.Main)
	if main.RecipeID != roast || main.Scope != mainScope(w) || main.Meal.CourseID != w.Main || main.Meal.CourseName != "Main" {
		t.Errorf("main view = %+v, want the real main Course id and the (transitional) two-part scope", main)
	}
	// The two-part route stays the main Course's single view while the SPA moves over; it is never the timeline.
	r := w.User.Get(slotPath(w, ""))
	var old view
	r.MustJSON(t, &old)
	if r.Status != 200 || old.RecipeID != roast || old.Meal.CourseID != w.Main || strings.Contains(string(r.Body), `"items"`) {
		t.Errorf("two-part route = %d %s, want the main Course's single view", r.Status, r.Body)
	}
}

func TestSingleCourseViewRefusals(t *testing.T) {
	w, _, beans := twoCourses(t)
	w.Exec(`UPDATE planned_meals SET state = 'cooked' WHERE course_id = ?`, w.Main)
	wantErr(t, "a Cooked Course", w.User.Get(slotPath(w, "/"+id(w.Main))), 409, "not_cookable")
	wantErr(t, "a Course with no Planned Meal", w.User.Get(slotPath(w, "/"+id(w.Dessert))), 404, "not_found")
	wantErr(t, "a Course id that is not a number", w.User.Get(slotPath(w, "/side")), 404, "not_found")
	w.Exec(`DELETE FROM planned_meals WHERE course_id = ?`, w.Side)
	w.Meal(crsc2.Yesterday, w.Slot, w.Side, beans, "cooked", true)
	w.LeftoverMeal(crsc2.Today, w.Slot, w.Side, beans, crsc2.Yesterday, w.Slot, w.Side)
	wantErr(t, "a Course served from a Leftover", w.User.Get(slotPath(w, "/"+id(w.Side))), 409, "not_cookable")
}

func TestTimersAndMarksUseTheScopeOfTheirCourse(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{Steps: []crsc2.Step{
		{Text: "Prep", Kind: "active", Minutes: 5}, {Text: "Rest", Kind: "passive", Minutes: 10, After: []int{0}}}})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Steps: []crsc2.Step{
		{Text: "Soak", Kind: "advance", Lead: 60}, {Text: "Prep", Kind: "active", Minutes: 5},
		{Text: "Simmer", Kind: "passive", Minutes: 15, After: []int{1}}}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)

	var tm struct {
		Scope           string `json:"scope"`
		Label           string `json:"label"`
		DurationSeconds int    `json:"durationSeconds"`
	}
	r := w.User.Post("/api/cook/timers", map[string]any{"scope": sideScope(w), "step": 2})
	if r.Status != 201 {
		t.Fatalf("start the Side's Simmer = %d %s", r.Status, r.Body)
	}
	r.MustJSON(t, &tm)
	if tm.Scope != sideScope(w) || tm.DurationSeconds != 900 || tm.Label != "Step 2: Simmer" {
		t.Errorf("timer = %+v, want the Side Recipe's Simmer, not the Main's step 2", tm)
	}
	// The same Step on the same scope again starts nothing (two devices).
	if r := w.User.Post("/api/cook/timers", map[string]any{"scope": sideScope(w), "step": 2}); r.Status != 200 {
		t.Errorf("second start = %d, want 200 (the existing timer)", r.Status)
	}
	// A Step the Side's Recipe has but the Main's has not (Active, not Passive) is refused by that Course's Steps.
	wantErr(t, "an Active Step of the Side", w.User.Post("/api/cook/timers", map[string]any{"scope": sideScope(w), "step": 1}), 422, "not_passive_step")
	// The main Course by its real id starts the Main Recipe's Rest.
	r = w.User.Post("/api/cook/timers", map[string]any{"scope": mainScope(w) + "/" + id(w.Main), "step": 1})
	if r.Status != 201 {
		t.Fatalf("start the Main's Rest by its real id = %d %s", r.Status, r.Body)
	}

	var list struct {
		Timers []struct {
			Scope      string `json:"scope"`
			RecipeName string `json:"recipeName"`
		} `json:"timers"`
	}
	w.User.Get("/api/cook/timers?scope="+sideScope(w)).MustJSON(t, &list)
	if len(list.Timers) != 1 || list.Timers[0].RecipeName != "Green beans" {
		t.Errorf("Side timers = %+v, want one, naming Green beans", list.Timers)
	}
	list.Timers = nil
	w.User.Get("/api/cook/timers?scope="+mainScope(w)).MustJSON(t, &list)
	if len(list.Timers) != 1 || list.Timers[0].RecipeName != "Roast chicken" {
		t.Errorf("Main timers (asked by the two-part scope) = %+v, want one, naming Roast chicken", list.Timers)
	}
	// An Advance Step mark of the Side's Recipe, by the Side's scope.
	if r := w.User.Put("/api/cook/marks", map[string]any{"scope": sideScope(w), "step": 0, "done": true}); r.Status != 200 {
		t.Errorf("mark the Side's Soak = %d %s", r.Status, r.Body)
	}
	wantErr(t, "an Advance mark on a Step that is not Advance in that Course", w.User.Put("/api/cook/marks", map[string]any{"scope": mainScope(w), "step": 0, "done": true}), 422, "not_advance_step")
}
