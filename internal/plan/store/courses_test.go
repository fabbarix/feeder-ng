package store_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
)

// The Course in the plan store (crs-plan §1.1, §2.2 "Persistence shim", §2.3, team A).
//
// The shim: until B and C2 merge, callers still use plan.Key{CourseID: 0}, which means the main Course.
// The store keeps ONE consistent key form while that lasts: the main Course always reads back as
// CourseID 0 (never its real id), every other Course as its real id, and a lookup by either form of the
// main Course finds the same row. So a map[plan.Key] built from what the store returns is found by the keys
// the callers (SlotInfo.Key, reconcile) use, and nothing misses. Removing the shim is C3's job.

type courseIDs struct{ main, side, starter, dessert int64 }

func (f *fixture) courses(t *testing.T) courseIDs {
	t.Helper()
	get := func(key string) int64 {
		var id int64
		if err := f.db.QueryRow(`SELECT id FROM courses WHERE name_key = ?`, key).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	return courseIDs{main: get("main"), side: get("side"), starter: get("starter"), dessert: get("dessert")}
}

func (f *fixture) ck(date string, slot, course int64) plan.Key {
	return plan.Key{Date: date, MealSlotID: slot, CourseID: course}
}

func (f *fixture) rawCourse(t *testing.T, table, where string, args ...any) int64 {
	t.Helper()
	col := "course_id"
	if table == "leftovers" {
		col = "from_course_id"
	}
	var id int64
	if err := f.db.QueryRow(`SELECT `+col+` FROM `+table+` WHERE `+where, args...).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func TestCourseZeroIsStoredAsTheMainCourseAndReadsBackAsZero(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	saved, err := f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, 0), RecipeID: f.chicken, Batches: 1, Portions: 3, State: plan.StatePlanned})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Key.CourseID != 0 {
		t.Errorf("SaveMeal returned CourseID %d, want 0 (the shim form of the main Course)", saved.Key.CourseID)
	}
	if got := f.rawCourse(t, "planned_meals", "id = ?", saved.ID); got != c.main {
		t.Errorf("stored course_id = %d, want the main Course %d", got, c.main)
	}
	// The same cell by the real id of the main Course is the same row: no second meal, same id.
	again, err := f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, c.main), RecipeID: f.pasta, Batches: 1, Portions: 3, State: plan.StatePlanned})
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != saved.ID || again.Key.CourseID != 0 || again.RecipeID != f.pasta {
		t.Errorf("saving by the main Course's id = %+v, want the same row (id %d) read back with CourseID 0", again, saved.ID)
	}
	for _, course := range []int64{0, c.main} {
		m, err := f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, course))
		if err != nil || m.ID != saved.ID {
			t.Errorf("Meal(course %d) = %+v, %v; want the row %d", course, m, err, saved.ID)
		}
	}
	if n := f.count(t, `SELECT count(*) FROM planned_meals`); n != 1 {
		t.Errorf("%d rows, want 1", n)
	}
}

func (f *fixture) count(t *testing.T, q string, args ...any) int {
	t.Helper()
	var n int
	if err := f.db.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestTwoCoursesOfOneSlotAndDateAreTwoPlannedMeals(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	main, _ := f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, 0), RecipeID: f.chicken, Batches: 1, Portions: 3, State: plan.StatePlanned})
	side, err := f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, c.side), RecipeID: f.soup, Batches: 1, Portions: 3, State: plan.StatePlanned})
	if err != nil {
		t.Fatal(err)
	}
	if side.ID == main.ID || side.Key.CourseID != c.side {
		t.Fatalf("Side = %+v (main %+v): want its own row, keyed by its real id", side, main)
	}
	// Replacing the Side leaves the Main alone, and the other way round.
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, c.side), RecipeID: f.pasta, Batches: 1, Portions: 3, State: plan.StatePlanned, Pinned: true})
	got, _ := f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, 0))
	if got.RecipeID != f.chicken || got.Pinned {
		t.Errorf("Main changed by saving the Side: %+v", got)
	}
	got, _ = f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, c.side))
	if got.ID != side.ID || got.RecipeID != f.pasta || !got.Pinned {
		t.Errorf("Side = %+v, want the same row replaced and Pinned", got)
	}
	// Pin, resolve, why and delete act on one Course only.
	if err := f.st.SetPinned(ctx, f.ck("2026-11-10", f.dinner, 0), true); err != nil {
		t.Fatal(err)
	}
	if err := f.st.MarkResolved(ctx, f.ck("2026-11-10", f.dinner, c.side), plan.StateCooked); err != nil {
		t.Fatal(err)
	}
	if err := f.st.SetWhy(ctx, f.ck("2026-11-10", f.dinner, c.side), []plan.Why{{Code: "favourite"}}); err != nil {
		t.Fatal(err)
	}
	m, _ := f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, 0))
	s, _ := f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, c.side))
	if !m.Pinned || m.State != plan.StatePlanned || len(m.Why) != 0 || s.State != plan.StateCooked || len(s.Why) != 1 {
		t.Errorf("Main = %+v, Side = %+v", m, s)
	}
	if err := f.st.DeleteMeal(ctx, f.ck("2026-11-10", f.dinner, c.side)); err != nil {
		t.Fatal(err)
	}
	if _, err := f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, 0)); err != nil {
		t.Errorf("deleting the Side deleted the Main: %v", err)
	}
	if _, err := f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, c.side)); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Side after delete: %v, want ErrNotFound", err)
	}
	if err := f.st.DeleteMeal(ctx, f.ck("2026-11-10", f.dinner, c.main)); err != nil {
		t.Errorf("deleting the Main by its real id: %v", err)
	}
}

