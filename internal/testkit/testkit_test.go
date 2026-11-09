package testkit_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func TestStartServesHealthWithFixedClock(t *testing.T) {
	env := testkit.Start(t)
	if r := env.Anonymous().Get("/api/health"); r.Status != 200 {
		t.Fatalf("health = %d", r.Status)
	}
	if !env.Clock.Now().Equal(testkit.StartTime) {
		t.Fatalf("clock = %v, want %v", env.Clock.Now(), testkit.StartTime)
	}
	if env.DataDir == "" || env.URL() == "" {
		t.Fatal("DataDir and URL must be set")
	}
}

func TestStartSeedsAdminAndUser(t *testing.T) {
	env := testkit.Start(t)
	a, err := env.Auth.UserByEmail(t.Context(), testkit.AdminEmail)
	if err != nil || !a.IsAdmin {
		t.Fatalf("admin = %+v, %v", a, err)
	}
	u, err := env.Auth.UserByEmail(t.Context(), testkit.UserEmail)
	if err != nil || u.IsAdmin {
		t.Fatalf("user = %+v, %v", u, err)
	}
}

func TestEnvironmentsAreIsolated(t *testing.T) {
	a := testkit.Start(t)
	b := testkit.Start(t)
	a.AddUser(t, "only-in-a@example.test", "A", false)
	if _, err := b.Auth.UserByEmail(t.Context(), "only-in-a@example.test"); err == nil {
		t.Fatal("environments must not share a database")
	}
	if a.DataDir == b.DataDir {
		t.Fatal("environments must not share a data dir")
	}
}

func TestLoginHelpersGiveWorkingSessionsWithoutGoogle(t *testing.T) {
	env := testkit.Start(t)
	if r := env.LoginAdmin(t).Get("/api/me"); r.Status != 200 {
		t.Fatalf("admin /api/me = %d", r.Status)
	}
	if r := env.LoginUser(t).Get("/api/me"); r.Status != 200 {
		t.Fatalf("user /api/me = %d", r.Status)
	}
	extra := env.AddUser(t, "extra@example.test", "Extra", false)
	if extra.ID == 0 {
		t.Fatal("AddUser must return the stored user")
	}
	if r := env.LoginAs(t, "extra@example.test").Get("/api/me"); r.Status != 200 {
		t.Fatalf("extra /api/me = %d", r.Status)
	}
	if r := env.Anonymous().Get("/api/me"); r.Status != 401 {
		t.Fatalf("anonymous /api/me = %d", r.Status)
	}
}

func TestRestartKeepsDataSessionsAndSingleAdmin(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	old := env.URL()
	env.Restart(t)
	if env.URL() == old {
		t.Log("server URL reused; acceptable")
	}
	if r := c.Get("/api/me"); r.Status != 200 {
		t.Fatalf("session must survive a restart, got %d", r.Status)
	}
	var n int
	env.DB.QueryRow("SELECT count(*) FROM users WHERE is_admin=1").Scan(&n)
	if n != 1 {
		t.Fatalf("admins after restart = %d, want 1 (seeding is idempotent)", n)
	}
}

func TestWithConfigOverrides(t *testing.T) {
	env := testkit.Start(t, testkit.WithConfig(func(c *config.Config) { c.AdminEmail = "boss@example.test" }))
	if _, err := env.Auth.UserByEmail(t.Context(), "boss@example.test"); err != nil {
		t.Fatalf("custom admin not seeded: %v", err)
	}
}

func TestResponseHelpers(t *testing.T) {
	env := testkit.Start(t)
	r := env.Anonymous().Get("/api/me")
	if r.ErrorCode() != "unauthenticated" {
		t.Fatalf("ErrorCode = %q", r.ErrorCode())
	}
	h := env.Anonymous().Get("/api/health")
	var body struct{ Status string }
	h.MustJSON(t, &body)
	if body.Status != "ok" || h.ErrorCode() != "" || h.String() == "" {
		t.Fatalf("body = %+v / %q", body, h.String())
	}
}

func TestClientSendsJSONBodies(t *testing.T) {
	env := testkit.Start(t, testkit.WithConfig(func(c *config.Config) { c.DevLogin = true }))
	r := env.Anonymous().Post("/api/dev/login", map[string]string{"email": testkit.AdminEmail})
	if r.Status != 200 {
		t.Fatalf("status = %d %s", r.Status, r.Body)
	}
}
