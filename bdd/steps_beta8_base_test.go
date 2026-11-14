package bdd

import (
	"encoding/json"
	"fmt"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("beta8-base", beta8BaseSteps) }

// beta.8, base team (docs/dev/design/b8-base.md): the keptLines count of the Import Review's take-over ask, and Cook Mode and
// the notification facts ignoring a Stock Lot that has gone off by the meal's date. The ask is read from the last response
// as plain JSON (`plan.takeOvers[]`), so these steps do not depend on the Go struct.

func beta8BaseSteps(sc *godog.ScenarioContext, w *World) {
	admin := func() *testkit.Client { return w.Ensure().LoginAdmin(w.TB) }

	sc.Step(`^the review's take-over ask at "([^"]*)" counts (\d+) kept lines?$`, func(path string, want int) error {
		var out struct {
			Plan struct {
				TakeOvers []map[string]any `json:"takeOvers"`
			} `json:"plan"`
		}
		if err := json.Unmarshal(w.Last.Body, &out); err != nil {
			return fmt.Errorf("the answer is not a review: %v; %s", err, w.Last.Body)
		}
		for _, a := range out.Plan.TakeOvers {
			if a["path"] != path {
				continue
			}
			got, has := a["keptLines"]
			if !has {
				return fmt.Errorf("the ask at %s has no keptLines: %v", path, a)
			}
			if got != float64(want) {
				return fmt.Errorf("keptLines = %v, want %d", got, want)
			}
			return nil
		}
		return fmt.Errorf("no take-over ask at %s in %v", path, out.Plan.TakeOvers)
	})

	sc.Step(`^the BR-G Stock holds (\d+) g of "([^"]*)" that goes off on (\d{4}-\d\d-\d\d)$`, func(g int, name, goesOff string) error {
		var iid int64
		if err := w.Ensure().DB.QueryRow(`SELECT id FROM ingredients WHERE name = ?`, name).Scan(&iid); err != nil {
			return fmt.Errorf("no Ingredient %q: %v", name, err)
		}
		body := map[string]any{"ingredientId": iid, "quantity": g, "purchased": "2026-11-01", "goesOff": goesOff}
		if r := admin().Post("/api/stock/lots", body); r.Status != 201 {
			return fmt.Errorf("add a Stock Lot of %s: %d %s", name, r.Status, r.Body)
		}
		return nil
	})
}
