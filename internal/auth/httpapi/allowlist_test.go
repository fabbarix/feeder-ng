package httpapi_test

import (
	"net/http"
	"strconv"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

type allowed struct {
	ID          int64  `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	IsAdmin     bool   `json:"isAdmin"`
}

func TestAllowlistIsAdminOnly(t *testing.T) {
	env := testkit.Start(t)
	user, anon := env.LoginUser(t), env.Anonymous()
	calls := []struct{ method, path string }{
		{"GET", "/api/allowlist"}, {"POST", "/api/allowlist"}, {"PATCH", "/api/allowlist/1"}, {"DELETE", "/api/allowlist/1"},
	}
	for _, c := range calls {
		if r := anon.Do(c.method, c.path, map[string]any{}); r.Status != 401 {
			t.Errorf("anonymous %s %s = %d", c.method, c.path, r.Status)
		}
		if r := user.Do(c.method, c.path, map[string]any{}); r.Status != 403 || r.ErrorCode() != "forbidden" {
			t.Errorf("User %s %s = %d %s", c.method, c.path, r.Status, r.Body)
		}
	}
}

func TestAllowlistListAddAndNormalise(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	var list []allowed
	admin.Get("/api/allowlist").MustJSON(t, &list)
	if len(list) != 2 || list[0].Email != testkit.AdminEmail || !list[0].IsAdmin || list[1].Email != testkit.UserEmail {
		t.Fatalf("list = %+v", list)
	}
	var created allowed
	r := admin.Post("/api/allowlist", map[string]any{"email": "  Nonna@Example.TEST "})
	r.MustJSON(t, &created)
	if r.Status != http.StatusCreated || created.Email != "nonna@example.test" || created.DisplayName != "nonna" || created.IsAdmin || created.ID == 0 {
		t.Fatalf("create = %d %+v", r.Status, created)
	}
	r = admin.Post("/api/allowlist", map[string]any{"email": "boss2@example.test", "displayName": "Second Boss", "isAdmin": true})
	r.MustJSON(t, &created)
	if r.Status != 201 || !created.IsAdmin || created.DisplayName != "Second Boss" {
		t.Fatalf("create admin = %d %+v", r.Status, created)
	}
}

func TestAllowlistAddValidation(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	if r := admin.Post("/api/allowlist", map[string]any{"email": "not-an-email"}); r.Status != 422 || r.ErrorCode() != "validation_failed" {
		t.Errorf("bad email = %d %s", r.Status, r.Body)
	}
	if r := admin.Post("/api/allowlist", map[string]any{"email": testkit.UserEmail}); r.Status != 409 || r.ErrorCode() != "email_taken" {
		t.Errorf("duplicate = %d %s", r.Status, r.Body)
	}
	if r := admin.Post("/api/allowlist", map[string]any{"email": "USER@example.test"}); r.Status != 409 {
		t.Errorf("duplicate with different case = %d", r.Status)
	}
	if r := admin.Post("/api/allowlist", "not json"); r.Status != 400 {
		t.Errorf("bad JSON = %d", r.Status)
	}
}

func idOf(t *testing.T, env *testkit.Env, email string) string {
	t.Helper()
	u, err := env.Auth.UserByEmail(t.Context(), email)
	if err != nil {
		t.Fatal(err)
	}
	return strconv.FormatInt(u.ID, 10)
}

func TestAllowlistSetAdmin(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	id := idOf(t, env, testkit.UserEmail)
	var got allowed
	r := admin.Patch("/api/allowlist/"+id, map[string]any{"isAdmin": true})
	r.MustJSON(t, &got)
	if r.Status != 200 || !got.IsAdmin {
		t.Fatalf("grant = %d %+v", r.Status, got)
	}
	// The newly made Admin can use Admin routes straight away on the same session.
	if r := env.LoginUser(t).Get("/api/allowlist"); r.Status != 200 {
		t.Errorf("new Admin list = %d", r.Status)
	}
	if r := admin.Patch("/api/allowlist/"+id, map[string]any{"isAdmin": false}); r.Status != 200 {
		t.Errorf("revoke = %d", r.Status)
	}
	if r := env.LoginUser(t).Get("/api/allowlist"); r.Status != 403 {
		t.Errorf("revoked Admin list = %d, want 403", r.Status)
	}
	if r := admin.Patch("/api/allowlist/9999", map[string]any{"isAdmin": true}); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("unknown = %d %s", r.Status, r.Body)
	}
}

func TestLastAdminCannotBeDemotedOrRemoved(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	id := idOf(t, env, testkit.AdminEmail)
	if r := admin.Patch("/api/allowlist/"+id, map[string]any{"isAdmin": false}); r.Status != 409 || r.ErrorCode() != "last_admin" {
		t.Errorf("demote = %d %s", r.Status, r.Body)
	}
	if r := admin.Delete("/api/allowlist/" + id); r.Status != 409 || r.ErrorCode() != "last_admin" {
		t.Errorf("remove = %d %s", r.Status, r.Body)
	}
	if r := admin.Get("/api/me"); r.Status != 200 {
		t.Errorf("the Admin must still be signed in: %d", r.Status)
	}
}

func TestRemovingAUserEndsTheirSessionAtOnce(t *testing.T) {
	env := testkit.Start(t)
	admin, user := env.LoginAdmin(t), env.LoginUser(t)
	if r := user.Get("/api/me"); r.Status != 200 {
		t.Fatalf("precondition: %d", r.Status)
	}
	if r := admin.Delete("/api/allowlist/" + idOf(t, env, testkit.UserEmail)); r.Status != 204 {
		t.Fatalf("remove = %d %s", r.Status, r.Body)
	}
	if r := user.Get("/api/me"); r.Status != 401 {
		t.Fatalf("removed User /api/me = %d, want 401", r.Status)
	}
	if r := admin.Delete("/api/allowlist/9999"); r.Status != 404 {
		t.Errorf("unknown = %d", r.Status)
	}
}

func TestAnAdminMayRemoveThemselvesWhenAnotherAdminExists(t *testing.T) {
	env := testkit.Start(t)
	env.AddUser(t, "boss2@example.test", "Boss 2", true)
	admin := env.LoginAdmin(t)
	if r := admin.Delete("/api/allowlist/" + idOf(t, env, testkit.AdminEmail)); r.Status != 204 {
		t.Fatalf("self-removal = %d %s", r.Status, r.Body)
	}
	if r := admin.Get("/api/me"); r.Status != 401 {
		t.Errorf("after self-removal /api/me = %d", r.Status)
	}
}