func TestMealsAreOrderedByDateSlotThenCourseOrder(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, c.dessert), RecipeID: f.soup, State: plan.StatePlanned})
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, c.side), RecipeID: f.pasta, State: plan.StatePlanned})
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, 0), RecipeID: f.chicken, State: plan.StatePlanned})
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-09", f.lunch, 0), RecipeID: f.chicken, State: plan.StatePlanned})
	meals, err := f.st.Meals(ctx, "", "")
	if err != nil {
		t.Fatal(err)
	}
	var got []plan.Key
	for _, m := range meals {
		got = append(got, m.Key)
	}
	want := []plan.Key{f.ck("2026-11-09", f.lunch, 0), f.ck("2026-11-10", f.dinner, 0), f.ck("2026-11-10", f.dinner, c.side), f.ck("2026-11-10", f.dinner, c.dessert)}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Meals order = %v, want %v (household Course order within a slot, the main Course as 0)", got, want)
	}
}

// A map keyed by the keys the callers use (SlotInfo.Key, reconcile) must find what the store returns.
func TestLookupsByPlanKeyDoNotMissUnderTheShim(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, 0), RecipeID: f.chicken, Batches: 1, State: plan.StatePlanned})
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, c.side), RecipeID: f.soup, Batches: 1, State: plan.StatePlanned})
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-11", f.lunch, c.main), RecipeID: f.pasta, Batches: 1, State: plan.StatePlanned}) // saved by the real id
	f.st.Apply(ctx, plan.Changes{Unfilled: []plan.Unfilled{
		{Key: f.ck("2026-11-12", f.dinner, 0), Reason: "no_candidates"},
		{Key: f.ck("2026-11-12", f.dinner, c.side), Reason: "no_course_recipes"},
		{Key: f.ck("2026-11-13", f.lunch, c.main), Reason: "no_attendance"}, // by the real id
	}})

	// What a SlotInfo carries today is CourseID 0 for the main Course.
	slotKeys := []plan.Key{f.ck("2026-11-10", f.dinner, 0), f.ck("2026-11-11", f.lunch, 0)}
	meals, _ := f.st.Meals(ctx, "", "")
	byKey := map[plan.Key]plan.Meal{}
	for _, m := range meals {
		byKey[m.Key] = m
	}
	for _, k := range slotKeys {
		if _, ok := byKey[k]; !ok {
			t.Errorf("a map built from Meals() misses the key %+v (keys: %v)", k, keysOf(byKey))
		}
	}
	if _, ok := byKey[f.ck("2026-11-10", f.dinner, c.side)]; !ok {
		t.Error("the Side's key (its real id) is missing")
	}
	if _, ok := byKey[f.ck("2026-11-10", f.dinner, c.main)]; ok {
		t.Error("the main Course must read back as 0, never as its real id, while the shim lasts")
	}

	// Unfilled reasons: same form, so reconcile's lookups by SlotInfo.Key hit.
	unfilled, _ := f.st.Unfilled(ctx, "", "")
	if len(unfilled) != 3 {
		t.Fatalf("Unfilled = %+v", unfilled)
	}
	uby := map[plan.Key]plan.Unfilled{}
	for _, u := range unfilled {
		uby[u.Key] = u
	}
	for _, k := range []plan.Key{f.ck("2026-11-12", f.dinner, 0), f.ck("2026-11-13", f.lunch, 0), f.ck("2026-11-12", f.dinner, c.side)} {
		if _, ok := uby[k]; !ok {
			t.Errorf("a map built from Unfilled() misses %+v (keys: %v)", k, unfilledKeys(uby))
		}
	}
	if uby[f.ck("2026-11-12", f.dinner, c.side)].Reason != "no_course_recipes" {
		t.Error("the new reason no_course_recipes must be stored as it is")
	}

	// Apply's Deletes, Upserts and ClearUnfilled accept either form of the main Course and hit the same cell.
	err := f.st.Apply(ctx, plan.Changes{
		Deletes:       []plan.Key{f.ck("2026-11-10", f.dinner, c.main)},
		Upserts:       []plan.Meal{{Key: f.ck("2026-11-11", f.lunch, 0), RecipeID: f.soup, Batches: 1, Portions: 2, State: plan.StatePlanned}},
		ClearUnfilled: []plan.Key{f.ck("2026-11-12", f.dinner, c.main), f.ck("2026-11-13", f.lunch, 0)},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, 0)); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Delete by the main Course's id left the meal: %v", err)
	}
	if _, err := f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, c.side)); err != nil {
		t.Errorf("the Side was deleted with the Main: %v", err)
	}
	if m, _ := f.st.Meal(ctx, f.ck("2026-11-11", f.lunch, c.main)); m.RecipeID != f.soup {
		t.Errorf("Upsert by 0 did not replace the meal saved by the real id: %+v", m)
	}
	if n := f.count(t, `SELECT count(*) FROM planned_meals WHERE date = '2026-11-11'`); n != 1 {
		t.Errorf("%d meals on the 11th, want 1 (0 and the real id are one cell)", n)
	}
	left, _ := f.st.Unfilled(ctx, "", "")
	if len(left) != 1 || left[0].Key != f.ck("2026-11-12", f.dinner, c.side) {
		t.Errorf("Unfilled after ClearUnfilled by either form = %+v, want only the Side's", left)
	}
}

