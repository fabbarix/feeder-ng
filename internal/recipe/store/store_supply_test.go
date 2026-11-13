package store_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// H3 (ADR 0017, docs/dev/design/household-items.md §2 guards 2 to 5 and 6): a Supply is never a Recipe line, never the
// Ingredient of a Ready Meal or a Base recipe, and never an Exclusion. The guards are at the store, not only in the UI.
//
// Pinned codes: "ingredient_is_supply" (field "lines[i].ingredientId") and "supply_name_taken" (field "name").

const (
	codeIngredientIsSupply = "ingredient_is_supply"
	codeSupplyNameTaken    = "supply_name_taken"
)

// supply makes a Supply (an Ingredient of kind supply, which has no Shelf Life).
func (f *fixture) supply(t *testing.T, name string, base units.Base) int64 {
	t.Helper()
	return f.exec(t, `INSERT INTO ingredients(name, name_key, base_unit, kind, created_at, updated_at) VALUES (?,?,?,'supply',?,?)`,
		name, units.NormalizeName(name), string(base), "2026-11-09T12:00:00Z", "2026-11-09T12:00:00Z")
}

func (f *fixture) ingredientCount(t *testing.T) int { return f.count(t, "ingredients") }

func TestTheConstantsOfTheSupplyGuardsAreThePlansCodes(t *testing.T) {
	if recipe.CodeIngredientIsSupply != codeIngredientIsSupply || recipe.CodeSupplyNameTaken != codeSupplyNameTaken {
		t.Fatalf("codes = %q and %q, want %q and %q", recipe.CodeIngredientIsSupply, recipe.CodeSupplyNameTaken, codeIngredientIsSupply, codeSupplyNameTaken)
	}
}

// ---- guard 2: a Recipe line ----

func TestARecipeWithASupplyLineIsRefusedAndNothingIsStored(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	soap := f.supply(t, "Dish soap", units.Millilitre)
	_, err := f.s.Create(ctx, plainIn("Soup", ln(milk, 200, "ml"), ln(soap, 10, "ml")))
	wantValidation(t, err, "lines[1].ingredientId", codeIngredientIsSupply)
	if f.recipeCount(t) != 0 || f.count(t, "recipe_lines") != 0 {
		t.Error("a refused save stores nothing")
	}
}

func TestSavingARecipeAgainWithASupplyLineIsRefusedAndTheRecipeKeepsItsLines(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	soap := f.supply(t, "Dish soap", units.Millilitre)
	soup := f.createPlain(t, plainIn("Soup", ln(milk, 200, "ml")))
	_, err := f.s.Update(ctx, soup.ID, plainIn("Soup", ln(milk, 200, "ml"), ln(soap, 10, "ml")))
	wantValidation(t, err, "lines[1].ingredientId", codeIngredientIsSupply)
	got, _ := f.s.Get(ctx, soup.ID)
	if len(got.Lines) != 1 {
		t.Errorf("lines = %d, want the 1 stored line kept", len(got.Lines))
	}
}

func TestABaseRecipeWithASupplyLineIsRefused(t *testing.T) {
	f := newBaseFixture(t)
	soap := f.supply(t, "Dish soap", units.Millilitre)
	_, err := f.s.Create(ctx, baseIn("Béchamel", 1, "l", ln(soap, 10, "ml")))
	wantValidation(t, err, "lines[0].ingredientId", codeIngredientIsSupply)
	if f.recipeCount(t) != 0 {
		t.Error("a refused save stores nothing")
	}
}

func TestAReadyMealWhoseNamedPackLineIsASupplyIsRefused(t *testing.T) {
	f := newBaseFixture(t)
	roll := f.supply(t, "Toilet paper", units.Piece)
	_, err := f.s.Create(ctx, recipe.Input{Name: "Pack", Yield: 2, ReadyMeal: true, Lines: []recipe.Line{ln(roll, 1, "piece")}})
	wantValidation(t, err, "lines[0].ingredientId", codeIngredientIsSupply)
	if f.recipeCount(t) != 0 {
		t.Error("a refused save stores nothing")
	}
}

func TestALineThatCallsForABaseRecipeWhoseIngredientIsASupplyIsRefused(t *testing.T) {
	// Data written before the guards: a Base recipe's Ingredient made a Supply by hand. Saving a call for it is refused.
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	f.exec(t, `UPDATE ingredients SET kind = 'supply' WHERE id = ?`, bech.BaseIngredientID)
	_, err := f.s.Create(ctx, plainIn("Lasagne", callFor(bech, 500, "ml")))
	wantValidation(t, err, "lines[0].ingredientId", codeIngredientIsSupply)
}

// ---- guard 3: a Ready Meal's Ingredient is named like the Recipe ----

func TestAReadyMealNamedLikeASupplyIsRefusedAndCreatesNoIngredient(t *testing.T) {
	f := newBaseFixture(t)
	f.supply(t, "Lasagne pack", units.Piece)
	before := f.ingredientCount(t)
	_, err := f.s.Create(ctx, recipe.Input{Name: "lasagne  PACK", Yield: 2, ReadyMeal: true})
	wantValidation(t, err, "name", codeSupplyNameTaken)
	if f.recipeCount(t) != 0 || f.ingredientCount(t) != before {
		t.Errorf("recipes %d, Ingredients %d (was %d): nothing is stored or created", f.recipeCount(t), f.ingredientCount(t), before)
	}
}

