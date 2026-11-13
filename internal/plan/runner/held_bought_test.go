package runner_test

import (
	"errors"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

// B5-BO: the runner holds Bought Planned Meals (ADR 0013; docs/dev/design/b5-bo.md §7). The household is the fake of
// fakes_test.go: Mon 9, Tue 10 and Wed 11 November 2026, one Dinner at 19:00, Anna and Ben (2 portions), now Monday 12:00.

func (e *env) ingredientID(name string) int64 {
	e.t.Helper()
	var id int64
	if err := e.db.QueryRow(`SELECT id FROM ingredients WHERE name = ?`, name).Scan(&id); err == nil {
		return id
	}
	res, err := e.db.Exec(`INSERT INTO ingredients(name,name_key,base_unit,created_at,updated_at) VALUES (?,?,?,?,?)`,
		name, name, "g", "2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z")
	if err != nil {
		e.t.Fatal(err)
	}
	id, _ = res.LastInsertId()
	return id
}

// buy records a purchase of the named Ingredients for the Planned Meal on that day (Lot 900 + day) and returns it.
func (e *env) buy(day int, ingredients ...string) plan.Meal {
	e.t.Helper()
	m := e.meal(day)
	var recs []plan.BoughtRecord
	for _, name := range ingredients {
		recs = append(recs, plan.BoughtRecord{MealID: m.ID, IngredientID: e.ingredientID(name), LotID: int64(900 + day), Quantity: 100, At: e.clk.Now()})
	}
	if err := e.st.AddBought(ctx, recs); err != nil {
		e.t.Fatalf("AddBought: %v", err)
	}
	got := e.meal(day)
	if !got.IsBought() {
		e.t.Fatalf("set-up: the Planned Meal on the %dth is not Bought after AddBought: %+v", day, got)
	}
	return got
}

// wantUntouched asserts the Bought meal is the same row with the same Recipe, not Pinned, still Bought.
func (e *env) wantUntouched(what string, before plan.Meal) plan.Meal {
	e.t.Helper()
	got, err := e.st.Meal(ctx, before.Key)
	if err != nil {
		e.t.Fatalf("%s: the Bought Planned Meal is gone: %v", what, err)
	}
	if got.ID != before.ID || got.RecipeID != before.RecipeID || got.Pinned || !got.IsBought() {
		e.t.Errorf("%s: meal = %+v, want the same row (id %d), Recipe %d, not Pinned, still Bought", what, got, before.ID, before.RecipeID)
	}
	return got
}

// boughtEnv plans the three dinners with yield-2 Recipes and buys for Tuesday's; Monday's and Wednesday's are not Bought.
func boughtEnv(t *testing.T) (*env, plan.Meal) {
	t.Helper()
	e := newEnv(t)
	e.simpleOnly()
	e.mustPlan()
	return e, e.buy(10, "chicken thighs", "cream")
}

func TestAutomaticReplansLeaveABoughtMealWhereItIs(t *testing.T) {
	type trigger struct {
		name string
		do   func(e *env, bought plan.Meal)
	}
	plain := func(reason plan.Reason) func(*env, plan.Meal) {
		return func(e *env, _ plan.Meal) {
			if _, err := e.r.Plan(ctx, reason); err != nil {
				t.Fatalf("Plan(%s): %v", reason, err)
			}
		}
	}
	triggers := []trigger{
		{"the Recipe was archived", func(e *env, b plan.Meal) {
			e.src.archive(b.RecipeID)
			plain(plan.ReasonRecipeChanged)(e, b)
		}},
		{"a Member excludes the Recipe", func(e *env, b plan.Meal) {
			e.src.prefs = map[int64]planner.Preferences{1: {ExcludedRecipes: []planner.RecipeID{planner.RecipeID(b.RecipeID)}}}
			plain(plan.ReasonAttendanceChanged)(e, b)
		}},
		{"a Slot Rule it does not satisfy appears (rules changed, everything cleared)", func(e *env, b plan.Meal) {
			var other int64
			for _, name := range simpleRecipes {
				if id := e.rec[name]; id != b.RecipeID {
					other = id
					break
				}
			}
			err := e.r.ChangeRules(ctx, func(st *store.Store) error {
				_, err := st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: b.Key.MealSlotID, CourseID: e.main, RecipeID: other})
				return err
			})
			if err != nil {
				t.Fatal(err)
			}
		}},
		{"a Variety Rule appears", func(e *env, b plan.Meal) {
			if err := e.st.SetVarietyRule(ctx, plan.VarietyRule{Tag: "fish", MaxPerWeek: 1}); err != nil {
				t.Fatal(err)
			}
			plain(plan.ReasonRulesChanged)(e, b)
		}},
		{"a Stock-take", plain(plan.ReasonStockTake)},
		{"new Recipes", func(e *env, b plan.Meal) {
			for _, name := range []string{"lasagne", "risotto", "paella"} {
				e.src.recipes = append(e.src.recipes, planner.Recipe{ID: planner.RecipeID(e.addRecipe(name)), Yield: 2, CourseIDs: []int64{e.main}})
			}
			plain(plan.ReasonRecipeChanged)(e, b)
		}},
		{"Attendance changes", func(e *env, b plan.Meal) {
			e.src.setAttendance(b.Key.MealSlotID, b.Key.Date, []plan.Attendee{{MemberID: 1, Factor: 1}})
			plain(plan.ReasonAttendanceChanged)(e, b)
		}},
		{"the nightly plan", plain(plan.ReasonNightly)},
		{"the startup replan", plain(plan.ReasonStartup)},
		{"a Leftovers change", plain(plan.ReasonLeftoversChanged)},
		{"a Swap or Pin of the dinner before it replans what follows", func(e *env, _ plan.Meal) {
			if _, err := e.r.Confirm(ctx, e.key(9)); err != nil {
				t.Fatal(err)
			}
		}},
		{"Not cooked on the dinner before it", func(e *env, _ plan.Meal) {
			if _, err := e.r.NotCooked(ctx, e.key(9)); err != nil {
				t.Fatal(err)
			}
		}},
	}
	for _, tr := range triggers {
		t.Run(tr.name, func(t *testing.T) {
			e, bought := boughtEnv(t)
			tr.do(e, bought)
			e.wantUntouched(tr.name, bought)
		})
	}
}