func keysOf(m map[plan.Key]plan.Meal) []plan.Key {
	var out []plan.Key
	for k := range m {
		out = append(out, k)
	}
	return out
}

func unfilledKeys(m map[plan.Key]plan.Unfilled) []plan.Key {
	var out []plan.Key
	for k := range m {
		out = append(out, k)
	}
	return out
}

func TestApplyKeepsPinnedCookedAndSkippedPerCourse(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, 0), RecipeID: f.chicken, State: plan.StatePlanned, Pinned: true})
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, c.side), RecipeID: f.soup, State: plan.StatePlanned})
	err := f.st.Apply(ctx, plan.Changes{
		Deletes: []plan.Key{f.ck("2026-11-10", f.dinner, 0), f.ck("2026-11-10", f.dinner, c.side)},
		Upserts: []plan.Meal{{Key: f.ck("2026-11-10", f.dinner, 0), RecipeID: f.pasta, State: plan.StatePlanned}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if m, err := f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, 0)); err != nil || m.RecipeID != f.chicken {
		t.Errorf("the Pinned Main was touched: %+v, %v", m, err)
	}
	if _, err := f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, c.side)); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("the unpinned Side should have been dropped: %v", err)
	}
}

func TestRelaxedRoundTripsAndIsClearedByAnUpsertThatIsNotRelaxed(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	saved, err := f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, 0), RecipeID: f.chicken, Batches: 1, State: plan.StatePlanned,
		Relaxed: true, Why: []plan.Why{{Code: "cooldown_relaxed", Date: "2026-11-07", RecipeID: f.chicken}}})
	if err != nil || !saved.Relaxed {
		t.Fatalf("SaveMeal = %+v, %v; want Relaxed true", saved, err)
	}
	if f.count(t, `SELECT count(*) FROM planned_meals WHERE relaxed = 1`) != 1 {
		t.Error("planned_meals.relaxed was not written")
	}
	got, _ := f.st.Meal(ctx, saved.Key)
	if !got.Relaxed || len(got.Why) != 1 || got.Why[0].Code != "cooldown_relaxed" {
		t.Errorf("Meal = %+v", got)
	}
	// A relaxed Side beside it, and a run's upsert that is strict now: it loses the flag.
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, c.side), RecipeID: f.soup, State: plan.StatePlanned, Relaxed: true})
	if err := f.st.Apply(ctx, plan.Changes{Upserts: []plan.Meal{{Key: f.ck("2026-11-10", f.dinner, 0), RecipeID: f.chicken, Batches: 1, State: plan.StatePlanned}}}); err != nil {
		t.Fatal(err)
	}
	if m, _ := f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, 0)); m.Relaxed {
		t.Error("the strict upsert must clear Relaxed")
	}
	if m, _ := f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, c.side)); !m.Relaxed {
		t.Error("the Side's flag must be untouched")
	}
	meals, _ := f.st.Meals(ctx, "", "")
	if len(meals) != 2 || meals[0].Relaxed || !meals[1].Relaxed {
		t.Errorf("Meals() = %+v: Relaxed must come back from the list read too", meals)
	}
}

