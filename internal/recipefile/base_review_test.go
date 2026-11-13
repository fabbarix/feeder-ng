package recipefile_test

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// BR-C: Import Review rows for lines that call for another recipe (docs/dev/design/base-recipes.md §11.3,
// ADR 0015 P3 and P7). A row comes from the model's mark (`recipe`) or from an exact or close name match
// against existing Base recipes, existing plannable Recipes and the file's Recipes. Detection always asks;
// only an exact name match to a Base recipe (existing, or in the file) is preselected, and a Base recipe wins
// over a plain Ingredient of the same name. "Keep it as an Ingredient" is always an answer.
//
// The commit half (creating Base recipes, converting a Recipe, the store) waits for BR-B and is only stubbed.

// lasagneWith is Lasagne with a plain line and the line under test. Every Ingredient is defined, so only the
// Base recipe tiles can keep the plan from being Ready.
func lasagneWith(line recipefile.Line, extra ...recipefile.Recipe) recipefile.File {
	l := miniRecipe("Lasagne")
	l.Ingredients = []recipefile.Line{{Ingredient: "lasagne sheets", Quantity: 250, Unit: "g"}, line}
	f := fileOf(append([]recipefile.Recipe{l}, extra...)...)
	base := "ml"
	if line.Unit == "g" {
		base = "g"
	}
	f.Ingredients = []recipefile.Ingredient{{Name: "lasagne sheets", BaseUnit: "g"}, {Name: line.Ingredient, BaseUnit: base}}
	return f
}

func rowAt(t *testing.T, p recipefile.Plan, path string) recipefile.BaseRecipeLine {
	t.Helper()
	for _, r := range p.BaseRecipeLines {
		if r.Path == path {
			return r
		}
	}
	t.Fatalf("no Base recipe row at %s in %+v", path, p.BaseRecipeLines)
	return recipefile.BaseRecipeLine{}
}

const lineB = "$.recipes[0].ingredients[1]"

func bechamelLine() recipefile.Line {
	return recipefile.Line{Ingredient: "béchamel", Quantity: 500, Unit: "ml"}
}

func existingBase() recipefile.Existing {
	return recipefile.Existing{
		Ingredients: []ingredientT{ing(7, "Béchamel", "ml")},
		Recipes:     []recipefile.RecipeRef{{ID: 40, Name: "Béchamel"}},
		BaseRecipes: []recipefile.BaseRecipeRef{{RecipeID: 40, IngredientID: 7}},
	}
}

