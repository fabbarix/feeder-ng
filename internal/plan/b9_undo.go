package plan

import (
	"errors"
	"sort"
)

// B9-11 (PC-01, SAFE-03, SAFE-07): what a replanning write changed beyond its own target, and the window in which a
// Cooked or Not cooked mark can be taken back.

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
// served-from-a-Leftover flag, differs, except the cells named in except (a write's own target). A cell that holds a
// Cooked or Not cooked meal after the write is not a replan and is never listed. The list is ordered by date, Meal Slot,
// then Course, and is empty (never nil) when nothing changed.
func CellChanges(before, after []Meal, names func(recipeID int64) string, except ...Key) []CellChange {
	skip := make(map[Key]bool, len(except))
	for _, k := range except {
		skip[k] = true
	}
	was := make(map[Key]Meal, len(before))
	for _, m := range before {
		was[m.Key] = m
	}
	now := make(map[Key]Meal, len(after))
	for _, m := range after {
		now[m.Key] = m
	}
	state := func(m Meal, ok bool) *CellState {
		if !ok {
			return nil
		}
		name := ""
		if names != nil {
			name = names(m.RecipeID)
		}
		return &CellState{RecipeID: m.RecipeID, RecipeName: name, ServedFromLeftover: m.From != nil}
	}
	out := []CellChange{}
	seen := map[Key]bool{}
	visit := func(k Key) {
		if seen[k] || skip[k] {
			return
		}
		seen[k] = true
		b, hadB := was[k]
		a, hasA := now[k]
		if hasA && a.State != StatePlanned {
			return
		}
		if hadB && hasA && b.RecipeID == a.RecipeID && (b.From != nil) == (a.From != nil) {
			return
		}
		ch := CellChange{Date: k.Date, MealSlotID: k.MealSlotID, CourseID: k.CourseID, Before: state(b, hadB),
			After: state(a, hasA), Why: []Why{}}
		if hasA && len(a.Why) > 0 {
			ch.Why = append([]Why(nil), a.Why...)
		}
		out = append(out, ch)
	}
	for _, m := range before {
		visit(m.Key)
	}
	for _, m := range after {
		visit(m.Key)
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.Date != b.Date {
			return a.Date < b.Date
		}
		if a.MealSlotID != b.MealSlotID {
			return a.MealSlotID < b.MealSlotID
		}
		return a.CourseID < b.CourseID
	})
	return out
}

// ErrReopenWindowOver: a Cooked or Not cooked mark can be taken back until the end of the household day it was made on.
var ErrReopenWindowOver = errors.New("plan: it is too late to reopen that Planned Meal")

// ErrLeftoverUsed: some of the Leftover that a Cooked meal made was already had, so Cooked cannot be taken back.
var ErrLeftoverUsed = errors.New("plan: some of that Leftover was already had")

// MayReopen reports whether a meal marked on markedOn (a household date) may still be reopened on today: only on the
// household day the mark was made on, whatever the meal's own date. No recorded mark ("") never may.
func MayReopen(markedOn, today string) bool { return markedOn != "" && markedOn == today }

// Reasons of the writes B9-11 adds.
const (
	ReasonRestored Reason = "restored" // Undo of a replanning write (POST /api/plan/restore)
	ReasonReopened Reason = "reopened" // Undo of Cooked or Not cooked
)