func TestLeftoverSourcesAndDependantsUseTheCourseOfTheCookedMeal(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	mainSrc, sideSrc := f.ck("2026-11-10", f.dinner, 0), f.ck("2026-11-10", f.dinner, c.side)
	f.st.SaveMeal(ctx, plan.Meal{Key: mainSrc, RecipeID: f.chicken, Batches: 1, State: plan.StatePlanned})
	f.st.SaveMeal(ctx, plan.Meal{Key: sideSrc, RecipeID: f.soup, Batches: 1, State: plan.StatePlanned})
	// Planned Meals served from each source (the Side's Leftover feeds a Starter on the 12th).
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-11", f.dinner, 0), RecipeID: f.chicken, Portions: 2, State: plan.StatePlanned, From: &plan.Source{From: mainSrc}})
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-12", f.dinner, c.starter), RecipeID: f.soup, Portions: 2, State: plan.StatePlanned, From: &plan.Source{From: sideSrc}})

	m, _ := f.st.Meal(ctx, f.ck("2026-11-11", f.dinner, 0))
	if m.From == nil || m.From.From != mainSrc {
		t.Errorf("source of the main meal = %+v, want %+v (the main Course reads back as 0)", m.From, mainSrc)
	}
	s, _ := f.st.Meal(ctx, f.ck("2026-11-12", f.dinner, c.starter))
	if s.From == nil || s.From.From != sideSrc {
		t.Errorf("source of the Starter = %+v, want %+v", s.From, sideSrc)
	}
	for _, src := range []plan.Key{mainSrc, f.ck("2026-11-10", f.dinner, c.main)} {
		deps, err := f.st.Dependants(ctx, src)
		if err != nil || len(deps) != 1 || deps[0].Key != f.ck("2026-11-11", f.dinner, 0) {
			t.Errorf("Dependants(%+v) = %+v, %v; want just the main meal of the 11th", src, deps, err)
		}
	}
	if deps, _ := f.st.Dependants(ctx, sideSrc); len(deps) != 1 || deps[0].Key.CourseID != c.starter {
		t.Errorf("Dependants(Side source) = %+v", deps)
	}

	lm, err := f.st.AddLeftover(ctx, plan.Leftover{RecipeID: f.chicken, From: mainSrc, Portions: 4, CookedOn: "2026-11-10", UseBy: "2026-11-13"})
	if err != nil {
		t.Fatal(err)
	}
	ls, _ := f.st.AddLeftover(ctx, plan.Leftover{RecipeID: f.soup, From: sideSrc, Portions: 4, CookedOn: "2026-11-10", UseBy: "2026-11-13"})
	if lm.From != mainSrc || ls.From != sideSrc {
		t.Errorf("AddLeftover returned From %+v and %+v", lm.From, ls.From)
	}
	if got := f.rawCourse(t, "leftovers", "id = ?", lm.ID); got != c.main {
		t.Errorf("leftovers.from_course_id = %d, want the main Course %d", got, c.main)
	}
	if got := f.rawCourse(t, "leftovers", "id = ?", ls.ID); got != c.side {
		t.Errorf("leftovers.from_course_id = %d, want Side %d", got, c.side)
	}
	if err := f.st.LinkLeftover(ctx, f.ck("2026-11-10", f.dinner, c.main), lm.ID); err != nil {
		t.Fatal(err)
	}
	if m, _ := f.st.Meal(ctx, f.ck("2026-11-11", f.dinner, 0)); m.From.LeftoverID != lm.ID {
		t.Errorf("LinkLeftover by the real id missed the dependant: %+v", m.From)
	}
	if s, _ := f.st.Meal(ctx, f.ck("2026-11-12", f.dinner, c.starter)); s.From.LeftoverID != 0 {
		t.Error("LinkLeftover of the main source linked the Side's dependant")
	}

	// LeftoverFrom finds the Leftover of that Course's Cooked meal only.
	for _, k := range []plan.Key{mainSrc, f.ck("2026-11-10", f.dinner, c.main)} {
		if l, ok, err := f.st.LeftoverFrom(ctx, k); err != nil || !ok || l.ID != lm.ID || l.From != mainSrc {
			t.Errorf("LeftoverFrom(%+v) = %+v, %v, %v; want the main Leftover with From %+v", k, l, ok, err, mainSrc)
		}
	}
	if l, ok, _ := f.st.LeftoverFrom(ctx, sideSrc); !ok || l.ID != ls.ID || l.From != sideSrc {
		t.Errorf("LeftoverFrom(Side) = %+v, %v", l, ok)
	}
	if _, ok, _ := f.st.LeftoverFrom(ctx, f.ck("2026-11-10", f.dinner, c.dessert)); ok {
		t.Error("LeftoverFrom of a Course that cooked nothing found a Leftover")
	}
	all, _ := f.st.Leftovers(ctx)
	for _, l := range all {
		if l.ID == lm.ID && l.From.CourseID != 0 || l.ID == ls.ID && l.From.CourseID != c.side {
			t.Errorf("Leftovers() From = %+v", l.From)
		}
	}
	if l, _ := f.st.Leftover(ctx, lm.ID); l.From != mainSrc {
		t.Errorf("Leftover() From = %+v, want %+v", l.From, mainSrc)
	}
	srcs, err := f.st.LeftoverSources(ctx, []int64{lm.ID, ls.ID})
	if err != nil || srcs[lm.ID] != mainSrc || srcs[ls.ID] != sideSrc {
		t.Errorf("LeftoverSources = %v, %v; want %v and %v", srcs, err, mainSrc, sideSrc)
	}
}

