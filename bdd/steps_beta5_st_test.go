package bdd

import (
	"fmt"
	"strconv"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("beta5-st", beta5STSteps) }

// Beta.5 F6: edit and delete a Stock Lot (PATCH and DELETE /api/stock/lots/{id}). Ingredients, Lots, Storage Places,
// the spoiled list and the zero-waste streak come from the "stock", "pantry" and Today steps; the edit steps keep the
// Lot's JSON from the last response.
func beta5STSteps(sc *godog.ScenarioContext, w *World) {
	lotsOf := func(name string) ([]map[string]any, error) {
		id, ok := w.Vars["stock.ing."+name].(int64)
		if !ok {
			return nil, fmt.Errorf("no Ingredient %q", name)
		}
		var out struct {
			Lots []map[string]any `json:"lots"`
		}
		r := w.Client.Get(fmt.Sprintf("/api/stock/lots?ingredientId=%d", id))
		if err := r.JSON(&out); err != nil || r.Status != 200 {
			return nil, fmt.Errorf("list lots of %q: %d %s", name, r.Status, r.Body)
		}
		return out.Lots, nil
	}
	newest := func(name string) (int64, error) {
		lots, err := lotsOf(name)
		if err != nil || len(lots) == 0 {
			return 0, fmt.Errorf("no Stock Lots of %q (%v)", name, err)
		}
		best := int64(0)
		for _, l := range lots {
			if id := int64(l["id"].(float64)); id > best {
				best = id
			}
		}
		return best, nil
	}
	changed := func() (map[string]any, error) {
		var l map[string]any
		if w.Last.Status != 200 || w.Last.JSON(&l) != nil {
			return nil, fmt.Errorf("last response is not a Stock Lot: %d %s", w.Last.Status, w.Last.Body)
		}
		return l, nil
	}

	sc.Step(`^I change the newest Stock Lot of "([^"]*)" with JSON:$`, func(name string, body *godog.DocString) error {
		id, err := newest(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("PATCH", fmt.Sprintf("/api/stock/lots/%d", id), rawJSON(body.Content))
		return nil
	})
	sc.Step(`^I change the Stock Lot (\d+) with JSON:$`, func(id int, body *godog.DocString) error {
		w.Last = w.Client.Do("PATCH", fmt.Sprintf("/api/stock/lots/%d", id), rawJSON(body.Content))
		return nil
	})
	sc.Step(`^I delete the newest Stock Lot of "([^"]*)"$`, func(name string) error {
		id, err := newest(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("DELETE", fmt.Sprintf("/api/stock/lots/%d", id), nil)
		return nil
	})
	sc.Step(`^I delete the Stock Lot (\d+)$`, func(id int) error {
		w.Last = w.Client.Do("DELETE", fmt.Sprintf("/api/stock/lots/%d", id), nil)
		return nil
	})
	sc.Step(`^I delete the Stock Lot of ([\d.]+) (?:g|ml|piece) of "([^"]*)"$`, func(q, name string) error {
		want, _ := strconv.ParseFloat(q, 64)
		lots, err := lotsOf(name)
		if err != nil {
			return err
		}
		for _, l := range lots {
			if l["quantity"].(float64) == want {
				w.Last = w.Client.Do("DELETE", fmt.Sprintf("/api/stock/lots/%d", int64(l["id"].(float64))), nil)
				return nil
			}
		}
		return fmt.Errorf("no Stock Lot of %s of %q", q, name)
	})
	sc.Step(`^the changed Stock Lot is good until "([^"]*)"$`, func(want string) error {
		l, err := changed()
		if err != nil {
			return err
		}
		if got, _ := l["goesOff"].(string); got != want {
			return fmt.Errorf("goesOff = %v, want %s; body %s", l["goesOff"], want, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the changed Stock Lot has no go-off date$`, func() error {
		l, err := changed()
		if err != nil {
			return err
		}
		if l["goesOff"] != nil {
			return fmt.Errorf("goesOff = %v, want null", l["goesOff"])
		}
		return nil
	})
	sc.Step(`^the changed Stock Lot is in the "([^"]*)"$`, func(where string) error {
		l, err := changed()
		if err != nil {
			return err
		}
		pid, ok := w.Vars["pantry.place."+where].(int64)
		if !ok {
			return fmt.Errorf("no Storage Place %q", where)
		}
		if got, _ := l["storagePlaceId"].(float64); int64(got) != pid {
			return fmt.Errorf("storagePlaceId = %v, want %d", l["storagePlaceId"], pid)
		}
		return nil
	})
	sc.Step(`^no waste is recorded$`, func() error {
		var out struct {
			Records []map[string]any `json:"records"`
		}
		r := w.Client.Get("/api/stock/waste")
		if err := r.JSON(&out); err != nil || r.Status != 200 {
			return fmt.Errorf("GET /api/stock/waste: %d %s", r.Status, r.Body)
		}
		if len(out.Records) != 0 {
			return fmt.Errorf("waste records = %s, want none", r.Body)
		}
		return nil
	})
}

// rawJSON sends a doc string as the request body as it is (the testkit takes a string as a raw body).
func rawJSON(s string) any { return s }
