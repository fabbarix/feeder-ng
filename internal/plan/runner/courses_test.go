package runner_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/plantest"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

// The runner with Courses (ADR 0008, ADR 0009, docs/dev/design/crs-b.md §6). The plan store is the real one
// (Course-keyed, the main Course by its real id); the Sources are the fake, which serves each Meal Slot's
// Courses and Course Attendance through SlotCourses.

// cenv is an env whose fake household can serve Courses. It starts with no Recipes: each test adds its own.
type cenv struct {
	*env
	main, side, starter, dessert int64
}

func newCourseEnv(t *testing.T) *cenv {
	t.Helper()
	e := newEnv(t)
	e.src.recipes = nil
	return &cenv{env: e,
		main: plantest.CourseID(t, e.db, "Main"), side: plantest.CourseID(t, e.db, "Side"),
		starter: plantest.CourseID(t, e.db, "Starter"), dessert: plantest.CourseID(t, e.db, "Dessert")}
}

// recipe adds a yield-2 Recipe marked with the given Courses.
func (c *cenv) recipe(name string, whole bool, courses ...int64) int64 {
	c.t.Helper()
	id := plantest.SeedRecipe(c.t, c.db, name, 2)
	plantest.SetRecipeCourses(c.t, c.db, id, courses...)
	plantest.SetWholeMeal(c.t, c.db, id, whole)
	c.rec[name] = id
	c.src.recipes = append(c.src.recipes, planner.Recipe{ID: planner.RecipeID(id), Yield: 2, CourseIDs: courses, WholeMeal: whole})
	return id
}

// cspec is one Course a Meal Slot serves. att nil: both Members eat it; non-nil: exactly those (empty: nobody).
type cspec struct {
	course   int64
	optional bool
	att      []plan.Attendee
}

func (c *cenv) eating(course int64, members ...int64) cspec {
	att := []plan.Attendee{}
	for _, m := range members {
		att = append(att, plan.Attendee{MemberID: m, Factor: 1})
	}
	return cspec{course: course, att: att}
}

// serve makes every Dinner serve these Courses, in this order.
func (c *cenv) serve(specs ...cspec) {
	c.t.Helper()
	var list []plan.SlotCourse
	var seeds []plantest.SlotCourseSeed
	for _, sp := range specs {
		att := sp.att
		if att == nil {
			att = []plan.Attendee{{MemberID: 1, Factor: 1}, {MemberID: 2, Factor: 1}}
		}
		list = append(list, plan.SlotCourse{CourseID: sp.course, Main: sp.course == c.main, Optional: sp.optional, Attendance: att})
		seeds = append(seeds, plantest.SlotCourseSeed{CourseID: sp.course, Optional: sp.optional})
	}
	c.src.mu.Lock()
	c.src.courses = map[string][]plan.SlotCourse{}
	for _, id := range c.slotIDs {
		c.src.courses[attKey(id, "")] = list
	}
	c.src.mu.Unlock()
	for _, id := range c.slotIDs {
		plantest.SetSlotCourses(c.t, c.db, id, seeds...)
	}
}

func (c *cenv) cell(day int, course int64) plan.Key {
	k := c.key(day)
	k.CourseID = course
	return k
}

// mealIn is the stored Planned Meal of the Course on a day.
func (c *cenv) mealIn(day int, course int64) (plan.Meal, bool) {
	c.t.Helper()
	want := c.cell(day, course)
	for _, m := range c.planMeals() {
		if m.Key == want {
			return m, true
		}
	}
	return plan.Meal{}, false
}

func (c *cenv) mustMeal(day int, course int64) plan.Meal {
	c.t.Helper()
	m, ok := c.mealIn(day, course)
	if !ok {
		c.t.Fatalf("no Planned Meal in Course %d on 2026-11-%02d; stored: %+v", course, day, c.planMeals())
	}
	return m
}

func (c *cenv) oneDay() { c.src.settings.HorizonDays = 1 }

func hasChip(m plan.Meal, code string) bool {
	for _, w := range m.Why {
		if w.Code == code {
			return true
		}
	}
	return false
}

func idSet(ids ...int64) map[int64]bool {
	out := map[int64]bool{}
	for _, id := range ids {
		out[id] = true
	}
	return out
}

