package bdd

import (
	"fmt"
	"strings"
	"time"

	"github.com/cucumber/godog"

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