func TestSlotRulesCarryTheirCourse(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	mainRule, err := f.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: f.dinner, Tag: "pizza"}) // CourseID 0: the main Course
	if err != nil || mainRule.CourseID != 0 {
		t.Fatalf("AddSlotRule(0) = %+v, %v", mainRule, err)
	}
	if got := f.rawCourse(t, "slot_rules", "id = ?", mainRule.ID); got != c.main {
		t.Errorf("slot_rules.course_id = %d, want the main Course %d", got, c.main)
	}
	sideRule, err := f.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: f.dinner, CourseID: c.side, Tag: "pizza"}) // the same Tag in another Course is not a duplicate
	if err != nil || sideRule.CourseID != c.side {
		t.Fatalf("AddSlotRule(Side) = %+v, %v", sideRule, err)
	}
	if _, err := f.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: f.dinner, CourseID: c.main, Tag: "pizza"}); !errors.Is(err, store.ErrDuplicateRule) {
		t.Errorf("the main Course's rule by its real id: err = %v, want ErrDuplicateRule", err)
	}
	if _, err := f.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: f.dinner, CourseID: c.side, Tag: "pizza"}); !errors.Is(err, store.ErrDuplicateRule) {
		t.Errorf("a repeat in Side: err = %v, want ErrDuplicateRule", err)
	}
	if _, err := f.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: f.dinner, CourseID: 999, Tag: "x"}); !errors.Is(err, store.ErrUnknownRef) {
		t.Errorf("unknown Course: err = %v, want ErrUnknownRef", err)
	}
	rules, _ := f.st.SlotRules(ctx)
	if want := []plan.SlotRule{mainRule, sideRule}; !reflect.DeepEqual(rules, want) {
		t.Errorf("SlotRules = %+v, want %+v", rules, want)
	}
}

