package bdd

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("stock", stockSteps) }

// stockSteps drives the Stock API. All step text is about Stock Lots so it cannot
// clash with other features. Ingredient ids are kept in w.Vars["stock.ing.<name>"].
func stockSteps(sc *godog.ScenarioContext, w *World) {
	ingID := func(name string) (int64, error) {
		id, ok := w.Vars["stock.ing."+name].(int64)
		if !ok {
			return 0, fmt.Errorf("Ingredient %q was not set up in this scenario", name)
		}
		return id, nil
	}
	post := func(path string, body any) { w.Ensure(); w.Last = w.Client.Do("POST", path, body) }
	json := func(v any) error { return w.Last.JSON(v) }

	lotsOf := func(name string) ([]map[string]any, error) {
		id, err := ingID(name)
		if err != nil {
			return nil, err
		}
		r := w.Client.Get(fmt.Sprintf("/api/stock/lots?ingredientId=%d", id))
		var out struct {
			Lots []map[string]any `json:"lots"`
		}
		if err := r.JSON(&out); err != nil || r.Status != 200 {
			return nil, fmt.Errorf("list lots: %d %s", r.Status, r.Body)
		}
		return out.Lots, nil
	}
	spoiledLotOf := func(name string) (int64, error) {
		id, err := ingID(name)
		if err != nil {
			return 0, err
		}
		var out struct {
			Lots []struct {
				ID           int64 `json:"id"`
				IngredientID int64 `json:"ingredientId"`
			} `json:"lots"`
		}
		if err := w.Client.Get("/api/stock/spoiled").JSON(&out); err != nil {
			return 0, err
		}
		for _, l := range out.Lots {
			if l.IngredientID == id {
				return l.ID, nil
			}
		}
		return 0, fmt.Errorf("no spoiled Stock Lot of %q", name)
	}
	newestLotOf := func(name string) (map[string]any, error) {
		lots, err := lotsOf(name)
		if err != nil || len(lots) == 0 {
			return nil, fmt.Errorf("no Stock Lots of %q (%v)", name, err)
		}
		best := lots[0]
		for _, l := range lots {
			if l["id"].(float64) > best["id"].(float64) {
				best = l
			}
		}
		return best, nil
	}
	holds := func(name string) (float64, error) {
		id, err := ingID(name)
		if err != nil {
			return 0, err
		}
		var out struct {
			Ingredients []struct {
				IngredientID int64   `json:"ingredientId"`
				Total        float64 `json:"total"`
			} `json:"ingredients"`
		}
		r := w.Client.Get("/api/stock")
		if err := r.JSON(&out); err != nil || r.Status != 200 {
			return 0, fmt.Errorf("GET /api/stock: %d %s", r.Status, r.Body)
		}
		for _, i := range out.Ingredients {
			if i.IngredientID == id {
				return i.Total, nil
			}
		}
		return 0, nil
	}
	date := func(s string) string {
		if s == "" {
			return ""
		}
		return s
	}
	today := func() string { return w.Ensure().Clock.Now().Format("2006-01-02") }

	newIngredient := func(name, unit string, shelf any) error {
		w.Ensure()
		body := map[string]any{"name": name, "baseUnit": unit}
		if shelf != nil {
			body["shelfLifeDays"] = shelf
		}
		r := w.Client.Do("POST", "/api/ingredients", body)
		var out struct {
			ID int64 `json:"id"`
		}
		if r.Status != 201 || r.JSON(&out) != nil {
			return fmt.Errorf("create Ingredient %q: %d %s", name, r.Status, r.Body)
		}
		w.Vars["stock.ing."+name] = out.ID
		return nil
	}
	sc.Step(`^Stock knows the Ingredient "([^"]*)" in (g|ml|piece) with a Shelf Life of (\d+) days$`, func(name, unit string, days int) error {
		return newIngredient(name, unit, days)
	})
	sc.Step(`^Stock knows the Ingredient "([^"]*)" in (g|ml|piece) with no Shelf Life$`, func(name, unit string) error {
		return newIngredient(name, unit, nil)
	})

	addLot := func(name string, qty float64, purchased, source, uuid string) error {
		id, err := ingID(name)
		if err != nil {
			return err
		}
		body := map[string]any{"ingredientId": id, "quantity": qty}
		if purchased != "" {
			body["purchased"] = purchased
		}
		if source != "" {
			body["source"] = source
		}
		if uuid != "" {
			body["clientUuid"] = uuid
		}
		post("/api/stock/lots", body)
		return nil
	}
	sc.Step(`^I add a Stock Lot of ([\d.]+) (?:g|ml|piece) of "([^"]*)" bought on "([^"]*)"$`, func(q, name, d string) error {
		qty, _ := strconv.ParseFloat(q, 64)
		return addLot(name, qty, date(d), "", "")
	})
	sc.Step(`^I add a Stock Lot of ([\d.]+) (?:g|ml|piece) of "([^"]*)" bought today$`, func(q, name string) error {
		qty, _ := strconv.ParseFloat(q, 64)
		return addLot(name, qty, today(), "", "")
	})
	sc.Step(`^I scan-add a Stock Lot of ([\d.]+) (?:g|ml|piece) of "([^"]*)" with client id "([^"]*)"$`, func(q, name, uuid string) error {
		qty, _ := strconv.ParseFloat(q, 64)
		return addLot(name, qty, "", "scan", uuid)
	})
	sc.Step(`^the Stock Lot just added has no go-off date$`, func() error {
		var l map[string]any
		if err := json(&l); err != nil {
			return err
		}
		if l["goesOff"] != nil {
			return fmt.Errorf("goesOff = %v, want null", l["goesOff"])
		}
		return nil
	})

	sc.Step(`^I do a Stock-take setting "([^"]*)" to (-?[\d.]+) (?:g|ml|piece)$`, func(name, q string) error {
		id, err := ingID(name)
		if err != nil {
			return err
		}
		total, _ := strconv.ParseFloat(q, 64)
		w.Last = w.Client.Do("PUT", fmt.Sprintf("/api/stock/ingredients/%d/total", id), map[string]any{"total": total})
		return nil
	})

	sc.Step(`^Stock holds ([\d.]+) (?:g|ml|piece) of "([^"]*)"$`, func(q, name string) error {
		want, _ := strconv.ParseFloat(q, 64)
		got, err := holds(name)
		if err != nil {
			return err
		}
		if got != want {
			return fmt.Errorf("Stock holds %v of %q, want %v", got, name, want)
		}
		return nil
	})
	sc.Step(`^Stock holds nothing of "([^"]*)"$`, func(name string) error {
		got, err := holds(name)
		if err != nil {
			return err
		}
		if got != 0 {
			return fmt.Errorf("Stock holds %v of %q, want nothing", got, name)
		}
		return nil
	})
	sc.Step(`^"([^"]*)" has (\d+) Stock Lots going off on "([^"]*)"$`, func(name string, n int, dates string) error {
		lots, err := lotsOf(name)
		if err != nil {
			return err
		}
		var got []string
		for _, l := range lots {
			if g, ok := l["goesOff"].(string); ok {
				got = append(got, g)
			} else {
				got = append(got, "")
			}
		}
		want := []string{}
		if dates != "" {
			for _, d := range strings.Split(dates, ",") {
				want = append(want, strings.TrimSpace(d))
			}
		} else {
			want = append(want, "")
		}
		if len(lots) != n || strings.Join(got, ",") != strings.Join(want, ",") {
			return fmt.Errorf("%q lots go off on %v (n=%d), want %v (n=%d)", name, got, len(lots), want, n)
		}
		return nil
	})
	sc.Step(`^the newest Stock Lot of "([^"]*)" has source "([^"]*)"$`, func(name, source string) error {
		l, err := newestLotOf(name)
		if err != nil {
			return err
		}
		if l["source"] != source {
			return fmt.Errorf("source = %v, want %s", l["source"], source)
		}
		return nil
	})

	// Cooked.
	needs := func(pairs ...any) []map[string]any {
		var out []map[string]any
		for i := 0; i < len(pairs); i += 2 {
			out = append(out, map[string]any{"ingredientId": pairs[i], "quantity": pairs[i+1]})
		}
		return out
	}
	sc.Step(`^a meal is Cooked needing ([\d.]+) (?:g|ml|piece) of "([^"]*)"$`, func(q, name string) error {
		id, err := ingID(name)
		if err != nil {
			return err
		}
		qty, _ := strconv.ParseFloat(q, 64)
		post("/api/stock/cooked", map[string]any{"needs": needs(id, qty)})
		return nil
	})
	sc.Step(`^a meal is Cooked needing ([\d.]+) (?:g|ml|piece) of "([^"]*)" and ([\d.]+) (?:g|ml|piece) of "([^"]*)"$`, func(q1, n1, q2, n2 string) error {
		id1, err := ingID(n1)
		if err != nil {
			return err
		}
		id2, err := ingID(n2)
		if err != nil {
			return err
		}
		a, _ := strconv.ParseFloat(q1, 64)
		b, _ := strconv.ParseFloat(q2, 64)
		post("/api/stock/cooked", map[string]any{"needs": needs(id1, a, id2, b)})
		return nil
	})
	sc.Step(`^there is no Stock warning$`, func() error {
		var out struct {
			Warnings []any `json:"warnings"`
		}
		if err := json(&out); err != nil {
			return err
		}
		if len(out.Warnings) != 0 {
			return fmt.Errorf("warnings = %v", out.Warnings)
		}
		return nil
	})
	sc.Step(`^the Stock warning reads "([^"]*)"$`, func(msg string) error {
		var out struct {
			Warnings []struct {
				Message string `json:"message"`
			} `json:"warnings"`
		}
		if err := json(&out); err != nil {
			return err
		}
		if len(out.Warnings) != 1 || out.Warnings[0].Message != msg {
			return fmt.Errorf("warnings = %+v, want one reading %q; body %s", out.Warnings, msg, w.Last.Body)
		}
		return nil
	})

	// Spoiled.
	sc.Step(`^(\d+) days go by in the kitchen$`, func(n int) { w.Ensure().Clock.Advance(time.Duration(n) * 24 * time.Hour) })
	sc.Step(`^I list the spoiled Stock Lots$`, func() { w.Ensure(); w.Last = w.Client.Get("/api/stock/spoiled") })
	sc.Step(`^the spoiled list has (\d+) Stock Lots?$`, func(n int) error {
		var out struct {
			Lots []any `json:"lots"`
		}
		if err := json(&out); err != nil {
			return err
		}
		if len(out.Lots) != n {
			return fmt.Errorf("spoiled lots = %d, want %d; body %s", len(out.Lots), n, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the spoiled list includes the Stock Lot of ([\d.]+) (?:g|ml|piece) of "([^"]*)"$`, func(q, name string) error {
		want, _ := strconv.ParseFloat(q, 64)
		id, err := ingID(name)
		if err != nil {
			return err
		}
		var out struct {
			Lots []struct {
				IngredientID int64   `json:"ingredientId"`
				Quantity     float64 `json:"quantity"`
			} `json:"lots"`
		}
		if err := json(&out); err != nil {
			return err
		}
		for _, l := range out.Lots {
			if l.IngredientID == id && l.Quantity == want {
				return nil
			}
		}
		return fmt.Errorf("not found in %s", w.Last.Body)
	})
	sc.Step(`^I throw out the spoiled Stock Lot of "([^"]*)"$`, func(name string) error {
		id, err := spoiledLotOf(name)
		if err != nil {
			return err
		}
		post(fmt.Sprintf("/api/stock/lots/%d/throw-out", id), nil)
		return nil
	})
	sc.Step(`^I keep the spoiled Stock Lot of "([^"]*)"$`, func(name string) error {
		id, err := spoiledLotOf(name)
		if err != nil {
			return err
		}
		post(fmt.Sprintf("/api/stock/lots/%d/keep", id), nil)
		return nil
	})
	sc.Step(`^I throw out the newest Stock Lot of "([^"]*)"$`, func(name string) error {
		l, err := newestLotOf(name)
		if err != nil {
			return err
		}
		post(fmt.Sprintf("/api/stock/lots/%d/throw-out", int64(l["id"].(float64))), nil)
		return nil
	})
	sc.Step(`^the waste records show ([\d.]+) (?:g|ml|piece) of "([^"]*)" wasted because it spoiled$`, func(q, name string) error {
		want, _ := strconv.ParseFloat(q, 64)
		id, err := ingID(name)
		if err != nil {
			return err
		}
		var out struct {
			Records []struct {
				IngredientID int64   `json:"ingredientId"`
				Quantity     float64 `json:"quantity"`
				Reason       string  `json:"reason"`
			} `json:"records"`
		}
		if err := w.Client.Get("/api/stock/waste").JSON(&out); err != nil {
			return err
		}
		for _, r := range out.Records {
			if r.IngredientID == id && r.Quantity == want && r.Reason == "spoiled" {
				return nil
			}
		}
		return fmt.Errorf("no matching waste record in %+v", out.Records)
	})
}
