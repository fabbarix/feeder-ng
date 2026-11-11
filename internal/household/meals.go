package household

import (
	"strings"
	"time"
)

// MealSlot is a named eating occasion on one weekday (ISO: 1 Monday .. 7 Sunday).
type MealSlot struct {
	ID         int64
	Weekday    int
	Name       string
	Time       string // HH:MM, household time
	Attendance []Attendee
	Courses    []SlotCourse // the slot's Courses in the slot's order (ADR 0008); never empty once read
}

// MealSlotInput is what an Admin supplies to create or replace a Meal Slot.
type MealSlotInput struct {
	Weekday    int
	Name       string
	Time       string
	Attendance []Attendee
	// Courses in the slot's order. nil: absent (a create gets the main Course, required, nobody opting
	// out; an update keeps the stored Courses and their opt-outs). A non-nil empty list is
	// ReasonCoursesEmpty.
	Courses []SlotCourseInput
}

// Normalized trims the name and drops repeated Courses (the first wins) and repeated opt-out Members
// from Courses. It returns a copy.
func (m MealSlotInput) Normalized() MealSlotInput {
	m.Name = strings.TrimSpace(m.Name)
	m.Courses = NormalizeSlotCourses(m.Courses)
	return m
}

// Validate checks weekday, name, time and the usual Attendance.
func (m MealSlotInput) Validate() error {
	if m.Weekday < 1 || m.Weekday > 7 {
		return fieldError("weekday", "must be 1 (Monday) to 7 (Sunday)")
	}
	if n := nameLength(m.Name); n < 1 || n > 50 {
		return fieldError("name", "must be between 1 and 50 characters")
	}
	if !validTimeOfDay(m.Time) {
		return fieldError("time", "must be an HH:MM time")
	}
	if err := ValidateAttendees(m.Attendance); err != nil {
		return err
	}
	return ValidateSlotCourses(m.Courses)
}

// WeekdayOf returns the ISO weekday (1 Monday .. 7 Sunday) of a YYYY-MM-DD date.
func WeekdayOf(date string) (int, error) {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return 0, fieldError("date", "must be a date such as 2026-11-12")
	}
	if wd := int(t.Weekday()); wd != 0 {
		return wd, nil
	}
	return 7, nil
}

// ValidateAttendanceDate checks date is a valid date on the given weekday.
func ValidateAttendanceDate(weekday int, date string) error {
	wd, err := WeekdayOf(date)
	if err != nil {
		return err
	}
	if wd != weekday {
		return ErrWeekdayMismatch
	}
	return nil
}
