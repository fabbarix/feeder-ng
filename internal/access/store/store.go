// Package store is the SQLite implementation of access.Store (tables access_requests and access_events, migration
// 1200).
package store

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/access"
)

// Store implements access.Store.
type Store struct{ db *sql.DB }

var _ access.Store = (*Store)(nil)

// New returns a Store on db.
func New(db *sql.DB) *Store { return &Store{db: db} }

const reqCols = `id, email, name, picture, requested_at, last_seen_at, expires_at`

func ts(t time.Time) string { return t.UTC().Format(time.RFC3339) }

type scanner interface{ Scan(...any) error }

func scanReq(r scanner) (access.Request, error) {
	var q access.Request
	var req, seen, exp string
	if err := r.Scan(&q.ID, &q.Email, &q.Name, &q.Picture, &req, &seen, &exp); err != nil {
		return access.Request{}, err
	}
	var err error
	if q.RequestedAt, err = time.Parse(time.RFC3339, req); err != nil {
		return q, err
	}
	if q.LastSeenAt, err = time.Parse(time.RFC3339, seen); err != nil {
		return q, err
	}
	q.ExpiresAt, err = time.Parse(time.RFC3339, exp)
	return q, err
}

func (s *Store) one(ctx context.Context, where string, arg any) (access.Request, bool, error) {
	q, err := scanReq(s.db.QueryRowContext(ctx, `SELECT `+reqCols+` FROM access_requests WHERE `+where, arg))
	if errors.Is(err, sql.ErrNoRows) {
		return access.Request{}, false, nil
	}
	return q, err == nil, err
}

func (s *Store) ByEmail(ctx context.Context, email string) (access.Request, bool, error) {
	return s.one(ctx, `email = ?`, email)
}

func (s *Store) ByTokenHash(ctx context.Context, hash string) (access.Request, bool, error) {
	return s.one(ctx, `token_hash = ?`, hash)
}

func (s *Store) ByID(ctx context.Context, id int64) (access.Request, bool, error) {
	return s.one(ctx, `id = ?`, id)
}

func (s *Store) Insert(ctx context.Context, r access.Request, tokenHash string) (access.Request, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO access_requests (email, name, picture, token_hash, requested_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		r.Email, r.Name, r.Picture, tokenHash, ts(r.RequestedAt), ts(r.LastSeenAt), ts(r.ExpiresAt))
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return access.Request{}, access.ErrRequestExists
		}
		return access.Request{}, err
	}
	r.ID, err = res.LastInsertId()
	return r, err
}

func (s *Store) Refresh(ctx context.Context, id int64, name, picture, tokenHash string, seen time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE access_requests SET name = ?, picture = ?, token_hash = ?, last_seen_at = ? WHERE id = ?`,
		name, picture, tokenHash, ts(seen), id)
	return err
}

func (s *Store) Delete(ctx context.Context, id int64) (bool, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM access_requests WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

// PruneEvents deletes audit entries older than before.
func (s *Store) PruneEvents(ctx context.Context, before time.Time) (int, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM access_events WHERE at < ?`, ts(before))
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	return int(n), err
}

func (s *Store) list(ctx context.Context, where string, arg any) ([]access.Request, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+reqCols+` FROM access_requests WHERE `+where+` ORDER BY requested_at, id`, arg)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []access.Request
	for rows.Next() {
		q, err := scanReq(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

func (s *Store) ListPending(ctx context.Context, now time.Time) ([]access.Request, error) {
	return s.list(ctx, `expires_at > ?`, ts(now))
}

func (s *Store) CountPending(ctx context.Context, now time.Time) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM access_requests WHERE expires_at > ?`, ts(now)).Scan(&n)
	return n, err
}

// DeleteExpired removes the expired rows and returns them in one statement, so each row goes to exactly one caller.
func (s *Store) DeleteExpired(ctx context.Context, now time.Time) ([]access.Request, error) {
	rows, err := s.db.QueryContext(ctx, `DELETE FROM access_requests WHERE expires_at <= ? RETURNING `+reqCols, ts(now))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []access.Request
	for rows.Next() {
		q, err := scanReq(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, q)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].RequestedAt.Equal(out[j].RequestedAt) {
			return out[i].ID < out[j].ID
		}
		return out[i].RequestedAt.Before(out[j].RequestedAt)
	})
	return out, rows.Err()
}

func (s *Store) AddEvent(ctx context.Context, e access.Event) error {
	var actor any
	if e.ActorUserID != 0 {
		actor = e.ActorUserID
	}
	var member any
	if e.MemberID != 0 {
		member = e.MemberID
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO access_events (at, kind, email, name, actor_user_id, actor_email, member_id, member_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		ts(e.At), string(e.Kind), e.Email, e.Name, actor, e.ActorEmail, member, e.MemberName)
	return err
}

func (s *Store) CountEvents(ctx context.Context, email string, kind access.EventKind, since time.Time) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM access_events WHERE email = ? AND kind = ? AND at >= ?`,
		email, string(kind), ts(since)).Scan(&n)
	return n, err
}

func (s *Store) LastEvent(ctx context.Context, email string, kind access.EventKind) (time.Time, bool, error) {
	var at sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT max(at) FROM access_events WHERE email = ? AND kind = ?`, email, string(kind)).Scan(&at)
	if err != nil || !at.Valid {
		return time.Time{}, false, err
	}
	t, err := time.Parse(time.RFC3339, at.String)
	return t, err == nil, err
}

func (s *Store) Events(ctx context.Context, limit int) ([]access.Event, error) {
	if limit <= 0 {
		limit = -1
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, at, kind, email, name, COALESCE(actor_user_id, 0), actor_email, COALESCE(member_id, 0), member_name FROM access_events ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []access.Event
	for rows.Next() {
		var e access.Event
		var at, kind string
		if err := rows.Scan(&e.ID, &at, &kind, &e.Email, &e.Name, &e.ActorUserID, &e.ActorEmail, &e.MemberID, &e.MemberName); err != nil {
			return nil, err
		}
		e.Kind = access.EventKind(kind)
		if e.At, err = time.Parse(time.RFC3339, at); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
