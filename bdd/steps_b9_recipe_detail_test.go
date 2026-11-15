package bdd

import (
	"encoding/json"
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

	// Ruling 3: a Recipe that calls for a Base recipe, so the Base recipe is in use and its detail says why it can't go.
	sc.Step(`^I create the Recipe "([^"]*)" calling for (\d+) g of the Base recipe "([^"]*)"$`, func(name string, grams int, base string) error {
		body := fmt.Sprintf(`{"name": %q, "yield": 4, "lines": [{"baseRecipeId": %v, "quantity": %d, "unit": "g"}]}`, name, w.Vars["recipe:"+base], grams)
		w.Last = w.Client.Do("POST", "/api/recipes", []byte(body))
		var v struct {
			ID int64 `json:"id"`
		}
		if w.Last.Status != 201 || json.Unmarshal(w.Last.Body, &v) != nil {
			return fmt.Errorf("create %q = %d %s", name, w.Last.Status, w.Last.Body)
		}
		w.Vars["recipe:"+name] = v.ID
		return nil
	})
}
