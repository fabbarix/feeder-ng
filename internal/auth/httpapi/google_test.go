package httpapi_test

import (
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/auth/authtest"
	"github.com/fabbarix/feeder-ng/internal/auth/httpapi"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

const baseURL = "https://feeder.example"

type login struct {
	state, challenge, redirect, verifier string
}

func startGoogle(t *testing.T) (*testkit.Env, *authtest.Fake) {
	t.Helper()
	fake := authtest.New()
	t.Cleanup(httpapi.SetProvider(fake))
	env := testkit.Start(t, testkit.WithConfig(func(c *config.Config) { c.BaseURL = baseURL }))
	return env, fake
}

// beginLogin plays the browser's first step and returns what Google would see.
func beginLogin(t *testing.T, c *testkit.Client) login {
	t.Helper()
	r := c.Get("/auth/google/login")
	if r.Status != http.StatusFound {
		t.Fatalf("login status = %d, body %s", r.Status, r.Body)
	}
	u, err := url.Parse(r.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	ck := c.Cookie(auth.FlowCookieName)
	if ck == nil {
		t.Fatal("no flow cookie set")
	}
	flow, err := auth.ParseFlowCookie(ck)
	if err != nil {
		t.Fatal(err)
	}
	return login{state: q.Get("state"), challenge: q.Get("code_challenge"), redirect: q.Get("redirect_uri"), verifier: flow.Verifier}
}

func callback(c *testkit.Client, state, code string) *testkit.Response {
	return c.Get("/auth/google/callback?state=" + url.QueryEscape(state) + "&code=" + url.QueryEscape(code))
}

func TestLoginRedirectsToGoogleWithStateAndPKCE(t *testing.T) {
	env, _ := startGoogle(t)
	c := env.Anonymous()
	l := beginLogin(t, c)
	if l.redirect != baseURL+"/auth/google/callback" {
		t.Errorf("redirect_uri = %q", l.redirect)
	}
	if l.state == "" || len(l.verifier) < 43 || l.challenge != auth.PKCEChallenge(l.verifier) {
		t.Errorf("state/verifier/challenge inconsistent: %+v", l)
	}
	ck := c.Cookie(auth.FlowCookieName)
	if !ck.HttpOnly || ck.Path != "/auth/google" || ck.SameSite != http.SameSiteLaxMode || !ck.Secure {
		t.Errorf("flow cookie = %+v (https base URL must make it Secure)", ck)
	}
	// The verifier must never be sent to the browser's URL.
	if strings.Contains(c.Get("/auth/google/login").Header.Get("Location"), l.verifier) {
		t.Error("verifier leaked into the redirect URL")
	}
}

func TestEachLoginGetsAFreshStateAndVerifier(t *testing.T) {
	env, _ := startGoogle(t)
	a, b := beginLogin(t, env.Anonymous()), beginLogin(t, env.Anonymous())
	if a.state == b.state || a.verifier == b.verifier {
		t.Fatal("state and verifier must be random per sign-in")
	}
}

func TestCallbackSignsInAnAllowlistedUser(t *testing.T) {
	env, fake := startGoogle(t)
	fake.Accept("code-1", auth.Identity{Email: testkit.UserEmail, EmailVerified: true, Name: "Una User"})
	c := env.Anonymous()
	l := beginLogin(t, c)
	r := callback(c, l.state, "code-1")
	if r.Status != http.StatusFound || r.Header.Get("Location") != "/" {
		t.Fatalf("callback = %d -> %q", r.Status, r.Header.Get("Location"))
	}
	if c.Cookie(auth.CookieName) == nil {
		t.Fatal("no session cookie")
	}
	if c.Cookie(auth.FlowCookieName) != nil {
		t.Error("flow cookie must be cleared after the callback")
	}
	var me struct{ Email string }
	c.Get("/api/me").MustJSON(t, &me)
	if me.Email != testkit.UserEmail {
		t.Fatalf("me = %+v", me)
	}
	ex := fake.Exchanges()
	if len(ex) != 1 || ex[0].Code != "code-1" || ex[0].Verifier != l.verifier || ex[0].RedirectURL != baseURL+"/auth/google/callback" {
		t.Fatalf("exchange = %+v", ex)
	}
}

func TestCallbackMatchesEmailCaseInsensitively(t *testing.T) {
	env, fake := startGoogle(t)
	fake.Accept("c", auth.Identity{Email: "USER@Example.TEST", EmailVerified: true})
	c := env.Anonymous()
	l := beginLogin(t, c)
	if r := callback(c, l.state, "c"); r.Header.Get("Location") != "/" {
		t.Fatalf("location = %q", r.Header.Get("Location"))
	}
}

func TestCallbackRefusesAnEmailNotOnTheAllowlist(t *testing.T) {
	env, fake := startGoogle(t)
	fake.Accept("c", auth.Identity{Email: "stranger@example.test", EmailVerified: true, Name: "Stranger"})
	c := env.Anonymous()
	l := beginLogin(t, c)
	r := callback(c, l.state, "c")
	if r.Status != http.StatusFound || r.Header.Get("Location") != "/not-invited" {
		t.Fatalf("callback = %d -> %q", r.Status, r.Header.Get("Location"))
	}
	if c.Cookie(auth.CookieName) != nil {
		t.Fatal("a session was created for a stranger")
	}
	if _, err := env.Auth.UserByEmail(t.Context(), "stranger@example.test"); err == nil {
		t.Fatal("a stranger must not be added to the allowlist")
	}
}

func TestCallbackRefusesAnUnverifiedEmail(t *testing.T) {
	env, fake := startGoogle(t)
	fake.Accept("c", auth.Identity{Email: testkit.UserEmail, EmailVerified: false})
	c := env.Anonymous()
	l := beginLogin(t, c)
	r := callback(c, l.state, "c")
	if r.Header.Get("Location") != "/not-invited" || c.Cookie(auth.CookieName) != nil {
		t.Fatalf("unverified email must not sign in: %d -> %q", r.Status, r.Header.Get("Location"))
	}
}

func TestCallbackRejectsBadStateOrMissingFlow(t *testing.T) {
	env, fake := startGoogle(t)
	fake.Accept("c", auth.Identity{Email: testkit.UserEmail, EmailVerified: true})
	t.Run("state mismatch", func(t *testing.T) {
		c := env.Anonymous()
		beginLogin(t, c)
		r := callback(c, "forged-state", "c")
		if r.Header.Get("Location") != "/sign-in?error=failed" || c.Cookie(auth.CookieName) != nil {
			t.Fatalf("got %d -> %q", r.Status, r.Header.Get("Location"))
		}
	})
	t.Run("no flow cookie", func(t *testing.T) {
		c := env.Anonymous()
		r := callback(c, "anything", "c")
		if r.Header.Get("Location") != "/sign-in?error=failed" || c.Cookie(auth.CookieName) != nil {
			t.Fatalf("got %d -> %q", r.Status, r.Header.Get("Location"))
		}
	})
	t.Run("missing code", func(t *testing.T) {
		c := env.Anonymous()
		l := beginLogin(t, c)
		r := c.Get("/auth/google/callback?state=" + url.QueryEscape(l.state))
		if r.Header.Get("Location") != "/sign-in?error=failed" {
			t.Fatalf("got %d -> %q", r.Status, r.Header.Get("Location"))
		}
	})
	if n := len(fake.Exchanges()); n != 0 {
		t.Errorf("Google was asked to exchange %d codes for invalid callbacks", n)
	}
}

func TestCallbackCannotBeReplayed(t *testing.T) {
	env, fake := startGoogle(t)
	fake.Accept("c", auth.Identity{Email: testkit.UserEmail, EmailVerified: true})
	c := env.Anonymous()
	l := beginLogin(t, c)
	callback(c, l.state, "c")
	r := callback(c, l.state, "c")
	if r.Header.Get("Location") != "/sign-in?error=failed" {
		t.Fatalf("replay = %d -> %q", r.Status, r.Header.Get("Location"))
	}
}

func TestCallbackWhenThePersonDeclinesOnGoogle(t *testing.T) {
	env, _ := startGoogle(t)
	c := env.Anonymous()
	l := beginLogin(t, c)
	r := c.Get("/auth/google/callback?error=access_denied&state=" + url.QueryEscape(l.state))
	if r.Header.Get("Location") != "/sign-in?error=denied" || c.Cookie(auth.CookieName) != nil {
		t.Fatalf("got %d -> %q", r.Status, r.Header.Get("Location"))
	}
}

func TestCallbackWhenGoogleExchangeFails(t *testing.T) {
	env, _ := startGoogle(t) // no code registered: the fake errors
	c := env.Anonymous()
	l := beginLogin(t, c)
	r := callback(c, l.state, "unknown")
	if r.Header.Get("Location") != "/sign-in?error=failed" || c.Cookie(auth.CookieName) != nil {
		t.Fatalf("got %d -> %q", r.Status, r.Header.Get("Location"))
	}
}

func TestFirstSignInTakesTheNameFromGoogleOnlyWhileItIsTheDefault(t *testing.T) {
	env, fake := startGoogle(t)
	env.AddUser(t, "bea@example.test", "bea", false)       // default: local part
	env.AddUser(t, "carl@example.test", "Carlo B.", false) // customised
	fake.Accept("bea", auth.Identity{Email: "bea@example.test", EmailVerified: true, Name: "Beatrice Verdi"})
	fake.Accept("carl", auth.Identity{Email: "carl@example.test", EmailVerified: true, Name: "Carl Other"})
	for _, who := range []string{"bea", "carl"} {
		c := env.Anonymous()
		l := beginLogin(t, c)
		callback(c, l.state, who)
	}
	bea, _ := env.Auth.UserByEmail(t.Context(), "bea@example.test")
	carl, _ := env.Auth.UserByEmail(t.Context(), "carl@example.test")
	if bea.DisplayName != "Beatrice Verdi" || carl.DisplayName != "Carlo B." {
		t.Fatalf("names = %q, %q", bea.DisplayName, carl.DisplayName)
	}
}

func TestSignInIsUnavailableWithoutGoogleCredentials(t *testing.T) {
	env := testkit.Start(t) // no override, no FEEDER_GOOGLE_CLIENT_ID
	r := env.Anonymous().Get("/auth/google/login")
	if r.Status != http.StatusServiceUnavailable || r.ErrorCode() != "google_not_configured" {
		t.Fatalf("got %d %s", r.Status, r.Body)
	}
}

func TestSecureFlowCookieOnlyForHTTPSBaseURL(t *testing.T) {
	fake := authtest.New()
	t.Cleanup(httpapi.SetProvider(fake))
	env := testkit.Start(t, testkit.WithConfig(func(c *config.Config) { c.BaseURL = "http://localhost:8080" }))
	c := env.Anonymous()
	beginLogin(t, c)
	if c.Cookie(auth.FlowCookieName).Secure {
		t.Error("http base URL must not set Secure (the browser would drop the cookie)")
	}
}
