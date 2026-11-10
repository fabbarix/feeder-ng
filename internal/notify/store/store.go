// Package store is the SQL repository for push devices and the sent log. It
// implements notify.Subscriptions and notify.SentLog.
package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/notify"
)

// ErrNotFound is returned when a device does not exist or belongs to someone else.
var ErrNotFound = errors.New("notify/store: not found")

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
// (nil = none).
func (s *Store) Upsert(ctx context.Context, userID int64, in notify.SubscriptionInput) (notify.Device, bool, error) {
	var id int64
	created := false
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		err := tx.QueryRowContext(ctx, `SELECT id FROM push_subscriptions WHERE endpoint = ?`, in.Endpoint).Scan(&id)
		switch {
		case errors.Is(err, sql.ErrNoRows):
			res, err := tx.ExecContext(ctx, `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, label, created_at)
				VALUES (?, ?, ?, ?, ?, ?)`, userID, in.Endpoint, in.P256dh, in.Auth, in.Label, s.now())
			if err != nil {
				return err
			}
			id, err = res.LastInsertId()
			if err != nil {
				return err
			}
			created = true
		case err != nil:
			return err
		default:
			if _, err := tx.ExecContext(ctx, `UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ?, label = ? WHERE id = ?`,
				userID, in.P256dh, in.Auth, in.Label, id); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `DELETE FROM push_subscription_types WHERE subscription_id = ?`, id); err != nil {
				return err
			}
		}
		for t, on := range in.Types {
			if !on {
				continue
			}
			if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO push_subscription_types (subscription_id, type) VALUES (?, ?)`, id, string(t)); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return notify.Device{}, false, err
	}
	d, err := s.device(ctx, id)
	return d, created, err
}

// Devices lists userID's devices, oldest first, each with all six types set.
func (s *Store) Devices(ctx context.Context, userID int64) ([]notify.Device, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY created_at, id`, userID)
	if err != nil {
		return nil, err
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	out := make([]notify.Device, 0, len(ids))
	for _, id := range ids {
		d, err := s.device(ctx, id)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, nil
}

// Update sets the types given in types (others unchanged) and the label when
// non-nil, for userID's device id. ErrNotFound for any other User's device.
func (s *Store) Update(ctx context.Context, userID, id int64, label *string, types map[notify.Type]bool) (notify.Device, error) {
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		if err := owns(ctx, tx, userID, id); err != nil {
			return err
		}
		if label != nil {
			if _, err := tx.ExecContext(ctx, `UPDATE push_subscriptions SET label = ? WHERE id = ?`, *label, id); err != nil {
				return err
			}
		}
		for t, on := range types {
			if on {
				_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO push_subscription_types (subscription_id, type) VALUES (?, ?)`, id, string(t))
				if err != nil {
					return err
				}
				continue
			}
			if _, err := tx.ExecContext(ctx, `DELETE FROM push_subscription_types WHERE subscription_id = ? AND type = ?`, id, string(t)); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return notify.Device{}, err
	}
	return s.device(ctx, id)
}

// Delete removes userID's device id. ErrNotFound for any other User's device.
func (s *Store) Delete(ctx context.Context, userID, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// Targets implements notify.Subscriptions.
func (s *Store) Targets(ctx context.Context, t notify.Type) ([]notify.Target, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT s.id, s.user_id, s.endpoint, s.p256dh, s.auth
		FROM push_subscriptions s JOIN push_subscription_types ty ON ty.subscription_id = s.id
		WHERE ty.type = ? ORDER BY s.id`, string(t))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []notify.Target
	for rows.Next() {
		var g notify.Target
		if err := rows.Scan(&g.ID, &g.UserID, &g.Endpoint, &g.P256dh, &g.Auth); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// Remove implements notify.Subscriptions (the device is gone).
func (s *Store) Remove(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM push_subscriptions WHERE id = ?`, id)
	return err
}

// Claim implements notify.SentLog: insert-or-ignore, true only for the first caller.
func (s *Store) Claim(ctx context.Context, subscriptionID int64, key string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO push_sent (subscription_id, key, sent_at) VALUES (?, ?, ?)`,
		subscriptionID, key, s.now())
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

// Release implements notify.SentLog.
func (s *Store) Release(ctx context.Context, subscriptionID int64, key string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM push_sent WHERE subscription_id = ? AND key = ?`, subscriptionID, key)
	return err
}

// PruneSent deletes sent-log rows older than before and returns how many.
func (s *Store) PruneSent(ctx context.Context, before time.Time) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM push_sent WHERE sent_at < ?`, before.UTC().Format(time.RFC3339))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

var (
	_ notify.Subscriptions = (*Store)(nil)
	_ notify.SentLog       = (*Store)(nil)
)

func (s *Store) now() string { return s.clk.Now().UTC().Format(time.RFC3339) }

func (s *Store) inTx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

// owns returns ErrNotFound unless device id belongs to userID.
func owns(ctx context.Context, tx *sql.Tx, userID, id int64) error {
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM push_subscriptions WHERE id = ? AND user_id = ?`, id, userID).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// device loads one device with all six types present.
func (s *Store) device(ctx context.Context, id int64) (notify.Device, error) {
	var (
		d        notify.Device
		endpoint string
		created  string
	)
	err := s.db.QueryRowContext(ctx, `SELECT id, user_id, endpoint, label, created_at FROM push_subscriptions WHERE id = ?`, id).
		Scan(&d.ID, &d.UserID, &endpoint, &d.Label, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return notify.Device{}, ErrNotFound
	}
	if err != nil {
		return notify.Device{}, err
	}
	sum := sha256.Sum256([]byte(endpoint))
	d.EndpointHash = hex.EncodeToString(sum[:])
	if d.CreatedAt, err = time.Parse(time.RFC3339, created); err != nil {
		return notify.Device{}, err
	}
	d.Types = map[notify.Type]bool{}
	for _, t := range notify.AllTypes() {
		d.Types[t] = false
	}
	rows, err := s.db.QueryContext(ctx, `SELECT type FROM push_subscription_types WHERE subscription_id = ?`, id)
	if err != nil {
		return notify.Device{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return notify.Device{}, err
		}
		if t, ok := notify.ParseType(name); ok {
			d.Types[t] = true
		}
	}
	return d, rows.Err()
}
