package auth_test

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/auth"
)

func TestNormalizeEmail(t *testing.T) {
	got, err := auth.NormalizeEmail("  Anna.Rossi@Example.TEST ")
	if err != nil || got != "anna.rossi@example.test" {
		t.Fatalf("got %q, %v", got, err)
	}
	for _, bad := range []string{"", "anna", "anna@", "@example.test", "anna@example", "an na@example.test", "a@b@c.test"} {
		if _, err := auth.NormalizeEmail(bad); !errors.Is(err, auth.ErrInvalidEmail) {
			t.Errorf("%q: err = %v, want ErrInvalidEmail", bad, err)
		}
	}
}

func TestListUsersOrderedByID(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	a, _ := f.svc.SeedAdmin(ctx, "boss@example.test")
	b, _ := f.svc.AddUser(ctx, "b@example.test", "B", false)
	c, _ := f.svc.AddUser(ctx, "c@example.test", "C", false)
	got, err := f.svc.ListUsers(ctx)
	if err != nil || len(got) != 3 || got[0].ID != a.ID || got[1].ID != b.ID || got[2].ID != c.ID {
		t.Fatalf("ListUsers = %+v, %v", got, err)
	}
}

func TestSetAdminGrantsAndRevokes(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	f.svc.SeedAdmin(ctx, "boss@example.test")
	u, _ := f.svc.AddUser(ctx, "b@example.test", "B", false)
	got, err := f.svc.SetAdmin(ctx, u.ID, true)
	if err != nil || !got.IsAdmin {
		t.Fatalf("grant = %+v, %v", got, err)
	}
	got, err = f.svc.SetAdmin(ctx, u.ID, false)
	if err != nil || got.IsAdmin {
		t.Fatalf("revoke = %+v, %v", got, err)
	}
	if _, err := f.svc.SetAdmin(ctx, 9999, true); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("unknown id: %v", err)
	}
}

func TestCannotDemoteOrRemoveTheLastAdmin(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	boss, _ := f.svc.SeedAdmin(ctx, "boss@example.test")
	if _, err := f.svc.SetAdmin(ctx, boss.ID, false); !errors.Is(err, auth.ErrLastAdmin) {
		t.Fatalf("demote last: %v", err)
	}
	if err := f.svc.RemoveUser(ctx, boss.ID); !errors.Is(err, auth.ErrLastAdmin) {
		t.Fatalf("remove last: %v", err)
	}
	// With a second Admin the first may go.
	second, _ := f.svc.AddUser(ctx, "two@example.test", "Two", true)
	if err := f.svc.RemoveUser(ctx, boss.ID); err != nil {
		t.Fatalf("remove one of two Admins: %v", err)
	}
	if err := f.svc.RemoveUser(ctx, second.ID); !errors.Is(err, auth.ErrLastAdmin) {
		t.Fatalf("now the last: %v", err)
	}
}

func TestRemovingANonAdminWorksWhenTheOnlyAdminRemains(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	f.svc.SeedAdmin(ctx, "boss@example.test")
	u, _ := f.svc.AddUser(ctx, "b@example.test", "B", false)
	if err := f.svc.RemoveUser(ctx, u.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.RemoveUser(ctx, u.ID); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("second removal: %v", err)
	}
}

func TestRemoveUserEndsTheirSessionsAtOnce(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	f.svc.SeedAdmin(ctx, "boss@example.test")
	u, _ := f.svc.AddUser(ctx, "b@example.test", "B", false)
	tok, _, _ := f.svc.CreateSession(ctx, u.ID)
	var revoked []string
	f.svc.OnRevoke(func(k string) { revoked = append(revoked, k) })
	if err := f.svc.RemoveUser(ctx, u.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.Authenticate(ctx, tok); !errors.Is(err, auth.ErrNoSession) {
		t.Fatalf("session after removal: %v", err)
	}
	if len(revoked) != 1 || revoked[0] != auth.UserKey(u.ID) {
		t.Fatalf("revocation hook = %v", revoked)
	}
}

func TestSetDisplayName(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	u, _ := f.svc.AddUser(ctx, "b@example.test", "b", false)
	if err := f.svc.SetDisplayName(ctx, u.ID, "Bea Verdi"); err != nil {
		t.Fatal(err)
	}
	got, _ := f.svc.UserByEmail(ctx, "b@example.test")
	if got.DisplayName != "Bea Verdi" {
		t.Fatalf("name = %q", got.DisplayName)
	}
	if err := f.svc.SetDisplayName(ctx, 9999, "x"); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("unknown id: %v", err)
	}
}

