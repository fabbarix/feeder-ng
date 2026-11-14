package plan

import (
	"errors"
)

// B9-11 (PC-01, SAFE-03, SAFE-07). STUB written by the test author so the tests compile: the Developer replaces the
// bodies. The contracts are in the doc comments and in b9_undo_test.go.

// CellState is what one Course cell holds on one side of a change: the Recipe (with the name it had) and whether the meal
// is served from a Leftover.
type CellState struct {
	RecipeID           int64  `json:"recipeId"`
	RecipeName         string `json:"recipeName"`
	ServedFromLeftover bool   `json:"servedFromLeftover"`
}

// CellChange is one Course cell of one Meal Slot occurrence that a replanning write changed beyond its own target.
// Before is nil when the cell was empty, After is nil when it is empty now. Why are the why chips of the After meal
// (an empty list, never nil, when After is nil).
type CellChange struct {
	Date       string     `json:"date"`
	MealSlotID int64      `json:"mealSlotId"`
	CourseID   int64      `json:"courseId"`
	Before     *CellState `json:"before"`
	After      *CellState `json:"after"`
	Why        []Why      `json:"why"`
}

// Key is the cell the change is about.
func (c CellChange) Key() Key {
	return Key{Date: c.Date, MealSlotID: c.MealSlotID, CourseID: c.CourseID}
}

// CellChanges compares the Planned Meals before and after a write and lists the cells whose Recipe, or whose
// served-from-a-Leftover flag, differs, except the cells named in except (a write's own target). STUB.
func CellChanges(before, after []Meal, names func(recipeID int64) string, except ...Key) []CellChange {
	return nil
}

// ErrReopenWindowOver: a Cooked or Not cooked mark can be taken back until the end of the household day it was made on.
var ErrReopenWindowOver = errors.New("plan: it is too late to reopen that Planned Meal")

// ErrLeftoverUsed: some of the Leftover that a Cooked meal made was already had, so Cooked cannot be taken back.
var ErrLeftoverUsed = errors.New("plan: some of that Leftover was already had")

// MayReopen reports whether a meal marked on markedOn (a household date) may still be reopened on today. STUB.
func MayReopen(markedOn, today string) bool { return false }

// Reasons of the writes B9-11 adds.
const (
	ReasonRestored Reason = "restored" // Undo of a replanning write (POST /api/plan/restore)
	ReasonReopened Reason = "reopened" // Undo of Cooked or Not cooked
)