func TestPlanStoresOnePlannedMealPerCourseOfEverySlot(t *testing.T) {
	c := newCourseEnv(t)
	mains := idSet(c.recipe("roast", false, c.main), c.recipe("pie", false, c.main), c.recipe("curry", false, c.main))
	sides := idSet(c.recipe("rice", false, c.side), c.recipe("beans", false, c.side), c.recipe("slaw", false, c.side))
	c.serve(cspec{course: c.main}, cspec{course: c.side})
	sum, err := c.r.Plan(ctx, plan.ReasonNightly)
	if err != nil {
		t.Fatal(err)
	}
	if sum.Placed != 6 || sum.Unfilled != 0 {
		t.Errorf("Summary = %+v, want 6 placed (a Main and a Side on each of 3 days) and none unfilled", sum)
	}
	if n := len(c.planMeals()); n != 6 {
		t.Fatalf("%d meals stored, want 6: %+v", n, c.planMeals())
	}
	for day := 9; day <= 11; day++ {
		m, s := c.mustMeal(day, c.main), c.mustMeal(day, c.side)
		if !mains[m.RecipeID] {
			t.Errorf("the Main on the %dth is Recipe %d, which is not a Main Recipe", day, m.RecipeID)
		}
		if !sides[s.RecipeID] {
			t.Errorf("the Side on the %dth is Recipe %d, which is not a Side Recipe", day, s.RecipeID)
		}
		if m.Portions != 2 || s.Portions != 2 || m.State != plan.StatePlanned || s.State != plan.StatePlanned {
			t.Errorf("meals on the %dth = %+v and %+v; want planned, 2 portions each", day, m, s)
		}
		if m.Key.CourseID != c.main || s.Key.CourseID != c.side {
			t.Errorf("stored Course keys = %d and %d, want the real ids %d and %d", m.Key.CourseID, s.Key.CourseID, c.main, c.side)
		}
	}
}

func TestPlanWholeMealInTheMainCourseCoversTheOtherCourses(t *testing.T) {
	c := newCourseEnv(t)
	c.oneDay()
	feast := c.recipe("feast", true, c.main)
	c.recipe("rice", false, c.side)
	c.recipe("beans", false, c.side)
	c.serve(cspec{course: c.main}, cspec{course: c.side})
	c.mustPlan()
	if got := c.mustMeal(9, c.main); got.RecipeID != feast {
		t.Errorf("the Main is Recipe %d, want the only Main Recipe, the Whole meal %d", got.RecipeID, feast)
	}
	if _, ok := c.mealIn(9, c.side); ok {
		t.Error("a Side was planned beside a Whole meal")
	}
	if n := len(c.planMeals()); n != 1 {
		t.Errorf("%d meals stored, want 1", n)
	}
	if un, _ := c.st.Unfilled(ctx, "", ""); len(un) != 0 {
		t.Errorf("a Course covered by a Whole meal has no 'couldn't plan' reason: %+v", un)
	}
}

