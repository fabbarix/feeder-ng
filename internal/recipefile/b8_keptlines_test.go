package recipefile_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// beta.8, base team (docs/dev/design/b8-base.md section 1): the take-over ask says how many lines of the file will use the
// Base recipe too after a Yes, or keep the plain Ingredient after a No: `keptLines`. A line counts when it is in a kept
// Recipe of the file, its name is the plain Ingredient's (units.NormalizeName) and it is not answered with a Base recipe
// (use, file, create, convert). The count never includes lines of stored Recipes: the ask's `recipes` already names them.
// The server counts because name matching lives there; the field is always present (0 when no line).

// moussaka is a second file Recipe with its own "béchamel" line (line 1).
func moussaka() recipefile.Recipe {
	m := miniRecipe("Moussaka")
	m.Ingredients = []recipefile.Line{{Ingredient: "lamb", Quantity: 500, Unit: "g"}, {Ingredient: "béchamel", Quantity: 300, Unit: "ml"}}
	return m
}

func withLamb(f recipefile.File) recipefile.File {
	f.Ingredients = append(f.Ingredients, recipefile.Ingredient{Name: "lamb", BaseUnit: "g"})
	return f
}

func keptLinesOf(t *testing.T, p recipefile.Plan, path string) float64 {
	t.Helper()
	asks, _ := planMap(t, p)["takeOvers"].([]any)
	for _, a := range asks {
		ask := a.(map[string]any)
		if ask["path"] == path {
			v, has := ask["keptLines"]
			if !has {
				t.Fatalf("ask at %s has no keptLines (the field is always present): %v", path, ask)
			}
			return v.(float64)
		}
	}
	t.Fatalf("no take-over ask at %s in %v", path, asks)
	return 0
}

func TestTheTakeOverAskCountsAnotherFileLineOfTheSameNameThatIsNotAnsweredWithABaseRecipe(t *testing.T) {
	f := withLamb(lasagneWith(bechamelLine(), moussaka()))
	d := answerAt(lineB, recipefile.BaseRecipeLineDecision{Action: recipefile.BaseCreate})
	p := plan(t, f, plainBechamel("ml"), d)
	if got := keptLinesOf(t, p, lineB); got != 1 {
		t.Errorf("keptLines = %v, want 1: Moussaka's béchamel line stays on the plain Ingredient (or takes the Base recipe with a Yes)", got)
	}
}

func TestAFileLineKeptAsAnIngredientCountsAndALineAnsweredWithTheBaseRecipeDoesNot(t *testing.T) {
	f := withLamb(withMilk(lasagneWith(bechamelLine(), fileBechamel(true), moussaka())))
	const moussakaLine = "$.recipes[2].ingredients[1]"
	d := recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{
		lineB:        fileAnswer(1),
		moussakaLine: {Action: recipefile.BaseKeep},
	}}
	p := plan(t, f, plainBechamel("ml"), d)
	if got := keptLinesOf(t, p, "$.recipes[1]"); got != 1 {
		t.Errorf("keptLines = %v, want 1: only Moussaka's kept line; Lasagne's line is answered with the Base recipe", got)
	}
}

func TestKeptLinesIsZeroAndPresentWhenNoOtherLineHasTheName(t *testing.T) {
	d := answerAt(lineB, recipefile.BaseRecipeLineDecision{Action: recipefile.BaseCreate})
	p := plan(t, lasagneWith(bechamelLine()), plainBechamel("ml"), d)
	if got := keptLinesOf(t, p, lineB); got != 0 {
		t.Errorf("keptLines = %v, want 0", got)
	}
}

func TestKeptLinesCountsEveryLineOfThatNameAcrossFileRecipes(t *testing.T) {
	second := moussaka()
	second.Ingredients = append(second.Ingredients, recipefile.Line{Ingredient: "Béchamel", Quantity: 100, Unit: "ml"}) // two lines, one Recipe
	f := withLamb(lasagneWith(bechamelLine(), second))
	d := answerAt(lineB, recipefile.BaseRecipeLineDecision{Action: recipefile.BaseCreate})
	if got := keptLinesOf(t, plan(t, f, plainBechamel("ml"), d), lineB); got != 2 {
		t.Errorf("keptLines = %v, want 2 (lines, not Recipes; names match as NormalizeName does)", got)
	}
}
