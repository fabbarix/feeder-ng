package auth_test

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
)

var t0 = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)

type fixture struct {
	svc *auth.Service
	clk *clock.Fake
	db  *sql.DB
}

func newFixture(t *testing.T, secure bool) *fixture {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(t0)
	return &fixture{svc: auth.NewService(d, clk, secure), clk: clk, db: d}
}

func TestSeedAdminCreatesAdminAndIsIdempotent(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	u, err := f.svc.SeedAdmin(ctx, "Boss@Example.test")
	if err != nil {
		t.Fatal(err)
	}
	if !u.IsAdmin || u.Email != "boss@example.test" || u.DisplayName != "boss" {
		t.Fatalf("seeded user = %+v", u)
	}
	if !u.CreatedAt.Equal(t0) {
		t.Errorf("CreatedAt = %v, want clock time %v", u.CreatedAt, t0)
	}
	again, err := f.svc.SeedAdmin(ctx, "boss@example.test")
	if err != nil || again.ID != u.ID {
		t.Fatalf("second seed = %+v, %v; want same user", again, err)
	}
	var n int
	f.db.QueryRow("SELECT count(*) FROM users").Scan(&n)
	if n != 1 {
		t.Fatalf("users = %d, want 1", n)
	}
}

func TestSeedAdminPromotesExistingUser(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	if _, err := f.svc.AddUser(ctx, "cook@example.test", "Cook", false); err != nil {
		t.Fatal(err)
	}
	u, err := f.svc.SeedAdmin(ctx, "cook@example.test")
	if err != nil || !u.IsAdmin || u.DisplayName != "Cook" {
		t.Fatalf("got %+v, %v; want existing user promoted, name kept", u, err)
	}
}