func TestSetMealOfAWholeMealDeletesTheUnpinnedSide(t *testing.T) {
	c := newCourseEnv(t)
	c.oneDay()
	c.recipe("roast", false, c.main)
	feast := c.recipe("feast", true, c.main)
	c.recipe("rice", false, c.side)
	c.serve(cspec{course: c.main}, cspec{course: c.side})
	c.src.archive(feast) // the planner cannot choose the Whole meal yet
	c.mustPlan()
	if _, ok := c.mealIn(9, c.side); !ok {
		t.Fatal("no Side planned beside the roast")
	}
	for i := range c.src.recipes {
		c.src.recipes[i].Archived = false
	}
	got, err := c.r.SetMeal(ctx, c.cell(9, c.main), feast, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.RecipeID != feast || !got.Pinned {
		t.Errorf("SetMeal = %+v, want the Whole meal, pinned", got)
	}
	if _, ok := c.mealIn(9, c.side); ok {
		t.Error("the unpinned Side stayed beside a Whole meal")
	}
	if n := len(c.planMeals()); n != 1 {
		t.Errorf("%d meals stored, want only the Whole meal: %+v", n, c.planMeals())
	}
}

func TestOptionalCourseWithNothingThatFitsStoresNothingAndNoReason(t *testing.T) {
	c := newCourseEnv(t)
	c.recipe("roast", false, c.main)
	c.recipe("pie", false, c.main)
	c.recipe("curry", false, c.main)
	c.serve(cspec{course: c.main}, cspec{course: c.dessert, optional: true})
	c.mustPlan()
	if n := len(c.planMeals()); n != 3 {
		t.Errorf("%d meals stored, want the 3 Mains only: %+v", n, c.planMeals())
	}
	if un, _ := c.st.Unfilled(ctx, "", ""); len(un) != 0 {
		t.Errorf("an optional Course with no Recipe has no reason, not even no_course_recipes: %+v", un)
	}
}

func TestOptionalCourseIsPlannedWhenARecipeFits(t *testing.T) {
	c := newCourseEnv(t)
	c.recipe("roast", false, c.main)
	c.recipe("pie", false, c.main)
	c.recipe("curry", false, c.main)
	desserts := idSet(c.recipe("tart", false, c.dessert), c.recipe("flan", false, c.dessert), c.recipe("gelato", false, c.dessert))
	c.serve(cspec{course: c.main}, cspec{course: c.dessert, optional: true})
	c.mustPlan()
	for day := 9; day <= 11; day++ {
		if d := c.mustMeal(day, c.dessert); !desserts[d.RecipeID] {
			t.Errorf("the Dessert on the %dth is Recipe %d, not a Dessert Recipe", day, d.RecipeID)
		}
	}
}

func TestCourseWithoutRecipesIsCouldntPlanWithNoCourseRecipes(t *testing.T) {
	c := newCourseEnv(t)
	c.recipe("roast", false, c.main)
	c.recipe("pie", false, c.main)
	c.recipe("curry", false, c.main)
	c.serve(cspec{course: c.main}, cspec{course: c.side})
	c.mustPlan()
	if n := len(c.planMeals()); n != 3 {
		t.Errorf("%d meals stored, want the 3 Mains: %+v", n, c.planMeals())
	}
	un, err := c.st.Unfilled(ctx, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(un) != 3 {
		t.Fatalf("%d 'couldn't plan' entries, want one Side per day: %+v", len(un), un)
	}
	for _, u := range un {
		if u.Key.CourseID != c.side || u.Reason != string(planner.UnfilledNoCourseRecipes) {
			t.Errorf("unfilled %+v, want the Side cell with reason no_course_recipes", u)
		}
	}
}

func TestCourseAttendanceOptOutDecidesPortionsAndExclusions(t *testing.T) {
	setup := func(t *testing.T) (*cenv, int64) {
		c := newCourseEnv(t)
		c.oneDay()
		c.recipe("roast", false, c.main)
		nuts := c.recipe("nutty slaw", false, c.side)
		c.src.prefs = map[int64]planner.Preferences{2: {ExcludedRecipes: []planner.RecipeID{planner.RecipeID(nuts)}}}
		return c, nuts
	}
	t.Run("a Member who opts out of the Side does not make its Exclusions count there, and eats no portion of it", func(t *testing.T) {
		c, nuts := setup(t)
		c.serve(cspec{course: c.main}, c.eating(c.side, 1))
		c.mustPlan()
		if s := c.mustMeal(9, c.side); s.RecipeID != nuts || s.Portions != 1 {
			t.Errorf("Side = %+v, want the slaw Member 2 excludes, for the 1 portion of Member 1 alone", s)
		}
		if m := c.mustMeal(9, c.main); m.Portions != 2 {
			t.Errorf("Main = %+v, want 2 portions: nobody opted out of it", m)
		}
	})
	t.Run("the same Recipe is excluded in the Side when that Member eats it", func(t *testing.T) {
		c, _ := setup(t)
		c.serve(cspec{course: c.main}, cspec{course: c.side})
		c.mustPlan()
		if _, ok := c.mealIn(9, c.side); ok {
			t.Error("planned a Side that Member 2 excludes although Member 2 eats it")
		}
		un, _ := c.st.Unfilled(ctx, "", "")
		if len(un) != 1 || un[0].Key.CourseID != c.side {
			t.Errorf("unfilled = %+v, want the Side only", un)
		}
	})
}

func TestCourseAttendanceChangeReplansThePortions(t *testing.T) {
	c := newCourseEnv(t)
	c.oneDay()
	c.recipe("roast", false, c.main)
	c.recipe("rice", false, c.side)
	c.recipe("beans", false, c.side)
	c.serve(cspec{course: c.main}, c.eating(c.side, 1))
	c.mustPlan()
	side := c.mustMeal(9, c.side)
	if side.Portions != 1 {
		t.Fatalf("Side portions = %v, want 1 (Member 2 opts out)", side.Portions)
	}
	main := c.mustMeal(9, c.main)

	c.serve(cspec{course: c.main}, cspec{course: c.side}) // Member 2 eats the Side again
	if _, err := c.r.Plan(ctx, plan.ReasonAttendanceChanged); err != nil {
		t.Fatal(err)
	}
	// The Side's Batches still cover 2 portions (yield 2), so it is the same Planned Meal with updated Portions.
	if got := c.mustMeal(9, c.side); got.Portions != 2 || got.ID != side.ID || got.RecipeID != side.RecipeID {
		t.Errorf("Side = %+v after Member 2 came back, want the same meal (ID %d, Recipe %d) with 2 portions", got, side.ID, side.RecipeID)
	}
	if got := c.mustMeal(9, c.main); got.ID != main.ID || got.RecipeID != main.RecipeID {
		t.Errorf("the Main changed: %+v -> %+v; only the Side's attendance changed", main, got)
	}

	c.serve(cspec{course: c.main}, c.eating(c.side)) // everybody opts out of the Side
	if _, err := c.r.Plan(ctx, plan.ReasonAttendanceChanged); err != nil {
		t.Fatal(err)
	}
	if _, ok := c.mealIn(9, c.side); ok {
		t.Error("a Side nobody eats stayed planned")
	}
	if un, _ := c.st.Unfilled(ctx, "", ""); len(un) != 0 {
		t.Errorf("a Course nobody eats has no 'couldn't plan' reason: %+v", un)
	}
	if _, ok := c.mealIn(9, c.main); !ok {
		t.Error("the Main went with the Side")
	}
}

func TestPortionFactorTweakOfOneCourseKeepsThePlannedMeal(t *testing.T) {
	c := newCourseEnv(t)
	c.oneDay()
	c.recipe("roast", false, c.main)
	c.recipe("rice", false, c.side)
	half := []plan.Attendee{{MemberID: 1, Factor: 0.5}, {MemberID: 2, Factor: 0.5}}
	c.serve(cspec{course: c.main}, cspec{course: c.side, att: half})
	c.mustPlan()
	side, main := c.mustMeal(9, c.side), c.mustMeal(9, c.main)
	if side.Portions != 1 {
		t.Fatalf("Side portions = %v, want 1 (two half portions)", side.Portions)
	}

	c.serve(cspec{course: c.main}, cspec{course: c.side}) // the Side's Portion Factors go back to 1
	if _, err := c.r.Plan(ctx, plan.ReasonAttendanceChanged); err != nil {
		t.Fatal(err)
	}
	if got := c.mustMeal(9, c.side); got.Portions != 2 || got.ID != side.ID || got.RecipeID != side.RecipeID {
		t.Errorf("Side = %+v, want the same meal (ID %d, Recipe %d) with 2 portions: its Batches still cover", got, side.ID, side.RecipeID)
	}
	if got := c.mustMeal(9, c.main); got.ID != main.ID || got.RecipeID != main.RecipeID {
		t.Errorf("the Main changed: %+v -> %+v", main, got)
	}
}

func TestSetMealClearsTheCoursesWalkedAfterItNotThoseListedAfterIt(t *testing.T) {
	c := newCourseEnv(t)
	c.oneDay()
	for _, n := range []string{"one", "two", "three"} {
		c.recipe(n, false, c.main, c.starter)
	}
	// The slot lists Starter, Main, Side; the walk takes the main Course first, then Starter, then Side.
	c.serve(cspec{course: c.starter}, cspec{course: c.main}, cspec{course: c.side})
	c.mustPlan()
	starter, main := c.mustMeal(9, c.starter), c.mustMeal(9, c.main)
	if starter.RecipeID == main.RecipeID {
		t.Fatalf("set-up: Main and Starter share a Recipe: %+v", c.planMeals())
	}
	// Pinning the Main to the Starter's Recipe clears every unpinned Course walked after the Main, the Starter
	// included although it is listed before the Main. It is replanned, so it cannot keep the Recipe the Main took.
	if _, err := c.r.SetMeal(ctx, c.cell(9, c.main), starter.RecipeID, nil); err != nil {
		t.Fatal(err)
	}
	got, ok := c.mealIn(9, c.starter)
	if !ok {
		t.Fatalf("no Starter after SetMeal; stored: %+v", c.planMeals())
	}
	if got.RecipeID == starter.RecipeID {
		t.Errorf("the Starter kept Recipe %d beside the Pinned Main: it is walked after the Main, so SetMeal must clear it", starter.RecipeID)
	}
	if pinned, ok := c.mealIn(9, c.main); !ok || pinned.RecipeID != starter.RecipeID || got.RecipeID == pinned.RecipeID {
		t.Errorf("the Starter (Recipe %d) must differ from the Pinned Main (Recipe %d, want %d)", got.RecipeID, pinned.RecipeID, starter.RecipeID)
	}
}

func TestKeptMealIsCheckedAgainstTheSlotRulesOfItsOwnCourse(t *testing.T) {
	c := newCourseEnv(t)
	c.oneDay()
	roast := c.recipe("roast", false, c.main)
	plain := c.recipe("plain rice", false, c.side)
	c.serve(cspec{course: c.main}, cspec{course: c.side})
	c.mustPlan()
	main := c.mustMeal(9, c.main)

	green := c.recipe("green beans", false, c.side)
	for i := range c.src.recipes {
		if int64(c.src.recipes[i].ID) == green {
			c.src.recipes[i].Tags = []planner.Tag{"veg"}
		}
	}
	if _, err := c.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: c.slotIDs[1], CourseID: c.side, Tag: "veg"}); err != nil {
		t.Fatal(err)
	}
	if _, err := c.r.Plan(ctx, plan.ReasonRecipeChanged); err != nil {
		t.Fatal(err)
	}
	if s := c.mustMeal(9, c.side); s.RecipeID != green {
		t.Errorf("Side = Recipe %d, want the veg Recipe %d: the kept plain rice (%d) breaks the Side's Slot Rule", s.RecipeID, green, plain)
	}
	if m := c.mustMeal(9, c.main); m.ID != main.ID || m.RecipeID != roast {
		t.Errorf("the Main was replanned: %+v -> %+v; the Side's Slot Rule says nothing about it", main, m)
	}
}

