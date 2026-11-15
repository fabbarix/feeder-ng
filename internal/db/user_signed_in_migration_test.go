package db_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// 1579 (B9-52, SET-03) is additive: users.signed_in_at, the first time a session was started for the User. A User who
// already has a session row gets its earliest created_at; one with none stays NULL ("Not signed in yet").
func TestMigration1579MarksTheUsersWhoAlreadyHaveASession(t *testing.T) {
	d := tagsOpenAt(t, "1579_")
	mustExec(t, d, `INSERT INTO users(id, email, display_name, is_admin, created_at) VALUES
		(1, 'boss@example.test', 'Boss', 1, '2026-01-01T00:00:00Z'), (2, 'nonna@example.test', 'nonna', 0, '2026-01-02T00:00:00Z')`)
	mustExec(t, d, `INSERT INTO sessions(token_hash, user_id, created_at, expires_at, last_seen) VALUES
		('a', 1, '2026-02-03T10:00:00Z', '2026-03-03T10:00:00Z', '2026-02-03T10:00:00Z'),
		('b', 1, '2026-02-01T09:00:00Z', '2026-03-01T09:00:00Z', '2026-02-01T09:00:00Z')`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1579: %v", err)
	}
	if n := count(t, d, `SELECT count(*) FROM users WHERE id = 1 AND signed_in_at = '2026-02-01T09:00:00Z'`); n != 1 {
		t.Errorf("the User with sessions gets the earliest one: %d rows, want 1", n)
	}
	if n := count(t, d, `SELECT count(*) FROM users WHERE id = 2 AND signed_in_at IS NULL`); n != 1 {
		t.Errorf("the User with no session stays NULL: %d rows, want 1", n)
	}
}

// Sessions are deleted on sign-out and expiry, so the backfill also takes any record only a signed-in User writes (batch
// review w3d): here a push subscription, a Shopping List tick and saved preferences (no time of their own: created_at).
func TestMigration1579AlsoReadsOtherProofOfASignIn(t *testing.T) {
	d := tagsOpenAt(t, "1579_")
	mustExec(t, d, `INSERT INTO users(id, email, display_name, is_admin, created_at) VALUES
		(1, 'boss@example.test', 'Boss', 1, '2026-01-01T00:00:00Z'), (2, 'nonna@example.test', 'nonna', 0, '2026-01-02T00:00:00Z'),
		(3, 'zia@example.test', 'zia', 0, '2026-01-03T00:00:00Z'), (4, 'new@example.test', 'new', 0, '2026-01-04T00:00:00Z')`)
	mustExec(t, d, `INSERT INTO sessions(token_hash, user_id, created_at, expires_at, last_seen) VALUES
		('a', 1, '2026-02-03T10:00:00Z', '2026-03-03T10:00:00Z', '2026-02-03T10:00:00Z')`)
	mustExec(t, d, `INSERT INTO push_subscriptions(user_id, endpoint, p256dh, auth, created_at) VALUES
		(1, 'https://push.example.test/1', 'k', 'a', '2026-01-20T08:00:00Z'), (2, 'https://push.example.test/2', 'k', 'a', '2026-01-25T08:00:00Z')`)
	mustExec(t, d, `INSERT INTO user_preferences(user_id, scheme, accent, units) VALUES (3, 'dark', '#3f7d58', 'metric')`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1579: %v", err)
	}
	for _, c := range []struct {
		id   int
		want any
	}{{1, "2026-01-20T08:00:00Z"}, {2, "2026-01-25T08:00:00Z"}, {3, "2026-01-03T00:00:00Z"}, {4, nil}} {
		q := `SELECT count(*) FROM users WHERE id = ? AND signed_in_at IS ?`
		if n := count(t, d, q, c.id, c.want); n != 1 {
			t.Errorf("user %d: signed_in_at is not %v", c.id, c.want)
		}
	}
}

func TestMigration1579IsInThePre1570Snapshot(t *testing.T) {
	var found bool
	for _, p := range db.Pre1570Prefixes {
		found = found || p == "1579_"
	}
	if !found {
		t.Fatalf("Pre1570Prefixes = %v, want 1579_ in it", db.Pre1570Prefixes)
	}
}
