package bdd

import (
	"fmt"
	"net/url"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("b9_scan_data", b9ScanDataSteps) }

// b9ScanDataSteps are the few steps B9-41's scenarios need beyond the shopping-scan steps. Shop ids are in
// w.Vars["ss:shop:<name>"] (the shopping-scan steps).
func b9ScanDataSteps(sc *godog.ScenarioContext, w *World) {
	shop := func(name string) (int64, error) {
		id, ok := w.Vars["ss:shop:"+name].(int64)
		if !ok {
			return 0, fmt.Errorf("no Shop %q in this scenario", name)
		}
		return id, nil
	}
	me := func() *testkit.Client { w.Ensure(); return w.Client }
	ruleCount := func(name string) (int, error) {
		sid, err := shop(name)
		if err != nil {
			return 0, err
		}
		var rules []map[string]any
		r := me().Get(fmt.Sprintf("/api/shops/%d/weight-rules", sid))
		if err := r.JSON(&rules); err != nil || r.Status != 200 {
			return 0, fmt.Errorf("list weight rules of %q: %d %s", name, r.Status, r.Body)
		}
		return len(rules), nil
	}
	sc.Step(`^the Shop "([^"]*)" has no weight rules$`, func(name string) error { return wantRules(ruleCount, name, 0) })
	sc.Step(`^the Shop "([^"]*)" has (\d+) weight rules?$`, func(name string, n int) error { return wantRules(ruleCount, name, n) })
	sc.Step(`^I price the weighed scan "([^"]*)" at (\d+) cents and (\d+) cents per kg$`, func(uuid string, cents, perKg int) error {
		w.Last = me().Patch("/api/scan/prices", map[string]any{"clientUuids": []string{uuid}, "priceCents": cents, "pricePerKgCents": perKg})
		return nil
	})
	sc.Step(`^the latest Price of the Product "([^"]*)" at "([^"]*)" is (\d+) cents and (\d+) cents per kg$`, func(prod, shopName string, cents, perKg int) error {
		sid, err := shop(shopName)
		if err != nil {
			return err
		}
		c := me()
		var all []struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		}
		if err := c.Get("/api/products?q=" + url.QueryEscape(prod)).JSON(&all); err != nil {
			return err
		}
		for _, p := range all {
			if p.Name != prod {
				continue
			}
			var got map[string]any
			_ = c.Get(fmt.Sprintf("/api/products/%d/prices/latest?shop=%d", p.ID, sid)).JSON(&got)
			if fmt.Sprint(got["priceCents"]) != fmt.Sprint(cents) || fmt.Sprint(got["pricePerKgCents"]) != fmt.Sprint(perKg) || fmt.Sprint(got["shopId"]) != fmt.Sprint(sid) {
				return fmt.Errorf("latest Price of %q = %v, want %d cents, %d per kg at Shop %d", prod, got, cents, perKg, sid)
			}
			return nil
		}
		return fmt.Errorf("no Product %q", prod)
	})
	sc.Step(`^the weight-style barcode "([^"]*)" is not unknown at "([^"]*)"$`, func(code, shopName string) error {
		sid, err := shop(shopName)
		if err != nil {
			return err
		}
		var doc map[string]any
		r := me().Get(fmt.Sprintf("/api/resolve?barcode=%s&shop=%d", url.QueryEscape(code), sid))
		_ = r.JSON(&doc)
		res, _ := doc["resolution"].(map[string]any)
		if out, _ := res["outcome"].(string); out == "" || out == "unknown" {
			return fmt.Errorf("barcode %s resolves to %q at %q (%s), want a weighed outcome", code, out, shopName, r.Body)
		}
		return nil
	})
}

func wantRules(count func(string) (int, error), name string, want int) error {
	got, err := count(name)
	if err != nil {
		return err
	}
	if got != want {
		return fmt.Errorf("Shop %q has %d weight rules, want %d", name, got, want)
	}
	return nil
}
