package cook

import (
	"errors"
	"strconv"
	"strings"
	"time"
)

// Scope names what a cook session is about: a Planned Meal or a Recipe.
type Scope string

// ErrInvalidScope is returned by ParseScope.
var ErrInvalidScope = errors.New("invalid cook scope")

// MealScope is "meal:<date>/<mealSlotId>".
func MealScope(date string, mealSlotID int64) Scope {
	return Scope("meal:" + date + "/" + strconv.FormatInt(mealSlotID, 10))
}

// RecipeScope is "recipe:<id>".
func RecipeScope(recipeID int64) Scope {
	return Scope("recipe:" + strconv.FormatInt(recipeID, 10))
}

// ScopeParts is a parsed Scope; exactly one of the two groups is set.
type ScopeParts struct {
	Date       string // meal scope
	MealSlotID int64  // meal scope
	RecipeID   int64  // recipe scope
	IsMeal     bool
}

// ParseScope accepts only the two forms above (date YYYY-MM-DD and a real
// calendar day, positive ids) and returns ErrInvalidScope for anything else.
func ParseScope(s string) (ScopeParts, error) {
	if rest, ok := strings.CutPrefix(s, "meal:"); ok {
		date, slot, ok := strings.Cut(rest, "/")
		if !ok {
			return ScopeParts{}, ErrInvalidScope
		}
		if _, err := time.Parse("2006-01-02", date); err != nil || len(date) != len("2006-01-02") {
			return ScopeParts{}, ErrInvalidScope
		}
		id, err := positiveID(slot)
		if err != nil {
			return ScopeParts{}, err
		}
		return ScopeParts{Date: date, MealSlotID: id, IsMeal: true}, nil
	}
	if rest, ok := strings.CutPrefix(s, "recipe:"); ok {
		id, err := positiveID(rest)
		if err != nil {
			return ScopeParts{}, err
		}
		return ScopeParts{RecipeID: id}, nil
	}
	return ScopeParts{}, ErrInvalidScope
}

// positiveID accepts only plain decimal digits that form an id above zero.
func positiveID(s string) (int64, error) {
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, ErrInvalidScope
		}
	}
	id, err := strconv.ParseInt(s, 10, 64)
	if err != nil || id <= 0 {
		return 0, ErrInvalidScope
	}
	return id, nil
}
