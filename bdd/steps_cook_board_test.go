package bdd

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/cook/service"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("cook-board", cookBoardSteps) }

var cookPlaceholder = regexp.MustCompile(`<id:([^>]+)>`)

// cookBoardSteps drives Cook Mode, the timers and the kitchen board over HTTP.
// The phone is signed in as the User and the tablet as the Admin: two sessions
// of the same household. "Step N" in a scenario is the Recipe's Nth Step (1-based).
// Scenarios that start from a Planned Meal use the planning API (team T11).
func cookBoardSteps(sc *godog.ScenarioContext, w *World) {
	admin := func() *testkit.Client { return w.Ensure().LoginAdmin(w.TB) }
	device := func(name string) (*testkit.Client, error) {
		c, ok := w.Vars["cook.device."+name].(*testkit.Client)
		if !ok {
			return nil, fmt.Errorf("the %s is not signed in in this scenario", name)
		}
		return c, nil
	}
	recipeID := func(name string) (int64, error) {
		id, ok := w.Vars["cook.recipe."+name].(int64)
		if !ok {
			return 0, fmt.Errorf("the Recipe %q was not set up in this scenario", name)
		}
		return id, nil
	}
	body := func() map[string]any {
		var m map[string]any
		if err := json.Unmarshal(w.Last.Body, &m); err != nil {
			panic(fmt.Sprintf("response is not a JSON object: %v: %s", err, w.Last.Body))
		}
		return m
	}
	// at walks a JSON path like "steps.0.uses.0.quantity".
	at := func(doc any, path string) (any, error) {
		cur := doc
		for _, key := range strings.Split(path, ".") {
			switch v := cur.(type) {
			case map[string]any:
				next, ok := v[key]
				if !ok {
					return nil, fmt.Errorf("path %q: key %q missing", path, key)
				}
				cur = next
			case []any:
				i, err := strconv.Atoi(key)
				if err != nil || i < 0 || i >= len(v) {
					return nil, fmt.Errorf("path %q: bad index %q (len %d)", path, key, len(v))
				}
				cur = v[i]
			default:
				return nil, fmt.Errorf("path %q: %v is not a container", path, cur)
			}
		}
		return cur, nil
	}
	field := func(doc any, path string) (string, error) {
		v, err := at(doc, path)
		if err != nil {
			return "", err
		}
		if f, ok := v.(float64); ok && f == math.Trunc(f) {
			return strconv.FormatInt(int64(f), 10), nil
		}
		return fmt.Sprint(v), nil
	}
	want := func(doc any, path, expected string) error {
		got, err := field(doc, path)
		if err != nil {
			return fmt.Errorf("%v; body: %s", err, w.Last.Body)
		}
		if got != expected {
			return fmt.Errorf("%s = %q, want %q; body: %s", path, got, expected, w.Last.Body)
		}
		return nil
	}
	list := func(doc any, path string) ([]any, error) {
		v, err := at(doc, path)
		if err != nil {
			return nil, err
		}
		l, ok := v.([]any)
		if !ok {
			return nil, fmt.Errorf("%s is not a list", path)
		}
		return l, nil
	}

	// ---- fixtures ----
	sc.Step(`^the kitchen knows the Ingredient "([^"]*)" in (g|ml|piece)(?: with a Shelf Life of (\d+) days)?$`, func(name, unit, shelf string) error {
		b := map[string]any{"name": name, "baseUnit": unit}
		if shelf != "" {
			n, _ := strconv.Atoi(shelf)
			b["shelfLifeDays"] = n
		}
		r := admin().Post("/api/ingredients", b)
		var out struct{ ID int64 }
		if r.Status != 201 || r.JSON(&out) != nil {
			return fmt.Errorf("create Ingredient %s: %d %s", name, r.Status, r.Body)
		}
		w.Vars["cook.ingredient."+name] = out.ID
		w.Vars["cook.firstIngredient"] = out.ID
		return nil
	})
	sc.Step(`^the kitchen has the Recipe "([^"]*)" yielding (\d+) with these Steps:$`, func(name string, yield int, doc *godog.DocString) error {
		steps := cookPlaceholder.ReplaceAllStringFunc(doc.Content, func(m string) string {
			return fmt.Sprint(w.Vars["cook.ingredient."+cookPlaceholder.FindStringSubmatch(m)[1]])
		})
		line, ok := w.Vars["cook.firstIngredient"].(int64)
		if !ok {
			return fmt.Errorf("define an Ingredient before the Recipe")
		}
		raw := fmt.Sprintf(`{"name": %q, "yield": %d, "lines": [{"ingredientId": %d, "quantity": 1, "unit": "piece"}], "steps": %s}`, name, yield, line, steps)
		r := admin().Post("/api/recipes", []byte(raw))
		var out struct{ ID int64 }
		if r.Status != 201 || r.JSON(&out) != nil {
			return fmt.Errorf("create Recipe %s: %d %s", name, r.Status, r.Body)
		}
		w.Vars["cook.recipe."+name] = out.ID
		return nil
	})
	sc.Step(`^the phone and the tablet are signed in$`, func() {
		env := w.Ensure()
		w.Vars["cook.device.phone"] = env.LoginUser(w.TB)
		w.Vars["cook.device.tablet"] = env.LoginAdmin(w.TB)
	})
	sc.Step(`^the kitchen's household settings are:$`, func(doc *godog.DocString) error {
		r := admin().Put("/api/household/settings", []byte(doc.Content))
		if r.Status != 200 {
			return fmt.Errorf("save settings: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the kitchen has a Dinner Meal Slot on Monday at 19:00$`, func() error {
		a := admin()
		m := a.Post("/api/members", map[string]any{"name": "Anna", "colour": "#3366cc", "portionFactor": 1})
		var member struct{ ID int64 }
		if m.Status != 201 || m.JSON(&member) != nil {
			return fmt.Errorf("create Member: %d %s", m.Status, m.Body)
		}
		r := a.Post("/api/meal-slots", map[string]any{"weekday": 1, "name": "Dinner", "time": "19:00",
			"attendance": []map[string]any{{"memberId": member.ID, "portionFactorOverride": nil}}})
		var slot struct{ ID int64 }
		if r.Status != 201 || r.JSON(&slot) != nil {
			return fmt.Errorf("create Meal Slot: %d %s", r.Status, r.Body)
		}
		w.Vars["cook.dinnerSlot"] = slot.ID
		return nil
	})
	sc.Step(`^the Recipe "([^"]*)" is planned for tonight's Dinner with (\d+) Batch(?:es)?$`, func(name string, batches int) error {
		id, err := recipeID(name)
		if err != nil {
			return err
		}
		r := admin().Put(fmt.Sprintf("/api/plan/2026-11-09/%d", w.Vars["cook.dinnerSlot"]), map[string]any{"recipeId": id, "batches": batches})
		if r.Status != 200 {
			return fmt.Errorf("plan the meal: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^tonight's Planned Meal is marked as cooked$`, func() error {
		r := admin().Post(fmt.Sprintf("/api/plan/2026-11-09/%d/cooked", w.Vars["cook.dinnerSlot"]), map[string]any{"leftoverPortions": 0})
		if r.Status != 200 {
			return fmt.Errorf("mark as cooked: %d %s", r.Status, r.Body)
		}
		return nil
	})

	// ---- time ----
	sc.Step(`^(\d+) (seconds?|minutes?) of cooking go by$`, func(n int, unit string) {
		d := time.Second
		if strings.HasPrefix(unit, "minute") {
			d = time.Minute
		}
		w.Ensure().Clock.Advance(time.Duration(n) * d)
	})
	sc.Step(`^the kitchen clock reads (\d\d:\d\d) UTC$`, func(hhmm string) error {
		t, err := time.Parse("2006-01-02 15:04", "2026-11-09 "+hhmm)
		if err != nil {
			return err
		}
		w.Ensure().Clock.Set(t)
		return nil
	})
	sc.Step(`^the Feeder restarts in the kitchen$`, func() { w.Ensure().Restart(w.TB) })

	// ---- Cook Mode ----
	sc.Step(`^I open Cook Mode for the Recipe "([^"]*)" with ([0-9.]+) Batch(?:es)?$`, func(name, batches string) error {
		id, err := recipeID(name)
		if err != nil {
			return err
		}
		w.Ensure()
		w.Last = w.Client.Get(fmt.Sprintf("/api/cook/recipes/%d?batches=%s", id, batches))
		return nil
	})
	sc.Step(`^I open Cook Mode for tonight's Planned Meal$`, func() {
		w.Ensure()
		w.Last = w.Client.Get(fmt.Sprintf("/api/cook/meals/2026-11-09/%d", w.Vars["cook.dinnerSlot"]))
	})
	sc.Step(`^Cook Mode shows (\d+) Steps? to cook and (\d+) Advance Steps?$`, func(steps, adv int) error {
		doc := body()
		s, err := list(doc, "steps")
		if err != nil {
			return err
		}
		a, err := list(doc, "advance")
		if err != nil {
			return err
		}
		if len(s) != steps || len(a) != adv {
			return fmt.Errorf("got %d Steps and %d Advance Steps, want %d and %d; body: %s", len(s), len(a), steps, adv, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^Cook Mode shows the cooking Step (\d+) as "([^"]*)" of (\d+)$`, func(n int, text string, of int) error {
		doc := body()
		path := fmt.Sprintf("steps.%d", n-1)
		if err := want(doc, path+".text", text); err != nil {
			return err
		}
		if err := want(doc, path+".number", strconv.Itoa(n)); err != nil {
			return err
		}
		return want(doc, path+".of", strconv.Itoa(of))
	})
	sc.Step(`^the cooking Step (\d+) uses ([0-9.]+) (\w+) of "([^"]*)"$`, func(n int, qty float64, unit, ing string) error {
		doc := body()
		path := fmt.Sprintf("steps.%d.uses.0", n-1)
		got, err := at(doc, path+".quantity")
		if err != nil {
			return err
		}
		if f, _ := got.(float64); math.Abs(f-qty) > 1e-9 {
			return fmt.Errorf("quantity = %v, want %v; body: %s", got, qty, w.Last.Body)
		}
		if err := want(doc, path+".unit", unit); err != nil {
			return err
		}
		return want(doc, path+".ingredient", ing)
	})
	sc.Step(`^the cooking Step (\d+) offers a timer of (\d+) seconds$`, func(n, secs int) error {
		return want(body(), fmt.Sprintf("steps.%d.timer.durationSeconds", n-1), strconv.Itoa(secs))
	})
	sc.Step(`^the cooking Step (\d+) offers no timer$`, func(n int) error {
		v, err := at(body(), fmt.Sprintf("steps.%d.timer", n-1))
		if err != nil || v != nil {
			return fmt.Errorf("expected no timer, got %v (%v)", v, err)
		}
		return nil
	})
	sc.Step(`^the Advance Step "([^"]*)" is listed as (done|not done)$`, func(text, state string) error {
		items, err := list(body(), "advance")
		if err != nil {
			return err
		}
		for _, it := range items {
			m := it.(map[string]any)
			if m["text"] == text {
				done := m["done"] == true
				if done != (state == "done") || (m["warning"] == true) == done {
					return fmt.Errorf("Advance Step %q: done=%v warning=%v, want %s", text, m["done"], m["warning"], state)
				}
				return nil
			}
		}
		return fmt.Errorf("no Advance Step %q in %s", text, w.Last.Body)
	})
	sc.Step(`^I mark the Advance Step (\d+) of the Recipe "([^"]*)" as done$`, func(step int, name string) error {
		id, err := recipeID(name)
		if err != nil {
			return err
		}
		w.Ensure()
		w.Last = w.Client.Put("/api/cook/marks", map[string]any{"scope": fmt.Sprintf("recipe:%d", id), "step": step - 1, "done": true})
		return nil
	})
	sc.Step(`^I mark Step (\d+) of tonight's Planned Meal as done$`, func(step int) {
		w.Ensure()
		w.Last = w.Client.Put("/api/cook/marks", map[string]any{"scope": fmt.Sprintf("meal:2026-11-09/%d", w.Vars["cook.dinnerSlot"]), "step": step - 1, "done": true})
	})
	sc.Step(`^I mark Step (\d+) of the Recipe "([^"]*)" as done$`, func(step int, name string) error {
		id, err := recipeID(name)
		if err != nil {
			return err
		}
		w.Ensure()
		w.Last = w.Client.Put("/api/cook/marks", map[string]any{"scope": fmt.Sprintf("recipe:%d", id), "step": step - 1, "done": true})
		return nil
	})
	sc.Step(`^I mark a Step of the scope "([^"]*)" as done$`, func(scope string) {
		w.Ensure()
		w.Last = w.Client.Put("/api/cook/marks", map[string]any{"scope": scope, "step": 0, "done": true})
	})

	// ---- timers ----
	sc.Step(`^the (phone|tablet) starts the timer for Step (\d+) of the Recipe "([^"]*)"$`, func(dev string, step int, name string) error {
		c, err := device(dev)
		if err != nil {
			return err
		}
		id, err := recipeID(name)
		if err != nil {
			return err
		}
		w.Last = c.Post("/api/cook/timers", map[string]any{"scope": fmt.Sprintf("recipe:%d", id), "step": step - 1})
		return nil
	})
	sc.Step(`^the (phone|tablet) starts a free timer "([^"]*)" for (-?\d+) seconds$`, func(dev, label string, secs int) error {
		c, err := device(dev)
		if err != nil {
			return err
		}
		w.Last = c.Post("/api/cook/timers", map[string]any{"label": label, "durationSeconds": secs})
		return nil
	})
	sc.Step(`^the (phone|tablet) (pause|resume)s the timer "([^"]*)"$`, func(dev, action, label string) error {
		c, err := device(dev)
		if err != nil {
			return err
		}
		id, err := timerID(w, c, label)
		if err != nil {
			return err
		}
		w.Last = c.Post(fmt.Sprintf("/api/cook/timers/%d/%s", id, action), nil)
		return nil
	})
	sc.Step(`^the (phone|tablet) cancels the timer "([^"]*)"$`, func(dev, label string) error {
		c, err := device(dev)
		if err != nil {
			return err
		}
		id, err := timerID(w, c, label)
		if err != nil {
			return err
		}
		w.Last = c.Delete(fmt.Sprintf("/api/cook/timers/%d", id))
		return nil
	})
	sc.Step(`^the (phone|tablet) shows (\d+) timers?$`, func(dev string, n int) error {
		c, err := device(dev)
		if err != nil {
			return err
		}
		w.Last = c.Get("/api/cook/timers")
		l, err := list(body(), "timers")
		if err != nil {
			return err
		}
		if len(l) != n {
			return fmt.Errorf("%s shows %d timers, want %d; body: %s", dev, len(l), n, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the (phone|tablet) shows the timer "([^"]*)" (running|paused|finished) with (\d+) seconds left$`, func(dev, label, state string, secs int) error {
		c, err := device(dev)
		if err != nil {
			return err
		}
		w.Last = c.Get("/api/cook/timers")
		l, err := list(body(), "timers")
		if err != nil {
			return err
		}
		for _, it := range l {
			m := it.(map[string]any)
			if m["label"] == label {
				if m["state"] != state || int(m["remainingSeconds"].(float64)) != secs {
					return fmt.Errorf("%s timer %q is %v with %v s left, want %s with %d s", dev, label, m["state"], m["remainingSeconds"], state, secs)
				}
				return nil
			}
		}
		return fmt.Errorf("%s has no timer %q; body: %s", dev, label, w.Last.Body)
	})
	sc.Step(`^the push team is listening for finished timers$`, func() {
		ch, cancel := service.SubscribeFinished(w.Ensure().App.Deps.Events)
		w.TB.Cleanup(cancel)
		w.Vars["cook.finished"] = ch
	})
	sc.Step(`^a finished event arrives for the timer "([^"]*)"$`, func(label string) error {
		ch, ok := w.Vars["cook.finished"].(<-chan service.FinishedEvent)
		if !ok {
			return fmt.Errorf("nobody is listening")
		}
		select {
		case e := <-ch:
			if e.Label != label {
				return fmt.Errorf("finished event for %q, want %q", e.Label, label)
			}
			return nil
		case <-time.After(3 * time.Second):
			return fmt.Errorf("no finished event for %q", label)
		}
	})
	sc.Step(`^the finished timers have been read once$`, func() {
		// The finished state is also settled by reading, which is what publishes the event.
		w.Ensure().LoginUser(w.TB).Get("/api/cook/timers")
	})

	// ---- kitchen board ----
	sc.Step(`^I open the kitchen board$`, func() {
		w.Ensure()
		w.Last = w.Client.Get("/api/board")
	})
	sc.Step(`^the kitchen board is (dark|light) using the (sun|fallback)$`, func(mode, source string) error {
		doc := body()
		if err := want(doc, "theme.dark", strconv.FormatBool(mode == "dark")); err != nil {
			return err
		}
		return want(doc, "theme.source", source)
	})
	sc.Step(`^the kitchen board explains the fallback with "([^"]*)"$`, func(reason string) error {
		return want(body(), "theme.reason", reason)
	})
	sc.Step(`^the kitchen board changes theme at (\d\d:\d\d) UTC$`, func(hhmm string) error {
		got, err := field(body(), "theme.nextChangeAt")
		if err != nil {
			return err
		}
		t, err := time.Parse(time.RFC3339, got)
		if err != nil {
			return err
		}
		wantT, err := time.Parse("2006-01-02 15:04", t.UTC().Format("2006-01-02")+" "+hhmm)
		if err != nil {
			return err
		}
		if d := t.Sub(wantT); d < -2*time.Minute || d > 2*time.Minute { // sunset times are computed, so allow 2 minutes
			return fmt.Errorf("next change at %s UTC, want %s (+-2 min)", t.UTC().Format("15:04"), hhmm)
		}
		return nil
	})
	sc.Step(`^the kitchen board shows a zero-waste streak of (\d+) days?$`, func(n int) error {
		return want(body(), "streak.days", strconv.Itoa(n))
	})
	sc.Step(`^the kitchen board's next Advance Step is "([^"]*)" for the Recipe "([^"]*)"$`, func(text, recipe string) error {
		doc := body()
		if err := want(doc, "nextAdvance.text", text); err != nil {
			return err
		}
		return want(doc, "nextAdvance.recipeName", recipe)
	})
	sc.Step(`^the kitchen board's next Advance Step is (overdue|not overdue)$`, func(state string) error {
		return want(body(), "nextAdvance.overdue", strconv.FormatBool(state == "overdue"))
	})
	sc.Step(`^the kitchen board has no next Advance Step$`, func() error {
		v, err := at(body(), "nextAdvance")
		if err != nil || v != nil {
			return fmt.Errorf("expected null, got %v (%v)", v, err)
		}
		return nil
	})
	sc.Step(`^the kitchen has a Stock Lot of "([^"]*)" bought on "([^"]*)"$`, func(name, date string) error {
		id, ok := w.Vars["cook.ingredient."+name].(int64)
		if !ok {
			return fmt.Errorf("unknown Ingredient %q", name)
		}
		r := admin().Post("/api/stock/lots", map[string]any{"ingredientId": id, "quantity": 500, "purchased": date})
		if r.Status != 201 {
			return fmt.Errorf("add Stock Lot: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the kitchen throws out every spoiled Stock Lot$`, func() error {
		a := admin()
		var out struct {
			Lots []struct{ ID int64 } `json:"lots"`
		}
		if err := a.Get("/api/stock/spoiled").JSON(&out); err != nil || len(out.Lots) == 0 {
			return fmt.Errorf("nothing spoiled to throw out (%v)", err)
		}
		for _, l := range out.Lots {
			if r := a.Post(fmt.Sprintf("/api/stock/lots/%d/throw-out", l.ID), nil); r.Status != 200 {
				return fmt.Errorf("throw out: %d %s", r.Status, r.Body)
			}
		}
		return nil
	})
	sc.Step(`^the signed-out visitor asks for (Cook Mode|the kitchen board)$`, func(what string) {
		path := "/api/cook/timers"
		if what == "the kitchen board" {
			path = "/api/board"
		}
		w.Last = w.Ensure().Anonymous().Get(path)
	})
}

// timerID finds the id of the timer with a label as the device sees it.
func timerID(w *World, c *testkit.Client, label string) (int64, error) {
	var out struct {
		Timers []struct {
			ID    int64  `json:"id"`
			Label string `json:"label"`
		} `json:"timers"`
	}
	if err := c.Get("/api/cook/timers").JSON(&out); err != nil {
		return 0, err
	}
	for _, t := range out.Timers {
		if t.Label == label {
			return t.ID, nil
		}
	}
	return 0, fmt.Errorf("no timer %q", label)
}
