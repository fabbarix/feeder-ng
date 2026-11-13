package store_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// BR-C commit half, round 5: a kept line is no dependency (docs/dev/design/base-recipes.md §11.3). It goes on a new
// plain Ingredient keyed by its name; a Base recipe's Ingredient is keyed base-recipe:<id>. Both Recipes are written.

func keptFile(order []int) (recipefile.File, map[int]int) {
	ragu := recipefile.Recipe{Name: "Ragù", BaseRecipe: ptrOf(true), Yield: 1, YieldUnit: "kg",
		Ingredients: []recipefile.Line{{Ingredient: "béchamel", Quantity: 100, Unit: "ml"}}}
	bech := recipefile.Recipe{Name: "Béchamel", BaseRecipe: ptrOf(true), Yield: 1, YieldUnit: "l",
		Ingredients: []recipefile.Line{{Ingredient: "ragù", Quantity: 50, Unit: "g"}}}
	both := []recipefile.Recipe{ragu, bech}
	f := recipefile.File{
		Format: recipefile.Format, Version: recipefile.Version,
		Ingredients: []recipefile.Ingredient{{Name: "béchamel", BaseUnit: "ml"}, {Name: "ragù", BaseUnit: "g"}},
	}
	pos := map[int]int{} // 0 = Ragù, 1 = Béchamel -> index in the file
	for i, o := range order {
		f.Recipes = append(f.Recipes, both[o])
		pos[o] = i
	}
	return f, pos
}

func lineAtPath(r, l int) string {
	return "$.recipes[" + itoa(int64(r)) + "].ingredients[" + itoa(int64(l)) + "]"
}

func TestAMixedRagùBéchamelImportWritesBothRecipesInEitherFileOrder(t *testing.T) {
	for name, order := range map[string][]int{"Ragù first": {0, 1}, "Béchamel first": {1, 0}} {
		t.Run(name, func(t *testing.T) {
			f := newSeeded(t)
			file, pos := keptFile(order)
			d := answers(map[string]recipefile.BaseRecipeLineDecision{
				lineAtPath(pos[0], 0): {Action: recipefile.BaseKeep}, // Ragù keeps "béchamel"
				lineAtPath(pos[1], 0): fileAnswer(pos[0]),            // Béchamel's "ragù" calls for Ragù
			})
			f.apply(t, file, d)

			ragu, bech := f.recipeNamed(t, "Ragù"), f.recipeNamed(t, "Béchamel")
			if !ragu.baseIng.Valid || !bech.baseIng.Valid {
				t.Fatal("both are Base recipes with their own Ingredient")
			}
			plain, ok := f.ingredientIDByKey(t, "béchamel")
			if !ok || plain == bech.baseIng.Int64 {
				t.Fatalf("Ragù's kept line needs a new plain Ingredient keyed béchamel, apart from Béchamel's (%d): got %d, %v", bech.baseIng.Int64, plain, ok)
			}
			if k := f.nameKeyOf(t, bech.baseIng.Int64); k != "base-recipe:"+itoa(bech.id) {
				t.Errorf("Béchamel's Ingredient key = %q", k)
			}
			if got := f.lineIngredients(t, ragu.id); len(got) != 1 || got[0] != plain {
				t.Errorf("Ragù's line = %v, want the plain béchamel %d", got, plain)
			}
			if got := f.lineIngredients(t, bech.id); len(got) != 1 || got[0] != ragu.baseIng.Int64 {
				t.Errorf("Béchamel's line = %v, want Ragù's Ingredient %d", got, ragu.baseIng.Int64)
			}
		})
	}
}

func TestTwoKeptLinesNamedAfterEachOtherWriteBothRecipesWithTwoPlainIngredientsBesideTheirOwn(t *testing.T) {
	f := newSeeded(t)
	file, pos := keptFile([]int{0, 1})
	d := answers(map[string]recipefile.BaseRecipeLineDecision{
		lineAtPath(pos[0], 0): {Action: recipefile.BaseKeep},
		lineAtPath(pos[1], 0): {Action: recipefile.BaseKeep},
	})
	f.apply(t, file, d)

	ragu, bech := f.recipeNamed(t, "Ragù"), f.recipeNamed(t, "Béchamel")
	plainBech, ok1 := f.ingredientIDByKey(t, "béchamel")
	plainRagu, ok2 := f.ingredientIDByKey(t, "ragù")
	if !ok1 || !ok2 {
		t.Fatalf("want plain Ingredients keyed béchamel and ragù: %v %v", ok1, ok2)
	}
	if plainBech == bech.baseIng.Int64 || plainRagu == ragu.baseIng.Int64 {
		t.Error("the plain Ingredients stand beside the Base recipes' own")
	}
	if n := f.count(t, "ingredients"); n != 4 {
		t.Errorf("Ingredients = %d, want 4 (two plain, two Base recipe Ingredients)", n)
	}
	if got := f.lineIngredients(t, ragu.id); len(got) != 1 || got[0] != plainBech {
		t.Errorf("Ragù's line = %v, want plain béchamel %d", got, plainBech)
	}
	if got := f.lineIngredients(t, bech.id); len(got) != 1 || got[0] != plainRagu {
		t.Errorf("Béchamel's line = %v, want plain ragù %d", got, plainRagu)
	}
}
