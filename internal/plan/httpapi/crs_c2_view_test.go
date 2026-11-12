package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// GET /api/plan per Course (spec §16 Plan, §7.5).

func TestPlanSlotListsItsCoursesInSlotOrderWithRealCourseIDs(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", true)

	r := w.User.Get("/api/plan?from=" + crsc2.Today + "&to=" + crsc2.Today)
	noNull(t, r.Body, "optOutMemberIds")
	s := slotOf(t, w, crsc2.Today)
	if len(s.Courses) != 2 {
		t.Fatalf("courses = %+v, want Main then Side", s.Courses)
	}
	main, side := s.Courses[0], s.Courses[1]
	if main.CourseID != w.Main || main.Name != "Main" || !main.Main || main.Optional || len(main.OptOutMemberIDs) != 0 {
		t.Errorf("main row = %+v", main)
	}
	if side.CourseID != w.Side || side.Name != "Side" || side.Main || side.Optional {
		t.Errorf("side row = %+v", side)
	}
	if main.Meal == nil || main.Meal.RecipeID != roast || main.Meal.CourseID != w.Main || main.Meal.CourseName != "Main" || main.Meal.Pinned {
		t.Errorf("main meal = %+v", main.Meal)
	}
	if side.Meal == nil || side.Meal.RecipeID != beans || side.Meal.CourseID != w.Side || side.Meal.CourseName != "Side" || !side.Meal.Pinned {
		t.Errorf("side meal = %+v", side.Meal)
	}
	for _, c := range s.Courses {
		if c.Unfilled != nil || c.CoveredBy != nil || c.Unserved != nil {
			t.Errorf("a Course with a meal also says %+v", c)
		}
		if c.CourseID == 0 || (c.Meal != nil && c.Meal.CourseID == 0) {
			t.Errorf("the transition shim's Course 0 leaked: %+v", c)
		}
	}
}

func TestPlanSlotKeepsMealAndUnfilledAsAliasesForTheMainCourse(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	s := slotOf(t, w, crsc2.Today)
	if s.Meal == nil || s.Meal.RecipeID != roast || s.Meal.CourseID != w.Main {
		t.Errorf("slot.meal = %+v, want the main Course's meal with the real Course id", s.Meal)
	}
	if s.Unfilled != nil {
		t.Errorf("slot.unfilled = %+v, want null", s.Unfilled)
	}

	w.Exec(`DELETE FROM planned_meals`)
	w.Unfilled(crsc2.Today, w.Slot, w.Main, "no_candidates")
	w.Unfilled(crsc2.Today, w.Slot, w.Side, "no_course_recipes")
	s = slotOf(t, w, crsc2.Today)
	if s.Meal != nil || s.Unfilled == nil || s.Unfilled.Reason != "no_candidates" {
		t.Errorf("slot = meal %+v unfilled %+v, want the main Course's no_candidates", s.Meal, s.Unfilled)
	}
	if u := courseOf(t, s, w.Side).Unfilled; u == nil || u.Reason != "no_course_recipes" {
		t.Errorf("side unfilled = %+v", u)
	}
	if u := courseOf(t, s, w.Main).Unfilled; u == nil || u.Reason != "no_candidates" {
		t.Errorf("main unfilled = %+v", u)
	}
	for _, k := range []string{"considered", "exclusion", "coolDown", "varietyRule", "advanceStep"} {
		if _, ok := courseOf(t, s, w.Side).Unfilled.Eliminated[k]; !ok {
			t.Errorf("eliminated lacks %q: %+v", k, courseOf(t, s, w.Side).Unfilled.Eliminated)
		}
	}
}

