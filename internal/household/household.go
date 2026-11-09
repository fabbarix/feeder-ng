// Package household holds the pure rules of the Household: settings, Members,
// Meal Slots, Attendance, portions and per-User preferences. It has no HTTP or
// SQL concerns; the store and httpapi sub-packages wrap it.
package household

import (
	"errors"
	"fmt"
	_ "time/tzdata" // zone names validate on minimal images
)

var (
	ErrNotFound          = errors.New("household: not found")
	ErrUserLinked        = errors.New("household: user already linked to a member")
	ErrDuplicateSlot     = errors.New("household: a Meal Slot with that name already exists on that weekday")
	ErrUnknownMember     = errors.New("household: unknown member")
	ErrDuplicateAttendee = errors.New("household: member listed twice in an Attendance")
	ErrWeekdayMismatch   = errors.New("household: date is not on the Meal Slot's weekday")
)

// ValidationError names the offending JSON field.
type ValidationError struct{ Field, Message string }

func (e *ValidationError) Error() string { return fmt.Sprintf("%s: %s", e.Field, e.Message) }

func notImplemented() { panic("household: not implemented") }

// QuietHours is a daily window of "HH:MM" clock times that may wrap midnight.
type QuietHours struct{ Start, End string }

// Location is a city name or coordinates (never both).
type Location struct {
	City      string
	Latitude  *float64
	Longitude *float64
}

// Settings are the Household's settings (spec §3).
type Settings struct {
	TimeZone                 string
	TimeZoneConfigured       bool
	PlanningHorizonDays      int
	DefaultCooldownDays      int
	DefaultLeftoverUseByDays int
	QuietHours               QuietHours
	PlannerStyle             float64 // 0 = Use what we have, 0.5 = Variety, 1 = Favourites
	Location                 *Location
	Currency                 string
}

func DefaultSettings(timeZone string) Settings { notImplemented(); return Settings{} }
func (s Settings) Validate() error             { notImplemented(); return nil }
func (s Settings) Normalized() Settings        { notImplemented(); return s }

// Contains reports whether the "HH:MM" time falls in the window: start
// inclusive, end exclusive, wrapping midnight.
func (q QuietHours) Contains(hhmm string) bool { notImplemented(); return false }

// Member is a person who eats from the plan.
type Member struct {
	ID            int64
	Name          string
	Colour        string // #rrggbb
	Avatar        string // optional short text, e.g. an emoji
	PortionFactor float64
	UserID        *int64
}

// MemberInput is what an Admin supplies to create or change a Member.
type MemberInput struct {
	Name          string
	Colour        string
	Avatar        string
	PortionFactor float64
}

func ValidatePortionFactor(f float64) error { notImplemented(); return nil }
func (m MemberInput) Validate() error       { notImplemented(); return nil }

// Attendee is one Member at a Meal Slot, with an optional Portion Factor override.
type Attendee struct {
	MemberID              int64
	PortionFactorOverride *float64
}

// MealSlot is a named eating occasion on one weekday (ISO: 1 Monday .. 7 Sunday).
type MealSlot struct {
	ID         int64
	Weekday    int
	Name       string
	Time       string // HH:MM, household time
	Attendance []Attendee
}

// MealSlotInput is what an Admin supplies to create or replace a Meal Slot.
type MealSlotInput struct {
	Weekday    int
	Name       string
	Time       string
	Attendance []Attendee
}

func (m MealSlotInput) Validate() error { notImplemented(); return nil }

// WeekdayOf returns the ISO weekday (1 Monday .. 7 Sunday) of a YYYY-MM-DD date.
func WeekdayOf(date string) (int, error) { notImplemented(); return 0, nil }

// ValidateAttendanceDate checks date is a valid date on the given weekday.
func ValidateAttendanceDate(weekday int, date string) error { notImplemented(); return nil }

// ResolveAttendance returns the override when one exists (even an empty one),
// otherwise the usual Attendance.
func ResolveAttendance(usual, override []Attendee, hasOverride bool) []Attendee {
	notImplemented()
	return nil
}

// EffectiveFactor is the override when set, else the Member's default Portion Factor.
func EffectiveFactor(m Member, a Attendee) float64 { notImplemented(); return 0 }

// PortionsNeeded sums the effective Portion Factors of the attending Members.
func PortionsNeeded(members []Member, attendance []Attendee) (float64, error) {
	notImplemented()
	return 0, nil
}

// Preferences are one User's display preferences (spec §14).
type Preferences struct {
	Scheme    string  // light | dark | system
	Accent    string  // #rrggbb
	Secondary *string // #rrggbb, optional
	Units     string  // metric | imperial
}

func DefaultPreferences() Preferences { notImplemented(); return Preferences{} }
func (p Preferences) Validate() error { notImplemented(); return nil }
