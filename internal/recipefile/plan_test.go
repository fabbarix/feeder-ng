package recipefile_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/units"
)

var noImages = recipefile.ImageSet{}

func plan(t *testing.T, f recipefile.File, ex recipefile.Existing, d recipefile.Decisions) recipefile.Plan {
	t.Helper()
	return recipefile.BuildPlan(f, ex, d, noImages)
}

func matchOf(t *testing.T, p recipefile.Plan, key string) recipefile.IngredientMatch {
	t.Helper()
	for _, m := range p.Ingredients {
		if m.Key == key {
			return m
		}
	}
	t.Fatalf("no ingredient row %q in %+v", key, p.Ingredients)
	return recipefile.IngredientMatch{}
}

func promptOf(p recipefile.Plan, key, unit string) *recipefile.UnitPrompt {
	for i := range p.UnitPrompts {
		if p.UnitPrompts[i].Key == key && p.UnitPrompts[i].Unit == unit {
			return &p.UnitPrompts[i]
		}
	}
	return nil
}

func TestPlanOfTheExampleIntoAnEmptyHouseholdIsReady(t *testing.T) {
	p := plan(t, exampleFile(t), recipefile.Existing{}, recipefile.Decisions{})
	if !p.Ready || len(p.Problems) != 0 || len(p.UnitPrompts) != 0 {
		t.Fatalf("plan = %+v", p)
	}
	if len(p.Ingredients) != 9 {
		t.Fatalf("%d ingredient rows, want 9", len(p.Ingredients))
	}
	for _, m := range p.Ingredients {
		if m.Status != recipefile.StatusNew || !m.Resolved || m.Definition == nil || m.Effective == nil || m.Effective.Action != recipefile.ActionCreate {
			t.Fatalf("%s should be a new, resolved Ingredient created from its definition: %+v", m.Key, m)
		}
	}
	if len(p.Recipes) != 2 || p.Recipes[0].Status != recipefile.RecipeNew || !p.Recipes[0].Resolved {
		t.Fatalf("recipes = %+v", p.Recipes)
	}
	spinach := matchOf(t, p, "spinach")
	if len(spinach.UsedBy) != 2 || spinach.UsedBy[0] != "$.recipes[0].ingredients[6]" || spinach.UsedBy[1] != "$.recipes[0].steps[5].uses[0]" {
		t.Fatalf("spinach used by %v", spinach.UsedBy)
	}
}

func TestExactMatchIgnoresCaseAndWhitespaceAndUsesTheExistingIngredient(t *testing.T) {
	ex := recipefile.Existing{Ingredients: []ingredientT{ing(7, "  Red   Pepper ", "piece")}}
	p := plan(t, exampleFile(t), ex, recipefile.Decisions{})
	m := matchOf(t, p, "red pepper")
	if m.Status != recipefile.StatusExact || m.Match == nil || m.Match.ID != 7 || !m.Resolved || m.Effective.Action != recipefile.ActionUse || m.Effective.IngredientID != 7 {
		t.Fatalf("row = %+v", m)
	}
	c, err := recipefile.BuildCommit(exampleFile(t), ex, recipefile.Decisions{}, noImages)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.NewIngredients) != 8 {
		t.Fatalf("%d new Ingredients, want 8 (red pepper exists)", len(c.NewIngredients))
	}
	if c.Resolved["red pepper"].ID != 7 {
		t.Fatalf("resolved = %+v", c.Resolved["red pepper"])
	}
}

