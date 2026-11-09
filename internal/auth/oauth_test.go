package auth_test

import (
	"bytes"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
)

func TestPKCEChallengeMatchesRFC7636Vector(t *testing.T) {
	got := auth.PKCEChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
	if want := "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"; got != want {
		t.Fatalf("challenge = %s, want %s", got, want)
	}
}

func TestNewFlowReadsStateThenVerifierFromTheReader(t *testing.T) {
	src := bytes.NewReader(append(bytes.Repeat([]byte{1}, 32), bytes.Repeat([]byte{2}, 32)...))
	f, err := auth.NewFlow(src)
	if err != nil {
		t.Fatal(err)
	}
	// base64url of 32 bytes of 0x01 / 0x02, no padding: 43 characters.
	if f.State != "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE" || f.Verifier != "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI" {
		t.Fatalf("flow = %+v", f)
	}
	if len(f.Verifier) < 43 || len(f.Verifier) > 128 || strings.ContainsAny(f.Verifier, "=+/") {
		t.Fatalf("verifier is not RFC 7636 shaped: %q", f.Verifier)
	}
	if f.Challenge() != auth.PKCEChallenge(f.Verifier) {
		t.Error("Challenge must be the S256 challenge of the verifier")
	}
}

func TestNewFlowFailsWhenRandomnessRunsOut(t *testing.T) {
	if _, err := auth.NewFlow(bytes.NewReader(make([]byte, 10))); err == nil {
		t.Fatal("want an error from a short reader")
	}
}

func TestFlowCookieRoundTrip(t *testing.T) {
	f, _ := auth.NewFlow(bytes.NewReader(bytes.Repeat([]byte{7}, 64)))
	now := time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	c := f.Cookie(true, now)
	if c.Name != auth.FlowCookieName || c.Path != "/auth/google" || !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode {
		t.Fatalf("cookie attributes = %+v", c)
	}
	if !c.Expires.Equal(now.Add(10 * time.Minute)) {
		t.Errorf("expires = %v, want now+10m", c.Expires)
	}
	back, err := auth.ParseFlowCookie(c)
	if err != nil || back != f {
		t.Fatalf("parse = %+v, %v; want %+v", back, err, f)
	}
	if f.Cookie(false, now).Secure {
		t.Error("Secure must follow the argument")
	}
}

func TestParseFlowCookieRejectsGarbage(t *testing.T) {
	for _, c := range []*http.Cookie{nil, {Name: auth.FlowCookieName, Value: ""}, {Name: auth.FlowCookieName, Value: "nodot"}, {Name: auth.FlowCookieName, Value: ".verifier"}, {Name: auth.FlowCookieName, Value: "state."}} {
		if _, err := auth.ParseFlowCookie(c); err == nil {
			t.Errorf("accepted %+v", c)
		}
	}
}

func TestFlowMatches(t *testing.T) {
	f := auth.Flow{State: "abc", Verifier: "v"}
	if !f.Matches("abc") || f.Matches("abd") || f.Matches("") || f.Matches("abcd") {
		t.Fatal("Matches wrong")
	}
	if c := auth.ClearFlowCookie(false); c.Name != auth.FlowCookieName || c.MaxAge >= 0 || c.Path != "/auth/google" {
		t.Fatalf("clear cookie = %+v", c)
	}
}
