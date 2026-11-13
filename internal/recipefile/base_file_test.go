package recipefile_test

import (
	"os"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// BR-C (beta.6, Base recipes): Recipe File v1 gains optional, backwards compatible fields
// (docs/dev/design/base-recipes.md §11.1, docs/spec/recipe-file.md "Base recipes").

const baseFixture = "../../docs/spec/fixtures/base-recipes.json"

func baseFile(t *testing.T) recipefile.File {
	t.Helper()
	raw, err := os.ReadFile(baseFixture)
	if err != nil {
		t.Fatal(err)
	}
	f, err := recipefile.Parse(raw)
	if err != nil {
		t.Fatalf("the Base recipes fixture must be a valid Recipe File: %v", err)
	}
	return f
}

func TestParseReadsTheBaseRecipeFields(t *testing.T) {
	f := baseFile(t)
	lasagne, bechamel := f.Recipes[0], f.Recipes[1]
	if lasagne.BaseRecipe != nil {
		t.Errorf("a Recipe that says nothing has no baseRecipe, got %v", *lasagne.BaseRecipe)
	}
	if bechamel.BaseRecipe == nil || !*bechamel.BaseRecipe || bechamel.YieldUnit != "l" || bechamel.Yield != 1 {
		t.Errorf("Béchamel = %+v", bechamel)
	}
	line := lasagne.Ingredients[1]
	if line.Recipe == nil || line.Recipe.Name != "Béchamel" || line.Recipe.Cue != "see page 42" || line.NeededAtStep == nil || *line.NeededAtStep != 1 {
		t.Errorf("reference line = %+v", line)
	}
	if got := bechamel.Ingredients[1]; got.Recipe == nil || got.Recipe.Name != "Roux" || got.Recipe.Cue != "" {
		t.Errorf("a reference needs no cue: %+v", got)
	}
}

func TestParseKeepsAcceptingEveryFileWrittenBeforeBeta6(t *testing.T) {
	f := exampleFile(t)
	for i, r := range f.Recipes {
		if r.BaseRecipe != nil || r.YieldUnit != "" {
			t.Errorf("recipe %d gained Base recipe fields", i)
		}
		for _, l := range r.Ingredients {
			if l.Recipe != nil || l.NeededAtStep != nil {
				t.Errorf("recipe %d line %q gained reference fields", i, l.Ingredient)
			}
		}
	}
}

func TestParseAcceptsNullForEveryNewOptionalField(t *testing.T) {
	raw := mutate(t, func(root map[string]any) {
		r := recipeAt(root, 0)
		r["baseRecipe"] = nil
		r["yieldUnit"] = nil
		line := r["ingredients"].([]any)[0].(map[string]any)
		line["recipe"] = nil
		line["neededAtStep"] = nil
	})
	if _, err := recipefile.Parse(raw); err != nil {
		t.Fatalf("null means none: %v", err)
	}
}

func TestParseRejectsMalformedBaseRecipeFields(t *testing.T) {
	cases := map[string]struct {
		mod  func(r map[string]any, line map[string]any)
		path string
	}{
		"baseRecipe is not a boolean":    {func(r, _ map[string]any) { r["baseRecipe"] = "yes" }, "$.recipes[0].baseRecipe"},
		"yieldUnit is not a string":      {func(r, _ map[string]any) { r["yieldUnit"] = 3 }, "$.recipes[0].yieldUnit"},
		"recipe is not an object":        {func(_, l map[string]any) { l["recipe"] = "Béchamel" }, "$.recipes[0].ingredients[0].recipe"},
		"recipe has no name":             {func(_, l map[string]any) { l["recipe"] = map[string]any{"cue": "see page 42"} }, "$.recipes[0].ingredients[0].recipe"},
		"recipe has an unknown property": {func(_, l map[string]any) { l["recipe"] = map[string]any{"name": "X", "page": 42} }, "$.recipes[0].ingredients[0].recipe"},
		"recipe name is blank":           {func(_, l map[string]any) { l["recipe"] = map[string]any{"name": "  "} }, "$.recipes[0].ingredients[0].recipe.name"},
		"neededAtStep is negative":       {func(_, l map[string]any) { l["neededAtStep"] = -1 }, "$.recipes[0].ingredients[0].neededAtStep"},
		"neededAtStep is not an integer": {func(_, l map[string]any) { l["neededAtStep"] = 1.5 }, "$.recipes[0].ingredients[0].neededAtStep"},
		"neededAtStep is text":           {func(_, l map[string]any) { l["neededAtStep"] = "3" }, "$.recipes[0].ingredients[0].neededAtStep"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			raw := mutate(t, func(root map[string]any) {
				r := recipeAt(root, 0)
				tc.mod(r, r["ingredients"].([]any)[0].(map[string]any))
			})
			_, err := recipefile.Parse(raw)
			se, ok := err.(*recipefile.SchemaError)
			if !ok {
				t.Fatalf("want a *SchemaError, got %v", err)
			}
			if !hasPath(se.Errors, tc.path, "") {
				t.Errorf("no error at %s: %+v", tc.path, se.Errors)
			}
		})
	}
}

// ---- CheckFile ------------------------------------------------------------------------------------------------

