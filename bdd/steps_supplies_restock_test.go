package bdd

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Step definitions for bdd/features/supplies/supplies_restock.feature (H4: Restock Lines and kind in lists).
// Every step says "Supplies list", "Restock scan" or names a Supply, so none can collide with the other step sets. State
// lives in w.Vars under "restock:" keys. Ids: "restock:ing:<name>", "restock:product:<name>", "restock:shop:<name>",
// "restock:code:<barcode>" (the Product id), "restock:scan:<uuid>" (the last scan response).

func init() { RegisterSteps("supplies-restock", suppliesRestockSteps) }

func suppliesRestockSteps(sc *godog.ScenarioContext, w *World) {
	admin := func() *testkit.Client {
		if c, ok := w.Vars["restock:admin"].(*testkit.Client); ok {
			return c
		}
		c := w.Ensure().LoginAdmin(w.TB)
		w.Vars["restock:admin"] = c
		return c
	}
	user := func() *testkit.Client {
		if c, ok := w.Vars["restock:user"].(*testkit.Client); ok {
			return c
		}
		c := w.Ensure().LoginUser(w.TB)
		w.Vars["restock:user"] = c
		return c
	}
	id := func(kind, name string) (int64, error) {
		n, ok := w.Vars["restock:"+kind+":"+name].(int64)
		if !ok {
			return 0, fmt.Errorf("no %s %q was set up by this scenario", kind, name)
		}
		return n, nil
	}
	created := func(r *testkit.Response, what string) (int64, error) {
		if r.Status != 201 {
			return 0, fmt.Errorf("%s: status %d: %s", what, r.Status, r.Body)
		}
		var out struct{ ID int64 }
		if err := r.JSON(&out); err != nil {
			return 0, err
		}
		return out.ID, nil
	}

	sc.Step(`^the Household has the Shop "([^"]*)" for Supplies$`, func(name string) error {
		n, err := created(admin().Post("/api/shops", map[string]any{"name": name}), "create the Shop "+name)
		if err == nil {
			w.Vars["restock:shop:"+name] = n
		}
		return err
	})
	sc.Step(`^the Household has the Supply "([^"]*)" counted in (piece|g|ml) with a Restock level of (\d+)$`, func(name, base string, level int) error {
		n, err := created(admin().Post("/api/ingredients", map[string]any{"name": name, "baseUnit": base, "kind": "supply", "restockLevel": level}), "create the Supply "+name)
		if err == nil {
			w.Vars["restock:ing:"+name] = n
		}
		return err
	})
	sc.Step(`^the Supply "([^"]*)" is sold as the Product "([^"]*)" of pack size (\d+) with barcode "([^"]*)"$`, func(ing, prod string, size int, code string) error {
		iid, err := id("ing", ing)
		if err != nil {
			return err
		}
		n, err := created(user().Post("/api/products", map[string]any{"name": prod, "ingredientId": iid, "packSize": size, "barcodes": []string{code}}), "create the Product "+prod)
		if err == nil {
			w.Vars["restock:product:"+prod] = n
			w.Vars["restock:code:"+code] = n
		}
		return err
	})
	sc.Step(`^the Product "([^"]*)" of the Supply was last bought at the Shop "([^"]*)"$`, func(prod, shop string) error {
		pid, err := id("product", prod)
		if err != nil {
			return err
		}
		sid, err := id("shop", shop)
		if err != nil {
			return err
		}
		// A purchase alone: it makes the Product the one last bought without adding Stock.
		r := user().Post("/api/purchases", map[string]any{"productId": pid, "shopId": sid, "date": "2026-11-01"})
		if r.Status != 201 {
			return fmt.Errorf("record the purchase: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the Household holds (\d+) (?:piece|g|ml) of the Supply "([^"]*)"$`, func(qty int, name string) error {
		iid, err := id("ing", name)
		if err != nil {
			return err
		}
		r := user().Post("/api/stock/lots", map[string]any{"ingredientId": iid, "quantity": qty, "purchased": "2026-11-08"})
		if r.Status != 201 {
			return fmt.Errorf("add Stock: %d %s", r.Status, r.Body)
		}
		return nil
	})

	// --- the list ---
	sc.Step(`^I view the Supplies list(?: until "([^"]*)")?$`, func(to string) error {
		path := "/api/shopping/list"
		if to != "" {
			path += "?to=" + url.QueryEscape(to)
		}
		w.Last = user().Get(path)
		if w.Last.Status != 200 {
			return fmt.Errorf("list: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})
	type listJSON struct {
		Lines     []map[string]any `json:"lines"`
		NotNeeded []map[string]any `json:"notNeeded"`
		Extras    []map[string]any `json:"extras"`
		Complete  bool             `json:"complete"`
		Progress  struct{ Ticked, Total int }
	}
	list := func() (listJSON, error) {
		var l listJSON
		if w.Last == nil {
			return l, fmt.Errorf("no list was viewed")
		}
		return l, w.Last.JSON(&l)
	}
	find := func(rows []map[string]any, name string) map[string]any {
		for _, r := range rows {
			if r["name"] == name {
				return r
			}
		}
		return nil
	}
	lineOf := func(name string) (map[string]any, error) {
		l, err := list()
		if err != nil {
			return nil, err
		}
		if ln := find(l.Lines, name); ln != nil {
			return ln, nil
		}
		return nil, fmt.Errorf("no Line for %q in %s", name, w.Last.Body)
	}
	sc.Step(`^the Supplies list has a Line for "([^"]*)" of (\d+) (?:piece|g|ml)$`, func(name string, qty int) error {
		ln, err := lineOf(name)
		if err != nil {
			return err
		}
		if ln["quantity"] != float64(qty) {
			return fmt.Errorf("Line quantity = %v, want %d", ln["quantity"], qty)
		}
		return nil
	})
	sc.Step(`^the Supplies list has no Line for "([^"]*)"$`, func(name string) error {
		l, err := list()
		if err != nil {
			return err
		}
		if find(l.Lines, name) != nil {
			return fmt.Errorf("unexpected Line for %q in %s", name, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Line "([^"]*)" says (\d+) of (\d+) in Stock$`, func(name string, have, level int) error {
		ln, err := lineOf(name)
		if err != nil {
			return err
		}
		r, _ := ln["restock"].(map[string]any)
		if r == nil || r["level"] != float64(level) || r["stock"] != float64(have) {
			return fmt.Errorf("restock = %v, want %d of %d (stock of level)", ln["restock"], have, level)
		}
		return nil
	})
	sc.Step(`^the Line "([^"]*)" suggests (\d+) packs? of "([^"]*)"$`, func(name string, count int, prod string) error {
		ln, err := lineOf(name)
		if err != nil {
			return err
		}
		p, _ := ln["pack"].(map[string]any)
		if p == nil || p["count"] != float64(count) || p["name"] != prod {
			return fmt.Errorf("pack = %v, want %d x %s", ln["pack"], count, prod)
		}
		return nil
	})
	sc.Step(`^the Line "([^"]*)" has kind "([^"]*)"$`, func(name, kind string) error {
		ln, err := lineOf(name)
		if err != nil {
			return err
		}
		if ln["kind"] != kind {
			return fmt.Errorf("kind = %v, want %q", ln["kind"], kind)
		}
		return nil
	})
	sc.Step(`^the Line "([^"]*)" is ticked$`, func(name string) error {
		ln, err := lineOf(name)
		if err != nil {
			return err
		}
		if ln["ticked"] != true {
			return fmt.Errorf("Line %q is not ticked: %v", name, ln)
		}
		return nil
	})
	sc.Step(`^the Supplies list is complete$`, func() error {
		l, err := list()
		if err != nil {
			return err
		}
		if !l.Complete {
			return fmt.Errorf("the list is not complete: %s", w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Supplies list has (\d+) entries in all$`, func(n int) error {
		l, err := list()
		if err != nil {
			return err
		}
		if l.Progress.Total != n {
			return fmt.Errorf("Progress.Total = %d, want %d", l.Progress.Total, n)
		}
		return nil
	})
	sc.Step(`^the Supplies list has an extra of "([^"]*)" of kind "([^"]*)"$`, func(name, kind string) error {
		l, err := list()
		if err != nil {
			return err
		}
		if e := find(l.Extras, name); e == nil || e["kind"] != kind {
			return fmt.Errorf("extra %q = %v, want kind %q", name, e, kind)
		}
		return nil
	})
	sc.Step(`^Not needed holds "([^"]*)" of kind "([^"]*)"$`, func(name, kind string) error {
		l, err := list()
		if err != nil {
			return err
		}
		if e := find(l.NotNeeded, name); e == nil || e["kind"] != kind {
			return fmt.Errorf("Not needed %q = %v, want kind %q; body %s", name, e, kind, w.Last.Body)
		}
		return nil
	})

	// --- acting on the list ---
	sc.Step(`^I tick the Supply "([^"]*)" on the list by hand with (\d+) (?:piece|g|ml)$`, func(name string, qty int) error {
		iid, err := id("ing", name)
		if err != nil {
			return err
		}
		w.Last = user().Post("/api/shopping/ticks", map[string]any{"ingredientId": iid, "to": "2026-11-15", "quantity": qty, "clientUuid": "restock-tick-" + name})
		if w.Last.Status != 200 {
			return fmt.Errorf("tick: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^I add a list extra of (\d+) (?:piece|g|ml) of the Supply "([^"]*)"$`, func(qty int, name string) error {
		iid, err := id("ing", name)
		if err != nil {
			return err
		}
		w.Last = user().Post("/api/shopping/extras", map[string]any{"ingredientId": iid, "quantity": qty})
		if w.Last.Status != 201 {
			return fmt.Errorf("extra: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^I mark the Supply "([^"]*)" as Not needed$`, func(name string) error {
		iid, err := id("ing", name)
		if err != nil {
			return err
		}
		w.Last = user().Post("/api/shopping/not-needed", map[string]any{"ingredientId": iid, "to": "2026-11-15"})
		if w.Last.Status != 200 {
			return fmt.Errorf("not needed: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})

	// --- scans ---
	scanOp := func(uuid string, op map[string]any) error {
		op["clientUuid"], op["scannedAt"], op["rangeTo"] = uuid, "2026-11-09T12:00:00Z", "2026-11-15"
		r := user().Post("/api/scan", op)
		w.Vars["restock:scan:"+uuid] = r
		return nil
	}
	sc.Step(`^I scan the barcode "([^"]*)" at the Shop "([^"]*)" as Restock scan "([^"]*)"$`, func(code, shop, uuid string) error {
		pid, err := id("code", code)
		if err != nil {
			return err
		}
		sid, err := id("shop", shop)
		if err != nil {
			return err
		}
		var p struct {
			PackSize float64 `json:"packSize"`
		}
		user().Get("/api/products/" + strconv.FormatInt(pid, 10)).JSON(&p)
		return scanOp(uuid, map[string]any{"kind": "shop_scan", "shopId": sid, "productId": pid, "quantity": p.PackSize, "priceCents": 549})
	})
	sc.Step(`^I save the unknown barcode "([^"]*)" at the Shop "([^"]*)" as the new Supply "([^"]*)" counted in (piece|g|ml) with Product "([^"]*)" of pack size (\d+) as Restock scan "([^"]*)"$`,
		func(code, shop, ing, base, prod string, size int, uuid string) error {
			sid, err := id("shop", shop)
			if err != nil {
				return err
			}
			return scanOp(uuid, map[string]any{"kind": "shop_unknown", "shopId": sid, "barcode": code, "scope": "global",
				"ingredient": map[string]any{"name": ing, "baseUnit": base, "kind": "supply"}, "productName": prod, "packSize": size, "quantity": size, "priceCents": 299})
		})
	scanResult := func(uuid string) (map[string]any, error) {
		r, ok := w.Vars["restock:scan:"+uuid].(*testkit.Response)
		if !ok {
			return nil, fmt.Errorf("no scan %q was made", uuid)
		}
		var out map[string]any
		if err := r.JSON(&out); err != nil {
			return nil, fmt.Errorf("scan %q: %v: %s", uuid, err, r.Body)
		}
		return out, nil
	}
	sc.Step(`^Restock scan "([^"]*)" was applied$`, func(uuid string) error {
		out, err := scanResult(uuid)
		if err != nil {
			return err
		}
		if out["status"] != "applied" {
			return fmt.Errorf("scan %q = %v", uuid, out)
		}
		return nil
	})
	scanFlag := func(uuid, key string, want bool) error {
		out, err := scanResult(uuid)
		if err != nil {
			return err
		}
		s, _ := out["scan"].(map[string]any)
		if s == nil || s[key] != want {
			return fmt.Errorf("scan %q: %s = %v, want %v (%v)", uuid, key, s[key], want, out)
		}
		return nil
	}
	sc.Step(`^Restock scan "([^"]*)" ticked the Line$`, func(uuid string) error { return scanFlag(uuid, "ticked", true) })
	sc.Step(`^Restock scan "([^"]*)" was not on the list$`, func(uuid string) error { return scanFlag(uuid, "onList", false) })

	// --- Stock ---
	sc.Step(`^the Stock total of the Supply "([^"]*)" is (\d+)$`, func(name string, want int) error {
		iid, err := id("ing", name)
		if err != nil {
			iid = 0
		}
		var out struct {
			Ingredients []struct {
				IngredientID int64   `json:"ingredientId"`
				Name         string  `json:"name"`
				Total        float64 `json:"total"`
			} `json:"ingredients"`
		}
		r := user().Get("/api/stock")
		if err := r.JSON(&out); err != nil {
			return err
		}
		for _, i := range out.Ingredients {
			if i.Name == name || (iid != 0 && i.IngredientID == iid) {
				if i.Total != float64(want) {
					return fmt.Errorf("total of %q = %v, want %d", name, i.Total, want)
				}
				return nil
			}
		}
		if want == 0 {
			return nil
		}
		return fmt.Errorf("no Stock row for %q in %s", name, r.Body)
	})
	sc.Step(`^I list the Stock rows$`, func() { w.Last = user().Get("/api/stock") })
	sc.Step(`^the Stock row of "([^"]*)" has kind "([^"]*)"$`, func(name, kind string) error {
		var out struct {
			Ingredients []map[string]any `json:"ingredients"`
		}
		if err := w.Last.JSON(&out); err != nil {
			return err
		}
		for _, i := range out.Ingredients {
			if i["name"] == name {
				if i["kind"] != kind {
					return fmt.Errorf("kind = %v, want %q", i["kind"], kind)
				}
				return nil
			}
		}
		return fmt.Errorf("no Stock row for %q in %s", name, w.Last.Body)
	})
	sc.Step(`^I list the Stock Lots of the Supply "([^"]*)"$`, func(name string) error {
		iid, err := id("ing", name)
		if err != nil {
			return err
		}
		w.Last = user().Get("/api/stock/lots?ingredientId=" + strconv.FormatInt(iid, 10))
		return nil
	})
	sc.Step(`^every Lot has kind "([^"]*)"$`, func(kind string) error {
		var out struct {
			Lots []map[string]any `json:"lots"`
		}
		if err := w.Last.JSON(&out); err != nil {
			return err
		}
		if len(out.Lots) == 0 {
			return fmt.Errorf("no Lots in %s", w.Last.Body)
		}
		for _, l := range out.Lots {
			if l["kind"] != kind {
				return fmt.Errorf("Lot %v has kind %v, want %q", l["id"], l["kind"], kind)
			}
		}
		return nil
	})
	newestLot := func(name string) (id int64, qty float64, err error) {
		iid, err := id2(w, name)
		if err != nil {
			return 0, 0, err
		}
		var out struct {
			Lots []struct {
				ID       int64   `json:"id"`
				Quantity float64 `json:"quantity"`
			} `json:"lots"`
		}
		r := user().Get("/api/stock/lots?ingredientId=" + strconv.FormatInt(iid, 10))
		if err := r.JSON(&out); err != nil || len(out.Lots) == 0 {
			return 0, 0, fmt.Errorf("no Lots of %q: %v %s", name, err, r.Body)
		}
		last := out.Lots[len(out.Lots)-1]
		return last.ID, last.Quantity, nil
	}
	sc.Step(`^I edit the newest Lot of the Supply "([^"]*)" with JSON:$`, func(name string, doc *godog.DocString) error {
		lot, _, err := newestLot(name)
		if err != nil {
			return err
		}
		w.Last = user().Patch("/api/stock/lots/"+strconv.FormatInt(lot, 10), []byte(doc.Content))
		return nil
	})
	sc.Step(`^I use up (\d+) (?:piece|g|ml) of the newest Lot of the Supply "([^"]*)"$`, func(n int, name string) error {
		lot, qty, err := newestLot(name)
		if err != nil {
			return err
		}
		w.Last = user().Patch("/api/stock/lots/"+strconv.FormatInt(lot, 10), map[string]any{"quantity": qty - float64(n)})
		if w.Last.Status != 200 {
			return fmt.Errorf("use up: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^I use up the whole newest Lot of the Supply "([^"]*)"$`, func(name string) error {
		lot, _, err := newestLot(name)
		if err != nil {
			return err
		}
		w.Last = user().Delete("/api/stock/lots/" + strconv.FormatInt(lot, 10))
		if w.Last.Status != 204 {
			return fmt.Errorf("use up: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})
	// --- the catalogue and offline data ---
	sc.Step(`^the Ingredient "([^"]*)" is a Supply$`, func(name string) error {
		var out []struct {
			Name string `json:"name"`
			Kind string `json:"kind"`
		}
		r := user().Get("/api/ingredients?kind=supply")
		if err := r.JSON(&out); err != nil {
			return err
		}
		for _, i := range out {
			if strings.EqualFold(i.Name, name) && i.Kind == "supply" {
				return nil
			}
		}
		return fmt.Errorf("no Supply %q in %s", name, r.Body)
	})
	sc.Step(`^I load the offline scan data for the Shop "([^"]*)"$`, func(shop string) error {
		sid, err := id("shop", shop)
		if err != nil {
			return err
		}
		w.Last = user().Get("/api/scan/offline?shop=" + strconv.FormatInt(sid, 10))
		return nil
	})
	sc.Step(`^the offline Product "([^"]*)" is of kind "([^"]*)"$`, func(prod, kind string) error {
		var out struct {
			Products []map[string]any `json:"products"`
		}
		if err := w.Last.JSON(&out); err != nil {
			return err
		}
		for _, p := range out.Products {
			if p["name"] == prod {
				if p["ingredientKind"] != kind {
					return fmt.Errorf("ingredientKind = %v, want %q", p["ingredientKind"], kind)
				}
				return nil
			}
		}
		return fmt.Errorf("no offline Product %q in %s", prod, w.Last.Body)
	})
}

// id2 reads the id of a Supply set up by the scenario.
func id2(w *World, name string) (int64, error) {
	n, ok := w.Vars["restock:ing:"+name].(int64)
	if !ok {
		return 0, fmt.Errorf("no Supply %q was set up by this scenario", name)
	}
	return n, nil
}
