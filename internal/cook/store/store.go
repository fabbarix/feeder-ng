// Package store is the SQL repository for Cook Mode timers and Advance Step marks.
package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/cook"
)

// ErrNotFound is returned when a timer does not exist.
var ErrNotFound = errors.New("not found")

// Store reads and writes cook_timers and advance_step_marks.
type Store struct{ db *sql.DB }

// New returns a Store over d.
func New(d *sql.DB) *Store { return &Store{db: d} }

// InsertTimer stores t (its ID is ignored) and returns it with the new ID. A
// second timer for the same (scope, step) returns ErrDuplicateStep.
func (s *Store) InsertTimer(ctx context.Context, t cook.Timer) (cook.Timer, error) {
	panic("TODO")
}

// ErrDuplicateStep is returned by InsertTimer when the scope and Step already have a timer.
var ErrDuplicateStep = errors.New("a timer for this Step already exists")

// Timer returns one timer (ErrNotFound).
func (s *Store) Timer(ctx context.Context, id int64) (cook.Timer, error) { panic("TODO") }

// Timers lists the timers of a scope ("" = every timer), ordered by ID.
func (s *Store) Timers(ctx context.Context, scope cook.Scope) ([]cook.Timer, error) {
	panic("TODO")
}

// StepTimer returns the timer of a (scope, Step) if there is one.
func (s *Store) StepTimer(ctx context.Context, scope cook.Scope, step int) (cook.Timer, bool, error) {
	panic("TODO")
}

// SaveTimer writes state, ends_at and remaining_ms of an existing timer (ErrNotFound).
func (s *Store) SaveTimer(ctx context.Context, t cook.Timer) error { panic("TODO") }

// DeleteTimer removes a timer (ErrNotFound).
func (s *Store) DeleteTimer(ctx context.Context, id int64) error { panic("TODO") }

// SetMark marks (done) or unmarks a Step of a scope. Marking twice keeps the first time.
func (s *Store) SetMark(ctx context.Context, scope cook.Scope, step int, done bool, at time.Time) error {
	panic("TODO")
}

// Marks returns the done time of every marked Step of a scope.
func (s *Store) Marks(ctx context.Context, scope cook.Scope) (map[int]time.Time, error) {
	panic("TODO")
}

// PurgeOlderThan deletes marks made, and timers that ended or started, before t.
// Running and paused timers are kept. It returns how many rows it removed.
func (s *Store) PurgeOlderThan(ctx context.Context, t time.Time) (int, error) { panic("TODO") }
