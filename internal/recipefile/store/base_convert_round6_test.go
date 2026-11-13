package store_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// BR-C commit half, round 6: two tiles answered "convert" to the same Recipe convert it once (the second ToBase used to
// fail with "this Recipe is already a Base recipe"). One Result entry, both lines on Pesto's Ingredient.

const pestoTile2 = "$.recipes[1].ingredients[1]"

func gnocchiWithPesto() recipefile.Recipe {
	return recipefile.Recipe{Name: "Gnocchi", Yield: 2, Ingredients: []recipefile.Line{
		{Ingredient: "butter", Quantity: 20, Unit: "g"}, {Ingredient: "pesto", Quantity: 60, Unit: "g"}}}
}

func twoConvertAnswers(pesto int64) recipefile.Decisions {
	c := recipefile.BaseRecipeLineDecision{Action: recipefile.BaseConvert, RecipeID: pesto, Yield: 200, YieldUnit: "g"}
	return answers(map[string]recipefile.BaseRecipeLineDecision{lineB: c, pestoTile2: c})
}

func TestTwoConvertAnswersToOneRecipeConvertItOnceAndBothLinesUseItsIngredient(t *testing.T) {
	f := newSeeded(t)
	p := f.seedPesto(t)
	res := readyThenApply(t, f, lasagneFile(pestoLine(), gnocchiWithPesto()), twoConvertAnswers(p.recipe.ID))

	n := 0
	for _, r := range res.Recipes {
		if r.Name == "Pesto" {
			n++
			if r.Action != "converted" || !r.Base || r.ID != p.recipe.ID {
				t.Errorf("Pesto = %+v, want one \"converted\" Base entry", r)
			}
		}
	}
	if n != 1 {
		t.Errorf("Pesto appears %d times in the Confirm result, want once", n)
	}
	pesto := f.recipeNamed(t, "Pesto")
	if !pesto.baseIng.Valid || pesto.yield != 200 {
		t.Fatalf("Pesto = %+v, want a Base recipe of 200 g", pesto)
	}
	for _, name := range []string{"Lasagne", "Gnocchi"} {
		if ing, _, _ := f.lineAt(t, f.recipeNamed(t, name).id, 1); ing != pesto.baseIng.Int64 {
			t.Errorf("%s's pesto line is on Ingredient %d, want Pesto's %d", name, ing, pesto.baseIng.Int64)
		}
	}
	if _, ok := f.ingredientIDByKey(t, "pesto"); ok {
		t.Error("no plain Ingredient named pesto is created")
	}
}

func TestTwoConvertAnswersTakeOverTheSamePlainIngredientOnce(t *testing.T) {
	f := newSeeded(t)
	p := f.seedPesto(t)
	plain := f.ingredient(t, "pesto", units.Gram)
	d := withTakeOvers(t, twoConvertAnswers(p.recipe.ID), map[string]bool{lineB: true})
	res := readyThenApply(t, f, lasagneFile(pestoLine(), gnocchiWithPesto()), d)

	converted := 0
	for _, r := range res.Recipes {
		if r.Action == "converted" {
			converted++
		}
	}
	if converted != 1 {
		t.Errorf("converted entries = %d, want 1", converted)
	}
	pesto := f.recipeNamed(t, "Pesto")
	if pesto.baseIng.Int64 != plain {
		t.Errorf("Pesto's Ingredient = %d, want the plain pesto %d it took over", pesto.baseIng.Int64, plain)
	}
	for _, name := range []string{"Lasagne", "Gnocchi"} {
		if ing, _, _ := f.lineAt(t, f.recipeNamed(t, name).id, 1); ing != plain {
			t.Errorf("%s's pesto line is on Ingredient %d, want %d", name, ing, plain)
		}
	}
}