func TestMealCarriesWholeMealAndRelaxedAndItsChips(t *testing.T) {
	w := crsc2.New(t)
	stew := w.Recipe("Beef stew", crsc2.RecipeSpec{Whole: true})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, stew, "planned", false)
	id := w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", true)
	w.Exec(`UPDATE planned_meals SET relaxed = 1, why_json = ? WHERE id = ?`,
		`[{"code":"cooldown_relaxed","recipeId":`+itoa(beans)+`,"date":"2026-11-08"},{"code":"variety_relaxed","tag":"fish","value":3}]`, id)

	s := slotOf(t, w, crsc2.Today)
	if m := courseOf(t, s, w.Main).Meal; m == nil || !m.WholeMeal || m.Relaxed {
		t.Errorf("main meal = %+v, want wholeMeal and not relaxed", m)
	}
	m := courseOf(t, s, w.Side).Meal
	if m == nil || m.WholeMeal || !m.Relaxed || len(m.Why) != 2 {
		t.Fatalf("side meal = %+v, want relaxed with two chips", m)
	}
	if c := m.Why[0]; c.Code != "cooldown_relaxed" || c.RecipeID != beans || c.Recipe != "Green beans" || c.Date != "2026-11-08" {
		t.Errorf("cool-down chip = %+v", c)
	}
	if c := m.Why[1]; c.Code != "variety_relaxed" || c.Tag != "fish" || c.Value != 3 {
		t.Errorf("variety chip = %+v", c)
	}
}

func TestCoveredCourseNamesTheWholeMealThatCoversIt(t *testing.T) {
	w := crsc2.New(t)
	stew := w.Recipe("Beef stew", crsc2.RecipeSpec{Whole: true})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, stew, "planned", false)
	s := slotOf(t, w, crsc2.Today)
	side := courseOf(t, s, w.Side)
	if side.Meal != nil || side.Unfilled != nil || side.Unserved != nil {
		t.Errorf("covered Side = %+v", side)
	}
	if side.CoveredBy == nil || side.CoveredBy.CourseID != w.Main || side.CoveredBy.RecipeID != stew || side.CoveredBy.RecipeName != "Beef stew" {
		t.Errorf("coveredBy = %+v, want the main Course's Beef stew", side.CoveredBy)
	}
	if main := courseOf(t, s, w.Main); main.CoveredBy != nil || main.Meal == nil || !main.Meal.WholeMeal {
		t.Errorf("main row = %+v", main)
	}
}

func TestACourseThatHoldsAMealBesideAWholeMealIsAnOrdinaryRow(t *testing.T) {
	w := crsc2.New(t)
	stew := w.Recipe("Beef stew", crsc2.RecipeSpec{Whole: true})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, stew, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", true)
	side := courseOf(t, slotOf(t, w, crsc2.Today), w.Side)
	if side.Meal == nil || side.Meal.RecipeID != beans || side.CoveredBy != nil || side.Unserved != nil {
		t.Errorf("Side beside a Whole meal = %+v, want meal set, coveredBy and unserved null", side)
	}
}

func TestUnservedSaysWhyACourseHasNoMealAndNoReason(t *testing.T) {
	w := crsc2.New(t)
	w.AddCourseToSlot(w.Slot, w.Dessert, true)
	w.OptOut(w.Slot, w.Side, w.Anna)
	w.OptOut(w.Slot, w.Side, w.Sam) // nobody eats the Side
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)

	s := slotOf(t, w, crsc2.Today)
	side, dessert := courseOf(t, s, w.Side), courseOf(t, s, w.Dessert)
	if side.Unserved == nil || *side.Unserved != "no_course_attendance" || side.Meal != nil || side.Unfilled != nil || side.CoveredBy != nil {
		t.Errorf("Side nobody eats = %+v, want unserved no_course_attendance", side)
	}
	if dessert.Unserved == nil || *dessert.Unserved != "optional" || !dessert.Optional || dessert.Meal != nil {
		t.Errorf("optional Dessert left empty = %+v, want unserved optional", dessert)
	}
	if len(side.OptOutMemberIDs) != 2 {
		t.Errorf("side optOutMemberIds = %v, want both Members", side.OptOutMemberIDs)
	}
}