func TestAddUserAndLookup(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	u, err := f.svc.AddUser(ctx, "Anna@Example.test", "Anna", false)
	if err != nil {
		t.Fatal(err)
	}
	if u.ID == 0 || u.Email != "anna@example.test" || u.IsAdmin {
		t.Fatalf("user = %+v", u)
	}
	if _, err := f.svc.AddUser(ctx, "ANNA@example.test", "Other", false); !errors.Is(err, auth.ErrEmailTaken) {
		t.Fatalf("duplicate err = %v, want ErrEmailTaken", err)
	}
	got, err := f.svc.UserByEmail(ctx, "ANNA@EXAMPLE.TEST")
	if err != nil || got.ID != u.ID {
		t.Fatalf("lookup = %+v, %v", got, err)
	}
	if _, err := f.svc.UserByEmail(ctx, "nobody@example.test"); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestSessionTokenIsRandomAndHashedAtRest(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	u, _ := f.svc.AddUser(ctx, "a@example.test", "A", false)
	tok1, exp, err := f.svc.CreateSession(ctx, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	tok2, _, _ := f.svc.CreateSession(ctx, u.ID)
	if tok1 == tok2 || len(tok1) < 40 {
		t.Fatalf("tokens must be long and unique: %q %q", tok1, tok2)
	}
	if want := t0.Add(auth.SessionTTL); !exp.Equal(want) {
		t.Fatalf("expiresAt = %v, want %v", exp, want)
	}
	rows, _ := f.db.Query("SELECT token_hash FROM sessions")
	defer rows.Close()
	n := 0
	for rows.Next() {
		var h string
		rows.Scan(&h)
		n++
		if h == tok1 || h == tok2 || strings.Contains(h, tok1) {
			t.Fatal("raw token stored in the database")
		}
		if len(h) != 64 {
			t.Errorf("token_hash %q: want 64 hex chars (sha256)", h)
		}
	}
	if n != 2 {
		t.Fatalf("sessions = %d, want 2", n)
	}
}

func TestAuthenticateReturnsUser(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	u, _ := f.svc.AddUser(ctx, "a@example.test", "A", true)
	tok, _, _ := f.svc.CreateSession(ctx, u.ID)
	got, err := f.svc.Authenticate(ctx, tok)
	if err != nil || got.ID != u.ID || !got.IsAdmin {
		t.Fatalf("got %+v, %v", got, err)
	}
	for _, bad := range []string{"", "nope", tok + "x"} {
		if _, err := f.svc.Authenticate(ctx, bad); !errors.Is(err, auth.ErrNoSession) {
			t.Errorf("Authenticate(%q) err = %v, want ErrNoSession", bad, err)
		}
	}
}

func expiry(t *testing.T, f *fixture) time.Time {
	t.Helper()
	var s string
	if err := f.db.QueryRow("SELECT expires_at FROM sessions").Scan(&s); err != nil {
		t.Fatal(err)
	}
	ts, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatalf("expires_at %q must be RFC 3339: %v", s, err)
	}
	return ts
}

func TestSessionExpiryIsSliding(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	u, _ := f.svc.AddUser(ctx, "a@example.test", "A", false)
	tok, _, _ := f.svc.CreateSession(ctx, u.ID)

	// Used every 20 days: never expires, expiry keeps moving.
	for i := 1; i <= 4; i++ {
		f.clk.Advance(20 * 24 * time.Hour)
		if _, err := f.svc.Authenticate(ctx, tok); err != nil {
			t.Fatalf("after %d days: %v", i*20, err)
		}
		if want := f.clk.Now().Add(auth.SessionTTL); !expiry(t, f).Equal(want) {
			t.Fatalf("after %d days expiry = %v, want %v", i*20, expiry(t, f), want)
		}
	}
}

func TestSessionExpiresAfter30IdleDays(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	u, _ := f.svc.AddUser(ctx, "a@example.test", "A", false)
	tok, _, _ := f.svc.CreateSession(ctx, u.ID)

	f.clk.Advance(30*24*time.Hour - time.Second)
	if _, err := f.svc.Authenticate(ctx, tok); err != nil {
		t.Fatalf("just before 30 days: %v", err)
	}
	// That use slid the expiry; idle again for exactly the TTL.
	f.clk.Advance(auth.SessionTTL)
	if _, err := f.svc.Authenticate(ctx, tok); !errors.Is(err, auth.ErrNoSession) {
		t.Fatalf("after %v idle: err = %v, want ErrNoSession", auth.SessionTTL, err)
	}
	var n int
	f.db.QueryRow("SELECT count(*) FROM sessions").Scan(&n)
	if n != 0 {
		t.Errorf("expired session row should be deleted, have %d", n)
	}
}

func TestSlidingWritesAreThrottledToOncePerMinute(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	u, _ := f.svc.AddUser(ctx, "a@example.test", "A", false)
	tok, first, _ := f.svc.CreateSession(ctx, u.ID)
	f.clk.Advance(10 * time.Second)
	f.svc.Authenticate(ctx, tok)
	if !expiry(t, f).Equal(first) {
		t.Fatal("expiry must not be rewritten within a minute of the last write")
	}
	f.clk.Advance(2 * time.Minute)
	f.svc.Authenticate(ctx, tok)
	if !expiry(t, f).After(first) {
		t.Fatal("expiry must slide once more than a minute has passed")
	}
}

func TestEndSession(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	u, _ := f.svc.AddUser(ctx, "a@example.test", "A", false)
	tok, _, _ := f.svc.CreateSession(ctx, u.ID)
	other, _, _ := f.svc.CreateSession(ctx, u.ID)
	if err := f.svc.EndSession(ctx, tok); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.EndSession(ctx, tok); err != nil {
		t.Fatalf("EndSession must be idempotent: %v", err)
	}
	if _, err := f.svc.Authenticate(ctx, tok); !errors.Is(err, auth.ErrNoSession) {
		t.Fatalf("err = %v, want ErrNoSession", err)
	}
	if _, err := f.svc.Authenticate(ctx, other); err != nil {
		t.Fatalf("other session must survive: %v", err)
	}
}

func TestDeleteUserEndsTheirSessionsImmediately(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	gone, _ := f.svc.AddUser(ctx, "gone@example.test", "Gone", false)
	stay, _ := f.svc.AddUser(ctx, "stay@example.test", "Stay", false)
	g1, _, _ := f.svc.CreateSession(ctx, gone.ID)
	g2, _, _ := f.svc.CreateSession(ctx, gone.ID)
	s1, _, _ := f.svc.CreateSession(ctx, stay.ID)

	if err := f.svc.DeleteUser(ctx, gone.ID); err != nil {
		t.Fatal(err)
	}
	for _, tok := range []string{g1, g2} {
		if _, err := f.svc.Authenticate(ctx, tok); !errors.Is(err, auth.ErrNoSession) {
			t.Fatalf("deleted user's session still valid: %v", err)
		}
	}
	if _, err := f.svc.Authenticate(ctx, s1); err != nil {
		t.Fatalf("other user's session must survive: %v", err)
	}
	if _, err := f.svc.UserByEmail(ctx, "gone@example.test"); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
	if err := f.svc.DeleteUser(ctx, gone.ID); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("second delete err = %v, want ErrNotFound", err)
	}
}

func TestCookieAttributes(t *testing.T) {
	exp := t0.Add(auth.SessionTTL)
	for _, secure := range []bool{false, true} {
		f := newFixture(t, secure)
		c := f.svc.SessionCookie("tok", exp)
		if c.Name != auth.CookieName || c.Value != "tok" || c.Path != "/" {
			t.Errorf("cookie = %+v", c)
		}
		if !c.HttpOnly || c.SameSite != http.SameSiteLaxMode {
			t.Errorf("cookie must be HttpOnly + SameSite=Lax: %+v", c)
		}
		if c.Secure != secure {
			t.Errorf("Secure = %v, want %v", c.Secure, secure)
		}
		if !c.Expires.Equal(exp) {
			t.Errorf("Expires = %v, want %v", c.Expires, exp)
		}
		clear := f.svc.ClearCookie()
		if clear.Name != auth.CookieName || clear.MaxAge >= 0 || clear.Value != "" || !clear.HttpOnly {
			t.Errorf("clear cookie = %+v", clear)
		}
	}
}
