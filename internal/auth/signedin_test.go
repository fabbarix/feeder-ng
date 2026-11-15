package auth_test

import (
	"context"
	"testing"
)

// B9-52 (SET-03): the Allowlist says whether each User has signed in (their display name) or "Not signed in yet". A User
// has signed in once any session was started for them; the mark stays after the session ends.
func TestListAllowedSaysWhoHasSignedIn(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	boss, _ := f.svc.SeedAdmin(ctx, "boss@example.test")
	cook, _ := f.svc.AddUser(ctx, "cook@example.test", "Cook", false)
	f.svc.AddUser(ctx, "nonna@example.test", "nonna", false)
	if _, _, err := f.svc.CreateSession(ctx, boss.ID); err != nil {
		t.Fatal(err)
	}
	token, _, err := f.svc.CreateSession(ctx, cook.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.svc.EndSession(ctx, token); err != nil { // signing out does not undo "has signed in"
		t.Fatal(err)
	}
	got, err := f.svc.ListAllowed(ctx)
	if err != nil || len(got) != 3 {
		t.Fatalf("ListAllowed = %+v, %v", got, err)
	}
	want := map[string]bool{"boss@example.test": true, "cook@example.test": true, "nonna@example.test": false}
	for _, a := range got {
		if a.SignedIn != want[a.Email] {
			t.Errorf("%s: SignedIn = %v, want %v", a.Email, a.SignedIn, want[a.Email])
		}
	}
	if got[0].ID != boss.ID || got[1].DisplayName != "Cook" {
		t.Errorf("ListAllowed keeps the User fields in id order: %+v", got)
	}
}

func TestHasSignedIn(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	u, _ := f.svc.AddUser(ctx, "cook@example.test", "Cook", false)
	if ok, err := f.svc.HasSignedIn(ctx, u.ID); err != nil || ok {
		t.Fatalf("before a session: %v, %v", ok, err)
	}
	f.svc.CreateSession(ctx, u.ID)
	f.svc.CreateSession(ctx, u.ID) // a second session keeps the first instant
	if ok, err := f.svc.HasSignedIn(ctx, u.ID); err != nil || !ok {
		t.Fatalf("after a session: %v, %v", ok, err)
	}
}