func TestNobodyEatingACoursePrecedesCoveringAndOptional(t *testing.T) {
	w := crsc2.New(t)
	w.AddCourseToSlot(w.Slot, w.Dessert, true)
	w.OptOut(w.Slot, w.Side, w.Anna)
	w.OptOut(w.Slot, w.Side, w.Sam)
	w.OptOut(w.Slot, w.Dessert, w.Anna)
	w.OptOut(w.Slot, w.Dessert, w.Sam)
	stew := w.Recipe("Beef stew", crsc2.RecipeSpec{Whole: true})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, stew, "planned", false)
	s := slotOf(t, w, crsc2.Today)
	for _, id := range []int64{w.Side, w.Dessert} {
		c := courseOf(t, s, id)
		if c.Unserved == nil || *c.Unserved != "no_course_attendance" || c.CoveredBy != nil {
			t.Errorf("%s = %+v, want unserved no_course_attendance (planner pre-walk order)", c.Name, c)
		}
	}
}

func TestOptOutMemberIDsAreTheEffectiveOnesOnThatDate(t *testing.T) {
	w := crsc2.New(t)
	w.OptOut(w.Slot, w.Side, w.Sam)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	if got := courseOf(t, slotOf(t, w, crsc2.Today), w.Side).OptOutMemberIDs; len(got) != 1 || got[0] != w.Sam {
		t.Errorf("usual opt-outs = %v, want [Sam]", got)
	}
	w.OptOutOn(w.Slot, crsc2.Today, w.Side, w.Anna) // the date's list replaces the usual one
	if got := courseOf(t, slotOf(t, w, crsc2.Today), w.Side).OptOutMemberIDs; len(got) != 1 || got[0] != w.Anna {
		t.Errorf("date override = %v, want [Anna]", got)
	}
	w.Exec(`DELETE FROM course_attendance_override_opt_outs`)
	r := w.User.Get("/api/plan?from=" + crsc2.Today + "&to=" + crsc2.Today)
	noNull(t, r.Body, "optOutMemberIds")
	if got := courseOf(t, slotOf(t, w, crsc2.Today), w.Side).OptOutMemberIDs; len(got) != 0 {
		t.Errorf("an empty date override puts everyone back, got %v", got)
	}
}

func TestACourseTheSlotNoLongerServesShowsAsHistoryAfterTheSlotsCourses(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	tart := w.Recipe("Fruit tart", crsc2.RecipeSpec{Courses: []int64{w.Dessert}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Dessert, tart, "cooked", true) // the slot does not serve Dessert (any more)
	s := slotOf(t, w, crsc2.Today)
	if len(s.Courses) != 3 || s.Courses[0].CourseID != w.Main || s.Courses[1].CourseID != w.Side || s.Courses[2].CourseID != w.Dessert {
		t.Fatalf("courses = %+v, want Main, Side, then the history row for Dessert", s.Courses)
	}
	h := s.Courses[2]
	if h.Name != "Dessert" || h.Main || h.Optional || len(h.OptOutMemberIDs) != 0 || h.Meal == nil || h.Meal.State != "cooked" || h.Meal.RecipeID != tart {
		t.Errorf("history row = %+v", h)
	}
}

func TestCookMinutesIsTheSlotsTimelineTotal(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{Steps: []crsc2.Step{{Text: "Roast", Kind: "active", Minutes: 20}}})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Steps: []crsc2.Step{{Text: "Boil", Kind: "active", Minutes: 10}}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	mainOnly := slotOf(t, w, crsc2.Today)
	if mainOnly.CookMinutes == nil || *mainOnly.CookMinutes != 20 || mainOnly.StartBy != "18:40" {
		t.Errorf("one fresh Course: cookMinutes %v startBy %q, want 20 and 18:40", mainOnly.CookMinutes, mainOnly.StartBy)
	}
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)
	both := slotOf(t, w, crsc2.Today)
	if both.CookMinutes == nil || *both.CookMinutes != 30 || both.StartBy != "18:30" {
		t.Errorf("two Active Steps never overlap, so 20 + 10: cookMinutes %v startBy %q, want 30 and 18:30", both.CookMinutes, both.StartBy)
	}
	w.Exec(`UPDATE planned_meals SET state = 'cooked' WHERE course_id = ?`, w.Main)
	if got := slotOf(t, w, crsc2.Today).CookMinutes; got == nil || *got != 10 {
		t.Errorf("a Cooked Course leaves the timeline: cookMinutes %v, want 10", got)
	}
	w.Exec(`UPDATE planned_meals SET state = 'skipped' WHERE course_id = ?`, w.Side)
	s := slotOf(t, w, crsc2.Today)
	if s.CookMinutes != nil || s.StartBy != "" {
		t.Errorf("nothing left to cook: cookMinutes %v startBy %q, want null and omitted", s.CookMinutes, s.StartBy)
	}
}

