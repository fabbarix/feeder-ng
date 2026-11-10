// Package store is the SQLite implementation of access.Store (tables access_requests and access_events, migration
// 1200).
package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/fabbarix/feeder-ng/internal/access"
)

// Store implements access.Store.
type Store struct{ db *sql.DB }

var _ access.Store = (*Store)(nil)

// New returns a Store on db.
func New(db *sql.DB) *Store { return &Store{db: db} }

func (s *Store) ByEmail(context.Context, string) (access.Request, bool, error) {
	return access.Request{}, false, access.ErrNotImplemented
}
func (s *Store) ByTokenHash(context.Context, string) (access.Request, bool, error) {
	return access.Request{}, false, access.ErrNotImplemented
}
func (s *Store) ByID(context.Context, int64) (access.Request, bool, error) {
	return access.Request{}, false, access.ErrNotImplemented
}
func (s *Store) Insert(context.Context, access.Request, string) (access.Request, error) {
	return access.Request{}, access.ErrNotImplemented
}
func (s *Store) Refresh(context.Context, int64, string, string, string, time.Time) error {
	return access.ErrNotImplemented
}
func (s *Store) Delete(context.Context, int64) error { return access.ErrNotImplemented }
func (s *Store) ListPending(context.Context, time.Time) ([]access.Request, error) {
	return nil, access.ErrNotImplemented
}
func (s *Store) CountPending(context.Context, time.Time) (int, error) {
	return 0, access.ErrNotImplemented
}
func (s *Store) DeleteExpired(context.Context, time.Time) ([]access.Request, error) {
	return nil, access.ErrNotImplemented
}
func (s *Store) AddEvent(context.Context, access.Event) error { return access.ErrNotImplemented }
func (s *Store) CountEvents(context.Context, string, access.EventKind, time.Time) (int, error) {
	return 0, access.ErrNotImplemented
}
func (s *Store) LastEvent(context.Context, string, access.EventKind) (time.Time, bool, error) {
	return time.Time{}, false, access.ErrNotImplemented
}
func (s *Store) Events(context.Context, int) ([]access.Event, error) {
	return nil, access.ErrNotImplemented
}