// Relaxed picks (ADR 0009): the one pasta Recipe is cooked on Monday and, with a 7-day Cool-down, again on Tuesday.

func relaxedEnv(t *testing.T) *env {
	t.Helper()
	e := newEnv(t)
	e.src.settings.HorizonDays = 2
	var pasta []planner.Recipe
	for _, rc := range e.src.recipes {
		if int64(rc.ID) == e.rec["pasta"] {
			pasta = append(pasta, rc)
		}
	}
	e.src.recipes = pasta
	return e
}

func TestRelaxedPickIsStoredWithItsFlagAndChipAndReadBack(t *testing.T) {
	e := relaxedEnv(t)
	e.mustPlan()
	mon, tue := e.meal(9), e.meal(10)
	if mon.Relaxed || hasChip(mon, "cooldown_relaxed") {
		t.Errorf("Monday's pasta is a strict pick, got %+v", mon)
	}
	if tue.RecipeID != e.rec["pasta"] || !tue.Relaxed {
		t.Fatalf("Tuesday = %+v, want pasta again as a relaxed pick", tue)
	}
	if n := len(tue.Why); n == 0 || tue.Why[n-1].Code != "cooldown_relaxed" || tue.Why[n-1].RecipeID != e.rec["pasta"] || tue.Why[n-1].Date != "2026-11-09" {
		t.Errorf("Tuesday's chips = %+v, want the cooldown_relaxed chip last, naming the 9th", tue.Why)
	}
	for _, m := range e.planMeals() { // read back through the list too
		if m.Key == tue.Key && !m.Relaxed {
			t.Error("Meals() lost the relaxed flag")
		}
	}
}

