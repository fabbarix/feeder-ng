package recipefile_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// BR-C: exporting a Recipe adds every Base recipe it calls for, transitively
// (docs/dev/design/base-recipes.md §11.1). The store (BR-B) will build ExportInput; here it is built by hand.
//
// Ids: Lasagne 10 (plannable), Béchamel 11 (Base recipe of Ingredient 21), Roux 12 (Base recipe of Ingredient 22),
// Pesto 13 (a plannable Recipe nobody calls for).

func baseExportInput() recipefile.ExportInput {
	shelf := 4
	return recipefile.ExportInput{
		Now: now,
		Ingredients: map[int64]ingredient.Ingredient{
			1:  {ID: 1, Name: "lasagne sheets", Base: "g"},
			2:  {ID: 2, Name: "milk", Base: "ml"},
			3:  {ID: 3, Name: "butter", Base: "g"},
			4:  {ID: 4, Name: "flour", Base: "g"},
			21: {ID: 21, Name: "Béchamel", Base: "ml", ShelfLifeDays: &shelf, Conversions: []units.Conversion{{Unit: "batch", ToBase: 1000}, {Unit: "cup", ToBase: 240}}},
			22: {ID: 22, Name: "Roux", Base: "g", Conversions: []units.Conversion{{Unit: "batch", ToBase: 160}}},
			23: {ID: 23, Name: "basil", Base: "g"},
		},
		Recipes: []recipe.Recipe{
			{ID: 10, Input: recipe.Input{Name: "Lasagne", Yield: 4,
				Lines: []recipe.Line{
					{IngredientID: 1, Quantity: 250, Unit: "g"},
					{IngredientID: 21, Quantity: 500, Unit: "ml"},
				},
				Steps: []recipe.Step{{Text: "Cook", Kind: schedule.Active}, {Text: "Layer", Kind: schedule.Active, After: []int{0}}, {Text: "Bake", Kind: schedule.Passive, DurationMinutes: 30, After: []int{1}}},
			}},
		},
		BaseRecipes: []recipefile.ExportBaseRecipe{
			{OwnIngredientID: 21, YieldUnit: "l", Recipe: recipe.Recipe{ID: 11, Input: recipe.Input{Name: "Béchamel", Yield: 1,
				Lines: []recipe.Line{
					{IngredientID: 2, Quantity: 1000, Unit: "ml"},
					{IngredientID: 22, Quantity: 160, Unit: "g"},
				},
				Steps: []recipe.Step{{Text: "Warm", Kind: schedule.Active}, {Text: "Whisk", Kind: schedule.Passive, DurationMinutes: 10, After: []int{0}}},
			}}},
			{OwnIngredientID: 22, YieldUnit: "g", Recipe: recipe.Recipe{ID: 12, Input: recipe.Input{Name: "Roux", Yield: 160,
				Lines: []recipe.Line{{IngredientID: 3, Quantity: 80, Unit: "g"}, {IngredientID: 4, Quantity: 80, Unit: "g"}},
			}}},
		},
		NeededAtStep: map[recipefile.LineRef]int{{RecipeID: 10, Line: 1}: 1, {RecipeID: 11, Line: 1}: 1},
		Image:        func(string) (string, error) { return "", nil },
	}
}

func recipeNamed(t *testing.T, f recipefile.File, name string) (int, recipefile.Recipe) {
	t.Helper()
	for i, r := range f.Recipes {
		if r.Name == name {
			return i, r
		}
	}
	t.Fatalf("no recipe %q in the file: %v", name, recipeNames(f))
	return 0, recipefile.Recipe{}
}

func recipeNames(f recipefile.File) []string {
	var out []string
	for _, r := range f.Recipes {
		out = append(out, r.Name)
	}
	return out
}

func TestExportAddsTheBaseRecipesARecipeCallsForTransitively(t *testing.T) {
	f, warns := recipefile.Build(baseExportInput())
	if len(warns) != 0 {
		t.Fatalf("warnings: %+v", warns)
	}
	if got := strings.Join(recipeNames(f), ","); got != "Lasagne,Béchamel,Roux" {
		t.Fatalf("recipes = %s, want the requested Recipe first, then Béchamel, then Roux (discovery order)", got)
	}
}