func TestFuzzyMatchOffersSuggestionsAndDefaultsToCreating(t *testing.T) {
	ex := recipefile.Existing{Ingredients: []ingredientT{ing(3, "chicken thigh", "g"), ing(4, "passata", "ml")}}
	p := plan(t, exampleFile(t), ex, recipefile.Decisions{})
	m := matchOf(t, p, "chicken thighs")
	if m.Status != recipefile.StatusSuggested || len(m.Suggestions) == 0 || m.Suggestions[0].ID != 3 || m.Suggestions[0].Score < 0.6 {
		t.Fatalf("row = %+v", m)
	}
	if m.Effective.Action != recipefile.ActionCreate || !m.Resolved {
		t.Fatalf("default for a suggestion must be create: %+v", m.Effective)
	}
	if got := matchOf(t, p, "lemon"); got.Status != recipefile.StatusNew || len(got.Suggestions) != 0 {
		t.Fatalf("lemon = %+v", got)
	}
	// Choosing the suggestion uses the existing Ingredient and creates nothing for it.
	d := recipefile.Decisions{Ingredients: []recipefile.IngredientDecision{{Key: "chicken thighs", Action: recipefile.ActionUse, IngredientID: 3}}}
	c, err := recipefile.BuildCommit(exampleFile(t), ex, d, noImages)
	if err != nil {
		t.Fatal(err)
	}
	if c.Resolved["chicken thighs"].ID != 3 {
		t.Fatalf("resolved = %+v", c.Resolved["chicken thighs"])
	}
	for _, n := range c.NewIngredients {
		if n.Key == "chicken thighs" {
			t.Fatal("must not create an Ingredient the user matched to an existing one")
		}
	}
}

func TestBaseUnitConflictMustBeResolvedByHand(t *testing.T) {
	ex := recipefile.Existing{Ingredients: []ingredientT{ing(5, "onion", "g")}} // the file says piece
	p := plan(t, exampleFile(t), ex, recipefile.Decisions{})
	m := matchOf(t, p, "onion")
	if m.Status != recipefile.StatusConflict || m.Resolved || m.Conflict == nil || m.Conflict.File != "piece" || m.Conflict.Existing != "g" {
		t.Fatalf("row = %+v", m)
	}
	if p.Ready {
		t.Fatal("a conflict blocks Confirm")
	}
	if _, err := recipefile.BuildCommit(exampleFile(t), ex, recipefile.Decisions{}, noImages); !errors.Is(err, recipefile.ErrNotReady) {
		t.Fatalf("got %v, want ErrNotReady", err)
	}

	t.Run("creating under another name resolves it", func(t *testing.T) {
		d := recipefile.Decisions{Ingredients: []recipefile.IngredientDecision{{Key: "onion", Action: recipefile.ActionCreate, Name: "onion (whole)"}}}
		p := plan(t, exampleFile(t), ex, d)
		if !p.Ready || !matchOf(t, p, "onion").Resolved {
			t.Fatalf("plan = %+v", p)
		}
		c, err := recipefile.BuildCommit(exampleFile(t), ex, d, noImages)
		if err != nil {
			t.Fatal(err)
		}
		var created bool
		for _, n := range c.NewIngredients {
			if n.Key == "onion" && n.Input.Name == "onion (whole)" && n.Input.Base == units.Piece {
				created = true
			}
		}
		if !created {
			t.Fatalf("new = %+v", c.NewIngredients)
		}
	})
	t.Run("creating under the same name is refused", func(t *testing.T) {
		d := recipefile.Decisions{Ingredients: []recipefile.IngredientDecision{{Key: "onion", Action: recipefile.ActionCreate}}}
		if p := plan(t, exampleFile(t), ex, d); p.Ready || matchOf(t, p, "onion").Resolved {
			t.Fatal("the name is taken, so create without a new name does not resolve the conflict")
		}
	})
	t.Run("using the existing one asks for the unconvertible unit", func(t *testing.T) {
		d := recipefile.Decisions{Ingredients: []recipefile.IngredientDecision{{Key: "onion", Action: recipefile.ActionUse, IngredientID: 5}}}
		p := plan(t, exampleFile(t), ex, d)
		pr := promptOf(p, "onion", "piece")
		if pr == nil || pr.Base != "g" || pr.Answered || p.Ready {
			t.Fatalf("prompt = %+v ready=%v", pr, p.Ready)
		}
		if len(pr.UsedBy) != 2 {
			t.Fatalf("one prompt for both uses, got usedBy %v", pr.UsedBy)
		}
		d.Conversions = []recipefile.ConversionAnswer{{Key: "onion", Unit: "piece", ToBase: 150}}
		p = plan(t, exampleFile(t), ex, d)
		if pr := promptOf(p, "onion", "piece"); pr == nil || !pr.Answered || pr.ToBase == nil || *pr.ToBase != 150 || !p.Ready {
			t.Fatalf("plan after answer = %+v", p)
		}
		c, err := recipefile.BuildCommit(exampleFile(t), ex, d, noImages)
		if err != nil {
			t.Fatal(err)
		}
		if len(c.AddedConversions) != 1 || c.AddedConversions[0].IngredientID != 5 || c.AddedConversions[0].Conversion.Unit != "piece" || c.AddedConversions[0].Conversion.ToBase != 150 {
			t.Fatalf("added = %+v", c.AddedConversions)
		}
	})
}

