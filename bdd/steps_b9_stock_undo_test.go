package bdd

import (
	"fmt"
	"net/url"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("b9_stock_undo", b9StockUndoSteps) }

// b9StockUndoSteps drives B9-05's Stock routes: waste Undo, Keep with a date and Put away. Ingredient ids are in
// w.Vars["stock.ing.<name>"] and Storage Place ids in w.Vars["pantry.place.<name>"] (the stock and pantry steps).
func b9StockUndoSteps(sc *godog.ScenarioContext, w *World) {
	ing := func(name string) (int64, error) {
		id, ok := w.Vars["stock.ing."+name].(int64)
		if !ok {
			return 0, fmt.Errorf("no Ingredient %q in this scenario", name)
		}
		return id, nil
	}
	place := func(name string) (int64, error) {
		id, ok := w.Vars["pantry.place."+name].(int64)
		if !ok {
			return 0, fmt.Errorf("no Storage Place %q in this scenario", name)
		}
		return id, nil
	}
	// lotOf is the newest Stock Lot of the Ingredient, with the Storage Place it is in.
	lotOf := func(name string) (id int64, placeID *int64, err error) {
		iid, err := ing(name)
		if err != nil {
			return 0, nil, err
		}
		var out struct {
			Lots []struct {
				ID             int64  `json:"id"`
				StoragePlaceID *int64 `json:"storagePlaceId"`
			} `json:"lots"`
		}
		r := w.Client.Get("/api/stock/lots?" + url.Values{"ingredientId": {fmt.Sprint(iid)}}.Encode())
		if err := r.JSON(&out); err != nil || r.Status != 200 || len(out.Lots) == 0 {
			return 0, nil, fmt.Errorf("no Stock Lot of %q: %d %s", name, r.Status, r.Body)
		}
		best := out.Lots[0]
		for _, l := range out.Lots {
			if l.ID > best.ID {
				best = l
			}
		}
		return best.ID, best.StoragePlaceID, nil
	}

	// ---- Throw out Undo ----
	sc.Step(`^I undo the latest Throw out$`, func() error {
		var out struct {
			Records []struct {
				ID int64 `json:"id"`
			} `json:"records"`
		}
		r := w.Client.Get("/api/stock/waste")
		if err := r.JSON(&out); err != nil || len(out.Records) == 0 {
			return fmt.Errorf("no waste record to undo: %d %s", r.Status, r.Body)
		}
		id := out.Records[len(out.Records)-1].ID
		w.Vars["b9.waste"] = id
		w.Last = w.Client.Do("POST", fmt.Sprintf("/api/stock/waste/%d/undo", id), nil)
		return nil
	})
	sc.Step(`^I undo the Throw out recorded before$`, func() error {
		id, ok := w.Vars["b9.waste"].(int64)
		if !ok {
			return fmt.Errorf("no Throw out was undone before in this scenario")
		}
		w.Last = w.Client.Do("POST", fmt.Sprintf("/api/stock/waste/%d/undo", id), nil)
		return nil
	})
	sc.Step(`^there are no waste records$`, func() error {
		var out struct {
			Records []map[string]any `json:"records"`
		}
		if err := w.Client.Get("/api/stock/waste").JSON(&out); err != nil {
			return err
		}
		if len(out.Records) != 0 {
			return fmt.Errorf("waste records = %v, want none", out.Records)
		}
		return nil
	})

	// ---- Keep until a date ----
	// The Lot is looked up among the Ingredient's Lots, not on the spoiled list: Change keeps a Lot that the first Keep
	// already took off that list.
	sc.Step(`^I keep the (?:spoiled )?Stock Lot of "([^"]*)" until "([^"]*)"$`, func(name, date string) error {
		id, _, err := lotOf(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("POST", fmt.Sprintf("/api/stock/lots/%d/keep", id), map[string]any{"goodUntil": date})
		return nil
	})

	// ---- Put away ----
	putAway := func(moves ...map[string]any) {
		w.Last = w.Client.Do("POST", "/api/stock/lots/put-away", map[string]any{"moves": moves})
	}
	move := func(name string, placeID int64) (map[string]any, error) {
		id, _, err := lotOf(name)
		if err != nil {
			return nil, err
		}
		return map[string]any{"lotId": id, "storagePlaceId": placeID}, nil
	}
	sc.Step(`^I put away the Stock Lot of "([^"]*)" into the "([^"]*)"$`, func(name, where string) error {
		pid, err := place(where)
		if err != nil {
			return err
		}
		m, err := move(name, pid)
		if err != nil {
			return err
		}
		putAway(m)
		return nil
	})
	sc.Step(`^I put away the Stock Lot of "([^"]*)" into the "([^"]*)" and of "([^"]*)" into the "([^"]*)"$`, func(a, aWhere, b, bWhere string) error {
		ap, err := place(aWhere)
		if err != nil {
			return err
		}
		bp, err := place(bWhere)
		if err != nil {
			return err
		}
		ma, err := move(a, ap)
		if err != nil {
			return err
		}
		mb, err := move(b, bp)
		if err != nil {
			return err
		}
		putAway(ma, mb)
		return nil
	})
	sc.Step(`^I put away the Stock Lot of "([^"]*)" into the "([^"]*)" and of "([^"]*)" into the Storage Place (\d+)$`, func(a, aWhere, b string, bID int) error {
		ap, err := place(aWhere)
		if err != nil {
			return err
		}
		ma, err := move(a, ap)
		if err != nil {
			return err
		}
		mb, err := move(b, int64(bID))
		if err != nil {
			return err
		}
		putAway(ma, mb)
		return nil
	})
	sc.Step(`^the put away skipped (\d+) Stock Lots?$`, func(n int) error {
		var out struct {
			Skipped []int64 `json:"skipped"`
		}
		if err := w.Last.JSON(&out); err != nil {
			return err
		}
		if len(out.Skipped) != n {
			return fmt.Errorf("skipped = %v, want %d", out.Skipped, n)
		}
		return nil
	})
	sc.Step(`^the Stock Lot of "([^"]*)" is in the "([^"]*)"$`, func(name, where string) error {
		pid, err := place(where)
		if err != nil {
			return err
		}
		_, got, err := lotOf(name)
		if err != nil {
			return err
		}
		if got == nil || *got != pid {
			return fmt.Errorf("the Stock Lot of %q is in %v, want %q (%d)", name, got, where, pid)
		}
		return nil
	})
	sc.Step(`^the Stock Lot of "([^"]*)" is not in any Storage Place$`, func(name string) error {
		_, got, err := lotOf(name)
		if err != nil {
			return err
		}
		if got != nil {
			return fmt.Errorf("the Stock Lot of %q is in Storage Place %d, want Not sorted", name, *got)
		}
		return nil
	})
}
