package bdd

import (
	"fmt"
	"strconv"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Step definitions for bdd/features/supplies/supplies_quick_use.feature (H9: quick Use of a Supply). Every step says "Quick
// Use", so none can collide with the other step sets. State lives in w.Vars under "quickuse:" keys: "quickuse:ing:<name>" (the
// Ingredient id), "quickuse:last" (the last use answer, as a map), "quickuse:streak" (the streak body noted by a step).

func init() { RegisterSteps("supplies-quick-use", suppliesQuickUseSteps) }

func suppliesQuickUseSteps(sc *godog.ScenarioContext, w *World) {
	admin := func() *testkit.Client {
		if c, ok := w.Vars["quickuse:admin"].(*testkit.Client); ok {
			return c
		}
		c := w.Ensure().LoginAdmin(w.TB)
		w.Vars["quickuse:admin"] = c
		return c
	}
	user := func() *testkit.Client {
		if c, ok := w.Vars["quickuse:user"].(*testkit.Client); ok {
			return c
		}
		c := w.Ensure().LoginUser(w.TB)
		w.Vars["quickuse:user"] = c
		return c
	}
	id := func(name string) (int64, error) {
		n, ok := w.Vars["quickuse:ing:"+name].(int64)
		if !ok {
			return 0, fmt.Errorf("no Ingredient %q was set up by this scenario", name)
		}
		return n, nil
	}
	create := func(name, base, kind string, extra map[string]any) error {
		body := map[string]any{"name": name, "baseUnit": base, "kind": kind}
		for k, v := range extra {
			body[k] = v
		}
		r := admin().Post("/api/ingredients", body)
		if r.Status != 201 {
			return fmt.Errorf("create %s %q: %d %s", kind, name, r.Status, r.Body)
		}
		var out struct{ ID int64 }
		if err := r.JSON(&out); err != nil {
			return err
		}
		w.Vars["quickuse:ing:"+name] = out.ID
		return nil
	}
	lots := func(name string) ([]map[string]any, error) {
		iid, err := id(name)
		if err != nil {
			return nil, err
		}
		r := user().Get(fmt.Sprintf("/api/stock/lots?ingredientId=%d", iid))
		var out struct {
			Lots []map[string]any `json:"lots"`
		}
		if r.Status != 200 {
			return nil, fmt.Errorf("lots of %q: %d %s", name, r.Status, r.Body)
		}
		if err := r.JSON(&out); err != nil {
			return nil, err
		}
		return out.Lots, nil
	}
	last := func() (map[string]any, error) {
		m, ok := w.Vars["quickuse:last"].(map[string]any)
		if !ok {
			return nil, fmt.Errorf("no Quick Use answer yet: last response %d %s", w.Last.Status, w.Last.Body)
		}
		return m, nil
	}
	sum := func(name string) (float64, error) {
		ls, err := lots(name)
		if err != nil {
			return 0, err
		}
		total := 0.0
		for _, l := range ls {
			total += l["quantity"].(float64)
		}
		return total, nil
	}

	sc.Step(`^a Quick Use Supply "([^"]*)" counted in (piece|g|ml)$`, func(name, base string) error {
		return create(name, base, "supply", nil)
	})
	sc.Step(`^a Quick Use food Ingredient "([^"]*)" counted in (piece|g|ml)$`, func(name, base string) error {
		return create(name, base, "food", nil)
	})
	sc.Step(`^the Quick Use Supply "([^"]*)" has a Restock level of (\d+)$`, func(name string, level int) error {
		iid, err := id(name)
		if err != nil {
			return err
		}
		if r := admin().Patch(fmt.Sprintf("/api/ingredients/%d", iid), map[string]any{"restockLevel": level}); r.Status != 200 {
			return fmt.Errorf("set the Restock level: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^Quick Use Stock of "([^"]*)": (\d+) (?:piece|g|ml) bought on "([^"]*)"$`, func(name string, qty int, day string) error {
		iid, err := id(name)
		if err != nil {
			return err
		}
		if r := user().Post("/api/stock/lots", map[string]any{"ingredientId": iid, "quantity": qty, "purchased": day}); r.Status != 201 {
			return fmt.Errorf("add Stock: %d %s", r.Status, r.Body)
		}
		return nil
	})

	// --- acting ---
	sc.Step(`^I Quick Use (-?\d+) of "([^"]*)"$`, func(qty int, name string) error {
		iid, err := id(name)
		if err != nil {
			return err
		}
		w.Last = user().Post(fmt.Sprintf("/api/stock/ingredients/%d/use", iid), map[string]any{"quantity": qty})
		delete(w.Vars, "quickuse:last")
		if w.Last.Status == 200 {
			var m map[string]any
			if err := w.Last.JSON(&m); err != nil {
				return err
			}
			w.Vars["quickuse:last"] = m
			w.Vars["quickuse:lastIng"] = iid
		}
		return nil
	})
	sc.Step(`^I Undo that Quick Use$`, func() error {
		m, err := last()
		if err != nil {
			return err
		}
		iid := w.Vars["quickuse:lastIng"].(int64)
		w.Last = user().Post(fmt.Sprintf("/api/stock/ingredients/%d/use/undo", iid), map[string]any{"taken": m["taken"]})
		if w.Last.Status != 200 {
			return fmt.Errorf("Undo = %d %s", w.Last.Status, w.Last.Body)
		}
		out := map[string]any{}
		if err := w.Last.JSON(&out); err != nil {
			return err
		}
		w.Vars["quickuse:undo"] = out
		return nil
	})
	sc.Step(`^I note the Quick Use streak$`, func() error {
		r := user().Get("/api/today/streak")
		if r.Status != 200 {
			return fmt.Errorf("streak = %d %s", r.Status, r.Body)
		}
		w.Vars["quickuse:streak"] = string(r.Body)
		return nil
	})

	// --- checking ---
	sc.Step(`^the Quick Use answer says (\d+) taken and (\d+) left$`, func(taken, left int) error {
		m, err := last()
		if err != nil {
			return err
		}
		if m["quantity"] != float64(taken) || m["total"] != float64(left) {
			return fmt.Errorf("answer = %v, want quantity %d and total %d", m, taken, left)
		}
		return nil
	})
	sc.Step(`^the Quick Use answer took (\d+) from the Lot bought on "([^"]*)"$`, func(qty int, day string) error {
		m, err := last()
		if err != nil {
			return err
		}
		taken, _ := m["taken"].([]any)
		for _, t := range taken {
			if l, _ := t.(map[string]any); l != nil && l["purchased"] == day && l["quantity"] == float64(qty) {
				return nil
			}
		}
		return fmt.Errorf("no %d taken from the Lot bought on %s in %v", qty, day, m["taken"])
	})
	sc.Step(`^the Quick Use Stock total of "([^"]*)" is (\d+)$`, func(name string, want int) error {
		got, err := sum(name)
		if err != nil {
			return err
		}
		if got != float64(want) {
			return fmt.Errorf("total of %q = %v, want %d", name, got, want)
		}
		return nil
	})
	sc.Step(`^"([^"]*)" has (\d+) Quick Use Lots in Stock$`, func(name string, n int) error {
		ls, err := lots(name)
		if err != nil {
			return err
		}
		if len(ls) != n {
			return fmt.Errorf("%q has %d Lots, want %d: %v", name, len(ls), n, ls)
		}
		return nil
	})
	sc.Step(`^the Quick Use waste list is empty$`, func() error {
		r := user().Get("/api/stock/waste?from=2000-01-01&to=2100-01-01")
		var out struct{ Records []any }
		if err := r.JSON(&out); err != nil || r.Status != 200 {
			return fmt.Errorf("waste = %d %s", r.Status, r.Body)
		}
		if len(out.Records) != 0 {
			return fmt.Errorf("waste = %s, want none", r.Body)
		}
		return nil
	})
	sc.Step(`^the Quick Use streak has not moved$`, func() error {
		before, _ := w.Vars["quickuse:streak"].(string)
		r := user().Get("/api/today/streak")
		if string(r.Body) != before {
			return fmt.Errorf("streak was %s, is now %s", before, r.Body)
		}
		return nil
	})
	sc.Step(`^the Quick Use Undo says (\d+) came back and (\d+) are in Stock$`, func(back, total int) error {
		m, _ := w.Vars["quickuse:undo"].(map[string]any)
		if m == nil || m["quantity"] != float64(back) || m["total"] != float64(total) {
			return fmt.Errorf("undo answer = %v, want quantity %d, total %d", m, back, total)
		}
		return nil
	})
	sc.Step(`^the Quick Use Lots of "([^"]*)" are (\d+) bought on "([^"]*)" and (\d+) bought on "([^"]*)"$`, func(name string, q1 int, d1 string, q2 int, d2 string) error {
		ls, err := lots(name)
		if err != nil {
			return err
		}
		have := map[string]float64{}
		for _, l := range ls {
			have[l["purchased"].(string)] = l["quantity"].(float64)
		}
		if len(ls) != 2 || have[d1] != float64(q1) || have[d2] != float64(q2) {
			return fmt.Errorf("Lots = %v, want %d on %s and %d on %s", have, q1, d1, q2, d2)
		}
		return nil
	})
	sc.Step(`^the Quick Use is refused with "([^"]*)"$`, func(code string) error {
		if w.Last.Status != 422 || w.Last.ErrorCode() != code {
			return fmt.Errorf("answer = %d %s, want 422 %s", w.Last.Status, w.Last.Body, code)
		}
		return nil
	})
	sc.Step(`^the Quick Use Supply "([^"]*)" shows (\d+) in Stock below its Restock level (\d+)$`, func(name string, have, level int) error {
		iid, err := id(name)
		if err != nil {
			return err
		}
		got, err := sum(name)
		if err != nil || got != float64(have) {
			return fmt.Errorf("Stock of %q = %v (%v), want %d", name, got, err, have)
		}
		r := user().Get("/api/ingredients/" + strconv.FormatInt(iid, 10))
		var ing struct {
			RestockLevel *float64 `json:"restockLevel"`
		}
		if err := r.JSON(&ing); err != nil || ing.RestockLevel == nil || *ing.RestockLevel != float64(level) || got >= *ing.RestockLevel {
			return fmt.Errorf("Restock level = %v (%v), want %d above the Stock %v", ing.RestockLevel, err, level, got)
		}
		return nil
	})
}
