package receipt_test

import (
	"encoding/json"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/receipt"
)

// The RR1 tests pin the public API of package receipt (docs/design/receipt-reading.md §4 to §8). The fixture:
//
//	row 0  Mutti passata 700 g   g   pack 700  x2   price 129      events e1 e2
//	row 1  Parmigiano Reggiano   g   weighed 312 g  price 624 (2000/kg)  event e3
//	row 2  Barilla spaghetti 500 g   g   pack 500  x1   no price     event e4
//	row 3  Latte intero 1 l      ml  pack 1000 x1   price 150      event e5
//
// A weighed row's PriceCents is the amount for the weighed quantity (all its scans together); a pack row's is per pack.

func ip(i int) *int { return &i }

func fixtureRows() []receipt.Row {
	ev := func(uuid string, q float64, price, perKg int) receipt.Event {
		return receipt.Event{UUID: uuid, Quantity: q, PriceCents: price, PerKgCents: perKg, ShopID: 1, Date: "2026-11-13"}
	}
	return []receipt.Row{
		{Index: 0, ProductID: 10, Product: "Mutti passata 700 g", Barcode: "8005110170003", BaseUnit: "g", PackSize: 700,
			Scans: 2, Quantity: 1400, PriceCents: 129, PerKgCents: -1,
			Events: []receipt.Event{ev("e1", 700, 129, -1), ev("e2", 700, 129, -1)}},
		{Index: 1, ProductID: 11, Product: "Parmigiano Reggiano", Barcode: "", BaseUnit: "g", PackSize: 300,
			Scans: 1, Quantity: 312, Weighed: true, PriceCents: 624, PerKgCents: 2000,
			Events: []receipt.Event{ev("e3", 312, 624, 2000)}},
		{Index: 2, ProductID: 12, Product: "Barilla spaghetti 500 g", Barcode: "8076800195057", BaseUnit: "g", PackSize: 500,
			Scans: 1, Quantity: 500, PriceCents: -1, PerKgCents: -1,
			Events: []receipt.Event{ev("e4", 500, -1, -1)}},
		{Index: 3, ProductID: 13, Product: "Latte intero 1 l", Barcode: "8001234567890", BaseUnit: "ml", PackSize: 1000,
			Scans: 1, Quantity: 1000, PriceCents: 150, PerKgCents: -1,
			Events: []receipt.Event{ev("e5", 1000, 150, -1)}},
	}
}

func fixtureCtx() receipt.Context {
	return receipt.Context{
		Today:       "2026-11-13",
		SessionShop: receipt.Shop{ID: 1, Name: "Esselunga"},
		SessionDate: "2026-11-13",
		Shops:       []receipt.Shop{{ID: 1, Name: "Esselunga"}, {ID: 2, Name: "Coop"}, {ID: 3, Name: "Lidl"}},
		Currency:    "EUR",
		MinorDigits: 2,
	}
}

// mkLine builds a raw answer line with every field at its sentinel, then applies the overrides.
func mkLine(over map[string]any) map[string]any {
	l := map[string]any{"row": -1, "text": "", "count": 0, "grams": 0, "priceCents": -1, "unitPriceCents": -1,
		"perKgCents": -1, "name": "", "packSize": 0, "packUnit": ""}
	for k, v := range over {
		l[k] = v
	}
	return l
}

func mkRaw(t *testing.T, top map[string]any, lines ...map[string]any) []byte {
	t.Helper()
	a := map[string]any{"readable": true, "shopName": "", "date": "", "totalCents": -1}
	for k, v := range top {
		a[k] = v
	}
	ls := make([]any, 0, len(lines))
	for _, l := range lines {
		ls = append(ls, l)
	}
	a["lines"] = ls
	b, err := json.Marshal(a)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// answer runs Finish on lines (today 2026-11-13) and fails the test on an error.
func answer(t *testing.T, top map[string]any, lines ...map[string]any) receipt.Answer {
	t.Helper()
	a, _, err := receipt.Finish(mkRaw(t, top, lines...), fixtureRows(), "2026-11-13")
	if err != nil {
		t.Fatalf("Finish: %v", err)
	}
	return a
}

func find(ps []receipt.Proposal, id string) (receipt.Proposal, bool) {
	for _, p := range ps {
		if p.ID == id {
			return p, true
		}
	}
	return receipt.Proposal{}, false
}

func ids(ps []receipt.Proposal) []string {
	out := make([]string, 0, len(ps))
	for _, p := range ps {
		out = append(out, p.ID)
	}
	return out
}
