package bdd

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/config"
)

func init() { RegisterSteps("foundation", foundationSteps) }

func foundationSteps(sc *godog.ScenarioContext, w *World) {
	sc.Step(`^the User "([^"]*)" is removed from the allowlist$`, func(email string) error {
		env := w.Ensure()
		u, err := env.Auth.UserByEmail(contextBG(), email)
		if err != nil {
			return err
		}
		return env.Auth.DeleteUser(contextBG(), u.ID)
	})
	sc.Step(`^the Feeder is restarted$`, func() { w.Ensure().Restart(w.TB) })
	sc.Step(`^(\d+) days? pass$`, func(n int) { w.Ensure().Clock.Advance(time.Duration(n) * 24 * time.Hour) })
	sc.Step(`^there (?:is|are) exactly (\d+) Admins?$`, func(want int) error {
		var n int
		if err := w.Ensure().DB.QueryRow("SELECT count(*) FROM users WHERE is_admin=1").Scan(&n); err != nil {
			return err
		}
		if n != want {
			return fmt.Errorf("admins = %d, want %d", n, want)
		}
		return nil
	})
	sc.Step(`^"([^"]*)" is an Admin$`, func(email string) error {
		u, err := w.Ensure().Auth.UserByEmail(contextBG(), email)
		if err != nil {
			return err
		}
		if !u.IsAdmin {
			return fmt.Errorf("%s is not an Admin", email)
		}
		return nil
	})

	// Configuration scenarios run without starting the app.
	sc.Step(`^the environment has no FEEDER_ADMIN_EMAIL$`, func() { w.Vars["env"] = map[string]string{} })
	sc.Step(`^the environment has FEEDER_ADMIN_EMAIL "([^"]*)"$`, func(v string) {
		w.Vars["env"] = map[string]string{"FEEDER_ADMIN_EMAIL": v}
	})
	sc.Step(`^the configuration is loaded$`, func() {
		env, _ := w.Vars["env"].(map[string]string)
		cfg, err := config.Load(func(k string) string { return env[k] })
		w.Vars["cfg"], w.Vars["cfgErr"] = cfg, err
	})
	sc.Step(`^loading the configuration fails mentioning "([^"]*)"$`, func(want string) error {
		err, _ := w.Vars["cfgErr"].(error)
		if err == nil {
			return fmt.Errorf("configuration loaded, want an error")
		}
		if !strings.Contains(err.Error(), want) {
			return fmt.Errorf("error %q does not mention %q", err, want)
		}
		return nil
	})
	sc.Step(`^the configured Admin email is "([^"]*)"$`, func(want string) error {
		if err, _ := w.Vars["cfgErr"].(error); err != nil {
			return err
		}
		if got := w.Vars["cfg"].(config.Config).AdminEmail; got != want {
			return fmt.Errorf("admin email = %q, want %q", got, want)
		}
		return nil
	})
}

// Live-update stream steps. Step text is specific to this feature: godog does
// not detect duplicate step text across files.
func init() { RegisterSteps("foundation-stream", streamSteps) }

type liveStream struct {
	lines  chan string
	cancel context.CancelFunc
}

func streamSteps(sc *godog.ScenarioContext, w *World) {
	sc.Step(`^a live-update stream is open$`, func() error {
		env := w.Ensure()
		ck := w.Client.Cookie(auth.CookieName)
		if ck == nil {
			return fmt.Errorf("current client has no session cookie")
		}
		ctx, cancel := context.WithCancel(context.Background())
		req, _ := http.NewRequestWithContext(ctx, "GET", env.URL()+"/api/events", nil)
		req.AddCookie(ck)
		resp, err := http.DefaultClient.Do(req)
		if err != nil || resp.StatusCode != 200 {
			cancel()
			return fmt.Errorf("open stream: %v %v", resp, err)
		}
		lines := make(chan string, 64)
		go func() {
			defer resp.Body.Close()
			sc := bufio.NewScanner(resp.Body)
			for sc.Scan() {
				lines <- sc.Text()
			}
			close(lines)
		}()
		w.TB.Cleanup(cancel)
		if l := <-lines; l != ": connected" {
			return fmt.Errorf("first line = %q", l)
		}
		w.Vars["stream"] = &liveStream{lines: lines, cancel: cancel}
		return nil
	})
	sc.Step(`^the live-update stream is closed without further events$`, func() error {
		s, _ := w.Vars["stream"].(*liveStream)
		if s == nil {
			return fmt.Errorf("no stream open")
		}
		w.Env.App.Deps.Events.Publish("plan", map[string]int{"week": 46}) // after revocation
		deadline := time.After(2 * time.Second)
		for {
			select {
			case l, ok := <-s.lines:
				if !ok {
					return nil
				}
				if strings.HasPrefix(l, "event:") {
					return fmt.Errorf("received %q after revocation", l)
				}
			case <-deadline:
				return fmt.Errorf("stream still open 2 s after revocation")
			}
		}
	})
}
