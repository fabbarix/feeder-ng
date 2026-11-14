// Package store is the SQLite repository of Away (table member_away, migration 1577; B9-24, PC-08, ADR 0025). Every
// read and write takes a Querier, so the planning Runner reads an Away inside the write that changes it.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/away"
	"github.com/fabbarix/feeder-ng/internal/household"
)

// Querier is satisfied by *sql.DB and *sql.Tx.
type Querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// ErrNotFound is an unknown Away or Member.
var ErrNotFound = errors.New("away: not found")

const columns = `id, member_id, from_date, COALESCE(from_slot_id, 0), COALESCE(through_date, ''), COALESCE(through_slot_id, 0), applies_from`

// Zone is the household time zone (UTC when unset or unknown).
func Zone(ctx context.Context, q Querier) (*time.Location, error) {
	var tz string
	err := q.QueryRowContext(ctx, `SELECT time_zone FROM household_settings WHERE id = 1`).Scan(&tz)
	if errors.Is(err, sql.ErrNoRows) {
		return time.UTC, nil
	}
	if err != nil {
		return nil, err
	}
	if l, lerr := time.LoadLocation(tz); lerr == nil {
		return l, nil
	}
	return time.UTC, nil
}

// HorizonDays is the Planning Horizon in days.
func HorizonDays(ctx context.Context, q Querier) (int, error) {
	var n int
	err := q.QueryRowContext(ctx, `SELECT planning_horizon_days FROM household_settings WHERE id = 1`).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return 7, nil
	}
	return n, err
}

// SlotsOf is the active Meal Slots (household store Slots) as an Away sees them: their usual time orders a day's Meal
// Slots; the effective time of a date is the caller's (household.EffectiveTime).
func SlotsOf(ms []household.MealSlot) []away.Slot {
	out := make([]away.Slot, 0, len(ms))
	for _, m := range ms {
		out = append(out, away.Slot{ID: m.ID, Weekday: m.Weekday, Time: m.Time})
	}
	return out
}

// MemberName is the Member's name; ErrNotFound for an unknown (or removed) Member.
func MemberName(ctx context.Context, q Querier, id int64) (string, error) {
	var name string
	err := q.QueryRowContext(ctx, `SELECT name FROM members WHERE id = ?`, id).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return name, err
}

// MemberNames maps every Member's id to their name.
func MemberNames(ctx context.Context, q Querier) (map[int64]string, error) {
	rows, err := q.QueryContext(ctx, `SELECT id, name FROM members`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]string{}
	for rows.Next() {
		var (
			id   int64
			name string
		)
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		out[id] = name
	}
	return out, rows.Err()
}

func scan(r interface{ Scan(...any) error }, loc *time.Location) (away.Away, error) {
	var (
		a     away.Away
		since string
	)
	if err := r.Scan(&a.ID, &a.MemberID, &a.From, &a.FromSlot, &a.Through, &a.ThroughSlot, &since); err != nil {
		return away.Away{}, err
	}
	if since != "" {
		if t, err := time.Parse(time.RFC3339, since); err == nil {
			a.Since = t.In(loc)
		}
	}
	return a, nil
}

