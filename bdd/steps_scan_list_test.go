package bdd

import (
	"fmt"
	"strconv"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Step definitions for bdd/features/scan/scanned_list.feature, price_entry.feature and new_product.feature (SR6).
// Every phrase says "list scan", "the list" or names the Product, so none collides with another step set. The set-up
// is the shopping set's ("ss:" ids: Shops, Ingredients, Products) or the Supplies set's ("restock:" ids), and each
// scan's Result is stored under "ss:result:<uuid>" so the shopping set's "scan ... ticked the line" steps read it.

func init() { RegisterSteps("scan-list", scanListSteps) }

func scanListSteps(sc *godog.ScenarioContext, w *World) {
	me := func() *testkit.Client { w.Ensure(); return w.Client }
	find := func(kind, name string) (int64, error) {
		for _, p := range []string{"ss:", "restock:"} {
			if n, ok := w.Vars[p+kind+":"+name].(int64); ok {
				return n, nil
			}
		}
		return 0, fmt.Errorf("no %s %q was set up by this scenario", kind, name)
	}
	keep := func(uuid string) error {
		var doc map[string]any
		if err := w.Last.JSON(&doc); err != nil {
			return fmt.Errorf("scan %s: not JSON: %s", uuid, w.Last.Body)
		}
		w.Vars["ss:result:"+uuid] = doc
		return nil
	}
	packOf := func(pid int64) (float64, error) {
		var p struct {
			PackSize float64 `json:"packSize"`
		}
		if err := me().Get("/api/products/" + strconv.FormatInt(pid, 10)).JSON(&p); err != nil {
			return 0, err
		}
		return p.PackSize, nil
	}
	// op builds a shop_scan: a whole pack, or the weight when weighed.
	op := func(prod, shop, uuid, grams, cents, perKg string) (map[string]any, error) {
		pid, err := find("product", prod)
		if err != nil {
			return nil, err
		}
		sid, err := find("shop", shop)
		if err != nil {
			return nil, err
		}
		qty, err := packOf(pid)
		if err != nil {
			return nil, err
		}
		o := map[string]any{"clientUuid": uuid, "scannedAt": w.Ensure().Clock.Now().Format(time.RFC3339), "kind": "shop_scan",
			"shopId": sid, "productId": pid, "rangeTo": w.Env.Clock.Now().AddDate(0, 0, 6).Format("2006-01-02")}
		if grams != "" {
			g, _ := strconv.Atoi(grams)
			qty = float64(g)
			o["weighed"] = true
		}
		o["quantity"] = qty
		if cents != "" {
			n, _ := strconv.Atoi(cents)
			o["priceCents"] = n
		}
		if perKg != "" {
			n, _ := strconv.Atoi(perKg)
			o["pricePerKgCents"] = n
		}
		return o, nil
	}
	const scanRe = `^I scan the Product "([^"]*)" at "([^"]*)"(?: weighing (\d+) g)?(?: at (\d+) cents)?(?: and (\d+) cents per kg)? as list scan "([^"]*)"$`
	sc.Step(scanRe, func(prod, shop, grams, cents, perKg, uuid string) error {
		o, err := op(prod, shop, uuid, grams, cents, perKg)
		if err != nil {
			return err
		}
		w.Last = me().Post("/api/scan", o)
		return keep(uuid)
	})
	sc.Step(`^I remove list scan "([^"]*)"$`, func(uuid string) error {
		w.Last = me().Post("/api/scan/"+uuid+"/undo", nil)
		if w.Last.Status != 200 {
			return fmt.Errorf("undo %s: %d %s", uuid, w.Last.Status, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^I price the list scans ((?:"[^"]*"(?:, )?)+) at (-?\d+) cents(?: and (-?\d+) cents per kg)?$`, func(list string, cents int, perKg string) error {
		body := map[string]any{"clientUuids": raQuoted(list), "priceCents": cents}
		if perKg != "" {
			n, _ := strconv.Atoi(perKg)
			body["pricePerKgCents"] = n
		}
		w.Last = me().Patch("/api/scan/prices", body)
		return nil
	})
	sc.Step(`^the list response status is (\d+) with the error "([^"]*)"$`, func(want int, code string) error {
		if w.Last == nil || w.Last.Status != want || w.Last.ErrorCode() != code {
			return fmt.Errorf("response = %v, want %d %s", w.Last, want, code)
		}
		return nil
	})
	sc.Step(`^the list response status is (\d+)$`, func(want int) error {
		if w.Last == nil || w.Last.Status != want {
			return fmt.Errorf("response = %v, want %d", w.Last, want)
		}
		return nil
	})
	sc.Step(`^the list spent is (\d+) cents$`, func(want int) error {
		r := me().Get("/api/shopping/list")
		got, err := ssPath(r.Body, "summary.spentCents")
		if err != nil || ssNum(got) != float64(want) {
			return fmt.Errorf("summary.spentCents = %v (%v), want %d: %s", got, err, want, r.Body)
		}
		return nil
	})
	// latest is the Product's latest Price at the Shop. GET .../prices/latest?shop= falls back to the latest at any Shop
	// when the Shop has none (prices.feature), so a Price only counts as this Shop's when its shopId is the Shop.
	latest := func(prod, shop string) (map[string]any, int64, error) {
		pid, err := find("product", prod)
		if err != nil {
			return nil, 0, err
		}
		sid, err := find("shop", shop)
		if err != nil {
			return nil, 0, err
		}
		var p map[string]any
		r := me().Get(fmt.Sprintf("/api/products/%d/prices/latest?shop=%d", pid, sid))
		_ = r.JSON(&p)
		return p, sid, nil
	}
	sc.Step(`^the list Price of "([^"]*)" at "([^"]*)" is (\d+) cents(?: and (\d+) cents per kg)?$`, func(prod, shop string, cents int, perKg string) error {
		p, sid, err := latest(prod, shop)
		if err != nil {
			return err
		}
		if ssNum(p["shopId"]) != float64(sid) || ssNum(p["priceCents"]) != float64(cents) {
			return fmt.Errorf("latest Price = %v, want %d at Shop %d", p, cents, sid)
		}
		if perKg != "" {
			n, _ := strconv.Atoi(perKg)
			if ssNum(p["pricePerKgCents"]) != float64(n) {
				return fmt.Errorf("latest Price = %v, want %d per kg", p, n)
			}
		}
		return nil
	})
	// No Price at this Shop, whatever other Shops have: the Shop's own Price list is empty.
	sc.Step(`^the list has no Price of "([^"]*)" at "([^"]*)"$`, func(prod, shop string) error {
		pid, err := find("product", prod)
		if err != nil {
			return err
		}
		sid, err := find("shop", shop)
		if err != nil {
			return err
		}
		var list []map[string]any
		r := me().Get(fmt.Sprintf("/api/products/%d/prices?shop=%d", pid, sid))
		if r.Status != 200 || r.JSON(&list) != nil || len(list) != 0 {
			return fmt.Errorf("Prices at Shop %d = %d %s, want none", sid, r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^list scan "([^"]*)" has ingredient kind "([^"]*)"$`, func(uuid, kind string) error {
		doc, _ := w.Vars["ss:result:"+uuid].(map[string]any)
		s, _ := doc["scan"].(map[string]any)
		if s == nil || s["ingredientKind"] != kind {
			return fmt.Errorf("scan %s = %v, want ingredient kind %q", uuid, doc, kind)
		}
		return nil
	})
	sc.Step(`^list scan "([^"]*)" priced at (\d+) cents$`, func(uuid string, cents int) error {
		doc, _ := w.Vars["ss:result:"+uuid].(map[string]any)
		s, _ := doc["scan"].(map[string]any)
		if s == nil || ssNum(s["priceCents"]) != float64(cents) {
			return fmt.Errorf("scan %s = %v, want %d cents", uuid, doc, cents)
		}
		return nil
	})

	// ---- offline: the phone's queue is the shopping set's "ss:queue", synced by its steps ----
	sc.Step(`^the phone queues the Product "([^"]*)" at "([^"]*)"(?: weighing (\d+) g)?(?: at (\d+) cents)?(?: and (\d+) cents per kg)? as "([^"]*)"$`,
		func(prod, shop, grams, cents, perKg, uuid string) error {
			o, err := op(prod, shop, uuid, grams, cents, perKg)
			if err != nil {
				return err
			}
			q, _ := w.Vars["ss:queue"].([]map[string]any)
			w.Vars["ss:queue"] = append(q, o)
			return nil
		})

	// ---- a new Product through the scan Op ----
	unknown := func(uuid, code, shop string, ing map[string]any, name string, pack int) error {
		sid, err := find("shop", shop)
		if err != nil {
			return err
		}
		o := map[string]any{"clientUuid": uuid, "scannedAt": w.Ensure().Clock.Now().Format(time.RFC3339), "kind": "shop_unknown",
			"shopId": sid, "barcode": ssGTIN14(code), "scope": "global", "ingredient": ing, "productName": name, "packSize": pack, "quantity": pack,
			"rangeTo": w.Env.Clock.Now().AddDate(0, 0, 6).Format("2006-01-02")}
		w.Last = me().Post("/api/scan", o)
		return keep(uuid)
	}
	sc.Step(`^I save the unknown barcode "([^"]*)" at "([^"]*)" as list scan "([^"]*)" for the existing Ingredient "([^"]*)" with Product "([^"]*)" of pack size (\d+)$`,
		func(code, shop, uuid, ing, name string, pack int) error {
			iid, err := find("ingredient", ing)
			if err != nil {
				iid, err = find("ing", ing)
			}
			if err != nil {
				return err
			}
			return unknown(uuid, code, shop, map[string]any{"id": iid}, name, pack)
		})
	sc.Step(`^I save the unknown barcode "([^"]*)" at "([^"]*)" as list scan "([^"]*)" for the new (food|supply) Ingredient "([^"]*)" counted in (piece|g|ml) with Product "([^"]*)" of pack size (\d+)$`,
		func(code, shop, uuid, kind, ing, base, name string, pack int) error {
			return unknown(uuid, code, shop, map[string]any{"name": ing, "baseUnit": base, "kind": kind}, name, pack)
		})
	sc.Step(`^the phone queues the unknown barcode "([^"]*)" at "([^"]*)" as "([^"]*)" for the new supply "([^"]*)" counted in (piece|g|ml) with Product "([^"]*)" of pack size (\d+)$`,
		func(code, shop, uuid, ing, base, name string, pack int) error {
			sid, err := find("shop", shop)
			if err != nil {
				return err
			}
			o := map[string]any{"clientUuid": uuid, "scannedAt": w.Ensure().Clock.Now().Format(time.RFC3339), "kind": "shop_unknown",
				"shopId": sid, "barcode": ssGTIN14(code), "scope": "global", "packSize": pack, "quantity": pack, "productName": name,
				"ingredient": map[string]any{"name": ing, "baseUnit": base, "kind": "supply"}}
			q, _ := w.Vars["ss:queue"].([]map[string]any)
			w.Vars["ss:queue"] = append(q, o)
			return nil
		})
	sc.Step(`^list scan "([^"]*)" was rejected$`, func(uuid string) error {
		doc, _ := w.Vars["ss:result:"+uuid].(map[string]any)
		if doc["status"] != "rejected" {
			return fmt.Errorf("scan %s = %v, want rejected", uuid, doc)
		}
		return nil
	})
}
