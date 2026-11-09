// Package store is the SQL repository for push devices and the sent log. It
// implements notify.Subscriptions and notify.SentLog.
package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/notify"
)

// ErrNotFound is returned when a device does not exist or belongs to someone else.
var ErrNotFound = errors.New("notify/store: not found")

var errTODO = errors.New("notify/store: not implemented")

// Store reads and writes push_subscriptions, push_subscription_types and push_sent.
type Store struct {
	db  *sql.DB
	clk clock.Clock
}

// New returns a Store.
func New(db *sql.DB, clk clock.Clock) *Store { return &Store{db: db, clk: clk} }

// Upsert registers a browser endpoint for userID. A new endpoint creates a
// device (created = true). An existing endpoint is updated in place: it moves
// to userID, takes the new keys and label, and its types are replaced by in.Types
// (nil = none). Not implemented yet.
func (s *Store) Upsert(ctx context.Context, userID int64, in notify.SubscriptionInput) (d notify.Device, created bool, err error) {
	return notify.Device{}, false, errTODO
}

// Devices lists userID's devices, oldest first, each with all six types set.
func (s *Store) Devices(ctx context.Context, userID int64) ([]notify.Device, error) {
	return nil, errTODO
}

// Update sets the types given in types (others unchanged) and the label when
// non-nil, for userID's device id. ErrNotFound for any other User's device.
func (s *Store) Update(ctx context.Context, userID, id int64, label *string, types map[notify.Type]bool) (notify.Device, error) {
	return notify.Device{}, errTODO
}

// Delete removes userID's device id. ErrNotFound for any other User's device.
func (s *Store) Delete(ctx context.Context, userID, id int64) error { return errTODO }

// Targets implements notify.Subscriptions.
func (s *Store) Targets(ctx context.Context, t notify.Type) ([]notify.Target, error) {
	return nil, errTODO
}

// Remove implements notify.Subscriptions (the device is gone).
func (s *Store) Remove(ctx context.Context, id int64) error { return errTODO }

// Claim implements notify.SentLog: insert-or-ignore, true only for the first caller.
func (s *Store) Claim(ctx context.Context, subscriptionID int64, key string) (bool, error) {
	return false, errTODO
}

// Release implements notify.SentLog.
func (s *Store) Release(ctx context.Context, subscriptionID int64, key string) error { return errTODO }

// PruneSent deletes sent-log rows older than before and returns how many.
func (s *Store) PruneSent(ctx context.Context, before time.Time) (int64, error) { return 0, errTODO }

var (
	_ notify.Subscriptions = (*Store)(nil)
	_ notify.SentLog       = (*Store)(nil)
)