func TestKeptRelaxedPickLosesFlagAndChipWhenTheRuleNoLongerBreaks(t *testing.T) {
	e := relaxedEnv(t)
	e.mustPlan()
	tue := e.meal(10)
	if !tue.Relaxed {
		t.Fatalf("setup: Tuesday = %+v, want a relaxed pick", tue)
	}
	e.src.settings.DefaultCooldownDays = 1 // a day apart is now outside the Cool-down
	if _, err := e.r.Plan(ctx, plan.ReasonRecipeChanged); err != nil {
		t.Fatal(err)
	}
	got := e.meal(10)
	if got.ID != tue.ID || got.RecipeID != tue.RecipeID {
		t.Errorf("Tuesday was replanned: %+v -> %+v; it is still valid", tue, got)
	}
	if got.Relaxed || hasChip(got, "cooldown_relaxed") {
		t.Errorf("Tuesday = %+v, want the flag and the cooldown_relaxed chip gone", got)
	}
}

func TestKeptRelaxedPickIsKeptAsRelaxedWhileNoStrictRecipeExists(t *testing.T) {
	e := relaxedEnv(t)
	e.mustPlan()
	tue := e.meal(10)
	if _, err := e.r.Plan(ctx, plan.ReasonRecipeChanged); err != nil {
		t.Fatal(err)
	}
	if got := e.meal(10); got.ID != tue.ID || !got.Relaxed || !hasChip(got, "cooldown_relaxed") {
		t.Errorf("Tuesday = %+v, want the same relaxed pick, flag and chip kept", got)
	}
}

