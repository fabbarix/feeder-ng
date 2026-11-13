package bdd

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/cucumber/godog"
)

// Step definitions for bdd/features/supplies/supplies_catalogue.feature (H2: the Supply domain and the Ingredient API).
// They reuse the Ingredient steps of steps_ingredients_test.go: a Supply is remembered as w.Vars["ingredient:<name>"],
// so "I merge the Ingredient ... into ..." and "the Ingredient ... still exists" work on it.
// The step set is named supplies-catalogue so H8's steps_supplies_test.go (supplies.feature and the rest) can register
// its own.

func init() { RegisterSteps("supplies-catalogue", suppliesCatalogueSteps) }

func suppliesCatalogueSteps(sc *godog.ScenarioContext, w *World) {
	createSupply := func(row map[string]string) error {
		body := map[string]any{"name": row["name"], "baseUnit": row["baseUnit"], "kind": "supply"}
		if l := strings.TrimSpace(row["restockLevel"]); l != "" {
			f, err := strconv.ParseFloat(l, 64)
			if err != nil {
				return fmt.Errorf("bad Restock level %q", l)
			}
			body["restockLevel"] = f
		}
		r := w.Client.Post("/api/ingredients", body)
		if r.Status != 201 {
			return fmt.Errorf("creating the Supply %q: status %d: %s", row["name"], r.Status, r.Body)
		}
		var out struct{ ID int64 }
		if err := r.JSON(&out); err != nil {
			return err
		}
		w.Vars["ingredient:"+row["name"]] = out.ID
		return nil
	}

	sc.Step(`^the Household has these Supplies:$`, func(t *godog.Table) error {
		head := t.Rows[0].Cells
		for _, r := range t.Rows[1:] {
			row := map[string]string{}
			for i, c := range r.Cells {
				row[head[i].Value] = c.Value
			}
			if err := createSupply(row); err != nil {
				return err
			}
		}
		return nil
	})

	sc.Step(`^the Household has the Recipe "([^"]*)" with a line of the Ingredient "([^"]*)"$`, func(recipe, ing string) error {
		id, ok := w.Vars["ingredient:"+ing].(int64)
		if !ok {
			return fmt.Errorf("no Ingredient %q was set up by this scenario", ing)
		}
		r := w.Client.Post("/api/recipes", map[string]any{
			"name": recipe, "yield": 2, "tags": []string{},
			"lines": []any{map[string]any{"ingredientId": id, "quantity": 1, "unit": "piece"}},
		})
		if r.Status != 201 {
			return fmt.Errorf("creating the Recipe %q: status %d: %s", recipe, r.Status, r.Body)
		}
		return nil
	})

	sc.Step(`^I list the Ingredients of kind "([^"]*)"$`, func(kind string) {
		w.Last = w.Client.Get("/api/ingredients?kind=" + url.QueryEscape(kind))
	})

	sc.Step(`^the response JSON field "([^"]*)" is null$`, func(path string) error {
		var cur any
		if err := w.Last.JSON(&cur); err != nil {
			return fmt.Errorf("response is not JSON: %v; body: %s", err, w.Last.Body)
		}
		for _, key := range strings.Split(path, ".") {
			m, ok := cur.(map[string]any)
			if !ok {
				return fmt.Errorf("path %q: %v is not an object", path, cur)
			}
			if cur, ok = m[key]; !ok {
				return fmt.Errorf("path %q: key %q is missing (it must be present and null); body: %s", path, key, w.Last.Body)
			}
		}
		if cur != nil {
			return fmt.Errorf("field %q = %v, want null", path, cur)
		}
		return nil
	})

	sc.Step(`^the error reason is "([^"]*)"$`, func(want string) error {
		var b struct {
			Error struct {
				Reason string `json:"reason"`
			} `json:"error"`
		}
		if err := w.Last.JSON(&b); err != nil {
			return err
		}
		if b.Error.Reason != want {
			return fmt.Errorf("error reason = %q, want %q; body: %s", b.Error.Reason, want, w.Last.Body)
		}
		return nil
	})

	sc.Step(`^the error reasons are "([^"]*)"$`, func(want string) error {
		var b struct {
			Error struct {
				Reasons []string `json:"reasons"`
			} `json:"error"`
		}
		if err := w.Last.JSON(&b); err != nil {
			return err
		}
		if got := strings.Join(b.Error.Reasons, ", "); got != want {
			return fmt.Errorf("error reasons = %q, want %q; body: %s", got, want, w.Last.Body)
		}
		return nil
	})
}