func TestAReadyMealIsNeverGivenASupplyOfItsNameToReuse(t *testing.T) {
	// A food Ingredient of that name is reused as before: the guard is for a Supply only.
	f := newBaseFixture(t)
	food := f.ingredient(t, "Lasagne pack", units.Piece)
	r, err := f.s.Create(ctx, recipe.Input{Name: "Lasagne pack", Yield: 2, ReadyMeal: true})
	if err != nil || len(r.Lines) != 1 || r.Lines[0].IngredientID != food {
		t.Fatalf("Create = %+v, %v; want the food Ingredient %d reused", r.Lines, err, food)
	}
}

// ---- guard 4: a Base recipe's Ingredient is named like the Base recipe ----

func TestABaseRecipeNamedLikeASupplyIsRefusedWhateverTheTakeOverAnswer(t *testing.T) {
	for name, ans := range map[string]*bool{"no answer": nil, "yes": yes(), "no": no()} {
		t.Run(name, func(t *testing.T) {
			f := newBaseFixture(t)
			soap := f.supply(t, "Dish soap", units.Millilitre)
			in := baseIn("dish SOAP", 1, "l")
			in.TakeOver = ans
			_, err := f.s.Create(ctx, in)
			var ask *recipe.TakeOverError
			if errors.As(err, &ask) {
				t.Fatalf("a Supply is never offered for a take-over: %v", err)
			}
			wantValidation(t, err, "name", codeSupplyNameTaken)
			if f.recipeCount(t) != 0 {
				t.Error("a refused save stores nothing")
			}
			if k := f.nameKeyOf(t, soap); k != units.NormalizeName("Dish soap") {
				t.Errorf("the Supply's name_key = %q, it must be untouched", k)
			}
		})
	}
}

func (f *fixture) nameKeyOf(t *testing.T, id int64) string {
	t.Helper()
	var k string
	if err := f.db.QueryRow(`SELECT name_key FROM ingredients WHERE id = ?`, id).Scan(&k); err != nil {
		t.Fatal(err)
	}
	return k
}

func TestAPlainRecipeMadeIntoABaseRecipeNamedLikeASupplyIsRefused(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	f.supply(t, "Dish soap", units.Millilitre)
	soup := f.createPlain(t, plainIn("Dish soap", ln(milk, 200, "ml")))
	_, err := f.s.ToBase(ctx, soup.ID, recipe.ToBaseInput{Yield: 1, YieldUnit: "l", TakeOver: yes()})
	wantValidation(t, err, "name", codeSupplyNameTaken)
	if got, _ := f.s.Get(ctx, soup.ID); got.IsBase() {
		t.Error("the Recipe stays plannable")
	}
}

func TestLinkingWithANewBaseRecipeNamedLikeASupplyIsRefused(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	f.supply(t, "Dish soap", units.Millilitre)
	soup := f.createPlain(t, plainIn("Soup", ln(milk, 200, "ml")))
	_, err := f.s.LinkLine(ctx, soup.ID, soup.Lines[0].ID, recipe.LinkRequest{
		Create: &recipe.NewBase{Name: "Dish soap", Yield: 1, YieldUnit: "l"}, TakeOver: yes()})
	wantValidation(t, err, "name", codeSupplyNameTaken)
}

// ---- guard 5: a Base recipe line never links to a Supply ----

func TestUseAsAPlainIngredientNeverPointsALineAtASupply(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	soap := f.supply(t, "Dish soap", units.Millilitre)
	lasagne := f.createPlain(t, plainIn("Lasagne", ln(milk, 100, "ml"), callFor(bech, 500, "ml")))
	_, err := f.s.UnlinkLine(ctx, lasagne.ID, lasagne.Lines[1].ID, soap)
	wantValidation(t, err, "lines[1].ingredientId", codeIngredientIsSupply)
	if ing, _ := f.lineIngredient(t, lasagne.Lines[1].ID); ing != bech.BaseIngredientID {
		t.Errorf("the line is on Ingredient %d, want it still the Base recipe's %d", ing, bech.BaseIngredientID)
	}
}

// ---- guard 6: Exclusions ----

func TestAnExclusionOfASupplyIsRefusedAndNothingIsStored(t *testing.T) {
	f := newBaseFixture(t)
	m := f.member(t, "Sam", 0)
	soap := f.supply(t, "Dish soap", units.Millilitre)
	err := f.s.SetIngredientExclusion(ctx, m, soap, true)
	wantValidation(t, err, "ingredientId", codeIngredientIsSupply)
	if f.count(t, "member_ingredient_exclusions") != 0 {
		t.Error("nothing is stored")
	}
}

func TestRemovingAnExclusionOfASupplyIsStillAllowedSoOldDataCanBeCleared(t *testing.T) {
	f := newBaseFixture(t)
	m := f.member(t, "Sam", 0)
	soap := f.supply(t, "Dish soap", units.Millilitre)
	f.exec(t, `INSERT INTO member_ingredient_exclusions(member_id, ingredient_id) VALUES (?,?)`, m, soap)
	if err := f.s.SetIngredientExclusion(ctx, m, soap, false); err != nil {
		t.Fatalf("SetIngredientExclusion(excluded=false) = %v", err)
	}
	if f.count(t, "member_ingredient_exclusions") != 0 {
		t.Error("the Exclusion is removed")
	}
}

func TestAnExclusionOfFoodIsStillAllowed(t *testing.T) {
	f := newBaseFixture(t)
	m := f.member(t, "Sam", 0)
	milk, _, _ := f.basics(t)
	if err := f.s.SetIngredientExclusion(ctx, m, milk, true); err != nil {
		t.Fatal(err)
	}
	if f.count(t, "member_ingredient_exclusions") != 1 {
		t.Error("the Exclusion is stored")
	}
}
