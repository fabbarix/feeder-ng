package cook

import "errors"

// Scope names what a cook session is about: a Planned Meal or a Recipe.
type Scope string

// ErrInvalidScope is returned by ParseScope.
var ErrInvalidScope = errors.New("invalid cook scope")

// MealScope is "meal:<date>/<mealSlotId>".
func MealScope(date string, mealSlotID int64) Scope { panic("TODO") }

// RecipeScope is "recipe:<id>".
func RecipeScope(recipeID int64) Scope { panic("TODO") }

// ScopeParts is a parsed Scope; exactly one of the two groups is set.
type ScopeParts struct {
	Date       string // meal scope
	MealSlotID int64  // meal scope
	RecipeID   int64  // recipe scope
	IsMeal     bool
}

// ParseScope accepts only the two forms above (date YYYY-MM-DD and a real
// calendar day, positive ids) and returns ErrInvalidScope for anything else.
func ParseScope(s string) (ScopeParts, error) { panic("TODO") }
