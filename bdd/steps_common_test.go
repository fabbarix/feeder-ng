package bdd

import (
	"context"
	"fmt"
	"strings"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("common", commonSteps) }

func localPart(email string) string { return strings.SplitN(email, "@", 2)[0] }

func commonSteps(sc *godog.ScenarioContext, w *World) {
	sc.Step(`^a running Feeder$`, func() { w.Ensure() })
	sc.Step(`^a running Feeder with FEEDER_ADMIN_EMAIL "([^"]*)"$`, func(email string) {
		w.Setup = append(w.Setup, func(c *config.Config) { c.AdminEmail = email })
		w.Ensure()
	})

	sc.Step(`^I am not signed in$`, func() { w.Client = w.Ensure().Anonymous() })
	sc.Step(`^I am signed in as the Admin$`, func() { signIn(w, testkit.AdminEmail) })
	sc.Step(`^I am signed in as the User$`, func() { signIn(w, testkit.UserEmail) })
	sc.Step(`^I am signed in as "([^"]*)"$`, func(email string) { signIn(w, email) })
	sc.Step(`^"([^"]*)" is on the allowlist$`, func(email string) {
		w.Ensure().AddUser(w.TB, email, localPart(email), false)
	})

	sc.Step(`^I (GET|POST|DELETE) "([^"]*)"$`, func(method, path string) {
		w.Ensure()
		w.Last = w.Client.Do(method, path, nil)
	})
	sc.Step(`^I (POST|PUT|PATCH) "([^"]*)" with JSON:$`, func(method, path string, body *godog.DocString) {
		w.Ensure()
		w.Last = w.Client.Do(method, path, []byte(body.Content))
	})

	sc.Step(`^the response status is (\d+)$`, func(want int) error {
		if w.Last == nil {
			return fmt.Errorf("no response yet")
		}
		if w.Last.Status != want {
			return fmt.Errorf("status = %d, want %d; body: %s", w.Last.Status, want, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the error code is "([^"]*)"$`, func(want string) error {
		if got := w.Last.ErrorCode(); got != want {
			return fmt.Errorf("error code = %q, want %q; body: %s", got, want, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the response JSON field "([^"]*)" is "([^"]*)"$`, func(path, want string) error {
		return jsonFieldIs(w, path, want)
	})
	sc.Step(`^the response JSON field "([^"]*)" is (true|false)$`, func(path, want string) error {
		return jsonFieldIs(w, path, want)
	})
}

func signIn(w *World, email string) {
	env := w.Ensure()
	c, ok := w.Clients[email]
	if !ok {
		c = env.LoginAs(w.TB, email)
		w.Clients[email] = c
	}
	w.Client = c
}

func jsonFieldIs(w *World, path, want string) error {
	var doc any
	if err := w.Last.JSON(&doc); err != nil {
		return fmt.Errorf("response is not JSON: %v; body: %s", err, w.Last.Body)
	}
	cur := doc
	for _, key := range strings.Split(path, ".") {
		m, ok := cur.(map[string]any)
		if !ok {
			return fmt.Errorf("path %q: %v is not an object", path, cur)
		}
		if cur, ok = m[key]; !ok {
			return fmt.Errorf("path %q: key %q missing; body: %s", path, key, w.Last.Body)
		}
	}
	if got := fmt.Sprint(cur); got != want {
		return fmt.Errorf("field %q = %q, want %q", path, got, want)
	}
	return nil
}

func contextBG() context.Context { return context.Background() }
