package recipe

import (
	"strings"

	"github.com/fabbarix/feeder-ng/internal/units"
)

// CodeReadyMealUnit is the validation reason when a Ready Meal's same-name
// Ingredient already exists but does not count in pieces, so no pack line can be
// made without inventing a quantity (R14, docs/dev/design/r14-recipe-editor.md).
const CodeReadyMealUnit = "ready_meal_unit"

// ReadyMealCandidate is an existing Ingredient as the Ready Meal rule sees it.
type ReadyMealCandidate struct {
	ID   int64
	Name string
	Base units.Base
	// BaseRecipe marks the Ingredient of a Base recipe (ADR 0015): a Ready Meal never reuses it, and a Ready Meal
	// named like it is refused (BaseRecipeTaken). The store fills it in.
	BaseRecipe bool
}

// ReadyMealChoice says which Ingredient a Ready Meal stands for.
//
//   - ReuseID != 0: an Ingredient with the Recipe's normalised name exists; use it.
//   - Create != "": none exists; create it (display name, Base Unit piece, no Shelf Life).
//   - Conflict: the same-name Ingredient exists but its Base Unit is not piece (CodeReadyMealUnit).
//   - Line is the single ingredient line (quantity 1, unit piece, not optional, no note) with
//     IngredientID set only for ReuseID; the caller fills the id of a created Ingredient.
type ReadyMealChoice struct {
	ReuseID  int64
	Create   string
	Conflict bool
	// BaseRecipeTaken: a Base recipe holds the name (CodeBaseRecipeNameTaken); nothing is reused or created.
	BaseRecipeTaken bool
	Line            Line
}

// NeedsReadyMealIngredient reports whether the Input asks the server to derive the pack line:
// a Ready Meal with no ingredient lines at all.
func NeedsReadyMealIngredient(in Input) bool { return in.ReadyMeal && len(in.Lines) == 0 }

// ChooseReadyMealIngredient applies the Ready Meal rule for a Recipe name against the existing Ingredients.
// Names are compared with units.NormalizeName.
func ChooseReadyMealIngredient(recipeName string, existing []ReadyMealCandidate) ReadyMealChoice {
	display := strings.Join(strings.Fields(recipeName), " ")
	if display == "" {
		return ReadyMealChoice{}
	}
	line := Line{Quantity: 1, Unit: string(units.Piece)}
	key := units.NormalizeName(display)
	for _, c := range existing {
		if c.BaseRecipe && units.NormalizeName(c.Name) == key {
			return ReadyMealChoice{BaseRecipeTaken: true}
		}
	}
	for _, c := range existing {
		if c.BaseRecipe {
			continue
		}
		if units.NormalizeName(c.Name) != key {
			continue
		}
		if c.Base != units.Piece {
			return ReadyMealChoice{ReuseID: c.ID, Conflict: true}
		}
		line.IngredientID = c.ID
		return ReadyMealChoice{ReuseID: c.ID, Line: line}
	}
	return ReadyMealChoice{Create: display, Line: line}
}
