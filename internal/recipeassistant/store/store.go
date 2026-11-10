// Package store is the SQL for the Recipe Assistant: the one settings row (with the encrypted API key) and the
// change history. It holds ciphertext only; sealing and opening is the service's job (internal/secretbox).
// See docs/dev/design/ra-c-service.md §2.
package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

// ErrNotImplemented marks the red stubs.
var ErrNotImplemented = errors.New("store: not implemented")

// EventRetention is how long change-history rows are kept (design §4.3).
const EventRetention = 366 * 24 * time.Hour

// Store reads and writes recipe_assistant_settings and recipe_assistant_events.
type Store struct {
	db  *sql.DB
	clk clock.Clock
}

// New returns a Store.
func New(db *sql.DB, clk clock.Clock) *Store { return &Store{db: db, clk: clk} }

// Row is the saved configuration with the sealed key.
type Row struct {
	Settings   recipeassistant.Settings // HasKey and KeyLast4 filled from the row
	Ciphertext []byte                   // nil when no key is saved
	MasterID   string                   // secretbox.MasterKey.ID() the key was sealed under
	UpdatedAt  time.Time
	UpdatedBy  int64
}

// Actor is who made a change; the email is a snapshot (no foreign key).
type Actor struct {
	UserID int64
	Email  string
}

// SealedKey is a key sealed by the service.
type SealedKey struct {
	Ciphertext []byte
	MasterID   string
	Last4      string
}

// SaveInput is one atomic write: the settings row (and the key when Key is not nil, or cleared when ClearKey)
// plus one event row per Change.
type SaveInput struct {
	Settings recipeassistant.Settings
	Key      *SealedKey
	ClearKey bool
	Actor    Actor
	Changes  []recipeassistant.Change
}

// Event is one change-history row.
type Event struct {
	ID          int64
	At          time.Time
	ActorUserID int64
	ActorEmail  string
	Action      string
	Detail      string
}

// Load returns the settings row (the migration seeds it).
func (s *Store) Load(ctx context.Context) (Row, error) { return Row{}, ErrNotImplemented }

// Save writes the settings and its events in one transaction; if any write fails nothing changes.
// Events carry the clock's time and the actor snapshot.
func (s *Store) Save(ctx context.Context, in SaveInput) error { return ErrNotImplemented }

// Events returns the newest events first, at most limit (Admins see the last 20).
func (s *Store) Events(ctx context.Context, limit int) ([]Event, error) {
	return nil, ErrNotImplemented
}

// Prune deletes events older than EventRetention and returns how many were removed.
func (s *Store) Prune(ctx context.Context) (int, error) { return 0, ErrNotImplemented }
