package store_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/course"
	"github.com/fabbarix/feeder-ng/internal/course/store"
	"github.com/fabbarix/feeder-ng/internal/db"
)

// The Course store (spec §3.1, ADR 0008 point 5, crs-plan §2.3; team A). Today is 2026-11-09.

var ctx = context.Background()

type fx struct {
	t                            *testing.T
	db                           *sql.DB
	st                           *store.Store
	main, side, starter, dessert int64
}

func newFx(t *testing.T) *fx {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	f := &fx{t: t, db: d, st: store.New(d, clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)))}
	get := func(key string) int64 {
		var id int64
		if err := d.QueryRow(`SELECT id FROM courses WHERE name_key = ?`, key).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	f.main, f.side, f.starter, f.dessert = get("main"), get("side"), get("starter"), get("dessert")
	return f
}

func (f *fx) exec(q string, args ...any) int64 {
	f.t.Helper()
	res, err := f.db.Exec(q, args...)
	if err != nil {
		f.t.Fatalf("%s: %v", q, err)
	}
	id, _ := res.LastInsertId()
	return id
}

func (f *fx) count(q string, args ...any) int {
	f.t.Helper()
	var n int
	if err := f.db.QueryRow(q, args...).Scan(&n); err != nil {
		f.t.Fatalf("%s: %v", q, err)
	}
	return n
}

func (f *fx) recipe(name string, archived int, courses ...int64) int64 {
	f.t.Helper()
	id := f.exec(`INSERT INTO recipes(name,yield,archived,created_at,updated_at) VALUES (?,4,?,'t','t')`, name, archived)
	for _, c := range courses {
		f.exec(`INSERT INTO recipe_courses(recipe_id,course_id) VALUES (?,?)`, id, c)
	}
	return id
}

func (f *fx) slot(weekday int, name string, courses ...int64) int64 {
	f.t.Helper()
	id := f.exec(`INSERT INTO meal_slots(weekday,name,time) VALUES (?,?,'19:00')`, weekday, name)
	for i, c := range courses {
		f.exec(`INSERT INTO meal_slot_courses(meal_slot_id,course_id,position) VALUES (?,?,?)`, id, c, i)
	}
	return id
}

func (f *fx) member(name string) int64 {
	f.t.Helper()
	return f.exec(`INSERT INTO members(name,colour,portion_factor,created_at) VALUES (?,'#fff',1,'t')`, name)
}

func (f *fx) optOut(slot, course, member int64) {
	f.t.Helper()
	f.exec(`INSERT INTO meal_slot_course_opt_outs(meal_slot_id,course_id,member_id) VALUES (?,?,?)`, slot, course, member)
}

func (f *fx) dateOptOut(slot int64, date string, course, member int64) {
	f.t.Helper()
	f.exec(`INSERT OR IGNORE INTO course_attendance_overrides(slot_id,date,course_id) VALUES (?,?,?)`, slot, date, course)
	f.exec(`INSERT INTO course_attendance_override_opt_outs(slot_id,date,course_id,member_id) VALUES (?,?,?,?)`, slot, date, course, member)
}

func (f *fx) meal(date string, slot, course, recipe int64, state string, pinned int) {
	f.t.Helper()
	f.exec(`INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,state,pinned,created_at,updated_at) VALUES (?,?,?,?,1,4,?,?,'t','t')`,
		date, slot, course, recipe, state, pinned)
}

func (f *fx) names(courses []course.Listing) []string {
	var out []string
	for _, c := range courses {
		out = append(out, c.Name)
	}
	return out
}

