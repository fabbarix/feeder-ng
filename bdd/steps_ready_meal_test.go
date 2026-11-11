package bdd

import (
	"encoding/json"
	"fmt"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/units"
)

func init() { RegisterSteps("ready-meal", readyMealSteps) }

// readyMealSteps adds the one step R14 needs beyond the Recipes and Import steps: a Recipe saved with a derived
// line has an Ingredient the scenario never created itself, so a later request needs its id.
func readyMealSteps(sc *godog.ScenarioContext, w *World) {
	sc.Step(`^I remember the id of the Ingredient "([^"]*)"$`, func(name string) error {
		r := w.Client.Do("GET", "/api/ingredients", nil)
		var list []struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		}
		if err := json.Unmarshal(r.Body, &list); err != nil {
			return fmt.Errorf("listing Ingredients: %v; body: %s", err, r.Body)
		}
		for _, i := range list {
			if units.NormalizeName(i.Name) == units.NormalizeName(name) {
				w.Vars["ingredient:"+name] = i.ID
				return nil
			}
		}
		return fmt.Errorf("no Ingredient %q", name)
	})
}