func TestCookMinutesIgnoresALeftoverCourseWithoutAFreshOne(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{Steps: []crsc2.Step{{Text: "Roast", Kind: "active", Minutes: 20}}})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Steps: []crsc2.Step{{Text: "Boil", Kind: "active", Minutes: 10}}})
	w.Settle()
	w.Meal(crsc2.Yesterday, w.Slot, w.Side, beans, "cooked", true)
	w.LeftoverMeal(crsc2.Today, w.Slot, w.Side, beans, crsc2.Yesterday, w.Slot, w.Side)
	if got := slotOf(t, w, crsc2.Today).CookMinutes; got != nil {
		t.Errorf("only a Leftover Course: cookMinutes %v, want null", *got)
	}
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	if got := slotOf(t, w, crsc2.Today).CookMinutes; got == nil || *got != 20 {
		t.Errorf("a Reheat (passive) overlaps anything: cookMinutes %v, want 20", got)
	}
}

func TestSlotRulesCarryTheCourse(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	var main, side ruleBody
	r := w.User.Post("/api/slot-rules", map[string]any{"mealSlotId": w.Slot, "recipeId": roast})
	if r.Status != 201 {
		t.Fatalf("add a rule without courseId = %d %s", r.Status, r.Body)
	}
	r.MustJSON(t, &main)
	if main.CourseID != w.Main {
		t.Errorf("a rule without courseId is for the main Course, with its real id %d; got %+v", w.Main, main)
	}
	r = w.User.Post("/api/slot-rules", map[string]any{"mealSlotId": w.Slot, "courseId": w.Side, "recipeId": beans})
	if r.Status != 201 {
		t.Fatalf("add a Side rule = %d %s", r.Status, r.Body)
	}
	r.MustJSON(t, &side)
	if side.CourseID != w.Side || side.RecipeID != beans {
		t.Errorf("Side rule = %+v", side)
	}
	var list []ruleBody
	w.User.Get("/api/slot-rules").MustJSON(t, &list)
	if len(list) != 2 || list[0].CourseID != w.Main || list[1].CourseID != w.Side {
		t.Errorf("rules = %+v, want the Main rule then the Side rule, with real Course ids", list)
	}
	s := slotOf(t, w, crsc2.Today)
	if len(s.Rules) != 2 || s.Rules[0].CourseID == 0 || s.Rules[1].CourseID == 0 {
		t.Errorf("slot rules in the plan = %+v, want both with real Course ids", s.Rules)
	}
	// The same Recipe may stand for the same slot in two Courses; the duplicate check is per Course.
	if r := w.User.Post("/api/slot-rules", map[string]any{"mealSlotId": w.Slot, "courseId": w.Side, "recipeId": beans}); r.Status != 409 {
		t.Errorf("a duplicate in the same Course = %d, want 409", r.Status)
	}
}

func TestSlotRuleRefusals(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	w.Settle()
	wantErr(t, "a Course the slot does not serve", w.User.Post("/api/slot-rules", map[string]any{"mealSlotId": w.Slot, "courseId": w.Dessert, "tag": "light"}), 422, "course_not_in_slot")
	wantErr(t, "an unknown Course", w.User.Post("/api/slot-rules", map[string]any{"mealSlotId": w.Slot, "courseId": 9999, "tag": "light"}), 422, "course_not_in_slot")
	wantErr(t, "a Recipe not marked with the Course", w.User.Post("/api/slot-rules", map[string]any{"mealSlotId": w.Slot, "courseId": w.Side, "recipeId": roast}), 422, "recipe_not_in_course")
	if r := w.User.Post("/api/slot-rules", map[string]any{"mealSlotId": w.Slot, "courseId": w.Side, "tag": "light"}); r.Status != 201 {
		t.Errorf("a Tag rule has no Course fit to check, got %d %s", r.Status, r.Body)
	}
}
