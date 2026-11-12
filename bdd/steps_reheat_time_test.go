package bdd

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

func init() { RegisterSteps("reheat-time", reheatTimeSteps) }

// reheatTimeSteps add the per-Recipe reheat time to the planning and Recipe File steps (R12).
func reheatTimeSteps(sc *godog.ScenarioContext, w *World) {
	// The planning Recipe "x" has a reheat time of N minutes: GET it and PUT it back with the field set.
	sc.Step(`^the planning Recipe "([^"]*)" has a reheat time of (\d+) minutes$`, func(name string, mins int) error {
		id, _ := w.Vars["plan:recipe:"+name].(int64)
		if id == 0 {
			return fmt.Errorf("no planning Recipe %q", name)
		}
		got := w.Client.Get(fmt.Sprintf("/api/recipes/%d", id))
		if got.Status != 200 {
			return fmt.Errorf("GET recipe: %d %s", got.Status, got.Body)
		}
		var cur struct {
			Name  string           `json:"name"`
			Yield float64          `json:"yield"`
			Tags  []string         `json:"tags"`
			Lines []map[string]any `json:"lines"`
		}
		if err := got.JSON(&cur); err != nil {
			return err
		}
		var lines []map[string]any
		for _, l := range cur.Lines {
			lines = append(lines, map[string]any{"ingredientId": l["ingredientId"], "quantity": l["quantity"], "unit": l["unit"]})
		}
		r := w.Client.Do("PUT", fmt.Sprintf("/api/recipes/%d", id), map[string]any{
			"name": cur.Name, "yield": cur.Yield, "tags": cur.Tags, "lines": lines, "reheatMinutes": mins,
		})
		if r.Status != 200 {
			return fmt.Errorf("PUT recipe: %d %s", r.Status, r.Body)
		}
		return nil
	})

	mealReheat := func(date string) (any, bool, error) {
		var v struct {
			Slots []struct {
				Date    string `json:"date"`
				Courses []struct {
					Main bool           `json:"main"`
					Meal map[string]any `json:"meal"`
				} `json:"courses"`
			} `json:"slots"`
		}
		if err := w.Last.JSON(&v); err != nil {
			return nil, false, err
		}
		for _, s := range v.Slots {
			for _, c := range s.Courses {
				if s.Date == date && c.Main && c.Meal != nil {
					x, ok := c.Meal["reheatMinutes"]
					return x, ok, nil
				}
			}
		}
		return nil, false, fmt.Errorf("no Planned Meal on %s in %s", date, w.Last.Body)
	}
	sc.Step(`^the plan slot on `+planDate+` has a reheat time of (\d+) minutes$`, func(date string, mins int) error {
		x, ok, err := mealReheat(date)
		if err != nil {
			return err
		}
		if !ok || fmt.Sprint(x) != fmt.Sprint(mins) {
			return fmt.Errorf("meal on %s reheatMinutes = %v (present %v), want %d", date, x, ok, mins)
		}
		return nil
	})
	sc.Step(`^the plan slot on `+planDate+` has no reheat time$`, func(date string) error {
		x, ok, err := mealReheat(date)
		if err != nil {
			return err
		}
		if ok {
			return fmt.Errorf("meal on %s carries reheatMinutes %v, want the key omitted", date, x)
		}
		return nil
	})

	// Recipe File: a Recipe created with a reheat time, and checks on the download and on an imported Recipe.
	sc.Step(`^the household has the Recipe File Recipe "([^"]*)" with a reheat time of (\d+) minutes, using the Ingredient "([^"]*)" in g$`,
		func(name string, mins int, ing string) error {
			r := w.Client.Do("POST", "/api/ingredients", map[string]any{"name": ing, "baseUnit": "g"})
			if r.Status != 201 {
				return fmt.Errorf("creating Ingredient: %d %s", r.Status, r.Body)
			}
			var ingr struct{ ID int64 }
			if err := r.JSON(&ingr); err != nil {
				return err
			}
			rec := w.Client.Do("POST", "/api/recipes", map[string]any{
				"name": name, "yield": 2, "reheatMinutes": mins,
				"lines": []map[string]any{{"ingredientId": ingr.ID, "quantity": 100, "unit": "g"}},
			})
			if rec.Status != 201 {
				return fmt.Errorf("creating Recipe: %d %s", rec.Status, rec.Body)
			}
			return nil
		})
	downloadedRecipe := func(name string) (recipefile.Recipe, error) {
		data, _ := w.Vars["rf-download"].([]byte)
		f, err := recipefile.Parse(data)
		if err != nil {
			return recipefile.Recipe{}, err
		}
		for _, r := range f.Recipes {
			if r.Name == name {
				return r, nil
			}
		}
		return recipefile.Recipe{}, fmt.Errorf("no Recipe %q in the download", name)
	}
	sc.Step(`^the Recipe "([^"]*)" in the downloaded Recipe File has a reheat time of (\d+) minutes$`, func(name string, mins int) error {
		r, err := downloadedRecipe(name)
		if err != nil {
			return err
		}
		if r.ReheatMinutes == nil || *r.ReheatMinutes != mins {
			return fmt.Errorf("reheatMinutes = %v, want %d", r.ReheatMinutes, mins)
		}
		return nil
	})
	sc.Step(`^the Recipe "([^"]*)" in the downloaded Recipe File has no reheat time$`, func(name string) error {
		r, err := downloadedRecipe(name)
		if err != nil {
			return err
		}
		data, _ := w.Vars["rf-download"].([]byte)
		if r.ReheatMinutes != nil || strings.Contains(string(data), `"reheatMinutes": null`) {
			return fmt.Errorf("Recipe %q should have no reheatMinutes", name)
		}
		return nil
	})
	sc.Step(`^the Recipe "([^"]*)" has a reheat time of (\d+) minutes$`, func(name string, mins int) error {
		list := w.Client.Get("/api/recipes")
		var v []struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		}
		if err := json.Unmarshal(list.Body, &v); err != nil {
			return err
		}
		for _, r := range v {
			if r.Name != name {
				continue
			}
			got := w.Client.Get(fmt.Sprintf("/api/recipes/%d", r.ID))
			var rec struct {
				ReheatMinutes *int `json:"reheatMinutes"`
			}
			if err := got.JSON(&rec); err != nil {
				return err
			}
			if rec.ReheatMinutes == nil || *rec.ReheatMinutes != mins {
				return fmt.Errorf("Recipe %q reheatMinutes = %v, want %d", name, rec.ReheatMinutes, mins)
			}
			return nil
		}
		return fmt.Errorf("no Recipe %q in %s", name, list.Body)
	})

	sc.Step(`^the Agent Prompt mentions "([^"]*)" at least (\d+) times$`, func(word string, n int) error {
		var v struct{ Prompt string }
		if err := w.Last.JSON(&v); err != nil {
			return err
		}
		if c := strings.Count(v.Prompt, word); c < n {
			return fmt.Errorf("the Agent Prompt mentions %q %d times, want at least %d", word, c, n)
		}
		return nil
	})
}
