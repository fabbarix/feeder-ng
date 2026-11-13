package bdd

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/units"
)

func init() { RegisterSteps("beta6-brc", beta6BRCSteps) }

// BR-C commit half (docs/dev/design/base-recipes.md sections 11.3 and 16): Import Review decisions for Base recipes,
// driven over the API. The Recipe File steps are those of import-export; these add Base recipes and Recipes seeded
// through the API, answers that name Recipes by `<recipe:Name>`, and checks on the Confirm answer and on what was stored.

var brcRecipePlaceholder = regexp.MustCompile(`<recipe:([^>]+)>`)

func beta6BRCSteps(sc *godog.ScenarioContext, w *World) {
	key := units.NormalizeName
	fail := func(f string, a ...any) error { return fmt.Errorf(f+"; last response: %s", append(a, w.Last.Body)...) }
	baseOf := func(unit string) string {
		switch unit {
		case "g", "kg":
			return "g"
		case "ml", "l", "dl", "cl", "tsp", "tbsp", "cup":
			return "ml"
		}
		return "piece"
	}
	list := func(path string) ([]map[string]any, error) {
		r := w.Client.Do("GET", path, nil)
		var out []map[string]any
		if r.Status != 200 {
			return nil, fmt.Errorf("GET %s = %d %s", path, r.Status, r.Body)
		}
		return out, json.Unmarshal(r.Body, &out)
	}
	recipes := func() ([]map[string]any, error) { return list("/api/recipes?kind=all&archived=all") }
	recipeID := func(name string) (int64, error) {
		all, err := recipes()
		if err != nil {
			return 0, err
		}
		for _, m := range all {
			if key(fmt.Sprint(m["name"])) == key(name) {
				return int64(m["id"].(float64)), nil
			}
		}
		return 0, fmt.Errorf("no Recipe %q", name)
	}
	recipeJSON := func(name string) (map[string]any, error) {
		id, err := recipeID(name)
		if err != nil {
			return nil, err
		}
		r := w.Client.Do("GET", fmt.Sprintf("/api/recipes/%d", id), nil)
		var m map[string]any
		return m, json.Unmarshal(r.Body, &m)
	}
	ingredientID := func(name, unit string) (int64, error) {
		all, err := list("/api/ingredients")
		if err != nil {
			return 0, err
		}
		for _, m := range all {
			if key(fmt.Sprint(m["name"])) == key(name) {
				return int64(m["id"].(float64)), nil
			}
		}
		r := w.Client.Do("POST", "/api/ingredients", map[string]any{"name": name, "baseUnit": baseOf(unit)})
		var out struct {
			ID int64 `json:"id"`
		}
		if r.Status != 201 || r.JSON(&out) != nil {
			return 0, fmt.Errorf("create Ingredient %q: %d %s", name, r.Status, r.Body)
		}
		return out.ID, nil
	}
	// lines parses "80 g butter, 160 g Roux": a Base recipe of the household is called for by id, anything else is an Ingredient.
	lines := func(spec string) ([]map[string]any, error) {
		out := []map[string]any{}
		all, err := recipes()
		if err != nil {
			return nil, err
		}
		for _, part := range strings.Split(spec, ",") {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			f := strings.SplitN(part, " ", 3)
			if len(f) != 3 {
				return nil, fmt.Errorf("bad line %q (want \"80 g butter\")", part)
			}
			qty, err := strconv.ParseFloat(f[0], 64)
			if err != nil {
				return nil, fmt.Errorf("bad quantity in %q", part)
			}
			var base int64
			for _, m := range all {
				if m["baseRecipe"] == true && key(fmt.Sprint(m["name"])) == key(f[2]) {
					base = int64(m["id"].(float64))
				}
			}
			if base != 0 {
				out = append(out, map[string]any{"baseRecipeId": base, "quantity": qty, "unit": f[1]})
				continue
			}
			id, err := ingredientID(f[2], f[1])
			if err != nil {
				return nil, err
			}
			out = append(out, map[string]any{"ingredientId": id, "quantity": qty, "unit": f[1]})
		}
		return out, nil
	}
	create := func(body map[string]any) error {
		r := w.Client.Do("POST", "/api/recipes", body)
		if r.Status != 201 {
			return fmt.Errorf("create Recipe %v: %d %s", body["name"], r.Status, r.Body)
		}
		return nil
	}

	sc.Step(`^the household has the Base recipe "([^"]*)" yielding ([0-9.]+) (\w+)(?: with the lines "([^"]*)")?$`,
		func(name string, yield float64, unit, spec string) error {
			ls, err := lines(spec)
			if err != nil {
				return err
			}
			return create(map[string]any{"name": name, "baseRecipe": true, "yield": yield, "yieldUnit": unit, "lines": ls})
		})
	sc.Step(`^the household has the plannable Recipe "([^"]*)" with the lines "([^"]*)"$`, func(name, spec string) error {
		ls, err := lines(spec)
		if err != nil {
			return err
		}
		return create(map[string]any{"name": name, "yield": 4, "lines": ls})
	})

	// Answers name existing Recipes by <recipe:Name>; Ingredients by <id:name> as in the import-export steps.
	sc.Step(`^I answer the review with these decisions:$`, func(doc *godog.DocString) error {
		var failed error
		body := brcRecipePlaceholder.ReplaceAllStringFunc(doc.Content, func(m string) string {
			id, err := recipeID(brcRecipePlaceholder.FindStringSubmatch(m)[1])
			if err != nil {
				failed = err
			}
			return strconv.FormatInt(id, 10)
		})
		if failed != nil {
			return failed
		}
		w.Vars["rf-answers"] = body
		w.Last = w.Client.Do("POST", fmt.Sprintf("/api/imports/%v/plan", w.Vars["rf-review"]), []byte(body))
		if w.Last.Status != 200 {
			return fail("plan = %d", w.Last.Status)
		}
		saveReview(w)
		return nil
	})
	sc.Step(`^I note the id of the Recipe "([^"]*)"$`, func(name string) error {
		id, err := recipeID(name)
		w.Vars["brc:id:"+key(name)] = id
		return err
	})
	sc.Step(`^the Recipe "([^"]*)" still has the id I noted$`, func(name string) error {
		id, err := recipeID(name)
		if err == nil && id != w.Vars["brc:id:"+key(name)] {
			err = fmt.Errorf("id = %d, was %v", id, w.Vars["brc:id:"+key(name)])
		}
		return err
	})

	// The Confirm answer.
	applied := func(name string) (map[string]any, error) {
		var v struct {
			Recipes []map[string]any `json:"recipes"`
		}
		if err := w.Last.JSON(&v); err != nil {
			return nil, err
		}
		for _, r := range v.Recipes {
			if key(fmt.Sprint(r["name"])) == key(name) {
				return r, nil
			}
		}
		return nil, nil
	}
	sc.Step(`^the answer lists the Base recipe "([^"]*)" as "(created|replaced|converted)"$`, func(name, action string) error {
		r, err := applied(name)
		if err != nil {
			return err
		}
		if r == nil || r["action"] != action || r["baseRecipe"] != true {
			return fail("%q = %v, want %s and baseRecipe true", name, r, action)
		}
		return nil
	})
	sc.Step(`^the answer lists the Recipe "([^"]*)" as "(created|replaced)" and not a Base recipe$`, func(name, action string) error {
		r, err := applied(name)
		if err != nil {
			return err
		}
		if r == nil || r["action"] != action || r["baseRecipe"] == true {
			return fail("%q = %v, want %s and not a Base recipe", name, r, action)
		}
		return nil
	})
	sc.Step(`^the answer lists no Recipe "([^"]*)"$`, func(name string) error {
		r, err := applied(name)
		if err == nil && r != nil {
			err = fail("the answer lists %v", r)
		}
		return err
	})
	sc.Step(`^the answer ties "([^"]*)" to the line "([^"]*)"$`, func(name, path string) error {
		r, err := applied(name)
		if err != nil {
			return err
		}
		if r == nil || r["line"] != path {
			return fail("%q = %v, want line %s", name, r, path)
		}
		return nil
	})
	readNext := func(name string, want bool) error {
		r, err := applied(name)
		if err != nil {
			return err
		}
		if r == nil || (r["readNext"] == true) != want {
			return fail("%q = %v, want readNext %v", name, r, want)
		}
		return nil
	}
	sc.Step(`^the answer offers to read "([^"]*)" next$`, func(name string) error { return readNext(name, true) })
	sc.Step(`^the answer does not offer to read "([^"]*)" next$`, func(name string) error { return readNext(name, false) })
	sc.Step(`^the error path names "([^"]*)"$`, func(names string) error {
		var v struct {
			Error struct{ Path []string }
		}
		if err := w.Last.JSON(&v); err != nil {
			return err
		}
		got := strings.Join(v.Error.Path, ",")
		for _, n := range strings.Split(names, ",") {
			if !strings.Contains(got, strings.TrimSpace(n)) {
				return fail("path %v lacks %q", v.Error.Path, n)
			}
		}
		return nil
	})

	// What the household holds.
	sc.Step(`^the household has (\d+) Recipes in all, Base recipes included$`, func(n int) error {
		all, err := recipes()
		if err == nil && len(all) != n {
			err = fmt.Errorf("%d Recipes, want %d", len(all), n)
		}
		return err
	})
	sc.Step(`^the Recipe "([^"]*)" is a Base recipe yielding ([0-9.]+) (\w+)$`, func(name string, yield float64, unit string) error {
		m, err := recipeJSON(name)
		if err != nil {
			return err
		}
		if m["baseRecipe"] != true || m["yield"] != yield || m["yieldUnit"] != unit {
			return fmt.Errorf("%s = baseRecipe %v, yield %v %v; want a Base recipe of %v %s", name, m["baseRecipe"], m["yield"], m["yieldUnit"], yield, unit)
		}
		return nil
	})
	baseLines := func(name string, n int) error {
		m, err := recipeJSON(name)
		if err != nil {
			return err
		}
		if got := len(m["lines"].([]any)); m["baseRecipe"] != true || got != n {
			return fmt.Errorf("%s = baseRecipe %v with %d lines, want a Base recipe with %d", name, m["baseRecipe"], got, n)
		}
		return nil
	}
	sc.Step(`^the Base recipe "([^"]*)" has no lines$`, func(name string) error { return baseLines(name, 0) })
	sc.Step(`^the Base recipe "([^"]*)" has (\d+) lines?$`, baseLines)
	lineOf := func(recipe string, match func(l map[string]any) bool) (bool, error) {
		m, err := recipeJSON(recipe)
		if err != nil {
			return false, err
		}
		for _, l := range m["lines"].([]any) {
			if match(l.(map[string]any)) {
				return true, nil
			}
		}
		return false, nil
	}
	sc.Step(`^the Recipe "([^"]*)" has a line calling for the Base recipe "([^"]*)"$`, func(name, base string) error {
		ok, err := lineOf(name, func(l map[string]any) bool {
			b, _ := l["baseRecipe"].(map[string]any)
			return b != nil && key(fmt.Sprint(b["name"])) == key(base)
		})
		if err == nil && !ok {
			err = fmt.Errorf("%s has no line calling for the Base recipe %s", name, base)
		}
		return err
	})
	sc.Step(`^the Recipe "([^"]*)" has a plain line for "([^"]*)"$`, func(name, ing string) error {
		ok, err := lineOf(name, func(l map[string]any) bool {
			return l["baseRecipe"] == nil && key(fmt.Sprint(l["ingredient"])) == key(ing)
		})
		if err == nil && !ok {
			err = fmt.Errorf("%s has no plain line for %s", name, ing)
		}
		return err
	})

	// Link candidates of a Base recipe (the bulk link offer after Confirm).
	sc.Step(`^I ask for the link candidates of the Base recipe "([^"]*)"$`, func(name string) error {
		id, err := recipeID(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("GET", fmt.Sprintf("/api/recipes/%d/link-candidates", id), nil)
		return nil
	})
	candidates := func(recipe string) (linkable, listed bool, err error) {
		var v struct {
			Lines []struct {
				RecipeName string `json:"recipeName"`
				Linkable   bool   `json:"linkable"`
			} `json:"lines"`
		}
		if err = w.Last.JSON(&v); err != nil {
			return
		}
		for _, l := range v.Lines {
			if key(l.RecipeName) == key(recipe) {
				listed, linkable = true, l.Linkable
			}
		}
		return
	}
	sc.Step(`^the link candidates list the line of "([^"]*)" as linkable$`, func(name string) error {
		linkable, listed, err := candidates(name)
		if err == nil && !(listed && linkable) {
			err = fail("%s listed %v, linkable %v", name, listed, linkable)
		}
		return err
	})
	sc.Step(`^the link candidates list no line of "([^"]*)"$`, func(name string) error {
		_, listed, err := candidates(name)
		if err == nil && listed {
			err = fail("%s is listed", name)
		}
		return err
	})
}
