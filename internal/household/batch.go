package household

import "errors"

// ErrNoMatchingSlot: a batch edit matched no Meal Slot on any chosen weekday (R15).
var ErrNoMatchingSlot = errors.New("household: no Meal Slot with that name on the chosen weekdays")

// SlotChange is the part of a Meal Slot a batch edit changes. A nil field stays as it is;
// a non-nil Attendance (even empty = nobody) replaces the usual Attendance.
type SlotChange struct {
	Name       *string
	Time       *string
	Attendance *[]Attendee
}

// BatchInput edits every Meal Slot named Match on the chosen weekdays (R15, ui-review-2 §3.7).
type BatchInput struct {
	Match    string
	Weekdays []int
	Change   SlotChange
}

// BatchResult lists the updated Meal Slots (weekday order) and the weekdays skipped for lack of a match.
type BatchResult struct {
	Updated []MealSlot
	Skipped []int
}

// Normalized trims names, de-duplicates and sorts Weekdays. STUB (R15 step 2).
func (b BatchInput) Normalized() BatchInput { return b }

// Validate checks match, weekdays (1..7, at least one), at least one change and each changed field. STUB (R15 step 2).
func (b BatchInput) Validate() error { return nil }

// MatchSlots splits the chosen weekdays into the Meal Slots named match (case and edge spaces ignored)
// and the weekdays with none. Both come back ascending. STUB (R15 step 2).
func MatchSlots(slots []MealSlot, match string, weekdays []int) (matched []MealSlot, skipped []int) {
	return nil, nil
}
