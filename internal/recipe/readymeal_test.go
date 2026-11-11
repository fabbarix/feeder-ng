package recipe

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/units"
)

// R14: a Ready Meal and its Ingredient (docs/dev/design/r14-recipe-editor.md, "Ready Meal rule").

func TestNeedsReadyMealIngredientOnlyForALinelessReadyMeal(t *testing.T) {
	line := Line{IngredientID: egg, Quantity: 1, Unit: "piece"}
	tests := []struct {
		name string
		in   Input
		want bool
	}{
		{"Ready Meal with no lines", Input{Name: "Lasagne", Yield: 2, ReadyMeal: true}, true},
		{"Ready Meal with empty lines", Input{Name: "Lasagne", Yield: 2, ReadyMeal: true, Lines: []Line{}}, true},
		{"Ready Meal that names its line keeps it", Input{Name: "Lasagne", Yield: 2, ReadyMeal: true, Lines: []Line{line}}, false},
		{"a normal Recipe with no lines is still an error, not a derivation", Input{Name: "Soup", Yield: 2}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := NeedsReadyMealIngredient(tc.in); got != tc.want {
				t.Fatalf("NeedsReadyMealIngredient = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestChooseReadyMealIngredientCreatesWhenNoneExists(t *testing.T) {
	got := ChooseReadyMealIngredient("  Lasagne   pack ", []ReadyMealCandidate{{ID: 1, Name: "flour", Base: units.Gram}})
	if got.ReuseID != 0 || got.Conflict || got.Create != "Lasagne pack" {
		t.Fatalf("choice = %+v, want create 'Lasagne pack' (display name: spaces collapsed, case kept)", got)
	}
	if got.Line.Quantity != 1 || got.Line.Unit != "piece" || got.Line.Optional || got.Line.Note != "" || got.Line.IngredientID != 0 {
		t.Fatalf("line = %+v, want 1 piece, id left for the caller", got.Line)
	}
}

func TestChooseReadyMealIngredientReusesTheSameNameIgnoringCaseAndSpacing(t *testing.T) {
	existing := []ReadyMealCandidate{
		{ID: 1, Name: "flour", Base: units.Gram},
		{ID: 9, Name: "lasagne  PACK", Base: units.Piece},
	}
	got := ChooseReadyMealIngredient("Lasagne pack", existing)
	if got.ReuseID != 9 || got.Create != "" || got.Conflict {
		t.Fatalf("choice = %+v, want reuse id 9 (never a duplicate)", got)
	}
	if got.Line.IngredientID != 9 || got.Line.Quantity != 1 || got.Line.Unit != "piece" {
		t.Fatalf("line = %+v, want 1 piece of ingredient 9", got.Line)
	}
}

func TestChooseReadyMealIngredientRefusesToInventAPackSizeForAWeighedIngredient(t *testing.T) {
	got := ChooseReadyMealIngredient("Pasta", []ReadyMealCandidate{{ID: 4, Name: "pasta", Base: units.Gram}})
	if !got.Conflict || got.ReuseID != 4 || got.Create != "" {
		t.Fatalf("choice = %+v, want a conflict on id 4 (an Ingredient counted in g cannot be '1 piece')", got)
	}
	if CodeReadyMealUnit != "ready_meal_unit" {
		t.Fatalf("code = %q", CodeReadyMealUnit)
	}
}

func TestChooseReadyMealIngredientBlankNameChoosesNothing(t *testing.T) {
	got := ChooseReadyMealIngredient("   ", nil)
	if got.ReuseID != 0 || got.Create != "" || got.Conflict {
		t.Fatalf("choice = %+v, want nothing (the name validation reports it)", got)
	}
}

// Validate stays strict: the derivation happens before it, never instead of it.
func TestValidateStillRequiresExactlyOneLineForAReadyMeal(t *testing.T) {
	in := Input{Name: "Lasagne", Yield: 2, ReadyMeal: true}
	_, err := in.Validate(lookup)
	ve, ok := err.(*ValidationError)
	if !ok || ve.Field != "lines" {
		t.Fatalf("err = %v, want a lines error before derivation", err)
	}
}
