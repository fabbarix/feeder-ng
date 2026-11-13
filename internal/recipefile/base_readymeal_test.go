package recipefile_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// BR-C round 2: Ready Meals are never Base recipe targets (ADR 0015: a Ready Meal cannot become a Base recipe).
// They leave the candidates, existing ones and those marked readyMeal in the file; convert and file answers that
// target one are refused; and a line using a Ready Meal's Ingredient ("fish fingers") gets no "another recipe" row.

func fishFingersLine() recipefile.Line {
	return recipefile.Line{Ingredient: "fish fingers", Quantity: 8, Unit: "piece"}
}

func fileReadyMeal() recipefile.Recipe {
	r := miniRecipe("Fish fingers")
	r.ReadyMeal = true
	r.Yield = 2
	r.Ingredients = []recipefile.Line{{Ingredient: "fish fingers", Quantity: 1, Unit: "piece"}}
	return r
}

func pieceFile(f recipefile.File) recipefile.File {
	// lasagneWith defines the line's Ingredient in ml for non-g units; fix the base to piece.
	for i := range f.Ingredients {
		if f.Ingredients[i].Name == "fish fingers" {
			f.Ingredients[i].BaseUnit = "piece"
		}
	}
	return f
}

func TestAnExistingReadyMealIsNotACandidateForALineNamedLikeIt(t *testing.T) {
	ex := recipefile.Existing{Recipes: []recipefile.RecipeRef{{ID: 70, Name: "Fish fingers", ReadyMeal: true}}}
	p := plan(t, pieceFile(lasagneWith(fishFingersLine())), ex, recipefile.Decisions{})
	if len(p.BaseRecipeLines) != 0 {
		t.Fatalf("a Ready Meal's Ingredient is not another recipe: %+v", p.BaseRecipeLines)
	}
	if !p.Ready {
		t.Errorf("plan not ready: %+v", p.Problems)
	}
}

func TestAReadyMealMarkedInTheFileIsNotACandidateEither(t *testing.T) {
	f := pieceFile(lasagneWith(fishFingersLine(), fileReadyMeal()))
	p := plan(t, f, recipefile.Existing{}, recipefile.Decisions{})
	if len(p.BaseRecipeLines) != 0 {
		t.Fatalf("rows = %+v", p.BaseRecipeLines)
	}
}

func TestAMarkedLineNeverOffersAReadyMealAmongItsSuggestions(t *testing.T) {
	line := recipefile.Line{Ingredient: "fish fingers", Quantity: 8, Unit: "piece", Recipe: &recipefile.LineRecipe{Name: "Fish fingers", Cue: "see page 7"}}
	ex := recipefile.Existing{Recipes: []recipefile.RecipeRef{{ID: 70, Name: "Fish fingers", ReadyMeal: true}, {ID: 71, Name: "Fish fingers pie"}}}
	f := pieceFile(lasagneWith(line, fileReadyMeal()))
	p := plan(t, f, ex, recipefile.Decisions{})
	row := rowAt(t, p, lineB) // the model marked it, so the row exists
	for _, s := range row.Suggestions {
		if s.RecipeID == 70 || (s.Kind == recipefile.SuggestFile && s.RecipeIndex != nil && *s.RecipeIndex == 1) {
			t.Errorf("a Ready Meal is suggested: %+v", s)
		}
	}
	if row.Resolved || row.Effective != nil {
		t.Errorf("nothing is preselected: %+v", row)
	}
}

func TestAnAnswerThatTargetsAReadyMealIsRefused(t *testing.T) {
	line := recipefile.Line{Ingredient: "fish fingers", Quantity: 8, Unit: "piece", Recipe: &recipefile.LineRecipe{Name: "Fish fingers"}}
	ex := recipefile.Existing{Recipes: []recipefile.RecipeRef{{ID: 70, Name: "Fish fingers", ReadyMeal: true}}}
	f := pieceFile(lasagneWith(line, fileReadyMeal()))
	idx := 1
	cases := map[string]recipefile.BaseRecipeLineDecision{
		"convert an existing Ready Meal": {Action: recipefile.BaseConvert, RecipeID: 70, Yield: 1, YieldUnit: "portion"},
		"use an existing Ready Meal":     {Action: recipefile.BaseUse, RecipeID: 70},
		"file: a Ready Meal of the file": {Action: recipefile.BaseFile, RecipeIndex: &idx, Yield: 1, YieldUnit: "portion"},
	}
	for name, d := range cases {
		t.Run(name, func(t *testing.T) {
			p := plan(t, f, ex, recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{lineB: d}})
			if rowAt(t, p, lineB).Resolved || p.Ready || !hasProblemCode(p, recipefile.ProblemBaseRecipeAnswer) {
				t.Errorf("row %+v ready %v problems %+v", rowAt(t, p, lineB), p.Ready, p.Problems)
			}
		})
	}
}
