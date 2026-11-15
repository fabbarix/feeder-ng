package bdd

import (
	"fmt"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("b9_recipe_detail", b9RecipeDetailSteps) }

// b9RecipeDetailSteps reads one row of the last Recipes list (a JSON array) by the Recipe's name: B9-27's `stepCount` on the list summary.
func b9RecipeDetailSteps(sc *godog.ScenarioContext, w *World) {
	sc.Step(`^the listed Recipe "([^"]*)" has "([^"]*)" "([^"]*)"$`, func(name, field, want string) error {
		var rows []map[string]any
		if err := w.Last.JSON(&rows); err != nil {
			return fmt.Errorf("the last response is not a list of Recipes: %v; body: %s", err, w.Last.Body)
		}
		for _, row := range rows {
			if row["name"] != name {
				continue
			}
			got, ok := row[field]
			if !ok {
				return fmt.Errorf("the listed Recipe %q has no field %q; row: %v", name, field, row)
			}
			if fmt.Sprint(got) != want {
				return fmt.Errorf("the listed Recipe %q: %s = %v, want %s", name, field, got, want)
			}
			return nil
		}
		return fmt.Errorf("no Recipe %q in the list; body: %s", name, w.Last.Body)
	})
}
