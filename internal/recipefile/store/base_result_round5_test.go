package store_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/recipefile/store"
)

// BR-C commit half, round 5 (docs/dev/design/base-recipes.md §13: "the bulk link sheet after Confirm for each Base
// recipe the import created or converted"). Result.Recipes tells the web which of the written Recipes are Base recipes
// and, for the ones a tile asked for, which tile:
//
//	store.AppliedRecipe{Index, ID, Name, Action string; Base bool; Line string; ReadNext bool}
//
//   - Base: the Recipe is a Base recipe after the import.
//   - Line: the path of the tile that created or converted it ("" for a Recipe of the file).
//   - ReadNext: the tile's "Read it next" flag (create only).
//   - Action: "created", "replaced", or "converted" (a plannable Recipe turned into a Base recipe; Index -1).

func appliedNamed(t *testing.T, res store.Result, name string) store.AppliedRecipe {
	t.Helper()
	for _, r := range res.Recipes {
		if r.Name == name {
			return r
		}
	}
	t.Fatalf("Result.Recipes = %+v: no %q", res.Recipes, name)
	return store.AppliedRecipe{}
}

func TestResultFlagsAFileBaseRecipeAndNotThePlannableRecipeThatCallsForIt(t *testing.T) {
	f := newSeeded(t)
	res := f.apply(t, lasagneFile(bechamelLine(), fileBechamel(1, "l")),
		answers(map[string]recipefile.BaseRecipeLineDecision{lineB: fileAnswer(1)}))
	if b := appliedNamed(t, res, "Béchamel"); !b.Base || b.Action != "created" || b.Index != 1 || b.Line != "" {
		t.Errorf("Béchamel = %+v, want a created Base recipe of file index 1 with no tile path", b)
	}
	if l := appliedNamed(t, res, "Lasagne"); l.Base || l.Line != "" || l.ReadNext {
		t.Errorf("Lasagne = %+v, a plannable Recipe carries no Base flag, tile or Read it next", l)
	}
}

func TestResultCarriesTheLinePathAndReadNextOfACreateAnswer(t *testing.T) {
	for _, readNext := range []bool{false, true} {
		f := newSeeded(t)
		res := f.apply(t, lasagneFile(bechamelLine()),
			answers(map[string]recipefile.BaseRecipeLineDecision{lineB: {Action: recipefile.BaseCreate, ReadNext: readNext}}))
		b := appliedNamed(t, res, "Béchamel")
		if !b.Base || b.Action != "created" || b.Index != -1 || b.Line != lineB || b.ReadNext != readNext {
			t.Errorf("readNext=%v: Béchamel = %+v, want a created Base recipe (Index -1) for the tile %s with ReadNext %v", readNext, b, lineB, readNext)
		}
		if b.ID != f.recipeNamed(t, "Béchamel").id {
			t.Errorf("readNext=%v: ID = %d, want the stored Base recipe's id", readNext, b.ID)
		}
	}
}

func TestAConvertedRecipeIsInTheResultWithItsTileAndTheBaseFlag(t *testing.T) {
	f := newSeeded(t)
	p := f.seedPesto(t)
	res := f.apply(t, lasagneFile(pestoLine()),
		answers(map[string]recipefile.BaseRecipeLineDecision{lineB: {Action: recipefile.BaseConvert, RecipeID: p.recipe.ID, Yield: 200, YieldUnit: "g"}}))
	c := appliedNamed(t, res, "Pesto")
	if c.ID != p.recipe.ID || c.Action != "converted" || !c.Base || c.Index != -1 || c.Line != lineB || c.ReadNext {
		t.Errorf("Pesto = %+v, want the converted Recipe %d (Action \"converted\", Base, Index -1, tile %s)", c, p.recipe.ID, lineB)
	}
	if n := len(res.Recipes); n != 2 {
		t.Errorf("Result.Recipes = %+v: want Lasagne and the converted Pesto, once each", res.Recipes)
	}
}

func TestAnExistingBaseRecipeThatIsOnlyUsedIsNotInTheResult(t *testing.T) {
	f := newSeeded(t)
	bech := f.baseRecipe(t, "Béchamel", 1, "l")
	res := f.apply(t, lasagneFile(bechamelLine()),
		answers(map[string]recipefile.BaseRecipeLineDecision{lineB: {Action: recipefile.BaseUse, RecipeID: bech.ID}}))
	for _, r := range res.Recipes {
		if r.Name == "Béchamel" {
			t.Errorf("Béchamel was neither created nor converted, so no bulk link is offered for it: %+v", r)
		}
	}
}

func TestAReplacedBaseRecipeIsFlaggedBaseButNotCreated(t *testing.T) {
	f := newSeeded(t)
	empty := f.baseRecipe(t, "Béchamel", 500, "ml")
	file := recipefile.File{
		Format: recipefile.Format, Version: recipefile.Version,
		Ingredients: []recipefile.Ingredient{{Name: "milk", BaseUnit: "ml"}, {Name: "butter", BaseUnit: "g"}},
		Recipes:     []recipefile.Recipe{fileBechamel(1, "l")},
	}
	res := f.apply(t, file, recipefile.Decisions{Recipes: []recipefile.RecipeDecision{{Index: 0, Action: recipefile.ActionReplace}}})
	if b := appliedNamed(t, res, "Béchamel"); b.ID != empty.ID || b.Action != "replaced" || !b.Base {
		t.Errorf("Béchamel = %+v, want the replaced Base recipe %d flagged Base", b, empty.ID)
	}
}