func TestIngredientWithoutDefinitionNeedsADecision(t *testing.T) {
	data := mutate(t, func(r map[string]any) {
		var kept []any
		for _, i := range r["ingredients"].([]any) {
			if i.(map[string]any)["name"] != "lemon" {
				kept = append(kept, i)
			}
		}
		r["ingredients"] = kept
	})
	f := mustParse(t, data)
	p := plan(t, f, recipefile.Existing{}, recipefile.Decisions{})
	m := matchOf(t, p, "lemon")
	if m.Status != recipefile.StatusUndefined || m.Resolved || m.Definition != nil || p.Ready {
		t.Fatalf("row = %+v ready=%v", m, p.Ready)
	}
	d := recipefile.Decisions{Ingredients: []recipefile.IngredientDecision{{Key: "lemon", Action: recipefile.ActionCreate, BaseUnit: "piece"}}}
	if p := plan(t, f, recipefile.Existing{}, d); !p.Ready {
		t.Fatalf("plan = %+v", p)
	}
	d.Ingredients[0].BaseUnit = "bushel"
	if p := plan(t, f, recipefile.Existing{}, d); p.Ready {
		t.Fatal("an invalid Base Unit does not resolve")
	}
}

func TestUnconvertibleUnitIsPromptedOncePerIngredientAndUnit(t *testing.T) {
	// 'handful' is not defined for spinach any more, and used on a line and in a Step.
	data := mutate(t, func(r map[string]any) {
		for _, i := range r["ingredients"].([]any) {
			if m := i.(map[string]any); m["name"] == "spinach" {
				delete(m, "conversions")
			}
		}
		rc := recipeAt(r, 0)
		for _, l := range rc["ingredients"].([]any) {
			if m := l.(map[string]any); m["ingredient"] == "spinach" {
				m["quantity"], m["unit"] = 2, "handful"
			}
		}
		for _, s := range rc["steps"].([]any) {
			for _, u := range s.(map[string]any)["uses"].([]any) {
				if m := u.(map[string]any); m["ingredient"] == "spinach" {
					m["quantity"], m["unit"] = 2, " Handful "
				}
			}
		}
	})
	f := mustParse(t, data)
	p := plan(t, f, recipefile.Existing{}, recipefile.Decisions{})
	if len(p.UnitPrompts) != 1 {
		t.Fatalf("prompts = %+v", p.UnitPrompts)
	}
	pr := promptOf(p, "spinach", "handful")
	if pr == nil || pr.Ingredient != "spinach" || pr.Base != "g" || len(pr.UsedBy) != 2 || p.Ready {
		t.Fatalf("prompt = %+v", pr)
	}
	for _, bad := range []float64{0, -5} {
		d := recipefile.Decisions{Conversions: []recipefile.ConversionAnswer{{Key: "spinach", Unit: "handful", ToBase: bad}}}
		if p := plan(t, f, recipefile.Existing{}, d); p.Ready || promptOf(p, "spinach", "handful").Answered || len(p.Problems) == 0 {
			t.Fatalf("toBase %v must be refused: %+v", bad, p)
		}
	}
	d := recipefile.Decisions{Conversions: []recipefile.ConversionAnswer{{Key: "spinach", Unit: "handful", ToBase: 30}}}
	if p := plan(t, f, recipefile.Existing{}, d); !p.Ready {
		t.Fatalf("plan = %+v", p)
	}
	c, err := recipefile.BuildCommit(f, recipefile.Existing{}, d, noImages)
	if err != nil {
		t.Fatal(err)
	}
	for _, n := range c.NewIngredients {
		if n.Key == "spinach" {
			if len(n.Input.Conversions) != 1 || n.Input.Conversions[0] != (units.Conversion{Unit: "handful", ToBase: 30}) {
				t.Fatalf("spinach conversions = %+v", n.Input.Conversions)
			}
			return
		}
	}
	t.Fatal("spinach is not created")
}

