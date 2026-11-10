// Package store is the SQL for the Recipe Assistant: the one settings row (with the encrypted API key) and the
// change history. It holds ciphertext only; sealing and opening is the service's job (internal/secretbox).
// See docs/dev/design/ra-c-service.md §2.
package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

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
func (s *Store) Load(ctx context.Context) (Row, error) {
	var (
		row        Row
		enabled    int
		ct         []byte
		last4, mid sql.NullString
		updatedAt  string
	)
	err := s.db.QueryRowContext(ctx, `SELECT enabled, base_url, model, api_key_ciphertext, api_key_last4, api_key_master_id, updated_at, updated_by
		FROM recipe_assistant_settings WHERE id = 1`).
		Scan(&enabled, &row.Settings.BaseURL, &row.Settings.Model, &ct, &last4, &mid, &updatedAt, &row.UpdatedBy)
	if err != nil {
		return Row{}, fmt.Errorf("store: load settings: %w", err)
	}
	row.Settings.Enabled = enabled == 1
	if len(ct) > 0 {
		row.Ciphertext = ct
		row.Settings.HasKey = true
		row.Settings.KeyLast4 = last4.String
		row.MasterID = mid.String
	}
	row.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
	return row, nil
}

// Save writes the settings and its events in one transaction; if any write fails nothing changes.
// Events carry the clock's time and the actor snapshot.
func (s *Store) Save(ctx context.Context, in SaveInput) error {
	now := s.clk.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("store: begin: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	enabled := 0
	if in.Settings.Enabled {
		enabled = 1
	}
	switch {
	case in.ClearKey:
		_, err = tx.ExecContext(ctx, `UPDATE recipe_assistant_settings SET enabled=?, base_url=?, model=?,
			api_key_ciphertext=NULL, api_key_last4=NULL, api_key_master_id=NULL, updated_at=?, updated_by=? WHERE id=1`,
			enabled, in.Settings.BaseURL, in.Settings.Model, now, in.Actor.UserID)
	case in.Key != nil:
		_, err = tx.ExecContext(ctx, `UPDATE recipe_assistant_settings SET enabled=?, base_url=?, model=?,
			api_key_ciphertext=?, api_key_last4=?, api_key_master_id=?, updated_at=?, updated_by=? WHERE id=1`,
			enabled, in.Settings.BaseURL, in.Settings.Model, in.Key.Ciphertext, in.Key.Last4, in.Key.MasterID, now, in.Actor.UserID)
	default:
		_, err = tx.ExecContext(ctx, `UPDATE recipe_assistant_settings SET enabled=?, base_url=?, model=?,
			updated_at=?, updated_by=? WHERE id=1`,
			enabled, in.Settings.BaseURL, in.Settings.Model, now, in.Actor.UserID)
	}
	if err != nil {
		return fmt.Errorf("store: save settings: %w", err)
	}
	for _, c := range in.Changes {
		if _, err := tx.ExecContext(ctx, `INSERT INTO recipe_assistant_events(at, actor_user_id, actor_email, action, detail) VALUES (?,?,?,?,?)`,
			now, in.Actor.UserID, in.Actor.Email, c.Action, c.Detail); err != nil {
			return fmt.Errorf("store: save event: %w", err)
		}
	}
	return tx.Commit()
}

// Events returns the newest events first, at most limit (Admins see the last 20).
func (s *Store) Events(ctx context.Context, limit int) ([]Event, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, at, actor_user_id, actor_email, action, detail
		FROM recipe_assistant_events ORDER BY at DESC, id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, fmt.Errorf("store: events: %w", err)
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		var e Event
		var at string
		if err := rows.Scan(&e.ID, &at, &e.ActorUserID, &e.ActorEmail, &e.Action, &e.Detail); err != nil {
			return nil, err
		}
		e.At, _ = time.Parse(time.RFC3339, at)
		out = append(out, e)
	}
	return out, rows.Err()
}

// Prune deletes events older than EventRetention and returns how many were removed.
func (s *Store) Prune(ctx context.Context) (int, error) {
	cut := s.clk.Now().UTC().Add(-EventRetention).Format(time.RFC3339)
	res, err := s.db.ExecContext(ctx, `DELETE FROM recipe_assistant_events WHERE at < ?`, cut)
	if err != nil {
		return 0, fmt.Errorf("store: prune: %w", err)
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}
