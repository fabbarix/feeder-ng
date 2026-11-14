// Package away is the domain of an Away (beta.9, B9-24, PC-08, ADR 0025): a run of dates on which a Member eats at no
// Meal Slot. Domain only: no HTTP and no SQL.
//
// TEST STUB: the signatures the tests of B9-24 compile against, with no behaviour. The developer replaces the bodies.
package away

import (
	"errors"
	"time"
)

// Slot is a Meal Slot as an Away sees it: its id, ISO weekday (1 Monday to 7 Sunday) and usual time "HH:MM".
type Slot struct {
	ID      int64
	Weekday int
	Time    string
}

// Away belongs to one Member. From is the first day and Through the last day ("" = no last day yet), "YYYY-MM-DD"
// household dates. FromSlot is the first Meal Slot missed on the first day and ThroughSlot the last one missed on the
// last day; 0 means the whole day.
type Away struct {
	ID          int64
	MemberID    int64
	From        string
	FromSlot    int64
	Through     string
	ThroughSlot int64
}

// Error is a refused Away. Field is the JSON field ("from", "fromMealSlotId", "through", "throughMealSlotId"), Reason
// the machine reason. Conflict is the other Away of an "overlap".
type Error struct {
	Field    string
	Reason   string
	Conflict *Away
}

func (e *Error) Error() string { return e.Reason }

// ErrNotStarted is End on an Away whose first missed Meal Slot has not started (it is deleted, not ended).
var ErrNotStarted = errors.New("away: not started")

// ErrOver is End on an Away whose last missed Meal Slot is over already.
var ErrOver = errors.New("away: over")

// Covers says whether the Away covers the Meal Slot on the date (the Member eats nowhere it covers).
func Covers(a Away, date string, slot Slot, slots []Slot) bool { return false }

// Validate checks an Away to be stored. before is the stored Away when editing (nil when new), others are the
// Member's other Aways, slots every Meal Slot, today the household date. The error is an *Error.
func Validate(a Away, today string, before *Away, others []Away, slots []Slot) error { return nil }

// Started says whether the first Meal Slot the Away covers has started at now (household zone).
func Started(a Away, now time.Time, slots []Slot) bool { return false }

// Apply returns the Members who still eat: memberIDs less those a covering Away removes, unless despite[member].
func Apply(aways []Away, date string, slot Slot, slots []Slot, memberIDs []int64, despite map[int64]bool) []int64 {
	return nil
}

// End returns the Away ended at now (household zone): the Member is back from the next Meal Slot.
func End(a Away, now time.Time, slots []Slot) (Away, error) { return Away{}, nil }

// Meal is one Meal Slot occurrence an Away covers, with its portions without and with the Away.
type Meal struct {
	Date         string
	MealSlotID   int64
	MealSlotName string
	Time         string
	Before       float64
	After        float64
}

// Changed says whether the Away changes the portions of the Meal Slot.
func (m Meal) Changed() bool { return false }

// DayRow is one day of a Summary.
type DayRow struct {
	Date  string
	Meals []Meal
}

// Summary is what an Away changes, by day.
type Summary struct {
	SlotsWithout int
	MealsChanged int
	Days         []DayRow
}

// Summarise groups the covered Meal Slots by day (dates ascending, each day's slots by time).
func Summarise(meals []Meal) Summary { return Summary{} }
