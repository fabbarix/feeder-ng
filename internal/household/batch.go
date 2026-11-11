package household

import (
	"errors"
	"sort"
	"strings"
)

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

// Normalized trims names, de-duplicates and sorts Weekdays. It returns a copy.
func (b BatchInput) Normalized() BatchInput {
	b.Match = strings.TrimSpace(b.Match)
	if b.Change.Name != nil {
		n := strings.TrimSpace(*b.Change.Name)
		b.Change.Name = &n
	}
	seen := map[int]bool{}
	days := make([]int, 0, len(b.Weekdays))
	for _, d := range b.Weekdays {
		if !seen[d] {
			seen[d] = true
			days = append(days, d)
		}
	}
	sort.Ints(days)
	b.Weekdays = days
	return b
}

// Validate checks match, weekdays (1..7, at least one), at least one change and each changed field.
func (b BatchInput) Validate() error {
	if nameLength(b.Match) < 1 {
		return fieldError("match", "must name the Meal Slot to change")
	}
	if len(b.Weekdays) == 0 {
		return fieldError("weekdays", "choose at least one weekday")
	}
	for _, d := range b.Weekdays {
		if d < 1 || d > 7 {
			return fieldError("weekdays", "must be 1 (Monday) to 7 (Sunday)")
		}
	}
	c := b.Change
	if c.Name == nil && c.Time == nil && c.Attendance == nil {
		return fieldError("set", "must change at least one of name, time or attendance")
	}
	if c.Name != nil {
		if n := nameLength(*c.Name); n < 1 || n > 50 {
			return fieldError("name", "must be between 1 and 50 characters")
		}
	}
	if c.Time != nil && !validTimeOfDay(*c.Time) {
		return fieldError("time", "must be an HH:MM time")
	}
	if c.Attendance != nil {
		return ValidateAttendees(*c.Attendance)
	}
	return nil
}

// sameSlotName compares Meal Slot names the way the UNIQUE (weekday, name) NOCASE rule does.
func sameSlotName(a, b string) bool {
	return strings.EqualFold(strings.TrimSpace(a), strings.TrimSpace(b))
}

// MatchSlots splits the chosen weekdays into the Meal Slots named match (case and edge spaces ignored)
// and the weekdays with none. Both come back ascending.
func MatchSlots(slots []MealSlot, match string, weekdays []int) (matched []MealSlot, skipped []int) {
	days := BatchInput{Weekdays: weekdays}.Normalized().Weekdays
	for _, d := range days {
		found := false
		for _, s := range slots {
			if s.Weekday == d && sameSlotName(s.Name, match) {
				matched = append(matched, s)
				found = true
				break
			}
		}
		if !found {
			skipped = append(skipped, d)
		}
	}
	return matched, skipped
}
