package recipefile_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// R14: Import Review applies the Ready Meal rule of the Recipe editor (docs/dev/design/r14-recipe-editor.md).
// A Ready Meal whose single line is named like the Recipe needs no Ingredient definition in the file: an
// existing same-name Ingredient is used, otherwise a piece Ingredient is created. The file stays authoritative
// when the line is named differently.

func readyMealFile(recipeName, lineIngredient string, defs ...recipefile.Ingredient) recipefile.File {
	r := recipefile.Recipe{
		Name: recipeName, Yield: 2, ReadyMeal: true,
		Ingredients: []recipefile.Line{{Ingredient: lineIngredient, Quantity: 1, Unit: "piece"}},
	}
	f := fileOf(r)
	f.Ingredients = defs
	return f
}

func TestReadyMealWithoutADefinitionCreatesItsPieceIngredientAndIsReady(t *testing.T) {
	f := readyMealFile("Lasagne pack", "lasagne pack")
	p := plan(t, f, recipefile.Existing{}, recipefile.Decisions{})
	m := matchOf(t, p, "lasagne pack")
	if m.Status != recipefile.StatusNew || !m.Resolved || m.Effective == nil || m.Effective.Action != recipefile.ActionCreate {
		t.Fatalf("row = %+v, want a new, resolved Ingredient created by default", m)
	}
	if !p.Ready || len(p.Problems) != 0 {
		t.Fatalf("plan not ready: %+v", p)
	}
	c, err := recipefile.BuildCommit(f, recipefile.Existing{}, recipefile.Decisions{}, noImages)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.NewIngredients) != 1 {
		t.Fatalf("new Ingredients = %+v", c.NewIngredients)
	}
	n := c.NewIngredients[0]
	if n.Key != "lasagne pack" || n.Input.Name != "lasagne pack" || n.Input.Base != units.Piece || n.Input.ShelfLifeDays != nil || len(n.Input.Conversions) != 0 {
		t.Fatalf("created = %+v, want a piece Ingredient named like the line, no Shelf Life", n)
	}
}

func TestReadyMealReusesAnExistingSameNameIngredient(t *testing.T) {
	f := readyMealFile("Lasagne pack", "  LASAGNE   pack")
	ex := recipefile.Existing{Ingredients: []ingredientT{ing(5, "Lasagne pack", "piece")}}
	p := plan(t, f, ex, recipefile.Decisions{})
	m := matchOf(t, p, "lasagne pack")
	if m.Status != recipefile.StatusExact || m.Match == nil || m.Match.ID != 5 {
		t.Fatalf("row = %+v, want exact match on id 5", m)
	}
	c, err := recipefile.BuildCommit(f, ex, recipefile.Decisions{}, noImages)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.NewIngredients) != 0 || c.Resolved["lasagne pack"].ID != 5 {
		t.Fatalf("commit = %+v, want no new Ingredient and the line on id 5", c)
	}
}

func TestReadyMealDefinitionInTheFileWins(t *testing.T) {
	def := recipefile.Ingredient{Name: "lasagne pack", BaseUnit: "piece", ShelfLifeDays: ptr(5)}
	f := readyMealFile("Lasagne pack", "lasagne pack", def)
	c, err := recipefile.BuildCommit(f, recipefile.Existing{}, recipefile.Decisions{}, noImages)
	if err != nil {
		t.Fatal(err)
	}
	if got := c.NewIngredients[0].Input.ShelfLifeDays; got == nil || *got != 5 {
		t.Fatalf("Shelf Life = %v, want the file's 5", got)
	}
}

func TestReadyMealNamedDifferentlyFromItsRecipeKeepsTheFilesRule(t *testing.T) {
	// The spec example does this ("Lasagne (ready meal)" uses "lasagne ready meal", defined in the file).
	// Without a definition the line is still undefined: the importer does not guess for another name.
	f := readyMealFile("Lasagne (ready meal)", "lasagne tray")
	p := plan(t, f, recipefile.Existing{}, recipefile.Decisions{})
	if m := matchOf(t, p, "lasagne tray"); m.Status != recipefile.StatusUndefined || m.Resolved || p.Ready {
		t.Fatalf("row = %+v, ready = %v, want undefined and not ready", m, p.Ready)
	}
}

func TestOnlyAReadyMealGetsTheSameNameDefault(t *testing.T) {
	r := recipefile.Recipe{Name: "Lasagne pack", Yield: 2, Ingredients: []recipefile.Line{{Ingredient: "lasagne pack", Quantity: 1, Unit: "piece"}}}
	p := plan(t, fileOf(r), recipefile.Existing{}, recipefile.Decisions{})
	if m := matchOf(t, p, "lasagne pack"); m.Status != recipefile.StatusUndefined {
		t.Fatalf("row = %+v, want undefined for a normal Recipe", m)
	}
}

func TestReadyMealSameNameWithAnotherBaseUnitIsStillAConflictFreeUnitQuestion(t *testing.T) {
	// An existing 'lasagne pack' counted in g: the file says 1 piece, which it cannot convert, so Import Review asks
	// for the Unit Conversion exactly as for any other Ingredient. No special case, no duplicate Ingredient.
	f := readyMealFile("Lasagne pack", "lasagne pack")
	ex := recipefile.Existing{Ingredients: []ingredientT{ing(5, "lasagne pack", "g")}}
	p := plan(t, f, ex, recipefile.Decisions{})
	if m := matchOf(t, p, "lasagne pack"); m.Status != recipefile.StatusExact {
		t.Fatalf("row = %+v", m)
	}
	if promptOf(p, "lasagne pack", "piece") == nil {
		t.Fatalf("want a Unit Conversion prompt for piece, got %+v", p.UnitPrompts)
	}
}
