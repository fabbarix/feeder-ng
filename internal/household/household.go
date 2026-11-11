// Package household holds the pure rules of the Household: settings, Members,
// Meal Slots, Attendance, portions and per-User preferences. It has no HTTP or
// SQL concerns; the store and httpapi sub-packages wrap it.
package household

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	_ "time/tzdata" // zone names validate on minimal images
	"unicode/utf8"
)

var (
	ErrNotFound          = errors.New("household: not found")
	ErrUserLinked        = errors.New("household: user already linked to a member")
	ErrDuplicateSlot     = errors.New("household: a Meal Slot with that name already exists on that weekday")
	ErrUnknownMember     = errors.New("household: unknown member")
	ErrDuplicateAttendee = errors.New("household: member listed twice in an Attendance")
	ErrEmailTaken        = errors.New("household: that e-mail address is already in use")
	ErrWeekdayMismatch   = errors.New("household: date is not on the Meal Slot's weekday")
)

// ValidationError names the offending JSON field.
type ValidationError struct{ Field, Message string }

func (e *ValidationError) Error() string { return fmt.Sprintf("%s: %s", e.Field, e.Message) }

// fieldError is shorthand for a ValidationError on field.
func fieldError(field, message string) error { return &ValidationError{Field: field, Message: message} }

var (
	hexColour   = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	clockTime   = regexp.MustCompile(`^([01][0-9]|2[0-3]):[0-5][0-9]$`)
	currencyISO = regexp.MustCompile(`^[A-Z]{3}$`)
)

// validHex reports whether s is a #rrggbb colour.
func validHex(s string) bool { return hexColour.MatchString(s) }

// minutesOf converts a valid "HH:MM" to minutes after midnight.
func minutesOf(hhmm string) int {
	var h, m int
	fmt.Sscanf(hhmm, "%d:%d", &h, &m)
	return h*60 + m
}

// validTimeOfDay reports whether s is a 24-hour "HH:MM" time.
func validTimeOfDay(s string) bool { return clockTime.MatchString(s) }

// validZone reports whether name is an IANA zone (not the ambiguous "Local").
func validZone(name string) bool {
	if name == "" || name == "Local" {
		return false
	}
	_, err := time.LoadLocation(name)
	return err == nil
}

// nameLength is the rune count of a trimmed name, for the 1-50 rule.
func nameLength(s string) int { return utf8.RuneCountInString(strings.TrimSpace(s)) }
