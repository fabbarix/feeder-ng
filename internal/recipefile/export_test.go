package recipefile_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/units"
)

var now = time.Date(2026, 11, 9, 18, 0, 0, 0, time.UTC)

func intp(n int) *int { return &n }

func exportFixture() recipefile.ExportInput {
	shelf := 3
	return recipefile.ExportInput{
		Now: now,
		Ingredients: map[int64]ingredient.Ingredient{
			1: {ID: 1, Name: "Chicken  Thighs", Base: "g", ShelfLifeDays: &shelf},
			2: {ID: 2, Name: "garlic", Base: "g", Conversions: []units.Conversion{{Unit: "clove", ToBase: 5}}},
			3: {ID: 3, Name: "stock cube", Base: "piece"}, // used only in a Step
			4: {ID: 4, Name: "unused", Base: "ml"},        // not used by any exported Recipe
		},
		Recipes: []recipe.Recipe{
			{
				ID: 10,
				Input: recipe.Input{
					Name: "Garlic chicken", Yield: 2, Tags: []string{"chicken"},
					CooldownDays: intp(0), LeftoverUseByDays: intp(0),
					Source: recipe.Source{URL: "https://example.com/r", Attribution: "Nonna"},
					Image:  "0123456789abcdef0123456789abcdef",
					Lines: []recipe.Line{
						{IngredientID: 1, Ingredient: "Chicken  Thighs", Quantity: 500, Unit: "g", Note: "boneless"},
						{IngredientID: 2, Ingredient: "garlic", Quantity: 3, Unit: "clove", Optional: true},
					},
					Steps: []recipe.Step{
						{Text: "Marinate", Kind: schedule.Advance, LeadTimeMinutes: 120, Uses: []recipe.Use{{IngredientID: 3, Quantity: 1, Unit: "piece"}}},
						{Text: "Roast", Kind: schedule.Passive, DurationMinutes: 30, After: []int{}},
					},
				},
			},
			{ID: 11, Input: recipe.Input{Name: "Plain", Yield: 1, Lines: []recipe.Line{{IngredientID: 2, Ingredient: "garlic", Quantity: 1, Unit: "clove"}}}},
		},
		Image: func(id string) (string, error) { return "data:image/webp;base64,UklGRg==", nil },
	}
}

func TestBuildEmbedsDefinitionsOfEveryIngredientUsedAndNoOthers(t *testing.T) {
	f, warns := recipefile.Build(exportFixture())
	if len(warns) != 0 {
		t.Fatalf("warnings: %+v", warns)
	}
	if f.Format != "feeder-recipe-file" || f.Version != 1 || f.ExportedAt != "2026-11-09T18:00:00Z" {
		t.Fatalf("header: %q %d %q", f.Format, f.Version, f.ExportedAt)
	}
	var names []string
	for _, i := range f.Ingredients {
		names = append(names, i.Name)
	}
	if strings.Join(names, "|") != "Chicken Thighs|garlic|stock cube" {
		t.Fatalf("definitions = %v, want chicken thighs, garlic, stock cube ordered by normalised name, display names collapsed", names)
	}
	garlic := f.Ingredients[1]
	if garlic.BaseUnit != "g" || len(garlic.Conversions) != 1 || garlic.Conversions[0].Unit != "clove" || garlic.Conversions[0].ToBase != 5 {
		t.Fatalf("garlic = %+v", garlic)
	}
	if f.Ingredients[0].ShelfLifeDays == nil || *f.Ingredients[0].ShelfLifeDays != 3 || garlic.ShelfLifeDays != nil {
		t.Fatal("shelf life must be 3 for chicken, absent for garlic")
	}
}

func TestBuildWritesRecipesLikeTheFormat(t *testing.T) {
	f, _ := recipefile.Build(exportFixture())
	r := f.Recipes[0]
	if r.Name != "Garlic chicken" || r.Yield != 2 || r.Image != "data:image/webp;base64,UklGRg==" {
		t.Fatalf("recipe = %+v", r)
	}
	if r.CooldownDays == nil || *r.CooldownDays != 0 || r.LeftoverUseByDays == nil || *r.LeftoverUseByDays != 0 {
		t.Fatal("0 days must be kept, not dropped")
	}
	if f.Recipes[1].CooldownDays != nil {
		t.Fatal("a nil cool-down must stay absent")
	}
	if r.Source == nil || r.Source.URL != "https://example.com/r" || r.Source.Attribution != "Nonna" {
		t.Fatalf("source = %+v", r.Source)
	}
	if r.Ingredients[0].Ingredient != "Chicken Thighs" || r.Ingredients[0].Note != "boneless" || !r.Ingredients[1].Optional {
		t.Fatalf("lines = %+v", r.Ingredients)
	}
	if r.Steps[0].Kind != "advance" || *r.Steps[0].LeadTimeMinutes != 120 || r.Steps[0].DurationMinutes != nil || r.Steps[0].Uses[0].Ingredient != "stock cube" {
		t.Fatalf("advance step = %+v", r.Steps[0])
	}
	if *r.Steps[1].DurationMinutes != 30 {
		t.Fatalf("passive step = %+v", r.Steps[1])
	}
	if f.Recipes[1].Image != "" {
		t.Fatal("a Recipe without a photo has no image")
	}
}

func TestBuildDropsAnImageThatCannotBeLoadedWithAWarning(t *testing.T) {
	in := exportFixture()
	in.Image = func(string) (string, error) { return "", errors.New("gone") }
	f, warns := recipefile.Build(in)
	if f.Recipes[0].Image != "" {
		t.Fatal("image must be left out")
	}
	if len(warns) != 1 || warns[0].Code != recipefile.WarnImageFailed || warns[0].Path != "$.recipes[0].image" {
		t.Fatalf("warnings = %+v", warns)
	}
}

func TestMarshalOutputValidatesAgainstTheSchema(t *testing.T) {
	in := exportFixture()
	in.Image = func(string) (string, error) { return pngDataURL(t, 4, 4), nil }
	f, _ := recipefile.Build(in)
	data, err := recipefile.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(string(data), "\n") {
		t.Fatal("output ends with a newline")
	}
	back, err := recipefile.Parse(data)
	if err != nil {
		t.Fatalf("exported file must validate against the schema: %v", err)
	}
	if len(back.Recipes) != 2 || back.Recipes[0].Name != "Garlic chicken" {
		t.Fatalf("round trip lost data: %+v", back.Recipes)
	}
}

func TestExportFileName(t *testing.T) {
	if got := recipefile.ExportFileName(now); got != "feeder-recipes-2026-11-09.feeder.json" {
		t.Fatalf("got %q", got)
	}
}
