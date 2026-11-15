package recipefile_test

import (
	"encoding/json"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// B9-28 (RX-01): BuildPlan returns, for every Recipe of the file, a Preview of what the file says about it, so Import Review can list the
// Recipes with their Yield, Ingredients and Steps before anything is saved. Filled for every Recipe (kept, conflicting, skipped), in file order.

func TestPlanPreviewOfTheExampleFollowsTheFile(t *testing.T) {
	p := plan(t, exampleFile(t), recipefile.Existing{}, recipefile.Decisions{})
	if len(p.Recipes) != 2 {
		t.Fatalf("recipes = %+v", p.Recipes)
	}
	tikka, lasagne := p.Recipes[0].Preview, p.Recipes[1].Preview

	if tikka.Yield != 4 || tikka.ReadyMeal || tikka.BaseRecipe || tikka.YieldUnit != "" {
		t.Fatalf("tikka yield facts = %+v", tikka)
	}
	if len(tikka.Courses) != 1 || tikka.Courses[0] != "Main" {
		t.Fatalf("courses = %v", tikka.Courses)
	}
	if len(tikka.Tags) != 3 || tikka.Tags[0] != "chicken" || tikka.Tags[1] != "traybake" || tikka.Tags[2] != "weeknight" {
		t.Fatalf("tags = %v", tikka.Tags)
	}
	if tikka.Description == "" {
		t.Fatalf("description missing: %+v", tikka)
	}
	if tikka.Source == nil || tikka.Source.Attribution != "Family recipe" {
		t.Fatalf("source = %+v", tikka.Source)
	}
	if len(tikka.Lines) != 8 || len(tikka.Steps) != 6 {
		t.Fatalf("%d lines and %d steps, want 8 and 6", len(tikka.Lines), len(tikka.Steps))
	}
	first := tikka.Lines[0]
	if first.Ingredient != "chicken thighs" || first.Quantity != 800 || first.Unit != "g" || first.Note != "boneless, skinless" || first.Optional || first.Recipe != "" {
		t.Fatalf("first line = %+v", first)
	}
	if tikka.Steps[0].Text == "" || tikka.Steps[0].Kind == "" {
		t.Fatalf("first step = %+v", tikka.Steps[0])
	}

	if !lasagne.ReadyMeal || lasagne.Yield != 2 || len(lasagne.Lines) != 1 || len(lasagne.Steps) != 1 {
		t.Fatalf("lasagne = %+v", lasagne)
	}
	if lasagne.Steps[0].Kind != "passive" || lasagne.Steps[0].DurationMinutes != 40 {
		t.Fatalf("lasagne step = %+v", lasagne.Steps[0])
	}
}

func TestPlanPreviewCarriesBaseRecipeFactsLinesAndStepTimes(t *testing.T) {
	yes := true
	f := recipefile.File{Format: recipefile.Format, Version: recipefile.Version, Recipes: []recipefile.Recipe{
		{
			Name: "Béchamel", Yield: 1, YieldUnit: "l", BaseRecipe: &yes,
			Ingredients: []recipefile.Line{{Ingredient: "milk", Quantity: 1000, Unit: "ml"}},
			Steps:       []recipefile.Step{{Text: "Heat the milk.", Kind: "active", DurationMinutes: f64(25)}},
		},
		{
			Name: "Lasagne", Yield: 4, Image: "https://example.test/lasagne.jpg",
			Ingredients: []recipefile.Line{
				{Ingredient: "pasta sheets", Quantity: 250, Unit: "g"},
				{Ingredient: "basil", Quantity: 5, Unit: "g", Optional: true, Note: "to finish"},
				{Ingredient: "béchamel", Quantity: 500, Unit: "ml", Recipe: &recipefile.LineRecipe{Name: "Béchamel"}},
			},
			Steps: []recipefile.Step{
				{Text: "Rest the dough.", Kind: "advance", DurationMinutes: f64(30), LeadTimeMinutes: f64(240)},
				{Text: "Assemble.", Kind: "active"},
			},
		},
	}}
	p := plan(t, f, recipefile.Existing{}, recipefile.Decisions{})
	base, las := p.Recipes[0].Preview, p.Recipes[1].Preview

	if !base.BaseRecipe || base.Yield != 1 || base.YieldUnit != "l" || base.ReadyMeal || base.HasImage {
		t.Fatalf("base = %+v", base)
	}
	if !las.HasImage || las.BaseRecipe {
		t.Fatalf("lasagne = %+v", las)
	}
	if len(las.Lines) != 3 {
		t.Fatalf("lines = %+v", las.Lines)
	}
	if !las.Lines[1].Optional || las.Lines[1].Note != "to finish" {
		t.Fatalf("optional line = %+v", las.Lines[1])
	}
	if las.Lines[2].Recipe != "Béchamel" {
		t.Fatalf("a line that calls for a Base recipe names it: %+v", las.Lines[2])
	}
	if las.Steps[0].Kind != "advance" || las.Steps[0].DurationMinutes != 30 || las.Steps[0].LeadTimeMinutes != 240 {
		t.Fatalf("advance step = %+v", las.Steps[0])
	}
	if las.Steps[1].DurationMinutes != 0 || las.Steps[1].LeadTimeMinutes != 0 {
		t.Fatalf("a step without times reads 0: %+v", las.Steps[1])
	}
}

func TestPlanPreviewIsFilledForAConflictAndForASkippedRecipeToo(t *testing.T) {
	ex := recipefile.Existing{Recipes: []recipefile.RecipeRef{{ID: 9, Name: "Lasagne (ready meal)", ReadyMeal: true}}}
	asked := plan(t, exampleFile(t), ex, recipefile.Decisions{})
	if asked.Recipes[1].Status != recipefile.RecipeConflict || asked.Recipes[1].Resolved {
		t.Fatalf("recipes = %+v", asked.Recipes)
	}
	if asked.Recipes[1].Preview.Yield != 2 || len(asked.Recipes[1].Preview.Steps) != 1 {
		t.Fatalf("an unanswered conflict still previews the file's Recipe: %+v", asked.Recipes[1].Preview)
	}
	skipped := plan(t, exampleFile(t), ex, recipefile.Decisions{Recipes: []recipefile.RecipeDecision{{Index: 1, Action: recipefile.ActionSkip}}})
	if skipped.Recipes[1].Preview.Yield != 2 || len(skipped.Recipes[1].Preview.Lines) != 1 {
		t.Fatalf("a skipped Recipe is still previewed (the row says Skipped): %+v", skipped.Recipes[1].Preview)
	}
	if skipped.Recipes[0].Preview.Yield != 4 {
		t.Fatalf("the Preview belongs to the Recipe of its index: %+v", skipped.Recipes[0].Preview)
	}
}

func TestPlanPreviewListsAreNeverNullInJSON(t *testing.T) {
	f := recipefile.File{Format: recipefile.Format, Version: recipefile.Version, Recipes: []recipefile.Recipe{
		{Name: "Plain water", Yield: 1, Ingredients: []recipefile.Line{{Ingredient: "water", Quantity: 1, Unit: "ml"}}},
	}}
	raw, err := json.Marshal(plan(t, f, recipefile.Existing{}, recipefile.Decisions{}))
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Recipes []struct {
			Preview map[string]json.RawMessage `json:"preview"`
		} `json:"recipes"`
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Recipes) != 1 || got.Recipes[0].Preview == nil {
		t.Fatalf("no preview in %s", raw)
	}
	pv := got.Recipes[0].Preview
	for _, key := range []string{"yield", "readyMeal", "baseRecipe", "courses", "tags", "lines", "steps", "hasImage"} {
		if _, ok := pv[key]; !ok {
			t.Fatalf("preview has no %q: %s", key, raw)
		}
	}
	for _, key := range []string{"courses", "tags", "steps"} {
		if string(pv[key]) != "[]" {
			t.Fatalf("%s = %s, want []", key, pv[key])
		}
	}
	if string(pv["lines"]) == "null" || string(pv["yield"]) != "1" {
		t.Fatalf("preview = %s", raw)
	}
}

func f64(v float64) *float64 { return &v }
