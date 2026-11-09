package bdd

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/auth/authtest"
	authhttp "github.com/fabbarix/feeder-ng/internal/auth/httpapi"
	"github.com/fabbarix/feeder-ng/internal/config"
)

func init() { RegisterSteps("auth", authSteps) }

// googleCode is the single authorisation code the fake Google hands out.
const googleCode = "bdd-code"

type googleLogin struct{ state, challenge, redirectURI string }

func authSteps(sc *godog.ScenarioContext, w *World) {
	var fake *authtest.Fake

	sc.Step(`^a running Feeder with Google sign-in$`, func() {
		fake = authtest.New()
		w.TB.Cleanup(authhttp.SetProvider(fake))
		w.Setup = append(w.Setup, func(c *config.Config) { c.BaseURL = "https://feeder.example" })
		w.Ensure()
	})
	sc.Step(`^Google knows "([^"]*)" as "([^"]*)"$`, func(email, name string) {
		fake.Accept(googleCode, auth.Identity{Email: email, EmailVerified: true, Name: name})
	})
	sc.Step(`^Google knows "([^"]*)" but has not verified it$`, func(email string) {
		fake.Accept(googleCode, auth.Identity{Email: email, EmailVerified: false})
	})

	sc.Step(`^I start Google sign-in$`, func() error {
		w.Ensure()
		w.Client = w.Env.Anonymous()
		w.Last = w.Client.Get("/auth/google/login")
		if w.Last.Status != 302 {
			return fmt.Errorf("login status = %d; body: %s", w.Last.Status, w.Last.Body)
		}
		u, err := url.Parse(w.Last.Header.Get("Location"))
		if err != nil {
			return err
		}
		q := u.Query()
		w.Vars["googleLogin"] = googleLogin{state: q.Get("state"), challenge: q.Get("code_challenge"), redirectURI: q.Get("redirect_uri")}
		return nil
	})
	sc.Step(`^the browser is sent to Google asking to come back to "([^"]*)"$`, func(want string) error {
		l := w.Vars["googleLogin"].(googleLogin)
		if l.redirectURI != want || l.state == "" || l.challenge == "" {
			return fmt.Errorf("redirect = %+v, want redirect_uri %q with a state and a PKCE challenge", l, want)
		}
		return nil
	})
	sc.Step(`^Google sends me back with the code$`, func() {
		l := w.Vars["googleLogin"].(googleLogin)
		w.Last = w.Client.Get("/auth/google/callback?state=" + url.QueryEscape(l.state) + "&code=" + googleCode)
	})
	sc.Step(`^Google sends me back with a forged state$`, func() {
		w.Last = w.Client.Get("/auth/google/callback?state=forged&code=" + googleCode)
	})
	sc.Step(`^I decline on Google's consent screen$`, func() {
		l := w.Vars["googleLogin"].(googleLogin)
		w.Last = w.Client.Get("/auth/google/callback?error=access_denied&state=" + url.QueryEscape(l.state))
	})

	sc.Step(`^the sign-in redirect goes to "([^"]*)"$`, func(want string) error {
		if w.Last.Status != 302 {
			return fmt.Errorf("status = %d, want a redirect; body: %s", w.Last.Status, w.Last.Body)
		}
		if got := w.Last.Header.Get("Location"); got != want {
			return fmt.Errorf("redirect to %q, want %q", got, want)
		}
		return nil
	})
	sc.Step(`^I have a Feeder session$`, func() error {
		if w.Client.Cookie(auth.CookieName) == nil {
			return fmt.Errorf("no session cookie")
		}
		return nil
	})
	sc.Step(`^I have no Feeder session$`, func() error {
		if w.Client.Cookie(auth.CookieName) != nil {
			return fmt.Errorf("unexpected session cookie")
		}
		return nil
	})
	sc.Step(`^Google received the PKCE verifier belonging to my sign-in$`, func() error {
		l := w.Vars["googleLogin"].(googleLogin)
		ex := fake.Exchanges()
		if len(ex) != 1 {
			return fmt.Errorf("%d exchanges, want 1", len(ex))
		}
		if auth.PKCEChallenge(ex[0].Verifier) != l.challenge {
			return fmt.Errorf("verifier does not hash to the challenge Google was given")
		}
		return nil
	})
	sc.Step(`^the allowlist has an entry for "([^"]*)"$`, func(email string) error {
		_, err := w.Ensure().Auth.UserByEmail(contextBG(), email)
		return err
	})
	sc.Step(`^the allowlist has no entry for "([^"]*)"$`, func(email string) error {
		if _, err := w.Ensure().Auth.UserByEmail(contextBG(), email); err == nil {
			return fmt.Errorf("%s is on the allowlist", email)
		}
		return nil
	})

	sc.Step(`^the Admin removes "([^"]*)" from the allowlist through the API$`, func(email string) error {
		id, err := userID(w, email)
		if err != nil {
			return err
		}
		w.Last = w.Client.Delete("/api/allowlist/" + id)
		return nil
	})
	sc.Step(`^the Admin sets Admin to (true|false) for "([^"]*)" through the API$`, func(v, email string) error {
		id, err := userID(w, email)
		if err != nil {
			return err
		}
		w.Last = w.Client.Patch("/api/allowlist/"+id, map[string]any{"isAdmin": v == "true"})
		return nil
	})
}

func userID(w *World, email string) (string, error) {
	u, err := w.Ensure().Auth.UserByEmail(contextBG(), strings.TrimSpace(email))
	if err != nil {
		return "", err
	}
	return strconv.FormatInt(u.ID, 10), nil
}
