package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
)

func ok(w http.ResponseWriter, r *http.Request) {
	u, found := auth.UserFrom(r.Context())
	if !found {
		http.Error(w, "no user in context", 500)
		return
	}
	w.Write([]byte(u.Email))
}

func do(h http.Handler, tok string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("GET", "/x", nil)
	if tok != "" {
		req.AddCookie(&http.Cookie{Name: auth.CookieName, Value: tok})
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func errCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var b struct {
		Error struct{ Code string } `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &b); err != nil {
		t.Fatalf("body %q is not the error shape: %v", rec.Body, err)
	}
	return b.Error.Code
}

func TestRequireUser(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	u, _ := f.svc.AddUser(ctx, "a@example.test", "A", false)
	tok, _, _ := f.svc.CreateSession(ctx, u.ID)
	h := f.svc.RequireUser(http.HandlerFunc(ok))

	rec := do(h, tok)
	if rec.Code != 200 || rec.Body.String() != "a@example.test" {
		t.Fatalf("with session: %d %q", rec.Code, rec.Body)
	}
	for name, token := range map[string]string{"no cookie": "", "bad token": "garbage"} {
		rec := do(h, token)
		if rec.Code != 401 || errCode(t, rec) != "unauthenticated" {
			t.Errorf("%s: %d %s, want 401 unauthenticated", name, rec.Code, rec.Body)
		}
	}
}

func TestRequireUserResendsCookieWhenExpirySlid(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	u, _ := f.svc.AddUser(ctx, "a@example.test", "A", false)
	tok, _, _ := f.svc.CreateSession(ctx, u.ID)
	h := f.svc.RequireUser(http.HandlerFunc(ok))

	if cs := do(h, tok).Result().Cookies(); len(cs) != 0 {
		t.Fatalf("no slide within a minute -> no Set-Cookie, got %v", cs)
	}
	f.clk.Advance(48 * time.Hour)
	rec := do(h, tok)
	var got *http.Cookie
	for _, c := range rec.Result().Cookies() {
		if c.Name == auth.CookieName {
			got = c
		}
	}
	if got == nil || got.Value != tok {
		t.Fatalf("expected refreshed session cookie, got %v", rec.Result().Cookies())
	}
	if want := f.clk.Now().Add(auth.SessionTTL); !got.Expires.Equal(want) {
		t.Errorf("cookie Expires = %v, want %v", got.Expires, want)
	}
}

func TestRequireAdmin(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	admin, _ := f.svc.AddUser(ctx, "admin@example.test", "Admin", true)
	user, _ := f.svc.AddUser(ctx, "user@example.test", "User", false)
	at, _, _ := f.svc.CreateSession(ctx, admin.ID)
	ut, _, _ := f.svc.CreateSession(ctx, user.ID)
	h := f.svc.RequireAdmin(http.HandlerFunc(ok))

	if rec := do(h, at); rec.Code != 200 {
		t.Fatalf("admin: %d", rec.Code)
	}
	if rec := do(h, ut); rec.Code != 403 || errCode(t, rec) != "forbidden" {
		t.Fatalf("user: %d %s, want 403 forbidden", rec.Code, rec.Body)
	}
	if rec := do(h, ""); rec.Code != 401 || errCode(t, rec) != "unauthenticated" {
		t.Fatalf("anonymous: %d %s, want 401", rec.Code, rec.Body)
	}
}

func TestContextWithUserRoundTrip(t *testing.T) {
	if _, ok := auth.UserFrom(context.Background()); ok {
		t.Fatal("empty context must have no user")
	}
	u := auth.User{ID: 7, Email: "a@example.test"}
	got, ok := auth.UserFrom(auth.ContextWithUser(context.Background(), u))
	if !ok || got != u {
		t.Fatalf("got %+v %v", got, ok)
	}
}

func TestRevocationHookReportsUserAndSessionKeys(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	var keys []string
	f.svc.OnRevoke(func(key string) { keys = append(keys, key) })
	u, _ := f.svc.AddUser(ctx, "a@example.test", "A", false)
	tok, _, _ := f.svc.CreateSession(ctx, u.ID)
	other, _, _ := f.svc.CreateSession(ctx, u.ID)

	// The key the middleware exposes for a request is the one the hook reports.
	var sessionKey string
	h := f.svc.RequireUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sessionKey = auth.SessionKeyFrom(r.Context())
	}))
	do(h, tok)
	if sessionKey == "" || !strings.HasPrefix(sessionKey, "session:") {
		t.Fatalf("session key = %q", sessionKey)
	}

	if err := f.svc.EndSession(ctx, tok); err != nil {
		t.Fatal(err)
	}
	if len(keys) != 1 || keys[0] != sessionKey {
		t.Fatalf("EndSession reported %v, want [%s]", keys, sessionKey)
	}

	keys = nil
	if err := f.svc.DeleteUser(ctx, u.ID); err != nil {
		t.Fatal(err)
	}
	if len(keys) != 1 || keys[0] != auth.UserKey(u.ID) || auth.UserKey(u.ID) != "user:"+strconv.FormatInt(u.ID, 10) {
		t.Fatalf("DeleteUser reported %v, want [%s]", keys, auth.UserKey(u.ID))
	}
	_ = other
}

func TestExpiredSessionReportsRevocation(t *testing.T) {
	f := newFixture(t, false)
	ctx := context.Background()
	var keys []string
	f.svc.OnRevoke(func(key string) { keys = append(keys, key) })
	u, _ := f.svc.AddUser(ctx, "a@example.test", "A", false)
	tok, _, _ := f.svc.CreateSession(ctx, u.ID)
	f.clk.Advance(auth.SessionTTL + time.Hour)
	f.svc.Authenticate(ctx, tok)
	if len(keys) != 1 || !strings.HasPrefix(keys[0], "session:") {
		t.Fatalf("expiry reported %v, want one session key", keys)
	}
}