func TestVolumeUnitOnAWeighedIngredientIsPrompted(t *testing.T) {
	// recipe-file.md: spoon and cup measures are volume, so a g-based Ingredient needs a conversion.
	data := mutate(t, func(r map[string]any) {
		for _, l := range recipeAt(r, 0)["ingredients"].([]any) {
			if m := l.(map[string]any); m["ingredient"] == "chicken thighs" {
				m["unit"] = "cup"
			}
		}
		recipeAt(r, 0)["steps"].([]any)[0].(map[string]any)["uses"].([]any)[0].(map[string]any)["unit"] = "g"
	})
	p := plan(t, mustParse(t, data), recipefile.Existing{}, recipefile.Decisions{})
	if promptOf(p, "chicken thighs", "cup") == nil {
		t.Fatalf("prompts = %+v", p.UnitPrompts)
	}
}

func TestExistingConversionsWinAndMissingFileConversionsAreAdded(t *testing.T) {
	ex := recipefile.Existing{Ingredients: []ingredientT{ing(9, "garam masala", "g", units.Conversion{Unit: "tbsp", ToBase: 5})}}
	p := plan(t, exampleFile(t), ex, recipefile.Decisions{})
	var warned bool
	for _, w := range p.Warnings {
		if w.Code == recipefile.WarnConversionDiffers && strings.Contains(w.Message, "tbsp") {
			warned = true
		}
	}
	if !warned || !p.Ready {
		t.Fatalf("plan = %+v", p)
	}
	c, err := recipefile.BuildCommit(exampleFile(t), ex, recipefile.Decisions{}, noImages)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.AddedConversions) != 1 || c.AddedConversions[0].IngredientID != 9 || c.AddedConversions[0].Conversion != (units.Conversion{Unit: "tsp", ToBase: 2}) {
		t.Fatalf("added = %+v (only the missing 'tsp' = 2)", c.AddedConversions)
	}
}

func TestRecipeConflictsNeedAnExplicitDecision(t *testing.T) {
	ex := recipefile.Existing{Recipes: []recipefile.RecipeRef{{ID: 40, Name: "chicken  TIKKA traybake"}, {ID: 41, Name: "Chicken tikka traybake (2)"}}}
	f := exampleFile(t)
	p := plan(t, f, ex, recipefile.Decisions{})
	r := p.Recipes[0]
	if r.Status != recipefile.RecipeConflict || r.ExistingID != 40 || r.Resolved || p.Ready {
		t.Fatalf("recipe row = %+v ready=%v", r, p.Ready)
	}
	if p.Recipes[1].Status != recipefile.RecipeNew {
		t.Fatal("the other Recipe is new")
	}
	decide := func(a string) recipefile.Decisions {
		return recipefile.Decisions{Recipes: []recipefile.RecipeDecision{{Index: 0, Action: a}}}
	}

	c, err := recipefile.BuildCommit(f, ex, decide(recipefile.ActionReplace), noImages)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Recipes) != 2 || c.Recipes[0].Action != recipefile.ActionReplace || c.Recipes[0].ReplaceID != 40 || c.Recipes[0].Input.Name != "Chicken tikka traybake" {
		t.Fatalf("replace: %+v", c.Recipes)
	}

	c, err = recipefile.BuildCommit(f, ex, decide(recipefile.ActionKeepBoth), noImages)
	if err != nil {
		t.Fatal(err)
	}
	if c.Recipes[0].ReplaceID != 0 || c.Recipes[0].Input.Name != "Chicken tikka traybake (3)" {
		t.Fatalf("keep both must take the next free number, got %q", c.Recipes[0].Input.Name)
	}
	if p := plan(t, f, ex, decide(recipefile.ActionKeepBoth)); p.Recipes[0].ImportedAs != "Chicken tikka traybake (3)" {
		t.Fatalf("importedAs = %q", p.Recipes[0].ImportedAs)
	}

	c, err = recipefile.BuildCommit(f, ex, decide(recipefile.ActionSkip), noImages)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Recipes) != 1 || c.Recipes[0].Input.Name != "Lasagne (ready meal)" {
		t.Fatalf("skip leaves the other Recipe: %+v", c.Recipes)
	}
	for _, n := range c.NewIngredients {
		if n.Key == "chicken thighs" || n.Key == "spinach" {
			t.Fatalf("Ingredient %q is used only by the skipped Recipe and must not be created", n.Key)
		}
	}
	if len(c.NewIngredients) != 1 || c.NewIngredients[0].Key != "lasagne ready meal" {
		t.Fatalf("new = %+v", c.NewIngredients)
	}
}