func TestKeptRelaxedPickIsReplacedWhenAStrictRecipeAppears(t *testing.T) {
	e := relaxedEnv(t)
	e.mustPlan()
	if !e.meal(10).Relaxed {
		t.Fatal("setup: Tuesday is not a relaxed pick")
	}
	soup := plantest.SeedRecipe(t, e.db, "tomato soup", 2)
	plantest.SetRecipeCourses(t, e.db, soup, e.main)
	e.src.recipes = append(e.src.recipes, planner.Recipe{ID: planner.RecipeID(soup), Yield: 2, CourseIDs: []int64{e.main}})
	if _, err := e.r.Plan(ctx, plan.ReasonRecipeChanged); err != nil {
		t.Fatal(err)
	}
	// The keep check sees the two pastas inside each other's Cool-down; with a strict Recipe available the first
	// one it checks is dropped and refilled with it, and the other is then no longer in anybody's Cool-down.
	mon, tue := e.meal(9), e.meal(10)
	if mon.RecipeID == tue.RecipeID {
		t.Errorf("both days are Recipe %d, want pasta and the new soup once each", mon.RecipeID)
	}
	if got := idSet(mon.RecipeID, tue.RecipeID); !got[soup] || !got[e.rec["pasta"]] {
		t.Errorf("Recipes planned = %d and %d, want pasta (%d) and soup (%d)", mon.RecipeID, tue.RecipeID, e.rec["pasta"], soup)
	}
	for _, m := range []plan.Meal{mon, tue} {
		if m.Relaxed || hasChip(m, "cooldown_relaxed") {
			t.Errorf("meal %+v is still relaxed after a strict Recipe appeared", m)
		}
	}
}

// Swap: strict alternatives first, then relaxed ones, each flagged.