func TestListSeedsFourCoursesInOrderWithCounts(t *testing.T) {
	f := newFx(t)
	f.recipe("R1", 0, f.side)
	f.recipe("R2", 0, f.main, f.side)
	f.recipe("R3", 1, f.side) // archived Recipes count
	f.slot(1, "Dinner", f.main, f.side)
	list, err := f.st.List(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	if got := f.names(list); !reflect.DeepEqual(got, []string{"Main", "Side", "Starter", "Dessert"}) {
		t.Fatalf("List = %v", got)
	}
	if !list[0].Main || list[1].Main || list[0].Archived || list[1].Position != 1 {
		t.Errorf("flags/positions: %+v", list)
	}
	side := list[1]
	if side.RecipeCount != 3 || side.MealSlotCount != 1 || side.Planned || list[0].RecipeCount != 1 || list[2].RecipeCount != 0 {
		t.Errorf("Side counts = %+v, Main = %+v", side, list[0])
	}
	// Planned: any Planned Meal in any state, or a Leftover.
	slot := f.slot(2, "Lunch", f.main)
	f.meal("2026-11-01", slot, f.starter, f.recipe("R4", 0, f.starter), "skipped", 0)
	f.exec(`INSERT INTO leftovers(recipe_id,from_date,from_meal_slot_id,from_course_id,portions,cooked_on,use_by,created_at) VALUES (?, '2026-11-01', ?, ?, 2, '2026-11-01', '2026-11-04', 't')`,
		f.recipe("R5", 0, f.dessert), slot, f.dessert)
	list, _ = f.st.List(ctx, false)
	if !list[2].Planned || !list[3].Planned || list[0].Planned || list[1].Planned {
		t.Errorf("Planned flags = %v %v %v %v, want Starter and Dessert only", list[0].Planned, list[1].Planned, list[2].Planned, list[3].Planned)
	}
}

func TestListHidesArchivedCoursesUnlessAsked(t *testing.T) {
	f := newFx(t)
	f.exec(`UPDATE courses SET archived = 1 WHERE id = ?`, f.starter)
	list, _ := f.st.List(ctx, false)
	if got := f.names(list); !reflect.DeepEqual(got, []string{"Main", "Side", "Dessert"}) {
		t.Errorf("List(false) = %v", got)
	}
	all, _ := f.st.List(ctx, true)
	if len(all) != 4 || !all[2].Archived {
		t.Errorf("List(true) = %+v", all)
	}
	if c, err := f.st.Get(ctx, f.starter); err != nil || !c.Archived {
		t.Errorf("Get of an archived Course = %+v, %v", c, err)
	}
	if _, err := f.st.Get(ctx, 999); !errors.Is(err, course.ErrNotFound) {
		t.Errorf("Get(unknown) = %v", err)
	}
	if id, err := f.st.Main(ctx); err != nil || id != f.main {
		t.Errorf("Main = %d, %v", id, err)
	}
}

func TestCreateAddsLastAndRejectsClashesInvalidNamesAndTheTwentyFirst(t *testing.T) {
	f := newFx(t)
	c, err := f.st.Create(ctx, "  Soup   course ")
	if err != nil || c.Name != "Soup course" || c.Position != 4 || c.Main || c.Archived || c.ID == 0 {
		t.Fatalf("Create = %+v, %v", c, err)
	}
	var key string
	f.db.QueryRow(`SELECT name_key FROM courses WHERE id = ?`, c.ID).Scan(&key)
	if key != "soup course" {
		t.Errorf("name_key = %q", key)
	}
	for _, name := range []string{"Side ", "side", "SIDE", "soup  COURSE"} {
		if _, err := f.st.Create(ctx, name); !errors.Is(err, course.ErrNameTaken) {
			t.Errorf("Create(%q) = %v, want ErrNameTaken", name, err)
		}
	}
	for _, name := range []string{"", "   ", strings.Repeat("x", 41)} {
		if _, err := f.st.Create(ctx, name); !errors.Is(err, course.ErrNameInvalid) {
			t.Errorf("Create(%q) = %v, want ErrNameInvalid", name, err)
		}
	}
	if _, err := f.st.Create(ctx, "Entrée"); err != nil {
		t.Errorf("Entrée: %v", err)
	}
	if _, err := f.st.Create(ctx, "Entree"); err != nil {
		t.Errorf("Entree must not clash with Entrée: %v", err)
	}
	// 4 seeded + Soup course + Entrée + Entree = 7; fill to 20.
	for i := 7; i < 20; i++ {
		if _, err := f.st.Create(ctx, fmt.Sprintf("Course %d", i)); err != nil {
			t.Fatalf("course %d: %v", i, err)
		}
	}
	if _, err := f.st.Create(ctx, "One too many"); !errors.Is(err, course.ErrTooMany) {
		t.Errorf("the 21st Course: %v, want ErrTooMany", err)
	}
	// Archived Courses do not count towards 20.
	f.exec(`UPDATE courses SET archived = 1 WHERE id = ?`, f.starter)
	if _, err := f.st.Create(ctx, "Fits now"); err != nil {
		t.Errorf("after archiving one: %v", err)
	}
	// ...but an archived Course's name stays taken.
	if _, err := f.st.Create(ctx, "Starter"); !errors.Is(err, course.ErrNameTaken) {
		t.Errorf("an archived Course's name: %v, want ErrNameTaken", err)
	}
}

func TestRenameKeepsEveryReferenceAndTheMainFlag(t *testing.T) {
	f := newFx(t)
	r := f.recipe("R", 0, f.main)
	f.meal("2026-11-10", f.slot(1, "Dinner", f.main), f.main, r, "planned", 0)
	c, err := f.st.Rename(ctx, f.main, " Plat  principal ")
	if err != nil || c.ID != f.main || c.Name != "Plat principal" || !c.Main {
		t.Fatalf("Rename = %+v, %v", c, err)
	}
	var key string
	f.db.QueryRow(`SELECT name_key FROM courses WHERE id = ?`, f.main).Scan(&key)
	if key != "plat principal" {
		t.Errorf("name_key = %q", key)
	}
	if f.count(`SELECT count(*) FROM recipe_courses WHERE course_id = ?`, f.main) != 1 || f.count(`SELECT count(*) FROM planned_meals WHERE course_id = ?`, f.main) != 1 {
		t.Error("a rename changed what points at the Course")
	}
	// A new spelling of its own name is fine; another Course's name is not.
	if _, err := f.st.Rename(ctx, f.side, "SIDE"); err != nil {
		t.Errorf("re-casing its own name: %v", err)
	}
	if _, err := f.st.Rename(ctx, f.side, "dessert "); !errors.Is(err, course.ErrNameTaken) {
		t.Errorf("another Course's name: %v", err)
	}
	if _, err := f.st.Rename(ctx, f.side, ""); !errors.Is(err, course.ErrNameInvalid) {
		t.Errorf("empty: %v", err)
	}
	if _, err := f.st.Rename(ctx, 999, "X"); !errors.Is(err, course.ErrNotFound) {
		t.Errorf("unknown: %v", err)
	}
}

func TestMakeMainMovesTheFlagAndChangesNothingElse(t *testing.T) {
	f := newFx(t)
	r := f.recipe("R", 0, f.main)
	slot := f.slot(1, "Dinner", f.main)
	f.meal("2026-11-10", slot, f.main, r, "planned", 0)
	c, err := f.st.MakeMain(ctx, f.dessert)
	if err != nil || c.ID != f.dessert || !c.Main {
		t.Fatalf("MakeMain = %+v, %v", c, err)
	}
	if got, _ := f.st.Main(ctx); got != f.dessert {
		t.Errorf("Main = %d", got)
	}
	if f.count(`SELECT count(*) FROM courses WHERE is_main = 1`) != 1 {
		t.Error("not exactly one main Course")
	}
	if f.count(`SELECT count(*) FROM recipe_courses WHERE course_id = ?`, f.main) != 1 || f.count(`SELECT count(*) FROM meal_slot_courses WHERE course_id = ?`, f.main) != 1 ||
		f.count(`SELECT count(*) FROM planned_meals WHERE course_id = ?`, f.main) != 1 {
		t.Error("Make main changed a Recipe, Meal Slot or Planned Meal")
	}
	if _, err := f.st.MakeMain(ctx, f.dessert); err != nil {
		t.Errorf("making the main Course main again: %v", err)
	}
	f.exec(`UPDATE courses SET archived = 1 WHERE id = ?`, f.starter)
	if _, err := f.st.MakeMain(ctx, f.starter); !errors.Is(err, course.ErrArchived) {
		t.Errorf("archived: %v", err)
	}
	if _, err := f.st.MakeMain(ctx, 999); !errors.Is(err, course.ErrNotFound) {
		t.Errorf("unknown: %v", err)
	}
	if got, _ := f.st.Main(ctx); got != f.dessert {
		t.Error("a refused MakeMain moved the flag")
	}
}

func TestReorderSetsHouseholdOrderAndRefusesAnythingButAPermutationOfTheActiveCourses(t *testing.T) {
	f := newFx(t)
	f.exec(`UPDATE courses SET archived = 1 WHERE id = ?`, f.starter)
	if err := f.st.Reorder(ctx, []int64{f.dessert, f.main, f.side}); err != nil {
		t.Fatal(err)
	}
	list, _ := f.st.List(ctx, false)
	if got := f.names(list); !reflect.DeepEqual(got, []string{"Dessert", "Main", "Side"}) {
		t.Errorf("order = %v", got)
	}
	all, _ := f.st.List(ctx, true)
	if all[3].Name != "Starter" {
		t.Errorf("an archived Course sorts after the active ones: %v", f.names(all))
	}
	for name, ids := range map[string][]int64{
		"missing one": {f.main, f.side}, "unknown id": {f.main, f.side, 999}, "repeated": {f.main, f.main, f.side},
		"the archived one": {f.main, f.side, f.dessert, f.starter}, "empty": {},
	} {
		if err := f.st.Reorder(ctx, ids); !errors.Is(err, course.ErrOrder) {
			t.Errorf("%s: %v, want ErrOrder", name, err)
		}
	}
	list, _ = f.st.List(ctx, false)
	if got := f.names(list); !reflect.DeepEqual(got, []string{"Dessert", "Main", "Side"}) {
		t.Errorf("a refused reorder changed the order: %v", got)
	}
}

// A Household with Side on Recipes, Meal Slots and the plan.
type sideWorld struct {
	r1, r2, r3, r4 int64 // r1 Side only, r2 Main+Side, r3 archived Side only, r4 Dessert only
	s1, s2         int64 // s1 Side only, s2 Main+Side
	anna, sam      int64
}

func (f *fx) sideWorld() sideWorld {
	w := sideWorld{}
	w.r1 = f.recipe("Rice", 0, f.side)
	w.r2 = f.recipe("Beans", 0, f.main, f.side)
	w.r3 = f.recipe("Old salad", 1, f.side)
	w.r4 = f.recipe("Cake", 0, f.dessert)
	w.s1 = f.slot(1, "Snack", f.side)
	w.s2 = f.slot(2, "Dinner", f.main, f.side)
	w.anna, w.sam = f.member("Anna"), f.member("Sam")
	// Opt-outs: usual and per date.
	f.optOut(w.s1, f.side, w.anna)
	f.optOut(w.s2, f.main, w.sam)
	f.optOut(w.s2, f.side, w.sam)
	f.dateOptOut(w.s1, "2026-11-16", f.side, w.anna)
	f.dateOptOut(w.s2, "2026-11-16", f.side, w.sam)
	f.dateOptOut(w.s2, "2026-11-16", f.main, w.anna)
	// The plan.
	f.meal("2026-11-10", w.s2, f.side, w.r2, "planned", 0) // unresolved from today: goes
	f.meal("2026-11-11", w.s2, f.side, w.r1, "planned", 1) // Pinned, unresolved: goes
	f.meal("2026-11-09", w.s1, f.side, w.r1, "planned", 0) // today counts: goes
	f.meal("2026-11-12", w.s1, f.side, w.r1, "cooked", 0)  // history: stays
	f.meal("2026-11-08", w.s1, f.side, w.r1, "planned", 0) // past: stays
	f.meal("2026-11-10", w.s2, f.main, w.r2, "planned", 0) // another Course: stays
	f.exec(`INSERT INTO leftovers(recipe_id,from_date,from_meal_slot_id,from_course_id,portions,cooked_on,use_by,created_at) VALUES (?, '2026-11-12', ?, ?, 2, '2026-11-12', '2026-11-15', 't')`, w.r1, w.s1, f.side)
	f.exec(`INSERT INTO plan_unfilled(date,meal_slot_id,course_id,reason) VALUES ('2026-11-13',?,?,'no_candidates'),('2026-11-13',?,?,'no_candidates')`, w.s1, f.side, w.s2, f.main)
	f.exec(`INSERT INTO slot_rules(meal_slot_id,course_id,recipe_id) VALUES (?,?,?),(?,?,?)`, w.s1, f.side, w.r1, w.s2, f.main, w.r2)
	f.exec(`INSERT INTO slot_rules(meal_slot_id,course_id,tag) VALUES (?,?,'fish')`, w.s2, f.side)
	return w
}

func TestImpactSaysWhatDeleteOrArchiveWouldChange(t *testing.T) {
	f := newFx(t)
	w := f.sideWorld()
	im, err := f.st.Impact(ctx, f.side)
	if err != nil {
		t.Fatal(err)
	}
	if !im.Planned || im.Recipes != 3 || im.RecipesOnlyThis != 2 || im.MealSlots != 2 || im.MealSlotsOnlyThis != 1 {
		t.Errorf("counts = %+v, want planned, 3 Recipes (2 only Side, the archived one counts), 2 Meal Slots (1 only Side)", im)
	}
	want := []course.ImpactMeal{
		{Date: "2026-11-09", MealSlotID: w.s1, MealSlotName: "Snack", RecipeID: w.r1, RecipeName: "Rice", Pinned: false},
		{Date: "2026-11-10", MealSlotID: w.s2, MealSlotName: "Dinner", RecipeID: w.r2, RecipeName: "Beans", Pinned: false},
		{Date: "2026-11-11", MealSlotID: w.s2, MealSlotName: "Dinner", RecipeID: w.r1, RecipeName: "Rice", Pinned: true},
	}
	if !reflect.DeepEqual(im.PlannedMeals, want) {
		t.Errorf("PlannedMeals = %+v\nwant %+v", im.PlannedMeals, want)
	}
	if len(im.SlotRules) != 2 {
		t.Errorf("SlotRules = %+v, want the 2 on Side", im.SlotRules)
	}
	for _, r := range im.SlotRules {
		if r.MealSlotID != w.s1 && r.MealSlotID != w.s2 {
			t.Errorf("rule %+v", r)
		}
	}
	other, _ := f.st.Impact(ctx, f.dessert)
	if other.Planned || other.Recipes != 1 || other.RecipesOnlyThis != 1 || len(other.PlannedMeals) != 0 || len(other.SlotRules) != 0 {
		t.Errorf("Dessert impact = %+v", other)
	}
	if _, err := f.st.Impact(ctx, 999); !errors.Is(err, course.ErrNotFound) {
		t.Errorf("unknown: %v", err)
	}
}

// Archive Side, the replacement Main, for Meal Slots and Recipes left without a Course.
func TestArchiveTakesTheCourseOffEverythingAndDropsItsOptOutsAndUnresolvedPlan(t *testing.T) {
	f := newFx(t)
	w := f.sideWorld()
	c, im, err := f.st.Archive(ctx, f.side, f.main)
	if err != nil {
		t.Fatal(err)
	}
	if c.ID != f.side || !c.Archived || im.Recipes != 3 || len(im.PlannedMeals) != 3 || len(im.SlotRules) != 2 {
		t.Fatalf("Archive = %+v, %+v", c, im)
	}
	if list, _ := f.st.List(ctx, false); len(list) != 3 || list[1].Name != "Starter" {
		t.Errorf("an archived Course leaves the list: %v", f.names(list))
	}
	if f.count(`SELECT count(*) FROM courses WHERE id = ? AND archived = 1`, f.side) != 1 {
		t.Error("the row must stay, archived")
	}
	// Recipes: only-Side ones (even the archived one) get the replacement; the others just lose Side.
	rc := func(r int64) []int64 {
		rows, _ := f.db.Query(`SELECT course_id FROM recipe_courses WHERE recipe_id = ? ORDER BY course_id`, r)
		defer rows.Close()
		var out []int64
		for rows.Next() {
			var id int64
			rows.Scan(&id)
			out = append(out, id)
		}
		return out
	}
	for r, want := range map[int64][]int64{w.r1: {f.main}, w.r2: {f.main}, w.r3: {f.main}, w.r4: {f.dessert}} {
		if got := rc(r); !reflect.DeepEqual(got, want) {
			t.Errorf("recipe %d Courses = %v, want %v", r, got, want)
		}
	}
	// Meal Slots: s1 had only Side and now serves Main, required, at the position Side had; s2 just loses Side.
	var pos, optional int
	if err := f.db.QueryRow(`SELECT position, optional FROM meal_slot_courses WHERE meal_slot_id = ? AND course_id = ?`, w.s1, f.main).Scan(&pos, &optional); err != nil || pos != 0 || optional != 0 {
		t.Errorf("s1 now serves Main at position %d optional %d, %v", pos, optional, err)
	}
	if f.count(`SELECT count(*) FROM meal_slot_courses WHERE course_id = ?`, f.side) != 0 {
		t.Error("Side is still on a Meal Slot")
	}
	if f.count(`SELECT count(*) FROM meal_slot_courses WHERE meal_slot_id = ?`, w.s2) != 1 {
		t.Error("s2 must keep just Main")
	}
	// Opt-outs: every Side opt-out is gone; the replacement never inherits them; a slot that served Main keeps Main's.
	if f.count(`SELECT count(*) FROM meal_slot_course_opt_outs WHERE course_id = ?`, f.side) != 0 || f.count(`SELECT count(*) FROM course_attendance_overrides WHERE course_id = ?`, f.side) != 0 {
		t.Error("Side opt-outs (usual or per date) are left")
	}
	if f.count(`SELECT count(*) FROM meal_slot_course_opt_outs WHERE meal_slot_id = ? AND course_id = ?`, w.s1, f.main) != 0 {
		t.Error("Main inherited Side's opt-outs on s1")
	}
	if f.count(`SELECT count(*) FROM meal_slot_course_opt_outs WHERE meal_slot_id = ? AND course_id = ? AND member_id = ?`, w.s2, f.main, w.sam) != 1 {
		t.Error("s2 lost Main's own opt-out")
	}
	if f.count(`SELECT count(*) FROM course_attendance_override_opt_outs WHERE slot_id = ? AND course_id = ?`, w.s2, f.main) != 1 {
		t.Error("s2 lost Main's own date opt-out")
	}
	// The plan: unresolved from today on (Pinned too) are gone; Cooked, history and other Courses stay, and keep their Course.
	if f.count(`SELECT count(*) FROM planned_meals WHERE course_id = ?`, f.side) != 2 || f.count(`SELECT count(*) FROM planned_meals`) != 3 {
		t.Errorf("planned_meals: %d Side rows of %d, want the 2 history rows and Main's", f.count(`SELECT count(*) FROM planned_meals WHERE course_id = ?`, f.side), f.count(`SELECT count(*) FROM planned_meals`))
	}
	if f.count(`SELECT count(*) FROM leftovers WHERE from_course_id = ?`, f.side) != 1 {
		t.Error("a Leftover must keep the Course it was cooked in")
	}
	if f.count(`SELECT count(*) FROM plan_unfilled WHERE course_id = ?`, f.side) != 0 || f.count(`SELECT count(*) FROM plan_unfilled WHERE course_id = ?`, f.main) != 1 {
		t.Error("Couldn't plan reasons of Side must go, Main's stay")
	}
	if f.count(`SELECT count(*) FROM slot_rules WHERE course_id = ?`, f.side) != 0 || f.count(`SELECT count(*) FROM slot_rules`) != 1 {
		t.Error("Slot Rules on Side must go, Main's stay")
	}
}

func TestArchiveWithoutAReplacementWhenNothingIsLeftWithoutACourse(t *testing.T) {
	f := newFx(t)
	f.recipe("R", 0, f.main, f.starter)
	f.slot(1, "Dinner", f.main, f.starter)
	if _, _, err := f.st.Archive(ctx, f.starter, 0); err != nil {
		t.Fatalf("no replacement needed: %v", err)
	}
	if f.count(`SELECT count(*) FROM recipe_courses`) != 1 || f.count(`SELECT count(*) FROM meal_slot_courses`) != 1 {
		t.Error("Starter was not taken off")
	}
}

func TestDeleteRemovesAnUnplannedCourseForGood(t *testing.T) {
	f := newFx(t)
	only := f.recipe("Soup", 0, f.starter)
	both := f.recipe("Salad", 0, f.starter, f.dessert)
	slot := f.slot(1, "Dinner", f.main, f.starter)
	sam := f.member("Sam")
	f.optOut(slot, f.starter, sam)
	f.dateOptOut(slot, "2026-11-16", f.starter, sam)
	f.exec(`INSERT INTO slot_rules(meal_slot_id,course_id,tag) VALUES (?,?,'soup')`, slot, f.starter)
	im, err := f.st.Delete(ctx, f.starter, f.dessert)
	if err != nil {
		t.Fatal(err)
	}
	if im.Recipes != 2 || im.RecipesOnlyThis != 1 || im.MealSlots != 1 || im.MealSlotsOnlyThis != 0 || len(im.SlotRules) != 1 {
		t.Errorf("Impact applied = %+v", im)
	}
	if f.count(`SELECT count(*) FROM courses WHERE id = ?`, f.starter) != 0 {
		t.Error("the Course row is still there")
	}
	if list, _ := f.st.List(ctx, true); len(list) != 3 {
		t.Errorf("List(all) = %v", f.names(list))
	}
	for r, want := range map[int64]int{only: 1, both: 1} {
		if n := f.count(`SELECT count(*) FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, r, f.dessert); n != want {
			t.Errorf("recipe %d on Dessert: %d, want %d (only the Recipe left with none gets the replacement; Salad already had it)", r, n, want)
		}
	}
	if f.count(`SELECT count(*) FROM meal_slot_courses WHERE meal_slot_id = ?`, slot) != 1 {
		t.Error("the slot keeps just Main")
	}
	if f.count(`SELECT count(*) FROM meal_slot_course_opt_outs WHERE course_id = ?`, f.starter) != 0 || f.count(`SELECT count(*) FROM course_attendance_overrides`) != 0 || f.count(`SELECT count(*) FROM slot_rules`) != 0 {
		t.Error("opt-outs, date overrides or Slot Rules of the deleted Course are left")
	}
}

func TestDeleteAndArchiveRefuseWhatTheRulesForbidAndChangeNothing(t *testing.T) {
	f := newFx(t)
	w := f.sideWorld()
	state := func() string {
		return fmt.Sprint(f.count(`SELECT count(*) FROM recipe_courses`), f.count(`SELECT count(*) FROM meal_slot_courses`), f.count(`SELECT count(*) FROM planned_meals`),
			f.count(`SELECT count(*) FROM meal_slot_course_opt_outs`), f.count(`SELECT count(*) FROM slot_rules`), f.count(`SELECT count(*) FROM courses WHERE archived = 1`))
	}
	f.exec(`UPDATE courses SET archived = 1 WHERE id = ?`, f.starter) // an archived Course cannot be a replacement
	snap := state()
	for _, tc := range []struct {
		name string
		call func() error
		want error
	}{
		{"Delete main", func() error { _, err := f.st.Delete(ctx, f.main, f.dessert); return err }, course.ErrMain},
		{"Archive main", func() error { _, _, err := f.st.Archive(ctx, f.main, f.dessert); return err }, course.ErrMain},
		{"Delete unknown", func() error { _, err := f.st.Delete(ctx, 999, 0); return err }, course.ErrNotFound},
		{"Archive unknown", func() error { _, _, err := f.st.Archive(ctx, 999, 0); return err }, course.ErrNotFound},
	} {
		if err := tc.call(); !errors.Is(err, tc.want) {
			t.Errorf("%s: %v, want %v", tc.name, err, tc.want)
		}
	}
	// Side was planned: Delete says Archive instead.
	if _, err := f.st.Delete(ctx, f.side, f.main); !errors.Is(err, course.ErrPlanned) {
		t.Errorf("Delete of a planned Course: %v, want ErrPlanned", err)
	}
	// A replacement is needed (s1 and Rice would be left without a Course) and must be an active Course other than Side.
	for name, rep := range map[string]int64{"none": 0, "itself": f.side, "unknown": 999} {
		if _, _, err := f.st.Archive(ctx, f.side, rep); !errors.Is(err, course.ErrReplacement) {
			t.Errorf("Archive with replacement %s: %v, want ErrReplacement", name, err)
		}
	}
	if _, _, err := f.st.Archive(ctx, f.side, f.starter); !errors.Is(err, course.ErrReplacement) {
		t.Errorf("an archived replacement: %v, want ErrReplacement", err)
	}
	if got := state(); got != snap {
		t.Errorf("refused calls changed the data: %s -> %s", snap, got)
	}
	// A Leftover alone also makes a Course planned.
	f.exec(`INSERT INTO leftovers(recipe_id,from_date,from_meal_slot_id,from_course_id,portions,cooked_on,use_by,created_at) VALUES (?, '2026-11-01', ?, ?, 2, '2026-11-01', '2026-11-04', 't')`, w.r4, w.s1, f.dessert)
	if _, err := f.st.Delete(ctx, f.dessert, f.main); !errors.Is(err, course.ErrPlanned) {
		t.Errorf("Delete of a Course with only a Leftover: %v, want ErrPlanned", err)
	}
}

func TestUnarchivePutsTheCourseBackLastWithoutRestoringIt(t *testing.T) {
	f := newFx(t)
	r := f.recipe("R", 0, f.main, f.starter)
	slot := f.slot(1, "Dinner", f.main, f.starter)
	f.meal("2026-11-01", slot, f.starter, r, "cooked", 0) // planned: archive, not delete
	if _, _, err := f.st.Archive(ctx, f.starter, 0); err != nil {
		t.Fatal(err)
	}
	c, err := f.st.Unarchive(ctx, f.starter)
	if err != nil || c.Archived {
		t.Fatalf("Unarchive = %+v, %v; want active", c, err)
	}
	list, _ := f.st.List(ctx, false)
	if got := f.names(list); !reflect.DeepEqual(got, []string{"Main", "Side", "Dessert", "Starter"}) {
		t.Errorf("order = %v, want Starter last", got)
	}
	if last := list[3]; last.Position <= list[2].Position {
		t.Errorf("Starter's position %d is not after Dessert's %d", last.Position, list[2].Position)
	}
	if f.count(`SELECT count(*) FROM recipe_courses WHERE course_id = ?`, f.starter) != 0 || f.count(`SELECT count(*) FROM meal_slot_courses WHERE course_id = ?`, f.starter) != 0 {
		t.Error("an unarchived Course must not come back to Recipes or Meal Slots")
	}
	if c, err := f.st.Unarchive(ctx, f.starter); err != nil || c.Archived {
		t.Errorf("unarchiving an active Course: %+v, %v (a no-op)", c, err)
	}
	if _, err := f.st.Unarchive(ctx, 999); !errors.Is(err, course.ErrNotFound) {
		t.Errorf("unknown: %v", err)
	}
	// At 20 active Courses nothing can come back.
	f.exec(`UPDATE courses SET archived = 1 WHERE id = ?`, f.dessert)
	for i := 0; i < 17; i++ {
		if _, err := f.st.Create(ctx, fmt.Sprintf("Filler %d", i)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.st.Unarchive(ctx, f.dessert); !errors.Is(err, course.ErrTooMany) {
		t.Errorf("unarchive at 20: %v, want ErrTooMany", err)
	}
}