func TestExportWritesBaseRecipesWithTheirYieldAndNothingElseForPlannableOnes(t *testing.T) {
	f, _ := recipefile.Build(baseExportInput())
	_, lasagne := recipeNamed(t, f, "Lasagne")
	if lasagne.BaseRecipe != nil || lasagne.YieldUnit != "" {
		t.Errorf("a plannable Recipe writes no baseRecipe or yieldUnit: %+v", lasagne)
	}
	_, bechamel := recipeNamed(t, f, "Béchamel")
	if bechamel.BaseRecipe == nil || !*bechamel.BaseRecipe || bechamel.YieldUnit != "l" || bechamel.Yield != 1 {
		t.Errorf("Béchamel = %+v", bechamel)
	}
	_, roux := recipeNamed(t, f, "Roux")
	if roux.BaseRecipe == nil || !*roux.BaseRecipe || roux.YieldUnit != "g" || roux.Yield != 160 {
		t.Errorf("Roux = %+v", roux)
	}
	if len(bechamel.Courses) != 0 || bechamel.WholeMeal != nil {
		t.Errorf("a Base recipe writes no Courses or Whole meal: %+v", bechamel)
	}
}

func TestExportWritesEachBaseRecipeLineWithRecipeAndNeededAtStep(t *testing.T) {
	f, _ := recipefile.Build(baseExportInput())
	_, lasagne := recipeNamed(t, f, "Lasagne")
	l := lasagne.Ingredients[1]
	if l.Ingredient != "Béchamel" || l.Quantity != 500 || l.Unit != "ml" {
		t.Errorf("the line stays a valid plain line: %+v", l)
	}
	if l.Recipe == nil || l.Recipe.Name != "Béchamel" || l.Recipe.Cue != "" {
		t.Errorf("recipe = %+v, want {name: Béchamel} with no cue", l.Recipe)
	}
	if l.NeededAtStep == nil || *l.NeededAtStep != 1 {
		t.Errorf("neededAtStep = %v, want 1", l.NeededAtStep)
	}
	if p := lasagne.Ingredients[0]; p.Recipe != nil || p.NeededAtStep != nil {
		t.Errorf("a plain line gains nothing: %+v", p)
	}
	_, bechamel := recipeNamed(t, f, "Béchamel")
	if r := bechamel.Ingredients[1]; r.Recipe == nil || r.Recipe.Name != "Roux" || r.NeededAtStep == nil || *r.NeededAtStep != 1 {
		t.Errorf("nested line = %+v", r)
	}
}

func TestExportDefinesTheBaseRecipeIngredientsWithoutTheBatchConversion(t *testing.T) {
	f, _ := recipefile.Build(baseExportInput())
	var bechamel, roux *recipefile.Ingredient
	for i := range f.Ingredients {
		switch strings.ToLower(f.Ingredients[i].Name) {
		case "béchamel":
			bechamel = &f.Ingredients[i]
		case "roux":
			roux = &f.Ingredients[i]
		case "basil":
			t.Error("basil is used by no exported Recipe")
		}
	}
	if bechamel == nil || roux == nil {
		t.Fatalf("both Base recipe Ingredients need a definition: %+v", f.Ingredients)
	}
	if bechamel.BaseUnit != "ml" || bechamel.ShelfLifeDays == nil || *bechamel.ShelfLifeDays != 4 {
		t.Errorf("béchamel = %+v", bechamel)
	}
	if len(bechamel.Conversions) != 1 || bechamel.Conversions[0].Unit != "cup" {
		t.Errorf("the batch conversion belongs to the Yield, not to the file: %+v", bechamel.Conversions)
	}
	if len(roux.Conversions) != 0 {
		t.Errorf("roux conversions = %+v", roux.Conversions)
	}
}

func TestExportAddsABaseRecipeOnceHoweverManyRecipesCallForIt(t *testing.T) {
	in := baseExportInput()
	in.Recipes = append(in.Recipes, recipe.Recipe{ID: 14, Input: recipe.Input{Name: "Moussaka", Yield: 4,
		Lines: []recipe.Line{{IngredientID: 21, Quantity: 300, Unit: "ml"}}}})
	f, _ := recipefile.Build(in)
	n := 0
	for _, r := range f.Recipes {
		if r.Name == "Béchamel" {
			n++
		}
	}
	if n != 1 || len(f.Recipes) != 4 {
		t.Fatalf("recipes = %v", recipeNames(f))
	}
}

func TestExportOfABaseRecipeItselfWritesItAsOneAndAddsWhatItCallsFor(t *testing.T) {
	in := baseExportInput()
	in.Recipes = []recipe.Recipe{in.BaseRecipes[0].Recipe} // the User exports Béchamel
	f, _ := recipefile.Build(in)
	if got := strings.Join(recipeNames(f), ","); got != "Béchamel,Roux" {
		t.Fatalf("recipes = %s", got)
	}
	if r := f.Recipes[0]; r.BaseRecipe == nil || !*r.BaseRecipe || r.YieldUnit != "l" {
		t.Errorf("Béchamel = %+v", r)
	}
}

