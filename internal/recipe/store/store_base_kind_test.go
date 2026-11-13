package store_test

import (
	"errors"
	"reflect"
	"testing"

	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// BR-B, changing the kind (§3.6, P6): plannable to Base after a dry-run confirm, and back. Today is 2026-11-09.

// pestoPlan seeds a plannable Pesto with Planned Meals, a Slot Rule, a Leftover and Members' preferences.
type pestoPlan struct {
	pesto                                              recipe.Recipe
	slot                                               int64
	tomorrow, pinned, bought, cooked, notCooked, early int64 // Planned Meal ids
	rule, otherRule                                    int64
	sam, kim                                           int64
}

func (f *bf) seedPesto(t *testing.T) pestoPlan {
	t.Helper()
	basil := f.ingredient(t, "basil", units.Gram)
	c := f.courses(t)
	p := pestoPlan{pesto: f.createPlain(t, recipe.Input{Name: "Pesto", Yield: 4, CourseIDs: []int64{c.main}, Lines: []recipe.Line{ln(basil, 100, "g")}})}
	p.slot = f.exec(t, `INSERT INTO meal_slots(weekday,name,time) VALUES (1,'Dinner','19:00')`)
	meal := func(date, state string, pinned int) int64 {
		return f.exec(t, `INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,state,pinned,created_at,updated_at)
			VALUES (?,?,?,?,1,4,?,?,'t','t')`, date, p.slot, c.main, p.pesto.ID, state, pinned)
	}
	// One Course per row of the UNIQUE (date, slot, course): use distinct dates.
	p.tomorrow = meal("2026-11-10", "planned", 0)
	p.pinned = meal("2026-11-11", "planned", 1)
	p.bought = meal("2026-11-12", "planned", 0)
	f.exec(t, `INSERT INTO planned_meal_bought(planned_meal_id,ingredient_id,lot_id,quantity,bought_at) VALUES (?,?,?,?,?)`, p.bought, basil, 900, 100, "t")
	p.cooked = meal("2026-11-13", "cooked", 0)
	p.notCooked = meal("2026-11-14", "skipped", 0)
	p.early = meal("2026-11-02", "planned", 0) // before today
	p.rule = f.exec(t, `INSERT INTO slot_rules(meal_slot_id,course_id,recipe_id) VALUES (?,?,?)`, p.slot, c.main, p.pesto.ID)
	other := f.createPlain(t, plainIn("Other", ln(basil, 1, "g")))
	p.otherRule = f.exec(t, `INSERT INTO slot_rules(meal_slot_id,course_id,recipe_id) VALUES (?,?,?)`, p.slot, c.side, other.ID)
	f.exec(t, `INSERT INTO leftovers(recipe_id,from_date,from_meal_slot_id,from_course_id,portions,cooked_on,use_by,created_at) VALUES (?,?,?,?,2,'2026-11-08','2026-11-11','t')`,
		p.pesto.ID, "2026-11-08", p.slot, c.main)
	p.sam, p.kim = f.member(t, "Sam", 0), f.member(t, "Kim", 0)
	for _, pref := range []struct {
		m  int64
		st recipe.State
	}{{p.sam, recipe.StateFavourite}, {p.kim, recipe.StateExclusion}} {
		if err := f.s.SetRecipeState(ctx, pref.m, p.pesto.ID, pref.st); err != nil {
			t.Fatal(err)
		}
	}
	return p
}

func (f *bf) exists(t *testing.T, table string, id int64) bool {
	t.Helper()
	var n int
	if err := f.db.QueryRow(`SELECT count(*) FROM `+table+` WHERE id = ?`, id).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n == 1
}

func TestTheToBaseDryRunNamesPlannedMealsFromTodayIncludingPinnedAndBoughtAndTheSlotRulesAndChangesNothing(t *testing.T) {
	f := newBaseFixture(t)
	p := f.seedPesto(t)
	plan, err := f.s.ToBasePreview(ctx, p.pesto.ID)
	if err != nil {
		t.Fatalf("ToBasePreview: %v", err)
	}
	var got [][3]any
	for _, m := range plan.PlannedMeals {
		got = append(got, [3]any{m.Date, m.Pinned, m.Bought})
	}
	want := [][3]any{{"2026-11-10", false, false}, {"2026-11-11", true, false}, {"2026-11-12", false, true}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("plannedMeals = %v, want %v: unresolved from today on, in date order, Pinned and Bought flagged; Cooked, Not cooked and past ones stay", got, want)
	}
	if m := plan.PlannedMeals[0]; m.MealSlotName != "Dinner" || m.CourseName != "Main" {
		t.Errorf("meal = %+v, want slot Dinner and Course Main named", m)
	}
	if len(plan.SlotRules) != 1 || plan.SlotRules[0].ID != p.rule || plan.SlotRules[0].MealSlotName != "Dinner" || plan.SlotRules[0].CourseName != "Main" {
		t.Errorf("slotRules = %+v, want only the rule by Pesto (not the other Recipe's)", plan.SlotRules)
	}
	if plan.Leftovers != 1 || plan.Preferences != 1 {
		t.Errorf("leftovers %d preferences %d, want 1 and 1 (Sam's Favourite goes; Kim's Exclusion moves, it is not counted)", plan.Leftovers, plan.Preferences)
	}
	if f.count(t, "planned_meals") != 6 || f.count(t, "slot_rules") != 2 {
		t.Error("a dry run changes nothing")
	}
	if got, _ := f.s.Get(ctx, p.pesto.ID); got.IsBase() {
		t.Error("a dry run leaves the Recipe plannable")
	}
}

func TestToBaseAppliesTheConfirmInOneTransactionAndKeepsHistoryAndLeftovers(t *testing.T) {
	f := newBaseFixture(t)
	p := f.seedPesto(t)
	got, err := f.s.ToBase(ctx, p.pesto.ID, recipe.ToBaseInput{Yield: 4, YieldUnit: "portion"})
	if err != nil {
		t.Fatalf("ToBase: %v", err)
	}
	if !got.IsBase() || got.Yield != 4 || got.YieldUnit != "portion" || got.BaseIngredientID == 0 || len(got.CourseIDs) != 0 {
		t.Fatalf("recipe = base %v yield %v %q ing %d courses %v", got.IsBase(), got.Yield, got.YieldUnit, got.BaseIngredientID, got.CourseIDs)
	}
	for name, id := range map[string]int64{"tomorrow": p.tomorrow, "pinned": p.pinned, "bought": p.bought} {
		if f.exists(t, "planned_meals", id) {
			t.Errorf("the %s Planned Meal must come off the plan", name)
		}
	}
	for name, id := range map[string]int64{"cooked": p.cooked, "not cooked": p.notCooked, "past": p.early} {
		if !f.exists(t, "planned_meals", id) {
			t.Errorf("the %s Planned Meal stays as history", name)
		}
	}
	if f.exists(t, "slot_rules", p.rule) || !f.exists(t, "slot_rules", p.otherRule) {
		t.Error("only the Slot Rule by Pesto goes")
	}
	if f.count(t, "leftovers") != 1 {
		t.Error("Leftovers stay as rows")
	}
	if f.count(t, "recipe_courses") != 1 { // 'Other' keeps its Course; Pesto has none
		t.Errorf("recipe_courses = %d, want only Other's", f.count(t, "recipe_courses"))
	}
	pr, _ := f.s.Preferences(ctx, p.sam)
	if len(pr.Recipes) != 0 {
		t.Errorf("Sam's Favourite of Pesto stays: %+v (P2: no Favourite or Dislike on a Base recipe)", pr.Recipes)
	}
	pk, _ := f.s.Preferences(ctx, p.kim)
	if !containsID(pk.ExcludedIngredients, got.BaseIngredientID) || pk.Recipes[got.ID] != recipe.StateExclusion {
		t.Errorf("Kim's Exclusion = %+v, want it moved to Pesto's Ingredient", pk)
	}
	if v, ok := f.conversion(t, got.BaseIngredientID, "batch"); !ok || v != 4 {
		t.Errorf("batch = %v, %v; want 4 (a Yield of 4 portions is 4 piece)", v, ok)
	}
	if k := f.nameKey(t, got.BaseIngredientID); k != "base-recipe:"+itoa(got.ID) {
		t.Errorf("name_key = %q", k)
	}
}

func TestToBaseRefusesAReadyMealABaseRecipeAndABadYieldAndChangesNothing(t *testing.T) {
	f := newBaseFixture(t)
	pack := f.ingredient(t, "Lasagne pack", units.Piece)
	rm := f.createPlain(t, recipe.Input{Name: "Lasagne pack", Yield: 2, ReadyMeal: true, Lines: []recipe.Line{ln(pack, 1, "piece")}})
	_, err := f.s.ToBase(ctx, rm.ID, recipe.ToBaseInput{Yield: 2, YieldUnit: "portion"})
	wantValidation(t, err, "readyMeal", recipe.CodeBaseRecipeReadyMeal)
	_, err = f.s.ToBasePreview(ctx, rm.ID)
	wantValidation(t, err, "readyMeal", recipe.CodeBaseRecipeReadyMeal)

	base := f.createBase(t, baseIn("Béchamel", 1, "l"))
	_, err = f.s.ToBase(ctx, base.ID, recipe.ToBaseInput{Yield: 1, YieldUnit: "l"})
	wantValidation(t, err, "baseRecipe", recipe.CodeBaseRecipeKind)

	p := f.seedPesto(t)
	_, err = f.s.ToBase(ctx, p.pesto.ID, recipe.ToBaseInput{Yield: 4, YieldUnit: "furlong"})
	wantValidation(t, err, "yieldUnit", recipe.CodeYieldUnitInvalid)
	_, err = f.s.ToBase(ctx, p.pesto.ID, recipe.ToBaseInput{Yield: 0, YieldUnit: "l"})
	wantValidation(t, err, "yield", recipe.CodeYieldInvalid)
	if f.count(t, "planned_meals") != 6 || f.count(t, "slot_rules") != 2 {
		t.Error("a refused ToBase changes nothing")
	}
	if _, err := f.s.ToBase(ctx, 99999, recipe.ToBaseInput{Yield: 1, YieldUnit: "l"}); !errors.Is(err, storeErrNotFound) {
		t.Errorf("unknown Recipe = %v, want ErrNotFound", err)
	}
}

func TestToBaseAsksBeforeTakingOverASameNameIngredientAndKeepsTheOldLinesPlainOnNo(t *testing.T) {
	f := newBaseFixture(t)
	jar := f.ingredient(t, "pesto", units.Gram)
	f.createPlain(t, plainIn("Pasta al pesto", ln(jar, 80, "g")))
	p := f.seedPesto(t)

	_, err := f.s.ToBase(ctx, p.pesto.ID, recipe.ToBaseInput{Yield: 200, YieldUnit: "g"})
	var ask *recipe.TakeOverError
	if !errors.As(err, &ask) || ask.Ingredient.ID != jar || len(ask.Recipes) != 1 {
		t.Fatalf("ToBase = %v (ask %+v), want the take-over ask naming Pasta al pesto", err, ask)
	}
	if f.count(t, "planned_meals") != 6 {
		t.Error("the ask comes before anything changes")
	}
	got, err := f.s.ToBase(ctx, p.pesto.ID, recipe.ToBaseInput{Yield: 200, YieldUnit: "g", TakeOver: no()})
	if err != nil || got.BaseIngredientID == jar {
		t.Fatalf("ToBase with No = %+v, %v; want its own Ingredient", got.BaseIngredientID, err)
	}
}

func TestToPlannableIsRefusedWhileAnyRecipeCallsForTheBaseRecipe(t *testing.T) {
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	f.createPlain(t, plainIn("Lasagne", callFor(bech, 500, "ml")))
	_, err := f.s.ToPlannable(ctx, bech.ID, recipe.ToPlannableInput{Yield: 4})
	var inUse *recipe.InUseError
	if !errors.As(err, &inUse) || len(inUse.UsedBy) != 1 || inUse.UsedBy[0].Name != "Lasagne" {
		t.Errorf("ToPlannable = %v, want *InUseError naming Lasagne (409 base_recipe_in_use)", err)
	}
}

func TestToPlannableKeepsTheIngredientAndItsStockAsAnOrdinaryOne(t *testing.T) {
	f := newBaseFixture(t)
	stock := f.createBase(t, baseIn("Stock", 1, "l"))
	f.lot(t, stock.BaseIngredientID, 500)
	c := f.courses(t)
	got, err := f.s.ToPlannable(ctx, stock.ID, recipe.ToPlannableInput{Yield: 6, CourseIDs: []int64{c.starter}})
	if err != nil {
		t.Fatalf("ToPlannable: %v", err)
	}
	if got.IsBase() || got.YieldUnit != "" || got.Yield != 6 || got.BaseIngredientID != 0 || !reflect.DeepEqual(got.CourseIDs, []int64{c.starter}) {
		t.Errorf("recipe = base %v yield %v %q courses %v", got.IsBase(), got.Yield, got.YieldUnit, got.CourseIDs)
	}
	ing, err := f.ings.Get(ctx, stock.BaseIngredientID)
	if err != nil || f.lotsOf(t, ing.ID) != 1 || f.nameKey(t, ing.ID) != "stock" {
		t.Errorf("Ingredient %+v, %v key %q lots %d: it stays with its Stock and takes the plain key again", ing, err, f.nameKey(t, ing.ID), f.lotsOf(t, ing.ID))
	}
	var base any
	f.db.QueryRow(`SELECT base_ingredient_id FROM recipes WHERE id = ?`, stock.ID).Scan(&base)
	if base != nil {
		t.Error("base_ingredient_id must be NULL again")
	}
	// Without Courses it gets the main Course.
	another := f.createBase(t, baseIn("Roux", 1, "kg"))
	got, err = f.s.ToPlannable(ctx, another.ID, recipe.ToPlannableInput{Yield: 2})
	if err != nil || !reflect.DeepEqual(got.CourseIDs, []int64{c.main}) {
		t.Errorf("no CourseIDs = %v, %v; want the main Course", got.CourseIDs, err)
	}
}

func TestToPlannableWhenAPlainIngredientHoldsTheNameIsAConflictThatNamesIt(t *testing.T) {
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	plain := f.ingredient(t, "béchamel", units.Millilitre) // may exist beside the Base recipe's
	_, err := f.s.ToPlannable(ctx, bech.ID, recipe.ToPlannableInput{Yield: 4})
	var taken *recipe.NameTakenError
	if !errors.Is(err, recipe.ErrIngredientNameTaken) || !errors.As(err, &taken) || taken.Ingredient.ID != plain {
		t.Fatalf("ToPlannable = %v, want *NameTakenError naming the plain Ingredient (409 ingredient_name_taken; the dialog offers a merge)", err)
	}
	if got, _ := f.s.Get(ctx, bech.ID); !got.IsBase() {
		t.Error("a refused change leaves the Base recipe")
	}
	if _, err := f.ings.Get(ctx, plain); err != nil {
		t.Error(err)
	}
	_ = ingstore.ErrNameTaken
}
