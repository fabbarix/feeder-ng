package store

import (
	"context"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// A Meal Slot on one date (table meal_slot_dates, migration 1500; docs/dev/design/b5-sd.md).
// TEST-FIRST STUBS (team B5-SD, designer): the developer implements them; slotdate_test.go is red until then.

var errSlotDateTodo = errors.New("household store: slot dates are not implemented yet")

// SlotDate returns the per-date row of the Meal Slot, or the default row (SlotID and Date set, nothing else) when
// there is none. household.ErrNotFound for an unknown Meal Slot.
func (s *Store) SlotDate(ctx context.Context, slotID int64, date string) (household.SlotDate, error) {
	return household.SlotDate{}, errSlotDateTodo
}

// SaveSlotDate stores the row (updated_at = now). A row that IsDefault is deleted instead (idempotent).
// household.ErrNotFound for an unknown Meal Slot.
func (s *Store) SaveSlotDate(ctx context.Context, row household.SlotDate) error {
	return errSlotDateTodo
}

// SaveWhoIsEating saves "Who's eating" for the date in one transaction: the date's Members (SetDateAttendance) when
// in.Members is set, and the Guests when in.Guests is set. When in.Members is set and EmptiesDate(*in.Members, the
// date's Guests after this save) is true, the date is also saved Not served (U1). A save that leaves Members as they
// are never changes Not served. Course opt-outs are written separately (SetDateCourseOptOuts).
func (s *Store) SaveWhoIsEating(ctx context.Context, slotID int64, date string, in household.WhoIsEating) error {
	return errSlotDateTodo
}

// ServeAgain clears Not served for the date ("Plan Dinner again"). When the date's own Attendance is an empty
// override and the date has no Guest (an emptied date), the override is removed too, so the usual Attendance applies
// again; otherwise the date's Members and Guests are left as they are.
func (s *Store) ServeAgain(ctx context.Context, slotID int64, date string) error {
	return errSlotDateTodo
}
