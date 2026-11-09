package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/auth"
)

// fakeGoogle imitates Google's token and userinfo endpoints. Real Google is never contacted.
type fakeGoogle struct {
	srv        *httptest.Server
	mu         sync.Mutex
	tokenForm  url.Values
	tokenAuth  string
	userinfo   map[string]any
	tokenCode  int
	userCode   int
	userBearer string
}

func newFakeGoogle(t *testing.T) *fakeGoogle {
	g := &fakeGoogle{tokenCode: 200, userCode: 200, userinfo: map[string]any{"email": "Anna@Example.test", "email_verified": true, "name": "Anna Rossi", "picture": "https://img.test/a.png"}}
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		g.mu.Lock()
		defer g.mu.Unlock()
		_ = r.ParseForm()
		g.tokenForm = r.PostForm
		g.tokenAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(g.tokenCode)
		json.NewEncoder(w).Encode(map[string]any{"access_token": "tok-123", "token_type": "Bearer", "expires_in": 3600})
	})
	mux.HandleFunc("/userinfo", func(w http.ResponseWriter, r *http.Request) {
		g.mu.Lock()
		defer g.mu.Unlock()
		g.userBearer = r.Header.Get("Authorization")
		w.WriteHeader(g.userCode)
		json.NewEncoder(w).Encode(g.userinfo)
	})
	g.srv = httptest.NewServer(mux)
	t.Cleanup(g.srv.Close)
	return g
}

func (g *fakeGoogle) provider() *auth.GoogleProvider {
	return auth.NewGoogleProvider("client-id", "client-secret",
		auth.WithGoogleEndpoints(g.srv.URL+"/authorize", g.srv.URL+"/token", g.srv.URL+"/userinfo"))
}

func TestGoogleAuthURLCarriesPKCEStateAndScopes(t *testing.T) {
	p := auth.NewGoogleProvider("client-id", "secret")
	raw := p.AuthURL("state-1", "challenge-1", "https://feeder.example/auth/google/callback")
	u, err := url.Parse(raw)
	if err != nil || u.Host != "accounts.google.com" {
		t.Fatalf("auth URL = %q (%v), want accounts.google.com", raw, err)
	}
	q := u.Query()
	want := map[string]string{
		"client_id": "client-id", "response_type": "code", "state": "state-1",
		"code_challenge": "challenge-1", "code_challenge_method": "S256",
		"redirect_uri": "https://feeder.example/auth/google/callback",
	}
	for k, v := range want {
		if q.Get(k) != v {
			t.Errorf("%s = %q, want %q", k, q.Get(k), v)
		}
	}
	scopes := strings.Fields(q.Get("scope"))
	for _, s := range []string{"openid", "email", "profile"} {
		found := false
		for _, have := range scopes {
			found = found || have == s
		}
		if !found {
			t.Errorf("scope %q missing from %q", s, q.Get("scope"))
		}
	}
	if q.Get("client_secret") != "" {
		t.Error("the client secret must never appear in the browser URL")
	}
}

func TestGoogleExchangeSendsVerifierAndReturnsIdentity(t *testing.T) {
	g := newFakeGoogle(t)
	id, err := g.provider().Exchange(context.Background(), "the-code", "the-verifier", "https://feeder.example/auth/google/callback")
	if err != nil {
		t.Fatal(err)
	}
	if id.Email != "Anna@Example.test" || !id.EmailVerified || id.Name != "Anna Rossi" || id.Picture != "https://img.test/a.png" {
		t.Fatalf("identity = %+v", id)
	}
	f := g.tokenForm
	if f.Get("grant_type") != "authorization_code" || f.Get("code") != "the-code" || f.Get("code_verifier") != "the-verifier" ||
		f.Get("redirect_uri") != "https://feeder.example/auth/google/callback" {
		t.Errorf("token request = %v", f)
	}
	if g.userBearer != "Bearer tok-123" {
		t.Errorf("userinfo Authorization = %q", g.userBearer)
	}
}

func TestGoogleExchangeErrors(t *testing.T) {
	t.Run("token endpoint refuses the code", func(t *testing.T) {
		g := newFakeGoogle(t)
		g.tokenCode = 400
		if _, err := g.provider().Exchange(context.Background(), "bad", "v", "https://x/cb"); err == nil {
			t.Fatal("want an error")
		}
	})
	t.Run("userinfo fails", func(t *testing.T) {
		g := newFakeGoogle(t)
		g.userCode = 500
		if _, err := g.provider().Exchange(context.Background(), "c", "v", "https://x/cb"); err == nil {
			t.Fatal("want an error")
		}
	})
	t.Run("userinfo without an email", func(t *testing.T) {
		g := newFakeGoogle(t)
		g.userinfo = map[string]any{"name": "No Email"}
		if _, err := g.provider().Exchange(context.Background(), "c", "v", "https://x/cb"); err == nil {
			t.Fatal("want an error when Google gives no email")
		}
	})
}