func (e *env) addRecipe(name string) int64 {
	e.t.Helper()
	res, err := e.db.Exec(`INSERT INTO recipes (name, yield, created_at, updated_at) VALUES (?, 2, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`, name)
	if err != nil {
		e.t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	if _, err := e.db.Exec(`INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, id, e.main); err != nil {
		e.t.Fatal(err)
	}
	return id
}

func TestAnUnboughtMealIsStillReplannedWhereABoughtOneStays(t *testing.T) {
	// The control of the test above: the same archive replaces Wednesday's meal (nothing was bought for it).
	e, bought := boughtEnv(t)
	other := e.meal(11)
	e.src.archive(bought.RecipeID)
	e.src.archive(other.RecipeID)
	if _, err := e.r.Plan(ctx, plan.ReasonRecipeChanged); err != nil {
		t.Fatal(err)
	}
	e.wantUntouched("archived", bought)
	if got := e.meal(11); got.RecipeID == other.RecipeID {
		t.Errorf("control: the unbought meal kept its archived Recipe %d", got.RecipeID)
	}
}

func TestABoughtMealFollowsThePortionsInPlace(t *testing.T) {
	// Batches follow portions (ADR 0014 point 6): the Recipe and the row stay, the Batches grow; fewer portions do not lower them.
	e, bought := boughtEnv(t)
	three := []plan.Attendee{{MemberID: 1, Factor: 1}, {MemberID: 2, Factor: 1}, {MemberID: 3, Factor: 1}}
	e.src.setAttendance(bought.Key.MealSlotID, bought.Key.Date, three)
	if _, err := e.r.Plan(ctx, plan.ReasonAttendanceChanged); err != nil {
		t.Fatal(err)
	}
	got := e.wantUntouched("a third Member", bought)
	if got.Batches != 2 || got.Portions != 3 {
		t.Errorf("meal = %+v, want 2 Batches for 3 portions", got)
	}
}

func TestABoughtMealInACourseNobodyEatsIsKeptAndShown(t *testing.T) {
	e, bought := boughtEnv(t)
	e.src.setAttendance(bought.Key.MealSlotID, bought.Key.Date, []plan.Attendee{}) // nobody and no Guest on Tuesday
	if _, err := e.r.Plan(ctx, plan.ReasonAttendanceChanged); err != nil {
		t.Fatal(err)
	}
	// Nobody eats the cell: an unbought meal would go (the runner clears it); a Bought one is kept, like a Pinned one.
	e.wantUntouched("nobody eating", bought)
}

func TestRegenerateReplacesABoughtMealInPlaceAndItEndsBought(t *testing.T) {
	e, bought := boughtEnv(t)
	e.src.archive(bought.RecipeID) // Regenerate must pick another Recipe for the cell
	if _, err := e.r.Regenerate(ctx); err != nil {
		t.Fatal(err)
	}
	got := e.meal(10)
	if got.ID != bought.ID {
		t.Errorf("row id %d -> %d: Regenerate updates a Bought row in place (never delete and insert)", bought.ID, got.ID)
	}
	if got.RecipeID == bought.RecipeID {
		t.Errorf("Regenerate kept the Bought Recipe %d", got.RecipeID)
	}
	if got.IsBought() {
		t.Errorf("meal = %+v, still Bought after its Recipe changed", got)
	}
	if recs, _ := e.st.BoughtRecords(ctx, bought.ID); len(recs) != 0 {
		t.Errorf("records = %+v, want none", recs)
	}
}

func TestRegenerateLeavesAPinnedBoughtMealAlone(t *testing.T) {
	e, bought := boughtEnv(t)
	if _, err := e.r.Confirm(ctx, bought.Key); err != nil {
		t.Fatal(err)
	}
	if _, err := e.r.Regenerate(ctx); err != nil {
		t.Fatal(err)
	}
	got := e.meal(10)
	if got.ID != bought.ID || got.RecipeID != bought.RecipeID || !got.Pinned || !got.IsBought() {
		t.Errorf("meal = %+v, want the Pinned and Bought meal untouched by Regenerate", got)
	}
}

func TestUnpinningABoughtMealLeavesItHeld(t *testing.T) {
	e, bought := boughtEnv(t)
	if _, err := e.r.Confirm(ctx, bought.Key); err != nil {
		t.Fatal(err)
	}
	if _, err := e.r.Unpin(ctx, bought.Key); err != nil {
		t.Fatal(err)
	}
	e.src.archive(bought.RecipeID)
	if _, err := e.r.Plan(ctx, plan.ReasonRecipeChanged); err != nil {
		t.Fatal(err)
	}
	e.wantUntouched("unpinned and archived", bought)
}

func TestChoosingARecipeByHandReplacesABoughtMealAndItEndsBought(t *testing.T) {
	e, bought := boughtEnv(t)
	var other int64
	for _, name := range simpleRecipes {
		if id := e.rec[name]; id != bought.RecipeID {
			other = id
			break
		}
	}
	m, err := e.r.SetMeal(ctx, bought.Key, other, nil)
	if err != nil || m.RecipeID != other || !m.Pinned {
		t.Fatalf("SetMeal = %+v, %v", m, err)
	}
	if m.ID != bought.ID {
		t.Errorf("row id %d -> %d: updated in place", bought.ID, m.ID)
	}
	if got := e.meal(10); got.IsBought() {
		t.Errorf("meal = %+v, still Bought after another Recipe was chosen", got)
	}
}

func TestMarkingABoughtMealCookedOrNotCookedEndsBought(t *testing.T) {
	e, bought := boughtEnv(t)
	other := e.buy(9, "rice")
	e.clk.Set(time.Date(2026, 11, 10, 10, 0, 0, 0, time.UTC)) // Tuesday morning: Monday's dinner may be Cooked, Tuesday's Not cooked
	if _, err := e.r.Cooked(ctx, other.Key, nil); err != nil {
		t.Fatal(err)
	}
	if recs, _ := e.st.BoughtRecords(ctx, other.ID); len(recs) != 0 {
		t.Errorf("Cooked: records = %+v, want none (what was bought stays in Stock)", recs)
	}
	if _, err := e.r.NotCooked(ctx, bought.Key); err != nil {
		t.Fatal(err)
	}
	if recs, _ := e.st.BoughtRecords(ctx, bought.ID); len(recs) != 0 {
		t.Errorf("Not cooked: records = %+v, want none", recs)
	}
}

func TestANotServedDateRemovesABoughtMealAndItsRecords(t *testing.T) {
	e, bought := boughtEnv(t)
	e.src.setDate(bought.Key.MealSlotID, bought.Key.Date, runner.SlotDateDef{NotServed: true})
	if _, err := e.r.Plan(ctx, plan.ReasonSlotDateChanged); err != nil {
		t.Fatal(err)
	}
	if _, err := e.st.Meal(ctx, bought.Key); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("the Bought meal survived Not served (%v)", err)
	}
	if recs, _ := e.st.BoughtRecords(ctx, bought.ID); len(recs) != 0 {
		t.Errorf("records = %+v, want none", recs)
	}
}

func TestInvalidOnReadDoesNotClearABoughtMealThatBreaksARule(t *testing.T) {
	// A plain Plan (not rules changed) clears an unbought meal that breaks its cell's Slot Rule (invalidOnRead). A
	// Bought one is kept.
	e, bought := boughtEnv(t)
	var other int64
	for _, name := range simpleRecipes {
		if id := e.rec[name]; id != bought.RecipeID {
			other = id
			break
		}
	}
	if _, err := e.st.AddSlotRule(ctx, plan.SlotRule{MealSlotID: bought.Key.MealSlotID, CourseID: e.main, RecipeID: other}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.r.Plan(ctx, plan.ReasonNightly); err != nil {
		t.Fatal(err)
	}
	e.wantUntouched("a Slot Rule it breaks", bought)
}

// --- Regenerate ?dryRun=1 ---

func TestRegeneratePreviewCountsWhatItReplacesAndNamesTheBoughtOnes(t *testing.T) {
	e, bought := boughtEnv(t) // Tuesday is Bought
	pinned, err := e.r.Confirm(ctx, e.key(11))
	if err != nil {
		t.Fatal(err)
	}
	e.buy(9, "rice")
	gen := e.generation()
	events := e.bus.count("plan")
	before := e.planMeals()

	prev, err := e.r.RegeneratePreview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if prev.Replaces != 2 {
		t.Errorf("Replaces = %d, want 2: Monday and Tuesday are unpinned; Wednesday is Pinned (%+v)", prev.Replaces, pinned)
	}
	if len(prev.Bought) != 2 || prev.Bought[0].Key != e.key(9) || prev.Bought[1].Key != bought.Key {
		t.Fatalf("Bought = %+v, want Monday's then Tuesday's, in date order", prev.Bought)
	}
	if got := prev.Bought[1].Bought; len(got) != 2 {
		t.Errorf("Tuesday's Ingredients = %v, want the two bought for it", got)
	}
	if e.generation() != gen || e.bus.count("plan") != events {
		t.Errorf("the preview bumped the generation or published a plan event")
	}
	after := e.planMeals()
	if len(after) != len(before) {
		t.Fatalf("the preview changed the plan: %d -> %d meals", len(before), len(after))
	}
	for i := range before {
		if before[i].ID != after[i].ID || before[i].RecipeID != after[i].RecipeID {
			t.Errorf("the preview changed meal %d: %+v -> %+v", i, before[i], after[i])
		}
	}
}

func TestRegeneratePreviewLeavesOutNotServedSlots(t *testing.T) {
	e, bought := boughtEnv(t)
	e.src.setDate(bought.Key.MealSlotID, bought.Key.Date, runner.SlotDateDef{NotServed: true})
	prev, err := e.r.RegeneratePreview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if prev.Replaces != 2 || len(prev.Bought) != 0 {
		t.Errorf("preview = %+v, want 2 (Monday and Wednesday) and no Bought: Tuesday is Not served", prev)
	}
}

func (e *env) generation() int64 {
	e.t.Helper()
	g, err := e.st.Generation(ctx)
	if err != nil {
		e.t.Fatal(err)
	}
	return g
}

// --- the plan view: bought and warning ---

func TestTheViewCarriesWhatWasBoughtAndTheHardRuleWarning(t *testing.T) {
	e, bought := boughtEnv(t)
	pinned, err := e.r.Confirm(ctx, e.key(11))
	if err != nil {
		t.Fatal(err)
	}
	// Tuesday: a Member now excludes the Recipe (Bought). Wednesday: its Recipe is archived (Pinned). Monday: fine.
	e.src.prefs = map[int64]planner.Preferences{2: {ExcludedRecipes: []planner.RecipeID{planner.RecipeID(bought.RecipeID)}}}
	e.src.archive(pinned.RecipeID)

	cell := func(day int) runner.CourseView {
		t.Helper()
		d := e.key(day).Date
		v, err := e.r.View(ctx, d, d)
		if err != nil || len(v.Slots) != 1 || len(v.Slots[0].Courses) != 1 {
			t.Fatalf("View(%s) = %+v, %v", d, v, err)
		}
		return runner.CourseView(v.Slots[0].Courses[0])
	}
	tue := cell(10)
	if tue.Meal == nil || !tue.Meal.IsBought() || len(tue.Meal.Bought) != 2 {
		t.Fatalf("Tuesday's meal = %+v, want it Bought for 2 Ingredients", tue.Meal)
	}
	if tue.Warning == nil || tue.Warning.Code != plan.WarnExcluded || tue.Warning.MemberID != 2 {
		t.Errorf("Tuesday's warning = %+v, want excluded by Member 2", tue.Warning)
	}
	wed := cell(11)
	if wed.Warning == nil || wed.Warning.Code != plan.WarnArchived {
		t.Errorf("Wednesday's (Pinned) warning = %+v, want archived", wed.Warning)
	}
	mon := cell(9)
	if mon.Meal == nil || mon.Meal.IsBought() || mon.Warning != nil {
		t.Errorf("Monday = %+v warning %+v, want not Bought and no warning", mon.Meal, mon.Warning)
	}
}