func TestSkippedRecipesAreNotCheckedAndUnusedIngredientsAreNotListed(t *testing.T) {
	data := mutate(t, func(r map[string]any) { recipeAt(r, 0)["yield"] = 500 })
	f := mustParse(t, data)
	if p := plan(t, f, recipefile.Existing{}, recipefile.Decisions{}); p.Ready {
		t.Fatal("yield 500 is a Problem")
	}
	d := recipefile.Decisions{Recipes: []recipefile.RecipeDecision{{Index: 0, Action: recipefile.ActionSkip}}}
	p := plan(t, f, recipefile.Existing{}, d)
	if !p.Ready || len(p.Problems) != 0 {
		t.Fatalf("plan = %+v", p)
	}
	if len(p.Ingredients) != 1 {
		t.Fatalf("only the Ready Meal's Ingredient is listed, got %+v", p.Ingredients)
	}
}

func TestRecipeProblemsCarryJSONPaths(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(r map[string]any)
		path   string
	}{
		{"yield", func(r map[string]any) { recipeAt(r, 0)["yield"] = 500 }, "$.recipes[0].yield"},
		{"cool-down", func(r map[string]any) { recipeAt(r, 1)["cooldownDays"] = 4000 }, "$.recipes[1].cooldownDays"},
		{"duplicate recipe name", func(r map[string]any) { recipeAt(r, 1)["name"] = " chicken tikka   TRAYBAKE" }, "$.recipes[1].name"},
		{"step after refers forward", func(r map[string]any) {
			recipeAt(r, 0)["steps"].([]any)[1].(map[string]any)["after"] = []any{4}
		}, "$.recipes[0].steps[1]"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p := plan(t, mustParse(t, mutate(t, tc.mutate)), recipefile.Existing{}, recipefile.Decisions{})
			if p.Ready || len(p.Problems) == 0 {
				t.Fatalf("plan = %+v", p)
			}
			if tc.path == "" {
				return
			}
			for _, pr := range p.Problems {
				if strings.HasPrefix(pr.Path, tc.path) { // the field of a Step may be "steps[1].after" or "steps[1]"
					return
				}
			}
			t.Fatalf("no problem at %s in %+v", tc.path, p.Problems)
		})
	}
}

func TestCommitCarriesTheRecipeContent(t *testing.T) {
	c, err := recipefile.BuildCommit(exampleFile(t), recipefile.Existing{}, recipefile.Decisions{}, noImages)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.NewIngredients) != 9 || len(c.Recipes) != 2 {
		t.Fatalf("new=%d recipes=%d", len(c.NewIngredients), len(c.Recipes))
	}
	rc := c.Recipes[0]
	in := rc.Input
	if in.Name != "Chicken tikka traybake" || in.Yield != 4 || len(in.Tags) != 3 || in.Tags[2] != "weeknight" ||
		in.CooldownDays == nil || *in.CooldownDays != 10 || in.LeftoverUseByDays == nil || *in.LeftoverUseByDays != 2 || in.Source.Attribution != "Family recipe" {
		t.Fatalf("input = %+v", in)
	}
	if len(in.Lines) != 8 || len(rc.LineKeys) != 8 || rc.LineKeys[0] != "chicken thighs" || in.Lines[0].Quantity != 800 || in.Lines[0].Unit != "g" || in.Lines[0].Note != "boneless, skinless" {
		t.Fatalf("lines = %+v keys=%v", in.Lines, rc.LineKeys)
	}
	if len(in.Steps) != 6 || in.Steps[0].Kind != "advance" || in.Steps[0].LeadTimeMinutes != 240 || in.Steps[3].DurationMinutes != 25 || len(in.Steps[3].After) != 2 || in.Steps[3].After[0] != 1 {
		t.Fatalf("steps = %+v", in.Steps)
	}
	if len(rc.UseKeys) != 6 || len(rc.UseKeys[0]) != 4 || rc.UseKeys[0][2] != "garam masala" || len(rc.UseKeys[1]) != 0 {
		t.Fatalf("use keys = %v", rc.UseKeys)
	}
	if !c.Recipes[1].Input.ReadyMeal || len(c.Recipes[1].Input.Lines) != 1 {
		t.Fatalf("ready meal = %+v", c.Recipes[1].Input)
	}
	for _, n := range c.NewIngredients {
		if n.Key == "chicken thighs" && (n.Input.Base != units.Gram || n.Input.ShelfLifeDays == nil || *n.Input.ShelfLifeDays != 3) {
			t.Fatalf("chicken thighs = %+v", n.Input)
		}
	}
}

