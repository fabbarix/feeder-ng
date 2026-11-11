package store

import (
	"context"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// Course Attendance in the store (crs-plan §1.1). The three opt-out tables hang off meal_slots,
// courses and members only, never off meal_slot_courses, so deleting and reinserting a slot's
// meal_slot_courses (a reorder, a batch edit) keeps every opt-out. The same transaction that saves a
// slot's Courses deletes the opt-outs, usual and per date, of every Course no longer on that slot, and
// that Course's unresolved Planned Meals from today on, Slot Rules and Couldn't plan reasons.
//
// Stubs of team A's design step (docs/dev/design/crs-a.md).

var errNotImplemented = errors.New("household/store: not implemented")

// CoursesOn returns the slot's Courses on one date, in the slot's order, each with its effective
// Course Attendance (household.CourseAttendance over DateAttendance). household.ErrNotFound for an
// unknown slot.
func (s *Store) CoursesOn(ctx context.Context, slotID int64, date string) ([]household.CourseDay, error) {
	return nil, errNotImplemented
}

// SetDateCourseOptOuts sets (memberIDs non-nil, empty list included: "everyone eats it") or drops
// (nil: back to the usual opt-outs) the date's own opt-outs for one Course of the slot. It does not
// touch the slot's date Attendance. household.ErrNotFound (slot), household.ErrCourseNotInSlot,
// household.ErrUnknownMember. Repeated Members are dropped; a Member who does not attend is accepted.
func (s *Store) SetDateCourseOptOuts(ctx context.Context, slotID int64, date string, courseID int64, memberIDs *[]int64) error {
	return errNotImplemented
}
