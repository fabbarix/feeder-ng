package auth_test

import (
	"context"
	"errors"
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