func TestFractionalMinutesAreRoundedUpToWholeMinutes(t *testing.T) {
	data := mutate(t, func(r map[string]any) {
		recipeAt(r, 0)["steps"].([]any)[2].(map[string]any)["durationMinutes"] = 7.2
		recipeAt(r, 0)["steps"].([]any)[0].(map[string]any)["leadTimeMinutes"] = 90.5
	})
	c, err := recipefile.BuildCommit(mustParse(t, data), recipefile.Existing{}, recipefile.Decisions{}, noImages)
	if err != nil {
		t.Fatal(err)
	}
	if c.Recipes[0].Input.Steps[2].DurationMinutes != 8 || c.Recipes[0].Input.Steps[0].LeadTimeMinutes != 91 {
		t.Fatalf("steps = %+v", c.Recipes[0].Input.Steps)
	}
}

func TestImagesAreKeyedByJSONPathAndWarningsReachThePlan(t *testing.T) {
	data := mutate(t, func(r map[string]any) {
		recipeAt(r, 0)["image"] = "https://example.com/a.jpg"
		recipeAt(r, 0)["steps"].([]any)[1].(map[string]any)["image"] = "https://example.com/b.jpg"
	})
	f := mustParse(t, data)
	imgs := recipefile.ImageSet{
		Images:   map[string]imaging.Result{"$.recipes[0].image": {WebP: []byte("webp"), Width: 2, Height: 2}},
		Warnings: []recipefile.Warning{{Path: "$.recipes[0].steps[1].image", Code: recipefile.WarnImageFailed, Message: "could not download"}},
	}
	p := recipefile.BuildPlan(f, recipefile.Existing{}, recipefile.Decisions{}, imgs)
	if !p.Ready || len(p.Warnings) != 1 || p.Warnings[0].Path != "$.recipes[0].steps[1].image" {
		t.Fatalf("plan = %+v", p)
	}
	c, err := recipefile.BuildCommit(f, recipefile.Existing{}, recipefile.Decisions{}, imgs)
	if err != nil {
		t.Fatal(err)
	}
	rc := c.Recipes[0]
	if rc.ImagePath != "$.recipes[0].image" || len(rc.StepImagePaths) != 6 || rc.StepImagePaths[1] != "" {
		t.Fatalf("paths: %q %v (a failed step image has no path)", rc.ImagePath, rc.StepImagePaths)
	}
	if _, ok := c.Images[rc.ImagePath]; !ok || len(c.Images) != 1 {
		t.Fatalf("images = %v", c.Images)
	}
}

func TestDecisionsForUnknownKeysAreIgnored(t *testing.T) {
	d := recipefile.Decisions{
		Ingredients: []recipefile.IngredientDecision{{Key: "unicorn tears", Action: recipefile.ActionUse, IngredientID: 99}},
		Conversions: []recipefile.ConversionAnswer{{Key: "unicorn tears", Unit: "vial", ToBase: 3}},
		Recipes:     []recipefile.RecipeDecision{{Index: 17, Action: recipefile.ActionSkip}},
	}
	p := plan(t, exampleFile(t), recipefile.Existing{}, d)
	if !p.Ready || len(p.Recipes) != 2 {
		t.Fatalf("plan = %+v", p)
	}
}