func TestExportAddsNoBaseRecipeNobodyCallsFor(t *testing.T) {
	in := baseExportInput()
	in.Recipes[0].Lines = in.Recipes[0].Lines[:1] // Lasagne without the béchamel line
	f, _ := recipefile.Build(in)
	if got := strings.Join(recipeNames(f), ","); got != "Lasagne" {
		t.Fatalf("recipes = %s", got)
	}
}

func TestExportOfAFileWithoutBaseRecipesIsUnchanged(t *testing.T) {
	f, _ := recipefile.Build(exportFixture())
	raw, err := recipefile.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{`"baseRecipe"`, `"yieldUnit"`, `"neededAtStep"`, `"recipe":`} {
		if strings.Contains(string(raw), key) {
			t.Errorf("a file without Base recipes must not contain %s", key)
		}
	}
}

func TestAnExportedFileParsesChecksAndImportsWithEveryTilePreselected(t *testing.T) {
	f, _ := recipefile.Build(baseExportInput())
	raw, err := recipefile.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := recipefile.Parse(raw)
	if err != nil {
		t.Fatalf("an export must satisfy its own schema: %v", err)
	}
	if errs := recipefile.CheckFile(parsed); len(errs) != 0 {
		t.Fatalf("an export must pass CheckFile: %+v", errs)
	}
	p := plan(t, parsed, recipefile.Existing{}, recipefile.Decisions{})
	if len(p.BaseRecipeLines) != 2 {
		t.Fatalf("tiles = %+v, want one for Béchamel in Lasagne and one for Roux in Béchamel", p.BaseRecipeLines)
	}
	for _, row := range p.BaseRecipeLines {
		if !row.Resolved || row.Effective == nil || row.Effective.Action != recipefile.BaseFile || row.Effective.RecipeIndex == nil {
			t.Errorf("row %s must be preselected on the Recipe of the same file: %+v", row.Path, row)
		}
	}
	if !p.Ready {
		t.Errorf("a round trip is ready without a single answer: %+v", p)
	}
}

func TestExportThenParseKeepsTheFixtureShape(t *testing.T) {
	// The hand-written fixture and a real export describe the same three Recipes.
	exported, _ := recipefile.Build(baseExportInput())
	fixture := baseFile(t)
	if strings.Join(recipeNames(exported), ",") != strings.Join(recipeNames(fixture), ",") {
		t.Errorf("export %v, fixture %v", recipeNames(exported), recipeNames(fixture))
	}
}

// ---- round 2: a plain Ingredient beside a Base recipe's own Ingredient of the same name -----------------------

func sameNameExportInput() recipefile.ExportInput {
	in := baseExportInput()
	// Moussaka (14) uses a plain "béchamel" Ingredient (30), kept apart from the Base recipe Béchamel's own (21).
	in.Ingredients[30] = ingredient.Ingredient{ID: 30, Name: "béchamel", Base: "ml"}
	in.Recipes = append(in.Recipes, recipe.Recipe{ID: 14, Input: recipe.Input{Name: "Moussaka", Yield: 4,
		Lines: []recipe.Line{{IngredientID: 30, Quantity: 300, Unit: "ml"}}}})
	return in
}

func TestExportNeverWritesTwoIngredientDefinitionsWithTheSameName(t *testing.T) {
	f, _ := recipefile.Build(sameNameExportInput())
	seen := map[string]int{}
	for _, d := range f.Ingredients {
		seen[units.NormalizeName(d.Name)]++
	}
	for name, n := range seen {
		if n > 1 {
			t.Errorf("%d definitions named %q", n, name)
		}
	}
}

func TestAnExportWithASameNameIngredientParsesAndImportsWithoutProblems(t *testing.T) {
	f, _ := recipefile.Build(sameNameExportInput())
	raw, err := recipefile.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := recipefile.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if errs := recipefile.CheckFile(parsed); len(errs) != 0 {
		t.Fatalf("CheckFile: %+v", errs)
	}
	p := plan(t, parsed, recipefile.Existing{}, recipefile.Decisions{})
	if len(p.Problems) != 0 {
		t.Fatalf("problems = %+v", p.Problems)
	}
	n := 0
	for _, m := range p.Ingredients {
		if m.Key == "béchamel" || m.Key == "bechamel" {
			n++
		}
	}
	if n != 1 {
		t.Errorf("one Ingredient row for béchamel, got %d", n)
	}
}
