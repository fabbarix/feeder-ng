package receipt_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/receipt"
)

// RR1 review: the grouping of the session's events into rows (design §7.1 step 2) and the session fingerprint (§7.1
// step 3, §7.2 step 2), shared by the read (RR2) and the apply (RR3) so both compute them the same way.

func sessionEvents() []receipt.ScanEvent {
	mutti := func(uuid string) receipt.ScanEvent {
		return receipt.ScanEvent{UUID: uuid, ProductID: 10, Product: "Mutti passata 700 g", Barcode: "8005110170003", BaseUnit: "g",
			PackSize: 700, Quantity: 700, PriceCents: 129, PerKgCents: -1, ShopID: 1, Date: "2026-11-13"}
	}
	parm := func(uuid string, q float64, price int) receipt.ScanEvent {
		return receipt.ScanEvent{UUID: uuid, ProductID: 11, Product: "Parmigiano Reggiano", BaseUnit: "g", PackSize: 300, Weighed: true,
			Quantity: q, PriceCents: price, PerKgCents: 2000, ShopID: 1, Date: "2026-11-13"}
	}
	return []receipt.ScanEvent{mutti("e1"), parm("e3", 312, 624), mutti("e2"), parm("e6", 100, 200)}
}

func TestGroupRowsOneRowPerProductInOrderOfFirstScan(t *testing.T) {
	rows := receipt.GroupRows(sessionEvents())
	if len(rows) != 2 {
		t.Fatalf("rows = %d", len(rows))
	}
	m, p := rows[0], rows[1]
	if m.Index != 0 || m.ProductID != 10 || m.Scans != 2 || m.Quantity != 1400 || m.PriceCents != 129 || m.PerKgCents != -1 ||
		m.Weighed || m.Barcode != "8005110170003" || len(m.Events) != 2 || m.Events[0].UUID != "e1" || m.Events[1].UUID != "e2" {
		t.Errorf("pack row: index %d product %d scans %d qty %v price %d", m.Index, m.ProductID, m.Scans, m.Quantity, m.PriceCents)
	}
	if p.Index != 1 || p.ProductID != 11 || p.Scans != 2 || p.Quantity != 412 || p.PriceCents != 824 || p.PerKgCents != 2000 || !p.Weighed {
		t.Errorf("weighed row: index %d scans %d qty %v price %d perKg %d", p.Index, p.Scans, p.Quantity, p.PriceCents, p.PerKgCents)
	}
}

func TestGroupRowsWeighedRowWithAnUnpricedScanHasNoPrice(t *testing.T) {
	ev := sessionEvents()
	ev[3].PriceCents = -1
	if p := receipt.GroupRows(ev)[1]; p.PriceCents != -1 {
		t.Errorf("a weighed row's total is unknown when a scan has no Price: %d", p.PriceCents)
	}
}

func TestGroupRowsOfNothingIsNoRows(t *testing.T) {
	if rows := receipt.GroupRows(nil); len(rows) != 0 {
		t.Errorf("rows = %d", len(rows))
	}
}

func TestFingerprintIgnoresOrderAndSeesEveryChange(t *testing.T) {
	base := sessionEvents()
	fp := receipt.Fingerprint(base)
	if len(fp) != 64 {
		t.Errorf("hex SHA-256: %q", fp)
	}
	rev := []receipt.ScanEvent{base[3], base[2], base[1], base[0]}
	if receipt.Fingerprint(rev) != fp {
		t.Error("the order of the events must not matter")
	}
	for name, change := range map[string]func([]receipt.ScanEvent) []receipt.ScanEvent{
		"a new scan": func(e []receipt.ScanEvent) []receipt.ScanEvent { return append(e, e[0]) },
		"an undo":    func(e []receipt.ScanEvent) []receipt.ScanEvent { return e[1:] },
		"a price":    func(e []receipt.ScanEvent) []receipt.ScanEvent { e[0].PriceCents = 135; return e },
		"a per kg":   func(e []receipt.ScanEvent) []receipt.ScanEvent { e[1].PerKgCents = 2100; return e },
		"a weight":   func(e []receipt.ScanEvent) []receipt.ScanEvent { e[1].Quantity = 313; return e },
		"a uuid":     func(e []receipt.ScanEvent) []receipt.ScanEvent { e[0].UUID = "e9"; return e },
	} {
		if receipt.Fingerprint(change(sessionEvents())) == fp {
			t.Errorf("%s must change the fingerprint", name)
		}
	}
	if receipt.Fingerprint(nil) == fp {
		t.Error("an empty session has its own fingerprint")
	}
}
