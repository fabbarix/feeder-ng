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

func TestMigration1579IsInThePre1570Snapshot(t *testing.T) {
	var found bool
	for _, p := range db.Pre1570Prefixes {
		found = found || p == "1579_"
	}
	if !found {
		t.Fatalf("Pre1570Prefixes = %v, want 1579_ in it", db.Pre1570Prefixes)
	}
}