// twoAdmins seeds boss plus a second Admin, so each can act on the other.
func twoAdmins(t *testing.T, f *fixture) (auth.User, auth.User) {
	t.Helper()
	ctx := context.Background()
	a, err := f.svc.SeedAdmin(ctx, "boss@example.test")
	if err != nil {
		t.Fatal(err)
	}
	b, err := f.svc.AddUser(ctx, "second@example.test", "Second", true)
	if err != nil {
		t.Fatal(err)
	}
	return a, b
}

func adminCount(t *testing.T, f *fixture) int {
	t.Helper()
	var n int
	if err := f.db.QueryRow(`SELECT COUNT(*) FROM users WHERE is_admin = 1`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestTwoAdminsDemotingEachOtherLeaveOne(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	a, b := twoAdmins(t, f)
	if _, err := f.svc.SetAdmin(ctx, b.ID, false); err != nil {
		t.Fatalf("first demotion: %v", err)
	}
	// b is no longer an Admin, and a is now the only one.
	if _, err := f.svc.SetAdmin(ctx, a.ID, false); !errors.Is(err, auth.ErrLastAdmin) {
		t.Fatalf("second demotion: %v, want ErrLastAdmin", err)
	}
	if n := adminCount(t, f); n != 1 {
		t.Fatalf("Admins = %d, want 1", n)
	}
}

func TestTwoAdminsRemovingEachOtherLeaveOne(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	a, b := twoAdmins(t, f)
	if err := f.svc.RemoveUser(ctx, b.ID); err != nil {
		t.Fatalf("first removal: %v", err)
	}
	if err := f.svc.RemoveUser(ctx, a.ID); !errors.Is(err, auth.ErrLastAdmin) {
		t.Fatalf("second removal: %v, want ErrLastAdmin", err)
	}
	if n := adminCount(t, f); n != 1 {
		t.Fatalf("Admins = %d, want 1", n)
	}
}

// Two Admins act on each other at the same moment. Whatever the interleaving,
// at least one Admin must remain.
func TestConcurrentAdminsNeverLeaveZeroAdmins(t *testing.T) {
	for round := 0; round < 25; round++ {
		f := newFixture(t, false)
		ctx := context.Background()
		a, b := twoAdmins(t, f)
		ops := []func() error{
			func() error { _, err := f.svc.SetAdmin(ctx, b.ID, false); return err },
			func() error { _, err := f.svc.SetAdmin(ctx, a.ID, false); return err },
			func() error { return f.svc.RemoveUser(ctx, b.ID) },
			func() error { return f.svc.RemoveUser(ctx, a.ID) },
		}
		start := make(chan struct{})
		var wg sync.WaitGroup
		pair := [][2]int{{0, 1}, {2, 3}, {0, 3}, {2, 1}}[round%4]
		for _, op := range pair {
			wg.Add(1)
			go func(op func() error) {
				defer wg.Done()
				<-start
				_ = op() // success or ErrLastAdmin; both are fine
			}(ops[op])
		}
		close(start)
		wg.Wait()
		if n := adminCount(t, f); n < 1 {
			t.Fatalf("round %d: zero Admins left", round)
		}
	}
}

// The guard and the write are one atomic step: the database itself refuses any
// statement that would leave zero Admins, so no check-then-write gap exists.
func TestDatabaseRefusesToLeaveZeroAdmins(t *testing.T) {
	f := newFixture(t, false)
	a, b := twoAdmins(t, f)
	for name, stmt := range map[string]string{
		"demote every Admin in one statement": `UPDATE users SET is_admin = 0`,
		"delete every Admin in one statement": `DELETE FROM users WHERE is_admin = 1`,
	} {
		if _, err := f.db.Exec(stmt); err == nil {
			t.Errorf("%s: statement succeeded, want it refused", name)
		}
		if n := adminCount(t, f); n != 2 {
			t.Errorf("%s: Admins = %d, want 2 (statement must roll back)", name, n)
		}
	}
	if _, err := f.db.Exec(`UPDATE users SET is_admin = 0 WHERE id = ?`, b.ID); err != nil {
		t.Fatalf("demoting one of two Admins must work: %v", err)
	}
	if _, err := f.db.Exec(`UPDATE users SET is_admin = 0 WHERE id = ?`, a.ID); err == nil {
		t.Error("demoting the last Admin directly in SQL succeeded")
	}
	if _, err := f.db.Exec(`DELETE FROM users WHERE id = ?`, a.ID); err == nil {
		t.Error("deleting the last Admin directly in SQL succeeded")
	}
	if n := adminCount(t, f); n != 1 {
		t.Fatalf("Admins = %d, want 1", n)
	}
}
