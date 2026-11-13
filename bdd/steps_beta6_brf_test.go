package bdd

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("beta6-brf", beta6BRFSteps) }

// BR-F (docs/dev/design/base-recipes.md sections 5, 7, 16): Base recipes in the planning and Shopping List scenarios. Base
// recipes and the Recipes that call for them go through the API (BR-B). A needs list reads "1000 ml milk, 100 g Roux": an
// Ingredient, or a Base recipe made earlier in the scenario (matched by name). The ids are kept where the existing
// shopping steps look for them ("ss:ingredient:", "ss:recipe:"), and a Base recipe's own Ingredient is registered by
// its name, so "the shopping Stock holds 300 ml of "Béchamel"" fills its jar.

func beta6BRFSteps(sc *godog.ScenarioContext, w *World) {
	baseUnit := func(unit string) string {
		switch unit {
		case "g", "kg":
			return "g"
		case "ml", "l", "dl", "cl", "tsp", "tbsp", "cup":
			return "ml"
		}
		return "piece"
	}
	idVar := func(key string) int64 { v, _ := w.Vars[key].(int64); return v }
	ingredient := func(name, unit string) (int64, error) {
		if v := idVar("ss:ingredient:" + name); v != 0 {
			return v, nil
		}
		var id int64
		if err := w.Ensure().DB.QueryRow(`SELECT id FROM ingredients WHERE name = ?`, name).Scan(&id); err == nil {
			w.Vars["ss:ingredient:"+name] = id
			return id, nil
		}
		r := w.Ensure().LoginAdmin(w.TB).Post("/api/ingredients", map[string]any{"name": name, "baseUnit": baseUnit(unit)})
		var out struct {
			ID int64 `json:"id"`
		}
		if r.Status != 201 || r.JSON(&out) != nil {
			return 0, fmt.Errorf("create Ingredient %s: %d %s", name, r.Status, r.Body)
		}
		w.Vars["ss:ingredient:"+name] = out.ID
		return out.ID, nil
	}
	// lines parses "1000 ml milk, 100 g Roux" into recipe lines: a Base recipe made earlier is called for by id.
	lines := func(needs string) ([]map[string]any, error) {
		out := []map[string]any{}
		for _, part := range strings.Split(needs, ",") {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			f := strings.SplitN(part, " ", 3)
			if len(f) != 3 {
				return nil, fmt.Errorf("bad needs entry %q (want \"400 g flour\")", part)
			}
			qty, err := strconv.ParseFloat(f[0], 64)
			if err != nil {
				return nil, fmt.Errorf("bad quantity in %q", part)
			}
			if b := idVar("brf:base:" + f[2]); b != 0 {
				out = append(out, map[string]any{"baseRecipeId": b, "quantity": qty, "unit": f[1]})
				continue
			}
			iid, err := ingredient(f[2], f[1])
			if err != nil {
				return nil, err
			}
			out = append(out, map[string]any{"ingredientId": iid, "quantity": qty, "unit": f[1]})
		}
		return out, nil
	}
	cell := func(row []string, i int) string {
		if i < 0 || i >= len(row) {
			return ""
		}
		return row[i]
	}
	// rows reads a table as trimmed strings; the first is the header.
	rows := func(table *godog.Table) [][]string {
		var out [][]string
		for _, r := range table.Rows {
			var cells []string
			for _, c := range r.Cells {
				cells = append(cells, strings.TrimSpace(c.Value))
			}
			out = append(out, cells)
		}
		return out
	}
	column := func(table [][]string, name string) int {
		for i, c := range table[0] {
			if c == name {
				return i
			}
		}
		return -1
	}
	makeBase := func(tbl *godog.Table) error {
		table := rows(tbl)
		nameC, yieldC, needsC, advC := column(table, "name"), column(table, "yield"), column(table, "needs"), column(table, "advance")
		for _, row := range table[1:] {
			name := cell(row, nameC)
			y := strings.Fields(cell(row, yieldC)) // "1 l"
			if len(y) != 2 {
				return fmt.Errorf("Base recipe %s: yield %q, want \"1 l\"", name, cell(row, yieldC))
			}
			yield, _ := strconv.ParseFloat(y[0], 64)
			ls, err := lines(cell(row, needsC))
			if err != nil {
				return err
			}
			body := map[string]any{"name": name, "yield": yield, "yieldUnit": y[1], "baseRecipe": true, "tags": []string{}, "lines": ls}
			if advC >= 0 {
				if lead, _ := strconv.Atoi(cell(row, advC)); lead > 0 {
					body["steps"] = []map[string]any{
						{"text": "Chill " + name, "kind": "advance", "durationMinutes": 0, "leadTimeMinutes": lead, "after": []int{}, "uses": []any{}},
						{"text": "Make " + name, "kind": "active", "durationMinutes": 10, "leadTimeMinutes": 0, "after": []int{}, "uses": []any{}},
					}
				}
			}
			r := w.Ensure().LoginAdmin(w.TB).Post("/api/recipes", body)
			var out struct {
				ID               int64 `json:"id"`
				BaseIngredientID int64 `json:"baseIngredientId"`
			}
			if r.Status != 201 || r.JSON(&out) != nil {
				return fmt.Errorf("create Base recipe %s: %d %s", name, r.Status, r.Body)
			}
			w.Vars["brf:base:"+name] = out.ID
			w.Vars["ss:recipe:"+name] = out.ID
			w.Vars["ss:ingredient:"+name] = out.BaseIngredientID
		}
		return nil
	}
	makePlain := func(tbl *godog.Table) error {
		table := rows(tbl)
		nameC, courseC, yieldC, needsC := column(table, "name"), column(table, "course"), column(table, "yield"), column(table, "needs")
		for _, row := range table[1:] {
			name := cell(row, nameC)
			yield, _ := strconv.ParseFloat(cell(row, yieldC), 64)
			ls, err := lines(cell(row, needsC))
			if err != nil {
				return err
			}
			body := map[string]any{"name": name, "yield": yield, "tags": []string{}, "lines": ls}
			if courseC >= 0 {
				var cid int64
				if err := w.Ensure().DB.QueryRow(`SELECT id FROM courses WHERE name = ?`, cell(row, courseC)).Scan(&cid); err != nil {
					return fmt.Errorf("Course %q: %v", cell(row, courseC), err)
				}
				body["courseIds"] = []int64{cid}
			}
			r := w.Ensure().LoginAdmin(w.TB).Post("/api/recipes", body)
			var out struct {
				ID int64 `json:"id"`
			}
			if r.Status != 201 || r.JSON(&out) != nil {
				return fmt.Errorf("create Recipe %s: %d %s", name, r.Status, r.Body)
			}
			w.Vars["ss:recipe:"+name] = out.ID
		}
		return nil
	}

	// The Course row of the last "I view the C2 plan" answer has no Planned Meal.
	sc.Step(`^the C2 Course "([^"]*)" holds no Recipe$`, func(course string) error {
		var doc struct {
			Slots []struct {
				Courses []struct {
					Name string         `json:"name"`
					Meal map[string]any `json:"meal"`
				} `json:"courses"`
			} `json:"slots"`
		}
		if err := w.Last.JSON(&doc); err != nil || len(doc.Slots) == 0 {
			return fmt.Errorf("not a plan answer: %v %s", err, w.Last.Body)
		}
		for _, c := range doc.Slots[0].Courses {
			if c.Name == course {
				if c.Meal != nil {
					return fmt.Errorf("Course %s holds %v, want no Recipe", course, c.Meal["recipeName"])
				}
				return nil
			}
		}
		return fmt.Errorf("no Course %q in %s", course, w.Last.Body)
	})
	sc.Step(`^the shopping Base recipes:$`, makeBase)
	sc.Step(`^the shopping Recipes calling for Base recipes:$`, makePlain)
	sc.Step(`^the C2 Base recipes:$`, makeBase)
	sc.Step(`^the C2 Recipes calling for Base recipes:$`, makePlain)
	sc.Step(`^the C2 Member "([^"]*)" excludes the Base recipe "([^"]*)"$`, func(member, base string) error {
		mid, _ := w.Vars["c2:member:"+member].(int64)
		bid := idVar("brf:base:" + base)
		if mid == 0 || bid == 0 {
			return fmt.Errorf("Member %q (%d) or Base recipe %q (%d) was not set up", member, mid, base, bid)
		}
		r := w.Ensure().LoginAdmin(w.TB).Put(fmt.Sprintf("/api/recipes/%d/preference", bid), map[string]any{"state": "exclusion", "memberId": mid})
		if r.Status != 200 {
			return fmt.Errorf("exclude %s for %s: %d %s", base, member, r.Status, r.Body)
		}
		return nil
	})
}
