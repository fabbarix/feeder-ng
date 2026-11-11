package bdd

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("pantry", pantrySteps) }

// pantrySteps covers the Pantry page's API: Storage Places, where new Stock Lots go and moving Lots between places.
// Ingredient ids come from the "stock" steps (w.Vars["stock.ing.<name>"]); Storage Place ids are kept in
// w.Vars["pantry.place.<name>"]. "The Stock Lot just added" is the Lot in the last response.
func pantrySteps(sc *godog.ScenarioContext, w *World) {
	ing := func(name string) (int64, error) {
		id, ok := w.Vars["stock.ing."+name].(int64)
		if !ok {
			return 0, fmt.Errorf("no Ingredient %q", name)
		}
		return id, nil
	}
	place := func(name string) (int64, error) {
		id, ok := w.Vars["pantry.place."+name].(int64)
		if !ok {
			return 0, fmt.Errorf("no Storage Place %q", name)
		}
		return id, nil
	}
	lastLot := func() (map[string]any, error) {
		var l map[string]any
		if err := w.Last.JSON(&l); err != nil {
			return nil, err
		}
		if w.Last.Status >= 300 {
			return nil, fmt.Errorf("status %d: %s", w.Last.Status, w.Last.Body)
		}
		w.Vars["pantry.lot"] = int64(l["id"].(float64))
		return l, nil
	}
	daysFromToday := func(n int) string { return w.Ensure().Clock.Now().AddDate(0, 0, n).Format(time.DateOnly) }

	sc.Step(`^Stock knows the Ingredient "([^"]*)" in (g|ml|piece) with a Shelf Life of (\d+) days and a frozen Shelf Life of (\d+) days$`,
		func(name, unit string, days, frozen int) error {
			w.Ensure()
			r := w.Client.Do("POST", "/api/ingredients", map[string]any{"name": name, "baseUnit": unit, "shelfLifeDays": days, "frozenShelfLifeDays": frozen})
			var out struct {
				ID                  int64 `json:"id"`
				FrozenShelfLifeDays *int  `json:"frozenShelfLifeDays"`
			}
			if r.Status != 201 || r.JSON(&out) != nil || out.FrozenShelfLifeDays == nil || *out.FrozenShelfLifeDays != frozen {
				return fmt.Errorf("create Ingredient %q: %d %s", name, r.Status, r.Body)
			}
			w.Vars["stock.ing."+name] = out.ID
			return nil
		})
	sc.Step(`^the Household keeps food in the (pantry|fridge|freezer) "([^"]*)"( by default)?$`, func(kind, name, def string) error {
		w.Ensure()
		r := w.Client.Do("POST", "/api/storage-places", map[string]any{"name": name, "kind": kind, "default": def != ""})
		var out struct {
			ID int64 `json:"id"`
		}
		if r.Status != 201 || r.JSON(&out) != nil {
			return fmt.Errorf("create Storage Place %q: %d %s", name, r.Status, r.Body)
		}
		w.Vars["pantry.place."+name] = out.ID
		return nil
	})
	sc.Step(`^I put a Stock Lot of ([\d.]+) (?:g|ml|piece) of "([^"]*)" in the "([^"]*)"$`, func(q, name, where string) error {
		id, err := ing(name)
		if err != nil {
			return err
		}
		pid, err := place(where)
		if err != nil {
			return err
		}
		qty, _ := strconv.ParseFloat(q, 64)
		w.Last = w.Client.Do("POST", "/api/stock/lots", map[string]any{"ingredientId": id, "quantity": qty, "storagePlaceId": pid})
		return nil
	})
	sc.Step(`^I add a Stock Lot of ([\d.]+) (?:g|ml|piece) of "([^"]*)" without saying where$`, func(q, name string) error {
		id, err := ing(name)
		if err != nil {
			return err
		}
		qty, _ := strconv.ParseFloat(q, 64)
		w.Last = w.Client.Do("POST", "/api/stock/lots", map[string]any{"ingredientId": id, "quantity": qty})
		return nil
	})
	sc.Step(`^the Stock Lot just added is in the "([^"]*)"$`, func(where string) error {
		l, err := lastLot()
		if err != nil {
			return err
		}
		pid, err := place(where)
		if err != nil {
			return err
		}
		if got, _ := l["storagePlaceId"].(float64); int64(got) != pid {
			return fmt.Errorf("storagePlaceId = %v, want %d (%s)", l["storagePlaceId"], pid, where)
		}
		w.Vars["pantry.lot"] = int64(l["id"].(float64))
		return nil
	})
	sc.Step(`^the Stock Lot just added is not in any Storage Place$`, func() error {
		l, err := lastLot()
		if err != nil {
			return err
		}
		if l["storagePlaceId"] != nil {
			return fmt.Errorf("storagePlaceId = %v, want null", l["storagePlaceId"])
		}
		w.Vars["pantry.lot"] = int64(l["id"].(float64))
		return nil
	})
	sc.Step(`^the Stock Lot just added is good until (\d+) days? from today$`, func(n int) error {
		l, err := lastLot()
		if err != nil {
			return err
		}
		if want := daysFromToday(n); l["goesOff"] != want {
			return fmt.Errorf("goesOff = %v, want %s", l["goesOff"], want)
		}
		return nil
	})
	move := func(q, where string) error {
		lot, ok := w.Vars["pantry.lot"].(int64)
		if !ok {
			return fmt.Errorf("no Stock Lot to move")
		}
		pid, err := place(where)
		if err != nil {
			return err
		}
		body := map[string]any{"storagePlaceId": pid}
		if q != "" {
			qty, _ := strconv.ParseFloat(q, 64)
			body["quantity"] = qty
		}
		w.Last = w.Client.Do("POST", fmt.Sprintf("/api/stock/lots/%d/move", lot), body)
		return nil
	}
	sc.Step(`^I move it to the "([^"]*)"$`, func(where string) error { return move("", where) })
	sc.Step(`^I move ([\d.]+) (?:g|ml|piece) of it to the "([^"]*)"$`, move)
	sc.Step(`^"([^"]*)" has Stock Lots of ([\d., ]+) (?:g|ml|piece)$`, func(name, want string) error {
		id, err := ing(name)
		if err != nil {
			return err
		}
		var out struct {
			Lots []struct {
				Quantity float64 `json:"quantity"`
			} `json:"lots"`
		}
		r := w.Client.Get(fmt.Sprintf("/api/stock/lots?ingredientId=%d", id))
		if err := r.JSON(&out); err != nil {
			return err
		}
		got := []string{}
		for _, l := range out.Lots {
			got = append(got, strconv.FormatFloat(l.Quantity, 'f', -1, 64))
		}
		sort.Strings(got)
		wantList := strings.Split(strings.ReplaceAll(want, " ", ""), ",")
		sort.Strings(wantList)
		if strings.Join(got, ",") != strings.Join(wantList, ",") {
			return fmt.Errorf("lots = %v, want %v; body %s", got, wantList, r.Body)
		}
		return nil
	})
	sc.Step(`^the Storage Places are "([^"]*)"$`, func(want string) error {
		var out []struct {
			Name    string `json:"name"`
			Kind    string `json:"kind"`
			Default bool   `json:"default"`
		}
		if err := w.Client.Get("/api/storage-places").JSON(&out); err != nil {
			return err
		}
		got := []string{}
		for _, p := range out {
			d := ""
			if p.Default {
				d = ", default"
			}
			got = append(got, fmt.Sprintf("%s (%s%s)", p.Name, p.Kind, d))
		}
		if strings.Join(got, "; ") != want {
			return fmt.Errorf("Storage Places = %q, want %q", strings.Join(got, "; "), want)
		}
		return nil
	})
	sc.Step(`^I change the Storage Place "([^"]*)" with JSON:$`, func(where string, body *godog.DocString) error {
		pid, err := place(where)
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("PATCH", fmt.Sprintf("/api/storage-places/%d", pid), []byte(body.Content))
		return nil
	})
	sc.Step(`^I delete the Storage Place "([^"]*)"$`, func(where string) error {
		pid, err := place(where)
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("DELETE", fmt.Sprintf("/api/storage-places/%d", pid), nil)
		return nil
	})
	sc.Step(`^the Stock Lot I put away is not in any Storage Place now$`, func() error {
		lot := w.Vars["pantry.lot"].(int64)
		var out struct {
			Lots []map[string]any `json:"lots"`
		}
		if err := w.Client.Get("/api/stock/lots").JSON(&out); err != nil {
			return err
		}
		for _, l := range out.Lots {
			if int64(l["id"].(float64)) == lot {
				if l["storagePlaceId"] != nil {
					return fmt.Errorf("storagePlaceId = %v, want null", l["storagePlaceId"])
				}
				return nil
			}
		}
		return fmt.Errorf("Stock Lot %d is gone", lot)
	})
}
