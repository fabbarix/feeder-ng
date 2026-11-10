package bdd

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/auth/authtest"
	authhttp "github.com/fabbarix/feeder-ng/internal/auth/httpapi"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("access", accessSteps) }

type pendingJSON struct {
	Requests []struct {
		ID    int64  `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	} `json:"requests"`
	Count int `json:"count"`
}

func accessSteps(sc *godog.ScenarioContext, w *World) {
	var fake *authtest.Fake
	visitors := map[string]*testkit.Client{} // by lower-case email: one browser per visitor
	n := 0

	// signInAs plays the whole Google sign-in for a visitor's browser and leaves the callback in w.Last.
	signInAs := func(email, name string, verified bool) {
		n++
		code := fmt.Sprintf("access-code-%d", n)
		fake.Accept(code, auth.Identity{Email: email, EmailVerified: verified, Name: name, Picture: "https://lh3.googleusercontent.com/a/" + code})
		key := strings.ToLower(email)
		c := visitors[key]
		if c == nil {
			c = w.Env.Anonymous()
			visitors[key] = c
		}
		w.Client = c
		r := c.Get("/auth/google/login")
		u, _ := url.Parse(r.Header.Get("Location"))
		w.Last = c.Get("/auth/google/callback?state=" + url.QueryEscape(u.Query().Get("state")) + "&code=" + code)
	}
	user := func(email string) *testkit.Client {
		c, ok := w.Clients[email]
		if !ok {
			c = w.Env.LoginAs(w.TB, email)
			w.Clients[email] = c
		}
		return c
	}
	pending := func() (pendingJSON, error) {
		var p pendingJSON
		r := user(testkit.UserEmail).Get("/api/access-requests")
		if r.Status != 200 {
			return p, fmt.Errorf("GET /api/access-requests = %d %s", r.Status, r.Body)
		}
		return p, r.JSON(&p)
	}
	idOf := func(email string) (int64, error) {
		p, err := pending()
		if err != nil {
			return 0, err
		}
		for _, r := range p.Requests {
			if r.Email == strings.ToLower(email) {
				return r.ID, nil
			}
		}
		return 0, fmt.Errorf("no pending Access Request from %s", email)
	}

	sc.Step(`^(\d+) hours? pass$`, func(h int) { w.Ensure().Clock.Advance(time.Duration(h) * time.Hour) })
	sc.Step(`^a Feeder that asks new Google visitors for approval$`, func() {
		fake = authtest.New()
		w.TB.Cleanup(authhttp.SetProvider(fake))
		w.Setup = append(w.Setup, func(c *config.Config) { c.BaseURL = "https://feeder.example" })
		w.Ensure()
	})
	sc.Step(`^the visitor "([^"]*)" signs in with Google as "([^"]*)"$`, func(email, name string) { signInAs(email, name, true) })
	sc.Step(`^the visitor "([^"]*)" signs in with Google but Google has not verified the address$`, func(email string) {
		signInAs(email, "Unverified", false)
	})
	sc.Step(`^(\d+) different visitors sign in with Google$`, func(count int) {
		for i := range count {
			signInAs(fmt.Sprintf("visitor%d@example.test", i), fmt.Sprintf("Visitor %d", i), true)
		}
	})
	sc.Step(`^the visitor "([^"]*)" is denied and asks again (\d+) times, a day apart$`, func(email string, times int) error {
		for range times {
			signInAs(email, "Zia Rosa", true)
			id, err := idOf(email)
			if err != nil {
				return err
			}
			if r := user(testkit.UserEmail).Post(fmt.Sprintf("/api/access-requests/%d/deny", id), nil); r.Status != 204 {
				return fmt.Errorf("deny = %d %s", r.Status, r.Body)
			}
			w.Env.Clock.Advance(25 * time.Hour)
		}
		return nil
	})

	sc.Step(`^the Household has a Member "([^"]*)" with the email "([^"]*)"$`, func(name, email string) error {
		r := w.Env.LoginAdmin(w.TB).Post("/api/members", map[string]any{"name": name, "colour": "#3366cc", "portionFactor": 1, "email": email})
		if r.Status != 201 {
			return fmt.Errorf("create Member with an email: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the Member "([^"]*)" is linked to the User "([^"]*)"$`, func(member, email string) error {
		u, err := w.Env.Auth.UserByEmail(contextBG(), email)
		if err != nil {
			return err
		}
		var members []struct {
			Name   string `json:"name"`
			UserID *int64 `json:"userId"`
		}
		r := w.Env.LoginAdmin(w.TB).Get("/api/members")
		if err := r.JSON(&members); err != nil {
			return err
		}
		for _, m := range members {
			if m.Name == member && m.UserID != nil && *m.UserID == u.ID {
				return nil
			}
		}
		return fmt.Errorf("Member %q is not linked to %s: %s", member, email, r.Body)
	})

	sc.Step(`^"([^"]*)" is now a User$`, func(email string) error {
		_, err := w.Env.Auth.UserByEmail(contextBG(), email)
		return err
	})
	sc.Step(`^"([^"]*)" is not a User$`, func(email string) error {
		if _, err := w.Env.Auth.UserByEmail(contextBG(), email); err == nil {
			return fmt.Errorf("%s is a User", email)
		}
		return nil
	})
	sc.Step(`^there (?:is|are) (\d+) pending Access Requests?$`, func(want int) error {
		p, err := pending()
		if err != nil {
			return err
		}
		if p.Count != want || len(p.Requests) != want {
			return fmt.Errorf("%d pending Access Requests (count %d), want %d", len(p.Requests), p.Count, want)
		}
		return nil
	})
	sc.Step(`^there is a pending Access Request from "([^"]*)" named "([^"]*)"$`, func(email, name string) error {
		p, err := pending()
		if err != nil {
			return err
		}
		for _, r := range p.Requests {
			if r.Email == strings.ToLower(email) && r.Name == name {
				return nil
			}
		}
		return fmt.Errorf("no pending request from %s named %s in %+v", email, name, p.Requests)
	})

	sc.Step(`^the visitor "([^"]*)" opens the waiting page$`, func(email string) {
		w.Last = visitors[strings.ToLower(email)].Get("/api/access-request/status")
	})
	sc.Step(`^the visitor "([^"]*)" requests "([^"]*)"$`, func(email, path string) {
		w.Last = visitors[strings.ToLower(email)].Get(path)
	})
	sc.Step(`^the visitor "([^"]*)" tries to approve their own Access Request$`, func(email string) error {
		id, err := idOf(email)
		if err != nil {
			return err
		}
		w.Last = visitors[strings.ToLower(email)].Post(fmt.Sprintf("/api/access-requests/%d/approve", id), nil)
		return nil
	})
	sc.Step(`^the response does not mention "([^"]*)"$`, func(s string) error {
		if strings.Contains(string(w.Last.Body), s) {
			return fmt.Errorf("the response mentions %q: %s", s, w.Last.Body)
		}
		return nil
	})

	act := func(who, action, email string) error {
		id, err := idOf(email)
		if err != nil {
			return err
		}
		w.Last = user(who).Post(fmt.Sprintf("/api/access-requests/%d/%s", id, action), nil)
		return nil
	}
	sc.Step(`^the User "([^"]*)" approves the Access Request from "([^"]*)"$`, func(who, email string) error {
		return act(who, "approve", email)
	})
	sc.Step(`^the User "([^"]*)" denies the Access Request from "([^"]*)"$`, func(who, email string) error {
		return act(who, "deny", email)
	})
	sc.Step(`^the Admin denies the Access Request from "([^"]*)"$`, func(email string) error {
		return act(testkit.AdminEmail, "deny", email)
	})
	sc.Step(`^I (approve|deny) the Access Request from "([^"]*)" as "([^"]*)" from the origin "([^"]*)"$`, func(action, email, who, origin string) error {
		id, err := idOf(email)
		if err != nil {
			return err
		}
		req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/api/access-requests/%d/%s", w.Env.URL(), id, action), nil)
		if err != nil {
			return err
		}
		req.Header.Set("Origin", origin)
		if ck := user(who).Cookie(auth.CookieName); ck != nil {
			req.AddCookie(ck)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		var body strings.Builder
		buf := make([]byte, 512)
		for {
			k, err := resp.Body.Read(buf)
			body.Write(buf[:k])
			if err != nil {
				break
			}
		}
		w.Last = &testkit.Response{Status: resp.StatusCode, Header: resp.Header, Body: []byte(body.String())}
		return nil
	})

	sc.Step(`^the access history shows that "([^"]*)" (approved|denied) "([^"]*)"$`, func(actor, kind, email string) error {
		var h struct {
			Events []struct{ Kind, Email, ActorEmail string } `json:"events"`
		}
		r := user(testkit.UserEmail).Get("/api/access-requests/history")
		if err := r.JSON(&h); err != nil {
			return fmt.Errorf("history: %d %s", r.Status, r.Body)
		}
		for _, e := range h.Events {
			if e.Kind == kind && e.Email == email && e.ActorEmail == actor {
				return nil
			}
		}
		return fmt.Errorf("no %q of %s by %s in %s", kind, email, actor, r.Body)
	})
}
