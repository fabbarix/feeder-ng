package httpapi_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

type me struct {
	ID          int64  `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	IsAdmin     bool   `json:"isAdmin"`
}

func TestMeRequiresSession(t *testing.T) {
	env := testkit.Start(t)
	r := env.Anonymous().Get("/api/me")
	if r.Status != 401 || r.ErrorCode() != "unauthenticated" {
		t.Fatalf("got %d %s", r.Status, r.Body)
	}
}

func TestMeReturnsCurrentUser(t *testing.T) {
	env := testkit.Start(t)
	var got me
	r := env.LoginAdmin(t).Get("/api/me")
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Email != testkit.AdminEmail || !got.IsAdmin || got.DisplayName == "" || got.ID == 0 {
		t.Fatalf("admin /api/me = %d %+v", r.Status, got)
	}
	r = env.LoginUser(t).Get("/api/me")
	r.MustJSON(t, &got)
	if got.Email != testkit.UserEmail || got.IsAdmin {
		t.Fatalf("user /api/me = %+v", got)
	}
}

func TestLogoutEndsSessionAndClearsCookie(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	r := c.Post("/api/logout", nil)
	if r.Status != 204 {
		t.Fatalf("logout status = %d", r.Status)
	}
	var cleared bool
	for _, ck := range r.Header["Set-Cookie"] {
		if len(ck) > len(auth.CookieName) && ck[:len(auth.CookieName)] == auth.CookieName {
			cleared = true
		}
	}
	if !cleared {
		t.Fatalf("logout must clear the cookie: %v", r.Header["Set-Cookie"])
	}
	// Even replaying the old cookie value must fail: the session is gone server-side.
	if got := env.Anonymous().Get("/api/me"); got.Status != 401 {
		t.Fatalf("anonymous status = %d", got.Status)
	}
	var n int
	env.DB.QueryRow("SELECT count(*) FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.email=?", testkit.UserEmail).Scan(&n)
	if n != 0 {
		t.Fatalf("session rows left = %d, want 0", n)
	}
}

func TestLogoutWithoutSessionIsHarmless(t *testing.T) {
	env := testkit.Start(t)
	if r := env.Anonymous().Post("/api/logout", nil); r.Status != 204 {
		t.Fatalf("status = %d", r.Status)
	}
}

func TestRemovedUserIsLoggedOutImmediately(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	if c.Get("/api/me").Status != 200 {
		t.Fatal("precondition: signed in")
	}
	u, err := env.Auth.UserByEmail(t.Context(), testkit.UserEmail)
	if err != nil {
		t.Fatal(err)
	}
	if err := env.Auth.DeleteUser(t.Context(), u.ID); err != nil {
		t.Fatal(err)
	}
	if r := c.Get("/api/me"); r.Status != 401 {
		t.Fatalf("after removal /api/me = %d, want 401", r.Status)
	}
}

func TestSessionStaysValidWhileUsedAndDiesAfter30IdleDays(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	for i := 0; i < 3; i++ {
		env.Clock.Advance(25 * 24 * time.Hour)
		if r := c.Get("/api/me"); r.Status != 200 {
			t.Fatalf("day %d: %d", (i+1)*25, r.Status)
		}
	}
	env.Clock.Advance(31 * 24 * time.Hour)
	if r := c.Get("/api/me"); r.Status != 401 {
		t.Fatalf("after 31 idle days: %d, want 401", r.Status)
	}
}

func TestDevLoginIsAbsentUnlessEnabled(t *testing.T) {
	env := testkit.Start(t) // DevLogin off by default in testkit
	r := env.Anonymous().Post("/api/dev/login", map[string]string{"email": testkit.AdminEmail})
	if r.Status != 404 {
		t.Fatalf("status = %d, want 404 when FEEDER_DEV_LOGIN is off", r.Status)
	}
}

func TestDevLogin(t *testing.T) {
	env := testkit.Start(t, testkit.WithConfig(func(c *config.Config) { c.DevLogin = true }))
	c := env.Anonymous()
	r := c.Post("/api/dev/login", map[string]string{"email": "USER@example.test"})
	var got me
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Email != testkit.UserEmail {
		t.Fatalf("login = %d %+v", r.Status, got)
	}
	ck := c.Cookie(auth.CookieName)
	if ck == nil || !ck.HttpOnly {
		t.Fatalf("session cookie missing or not HttpOnly: %+v", ck)
	}
	if c.Get("/api/me").Status != 200 {
		t.Fatal("dev login must give a working session")
	}

	r = env.Anonymous().Post("/api/dev/login", map[string]string{"email": "stranger@example.test"})
	if r.Status != 403 || r.ErrorCode() != "not_allowed" {
		t.Fatalf("stranger = %d %s, want 403 not_allowed", r.Status, r.Body)
	}
	r = env.Anonymous().Post("/api/dev/login", "not json")
	if r.Status != 400 {
		t.Fatalf("bad body = %d, want 400", r.Status)
	}
}

func TestSessionCookieSecureOnlyForHTTPSBaseURL(t *testing.T) {
	env := testkit.Start(t, testkit.WithConfig(func(c *config.Config) {
		c.DevLogin = true
		c.BaseURL = "https://feeder.example.test"
	}))
	r := env.Anonymous().Post("/api/dev/login", map[string]string{"email": testkit.UserEmail})
	found := false
	for _, ck := range (&http.Response{Header: r.Header}).Cookies() {
		if ck.Name == auth.CookieName {
			found = true
			if !ck.Secure || !ck.HttpOnly || ck.SameSite != http.SameSiteLaxMode {
				t.Fatalf("cookie = %+v", ck)
			}
		}
	}
	if !found {
		t.Fatal("no session cookie")
	}
}
