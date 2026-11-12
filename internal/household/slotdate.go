package household

// A Meal Slot on one date (ADR 0014; docs/dev/design/b5-sd.md). The pure rules: the date's own time, Not served, Guests.
// TEST-FIRST STUBS (team B5-SD, designer): the bodies below are placeholders that compile and fail the tests in
// slotdate_test.go; the developer replaces them.

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
	return false // stub
}

// EffectiveTime is the time the slot is served at on that date: the date's own time when set, else the usual time.
// Nothing else computes an effective time (the planner walk, Advance Step lead-time, Start cooking, Confirm Cooked,
// To confirm, the cooking timeline, the board, Today and the Shopping List attribution all call it).
func EffectiveTime(usual string, row SlotDate) string {
	return usual // stub
}

// IsNotServed says whether the Meal Slot is Not served on the date: the row says so, or the date has its own
// Attendance (an override, possibly empty) with no Member and the row has no Guest (U1: an emptied date is Not
// served). A date without an override is never emptied: a slot whose usual Attendance is empty stays Couldn't plan
// (Nobody attends), and a date with Guests and no Member is served (U3).
func IsNotServed(row SlotDate, override []Attendee, hasOverride bool) bool {
	return row.NotServed // stub
}

// EmptiesDate says whether saving this Who's eating (the Members of the date, the Guests) empties the date: no
// Member and no Guest. The store then saves the date as Not served.
func EmptiesDate(members []Attendee, guests int) bool {
	return false // stub
}

// PortionsWithGuests is PortionsNeeded plus one standard portion (Portion Factor 1) per Guest.
func PortionsWithGuests(members []Member, attendance []Attendee, guests int) (float64, error) {
	return PortionsNeeded(members, attendance) // stub: ignores the Guests
}

// ValidateGuests checks 0 <= guests <= MaxGuests. The error is a *ValidationError on field "guests" with Reason
// "guests_invalid".
func ValidateGuests(guests int) error {
	return nil // stub
}

// ValidateSlotTime checks a date's own time is a 24-hour HH:MM time. The error is a *ValidationError on field "time"
// with Reason "time_invalid". The empty string is valid: it means the usual time.
func ValidateSlotTime(hhmm string) error {
	return nil // stub
}

// ValidateNotServedChange checks whether the date may be marked Not served: only from today on (Reason "date_past")
// and only while no Course of the slot is Cooked or Not cooked (Reason "slot_started"; U2). Marking it served again is
// always allowed and is not checked. Both errors are *ValidationError on field "notServed".
func ValidateNotServedChange(date, today string, started bool) error {
	return nil // stub
}

// WhoIsEating is what saving "Who's eating" for one date changes: nil leaves that part as it is. Members is the
// date's own Attendance (an empty non-nil list is "nobody", a deliberate choice, spec §3); Guests is 0 to MaxGuests.
type WhoIsEating struct {
	Members *[]Attendee
	Guests  *int
}
