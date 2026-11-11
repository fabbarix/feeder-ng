// Package store is the SQL repository for Cook Mode timers and Advance Step marks.
package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/cook"
)

// ErrNotFound is returned when a timer does not exist.
var ErrNotFound = errors.New("not found")

// ErrDuplicateStep is returned by InsertTimer when the scope and Step already have a timer.
var ErrDuplicateStep = errors.New("a timer for this Step already exists")

// timeLayout stores instants as fixed-width UTC text, so they sort as strings.
const timeLayout = "2006-01-02T15:04:05.000Z"

// Store reads and writes cook_timers and advance_step_marks.
type Store struct{ db *sql.DB }

// New returns a Store over d.
func New(d *sql.DB) *Store { return &Store{db: d} }

// InsertTimer stores t (its ID is ignored) and returns it with the new ID. A
// second timer for the same (scope, Step) returns ErrDuplicateStep.
func (s *Store) InsertTimer(ctx context.Context, t cook.Timer) (cook.Timer, error) {
	stored, err := s.storedScope(ctx, t.Scope)
	if err != nil {
		return cook.Timer{}, err
	}
	res, err := s.db.ExecContext(ctx, `INSERT INTO cook_timers
		(scope, step, label, duration_seconds, state, started_at, ends_at, remaining_ms)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		nullScope(stored), nullStep(t.Step), t.Label, t.DurationSeconds, string(t.State),
		fmtTime(t.StartedAt), fmtTime(t.EndsAt), t.RemainingMs)
	if err != nil {
		if isDuplicate(err) {
			return cook.Timer{}, ErrDuplicateStep
		}
		return cook.Timer{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return cook.Timer{}, err
	}
	t.ID = id
	main, err := s.mainID(ctx)
	if err != nil {
		return cook.Timer{}, err
	}
	t.Scope = callerScope(stored, main)
	return t, nil
}

// Timer returns one timer (ErrNotFound).
func (s *Store) Timer(ctx context.Context, id int64) (cook.Timer, error) {
	row := s.db.QueryRowContext(ctx, timerSelect+" WHERE id = ?", id)
	t, err := scanTimer(row)
	if errors.Is(err, sql.ErrNoRows) {
		return cook.Timer{}, ErrNotFound
	}
	if err != nil {
		return cook.Timer{}, err
	}
	main, err := s.mainID(ctx)
	if err != nil {
		return cook.Timer{}, err
	}
	t.Scope = callerScope(t.Scope, main)
	return t, nil
}

// Timers lists the timers of a scope ("" = every timer), ordered by ID.
func (s *Store) Timers(ctx context.Context, scope cook.Scope) ([]cook.Timer, error) {
	q, args := timerSelect, []any{}
	if scope != "" {
		stored, err := s.storedScope(ctx, scope)
		if err != nil {
			return nil, err
		}
		q += " WHERE scope = ?"
		args = append(args, string(stored))
	}
	main, err := s.mainID(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, q+" ORDER BY id", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []cook.Timer
	for rows.Next() {
		t, err := scanTimer(rows)
		if err != nil {
			return nil, err
		}
		t.Scope = callerScope(t.Scope, main)
		out = append(out, t)
	}
	return out, rows.Err()
}

// StepTimer returns the timer of a (scope, Step) if there is one.
func (s *Store) StepTimer(ctx context.Context, scope cook.Scope, step int) (cook.Timer, bool, error) {
	stored, err := s.storedScope(ctx, scope)
	if err != nil {
		return cook.Timer{}, false, err
	}
	row := s.db.QueryRowContext(ctx, timerSelect+" WHERE scope = ? AND step = ?", string(stored), step)
	t, err := scanTimer(row)
	if errors.Is(err, sql.ErrNoRows) {
		return cook.Timer{}, false, nil
	}
	if err != nil {
		return cook.Timer{}, false, err
	}
	main, err := s.mainID(ctx)
	if err != nil {
		return cook.Timer{}, false, err
	}
	t.Scope = callerScope(t.Scope, main)
	return t, true, nil
}

// SaveTimer writes state, ends_at and remaining_ms of an existing timer (ErrNotFound).
func (s *Store) SaveTimer(ctx context.Context, t cook.Timer) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE cook_timers SET state = ?, ends_at = ?, remaining_ms = ? WHERE id = ?`,
		string(t.State), fmtTime(t.EndsAt), t.RemainingMs, t.ID)
	if err != nil {
		return err
	}
	return affectedOrNotFound(res)
}

// FinishTimer marks a running timer finished with one conditional update
// (state = 'finished' WHERE id = ? AND state = 'running') and reports whether
// exactly one row changed. It is false, with no error, when the timer is no
// longer running (somebody else finished, paused or cancelled it first).
func (s *Store) FinishTimer(ctx context.Context, id int64) (bool, error) {
	res, err := s.db.ExecContext(ctx,
		`UPDATE cook_timers SET state = 'finished' WHERE id = ? AND state = 'running'`, id)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n == 1, nil
}

