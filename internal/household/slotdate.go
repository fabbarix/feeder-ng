package household

import (
	"errors"
	"fmt"
)

// A Meal Slot on one date (ADR 0014; docs/dev/design/b5-sd.md). The pure rules: the date's own time, Not served, Guests.

// MaxGuests is the most Guests one Meal Slot may have on a date.
const MaxGuests = 20

// SlotDate is the per-date row of a Meal Slot (table meal_slot_dates). The zero value besides SlotID and Date is the
// default: served, at the usual time, no Guests. The repository deletes a row that is back to the default.
type SlotDate struct {
	SlotID    int64
	Date      string // YYYY-MM-DD, household date
	NotServed bool   // the User marked the date Not served, or saved Who's eating with no Member and no Guest
	Time      string // HH:MM, the date's own time; "" = the usual time
	Guests    int    // 0 to MaxGuests
}

// IsDefault reports whether the row says nothing (and so is not stored).
func (d SlotDate) IsDefault() bool {
	return !d.NotServed && d.Time == "" && d.Guests == 0
}

// EffectiveTime is the time the slot is served at on that date: the date's own time when set, else the usual time.
// Nothing else computes an effective time (the planner walk, Advance Step lead-time, Start cooking, Confirm Cooked,
// To confirm, the cooking timeline, the board, Today and the Shopping List attribution all call it).
func EffectiveTime(usual string, row SlotDate) string {
	if row.Time != "" {
		return row.Time
	}
	return usual
}

// IsNotServed says whether the Meal Slot is Not served on the date: the row says so, or the date has its own
// Attendance (an override, possibly empty) with no Member and the row has no Guest (U1: an emptied date is Not
// served). A date without an override is never emptied: a slot whose usual Attendance is empty stays Couldn't plan
// (Nobody attends), and a date with Guests and no Member is served (U3).
func IsNotServed(row SlotDate, override []Attendee, hasOverride bool) bool {
	if row.NotServed {
		return true
	}
	return hasOverride && len(override) == 0 && row.Guests == 0
}

// EmptiesDate says whether saving this Who's eating (the Members of the date, the Guests) empties the date: no
// Member and no Guest. The store then saves the date as Not served.
func EmptiesDate(members []Attendee, guests int) bool {
	return len(members) == 0 && guests == 0
}

// PortionsWithGuests is PortionsNeeded plus one standard portion (Portion Factor 1) per Guest.
func PortionsWithGuests(members []Member, attendance []Attendee, guests int) (float64, error) {
	total, err := PortionsNeeded(members, attendance)
	if err != nil {
		return 0, err
	}
	return total + float64(guests), nil
}

// ValidateGuests checks 0 <= guests <= MaxGuests. The error is a *ValidationError on field "guests" with Reason
// "guests_invalid".
func ValidateGuests(guests int) error {
	if guests < 0 || guests > MaxGuests {
		return &ValidationError{Field: "guests", Message: fmt.Sprintf("must be between 0 and %d", MaxGuests), Reason: "guests_invalid"}
	}
	return nil
}

// ValidateSlotTime checks a date's own time is a 24-hour HH:MM time. The error is a *ValidationError on field "time"
// with Reason "time_invalid". The empty string is valid: it means the usual time.
func ValidateSlotTime(hhmm string) error {
	if hhmm == "" || validTimeOfDay(hhmm) {
		return nil
	}
	return &ValidationError{Field: "time", Message: "must be a 24-hour HH:MM time", Reason: "time_invalid"}
}

// ValidateNotServedChange checks whether the date may be marked Not served: only from today on (Reason "date_past")
// and only while no Course of the slot is Cooked or Not cooked (Reason "slot_started"; U2). Marking it served again is
// always allowed and is not checked. Both errors are *ValidationError on field "notServed".
func ValidateNotServedChange(date, today string, started bool) error {
	if date < today {
		return &ValidationError{Field: "notServed", Message: "a date in the past cannot be marked Not served", Reason: "date_past"}
	}
	if started {
		return &ValidationError{Field: "notServed", Message: "a Course of this Meal Slot is already Cooked or Not cooked", Reason: "slot_started"}
	}
	return nil
}

// WhoIsEating is what saving "Who's eating" for one date changes: nil leaves that part as it is. Members is the
// date's own Attendance (an empty non-nil list is "nobody", a deliberate choice, spec §3); Guests is 0 to MaxGuests.
type WhoIsEating struct {
	Members *[]Attendee
	Guests  *int
}

// ErrSlotStarted is refused emptying Who's eating on a Meal Slot that has started on the date: a Course is Cooked or
// Not cooked (409 slot_started; PM decision, the same reason as Not served, U2).
var ErrSlotStarted = errors.New("household: a Course of this Meal Slot is already Cooked or Not cooked on that date")

// UnresolvedMeal is an unresolved Planned Meal (state planned) of a Meal Slot on a date: what Not served removes,
// Pinned ones included. Bought is not known here (team BO); the API answers an empty list.
type UnresolvedMeal struct {
	CourseID   int64
	CourseName string
	RecipeName string
	Pinned     bool
}