func TestUnfilledCarriesTheCourseAndTheNewReason(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	want := []plan.Unfilled{
		{Key: f.ck("2026-11-13", f.dinner, 0), Reason: "no_candidates", SlotRuleClaimed: true, Eliminated: plan.Eliminations{Considered: 3, Exclusion: 1, AdvanceStep: 2}},
		{Key: f.ck("2026-11-13", f.dinner, c.side), Reason: "no_course_recipes"},
		{Key: f.ck("2026-11-13", f.dinner, c.dessert), Reason: "no_attendance"},
	}
	if err := f.st.Apply(ctx, plan.Changes{Unfilled: want}); err != nil {
		t.Fatal(err)
	}
	got, err := f.st.Unfilled(ctx, "", "")
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("Unfilled = %+v, %v; want %+v", got, err, want)
	}
	// Re-applying one cell replaces that Course's reason only.
	f.st.Apply(ctx, plan.Changes{Unfilled: []plan.Unfilled{{Key: f.ck("2026-11-13", f.dinner, c.side), Reason: "no_candidates"}}})
	got, _ = f.st.Unfilled(ctx, "", "")
	if len(got) != 3 || got[1].Reason != "no_candidates" || got[0].Reason != "no_candidates" || got[2].Reason != "no_attendance" {
		t.Errorf("after replacing the Side's reason: %+v", got)
	}
	if err := f.st.Apply(ctx, plan.Changes{Unfilled: []plan.Unfilled{{Key: f.ck("2026-11-14", f.dinner, 999), Reason: "no_candidates"}}}); !errors.Is(err, store.ErrUnknownRef) {
		t.Errorf("a reason for an unknown Course: %v, want ErrUnknownRef", err)
	}
}

func TestHistoryCountsARecipeCookedInAnyCourse(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-05", f.dinner, c.side), RecipeID: f.soup, Batches: 1, State: plan.StatePlanned})
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-07", f.dinner, 0), RecipeID: f.soup, Batches: 1, State: plan.StatePlanned})
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-06", f.dinner, c.dessert), RecipeID: f.pasta, Batches: 1, State: plan.StatePlanned})
	got, err := f.st.History(ctx, "2026-11-09")
	if err != nil {
		t.Fatal(err)
	}
	byRecipe := map[int64]string{}
	for _, h := range got {
		byRecipe[h.RecipeID] = h.Date
	}
	if byRecipe[f.soup] != "2026-11-07" || byRecipe[f.pasta] != "2026-11-06" || len(byRecipe) != 2 {
		t.Errorf("History = %v: Cool-down counts a Recipe across Courses (Soup 7th, Pasta 6th)", byRecipe)
	}
}

func TestTheShimFollowsTheMainFlagWhenItMoves(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, 0), RecipeID: f.chicken, Batches: 1, State: plan.StatePlanned})
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, c.side), RecipeID: f.soup, Batches: 1, State: plan.StatePlanned})
	// Make main: the flag moves in one step; no Planned Meal changes.
	f.db.Exec(`UPDATE courses SET is_main = 0 WHERE id = ?`, c.main)
	f.db.Exec(`UPDATE courses SET is_main = 1 WHERE id = ?`, c.side)
	m0, err := f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, 0))
	if err != nil || m0.RecipeID != f.soup {
		t.Errorf("after Make main, CourseID 0 is the new main Course (the Soup row): %+v, %v", m0, err)
	}
	old, err := f.st.Meal(ctx, f.ck("2026-11-10", f.dinner, c.main))
	if err != nil || old.RecipeID != f.chicken || old.Key.CourseID != c.main {
		t.Errorf("the former main Course is an ordinary Course now: %+v, %v (key must carry its real id)", old, err)
	}
}

func TestSaveMealRejectsAnUnknownCourse(t *testing.T) {
	f := newFixture(t)
	if _, err := f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, 999), RecipeID: f.chicken, State: plan.StatePlanned}); !errors.Is(err, store.ErrUnknownRef) {
		t.Errorf("err = %v, want ErrUnknownRef", err)
	}
}

func TestPlannedCheckerKnowsRecipesPlannedOnlyInASideCourse(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	f.st.SaveMeal(ctx, plan.Meal{Key: f.ck("2026-11-10", f.dinner, c.side), RecipeID: f.soup, Batches: 1, State: plan.StatePlanned})
	f.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: f.dinner, CourseID: c.dessert, RecipeID: f.pasta})
	for id, want := range map[int64]bool{f.soup: true, f.pasta: true, f.chicken: false} {
		got, err := store.Checker{}.WasPlanned(ctx, f.db, id)
		if err != nil || got != want {
			t.Errorf("WasPlanned(%d) = %v, %v; want %v", id, got, err, want)
		}
	}
}