// DeleteTimer removes a timer (ErrNotFound).
func (s *Store) DeleteTimer(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM cook_timers WHERE id = ?`, id)
	if err != nil {
		return err
	}
	return affectedOrNotFound(res)
}

// SetMark marks (done) or unmarks a Step of a scope. Marking twice keeps the first time.
func (s *Store) SetMark(ctx context.Context, scope cook.Scope, step int, done bool, at time.Time) error {
	stored, err := s.storedScope(ctx, scope)
	if err != nil {
		return err
	}
	if !done {
		_, err := s.db.ExecContext(ctx, `DELETE FROM advance_step_marks WHERE scope = ? AND step = ?`, string(stored), step)
		return err
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO advance_step_marks (scope, step, done_at) VALUES (?, ?, ?)
		 ON CONFLICT (scope, step) DO NOTHING`,
		string(stored), step, fmtTime(at))
	return err
}

// Marks returns the done time of every marked Step of a scope.
func (s *Store) Marks(ctx context.Context, scope cook.Scope) (map[int]time.Time, error) {
	stored, err := s.storedScope(ctx, scope)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT step, done_at FROM advance_step_marks WHERE scope = ?`, string(stored))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int]time.Time{}
	for rows.Next() {
		var step int
		var doneAt string
		if err := rows.Scan(&step, &doneAt); err != nil {
			return nil, err
		}
		out[step] = parseTime(doneAt)
	}
	return out, rows.Err()
}

// PurgeOlderThan deletes marks made, and timers that ended or started, before t.
// Running and paused timers are kept. It returns how many rows it removed.
func (s *Store) PurgeOlderThan(ctx context.Context, t time.Time) (int, error) {
	cutoff := fmtTime(t)
	marks, err := s.db.ExecContext(ctx, `DELETE FROM advance_step_marks WHERE done_at < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	timers, err := s.db.ExecContext(ctx, `DELETE FROM cook_timers WHERE state = 'finished' AND ends_at < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	m, _ := marks.RowsAffected()
	n, _ := timers.RowsAffected()
	return int(m + n), nil
}

// The cook scope shim (crs-plan §2.2, removed by C3). Until then a two-part Planned Meal scope
// meal:<date>/<slot> means the main Course: a write or lookup maps it to the three-part stored form, and a
// read writes the main Course's scope back two-part, as the current SPA compares scopes as strings. Other
// Courses, Recipe scopes and free timers are untouched.

// mainID is the id of the Course with the main flag.
func (s *Store) mainID(ctx context.Context) (int64, error) {
	var id int64
	err := s.db.QueryRowContext(ctx, `SELECT id FROM courses WHERE is_main = 1`).Scan(&id)
	return id, err
}

// storedScope maps a caller's scope to the stored form (a two-part Planned Meal scope gains the main Course).
func (s *Store) storedScope(ctx context.Context, scope cook.Scope) (cook.Scope, error) {
	p, err := cook.ParseScope(string(scope))
	if err != nil || !p.IsMeal || p.CourseID != 0 {
		return scope, nil
	}
	main, err := s.mainID(ctx)
	if err != nil {
		return "", err
	}
	return cook.MealScope(p.Date, p.MealSlotID, main), nil
}

// callerScope maps a stored scope to the form callers get: the main Course's Planned Meal scope is two-part.
func callerScope(stored cook.Scope, main int64) cook.Scope {
	p, err := cook.ParseScope(string(stored))
	if err != nil || !p.IsMeal || p.CourseID != main {
		return stored
	}
	return cook.MealScope(p.Date, p.MealSlotID, 0)
}

const timerSelect = `SELECT id, scope, step, label, duration_seconds, state, started_at, ends_at, remaining_ms FROM cook_timers`

type scanner interface {
	Scan(dest ...any) error
}

func scanTimer(sc scanner) (cook.Timer, error) {
	var (
		t       cook.Timer
		scope   sql.NullString
		step    sql.NullInt64
		state   string
		started string
		ends    string
	)
	err := sc.Scan(&t.ID, &scope, &step, &t.Label, &t.DurationSeconds, &state, &started, &ends, &t.RemainingMs)
	if err != nil {
		return cook.Timer{}, err
	}
	t.Scope = cook.Scope(scope.String)
	if step.Valid {
		v := int(step.Int64)
		t.Step = &v
	}
	t.State = cook.TimerState(state)
	t.StartedAt = parseTime(started)
	t.EndsAt = parseTime(ends)
	return t, nil
}

func nullScope(s cook.Scope) any {
	if s == "" {
		return nil
	}
	return string(s)
}

func nullStep(step *int) any {
	if step == nil {
		return nil
	}
	return *step
}

func fmtTime(t time.Time) string { return t.UTC().Format(timeLayout) }

func parseTime(s string) time.Time {
	t, err := time.Parse(timeLayout, s)
	if err != nil {
		return time.Time{}
	}
	return t
}

func affectedOrNotFound(res sql.Result) error {
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// isDuplicate reports a unique violation on the (scope, step) index.
func isDuplicate(err error) bool {
	return strings.Contains(err.Error(), "UNIQUE constraint failed") && strings.Contains(err.Error(), "cook_timers.step")
}
