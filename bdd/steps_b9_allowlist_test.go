package bdd

import (
	"fmt"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("b9_allowlist", b9AllowlistSteps) }

// b9AllowlistSteps drives B9-52 (SET-03): the signedIn flag of an entry of GET /api/allowlist (an array, which the common
// JSON-field step cannot address).
func b9AllowlistSteps(sc *godog.ScenarioContext, w *World) {
	sc.Step(`^the allowlist entry for "([^"]*)" has signedIn (true|false)$`, func(email, want string) error {
		var list []struct {
			Email    string `json:"email"`
			SignedIn *bool  `json:"signedIn"`
		}
		if err := w.Last.JSON(&list); err != nil {
			return fmt.Errorf("response is not a JSON array: %v; body: %s", err, w.Last.Body)
		}
		for _, e := range list {
			if e.Email != email {
				continue
			}
			if e.SignedIn == nil {
				return fmt.Errorf("%s has no signedIn field; body: %s", email, w.Last.Body)
			}
			if got := fmt.Sprint(*e.SignedIn); got != want {
				return fmt.Errorf("%s: signedIn = %s, want %s", email, got, want)
			}
			return nil
		}
		return fmt.Errorf("no entry for %s; body: %s", email, w.Last.Body)
	})
}
