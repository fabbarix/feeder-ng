package store_test

import (
	"database/sql"
	"errors"
	"reflect"
	"sort"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/store"
)

// Courses and Whole meal in the Recipe store (spec §3.1, §4; crs-plan §2.3; team A). Today is 2026-11-09.

type recipeCourses struct{ main, side, starter, dessert int64 }

func (f *fixture) courses(t *testing.T) recipeCourses {
	t.Helper()
	get := func(key string) int64 {
		var id int64
		if err := f.db.QueryRow(`SELECT id FROM courses WHERE name_key = ?`, key).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	return recipeCourses{get("main"), get("side"), get("starter"), get("dessert")}
}

func bp(b bool) *bool { return &b }

func (f *fixture) simple(t *testing.T, name string, mut func(*recipe.Input)) recipe.Input {
	t.Helper()
	var flour int64
	if err := f.db.QueryRow(`SELECT id FROM ingredients WHERE name_key = 'courses flour'`).Scan(&flour); err != nil {
		flour = f.ingredient(t, "courses flour", "g")
	}
	in := recipe.Input{Name: name, Yield: 4, Lines: []recipe.Line{{IngredientID: flour, Quantity: 100, Unit: "g"}}}
	if mut != nil {
		mut(&in)
	}
	return in
}

func (f *fixture) mustCreate(t *testing.T, in recipe.Input) recipe.Recipe {
	t.Helper()
	r, err := f.s.Create(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func TestACreateWithoutCoursesGetsTheMainCourse(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	r := f.mustCreate(t, f.simple(t, "Soup", nil))
	got, err := f.s.Get(ctx, r.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.CourseIDs, []int64{c.main}) {
		t.Errorf("CourseIDs = %v, want just the main Course %d", got.CourseIDs, c.main)
	}
	if !reflect.DeepEqual(got.Courses, []recipe.CourseRef{{ID: c.main, Name: "Main"}}) {
		t.Errorf("Courses = %+v, want Main with its name", got.Courses)
	}
	if got.WholeMeal == nil || *got.WholeMeal {
		t.Errorf("WholeMeal = %v, want a stored false", got.WholeMeal)
	}
	if !reflect.DeepEqual(r, got) {
		t.Errorf("Create result differs from Get:\n got %+v\nwant %+v", r, got)
	}
}

func TestCoursesAreStoredAndReadBackInHouseholdOrder(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	r := f.mustCreate(t, f.simple(t, "Tiramisu", func(in *recipe.Input) { in.CourseIDs = []int64{c.dessert, c.side, c.dessert} }))
	if want := []int64{c.side, c.dessert}; !reflect.DeepEqual(r.CourseIDs, want) {
		t.Errorf("CourseIDs = %v, want %v (household order, a repeat dropped)", r.CourseIDs, want)
	}
	if len(r.Courses) != 2 || r.Courses[0].Name != "Side" || r.Courses[1].Name != "Dessert" {
		t.Errorf("Courses = %+v", r.Courses)
	}
	// The household order is the Courses' positions, not their ids.
	f.exec(t, `UPDATE courses SET position = 10 WHERE id = ?`, c.side)
	got, _ := f.s.Get(ctx, r.ID)
	if want := []int64{c.dessert, c.side}; !reflect.DeepEqual(got.CourseIDs, want) {
		t.Errorf("after moving Side last, CourseIDs = %v, want %v", got.CourseIDs, want)
	}
}

func TestCourseIDsErrorsWriteNothing(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	f.exec(t, `UPDATE courses SET archived = 1 WHERE id = ?`, c.starter)
	for name, tc := range map[string]struct {
		ids  []int64
		code string
	}{
		"empty list":      {[]int64{}, recipe.CodeCoursesEmpty},
		"unknown id":      {[]int64{c.main, 999}, recipe.CodeCourseUnknown},
		"archived Course": {[]int64{c.starter}, recipe.CodeCourseUnknown},
		"zero":            {[]int64{0}, recipe.CodeCourseUnknown},
	} {
		in := f.simple(t, "X"+name, func(in *recipe.Input) { in.CourseIDs = tc.ids })
		_, err := f.s.Create(ctx, in)
		var ve *recipe.ValidationError
		if !errors.As(err, &ve) || ve.Field != "courses" || ve.Code != tc.code {
			t.Errorf("%s: err = %v, want field courses, code %s", name, err, tc.code)
		}
	}
	if f.count(t, "recipes") != 0 || f.count(t, "recipe_courses") != 0 {
		t.Errorf("rejected creates wrote %d recipes and %d recipe_courses rows", f.count(t, "recipes"), f.count(t, "recipe_courses"))
	}
}

func TestAnUpdateWithoutCoursesKeepsThemAndOneWithCoursesReplacesThem(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	r := f.mustCreate(t, f.simple(t, "Salad", func(in *recipe.Input) { in.CourseIDs = []int64{c.side, c.starter} }))
	in := f.simple(t, "Salad v2", nil)
	in.CourseIDs = nil
	upd, err := f.s.Update(ctx, r.ID, in)
	if err != nil {
		t.Fatal(err)
	}
	if want := []int64{c.side, c.starter}; !reflect.DeepEqual(upd.CourseIDs, want) {
		t.Errorf("CourseIDs after an update without them = %v, want %v kept", upd.CourseIDs, want)
	}
	in.CourseIDs = []int64{c.main, c.dessert}
	upd, err = f.s.Update(ctx, r.ID, in)
	if err != nil || !reflect.DeepEqual(upd.CourseIDs, []int64{c.main, c.dessert}) {
		t.Fatalf("replace: %v, %v", upd.CourseIDs, err)
	}
	if n := f.count(t, "recipe_courses"); n != 2 {
		t.Errorf("%d recipe_courses rows, want 2 (old ones removed)", n)
	}
	// A refused update changes nothing.
	in.CourseIDs = []int64{}
	if _, err := f.s.Update(ctx, r.ID, in); !errors.Is(err, recipe.ErrInvalid) {
		t.Fatalf("empty list: %v", err)
	}
	if got, _ := f.s.Get(ctx, r.ID); !reflect.DeepEqual(got.CourseIDs, []int64{c.main, c.dessert}) || got.Name != "Salad v2" {
		t.Errorf("a refused update changed the Recipe: %+v", got)
	}
}

func TestWholeMealDefaultsOnCreate(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	ready := func(in *recipe.Input) { in.ReadyMeal = true }
	tests := []struct {
		name string
		mut  func(*recipe.Input)
		want bool
	}{
		{"a Ready Meal with the (default) main Course", ready, true},
		{"a Ready Meal in Main and Side", func(in *recipe.Input) { ready(in); in.CourseIDs = []int64{c.side, c.main} }, true},
		{"a Ready Meal without the main Course", func(in *recipe.Input) { ready(in); in.CourseIDs = []int64{c.side} }, false},
		{"a normal Recipe", nil, false},
		{"a Ready Meal, Whole meal switched off", func(in *recipe.Input) { ready(in); in.WholeMeal = bp(false) }, false},
		{"a one-pot stew that is not a Ready Meal", func(in *recipe.Input) { in.WholeMeal = bp(true) }, true},
	}
	for i, tc := range tests {
		r, err := f.s.Create(ctx, f.simple(t, "WM"+string(rune('A'+i)), tc.mut))
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		if r.WholeMeal == nil || *r.WholeMeal != tc.want {
			t.Errorf("%s: WholeMeal = %v, want %v", tc.name, r.WholeMeal, tc.want)
		}
	}
}

func TestAnUpdateWithoutWholeMealKeepsItAndTakingTheMainCourseOffKeepsTheFlag(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	r := f.mustCreate(t, f.simple(t, "Pizza", func(in *recipe.Input) { in.ReadyMeal = true })) // Whole meal by default
	if r.WholeMeal == nil || !*r.WholeMeal {
		t.Fatalf("setup: WholeMeal = %v", r.WholeMeal)
	}
	in := f.simple(t, "Pizza", func(in *recipe.Input) { in.ReadyMeal = true })
	upd, err := f.s.Update(ctx, r.ID, in) // no WholeMeal, no CourseIDs
	if err != nil || upd.WholeMeal == nil || !*upd.WholeMeal {
		t.Fatalf("update without wholeMeal: %v, %v; want the stored true kept", upd.WholeMeal, err)
	}
	in.CourseIDs = []int64{c.side} // takes the main Course off; the flag is kept, only not shown
	upd, err = f.s.Update(ctx, r.ID, in)
	if err != nil || upd.WholeMeal == nil || !*upd.WholeMeal {
		t.Errorf("taking the main Course off cleared Whole meal: %v, %v", upd.WholeMeal, err)
	}
	in.CourseIDs = []int64{c.main}
	in.WholeMeal = bp(false)
	upd, _ = f.s.Update(ctx, r.ID, in)
	if upd.WholeMeal == nil || *upd.WholeMeal {
		t.Errorf("an explicit false must switch it off: %v", upd.WholeMeal)
	}
	in.WholeMeal = nil
	upd, _ = f.s.Update(ctx, r.ID, in)
	if upd.WholeMeal == nil || *upd.WholeMeal {
		t.Errorf("an update without it must keep the stored false: %v", upd.WholeMeal)
	}
	// Moving the main flag to another Course changes no Recipe.
	f.exec(t, `UPDATE courses SET is_main = 0 WHERE id = ?`, c.main)
	f.exec(t, `UPDATE courses SET is_main = 1 WHERE id = ?`, c.side)
	got, _ := f.s.Get(ctx, r.ID)
	if !reflect.DeepEqual(got.CourseIDs, []int64{c.main}) || got.WholeMeal == nil || *got.WholeMeal {
		t.Errorf("Make main changed the Recipe: %+v", got)
	}
}

// ---- A Recipe that loses a Course ----

func (f *fixture) plannedKeys(t *testing.T) []string {
	t.Helper()
	rows, err := f.db.Query(`SELECT pm.date || '/' || c.name_key || '/' || pm.state || '/' || pm.pinned FROM planned_meals pm JOIN courses c ON c.id = pm.course_id ORDER BY pm.date, c.position`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		rows.Scan(&s)
		out = append(out, s)
	}
	return out
}

func TestARecipeThatLosesACourseLosesItsUnpinnedUnresolvedPlannedMealsAndItsSlotRulesByRecipeThere(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	r := f.mustCreate(t, f.simple(t, "Rice", func(in *recipe.Input) { in.CourseIDs = []int64{c.main, c.side} }))
	other := f.mustCreate(t, f.simple(t, "Beans", func(in *recipe.Input) { in.CourseIDs = []int64{c.main, c.side} }))
	slot := f.exec(t, `INSERT INTO meal_slots(weekday,name,time) VALUES (1,'Dinner','19:00')`)
	f.exec(t, `INSERT INTO meal_slot_courses(meal_slot_id,course_id,position) VALUES (?,?,0),(?,?,1)`, slot, c.main, slot, c.side)
	pm := func(date string, course, recipeID int64, state string, pinned int, fromDate any) {
		var fromSlot, fromCourse any
		if fromDate != nil {
			fromSlot, fromCourse = slot, course
		}
		f.exec(t, `INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,state,pinned,from_date,from_meal_slot_id,from_course_id,created_at,updated_at)
			VALUES (?,?,?,?,?,4,?,?,?,?,?,'t','t')`, date, slot, course, recipeID, map[bool]int{true: 0, false: 1}[fromDate != nil], state, pinned, fromDate, fromSlot, fromCourse)
	}
	pm("2026-11-08", c.side, r.ID, "planned", 0, nil)          // past: history, stays
	pm("2026-11-12", c.side, r.ID, "planned", 0, nil)          // goes
	pm("2026-11-12", c.main, r.ID, "planned", 0, nil)          // Course not lost: stays
	pm("2026-11-13", c.side, r.ID, "planned", 1, nil)          // Pinned: stays
	pm("2026-11-14", c.side, r.ID, "cooked", 0, nil)           // Cooked: stays
	pm("2026-11-15", c.side, r.ID, "skipped", 0, nil)          // Not cooked: stays
	pm("2026-11-16", c.side, r.ID, "planned", 0, "2026-11-12") // served from its Leftover: goes
	pm("2026-11-17", c.side, other.ID, "planned", 0, nil)      // another Recipe: stays
	pm("2026-11-09", c.side, r.ID, "planned", 0, nil)          // today counts as "from today on": goes
	f.exec(t, `INSERT INTO slot_rules(meal_slot_id,course_id,recipe_id) VALUES (?,?,?),(?,?,?),(?,?,?)`, slot, c.side, r.ID, slot, c.main, r.ID, slot, c.side, other.ID)
	f.exec(t, `INSERT INTO slot_rules(meal_slot_id,course_id,tag) VALUES (?,?,'rice')`, slot, c.side)

	in := f.simple(t, "Rice", nil)
	in.CourseIDs = []int64{c.main}
	if _, err := f.s.Update(ctx, r.ID, in); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"2026-11-08/side/planned/0", "2026-11-12/main/planned/0", "2026-11-13/side/planned/1",
		"2026-11-14/side/cooked/0", "2026-11-15/side/skipped/0", "2026-11-17/side/planned/0",
	}
	if got := f.plannedKeys(t); !reflect.DeepEqual(got, want) {
		t.Errorf("Planned Meals after the update:\n got %v\nwant %v", got, want)
	}
	var rules []string
	rows, _ := f.db.Query(`SELECT c.name_key || ':' || COALESCE(sr.recipe_id, sr.tag) FROM slot_rules sr JOIN courses c ON c.id = sr.course_id ORDER BY sr.id`)
	for rows.Next() {
		var s string
		rows.Scan(&s)
		rules = append(rules, s)
	}
	rows.Close()
	sort.Strings(rules)
	wantRules := []string{"main:" + itoa(r.ID), "side:" + itoa(other.ID), "side:rice"}
	sort.Strings(wantRules)
	if !reflect.DeepEqual(rules, wantRules) {
		t.Errorf("Slot Rules after the update = %v, want %v (the rule by Rice on Side is gone; Main's, the Tag rule and another Recipe's stay)", rules, wantRules)
	}
}

func TestASavedRecipeThatKeepsEveryCourseRemovesNothingAndAFailedOneRemovesNothing(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	r := f.mustCreate(t, f.simple(t, "Rice", func(in *recipe.Input) { in.CourseIDs = []int64{c.main, c.side} }))
	slot := f.exec(t, `INSERT INTO meal_slots(weekday,name,time) VALUES (1,'Dinner','19:00')`)
	f.exec(t, `INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,created_at,updated_at) VALUES ('2026-11-12',?,?,?,1,4,'t','t')`, slot, c.side, r.ID)
	f.exec(t, `INSERT INTO slot_rules(meal_slot_id,course_id,recipe_id) VALUES (?,?,?)`, slot, c.side, r.ID)
	in := f.simple(t, "Rice 2", nil)
	in.CourseIDs = []int64{c.side, c.main, c.dessert} // adds one, loses none
	if _, err := f.s.Update(ctx, r.ID, in); err != nil {
		t.Fatal(err)
	}
	if f.count(t, "planned_meals") != 1 || f.count(t, "slot_rules") != 1 {
		t.Error("an update that only adds a Course removed plan rows")
	}
	in.CourseIDs = []int64{c.main}
	in.Yield = -1 // refused
	if _, err := f.s.Update(ctx, r.ID, in); !errors.Is(err, recipe.ErrInvalid) {
		t.Fatal(err)
	}
	if f.count(t, "planned_meals") != 1 || f.count(t, "slot_rules") != 1 {
		t.Error("a refused update removed plan rows")
	}
}

// ---- Listing, filtering, deleting ----

func TestSummariesCarryCoursesAndWholeMealAndFilterByCourse(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	soup := f.mustCreate(t, f.simple(t, "Soup", nil))
	salad := f.mustCreate(t, f.simple(t, "Salad", func(in *recipe.Input) { in.CourseIDs = []int64{c.side, c.starter} }))
	pizza := f.mustCreate(t, f.simple(t, "Pizza", func(in *recipe.Input) { in.ReadyMeal = true; in.CourseIDs = []int64{c.main, c.side} }))
	cake := f.mustCreate(t, f.simple(t, "Cake", func(in *recipe.Input) { in.CourseIDs = []int64{c.dessert} }))
	f.s.SetArchived(ctx, cake.ID, true)

	all, err := f.s.List(ctx, store.ListFilter{Archived: "all"})
	if err != nil {
		t.Fatal(err)
	}
	by := map[int64]recipe.Summary{}
	for _, s := range all {
		by[s.ID] = s
	}
	if !reflect.DeepEqual(by[salad.ID].CourseIDs, []int64{c.side, c.starter}) || by[soup.ID].WholeMeal || !by[pizza.ID].WholeMeal ||
		!reflect.DeepEqual(by[pizza.ID].CourseIDs, []int64{c.main, c.side}) || by[cake.ID].CourseIDs == nil {
		t.Errorf("summaries = %+v", by)
	}
	list := func(fl store.ListFilter) []string {
		l, err := f.s.List(ctx, fl)
		if err != nil {
			t.Fatal(err)
		}
		var out []string
		for _, s := range l {
			out = append(out, s.Name)
		}
		return out
	}
	if got, want := list(store.ListFilter{CourseID: c.side}), []string{"Pizza", "Salad"}; !reflect.DeepEqual(got, want) {
		t.Errorf("?course=Side = %v, want %v", got, want)
	}
	if got, want := list(store.ListFilter{NotCourseID: c.side}), []string{"Soup"}; !reflect.DeepEqual(got, want) {
		t.Errorf("?notCourse=Side = %v, want %v (not marked with it, for the Couldn't plan fix; archived excluded as usual)", got, want)
	}
	if got, want := list(store.ListFilter{CourseID: c.main, NotCourseID: c.side}), []string{"Soup"}; !reflect.DeepEqual(got, want) {
		t.Errorf("both filters = %v, want %v", got, want)
	}
	if got, want := list(store.ListFilter{Archived: "all", CourseID: c.dessert}), []string{"Cake"}; !reflect.DeepEqual(got, want) {
		t.Errorf("archived Recipes keep their Courses: %v, want %v", got, want)
	}
}

func TestDeletingARecipeRemovesItsCourseLinks(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	r := f.mustCreate(t, f.simple(t, "Soup", func(in *recipe.Input) { in.CourseIDs = []int64{c.main, c.side} }))
	keep := f.mustCreate(t, f.simple(t, "Salad", nil))
	if err := f.s.Delete(ctx, r.ID); err != nil {
		t.Fatal(err)
	}
	if n := f.count(t, "recipe_courses"); n != 1 {
		t.Errorf("%d recipe_courses rows after the delete, want only %d's", n, keep.ID)
	}
}

// CreateTx and ReplaceTx check the Course ids against the caller's transaction, so a Course created earlier in
// the same transaction (a future import) counts, and an unknown or archived one is a ValidationError.
func TestACreateTxSeesACourseCreatedInTheSameTransaction(t *testing.T) {
	f := newFixture(t)
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	res, err := tx.Exec(`INSERT INTO courses (name, name_key, position, created_at) VALUES ('Cheese','cheese',9,'2026-11-09T12:00:00Z')`)
	if err != nil {
		t.Fatal(err)
	}
	cid, _ := res.LastInsertId()
	in := f.simple(t, "Board", func(in *recipe.Input) { in.CourseIDs = []int64{cid} })
	id, err := f.s.CreateTx(ctx, tx, in)
	if err != nil {
		t.Fatalf("CreateTx with a Course made in the same transaction: %v", err)
	}
	in.Name = "Board 2"
	if _, err := f.s.ReplaceTx(ctx, tx, id, in); err != nil {
		t.Fatalf("ReplaceTx with a Course made in the same transaction: %v", err)
	}
}

func TestACreateTxAndReplaceTxRejectUnknownOrArchivedCourses(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	existing := f.mustCreate(t, f.simple(t, "Soup", nil))
	for name, ids := range map[string][]int64{"unknown": {c.main, 999}, "archived": {c.starter}} {
		if _, err := f.db.Exec(`UPDATE courses SET archived = 1 WHERE id = ?`, c.starter); err != nil {
			t.Fatal(err)
		}
		for op, run := range map[string]func(*sql.Tx, recipe.Input) error{
			"CreateTx":  func(tx *sql.Tx, in recipe.Input) error { _, err := f.s.CreateTx(ctx, tx, in); return err },
			"ReplaceTx": func(tx *sql.Tx, in recipe.Input) error { _, err := f.s.ReplaceTx(ctx, tx, existing.ID, in); return err },
		} {
			tx, err := f.db.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			err = run(tx, f.simple(t, "X "+op, func(in *recipe.Input) { in.CourseIDs = ids }))
			tx.Rollback()
			var ve *recipe.ValidationError
			if !errors.As(err, &ve) || ve.Code != recipe.CodeCourseUnknown {
				t.Errorf("%s %s: err = %v, want a %s ValidationError", op, name, err, recipe.CodeCourseUnknown)
			}
		}
	}
}