func TestAlternativesCarryRelaxedAndOfferThemLast(t *testing.T) {
	e := newEnv(t)
	e.src.settings.HorizonDays = 2
	var three []planner.Recipe
	for _, name := range []string{"pasta", "soup", "curry"} {
		for _, rc := range e.src.recipes {
			if int64(rc.ID) == e.rec[name] {
				three = append(three, rc)
			}
		}
	}
	e.src.recipes = three
	e.mustPlan()
	mon, tue := e.meal(9).RecipeID, e.meal(10).RecipeID
	var third int64
	for _, id := range []int64{e.rec["pasta"], e.rec["soup"], e.rec["curry"]} {
		if id != mon && id != tue {
			third = id
		}
	}
	alts, err := e.r.Alternatives(ctx, e.key(10))
	if err != nil {
		t.Fatal(err)
	}
	if len(alts) != 2 {
		t.Fatalf("%d alternatives, want 2 (the unused Recipe, then Monday's inside its Cool-down): %+v", len(alts), alts)
	}
	if alts[0].RecipeID != third || alts[0].Relaxed {
		t.Errorf("first alternative = %+v, want the unused Recipe %d, strict", alts[0], third)
	}
	for _, w := range alts[0].Why {
		if w.Code == "cooldown_relaxed" || w.Code == "variety_relaxed" {
			t.Errorf("a strict alternative carries a relaxed chip: %+v", alts[0].Why)
		}
	}
	last := alts[1]
	if last.RecipeID != mon || !last.Relaxed {
		t.Fatalf("second alternative = %+v, want Monday's Recipe %d as a relaxed one", last, mon)
	}
	if n := len(last.Why); n == 0 || last.Why[n-1].Code != "cooldown_relaxed" {
		t.Errorf("relaxed alternative chips = %+v, want cooldown_relaxed last", last.Why)
	}
}

func TestAlternativesForASideCourseOfferRelaxedSidesLast(t *testing.T) {
	c := newCourseEnv(t)
	c.src.settings.HorizonDays = 2
	mains := idSet(c.recipe("roast", false, c.main), c.recipe("pie", false, c.main))
	rice, beans, slaw := c.recipe("rice", false, c.side), c.recipe("beans", false, c.side), c.recipe("slaw", false, c.side)
	c.serve(cspec{course: c.main}, cspec{course: c.side})
	c.mustPlan()
	mon, tue := c.mustMeal(9, c.side).RecipeID, c.mustMeal(10, c.side).RecipeID
	var third int64
	for _, id := range []int64{rice, beans, slaw} {
		if id != mon && id != tue {
			third = id
		}
	}
	alts, err := c.r.Alternatives(ctx, c.cell(10, c.side))
	if err != nil {
		t.Fatal(err)
	}
	if len(alts) != 2 {
		t.Fatalf("%d alternatives, want 2: %+v", len(alts), alts)
	}
	for _, a := range alts {
		if mains[a.RecipeID] {
			t.Errorf("alternative %+v is a Main Recipe, offered for the Side", a)
		}
	}
	if alts[0].RecipeID != third || alts[0].Relaxed || alts[1].RecipeID != mon || !alts[1].Relaxed {
		t.Errorf("alternatives = %+v, want [the unused Side strict, Monday's Side relaxed]", alts)
	}
}

// Single-Course data is unchanged (the golden for an upgraded Household).

func TestSingleCourseSlotsPlanLikeSlotsWithoutCourses(t *testing.T) {
	plain := newEnv(t)
	plain.mustPlan()

	one := newEnv(t)
	mainID := plantest.CourseID(t, one.db, "Main")
	for i := range one.src.recipes {
		one.src.recipes[i].CourseIDs = []int64{mainID}
	}
	one.src.courses = map[string][]plan.SlotCourse{}
	for _, id := range one.slotIDs {
		one.src.courses[attKey(id, "")] = []plan.SlotCourse{{CourseID: mainID, Main: true,
			Attendance: []plan.Attendee{{MemberID: 1, Factor: 1}, {MemberID: 2, Factor: 1}}}}
	}
	one.mustPlan()

	a, b := plain.planMeals(), one.planMeals()
	if len(a) != 3 || len(b) != len(a) {
		t.Fatalf("%d and %d meals, want 3 each", len(a), len(b))
	}
	for i := range a {
		if a[i].Key != b[i].Key || a[i].RecipeID != b[i].RecipeID || a[i].Portions != b[i].Portions || a[i].Relaxed != b[i].Relaxed {
			t.Errorf("meal %d differs: %+v without Courses, %+v with only the main Course", i, a[i], b[i])
		}
		if a[i].Key.CourseID != one.main {
			t.Errorf("stored key %+v, want the main Course's real id %d", a[i].Key, one.main)
		}
	}
}