func baseRec(name string, mod func(r *recipefile.Recipe)) recipefile.Recipe {
	r := miniRecipe(name)
	r.BaseRecipe = ptr(true)
	r.YieldUnit = "l"
	r.Yield = 1
	if mod != nil {
		mod(&r)
	}
	return r
}

func TestCheckFileAcceptsTheBaseRecipesFixture(t *testing.T) {
	if errs := recipefile.CheckFile(baseFile(t)); len(errs) != 0 {
		t.Fatalf("the fixture must pass: %+v", errs)
	}
}

func TestCheckFileABaseRecipeNeedsAYieldUnit(t *testing.T) {
	errs := recipefile.CheckFile(fileOf(baseRec("Béchamel", func(r *recipefile.Recipe) { r.YieldUnit = "" })))
	if !hasPath(errs, "$.recipes[0].yieldUnit", "yield unit") {
		t.Fatalf("errors = %+v", errs)
	}
}

func TestCheckFileYieldUnitMustBeAKnownUnit(t *testing.T) {
	for _, u := range []string{"g", "kg", "ml", "l", "dl", "cl", "tsp", "tbsp", "cup", "piece", "portion"} {
		if errs := recipefile.CheckFile(fileOf(baseRec("Béchamel", func(r *recipefile.Recipe) { r.YieldUnit = u }))); len(errs) != 0 {
			t.Errorf("%q must be accepted: %+v", u, errs)
		}
	}
	errs := recipefile.CheckFile(fileOf(baseRec("Béchamel", func(r *recipefile.Recipe) { r.YieldUnit = "bunch" })))
	if !hasPath(errs, "$.recipes[0].yieldUnit", "") {
		t.Errorf("bunch is not a Yield unit: %+v", errs)
	}
}

func TestCheckFileABaseRecipeHasNoCoursesOrPlanningFields(t *testing.T) {
	cases := map[string]func(r *recipefile.Recipe){
		"courses":           func(r *recipefile.Recipe) { r.Courses = []string{"Main"} },
		"wholeMeal":         func(r *recipefile.Recipe) { r.WholeMeal = ptr(true) },
		"readyMeal":         func(r *recipefile.Recipe) { r.ReadyMeal = true },
		"cooldownDays":      func(r *recipefile.Recipe) { r.CooldownDays = ptr(7) },
		"leftoverUseByDays": func(r *recipefile.Recipe) { r.LeftoverUseByDays = ptr(0) },
		"reheatMinutes":     func(r *recipefile.Recipe) { r.ReheatMinutes = ptr(4) },
	}
	for field, mod := range cases {
		t.Run(field, func(t *testing.T) {
			errs := recipefile.CheckFile(fileOf(baseRec("Béchamel", mod)))
			if !hasPath(errs, "$.recipes[0]."+field, "base recipe") {
				t.Fatalf("want an error at .%s naming Base recipes: %+v", field, errs)
			}
		})
	}
}

func TestCheckFileABaseRecipeFalseIsAPlainRecipeAndKeepsItsCourses(t *testing.T) {
	r := miniRecipe("Lasagne")
	r.BaseRecipe = ptr(false)
	r.Courses = []string{"Main"}
	r.WholeMeal = ptr(true)
	if errs := recipefile.CheckFile(fileOf(r)); len(errs) != 0 {
		t.Fatalf("baseRecipe false means plannable: %+v", errs)
	}
}

func TestCheckFileNeededAtStepMustBeAStepOfTheRecipe(t *testing.T) {
	mk := func(n int) recipefile.File {
		r := miniRecipe("Lasagne")
		r.Ingredients[0].Recipe = &recipefile.LineRecipe{Name: "Béchamel"}
		r.Ingredients[0].NeededAtStep = ptr(n)
		r.Steps = []recipefile.Step{
			{Text: "a", Kind: "active"}, {Text: "b", Kind: "active"},
		}
		return fileOf(r)
	}
	for _, n := range []int{0, 1} {
		if errs := recipefile.CheckFile(mk(n)); len(errs) != 0 {
			t.Errorf("step %d exists: %+v", n, errs)
		}
	}
	errs := recipefile.CheckFile(mk(2))
	if !hasPath(errs, "$.recipes[0].ingredients[0].neededAtStep", "step") {
		t.Fatalf("step 2 of 2 does not exist: %+v", errs)
	}
	// A Recipe with no Steps has nothing to need the line by.
	r := miniRecipe("Lasagne")
	r.Ingredients[0].NeededAtStep = ptr(0)
	if errs := recipefile.CheckFile(fileOf(r)); !hasPath(errs, "$.recipes[0].ingredients[0].neededAtStep", "") {
		t.Errorf("no Steps: %+v", errs)
	}
}

func TestCheckFileErrorsOfBaseRecipesComeInDocumentOrder(t *testing.T) {
	a := baseRec("A", func(r *recipefile.Recipe) { r.YieldUnit = ""; r.Courses = []string{"Main"} })
	b := baseRec("B", func(r *recipefile.Recipe) { r.YieldUnit = "bunch" })
	got := paths(recipefile.CheckFile(fileOf(a, b)))
	if len(got) != 3 || !strings.HasPrefix(got[0], "$.recipes[0]") || !strings.HasPrefix(got[1], "$.recipes[0]") || got[2] != "$.recipes[1].yieldUnit" {
		t.Errorf("paths = %v", got)
	}
}
