package bdd

import (
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Step definitions for bdd/features/receipt/receipt_flow.feature (RR5). They sit on top of the "receipt-read" set
// (w.Vars["receipt-read"] is its *rrState: the Shops, Products, scan uuids and the last read) and call the real apply
// route, so a read goes through the fake provider and the apply through the store the read routes made. Every phrase
// says "receipt flow", "the read for", "the phone replays" or names the Shopping List/Price, so none collides.

func init() { RegisterSteps("receipt-flow", receiptFlowSteps) }

func receiptFlowSteps(sc *godog.ScenarioContext, w *World) {
	st := func() *rrState { s, _ := w.Vars["receipt-read"].(*rrState); return s }
	user := func() *testkit.Client { return w.Env.LoginUser(w.TB) }
	var last *testkit.Response
	n := 0
	scan := func(uuid, shop, product string, cents int) *testkit.Response {
		s := st()
		pack := map[string]float64{"Mutti passata 700 g": 700, "Barilla spaghetti 500 g": 500}[product]
		return user().Post("/api/scan", map[string]any{"clientUuid": uuid, "scannedAt": rrDay + "T12:00:00Z", "kind": "shop_scan", "shopId": s.shops[shop],
			"productId": s.products[product], "quantity": pack, "priceCents": cents, "rangeTo": "2026-11-15"})
	}

	apply := func(shop string, ids []string) {
		s := st()
		accept := []map[string]string{}
		for _, id := range ids {
			accept = append(accept, map[string]string{"id": id})
		}
		last = user().Post("/api/scan/receipt/apply", map[string]any{"readId": s.readID, "clientUuids": s.uuids[shop], "accept": accept, "adds": []any{}})
		w.Last = last
	}
	sc.Step(`^I apply the read for "([^"]*)" accepting "([^"]*)"$`, func(shop, id string) { apply(shop, []string{id}) })
	sc.Step(`^I apply the read for "([^"]*)" accepting nothing$`, func(shop string) { apply(shop, nil) })

	sc.Step(`^I scan "([^"]*)" again at (\d+) cents in "([^"]*)"$`, func(product string, cents int, shop string) error {
		n++
		uuid := fmt.Sprintf("rf-%03d", n)
		if r := scan(uuid, shop, product, cents); r.Status != 200 {
			return fmt.Errorf("scan: %d %s", r.Status, r.Body)
		}
		s := st()
		s.uuids[shop] = append(s.uuids[shop], uuid)
		return nil
	})
	// The phone had this scan queued while it was offline: the read left it out, and now the queue is replayed.
	sc.Step(`^the phone replays its waiting scan of "([^"]*)" at (\d+) cents in "([^"]*)"$`, func(product string, cents int, shop string) error {
		s := st()
		const uuid = "still-in-the-phones-queue"
		if r := scan(uuid, shop, product, cents); r.Status != 200 {
			return fmt.Errorf("replay: %d %s", r.Status, r.Body)
		}
		s.uuids[shop] = append(s.uuids[shop], uuid)
		return nil
	})
	sc.Step(`^the phone replays the scans it already sent in "([^"]*)"$`, func(shop string) error {
		s := st()
		for _, uuid := range s.uuids[shop] {
			o := map[string]any{"clientUuid": uuid, "scannedAt": rrDay + "T12:00:00Z", "kind": "shop_scan", "shopId": s.shops[shop],
				"productId": s.products["Mutti passata 700 g"], "quantity": 700, "priceCents": 7771}
			r := user().Post("/api/scan", o)
			var res struct{ Status string }
			_ = json.Unmarshal(r.Body, &res)
			// A replay must be recognised by its client uuid: "applied" would be the scan counted twice.
			if r.Status != 200 || res.Status != "duplicate" {
				return fmt.Errorf("replay %s: %d %s", uuid, r.Status, r.Body)
			}
		}
		return nil
	})

	sc.Step(`^the receipt flow response applied (\d+) proposals?$`, func(want int) error {
		var out struct{ Applied int }
		if err := last.JSON(&out); err != nil || out.Applied != want {
			return fmt.Errorf("response = %s, want applied %d", last.Body, want)
		}
		return nil
	})
	sc.Step(`^the latest Price of "([^"]*)" at "([^"]*)" is (\d+) cents$`, func(product, shop string, cents int) error {
		s := st()
		r := user().Get("/api/products/" + strconv.FormatInt(s.products[product], 10) + "/prices/latest?shop=" + strconv.FormatInt(s.shops[shop], 10))
		// prices/latest?shop= falls back to another Shop's Price when this Shop has none, so the Shop is checked too.
		got, err := ssPath(r.Body, "priceCents")
		at, _ := ssPath(r.Body, "shopId")
		if err != nil || ssNum(got) != float64(cents) || ssNum(at) != float64(s.shops[shop]) {
			return fmt.Errorf("latest Price = %s, want %d at %s", r.Body, cents, shop)
		}
		return nil
	})
}
