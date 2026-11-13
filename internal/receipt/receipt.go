package receipt

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strconv"
)

// ScanEvent is one applied, not undone scan of the session (shop_scan or shop_unknown, this Shop), as the read and
// the apply load it by the phone's client UUIDs (design §7.1, §7.2). PriceCents is the stored Price of the scan (per
// pack, or the amount of a weighed quantity); -1 for none, as is PerKgCents.
type ScanEvent struct {
	UUID       string
	ProductID  int64
	Product    string
	Barcode    string
	BaseUnit   string
	PackSize   int
	Weighed    bool
	Quantity   float64
	PriceCents int
	PerKgCents int
	ShopID     int64
	Date       string
}

// GroupRows groups the session's events into Scanned rows, one per Product, ordered by first scan; a row's Index is
// its position (design §7.1, shop-scan-proposals §2.1). The events come in scan order. A row's Price is the latest
// scan's (one Price per Product, Shop and day) for a pack row, and the sum of its scans' Prices for a weighed row (-1
// when any scan has none); its per kg is the latest scan's. Pure.
func GroupRows(events []ScanEvent) []Row {
	var rows []Row
	at := map[string]int{}
	for _, e := range events {
		k := groupKey(e)
		i, ok := at[k]
		if !ok {
			i = len(rows)
			at[k] = i
			rows = append(rows, Row{Index: i, ProductID: e.ProductID, Product: e.Product, BaseUnit: e.BaseUnit,
				PackSize: e.PackSize, PriceCents: -1, PerKgCents: -1})
		}
		r := &rows[i]
		if r.Barcode == "" {
			r.Barcode = e.Barcode
		}
		r.Weighed = r.Weighed || e.Weighed
		r.Scans++
		r.Quantity += e.Quantity
		r.Events = append(r.Events, Event{UUID: e.UUID, Quantity: e.Quantity, PriceCents: e.PriceCents,
			PerKgCents: e.PerKgCents, ShopID: e.ShopID, Date: e.Date})
	}
	for i := range rows {
		r := &rows[i]
		total, allPriced := 0, true
		for _, e := range r.Events {
			if e.PriceCents >= 0 {
				r.PriceCents = e.PriceCents
				total += e.PriceCents
			} else {
				allPriced = false
			}
			if e.PerKgCents >= 0 {
				r.PerKgCents = e.PerKgCents
			}
		}
		if r.Weighed {
			r.PriceCents = -1
			if allPriced {
				r.PriceCents = total
			}
		}
	}
	return rows
}

// groupKey is the Product; an event without one (never expected) groups by its barcode, else stands alone.
func groupKey(e ScanEvent) string {
	switch {
	case e.ProductID != 0:
		return "p:" + strconv.FormatInt(e.ProductID, 10)
	case e.Barcode != "":
		return "b:" + e.Barcode
	}
	return "u:" + e.UUID
}

// Fingerprint is the session's fingerprint (design §7.1 step 3, §7.2 step 2): SHA-256, in hex, over the events sorted
// by client UUID, each with its Price, per kg and quantity. The read computes it from the events it loaded; the apply
// recomputes it from the events of the clientUuids the phone sends then, so any Scan, Undo or Price edit in between
// changes it. The order of events does not matter.
func Fingerprint(events []ScanEvent) string {
	type entry struct {
		UUID       string  `json:"u"`
		PriceCents int     `json:"p"`
		PerKgCents int     `json:"k"`
		Quantity   float64 `json:"q"`
	}
	es := make([]entry, 0, len(events))
	for _, e := range events {
		es = append(es, entry{UUID: e.UUID, PriceCents: e.PriceCents, PerKgCents: e.PerKgCents, Quantity: e.Quantity})
	}
	sort.Slice(es, func(i, j int) bool { return es[i].UUID < es[j].UUID })
	b, _ := json.Marshal(es) // strings, ints and finite floats: never fails
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
