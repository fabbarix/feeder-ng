package bdd

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Step definitions for bdd/features/scan/scan_redesign_api.feature (SR1). Every step says "redesign", so none can collide
// with the other step sets. State lives in w.Vars under "sr1:" keys: "sr1:shop:<name>", "sr1:product:<name>",
// "sr1:pack:<name>" (pack size).

func init() { RegisterSteps("scan-redesign-api", scanRedesignAPISteps) }

var sr1Quoted = func(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		out = append(out, strings.Trim(strings.TrimSpace(part), `"`))
	}
	return out
}

func scanRedesignAPISteps(sc *godog.ScenarioContext, w *World) {
	admin := func() *testkit.Client { return w.Ensure().LoginAdmin(w.TB) }
	me := func() *testkit.Client { w.Ensure(); return w.Client }
	num := func(kind, name string) (int64, error) {
		n, ok := w.Vars["sr1:"+kind+":"+name].(int64)
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
	today := func() string { return w.Ensure().Clock.Now().Format("2006-01-02") }
	scanOp := func(uuid, shop, prod string, quantity float64, weighed bool) (map[string]any, error) {
		sid, err := num("shop", shop)
		if err != nil {
			return nil, err
		}
		pid, err := num("product", prod)
		if err != nil {
			return nil, err
		}
		op := map[string]any{"clientUuid": uuid, "scannedAt": w.Ensure().Clock.Now().Format(time.RFC3339), "kind": "shop_scan",
			"shopId": sid, "productId": pid, "quantity": quantity}
		if weighed {
			op["weighed"] = true
		}
		return op, nil
	}
	send := func(op map[string]any) error {
		if r := me().Post("/api/scan", op); r.Status != 200 {
			return fmt.Errorf("scan %v: %d %s", op["clientUuid"], r.Status, r.Body)
		}
		return nil
	}

	sc.Step(`^the redesign household has the Shops "([^"]*)" and "([^"]*)"$`, func(a, b string) error {
		for _, name := range []string{a, b} {
			n, err := created(admin().Post("/api/shops", map[string]any{"name": name}), "create the Shop "+name)
			if err != nil {
				return err
			}
			w.Vars["sr1:shop:"+name] = n
		}
		return nil
	})
	sc.Step(`^the redesign catalogue has the Product "([^"]*)" in (g|ml|piece) with pack size (\d+)$`, func(name, base string, size int) error {
		ing, err := created(me().Post("/api/ingredients", map[string]any{"name": name + " (ingredient)", "baseUnit": base}), "create the Ingredient of "+name)
		if err != nil {
			return err
		}
		n, err := created(me().Post("/api/products", map[string]any{"name": name, "ingredientId": ing, "packSize": size}), "create the Product "+name)
		if err == nil {
			w.Vars["sr1:product:"+name] = n
			w.Vars["sr1:pack:"+name] = int64(size)
		}
		return err
	})
	sc.Step(`^I scan "([^"]*)" at "([^"]*)" without a Price as redesign scan "([^"]*)"$`, func(prod, shop, uuid string) error {
		size, err := num("pack", prod)
		if err != nil {
			return err
		}
		op, err := scanOp(uuid, shop, prod, float64(size), false)
		if err != nil {
			return err
		}
		return send(op)
	})
	sc.Step(`^I scan "([^"]*)" at "([^"]*)" weighing (\d+) g without a Price as redesign scan "([^"]*)"$`, func(prod, shop string, grams int, uuid string) error {
		op, err := scanOp(uuid, shop, prod, float64(grams), true)
		if err != nil {
			return err
		}
		return send(op)
	})
	sc.Step(`^I undo the redesign scan "([^"]*)"$`, func(uuid string) error {
		if r := me().Post("/api/scan/"+uuid+"/undo", nil); r.Status != 200 {
			return fmt.Errorf("undo %s: %d %s", uuid, r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^"([^"]*)" has a redesign Price of (\d+) cents at "([^"]*)" on (\d{4}-\d{2}-\d{2})$`, func(prod string, cents int, shop, date string) error {
		pid, err := num("product", prod)
		if err != nil {
			return err
		}
		sid, err := num("shop", shop)
		if err != nil {
			return err
		}
		if r := me().Put(fmt.Sprintf("/api/products/%d/prices", pid), map[string]any{"shopId": sid, "date": date, "priceCents": cents}); r.Status != 200 {
			return fmt.Errorf("record Price: %d %s", r.Status, r.Body)
		}
		return nil
	})

	// --- The edits ---

	sc.Step(`^I set the redesign price of scans ((?:"[^"]*"(?:, )?)+) to (\d+) cents$`, func(list string, cents int) error {
		w.Last = me().Patch("/api/scan/prices", map[string]any{"clientUuids": sr1Quoted(list), "priceCents": cents})
		return nil
	})
	sc.Step(`^I set the redesign price of scans ((?:"[^"]*"(?:, )?)+) to (\d+) cents and (\d+) cents per kg$`, func(list string, cents, perKg int) error {
		w.Last = me().Patch("/api/scan/prices", map[string]any{"clientUuids": sr1Quoted(list), "priceCents": cents, "pricePerKgCents": perKg})
		return nil
	})
	sc.Step(`^I set the redesign price of scan "([^"]*)" to (\d+) cents$`, func(uuid string, cents int) error {
		w.Last = me().Patch("/api/scan/"+uuid, map[string]any{"priceCents": cents})
		return nil
	})
	sc.Step(`^I set the redesign price of scan "([^"]*)" to (\d+) cents and (\d+) cents per kg$`, func(uuid string, cents, perKg int) error {
		w.Last = me().Patch("/api/scan/"+uuid, map[string]any{"priceCents": cents, "pricePerKgCents": perKg})
		return nil
	})

	// --- What came back and what was stored ---

	sc.Step(`^the redesign response status is (\d+)$`, func(want int) error {
		if w.Last == nil || w.Last.Status != want {
			return fmt.Errorf("status = %v, want %d; body: %v", w.Last, want, w.Last)
		}
		return nil
	})
	sc.Step(`^the redesign response error is "([^"]*)"$`, func(code string) error {
		if got := w.Last.ErrorCode(); got != code {
			return fmt.Errorf("error code = %q, want %q; body: %s", got, code, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the redesign response prices "([^"]*)" at (\d+) cents$`, func(uuid string, cents int) error {
		// The batch answers {"results":[...]}; one scan answers the Result itself.
		doc, err := ssPath(w.Last.Body, "")
		if err != nil {
			return err
		}
		m, _ := doc.(map[string]any)
		results, _ := m["results"].([]any)
		if results == nil {
			results = []any{m}
		}
		for _, x := range results {
			r, _ := x.(map[string]any)
			if r["clientUuid"] != uuid {
				continue
			}
			s, _ := r["scan"].(map[string]any)
			if ssNum(s["priceCents"]) != float64(cents) {
				return fmt.Errorf("scan %s costs %v, want %d; body: %s", uuid, s["priceCents"], cents, w.Last.Body)
			}
			return nil
		}
		return fmt.Errorf("no result for scan %q in %s", uuid, w.Last.Body)
	})
	sc.Step(`^the redesign Shopping List shows (\d+) cents spent$`, func(want int) error {
		r := me().Get("/api/shopping/list")
		if r.Status != 200 {
			return fmt.Errorf("Shopping List: %d %s", r.Status, r.Body)
		}
		got, err := ssPath(r.Body, "summary.spentCents")
		if err != nil {
			return err
		}
		if ssNum(got) != float64(want) {
			return fmt.Errorf("summary.spentCents = %v, want %d", got, want)
		}
		return nil
	})
	prices := func(prod, shop string) ([]map[string]any, error) {
		pid, err := num("product", prod)
		if err != nil {
			return nil, err
		}
		sid, err := num("shop", shop)
		if err != nil {
			return nil, err
		}
		r := me().Get(fmt.Sprintf("/api/products/%d/prices?shop=%d", pid, sid))
		var out []map[string]any
		if err := r.JSON(&out); err != nil {
			return nil, fmt.Errorf("prices: %v %s", err, r.Body)
		}
		return out, nil
	}
	field := func(m map[string]any, name string) any {
		for k, v := range m {
			if strings.EqualFold(k, name) {
				return v
			}
		}
		return nil
	}
	sc.Step(`^"([^"]*)" has (\d+) redesign Prices? at "([^"]*)"$`, func(prod string, n int, shop string) error {
		list, err := prices(prod, shop)
		if err != nil {
			return err
		}
		if len(list) != n {
			return fmt.Errorf("%d Prices, want %d: %v", len(list), n, list)
		}
		return nil
	})
	latest := func(prod, shop string) (map[string]any, error) {
		list, err := prices(prod, shop)
		if err != nil || len(list) == 0 {
			return nil, fmt.Errorf("no Price of %s at %s (%v)", prod, shop, err)
		}
		best := list[0]
		for _, p := range list {
			if fmt.Sprint(field(p, "date")) > fmt.Sprint(field(best, "date")) {
				best = p
			}
		}
		return best, nil
	}
	sc.Step(`^the latest redesign Price of "([^"]*)" at "([^"]*)" is (\d+) cents$`, func(prod, shop string, cents int) error {
		p, err := latest(prod, shop)
		if err != nil {
			return err
		}
		if ssNum(field(p, "priceCents")) != float64(cents) {
			return fmt.Errorf("Price = %v, want %d", p, cents)
		}
		return nil
	})
	sc.Step(`^the latest redesign Price of "([^"]*)" at "([^"]*)" is (\d+) cents and (\d+) cents per kg$`, func(prod, shop string, cents, perKg int) error {
		p, err := latest(prod, shop)
		if err != nil {
			return err
		}
		if ssNum(field(p, "priceCents")) != float64(cents) || ssNum(field(p, "pricePerKgCents")) != float64(perKg) {
			return fmt.Errorf("Price = %v, want %d and %d per kg", p, cents, perKg)
		}
		return nil
	})

	// --- The offline data ---

	offlineProduct := func(shop, prod string) (map[string]any, error) {
		sid, err := num("shop", shop)
		if err != nil {
			return nil, err
		}
		pid, err := num("product", prod)
		if err != nil {
			return nil, err
		}
		r := me().Get("/api/scan/offline?shop=" + strconv.FormatInt(sid, 10))
		if r.Status != 200 {
			return nil, fmt.Errorf("offline data: %d %s", r.Status, r.Body)
		}
		var doc struct {
			Products []map[string]any `json:"products"`
		}
		if err := r.JSON(&doc); err != nil {
			return nil, err
		}
		for _, p := range doc.Products {
			if int64(ssNum(p["id"])) == pid {
				return p, nil
			}
		}
		return nil, fmt.Errorf("the offline data of %s has no Product %q", shop, prod)
	}
	sc.Step(`^the redesign offline data for "([^"]*)" lists "([^"]*)" with the last Price (\d+) cents of (today|\d{4}-\d{2}-\d{2})$`, func(shop, prod string, cents int, date string) error {
		p, err := offlineProduct(shop, prod)
		if err != nil {
			return err
		}
		if date == "today" {
			date = today()
		}
		if ssNum(p["lastPriceCents"]) != float64(cents) || p["lastPriceDate"] != date {
			return fmt.Errorf("%s: lastPriceCents %v, lastPriceDate %v; want %d on %s", prod, p["lastPriceCents"], p["lastPriceDate"], cents, date)
		}
		return nil
	})
	sc.Step(`^the redesign offline data for "([^"]*)" lists "([^"]*)" without a last Price$`, func(shop, prod string) error {
		p, err := offlineProduct(shop, prod)
		if err != nil {
			return err
		}
		if _, has := p["lastPriceDate"]; has || p["lastPriceCents"] != nil {
			return fmt.Errorf("%s has lastPriceCents %v and lastPriceDate %v, want neither", prod, p["lastPriceCents"], p["lastPriceDate"])
		}
		return nil
	})
}
