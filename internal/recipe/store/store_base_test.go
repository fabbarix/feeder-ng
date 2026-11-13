package store_test

import (
	"errors"
	"reflect"
	"testing"

	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// BR-B, the Base recipe lifecycle in the Recipe store (§3.1 to §3.5, §3.2, §10, §12, §16). Red until implemented.

func TestCreatingABaseRecipeCreatesItsOwnIngredientInTheSameTransaction(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	r := f.createBase(t, baseIn("Béchamel", 1, "l", ln(milk, 1000, "ml")))
	if !r.IsBase() || r.YieldUnit != "l" || r.Yield != 1 {
		t.Errorf("recipe = base %v yield %v %q, want a Base recipe of 1 l", r.IsBase(), r.Yield, r.YieldUnit)
	}
	ing, err := f.ings.Get(ctx, r.BaseIngredientID)
	if err != nil || ing.Name != "Béchamel" || ing.Base != units.Millilitre {
		t.Fatalf("Ingredient = %+v, %v; want Béchamel in ml", ing, err)
	}
	if k := f.nameKey(t, ing.ID); k != "base-recipe:"+itoa(r.ID) {
		t.Errorf("name_key = %q, want base-recipe:%d", k, r.ID)
	}
	if v, ok := f.conversion(t, ing.ID, "batch"); !ok || v != 1000 {
		t.Errorf("batch conversion = %v, %v; want 1000 (1 batch = the Yield in Base Units)", v, ok)
	}
	if _, ok := f.conversion(t, ing.ID, "portion"); ok {
		t.Error("a Yield in litres has no portion conversion")
	}
	if ing.ShelfLifeDays != nil {
		t.Error("the new Ingredient has no Shelf Life")
	}
	if f.count(t, "recipe_courses") != 0 {
		t.Error("a Base recipe has no Courses")
	}
	var whole int
	f.db.QueryRow(`SELECT whole_meal FROM recipes WHERE id = ?`, r.ID).Scan(&whole)
	if whole != 0 || len(r.CourseIDs) != 0 || (r.WholeMeal != nil && *r.WholeMeal) {
		t.Errorf("whole_meal %d courses %v: a Base recipe has none", whole, r.CourseIDs)
	}
}

func TestTheIngredientOfABaseRecipeFollowsItsYieldUnit(t *testing.T) {
	f := newBaseFixture(t)
	for _, tc := range []struct {
		unit        string
		yield       float64
		base        units.Base
		batch       float64
		portion     float64
		hasPortions bool
	}{
		{"kg", 2, units.Gram, 2000, 0, false},
		{"g", 300, units.Gram, 300, 0, false},
		{"dl", 5, units.Millilitre, 500, 0, false},
		{"portion", 4, units.Piece, 4, 1, true},
		{"piece", 6, units.Piece, 6, 0, false},
	} {
		r := f.createBase(t, baseIn("Base "+tc.unit, tc.yield, tc.unit))
		ing, _ := f.ings.Get(ctx, r.BaseIngredientID)
		if ing.Base != tc.base {
			t.Errorf("%v %s: Base Unit %q, want %q", tc.yield, tc.unit, ing.Base, tc.base)
		}
		if v, ok := f.conversion(t, ing.ID, "batch"); !ok || v != tc.batch {
			t.Errorf("%v %s: batch = %v, %v; want %v", tc.yield, tc.unit, v, ok, tc.batch)
		}
		if v, ok := f.conversion(t, ing.ID, "portion"); ok != tc.hasPortions || v != tc.portion {
			t.Errorf("%v %s: portion = %v, %v; want %v (kept for a Yield in portions: 1 portion = 1 piece)", tc.yield, tc.unit, v, ok, tc.portion)
		}
	}
}

func TestChangingTheYieldRewritesTheBatchConversionAndRenamingFollowsOnTheIngredient(t *testing.T) {
	f := newBaseFixture(t)
	r := f.createBase(t, baseIn("Béchamel", 1, "l"))
	in := baseIn("Béchamel", 2, "l")
	updated, err := f.s.Update(ctx, r.ID, in)
	if err != nil {
		t.Fatal(err)
	}
	if v, _ := f.conversion(t, updated.BaseIngredientID, "batch"); v != 2000 {
		t.Errorf("batch after Yield 2 l = %v, want 2000", v)
	}
	in.Name = "White sauce"
	updated, err = f.s.Update(ctx, r.ID, in)
	if err != nil {
		t.Fatal(err)
	}
	ing, _ := f.ings.Get(ctx, updated.BaseIngredientID)
	if ing.Name != "White sauce" || f.nameKey(t, ing.ID) != "base-recipe:"+itoa(r.ID) || updated.BaseIngredientID != r.BaseIngredientID {
		t.Errorf("after rename Ingredient %q key %q id %d, want 'White sauce', base-recipe:%d, same id", ing.Name, f.nameKey(t, ing.ID), ing.ID, r.ID)
	}
}

func TestAYieldUnitOfAnotherFamilyChangesTheBaseUnitOnlyWhileNothingUsesTheIngredient(t *testing.T) {
	f := newBaseFixture(t)
	r := f.createBase(t, baseIn("Stock", 1, "l"))
	to := baseIn("Stock", 500, "g")
	updated, err := f.s.Update(ctx, r.ID, to)
	if err != nil {
		t.Fatalf("a Yield in grams while nothing uses the Ingredient: %v", err)
	}
	if ing, _ := f.ings.Get(ctx, updated.BaseIngredientID); ing.Base != units.Gram {
		t.Errorf("Base Unit = %q, want g", ing.Base)
	}
	f.lot(t, updated.BaseIngredientID, 300)
	_, err = f.s.Update(ctx, r.ID, baseIn("Stock", 1, "l"))
	if !errors.Is(err, recipe.ErrBaseUnitInUse) {
		t.Errorf("Update to ml with Stock = %v, want ErrBaseUnitInUse (409 base_unit_in_use)", err)
	}
	if ing, _ := f.ings.Get(ctx, updated.BaseIngredientID); ing.Base != units.Gram {
		t.Error("a refused change leaves the Base Unit")
	}
}

func TestASaveCannotChangeTheKindAndAReadyMealCannotBeABaseRecipe(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	base := f.createBase(t, baseIn("Béchamel", 1, "l"))
	plain := f.createPlain(t, plainIn("Soup", ln(milk, 200, "ml")))

	_, err := f.s.Update(ctx, base.ID, recipe.Input{Name: "Béchamel", Yield: 4, BaseRecipe: no(), Lines: []recipe.Line{ln(milk, 1, "l")}})
	wantValidation(t, err, "baseRecipe", recipe.CodeBaseRecipeKind)
	in := plainIn("Soup", ln(milk, 200, "ml"))
	in.BaseRecipe, in.YieldUnit = yes(), "l"
	_, err = f.s.Update(ctx, plain.ID, in)
	wantValidation(t, err, "baseRecipe", recipe.CodeBaseRecipeKind)

	// An absent kind keeps the stored one.
	kept, err := f.s.Update(ctx, base.ID, recipe.Input{Name: "Béchamel", Yield: 1, YieldUnit: "l"})
	if err != nil || !kept.IsBase() {
		t.Errorf("Update with no baseRecipe = base %v, %v; want the stored kind kept", kept.IsBase(), err)
	}

	pack := recipe.Input{Name: "Pack", Yield: 2, ReadyMeal: true, BaseRecipe: yes(), YieldUnit: "portion"}
	_, err = f.s.Create(ctx, pack)
	wantValidation(t, err, "readyMeal", recipe.CodeBaseRecipeReadyMeal)
}

func TestARecipeSavedWithFieldsABaseRecipeLacksIsRefusedByName(t *testing.T) {
	f := newBaseFixture(t)
	in := baseIn("Béchamel", 1, "l")
	in.CourseIDs = []int64{f.courses(t).main}
	_, err := f.s.Create(ctx, in)
	wantValidation(t, err, "courses", recipe.CodeBaseRecipeField)
	if f.recipeCount(t) != 0 {
		t.Error("a refused save stores nothing")
	}
}

func TestNeededAtStepIsOnlyForBaseRecipeLinesAndPointsAtOwnSteps(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	step := []recipe.Step{{Text: "Mix", Kind: "active", DurationMinutes: 5}, {Text: "Layer the lasagne with béchamel", Kind: "active", DurationMinutes: 10}}

	in := plainIn("Lasagne", ln(milk, 100, "ml"), callFor(bech, 500, "ml"))
	in.Steps = step
	in.Lines[0].NeededAtStep = intp(0)
	_, err := f.s.Create(ctx, in)
	wantValidation(t, err, "lines[0].neededAtStep", recipe.CodeNeededAtStepInvalid)

	in.Lines[0].NeededAtStep = nil
	in.Lines[1].NeededAtStep = intp(5)
	_, err = f.s.Create(ctx, in)
	wantValidation(t, err, "lines[1].neededAtStep", recipe.CodeNeededAtStepInvalid)

	in.Lines[1].NeededAtStep = nil
	got := f.createPlain(t, in)
	if l := got.Lines[1]; l.Base == nil || l.Base.ID != bech.ID || l.NeededAtStep != nil || l.NeededAt != 1 {
		t.Errorf("line = %+v, want a Base recipe line, no stored override, effective Needed at 1 (the Step whose text names Béchamel)", l)
	}
	in.Lines[1].NeededAtStep = intp(0)
	got, err = f.s.Update(ctx, got.ID, in)
	if err != nil || got.Lines[1].NeededAtStep == nil || *got.Lines[1].NeededAtStep != 0 || got.Lines[1].NeededAt != 0 {
		t.Errorf("override 0 = %+v, %v; want stored 0 and effective 0", got.Lines[1], err)
	}
}

func TestABaseRecipeLineIsCheckedWithTheBaseRecipesIngredientUnits(t *testing.T) {
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	for _, unit := range []string{"ml", "l", "dl", "batch"} {
		if _, err := f.s.Create(ctx, plainIn("Lasagne "+unit, callFor(bech, 1, unit))); err != nil {
			t.Errorf("a line of 1 %s of the Base recipe: %v", unit, err)
		}
	}
	_, err := f.s.Create(ctx, plainIn("Lasagne jar", callFor(bech, 1, "jar")))
	var ue *recipe.UnknownUnitError
	if !errors.As(err, &ue) || ue.IngredientID != bech.BaseIngredientID || ue.Field != "lines[0].unit" || ue.Base != units.Millilitre {
		t.Errorf("err = %v, want an UnknownUnitError on the Base recipe's Ingredient (the inline Unit Conversion prompt)", err)
	}
	_, err = f.s.Create(ctx, plainIn("Lasagne ghost", recipe.Line{BaseRecipeID: 99999, Quantity: 1, Unit: "l"}))
	wantValidation(t, err, "lines[0].baseRecipeId", recipe.CodeUnknownIngr)
	// Calling for the Ingredient directly is the same line.
	got, err := f.s.Create(ctx, plainIn("Lasagne direct", ln(bech.BaseIngredientID, 500, "ml")))
	if err != nil || got.Lines[0].Base == nil || got.Lines[0].Base.ID != bech.ID {
		t.Errorf("ingredientId of the Base recipe's Ingredient = %+v, %v; want a Base recipe line", got.Lines, err)
	}
}

// Names (P7, §3.2).

func (f *bf) lasagneOnPlain(t *testing.T, name string) (jar int64, lasagne recipe.Recipe) {
	t.Helper()
	jar = f.ingredient(t, name, units.Millilitre, units.Conversion{Unit: "jar", ToBase: 400})
	lasagne = f.createPlain(t, plainIn("Lasagne", ln(jar, 500, "ml")))
	return jar, lasagne
}

func TestABaseRecipeNamedLikeAPlainIngredientAsksFirstAndCreatesNothing(t *testing.T) {
	f := newBaseFixture(t)
	jar, _ := f.lasagneOnPlain(t, "béchamel")
	f.createPlain(t, plainIn("Cannelloni", ln(jar, 300, "ml")))
	archived := f.createPlain(t, plainIn("Old moussaka", ln(jar, 200, "ml")))
	if _, err := f.s.SetArchived(ctx, archived.ID, true); err != nil {
		t.Fatal(err)
	}
	f.lot(t, jar, 400)
	f.lot(t, jar, 200)
	before, recipes := f.count(t, "ingredients"), f.recipeCount(t)

	_, err := f.s.Create(ctx, baseIn("Béchamel", 1, "l"))
	var ask *recipe.TakeOverError
	if !errors.Is(err, recipe.ErrTakeOver) || !errors.As(err, &ask) {
		t.Fatalf("Create = %v, want a *TakeOverError (409 base_recipe_take_over)", err)
	}
	if ask.Ingredient.ID != jar || !ask.Convertible || ask.StockLots != 2 {
		t.Errorf("ask = %+v, want Ingredient %d, convertible, 2 Stock Lots", ask, jar)
	}
	if got := refNames(ask.Recipes); !reflect.DeepEqual(got, []string{"Cannelloni", "Lasagne", "Old moussaka"}) {
		t.Errorf("ask names the Recipes %v, want all three (archived included) by name", got)
	}
	if f.count(t, "ingredients") != before || f.recipeCount(t) != recipes {
		t.Error("asking creates nothing")
	}
}

func TestYesTakesTheIngredientOverReKeysItAndTurnsItsLinesIntoBaseRecipeLines(t *testing.T) {
	f := newBaseFixture(t)
	jar, lasagne := f.lasagneOnPlain(t, "béchamel")
	f.exec(t, `INSERT INTO ingredient_conversions(ingredient_id, unit, to_base) VALUES (?, 'batch', 123)`, jar)
	f.lot(t, jar, 400)
	m := f.member(t, "Sam", 0)
	f.exec(t, `INSERT INTO member_ingredient_exclusions(member_id, ingredient_id) VALUES (?,?)`, m, jar)

	in := baseIn("Béchamel", 1, "l")
	in.TakeOver = yes()
	r, err := f.s.Create(ctx, in)
	if err != nil {
		t.Fatalf("Create with TakeOver yes: %v", err)
	}
	if r.BaseIngredientID != jar {
		t.Fatalf("BaseIngredientID = %d, want the plain Ingredient %d taken over", r.BaseIngredientID, jar)
	}
	if k := f.nameKey(t, jar); k != "base-recipe:"+itoa(r.ID) {
		t.Errorf("name_key = %q, want base-recipe:%d (re-keyed)", k, r.ID)
	}
	if f.lotsOf(t, jar) != 1 || f.count(t, "member_ingredient_exclusions") != 1 {
		t.Error("its Stock Lots and Exclusions stay")
	}
	if v, _ := f.conversion(t, jar, "batch"); v != 1000 {
		t.Errorf("batch = %v, want 1000 written from the Yield, replacing the User's 123", v)
	}
	if v, ok := f.conversion(t, jar, "jar"); !ok || v != 400 {
		t.Error("other Unit Conversions stay")
	}
	if ing, _ := f.ings.Get(ctx, jar); ing.Base != units.Millilitre {
		t.Errorf("Base Unit = %q, a taken-over Ingredient keeps its own", ing.Base)
	}
	got, _ := f.s.Get(ctx, lasagne.ID)
	if got.Lines[0].Base == nil || got.Lines[0].Base.ID != r.ID {
		t.Errorf("Lasagne's line = %+v, want it a Base recipe line of the new Base recipe, all at once", got.Lines[0])
	}
	if got.Lines[0].LinkedFromIngredientID != 0 {
		t.Error("lines made Base recipe lines by a take-over remember nothing")
	}
	// P7 follow-up: a plain Ingredient of that name may exist again.
	if _, err := f.ings.Create(ctx, ingInput("béchamel", units.Millilitre)); err != nil {
		t.Errorf("a plain Ingredient named béchamel after a Yes: %v", err)
	}
}

func TestTheTakeOverIsOnlyOfferedWhenTheYieldUnitConvertsToTheIngredientsBaseUnit(t *testing.T) {
	f := newBaseFixture(t)
	f.ingredient(t, "pesto", units.Gram)
	_, err := f.s.Create(ctx, baseIn("Pesto", 1, "l"))
	var ask *recipe.TakeOverError
	if !errors.As(err, &ask) || ask.Convertible {
		t.Fatalf("Create = %v (ask %+v), want an ask that says it does not convert (only No is offered)", err, ask)
	}
	in := baseIn("Pesto", 1, "l")
	in.TakeOver = yes()
	_, err = f.s.Create(ctx, in)
	wantValidation(t, err, "takeOver", recipe.CodeTakeOverUnit)
	in.TakeOver = no()
	if _, err := f.s.Create(ctx, in); err != nil {
		t.Errorf("No is always possible: %v", err)
	}
}

func TestNoGivesTheBaseRecipeItsOwnIngredientAndLeavesThePlainOneAndItsLinesAlone(t *testing.T) {
	f := newBaseFixture(t)
	jar, lasagne := f.lasagneOnPlain(t, "béchamel")
	in := baseIn("Béchamel", 1, "l")
	in.TakeOver = no()
	r, err := f.s.Create(ctx, in)
	if err != nil {
		t.Fatalf("Create with TakeOver no: %v", err)
	}
	if r.BaseIngredientID == jar || f.nameKey(t, r.BaseIngredientID) != "base-recipe:"+itoa(r.ID) {
		t.Errorf("Ingredient %d key %q, want its own, keyed base-recipe:%d", r.BaseIngredientID, f.nameKey(t, r.BaseIngredientID), r.ID)
	}
	if f.nameKey(t, jar) != "béchamel" {
		t.Error("the plain Ingredient keeps its key")
	}
	got, _ := f.s.Get(ctx, lasagne.ID)
	if got.Lines[0].Base != nil || got.Lines[0].IngredientID != jar {
		t.Errorf("Lasagne's line = %+v, want it still plain: nothing is linked silently", got.Lines[0])
	}
	var same int
	f.db.QueryRow(`SELECT count(*) FROM ingredients WHERE lower(name) = 'béchamel'`).Scan(&same)
	if same != 2 {
		t.Errorf("%d Ingredients named béchamel, want the plain one and the Base recipe's", same)
	}
}

func TestANameHeldByAnotherBaseRecipeOrAReadyMealsIngredientIsRefused(t *testing.T) {
	f := newBaseFixture(t)
	f.createBase(t, baseIn("Béchamel", 1, "l"))
	_, err := f.s.Create(ctx, baseIn("  BÉCHAMEL ", 1, "l"))
	wantValidation(t, err, "name", recipe.CodeBaseRecipeNameTaken)

	pack := f.ingredient(t, "Lasagne pack", units.Piece)
	f.createPlain(t, recipe.Input{Name: "Lasagne pack", Yield: 2, ReadyMeal: true, Lines: []recipe.Line{ln(pack, 1, "piece")}})
	_, err = f.s.Create(ctx, baseIn("lasagne pack", 1, "portion"))
	wantValidation(t, err, "name", recipe.CodeReadyMealNameTaken)
	for _, name := range []string{"Béchamel", "lasagne pack"} {
		var n int
		f.db.QueryRow(`SELECT count(*) FROM recipes WHERE lower(name) = lower(?)`, name).Scan(&n)
		if n != 1 {
			t.Errorf("%d Recipes named %q after the refusal, want 1", n, name)
		}
	}
}

func TestAReadyMealSavedOrRenamedToABaseRecipesNameIsRefused(t *testing.T) {
	f := newBaseFixture(t)
	f.createBase(t, baseIn("Béchamel", 1, "l"))
	ingredients := f.count(t, "ingredients")

	// A Ready Meal that derives its pack line from the name.
	_, err := f.s.Create(ctx, recipe.Input{Name: "béchamel", Yield: 2, ReadyMeal: true})
	wantValidation(t, err, "name", recipe.CodeBaseRecipeNameTaken)
	if f.count(t, "ingredients") != ingredients {
		t.Error("a refused Ready Meal must not create a same-name plain Ingredient (ChooseReadyMealIngredient compares Base recipe names)")
	}

	// A Ready Meal with its own line, then renamed.
	pack := f.ingredient(t, "Roux pack", units.Piece)
	rm := f.createPlain(t, recipe.Input{Name: "Roux pack", Yield: 2, ReadyMeal: true, Lines: []recipe.Line{ln(pack, 1, "piece")}})
	_, err = f.s.Update(ctx, rm.ID, recipe.Input{Name: "Béchamel", Yield: 2, ReadyMeal: true, Lines: []recipe.Line{ln(pack, 1, "piece")}})
	wantValidation(t, err, "name", recipe.CodeBaseRecipeNameTaken)

	// And a plannable Recipe saved as a Ready Meal with that name.
	plain := f.createPlain(t, plainIn("Sauce", ln(pack, 1, "piece")))
	_, err = f.s.Update(ctx, plain.ID, recipe.Input{Name: "Béchamel", Yield: 2, ReadyMeal: true, Lines: []recipe.Line{ln(pack, 1, "piece")}})
	wantValidation(t, err, "name", recipe.CodeBaseRecipeNameTaken)

	// A plain (not Ready Meal) Recipe may share the name: Recipes have no unique name.
	if _, err := f.s.Create(ctx, plainIn("Béchamel on toast", ln(pack, 1, "piece"))); err != nil {
		t.Errorf("a plannable Recipe with another name: %v", err)
	}
}

func TestRenamingABaseRecipeToAPlainIngredientsNameAsksAndYesMergesTheFormerIngredientIntoIt(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l", ln(milk, 1000, "ml")))
	f.createPlain(t, plainIn("Lasagne", callFor(bech, 500, "ml")))
	f.lot(t, bech.BaseIngredientID, 300)
	white := f.ingredient(t, "white sauce", units.Millilitre)
	f.lot(t, white, 200)
	former := bech.BaseIngredientID

	in := baseIn("White sauce", 1, "l", ln(milk, 1000, "ml"))
	_, err := f.s.Update(ctx, bech.ID, in)
	var ask *recipe.TakeOverError
	if !errors.As(err, &ask) || ask.Ingredient.ID != white || ask.StockLots != 1 {
		t.Fatalf("rename = %v (ask %+v), want a take-over ask naming the plain 'white sauce' and its Stock", err, ask)
	}
	if got, _ := f.s.Get(ctx, bech.ID); got.Name != "Béchamel" || got.BaseIngredientID != former {
		t.Error("asking changes nothing")
	}

	in.TakeOver = yes()
	got, err := f.s.Update(ctx, bech.ID, in)
	if err != nil {
		t.Fatalf("rename with Yes: %v", err)
	}
	if got.BaseIngredientID != white || f.nameKey(t, white) != "base-recipe:"+itoa(bech.ID) {
		t.Errorf("Ingredient %d key %q, want the plain one taken over and re-keyed", got.BaseIngredientID, f.nameKey(t, white))
	}
	if _, err := f.ings.Get(ctx, former); !errors.Is(err, ingstore.ErrNotFound) {
		t.Errorf("the former Ingredient must be merged away: %v", err)
	}
	if f.lotsOf(t, white) != 2 {
		t.Errorf("%d Lots on the taken-over Ingredient, want 2: the former Ingredient's Stock carries over", f.lotsOf(t, white))
	}
	if v, _ := f.conversion(t, white, "batch"); v != 1000 {
		t.Errorf("batch = %v, want 1000", v)
	}
}

func TestRenamingABaseRecipeToAPlainIngredientsNameAnsweredNoLeavesTwoIngredientsAndNoKeyCollision(t *testing.T) {
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	white := f.ingredient(t, "white sauce", units.Millilitre)
	in := baseIn("White sauce", 1, "l")
	in.TakeOver = no()
	got, err := f.s.Update(ctx, bech.ID, in)
	if err != nil {
		t.Fatalf("rename with No: %v", err)
	}
	if got.BaseIngredientID != bech.BaseIngredientID || f.nameKey(t, white) != "white sauce" || f.nameKey(t, got.BaseIngredientID) != "base-recipe:"+itoa(bech.ID) {
		t.Error("No keeps the two apart, each with its own key")
	}
	ing, _ := f.ings.Get(ctx, got.BaseIngredientID)
	if ing.Name != "White sauce" {
		t.Errorf("the Base recipe's Ingredient is renamed along: %q", ing.Name)
	}
}

func TestRenamingABaseRecipeToTheNameOfAnotherOrOfAReadyMealIsRefusedButItsOwnSpellingIsFine(t *testing.T) {
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	roux := f.createBase(t, baseIn("Roux", 1, "kg"))
	_, err := f.s.Update(ctx, roux.ID, baseIn("béchamel", 1, "kg"))
	wantValidation(t, err, "name", recipe.CodeBaseRecipeNameTaken)
	if _, err := f.s.Update(ctx, bech.ID, baseIn("BÉCHAMEL", 1, "l")); err != nil {
		t.Errorf("a different spelling of its own name: %v", err)
	}
	pack := f.ingredient(t, "Lasagne pack", units.Piece)
	f.createPlain(t, recipe.Input{Name: "Lasagne pack", Yield: 2, ReadyMeal: true, Lines: []recipe.Line{ln(pack, 1, "piece")}})
	_, err = f.s.Update(ctx, roux.ID, baseIn("Lasagne pack", 1, "kg"))
	wantValidation(t, err, "name", recipe.CodeReadyMealNameTaken)
}

// Delete, archive, used by, within.

func TestDeletingABaseRecipeInUseIsRefusedWithWhoUsesIt(t *testing.T) {
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	f.createPlain(t, plainIn("Lasagne", callFor(bech, 500, "ml")))
	old := f.createPlain(t, plainIn("Moussaka", callFor(bech, 300, "ml")))
	if _, err := f.s.SetArchived(ctx, old.ID, true); err != nil {
		t.Fatal(err)
	}
	err := f.s.Delete(ctx, bech.ID)
	var inUse *recipe.InUseError
	if !errors.Is(err, recipe.ErrBaseRecipeInUse) || !errors.As(err, &inUse) {
		t.Fatalf("Delete = %v, want *InUseError (409 base_recipe_in_use)", err)
	}
	if got := refNames(inUse.UsedBy); !reflect.DeepEqual(got, []string{"Lasagne", "Moussaka"}) {
		t.Errorf("usedBy = %v, want Lasagne and Moussaka (archived included)", got)
	}
	if !inUse.UsedBy[1].Archived || inUse.UsedBy[0].Archived {
		t.Errorf("usedBy = %+v, want Moussaka flagged archived", inUse.UsedBy)
	}
	if _, err := f.s.Get(ctx, bech.ID); err != nil {
		t.Error("a refused delete leaves the Base recipe")
	}
}

func TestDeletingAnUnusedBaseRecipeDeletesItsIngredientUnlessStockStillHoldsIt(t *testing.T) {
	f := newBaseFixture(t)
	a := f.createBase(t, baseIn("Roux", 1, "kg"))
	if err := f.s.Delete(ctx, a.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := f.ings.Get(ctx, a.BaseIngredientID); !errors.Is(err, ingstore.ErrNotFound) {
		t.Errorf("its Ingredient must go with it when nothing references it: %v", err)
	}
	b := f.createBase(t, baseIn("Stock", 1, "l"))
	f.lot(t, b.BaseIngredientID, 500)
	if err := f.s.Delete(ctx, b.ID); err != nil {
		t.Fatalf("Delete with Stock: %v", err)
	}
	ing, err := f.ings.Get(ctx, b.BaseIngredientID)
	if err != nil || f.nameKey(t, ing.ID) != "stock" || f.lotsOf(t, ing.ID) != 1 {
		t.Errorf("Ingredient = %+v, %v key %q: it stays as an ordinary Ingredient with its Stock", ing, err, f.nameKey(t, ing.ID))
	}
}

func TestArchivingABaseRecipeHidesItButLeavesItsUsersExpanding(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l", ln(milk, 1000, "ml")))
	lasagne := f.createPlain(t, plainIn("Lasagne", callFor(bech, 500, "ml")))
	if _, err := f.s.SetArchived(ctx, bech.ID, true); err != nil {
		t.Fatal(err)
	}
	list, _ := f.s.List(ctx, store_ListFilter("base", ""))
	if len(list) != 0 {
		t.Errorf("an archived Base recipe is on the active list: %+v", list)
	}
	list, _ = f.s.List(ctx, store_ListFilter("base", "yes"))
	if len(list) != 1 || !list[0].Archived {
		t.Errorf("archived list = %+v", list)
	}
	got, _ := f.s.Get(ctx, lasagne.ID)
	if got.Lines[0].Base == nil || !got.Lines[0].Base.Archived {
		t.Errorf("Lasagne's line = %+v, want it to show the Base recipe as archived", got.Lines[0])
	}
	tree, err := f.s.NeedTree(ctx, lasagne.ID)
	if err != nil || len(tree) != 1 || len(tree[0].Made) != 1 || tree[0].Made[0].IngredientID != milk {
		t.Errorf("NeedTree = %+v, %v; want the archived Base recipe still expanded (shopping, Cooked, Cook Mode)", tree, err)
	}
	if r, err := f.s.SetArchived(ctx, bech.ID, false); err != nil || r.Archived {
		t.Errorf("unarchive = %+v, %v", r, err)
	}
}

func TestABaseRecipeKnowsWhoUsesItAndTheIngredientsInsideARecipe(t *testing.T) {
	f := newBaseFixture(t)
	milk, butter, flour := f.basics(t)
	roux := f.createBase(t, baseIn("Roux", 300, "g", ln(butter, 150, "g"), ln(flour, 150, "g")))
	bech := f.createBase(t, baseIn("Béchamel", 1, "l", ln(milk, 1000, "ml"), callFor(roux, 100, "g")))
	lasagne := f.createPlain(t, plainIn("Lasagne", ln(flour, 200, "g"), callFor(bech, 500, "ml")))

	if got, _ := f.s.Get(ctx, bech.ID); len(got.UsedBy) != 1 || got.UsedBy[0].Name != "Lasagne" || got.UsedBy[0].ID != lasagne.ID {
		t.Errorf("Béchamel usedBy = %+v, want [Lasagne]", got.UsedBy)
	}
	if got, _ := f.s.Get(ctx, roux.ID); len(got.UsedBy) != 1 || got.UsedBy[0].Name != "Béchamel" {
		t.Errorf("Roux usedBy = %+v, want [Béchamel] (direct users)", got.UsedBy)
	}
	got, _ := f.s.Get(ctx, lasagne.ID)
	if got.UsedBy == nil || len(got.UsedBy) != 0 {
		t.Errorf("a plannable Recipe has usedBy [] (never nil), got %#v", got.UsedBy)
	}
	paths := map[string]string{}
	for _, w := range got.Within {
		paths[w.Name] = joinPath(w.Path)
	}
	if want := map[string]string{"milk": "Béchamel", "butter": "Béchamel > Roux", "flour": "Béchamel > Roux"}; !reflect.DeepEqual(paths, want) {
		t.Errorf("within = %v, want %v (the Ingredients inside, through the Base recipes, with their path)", paths, want)
	}
}

// Cycles (§3.4).

func TestACycleIsRefusedWithThePathAndTheLine(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	roux := f.createBase(t, baseIn("Roux", 1, "kg", ln(milk, 1, "l")))
	bech := f.createBase(t, baseIn("Béchamel", 1, "l", ln(milk, 1, "l"), callFor(roux, 100, "g")))

	_, err := f.s.Update(ctx, roux.ID, baseIn("Roux", 1, "kg", ln(milk, 1, "l"), callFor(bech, 100, "ml")))
	var ce *recipe.CycleError
	if !errors.Is(err, recipe.ErrBaseRecipeCycle) || !errors.As(err, &ce) {
		t.Fatalf("Update = %v, want *CycleError (422 base_recipe_cycle)", err)
	}
	if !reflect.DeepEqual(ce.Path, []string{"Roux", "Béchamel", "Roux"}) || ce.Field != "lines[1]" {
		t.Errorf("cycle = %+v, want path [Roux Béchamel Roux] on lines[1]", ce)
	}
	if got, _ := f.s.Get(ctx, roux.ID); len(got.Lines) != 1 {
		t.Error("a refused save changes nothing")
	}

	_, err = f.s.Update(ctx, bech.ID, baseIn("Béchamel", 1, "l", callFor(bech, 100, "ml")))
	if !errors.As(err, &ce) || !reflect.DeepEqual(ce.Path, []string{"Béchamel", "Béchamel"}) {
		t.Errorf("a line calling for its own Recipe = %v, want the one-step cycle [Béchamel Béchamel]", err)
	}
}

func TestACycleThroughThreeRecipesAndThroughAnArchivedOneIsRefused(t *testing.T) {
	f := newBaseFixture(t)
	a := f.createBase(t, baseIn("A", 1, "l"))
	b := f.createBase(t, baseIn("B", 1, "l", callFor(a, 1, "l")))
	c := f.createBase(t, baseIn("C", 1, "l", callFor(b, 1, "l")))
	if _, err := f.s.SetArchived(ctx, b.ID, true); err != nil {
		t.Fatal(err)
	}
	_, err := f.s.Update(ctx, a.ID, baseIn("A", 1, "l", callFor(c, 1, "l")))
	var ce *recipe.CycleError
	if !errors.As(err, &ce) || !reflect.DeepEqual(ce.Path, []string{"A", "C", "B", "A"}) {
		t.Errorf("err = %v, want path [A C B A] (archived Recipes count)", err)
	}
}

// List.

func TestTheRecipesListShowsPlannableRecipesByDefaultAndFiltersByKind(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	f.createPlain(t, plainIn("Lasagne", callFor(bech, 500, "ml")))
	f.createPlain(t, plainIn("Soup", ln(milk, 200, "ml")))

	names := func(kind string) []string {
		list, err := f.s.List(ctx, store_ListFilter(kind, ""))
		if err != nil {
			t.Fatal(err)
		}
		out := []string{}
		for _, s := range list {
			out = append(out, s.Name)
		}
		return out
	}
	if got := names(""); !reflect.DeepEqual(got, []string{"Lasagne", "Soup"}) {
		t.Errorf("default = %v, want plannable Recipes only", got)
	}
	if got := names("plannable"); !reflect.DeepEqual(got, []string{"Lasagne", "Soup"}) {
		t.Errorf("plannable = %v", got)
	}
	if got := names("base"); !reflect.DeepEqual(got, []string{"Béchamel"}) {
		t.Errorf("base = %v", got)
	}
	if got := names("all"); !reflect.DeepEqual(got, []string{"Béchamel", "Lasagne", "Soup"}) {
		t.Errorf("all = %v", got)
	}
	list, _ := f.s.List(ctx, store_ListFilter("base", ""))
	if len(list) != 1 || !list[0].BaseRecipe || list[0].YieldUnit != "l" || list[0].UsedByCount != 1 || len(list[0].CourseIDs) != 0 {
		t.Errorf("summary = %+v, want baseRecipe, yieldUnit l, usedByCount 1, no Courses", list)
	}
	plain, _ := f.s.List(ctx, store_ListFilter("", ""))
	if plain[0].BaseRecipe || plain[0].YieldUnit != "" || plain[0].UsedByCount != 0 {
		t.Errorf("plannable summary = %+v", plain[0])
	}
}

// Preferences: the Exclusion of a Base recipe is the Exclusion of its Ingredient, the only preference (P2).

func TestAMembersExclusionOfABaseRecipeIsStoredAsTheExclusionOfItsIngredient(t *testing.T) {
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	m := f.member(t, "Sam", 0)
	if err := f.s.SetRecipeState(ctx, m, bech.ID, recipe.StateExclusion); err != nil {
		t.Fatalf("SetRecipeState exclusion: %v", err)
	}
	if f.count(t, "member_recipe_preferences") != 0 {
		t.Error("no member_recipe_preferences row: the Exclusion lives on the Ingredient")
	}
	var n int
	f.db.QueryRow(`SELECT count(*) FROM member_ingredient_exclusions WHERE member_id = ? AND ingredient_id = ?`, m, bech.BaseIngredientID).Scan(&n)
	if n != 1 {
		t.Fatalf("%d exclusion rows of the Base recipe's Ingredient, want 1", n)
	}
	p, err := f.s.Preferences(ctx, m)
	if err != nil || p.Recipes[bech.ID] != recipe.StateExclusion || !containsID(p.ExcludedIngredients, bech.BaseIngredientID) {
		t.Errorf("Preferences = %+v, %v; want the Base recipe shown as Exclusion and its Ingredient excluded", p, err)
	}
	// Excluding the Ingredient directly is the same thing.
	m2 := f.member(t, "Kim", 0)
	if err := f.s.SetIngredientExclusion(ctx, m2, bech.BaseIngredientID, true); err != nil {
		t.Fatal(err)
	}
	if p2, _ := f.s.Preferences(ctx, m2); p2.Recipes[bech.ID] != recipe.StateExclusion {
		t.Errorf("Kim's Preferences = %+v, want the Base recipe an Exclusion", p2.Recipes)
	}
	if err := f.s.SetRecipeState(ctx, m, bech.ID, recipe.StateNone); err != nil {
		t.Fatal(err)
	}
	if p, _ := f.s.Preferences(ctx, m); len(p.ExcludedIngredients) != 0 || p.Recipes[bech.ID] != "" {
		t.Errorf("after none: %+v, want the Exclusion cleared", p)
	}
}

func TestABaseRecipeHasNoFavouriteOrDislike(t *testing.T) {
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	m := f.member(t, "Sam", 0)
	for _, st := range []recipe.State{recipe.StateFavourite, recipe.StateDislike} {
		wantValidation(t, f.s.SetRecipeState(ctx, m, bech.ID, st), "state", recipe.CodeBasePreference)
	}
	if f.count(t, "member_recipe_preferences") != 0 {
		t.Error("nothing is stored")
	}
}

func TestOnlyAnExclusionSurvivesAPlannableRecipeNamedLikeNothing(t *testing.T) {
	// Regression guard: a plannable Recipe keeps all three states.
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	soup := f.createPlain(t, plainIn("Soup", ln(milk, 200, "ml")))
	m := f.member(t, "Sam", 0)
	for _, st := range []recipe.State{recipe.StateFavourite, recipe.StateDislike, recipe.StateExclusion} {
		if err := f.s.SetRecipeState(ctx, m, soup.ID, st); err != nil {
			t.Errorf("%s on a plannable Recipe: %v", st, err)
		}
	}
}