func TestPlanJSONAlwaysHasBaseRecipeLines(t *testing.T) {
	p := plan(t, exampleFile(t), recipefile.Existing{}, recipefile.Decisions{})
	raw, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"baseRecipeLines":[]`) {
		t.Fatalf("a file without references has an empty list, never null: %s", raw)
	}
	if len(p.BaseRecipeLines) != 0 || !p.Ready {
		t.Errorf("the published example has no reference: %+v", p.BaseRecipeLines)
	}
}

func TestALineThatOnlyMatchesAnIngredientIsNotAsked(t *testing.T) {
	f := lasagneWith(recipefile.Line{Ingredient: "milk", Quantity: 500, Unit: "ml"})
	ex := recipefile.Existing{Ingredients: []ingredientT{ing(3, "Milk", "ml")}}
	if p := plan(t, f, ex, recipefile.Decisions{}); len(p.BaseRecipeLines) != 0 {
		t.Fatalf("rows = %+v", p.BaseRecipeLines)
	}
}

func TestARecipeDoesNotMatchItsOwnLines(t *testing.T) {
	r := miniRecipe("Pesto")
	r.Ingredients = []recipefile.Line{{Ingredient: "pesto", Quantity: 100, Unit: "g"}}
	f := fileOf(r)
	f.Ingredients = []recipefile.Ingredient{{Name: "pesto", BaseUnit: "g"}}
	if p := plan(t, f, recipefile.Existing{}, recipefile.Decisions{}); len(p.BaseRecipeLines) != 0 {
		t.Fatalf("a Recipe cannot call for itself: %+v", p.BaseRecipeLines)
	}
}

// ---- from the model's mark ------------------------------------------------------------------------------------

func TestAMarkedLineWithNoMatchGetsARowThatWaitsForAnAnswer(t *testing.T) {
	line := recipefile.Line{Ingredient: "pasta frolla", Quantity: 300, Unit: "g",
		Recipe: &recipefile.LineRecipe{Name: "pasta frolla", Cue: "see page 42"}}
	f := lasagneWith(line)
	p := plan(t, f, recipefile.Existing{}, recipefile.Decisions{})
	row := rowAt(t, p, lineB)
	if row.Name != "pasta frolla" || row.Reference != "pasta frolla" || row.Cue != "see page 42" || row.Quantity != 300 || row.Unit != "g" {
		t.Errorf("the row shows the line as read: %+v", row)
	}
	if len(row.Suggestions) != 0 || row.KeepIngredient != nil {
		t.Errorf("nothing to suggest: %+v", row)
	}
	if row.Resolved || row.Effective != nil {
		t.Errorf("an unmatched mark is never preselected: %+v", row)
	}
	if p.Ready {
		t.Error("Confirm waits while a tile has no answer")
	}
	for _, d := range []recipefile.BaseRecipeLineDecision{{Action: recipefile.BaseKeep}, {Action: recipefile.BaseCreate}, {Action: recipefile.BaseCreate, ReadNext: true}} {
		p = plan(t, f, recipefile.Existing{}, recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{lineB: d}})
		if r := rowAt(t, p, lineB); !r.Resolved || r.Effective == nil || r.Effective.Action != d.Action {
			t.Errorf("%+v: row = %+v", d, r)
		}
		if !p.Ready {
			t.Errorf("%+v: plan not ready: %+v", d, p.Problems)
		}
	}
}

func TestAMarkNamesTheRecipeEvenWhenTheIngredientIsNamedDifferently(t *testing.T) {
	line := recipefile.Line{Ingredient: "white sauce", Quantity: 500, Unit: "ml", Recipe: &recipefile.LineRecipe{Name: "Béchamel"}}
	p := plan(t, lasagneWith(line), existingBase(), recipefile.Decisions{})
	row := rowAt(t, p, lineB)
	if len(row.Suggestions) != 1 || row.Suggestions[0].Kind != recipefile.SuggestBase || row.Suggestions[0].RecipeID != 40 || !row.Suggestions[0].Exact {
		t.Fatalf("suggestions = %+v, want the existing Béchamel as an exact match on the mark's name", row.Suggestions)
	}
}

func TestACloseButNotExactNameIsSuggestedAndNeverPreselected(t *testing.T) {
	line := recipefile.Line{Ingredient: "béchamel sauce", Quantity: 500, Unit: "ml", Recipe: &recipefile.LineRecipe{Name: "béchamel sauce"}}
	p := plan(t, lasagneWith(line), existingBase(), recipefile.Decisions{})
	row := rowAt(t, p, lineB)
	if len(row.Suggestions) == 0 || row.Suggestions[0].RecipeID != 40 || row.Suggestions[0].Exact {
		t.Fatalf("suggestions = %+v", row.Suggestions)
	}
	if row.Resolved || row.Effective != nil || p.Ready {
		t.Errorf("only an exact name is preselected: %+v", row)
	}
}

// ---- from a name match alone ----------------------------------------------------------------------------------

func TestAnExactNameMatchToABaseRecipeIsAskedAboutEvenWithoutTheModelsMark(t *testing.T) {
	p := plan(t, lasagneWith(bechamelLine()), existingBase(), recipefile.Decisions{})
	row := rowAt(t, p, lineB)
	if row.Reference != "" || row.Cue != "" {
		t.Errorf("the model marked nothing: %+v", row)
	}
	if len(row.Suggestions) != 1 || row.Suggestions[0].Kind != recipefile.SuggestBase || row.Suggestions[0].RecipeID != 40 || !row.Suggestions[0].Exact {
		t.Fatalf("suggestions = %+v", row.Suggestions)
	}
	if !row.Resolved || row.Effective == nil || row.Effective.Action != recipefile.BaseUse || row.Effective.RecipeID != 40 {
		t.Errorf("an exact match to a Base recipe is preselected: %+v", row)
	}
	if !p.Ready {
		t.Errorf("a preselected answer counts as answered: %+v", p)
	}
}

func TestNameMatchingIgnoresCaseAccentsAndPlurals(t *testing.T) {
	for _, name := range []string{"BECHAMEL", "bechamel", "  Béchamel  ", "béchamels"} {
		line := recipefile.Line{Ingredient: name, Quantity: 500, Unit: "ml"}
		p := plan(t, lasagneWith(line), existingBase(), recipefile.Decisions{})
		row := rowAt(t, p, lineB)
		if !row.Resolved || row.Effective == nil || row.Effective.RecipeID != 40 {
			t.Errorf("%q: row = %+v", name, row)
		}
	}
}

func TestAnExactNameMatchToAPlannableRecipeIsOfferedButNeverPreselected(t *testing.T) {
	line := recipefile.Line{Ingredient: "pesto", Quantity: 100, Unit: "g"}
	ex := recipefile.Existing{Recipes: []recipefile.RecipeRef{{ID: 50, Name: "Pesto"}}}
	p := plan(t, lasagneWith(line), ex, recipefile.Decisions{})
	row := rowAt(t, p, lineB)
	if len(row.Suggestions) != 1 || row.Suggestions[0].Kind != recipefile.SuggestPlannable || row.Suggestions[0].RecipeID != 50 || !row.Suggestions[0].Exact {
		t.Fatalf("suggestions = %+v", row.Suggestions)
	}
	if row.Resolved || row.Effective != nil || p.Ready {
		t.Errorf("turning a Recipe you plan into a Base recipe is always the User's call: %+v", row)
	}
}

func TestABaseRecipeIsPreferredOverAPlainIngredientOfTheSameName(t *testing.T) {
	// Id 7 is the Base recipe's own Ingredient, id 8 a plain Ingredient that happens to share the name (ADR 0015 P7).
	ex := existingBase()
	ex.Ingredients = append(ex.Ingredients, ing(8, "béchamel", "ml"))
	p := plan(t, lasagneWith(bechamelLine()), ex, recipefile.Decisions{})
	row := rowAt(t, p, lineB)
	if !row.Resolved || row.Effective == nil || row.Effective.Action != recipefile.BaseUse || row.Effective.RecipeID != 40 {
		t.Fatalf("the Base recipe is preselected: %+v", row)
	}
	if row.KeepIngredient == nil || row.KeepIngredient.ID != 8 || row.KeepIngredient.Name != "béchamel" {
		t.Errorf("keep it as an Ingredient shows the plain one: %+v", row.KeepIngredient)
	}
	// Keeping it makes the line a plain line of the plain Ingredient 8, never of the Base recipe's Ingredient.
	d := recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{lineB: {Action: recipefile.BaseKeep}}}
	p = plan(t, lasagneWith(bechamelLine()), ex, d)
	if r := rowAt(t, p, lineB); r.Effective == nil || r.Effective.Action != recipefile.BaseKeep || !p.Ready {
		t.Errorf("after keep: %+v ready=%v", r, p.Ready)
	}
	if m := matchOf(t, p, "béchamel"); m.Match == nil || m.Match.ID != 8 {
		t.Errorf("the Ingredient row matches the plain Ingredient 8, got %+v", m.Match)
	}
}

func TestKeepIngredientIsOnlyShownWhenAPlainIngredientExists(t *testing.T) {
	row := rowAt(t, plan(t, lasagneWith(bechamelLine()), existingBase(), recipefile.Decisions{}), lineB)
	if row.KeepIngredient != nil {
		t.Errorf("only the Base recipe's own Ingredient exists: %+v", row.KeepIngredient)
	}
}

func TestPlainNameMatchingNeverReturnsABaseRecipesIngredient(t *testing.T) {
	// The file's "béchamel" Ingredient, with only the Base recipe's own Ingredient in the household: not an exact match.
	f := lasagneWith(bechamelLine())
	p := plan(t, f, existingBase(), recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{lineB: {Action: recipefile.BaseKeep}}})
	if m := matchOf(t, p, "béchamel"); m.Status == recipefile.StatusExact || m.Match != nil {
		t.Errorf("a Base recipe's Ingredient is not matched by plain name: %+v", m)
	}
}

// ---- Recipes of the same file ---------------------------------------------------------------------------------

func fileBechamel(base bool) recipefile.Recipe {
	r := miniRecipe("Béchamel")
	r.Yield = 1
	r.Ingredients = []recipefile.Line{{Ingredient: "milk", Quantity: 1000, Unit: "ml"}}
	if base {
		r.BaseRecipe = ptr(true)
		r.YieldUnit = "l"
	}
	return r
}

func withMilk(f recipefile.File) recipefile.File {
	f.Ingredients = append(f.Ingredients, recipefile.Ingredient{Name: "milk", BaseUnit: "ml"})
	return f
}

func TestAnExactMatchToABaseRecipeOfTheSameFileIsPreselected(t *testing.T) {
	f := withMilk(lasagneWith(bechamelLine(), fileBechamel(true)))
	p := plan(t, f, recipefile.Existing{}, recipefile.Decisions{})
	row := rowAt(t, p, lineB)
	if len(row.Suggestions) != 1 || row.Suggestions[0].Kind != recipefile.SuggestFile || row.Suggestions[0].RecipeIndex == nil || *row.Suggestions[0].RecipeIndex != 1 || !row.Suggestions[0].Exact {
		t.Fatalf("suggestions = %+v", row.Suggestions)
	}
	e := row.Effective
	if !row.Resolved || e == nil || e.Action != recipefile.BaseFile || e.RecipeIndex == nil || *e.RecipeIndex != 1 {
		t.Errorf("effective = %+v", e)
	}
	if !p.Ready {
		t.Errorf("not ready: %+v %+v", p.Problems, p.BaseRecipeLines)
	}
}

func TestAFileRecipeNotMarkedAsABaseRecipeIsOfferedButNeedsAYield(t *testing.T) {
	f := withMilk(lasagneWith(bechamelLine(), fileBechamel(false)))
	p := plan(t, f, recipefile.Existing{}, recipefile.Decisions{})
	row := rowAt(t, p, lineB)
	if len(row.Suggestions) != 1 || row.Suggestions[0].Kind != recipefile.SuggestFile {
		t.Fatalf("suggestions = %+v", row.Suggestions)
	}
	if row.Resolved || p.Ready {
		t.Fatalf("the file does not say it is a Base recipe, so it is not preselected: %+v", row)
	}
	idx := 1
	answer := func(d recipefile.BaseRecipeLineDecision) recipefile.Plan {
		return plan(t, f, recipefile.Existing{}, recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{lineB: d}})
	}
	p = answer(recipefile.BaseRecipeLineDecision{Action: recipefile.BaseFile, RecipeIndex: &idx})
	if rowAt(t, p, lineB).Resolved || !hasProblemCode(p, recipefile.ProblemBaseRecipeAnswer) {
		t.Errorf("choosing it without a Yield is incomplete: %+v", p)
	}
	p = answer(recipefile.BaseRecipeLineDecision{Action: recipefile.BaseFile, RecipeIndex: &idx, Yield: 1, YieldUnit: "portion"})
	if !rowAt(t, p, lineB).Resolved || !p.Ready {
		t.Errorf("with a Yield: %+v", p)
	}
}

func hasProblemCode(p recipefile.Plan, code string) bool {
	for _, pr := range p.Problems {
		if pr.Code == code {
			return true
		}
	}
	return false
}

// ---- answers that do not fit ----------------------------------------------------------------------------------

func TestAnswersThatDoNotFitTheRowLeaveItUnresolvedWithAProblem(t *testing.T) {
	// Existing: Béchamel (Base recipe, 40) and Pesto (plannable, 50). The line is "béchamel".
	ex := existingBase()
	ex.Recipes = append(ex.Recipes, recipefile.RecipeRef{ID: 50, Name: "Pesto"})
	f := lasagneWith(bechamelLine(), fileBechamel(true))
	bad := 9
	cases := map[string]recipefile.BaseRecipeLineDecision{
		"use an unknown Recipe":                {Action: recipefile.BaseUse, RecipeID: 999},
		"use a plannable Recipe as a Base one": {Action: recipefile.BaseUse, RecipeID: 50},
		"file: index out of range":             {Action: recipefile.BaseFile, RecipeIndex: &bad},
		"convert needs a Yield":                {Action: recipefile.BaseConvert, RecipeID: 50},
		"convert with a bad unit":              {Action: recipefile.BaseConvert, RecipeID: 50, Yield: 1, YieldUnit: "bunch"},
		"convert a Base recipe":                {Action: recipefile.BaseConvert, RecipeID: 40, Yield: 1, YieldUnit: "l"},
		"convert an unknown Recipe":            {Action: recipefile.BaseConvert, RecipeID: 999, Yield: 1, YieldUnit: "l"},
		"an action nobody knows":               {Action: "link"},
	}
	for name, d := range cases {
		t.Run(name, func(t *testing.T) {
			p := plan(t, f, ex, recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{lineB: d}})
			if rowAt(t, p, lineB).Resolved || p.Ready || !hasProblemCode(p, recipefile.ProblemBaseRecipeAnswer) {
				t.Errorf("row %+v, ready %v, problems %+v", rowAt(t, p, lineB), p.Ready, p.Problems)
			}
		})
	}
}

func TestConvertingAPlannableRecipeNeedsItsYieldAndIsThenResolved(t *testing.T) {
	line := recipefile.Line{Ingredient: "pesto", Quantity: 100, Unit: "g"}
	ex := recipefile.Existing{Recipes: []recipefile.RecipeRef{{ID: 50, Name: "Pesto"}}}
	d := recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{
		lineB: {Action: recipefile.BaseConvert, RecipeID: 50, Yield: 200, YieldUnit: "g"},
	}}
	p := plan(t, lasagneWith(line), ex, d)
	if r := rowAt(t, p, lineB); !r.Resolved || !p.Ready {
		t.Fatalf("row %+v problems %+v", r, p.Problems)
	}
}

func TestAnAnswerForALineThatHasNoRowIsIgnored(t *testing.T) {
	d := recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{"$.recipes[0].ingredients[0]": {Action: recipefile.BaseKeep}}}
	p := plan(t, lasagneWith(bechamelLine()), existingBase(), d)
	if len(p.BaseRecipeLines) != 1 || !p.Ready || len(p.Problems) != 0 {
		t.Fatalf("rows %+v problems %+v", p.BaseRecipeLines, p.Problems)
	}
}

// ---- cycles inside the file ------------------------------------------------------------------------------------

func TestAnswersThatMakeTheFilesRecipesCallForEachOtherAreACycle(t *testing.T) {
	a := miniRecipe("A")
	a.BaseRecipe, a.YieldUnit, a.Yield = ptr(true), "g", 100
	a.Ingredients = []recipefile.Line{{Ingredient: "b", Quantity: 10, Unit: "g"}}
	b := miniRecipe("B")
	b.BaseRecipe, b.YieldUnit, b.Yield = ptr(true), "g", 100
	b.Ingredients = []recipefile.Line{{Ingredient: "a", Quantity: 10, Unit: "g"}}
	f := fileOf(a, b)
	f.Ingredients = []recipefile.Ingredient{{Name: "a", BaseUnit: "g"}, {Name: "b", BaseUnit: "g"}}
	p := plan(t, f, recipefile.Existing{}, recipefile.Decisions{})
	if len(p.BaseRecipeLines) != 2 {
		t.Fatalf("rows = %+v", p.BaseRecipeLines)
	}
	if !hasProblemCode(p, recipefile.ProblemBaseRecipeCycle) || p.Ready {
		t.Fatalf("A calls for B, which calls for A: %+v", p.Problems)
	}
	for _, pr := range p.Problems {
		if pr.Code == recipefile.ProblemBaseRecipeCycle && !strings.Contains(pr.Message, "A") {
			t.Errorf("the message names the Recipes in order: %q", pr.Message)
		}
	}
	// Keeping one of the lines as an Ingredient breaks the cycle.
	d := recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{"$.recipes[1].ingredients[0]": {Action: recipefile.BaseKeep}}}
	if p = plan(t, f, recipefile.Existing{}, d); hasProblemCode(p, recipefile.ProblemBaseRecipeCycle) {
		t.Errorf("no cycle left: %+v", p.Problems)
	}
}

func TestAFileRecipeThatCallsForItselfIsACycle(t *testing.T) {
	a := miniRecipe("Roux")
	a.BaseRecipe, a.YieldUnit, a.Yield = ptr(true), "g", 100
	a.Ingredients = []recipefile.Line{{Ingredient: "flour", Quantity: 10, Unit: "g", Recipe: &recipefile.LineRecipe{Name: "Roux"}}}
	f := fileOf(a)
	f.Ingredients = []recipefile.Ingredient{{Name: "flour", BaseUnit: "g"}}
	idx := 0
	d := recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{"$.recipes[0].ingredients[0]": {Action: recipefile.BaseFile, RecipeIndex: &idx}}}
	if p := plan(t, f, recipefile.Existing{}, d); !hasProblemCode(p, recipefile.ProblemBaseRecipeCycle) {
		t.Fatalf("problems = %+v", p.Problems)
	}
}

// ---- skipped Recipes, order, commit ---------------------------------------------------------------------------

func TestASkippedRecipeAsksNothing(t *testing.T) {
	ex := existingBase()
	ex.Recipes = append(ex.Recipes, recipefile.RecipeRef{ID: 60, Name: "Lasagne"})
	d := recipefile.Decisions{Recipes: []recipefile.RecipeDecision{{Index: 0, Action: recipefile.ActionSkip}}}
	p := plan(t, lasagneWith(bechamelLine()), ex, d)
	if len(p.BaseRecipeLines) != 0 {
		t.Fatalf("rows = %+v", p.BaseRecipeLines)
	}
}

func TestRowsComeInDocumentOrder(t *testing.T) {
	l := miniRecipe("Lasagne")
	l.Ingredients = []recipefile.Line{
		{Ingredient: "roux", Quantity: 1, Unit: "g"},
		{Ingredient: "rice", Quantity: 1, Unit: "g"},
		{Ingredient: "béchamel", Quantity: 1, Unit: "ml"},
	}
	f := fileOf(l)
	f.Ingredients = []recipefile.Ingredient{{Name: "roux", BaseUnit: "g"}, {Name: "rice", BaseUnit: "g"}, {Name: "béchamel", BaseUnit: "ml"}}
	ex := existingBase()
	ex.Recipes = append(ex.Recipes, recipefile.RecipeRef{ID: 41, Name: "Roux"})
	ex.BaseRecipes = append(ex.BaseRecipes, recipefile.BaseRecipeRef{RecipeID: 41, IngredientID: 9})
	ex.Ingredients = append(ex.Ingredients, ing(9, "Roux", "g"))
	p := plan(t, f, ex, recipefile.Decisions{})
	var got []string
	for _, r := range p.BaseRecipeLines {
		got = append(got, r.Path)
	}
	if strings.Join(got, " ") != "$.recipes[0].ingredients[0] $.recipes[0].ingredients[2]" {
		t.Fatalf("paths = %v", got)
	}
}

func TestBuildCommitRefusesAPlanWithAnOpenTile(t *testing.T) {
	line := recipefile.Line{Ingredient: "pasta frolla", Quantity: 300, Unit: "g", Recipe: &recipefile.LineRecipe{Name: "pasta frolla"}}
	_, err := recipefile.BuildCommit(lasagneWith(line), recipefile.Existing{}, recipefile.Decisions{}, noImages)
	var nr *recipefile.NotReadyError
	if !errors.As(err, &nr) {
		t.Fatalf("err = %v, want *NotReadyError", err)
	}
	if len(nr.Plan.BaseRecipeLines) != 1 {
		t.Errorf("the error carries the plan with its tile: %+v", nr.Plan.BaseRecipeLines)
	}
}

func TestBuildCommitCarriesTheAnsweredTiles(t *testing.T) {
	line := recipefile.Line{Ingredient: "pasta frolla", Quantity: 300, Unit: "g", Recipe: &recipefile.LineRecipe{Name: "pasta frolla"}}
	d := recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{lineB: {Action: recipefile.BaseKeep}}}
	c, err := recipefile.BuildCommit(lasagneWith(line), recipefile.Existing{}, d, noImages)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.BaseRecipeLines) != 1 || c.BaseRecipeLines[0].RecipeIndex != 0 || c.BaseRecipeLines[0].Line != 1 || c.BaseRecipeLines[0].Decision.Action != recipefile.BaseKeep {
		t.Fatalf("commit tiles = %+v", c.BaseRecipeLines)
	}
}

func TestCommitOfBaseRecipesWaitsForBRB(t *testing.T) {
	t.Skip("BR-C commit half: creating Base recipes and their Ingredients before the Recipes that call for them, converting a " +
		"plannable Recipe, 'replace keeps id and Ingredient' and the cycle check at Confirm all need BR-B's store (one transaction).")
}