func list(ctx context.Context, q Querier, loc *time.Location, where string, args ...any) ([]away.Away, error) {
	rows, err := q.QueryContext(ctx, `SELECT `+columns+` FROM member_away `+where+` ORDER BY from_date, COALESCE(from_slot_id, 0), id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []away.Away{}
	for rows.Next() {
		a, err := scan(rows, loc)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// All lists every Away, soonest first, with Since in loc.
func All(ctx context.Context, q Querier, loc *time.Location) ([]away.Away, error) {
	return list(ctx, q, loc, ``)
}

// OfMember lists the Member's Aways, soonest first.
func OfMember(ctx context.Context, q Querier, loc *time.Location, memberID int64) ([]away.Away, error) {
	return list(ctx, q, loc, `WHERE member_id = ?`, memberID)
}

// Get reads one Away; ErrNotFound for an unknown one.
func Get(ctx context.Context, q Querier, loc *time.Location, id int64) (away.Away, error) {
	a, err := scan(q.QueryRowContext(ctx, `SELECT `+columns+` FROM member_away WHERE id = ?`, id), loc)
	if errors.Is(err, sql.ErrNoRows) {
		return away.Away{}, ErrNotFound
	}
	return a, err
}

func nullDate(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullID(id int64) any {
	if id == 0 {
		return nil
	}
	return id
}

func stamp(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Truncate(time.Second).Format(time.RFC3339)
}

// Insert stores a new Away and returns its id.
func Insert(ctx context.Context, q Querier, a away.Away) (int64, error) {
	res, err := q.ExecContext(ctx, `INSERT INTO member_away (member_id, from_date, from_slot_id, through_date, through_slot_id, applies_from)
		VALUES (?, ?, ?, ?, ?, ?)`, a.MemberID, a.From, nullID(a.FromSlot), nullDate(a.Through), nullID(a.ThroughSlot), stamp(a.Since))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// Update stores the Away's dates, Meal Slots and Since; ErrNotFound for an unknown one.
func Update(ctx context.Context, q Querier, a away.Away) error {
	res, err := q.ExecContext(ctx, `UPDATE member_away SET from_date = ?, from_slot_id = ?, through_date = ?, through_slot_id = ?,
		applies_from = ? WHERE id = ?`, a.From, nullID(a.FromSlot), nullDate(a.Through), nullID(a.ThroughSlot), stamp(a.Since), a.ID)
	if err != nil {
		return err
	}
	return one(res)
}

// Delete removes the Away; ErrNotFound for an unknown one.
func Delete(ctx context.Context, q Querier, id int64) error {
	res, err := q.ExecContext(ctx, `DELETE FROM member_away WHERE id = ?`, id)
	if err != nil {
		return err
	}
	return one(res)
}

func one(res sql.Result) error {
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// row is a member_away row as an undo token keeps it.
type row struct {
	ID          int64   `json:"id"`
	MemberID    int64   `json:"memberId"`
	From        string  `json:"from"`
	FromSlot    *int64  `json:"fromSlot"`
	Through     *string `json:"through"`
	ThroughSlot *int64  `json:"throughSlot"`
	AppliesFrom string  `json:"appliesFrom"`
	CreatedAt   string  `json:"createdAt"`
}

// Undo is the Away participant of the planning Runner's undo tokens (runner.UndoParticipant): Capture keeps every
// member_away row and Restore puts them back as they were, with the same ids. An Away whose Member is gone meanwhile is
// not put back.
type Undo struct{}

// Capture implements runner.UndoParticipant.
func (Undo) Capture(ctx context.Context, tx *sql.Tx) (json.RawMessage, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id, member_id, from_date, from_slot_id, through_date, through_slot_id, applies_from, created_at
		FROM member_away ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []row{}
	for rows.Next() {
		var (
			r                     row
			fromSlot, throughSlot sql.NullInt64
			through               sql.NullString
		)
		if err := rows.Scan(&r.ID, &r.MemberID, &r.From, &fromSlot, &through, &throughSlot, &r.AppliesFrom, &r.CreatedAt); err != nil {
			return nil, err
		}
		if fromSlot.Valid {
			r.FromSlot = &fromSlot.Int64
		}
		if through.Valid {
			r.Through = &through.String
		}
		if throughSlot.Valid {
			r.ThroughSlot = &throughSlot.Int64
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return json.Marshal(out)
}

// Restore implements runner.UndoParticipant.
func (Undo) Restore(ctx context.Context, tx *sql.Tx, captured json.RawMessage) error {
	var rows []row
	if err := json.Unmarshal(captured, &rows); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM member_away`); err != nil {
		return err
	}
	for _, r := range rows {
		if _, err := tx.ExecContext(ctx, `INSERT INTO member_away
			(id, member_id, from_date, from_slot_id, through_date, through_slot_id, applies_from, created_at)
			SELECT ?, id, ?, ?, ?, ?, ?, ? FROM members WHERE id = ?`,
			r.ID, r.From, r.FromSlot, r.Through, r.ThroughSlot, r.AppliesFrom, r.CreatedAt, r.MemberID); err != nil {
			return err
		}
	}
	return nil
}
