package bdd

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/cucumber/godog"
)

// Step definitions for bdd/features/beta5/used_from.feature (team B5-UFR; ADR 0011, docs/dev/design/b5-ufr.md). They
// reuse the shopping household set-up of steps_shopping_scan_test.go and steps_beta5_bo_test.go (Recipes, "the planned
// dinners:", scenario variables "ss:ingredient:<name>" and "ss:slot:<weekday>"). A Lot is told apart by the date it was
// bought on, so the scenarios never need a Lot id.

func init() { RegisterSteps("beta5-ufr", beta5UsedFromSteps) }

func beta5UsedFromSteps(sc *godog.ScenarioContext, w *World) {
	ingredientID := func(name string) (int64, error) {
		v, _ := w.Vars["ss:ingredient:"+name].(int64)
		if v == 0 {
			return 0, fmt.Errorf("Ingredient %q was not set up", name)
		}
		return v, nil
	}
	slotOn := func(date string) (int64, error) {
		wd, err := ssWeekday(date)
		if err != nil {
			return 0, err
		}
		v, _ := w.Vars["ss:slot:"+strconv.Itoa(wd)].(int64)
		if v == 0 {
			return 0, fmt.Errorf("no Dinner Meal Slot on %s was set up", date)
		}
		return v, nil
	}
	dinnerPath := func(date, suffix string) (string, error) {
		slot, err := slotOn(date)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("/api/plan/%s/%d/%d%s", date, slot, mainCourseID(w), suffix), nil
	}
	type lot struct {
		ID        int64   `json:"id"`
		Quantity  float64 `json:"quantity"`
		Purchased string  `json:"purchased"`
	}
	lotsOf := func(name string) ([]lot, error) {
		iid, err := ingredientID(name)
		if err != nil {
			return nil, err
		}
		var out struct {
			Lots []lot `json:"lots"`
		}
		r := w.Client.Get(fmt.Sprintf("/api/stock/lots?ingredientId=%d", iid))
		if err := r.JSON(&out); err != nil || r.Status != 200 {
			return nil, fmt.Errorf("list Lots of %q: %d %s", name, r.Status, r.Body)
		}
		return out.Lots, nil
	}
	lotBoughtOn := func(name, date string) (lot, error) {
		lots, err := lotsOf(name)
		if err != nil {
			return lot{}, err
		}
		for _, l := range lots {
			if l.Purchased == date {
				return l, nil
			}
		}
		// Not among that Ingredient's Lots: any Ingredient's Lot bought that day (a pick may name another Ingredient's Lot).
		var all struct {
			Lots []lot `json:"lots"`
		}
		r := w.Client.Get("/api/stock/lots")
		if err := r.JSON(&all); err != nil || r.Status != 200 {
			return lot{}, fmt.Errorf("list Lots: %d %s", r.Status, r.Body)
		}
		for _, l := range all.Lots {
			if l.Purchased == date {
				return l, nil
			}
		}
		return lot{}, fmt.Errorf("no Lot bought on %s", date)
	}
	// usedFromOf turns the rows of "ingredient | bought | quantity" into the request's usedFrom list.
	usedFromOf := func(table *godog.Table) ([]map[string]any, error) {
		var order []int64
		lots := map[int64][]map[string]any{}
		for _, row := range table.Rows[1:] {
			cell := func(i int) string { return strings.TrimSpace(row.Cells[i].Value) }
			iid, err := ingredientID(cell(0))
			if err != nil {
				return nil, err
			}
			id := int64(0)
			if cell(1) == "no such Lot" {
				id = 999999
			} else if cell(1) != "" {
				l, err := lotBoughtOn(cell(0), cell(1))
				if err != nil {
					return nil, err
				}
				id = l.ID
			}
			qty, _ := strconv.ParseFloat(cell(2), 64)
			if _, ok := lots[iid]; !ok {
				order = append(order, iid)
			}
			lots[iid] = append(lots[iid], map[string]any{"lotId": id, "quantity": qty})
		}
		out := []map[string]any{}
		for _, iid := range order {
			out = append(out, map[string]any{"ingredientId": iid, "lots": lots[iid]})
		}
		return out, nil
	}
	mealState := func(date string) (string, error) {
		r := w.Client.Get("/api/plan?from=" + date + "&to=" + date)
		var doc struct {
			Slots []struct {
				Courses []struct {
					Main bool `json:"main"`
					Meal *struct {
						State string `json:"state"`
					} `json:"meal"`
				} `json:"courses"`
			} `json:"slots"`
		}
		if err := r.JSON(&doc); err != nil || r.Status != 200 {
			return "", fmt.Errorf("GET /api/plan: %d %s", r.Status, r.Body)
		}
		for _, s := range doc.Slots {
			for _, c := range s.Courses {
				if c.Main && c.Meal != nil {
					return c.Meal.State, nil
				}
			}
		}
		return "", fmt.Errorf("no main Course Planned Meal on %s", date)
	}

	// --- Stock set-up ---

	sc.Step(`^the shopping Stock gets a Lot of (\d+) g of "([^"]*)" bought on `+ssDate+` going off on `+ssDate+`(?: in the Storage Place "([^"]*)")?$`,
		func(qty int, name, bought, goesOff, place string) error {
			iid, err := ingredientID(name)
			if err != nil {
				return err
			}
			admin := w.Ensure().LoginAdmin(w.TB)
			body := map[string]any{"ingredientId": iid, "quantity": qty, "purchased": bought}
			if place != "" {
				pid, ok := w.Vars["ufr:place:"+place].(int64)
				if !ok {
					var p struct {
						ID int64 `json:"id"`
					}
					r := admin.Post("/api/storage-places", map[string]any{"name": place, "kind": "fridge"})
					if err := r.JSON(&p); err != nil || r.Status != 201 {
						return fmt.Errorf("create Storage Place %q: %d %s", place, r.Status, r.Body)
					}
					pid = p.ID
					w.Vars["ufr:place:"+place] = pid
				}
				body["storagePlaceId"] = pid
			}
			var l lot
			r := admin.Post("/api/stock/lots", body)
			if err := r.JSON(&l); err != nil || r.Status != 201 {
				return fmt.Errorf("add a Stock Lot: %d %s", r.Status, r.Body)
			}
			if r := admin.Do("PATCH", fmt.Sprintf("/api/stock/lots/%d", l.ID), map[string]any{"goesOff": goesOff}); r.Status != 200 {
				return fmt.Errorf("set go-off of Lot %d: %d %s", l.ID, r.Status, r.Body)
			}
			return nil
		})

	// --- The Cooked sheet ---

	sc.Step(`^I ask for the Cooked sheet of the Dinner of `+ssDate+`$`, func(date string) error {
		p, err := dinnerPath(date, "/cook")
		if err != nil {
			return err
		}
		w.Last = w.Client.Get(p)
		if w.Last.Status != 200 {
			return fmt.Errorf("cook preview: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})
	needOf := func(name string) (map[string]any, error) {
		v, err := ssPath(w.Last.Body, "needs")
		if err != nil {
			return nil, err
		}
		for _, n := range v.([]any) {
			if m := n.(map[string]any); m["ingredient"] == name {
				return m, nil
			}
		}
		return nil, fmt.Errorf("the Cooked sheet has no need for %q: %s", name, w.Last.Body)
	}
	sc.Step(`^the Cooked sheet needs (\d+) (g|ml|piece) of "([^"]*)"$`, func(qty int, unit, name string) error {
		n, err := needOf(name)
		if err != nil {
			return err
		}
		if ssNum(n["quantity"]) != float64(qty) || n["baseUnit"] != unit {
			return fmt.Errorf("need of %s = %v %v, want %d %s", name, n["quantity"], n["baseUnit"], qty, unit)
		}
		return nil
	})
	sc.Step(`^the Cooked sheet lists these Lots of "([^"]*)" in this order:$`, func(name string, table *godog.Table) error {
		n, err := needOf(name)
		if err != nil {
			return err
		}
		lots, _ := n["lots"].([]any)
		if len(lots) != len(table.Rows)-1 {
			return fmt.Errorf("%d Lots of %s on the sheet, want %d: %s", len(lots), name, len(table.Rows)-1, w.Last.Body)
		}
		for i, row := range table.Rows[1:] {
			cell := func(j int) string { return strings.TrimSpace(row.Cells[j].Value) }
			l := lots[i].(map[string]any)
			goesOff, _ := l["goesOff"].(string)
			place, _ := l["storagePlaceName"].(string)
			want, _ := strconv.ParseFloat(cell(0), 64)
			if ssNum(l["quantity"]) != want || l["purchased"] != cell(1) || goesOff != cell(2) || place != cell(3) {
				return fmt.Errorf("Lot %d of %s = %v, want quantity %s, bought %s, goes off %q, place %q", i+1, name, l, cell(0), cell(1), cell(2), cell(3))
			}
		}
		return nil
	})

	// --- Marking Cooked ---

	cook := func(try, date string, usedFrom []map[string]any, all bool) error {
		var p string
		var body map[string]any
		if all {
			slot, err := slotOn(date)
			if err != nil {
				return err
			}
			p = fmt.Sprintf("/api/plan/%s/%d/all/cooked", date, slot)
			entry := map[string]any{"courseId": mainCourseID(w)}
			if usedFrom != nil {
				entry["usedFrom"] = usedFrom
			}
			body = map[string]any{"courses": []map[string]any{entry}}
		} else {
			var err error
			if p, err = dinnerPath(date, "/cooked"); err != nil {
				return err
			}
			body = map[string]any{}
			if usedFrom != nil {
				body["usedFrom"] = usedFrom
			}
		}
		w.Last = w.Client.Post(p, body)
		if try == "" && w.Last.Status != 200 {
			return fmt.Errorf("mark %s Cooked: %d %s", date, w.Last.Status, w.Last.Body)
		}
		return nil
	}
	sc.Step(`^I (try to )?mark the Dinner of `+ssDate+` Cooked$`, func(try, date string) error { return cook(try, date, nil, false) })
	sc.Step(`^I (try to )?mark the Dinner of `+ssDate+` Cooked using:$`, func(try, date string, table *godog.Table) error {
		uf, err := usedFromOf(table)
		if err != nil {
			return err
		}
		return cook(try, date, uf, false)
	})
	sc.Step(`^I (try to )?mark all Courses of the Dinner of `+ssDate+` Cooked$`, func(try, date string) error { return cook(try, date, nil, true) })
	sc.Step(`^I (try to )?mark all Courses of the Dinner of `+ssDate+` Cooked using:$`, func(try, date string, table *godog.Table) error {
		uf, err := usedFromOf(table)
		if err != nil {
			return err
		}
		return cook(try, date, uf, true)
	})
	sc.Step(`^I mark the Dinner of `+ssDate+` Cooked using a malformed list$`, func(date string) error {
		p, err := dinnerPath(date, "/cooked")
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("POST", p, json.RawMessage(`{"usedFrom": "the open pack"}`))
		return nil
	})

	// --- What came out ---

	sc.Step(`^the Cooked answer is (\d+) with the code "([a-z_]+)"$`, func(status int, code string) error {
		var e struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		_ = w.Last.JSON(&e)
		if w.Last.Status != status || e.Error.Code != code {
			return fmt.Errorf("answer %d %q (%s), want %d %s", w.Last.Status, e.Error.Code, w.Last.Body, status, code)
		}
		return nil
	})
	sc.Step(`^the Cooked answer is (\d+)$`, func(status int) error {
		if w.Last.Status != status {
			return fmt.Errorf("answer %d (%s), want %d", w.Last.Status, w.Last.Body, status)
		}
		return nil
	})
	sc.Step(`^the Stock Lot of "([^"]*)" bought on `+ssDate+` holds (\d+) g$`, func(name, date string, want int) error {
		lots, err := lotsOf(name)
		if err != nil {
			return err
		}
		got := 0.0
		for _, l := range lots {
			if l.Purchased == date {
				got += l.Quantity
			}
		}
		if got != float64(want) {
			return fmt.Errorf("the Lot of %s bought on %s holds %v g, want %d (Lots: %+v)", name, date, got, want, lots)
		}
		return nil
	})
	sc.Step(`^the Stock Lot of "([^"]*)" bought on `+ssDate+` is used up$`, func(name, date string) error {
		lots, err := lotsOf(name)
		if err != nil {
			return err
		}
		for _, l := range lots {
			if l.Purchased == date && l.Quantity > 0 {
				return fmt.Errorf("the Lot of %s bought on %s still holds %v g", name, date, l.Quantity)
			}
		}
		return nil
	})
	sc.Step(`^the Dinner of `+ssDate+` is (still planned|Cooked)$`, func(date, want string) error {
		got, err := mealState(date)
		if err != nil {
			return err
		}
		if wantState := map[string]string{"still planned": "planned", "Cooked": "cooked"}[want]; got != wantState {
			return fmt.Errorf("the Dinner of %s is %q, want %q", date, got, wantState)
		}
		return nil
	})
}
