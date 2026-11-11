// Package store is the SQLite repository for Courses (migration 1400_courses.sql). It enforces
// the rules of internal/course and, for Delete and Archive, does the whole change in one
// transaction: the Course lists of Recipes and Meal Slots, the opt-outs, Slot Rules, unresolved
// Planned Meals and Couldn't plan reasons.
//
// Stubs of team A's design step (docs/dev/design/crs-a.md): every method returns
// course.ErrNotImplemented until the developer step fills it in.
package store

import (
	"context"
	"database/sql"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/course"
)

// Store is the Course repository. "Today" for "unresolved Planned Meals from today on" is the
// clock's now in the Household's time zone (household_settings.time_zone).
type Store struct {
	db  *sql.DB
	clk clock.Clock
}

// New returns a Store over an open, migrated database.
func New(d *sql.DB, clk clock.Clock) *Store { return &Store{db: d, clk: clk} }

// List returns the Courses in household order (position, then id) with their counts. Archived
// ones are listed only when includeArchived.
func (s *Store) List(ctx context.Context, includeArchived bool) ([]course.Listing, error) {
	return nil, course.ErrNotImplemented
}

// Get returns one Course of any state; course.ErrNotFound.
func (s *Store) Get(ctx context.Context, id int64) (course.Course, error) {
	return course.Course{}, course.ErrNotImplemented
}

// Main returns the id of the main Course.
func (s *Store) Main(ctx context.Context) (int64, error) { return 0, course.ErrNotImplemented }

// Create adds a Course last in the order. course.ErrNameInvalid, ErrNameTaken (name_key clash
// with any Course, archived ones included), ErrTooMany (20 active).
func (s *Store) Create(ctx context.Context, name string) (course.Course, error) {
	return course.Course{}, course.ErrNotImplemented
}

// Rename changes the name and name_key; every reference points at the id so nothing else changes.
// A Course may be renamed to a different spelling of its own name. ErrNotFound, ErrNameInvalid, ErrNameTaken.
func (s *Store) Rename(ctx context.Context, id int64, name string) (course.Course, error) {
	return course.Course{}, course.ErrNotImplemented
}

// MakeMain moves the main flag to id in one transaction (the old main is cleared first, so the
// partial unique index never sees two). ErrNotFound, ErrArchived. Making the main Course main is a no-op.
func (s *Store) MakeMain(ctx context.Context, id int64) (course.Course, error) {
	return course.Course{}, course.ErrNotImplemented
}

// Reorder sets the household order of the active Courses: ids must list each active Course once
// (course.ErrOrder otherwise). Archived Courses keep their positions out of the way (after the active ones).
func (s *Store) Reorder(ctx context.Context, ids []int64) error { return course.ErrNotImplemented }

// Impact says what Delete or Archive of id would change. ErrNotFound.
func (s *Store) Impact(ctx context.Context, id int64) (course.Impact, error) {
	return course.Impact{}, course.ErrNotImplemented
}

// Delete removes a Course that was never planned, for good, with the same transaction as Archive:
// replacement Course for the Recipes and Meal Slots that would be left with none, the Course taken
// off the others, its opt-outs (usual and per date), its Slot Rules and unresolved Planned Meals
// from today on removed. replacementID 0 means none given (fine when nothing is left without a
// Course). Errors: ErrNotFound, ErrMain, ErrLast, ErrPlanned, ErrReplacement. It returns the Impact it applied.
func (s *Store) Delete(ctx context.Context, id, replacementID int64) (course.Impact, error) {
	return course.Impact{}, course.ErrNotImplemented
}

// Archive does the same for any Course (planned ones included) but keeps the row, with archived = 1,
// and keeps Cooked, Not cooked and past Planned Meals, Leftovers and their Course. Errors as Delete
// except ErrPlanned.
func (s *Store) Archive(ctx context.Context, id, replacementID int64) (course.Course, course.Impact, error) {
	return course.Course{}, course.Impact{}, course.ErrNotImplemented
}

// Unarchive puts an archived Course back last in the order, without restoring it to any Recipe or
// Meal Slot. ErrNotFound, ErrTooMany. Unarchiving an active Course is a no-op.
func (s *Store) Unarchive(ctx context.Context, id int64) (course.Course, error) {
	return course.Course{}, course.ErrNotImplemented
}
