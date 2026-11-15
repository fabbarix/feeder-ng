package bdd

import (
	"fmt"
	"strings"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

func init() { RegisterSteps("b9-import-preview", b9ImportPreviewSteps) }

// Beta.9 B9-28 (RX-01): the Preview each Recipe row of the Import Review carries, and what the import result says.
func b9ImportPreviewSteps(sc *godog.ScenarioContext, w *World) {
	review := func() recipefile.Plan { p, _ := w.Vars["rf-plan"].(recipefile.Plan); return p }
	rowOf := func(name string) (recipefile.RecipeStatus, error) {
		for _, r := range review().Recipes {
			if strings.EqualFold(r.Name, name) {
				return r, nil
			}
		}
		return recipefile.RecipeStatus{}, fmt.Errorf("no Recipe row %q in %+v", name, review().Recipes)
	}
	sc.Step(`^the review lists the Recipe "([^"]*)" with a Yield of (\d+), (\d+) Ingredient lines? and (\d+) Steps?$`, func(name string, y, lines, steps int) error {
		r, err := rowOf(name)
		if err != nil {
			return err
		}
		pv := r.Preview
		if int(pv.Yield) != y || len(pv.Lines) != lines || len(pv.Steps) != steps {
			return fmt.Errorf("%q previews Yield %v, %d lines, %d Steps; want %d, %d, %d", name, pv.Yield, len(pv.Lines), len(pv.Steps), y, lines, steps)
		}
		return nil
	})
	sc.Step(`^the review lists the Recipe "([^"]*)" as a Ready Meal with a Yield of (\d+), (\d+) Ingredient lines? and (\d+) Steps?$`, func(name string, y, lines, steps int) error {
		r, err := rowOf(name)
		if err != nil {
			return err
		}
		pv := r.Preview
		if !pv.ReadyMeal || int(pv.Yield) != y || len(pv.Lines) != lines || len(pv.Steps) != steps {
			return fmt.Errorf("%q previews %+v; want a Ready Meal with Yield %d, %d lines, %d Steps", name, pv, y, lines, steps)
		}
		return nil
	})
	sc.Step(`^the first line of the review of "([^"]*)" is (\d+) ([a-z]+) of "([^"]*)" with the note "([^"]*)"$`, func(name string, qty int, unit, ingredient, note string) error {
		r, err := rowOf(name)
		if err != nil {
			return err
		}
		if len(r.Preview.Lines) == 0 {
			return fmt.Errorf("%q previews no lines", name)
		}
		l := r.Preview.Lines[0]
		if int(l.Quantity) != qty || l.Unit != unit || l.Ingredient != ingredient || l.Note != note {
			return fmt.Errorf("first line = %+v", l)
		}
		return nil
	})
	sc.Step(`^the review lists the Recipes in the order of the file: "([^"]*)"$`, func(names string) error {
		var got []string
		for i, r := range review().Recipes {
			if r.Index != i {
				return fmt.Errorf("row %d has index %d", i, r.Index)
			}
			got = append(got, r.Name)
		}
		if strings.Join(got, ", ") != names {
			return fmt.Errorf("Recipes = %v, want %s", got, names)
		}
		return nil
	})
	sc.Step(`^the conflict for "([^"]*)" names the existing Recipe$`, func(name string) error {
		r, err := rowOf(name)
		if err != nil {
			return err
		}
		if r.Status != recipefile.RecipeConflict || r.ExistingID == 0 || r.Resolved {
			return fmt.Errorf("row = %+v", r)
		}
		return nil
	})

	// The result of Confirm: {recipes: [{index, id, name, action}], ingredientsCreated, ...}.
	type result struct {
		Recipes []struct {
			Index  int    `json:"index"`
			ID     int64  `json:"id"`
			Name   string `json:"name"`
			Action string `json:"action"`
		} `json:"recipes"`
		IngredientsCreated int `json:"ingredientsCreated"`
	}
	read := func() result {
		var v result
		w.Last.MustJSON(w.TB, &v)
		return v
	}
	sc.Step(`^the import result lists the Recipe "([^"]*)" as "(created|replaced|converted)"$`, func(name, action string) error {
		for _, r := range read().Recipes {
			if strings.EqualFold(r.Name, name) {
				if r.Action != action {
					return fmt.Errorf("%q was %q, want %q", name, r.Action, action)
				}
				return nil
			}
		}
		return fmt.Errorf("no Recipe %q in the result: %s", name, w.Last.String())
	})
	sc.Step(`^every Recipe of the import result can be opened by its id$`, func() error {
		recipes := read().Recipes
		if len(recipes) == 0 {
			return fmt.Errorf("the result lists no Recipes: %s", w.Last.String())
		}
		for _, r := range recipes {
			if r.ID == 0 {
				return fmt.Errorf("%q has no id", r.Name)
			}
			got := w.Client.Do("GET", fmt.Sprintf("/api/recipes/%d", r.ID), nil)
			if got.Status != 200 {
				return fmt.Errorf("GET /api/recipes/%d (%s) answers %d", r.ID, r.Name, got.Status)
			}
		}
		return nil
	})
	sc.Step(`^the import result says (\d+) Ingredients were created$`, func(n int) error {
		if got := read().IngredientsCreated; got != n {
			return fmt.Errorf("ingredientsCreated = %d, want %d", got, n)
		}
		return nil
	})
}
