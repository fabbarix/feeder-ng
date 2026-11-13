package bdd

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/cucumber/godog"

	notifyapi "github.com/fabbarix/feeder-ng/internal/notify/httpapi"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("beta6-brg", beta6BRGSteps) }

// BR-G (docs/dev/design/base-recipes.md sections 8 and 9): Cooked and Cook Mode with Base recipes. The fixtures are the C2
// household (Monday 2026-11-09 Dinner at 19:00 serving Main and Side, steps_crs_c2_test.go) and Recipes made through the API
// in grams: "BR-G" Recipes list their Lines as "800 g milk, 100 g butter", a name that a Base recipe made earlier in the
// scenario has being called for by id. A Step is written as JSON: {"text", "kind", "durationMinutes", "after"}. The Cook
// Mode answers (timeline, Course view) are read from w.Last.

func beta6BRGSteps(sc *godog.ScenarioContext, w *World) {
	admin := func() *testkit.Client { return w.Ensure().LoginAdmin(w.TB) }
	user := func() *testkit.Client { return w.Ensure().LoginUser(w.TB) }
	idVar := func(key string) int64 { v, _ := w.Vars[key].(int64); return v }
	ingredient := func(name string) (int64, error) {
		var id int64
		if err := w.Ensure().DB.QueryRow(`SELECT id FROM ingredients WHERE name = ?`, name).Scan(&id); err == nil {
			return id, nil
		}
		r := admin().Post("/api/ingredients", map[string]any{"name": name, "baseUnit": "g"})
		var out struct {
			ID int64 `json:"id"`
		}
		if r.Status != 201 || r.JSON(&out) != nil {
			return 0, fmt.Errorf("create Ingredient %s: %d %s", name, r.Status, r.Body)
		}
		return out.ID, nil
	}
	// lines parses "800 g milk, 100 g butter, 500 g Béchamel".
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
			if b := idVar("brg:base:" + f[2]); b != 0 {
				out = append(out, map[string]any{"baseRecipeId": b, "quantity": qty, "unit": f[1]})
				continue
			}
			iid, err := ingredient(f[2])
			if err != nil {
				return nil, err
			}
			out = append(out, map[string]any{"ingredientId": iid, "quantity": qty, "unit": f[1]})
		}
		return out, nil
	}
	// steps reads the JSON Steps of a doc string, filling what the API wants.
	steps := func(doc *godog.DocString) ([]map[string]any, error) {
		var raw []map[string]any
		if err := json.Unmarshal([]byte(doc.Content), &raw); err != nil {
			return nil, fmt.Errorf("Steps: %v", err)
		}
		for _, s := range raw {
			for k, v := range map[string]any{"durationMinutes": 0, "leadTimeMinutes": 0, "after": []int{}, "uses": []any{}} {
				if _, ok := s[k]; !ok {
					s[k] = v
				}
			}
		}
		return raw, nil
	}
	create := func(body map[string]any) (id, baseIngredient int64, err error) {
		body["tags"] = []string{}
		r := admin().Post("/api/recipes", body)
		var out struct {
			ID               int64 `json:"id"`
			BaseIngredientID int64 `json:"baseIngredientId"`
		}
		if r.Status != 201 || r.JSON(&out) != nil {
			return 0, 0, fmt.Errorf("create %v: %d %s", body["name"], r.Status, r.Body)
		}
		return out.ID, out.BaseIngredientID, nil
	}

	sc.Step(`^the BR-G Base recipe "([^"]*)" yields (\d+) g, needs "([^"]*)" and has these Steps:$`, func(name string, yield int, needs string, doc *godog.DocString) error {
		ls, err := lines(needs)
		if err != nil {
			return err
		}
		ss, err := steps(doc)
		if err != nil {
			return err
		}
		id, _, err := create(map[string]any{"name": name, "yield": yield, "yieldUnit": "g", "baseRecipe": true, "lines": ls, "steps": ss})
		if err == nil {
			w.Vars["brg:base:"+name] = id
		}
		return err
	})
	sc.Step(`^the BR-G Recipe "([^"]*)" for the Course "([^"]*)" yields (\d+), needs "([^"]*)" and has these Steps:$`, func(name, course string, yield int, needs string, doc *godog.DocString) error {
		var cid int64
		if err := w.Ensure().DB.QueryRow(`SELECT id FROM courses WHERE name = ?`, course).Scan(&cid); err != nil {
			return fmt.Errorf("Course %q: %v", course, err)
		}
		ls, err := lines(needs)
		if err != nil {
			return err
		}
		ss, err := steps(doc)
		if err != nil {
			return err
		}
		_, _, err = create(map[string]any{"name": name, "yield": yield, "courseIds": []int64{cid}, "lines": ls, "steps": ss})
		return err
	})
	sc.Step(`^the BR-G Stock holds (\d+) g of "([^"]*)"$`, func(g int, name string) error {
		iid, err := ingredient(name)
		if err != nil {
			return err
		}
		if r := admin().Post("/api/stock/lots", map[string]any{"ingredientId": iid, "quantity": g}); r.Status != 201 {
			return fmt.Errorf("add a Stock Lot of %s: %d %s", name, r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the BR-G Stock of "([^"]*)" is (\d+) (?:g|ml)$`, func(name string, want int) error {
		var id int64
		if err := w.Ensure().DB.QueryRow(`SELECT id FROM ingredients WHERE name = ?`, name).Scan(&id); err != nil {
			return fmt.Errorf("no Ingredient %q: %v", name, err)
		}
		var out struct {
			Ingredients []struct {
				ID    int64   `json:"ingredientId"`
				Total float64 `json:"total"`
			} `json:"ingredients"`
		}
		if err := admin().Get("/api/stock").JSON(&out); err != nil {
			return err
		}
		var got float64
		for _, i := range out.Ingredients {
			if i.ID == id {
				got = i.Total
			}
		}
		if got != float64(want) {
			return fmt.Errorf("Stock holds %v of %s, want %d", got, name, want)
		}
		return nil
	})

	// --- Cook Mode answers ---

	item := func(n int) (map[string]any, error) {
		var doc struct {
			Items []map[string]any `json:"items"`
		}
		if err := w.Last.JSON(&doc); err != nil {
			return nil, fmt.Errorf("not a timeline: %v: %s", err, w.Last.Body)
		}
		if n < 1 || n > len(doc.Items) {
			return nil, fmt.Errorf("timeline item %d: the timeline lists %d items: %s", n, len(doc.Items), w.Last.Body)
		}
		return doc.Items[n-1], nil
	}
	label := func(m map[string]any) string {
		b, _ := m["baseRecipe"].(map[string]any)
		s, _ := b["name"].(string)
		return s
	}
	sc.Step(`^timeline item (\d+) is "([^"]*)" labelled "([^"]*)"$`, func(n int, text, want string) error {
		it, err := item(n)
		if err != nil {
			return err
		}
		if it["text"] != text || label(it) != want {
			return fmt.Errorf("item %d = %q labelled %q, want %q labelled %q", n, it["text"], label(it), text, want)
		}
		return nil
	})
	sc.Step(`^timeline item (\d+) is "([^"]*)" and carries no Base recipe label$`, func(n int, text string) error {
		it, err := item(n)
		if err != nil {
			return err
		}
		if it["text"] != text || it["baseRecipe"] != nil {
			return fmt.Errorf("item %d = %q labelled %v, want %q with no label", n, it["text"], it["baseRecipe"], text)
		}
		return nil
	})
	sc.Step(`^timeline item (\d+) ends before timeline item (\d+) starts$`, func(a, b int) error {
		x, err := item(a)
		if err != nil {
			return err
		}
		y, err := item(b)
		if err != nil {
			return err
		}
		end, _ := x["endSeconds"].(float64)
		start, _ := y["startSeconds"].(float64)
		if end > start {
			return fmt.Errorf("item %d ends at %v s, after item %d starts at %v s", a, end, b, start)
		}
		return nil
	})
	covered := func() ([]string, error) {
		var doc struct {
			Covered []struct {
				Name string `json:"name"`
			} `json:"covered"`
		}
		if err := w.Last.JSON(&doc); err != nil {
			return nil, err
		}
		var names []string
		for _, c := range doc.Covered {
			names = append(names, c.Name)
		}
		return names, nil
	}
	sc.Step(`^the timeline has (\d+) items for the Course "([^"]*)", (\d+) of them labelled "([^"]*)"$`, func(total int, course string, labelled int, base string) error {
		var cid int64
		if err := w.Ensure().DB.QueryRow(`SELECT id FROM courses WHERE name = ?`, course).Scan(&cid); err != nil {
			return fmt.Errorf("Course %q: %v", course, err)
		}
		var doc struct {
			Items []map[string]any `json:"items"`
		}
		if err := w.Last.JSON(&doc); err != nil {
			return err
		}
		all, with := 0, 0
		for _, it := range doc.Items {
			if f, _ := it["courseId"].(float64); int64(f) != cid {
				continue
			}
			all++
			if label(it) == base {
				with++
			}
		}
		if all != total || with != labelled {
			return fmt.Errorf("the Course %s has %d items, %d labelled %q; want %d and %d: %s", course, all, with, base, total, labelled, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^Cook Mode marks "([^"]*)" as covered by Stock$`, func(name string) error {
		got, err := covered()
		if err != nil {
			return err
		}
		if strings.Join(got, ",") != name {
			return fmt.Errorf("covered by Stock: %v, want %s", got, name)
		}
		return nil
	})
	sc.Step(`^Cook Mode marks no Base recipe as covered by Stock$`, func() error {
		got, err := covered()
		if err != nil {
			return err
		}
		if len(got) != 0 {
			return fmt.Errorf("covered by Stock: %v, want none", got)
		}
		return nil
	})
	sc.Step(`^I start the timer of timeline item (\d+)$`, func(n int) error {
		it, err := item(n)
		if err != nil {
			return err
		}
		w.Last = user().Post("/api/cook/timers", map[string]any{"scope": it["scope"], "step": it["step"]})
		return nil
	})
	sc.Step(`^the started Cook timer is labelled "([^"]*)" for (\d+) seconds$`, func(label string, secs int) error {
		var tm struct {
			Label           string `json:"label"`
			DurationSeconds int    `json:"durationSeconds"`
		}
		if w.Last.Status != 201 || w.Last.JSON(&tm) != nil {
			return fmt.Errorf("start timer: %d %s", w.Last.Status, w.Last.Body)
		}
		if tm.Label != label || tm.DurationSeconds != secs {
			return fmt.Errorf("timer = %q for %d s, want %q for %d s", tm.Label, tm.DurationSeconds, label, secs)
		}
		return nil
	})
	sc.Step(`^the Cook Mode view lists (\d+) Steps$`, func(n int) error {
		var v struct {
			Steps []any `json:"steps"`
		}
		if err := w.Last.JSON(&v); err != nil || len(v.Steps) != n {
			return fmt.Errorf("the view lists %d Steps (%v), want %d: %s", len(v.Steps), err, n, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^Cook Mode view Step (\d+) is "([^"]*)" labelled "([^"]*)"$`, func(n int, text, want string) error {
		var v struct {
			Steps []map[string]any `json:"steps"`
		}
		if err := w.Last.JSON(&v); err != nil || n < 1 || n > len(v.Steps) {
			return fmt.Errorf("no Step %d (%v): %s", n, err, w.Last.Body)
		}
		s := v.Steps[n-1]
		if s["text"] != text || label(s) != want {
			return fmt.Errorf("Step %d = %q labelled %q, want %q labelled %q", n, s["text"], label(s), text, want)
		}
		return nil
	})

	// --- Start cooking from the real Planned Meals ---

	// The push stand-in of notify-ops, but the facts are the Feeder's own: the reminder follows the Planned Meals and the
	// Recipes' composed Steps in the database.
	sc.Step(`^the push service records the pushes of the real Planned Meals$`, func() {
		v, ok := w.Vars["notify-ops"].(*notifyWorld)
		if !ok {
			v = &notifyWorld{loc: time.UTC, devices: map[string]int64{}, facts: &stepFacts{}, sender: &recSender{gone: map[string]bool{}}}
			w.Vars["notify-ops"] = v
		}
		notifyapi.DispatcherFor(w.Ensure().DB).SetSender(v.sender)
	})
}
