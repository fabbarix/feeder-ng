package httpapi_test

import (
	"fmt"
	"net/http"
	"net/url"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/auth/authtest"
	authhttp "github.com/fabbarix/feeder-ng/internal/auth/httpapi"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Decision A7: FEEDER_TRUST_PROXY is off by default, so the IP limit uses the socket peer and an X-Forwarded-For
// header is just text from the visitor. With it on (Helm sets it when an ingress is enabled) the LAST entry counts.
// These tests are regression guards for what phase 1 built; the default itself is tested in internal/config.

type forwardedRig struct {
	t    *testing.T
	env  *testkit.Env
	fake *authtest.Fake
	n    int
}

func startForwarded(t *testing.T, trust bool) *forwardedRig {
	t.Helper()
	fake := authtest.New()
	t.Cleanup(authhttp.SetProvider(fake))
	env := testkit.Start(t, testkit.WithConfig(func(c *config.Config) {
		c.BaseURL = "http://feeder.example" // not https: the cookie jar here would drop Secure cookies on the http test server
		c.TrustProxy = trust
	}))
	return &forwardedRig{t: t, env: env, fake: fake}
}

// ask plays a Google sign-in for a new verified visitor whose requests carry X-Forwarded-For (one header line per argument), and returns where
// the callback redirected.
func (g *forwardedRig) ask(xff ...string) string {
	g.t.Helper()
	g.n++
	email := fmt.Sprintf("visitor%d@example.test", g.n)
	code := fmt.Sprintf("code-%d", g.n)
	g.fake.Accept(code, auth.Identity{Email: email, EmailVerified: true, Name: "V"})
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	var held []*http.Cookie // kept by hand: the flow cookie expires on the fake clock, which a cookie jar would judge by real time
	get := func(u string) *http.Response {
		req, _ := http.NewRequest(http.MethodGet, u, nil)
		for _, line := range xff { // one header line each, like HAProxy or Envoy appending their own
			req.Header.Add("X-Forwarded-For", line)
		}
		for _, ck := range held {
			req.AddCookie(ck)
		}
		resp, err := client.Do(req)
		if err != nil {
			g.t.Fatal(err)
		}
		resp.Body.Close()
		held = append(held, resp.Cookies()...)
		return resp
	}
	login := get(g.env.URL() + "/auth/google/login")
	loc, _ := url.Parse(login.Header.Get("Location"))
	cb := get(g.env.URL() + "/auth/google/callback?state=" + url.QueryEscape(loc.Query().Get("state")) + "&code=" + code)
	return cb.Header.Get("Location")
}

func TestWithTheProxyNotTrustedAForwardedHeaderCannotEscapeTheIPLimit(t *testing.T) {
	g := startForwarded(t, false)
	for i := range 10 {
		if got := g.ask(fmt.Sprintf("198.51.100.%d", i+1)); got != waiting {
			t.Fatalf("visitor %d -> %q", i, got)
		}
	}
	if got := g.ask("198.51.100.99"); got != limited {
		t.Fatalf("the 11th visitor from one peer with yet another X-Forwarded-For -> %q, want %s (the header must be ignored)", got, limited)
	}
}

func TestWithTheProxyTrustedEachForwardedClientHasItsOwnLimit(t *testing.T) {
	g := startForwarded(t, true)
	for i := range 12 {
		if got := g.ask(fmt.Sprintf("198.51.100.%d", i+1)); got != waiting {
			t.Fatalf("client %d behind the proxy -> %q, want its own quota", i, got)
		}
	}
	for i := range 10 {
		// The proxy appends the real peer last; entries before it are client-supplied and must not change the bucket.
		if got := g.ask(fmt.Sprintf("6.6.6.%d, 203.0.113.9", i)); got != waiting {
			t.Fatalf("visitor %d from 203.0.113.9 -> %q", i, got)
		}
	}
	if got := g.ask("1.2.3.4, 203.0.113.9"); got != limited {
		t.Fatalf("the 11th visitor from 203.0.113.9 -> %q, want %s", got, limited)
	}
}

// Review send-back: Header.Get returns only the first X-Forwarded-For line, which the visitor wrote. The proxy's own
// entry is on the LAST line, so every line is joined and the last entry counts.
func TestWithTheProxyTrustedTheLastForwardedHeaderLineCounts(t *testing.T) {
	g := startForwarded(t, true)
	for i := range 10 {
		if got := g.ask(fmt.Sprintf("6.6.6.%d", i), "203.0.113.9"); got != waiting {
			t.Fatalf("visitor %d from 203.0.113.9 -> %q", i, got)
		}
	}
	if got := g.ask("1.2.3.4", "203.0.113.9"); got != limited {
		t.Fatalf("the 11th visitor, whose own X-Forwarded-For line differs -> %q, want %s (the proxy's line is the one that counts)", got, limited)
	}
}

// A subscriber owns a whole /64, so one IPv6 client cannot dodge the limit by rotating addresses inside it.
func TestWithTheProxyTrustedAnIPv6ClientIsLimitedPerSlash64(t *testing.T) {
	g := startForwarded(t, true)
	for i := range 10 {
		if got := g.ask(fmt.Sprintf("2001:db8:1:2::%x", i+1)); got != waiting {
			t.Fatalf("visitor %d -> %q", i, got)
		}
	}
	if got := g.ask("2001:db8:1:2:aaaa:bbbb:cccc:dddd"); got != limited {
		t.Fatalf("the 11th address inside the same /64 -> %q, want %s", got, limited)
	}
	if got := g.ask("2001:db8:1:3::1"); got != waiting {
		t.Fatalf("a different /64 -> %q, want its own quota", got)
	}
}
