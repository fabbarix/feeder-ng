package household

import (
	"sort"
	"strings"
)

// NewSlotsEntry is one line of the first-run "When do you eat?" sheet (TB-06): a Meal Slot name and time on some
// weekdays (1 Monday .. 7 Sunday).
type NewSlotsEntry struct {
	Name     string
	Time     string
	Weekdays []int
}

// NewSlotsInput is a batch create: every entry makes one Meal Slot per weekday, attended by every Member with no
// Portion Factor override and the default Courses of a new Meal Slot. It is all or nothing.
type NewSlotsInput struct{ Entries []NewSlotsEntry }

// Normalized trims the names and sorts and de-duplicates each entry's weekdays. It returns a copy.
func (in NewSlotsInput) Normalized() NewSlotsInput {
	out := NewSlotsInput{Entries: make([]NewSlotsEntry, len(in.Entries))}
	for i, e := range in.Entries {
		days := append([]int(nil), e.Weekdays...)
		sort.Ints(days)
		uniq := days[:0]
		for j, d := range days {
			if j == 0 || d != days[j-1] {
				uniq = append(uniq, d)
			}
		}
		out.Entries[i] = NewSlotsEntry{Name: strings.TrimSpace(e.Name), Time: e.Time, Weekdays: uniq}
	}
	return out
}

// Validate refuses an empty batch, an entry without weekdays or with a weekday outside 1..7, and any name or time a
// single Meal Slot would refuse. Callers normalise first.
func (in NewSlotsInput) Validate() error {
	if len(in.Entries) == 0 {
		return fieldError("slots", "give at least one Meal Slot")
	}
	for _, e := range in.Entries {
		if len(e.Weekdays) == 0 {
			return fieldError("weekdays", "give at least one weekday")
		}
		for _, d := range e.Weekdays {
			if d < 1 || d > 7 {
				return fieldError("weekdays", "must be 1 (Monday) to 7 (Sunday)")
			}
		}
		for _, m := range in.slotsOf(e) {
			if err := m.Validate(); err != nil {
				return err
			}
		}
	}
	return nil
}

// Slots lists the Meal Slots to create, in the order of the entries and then by weekday. Attendance and Courses are
// nil: the store gives a new Meal Slot everyone and its default Courses.
func (in NewSlotsInput) Slots() []MealSlotInput {
	var out []MealSlotInput
	for _, e := range in.Entries {
		out = append(out, in.slotsOf(e)...)
	}
	return out
}

func (NewSlotsInput) slotsOf(e NewSlotsEntry) []MealSlotInput {
	out := make([]MealSlotInput, 0, len(e.Weekdays))
	for _, d := range e.Weekdays {
		out = append(out, MealSlotInput{Weekday: d, Name: e.Name, Time: e.Time})
	}
	return out
}
