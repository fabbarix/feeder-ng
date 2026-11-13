package service_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/service"
	shopservice "github.com/fabbarix/feeder-ng/internal/shopping/service"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// SR1 (scan redesign, shop-scan-proposals.md §13.9). SetPrices is the service behind PATCH /api/scan/prices and behind
// the receipt Apply (RR3), which calls it without HTTP:
//
//	type SetPricesInput struct {
//	    ClientUUIDs     []string // the scans of one row: same Product, same Shop
//	    PriceCents      int      // the pack Price, > 0 (required, also with PricePerKgCents)
//	    PricePerKgCents *int     // per kg (Product in g) or per l (Product in ml), > 0; refused on a piece Product
//	}
//	func (s *Service) SetPrices(ctx context.Context, in SetPricesInput) ([]scan.Result, error)
//
// It returns one Result (status applied, scan.priceCents = that scan's new price) per uuid, in the order given
// (duplicated uuids count once). All checks run before the first write: on any error nothing changed.
// Errors: service.ErrNotFound (any unknown uuid, which is also what a scan still queued on the phone looks like),
// service.ErrAlreadyUndone, service.ErrNotUndoable (a stock_take), *scan.ValidationError (field "clientUuids" for an
// empty list or scans of more than one Shop or Product; "priceCents"; "pricePerKgCents", also for a piece Product).
// PATCH /api/scan/{uuid} with pricePerKgCents is SetPrices with that one uuid.

const (
	fusilli = int64(20) // 500 g pack
	juice   = int64(21) // 1000 ml pack
	eggs    = int64(22) // 6 pieces
)

func setPricesEnv(t *testing.T) *env {
	t.Helper()
	e := newEnv(t)
	e.cat.addProduct(fusilli, "Fusilli 500 g", 4, "pasta", 500)
	e.cat.addProduct(juice, "Orange juice 1 l", 5, "orange juice", 1000)
	e.cat.products[juice] = withBase(e.cat.products[juice], "ml")
	e.cat.addProduct(eggs, "Eggs 6", 6, "eggs", 6)
	e.cat.products[eggs] = withBase(e.cat.products[eggs], "piece")
	e.cat.shops[2] = true
	return e
}

func withBase(p service.ProductInfo, base string) service.ProductInfo { p.BaseUnit = base; return p }

func setPrices(e *env, in service.SetPricesInput) ([]scan.Result, error) {
	return e.svc.SetPrices(context.Background(), in)
}

func priceOf(t *testing.T, res scan.Result) int {
	t.Helper()
	if res.Status != scan.StatusApplied || res.Scan == nil || res.Scan.PriceCents == nil {
		t.Fatalf("result = %+v, want applied with a price", res)
	}
	return *res.Scan.PriceCents
}

func spent(t *testing.T, e *env) int {
	t.Helper()
	s, _, err := e.ledger.Totals(context.Background(), "2026-11-15")
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func priceOn(t *testing.T, e *env, product, shop int64, date stock.Date) *service.PriceInfo {
	t.Helper()
	p, err := e.cat.PriceOn(context.Background(), product, shop, date)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestSetPricesGivesEveryScanOfTheRowThePriceAndTheTotalAddsUp(t *testing.T) {
	e := setPricesEnv(t)
	apply(t, e, packScan("a", mutti, 700))
	apply(t, e, packScan("b", mutti, 700))
	apply(t, e, packScan("c", mutti, 700))
	before := e.bus.count(shopservice.Topic)

	got, err := setPrices(e, service.SetPricesInput{ClientUUIDs: []string{"a", "b", "c"}, PriceCents: 129})
	if err != nil || len(got) != 3 {
		t.Fatalf("SetPrices = %+v, %v", got, err)
	}
	for i, uuid := range []string{"a", "b", "c"} {
		if got[i].ClientUUID != uuid || priceOf(t, got[i]) != 129 {
			t.Errorf("result %d = %+v, want %s at 129", i, got[i], uuid)
		}
	}
	if s := spent(t, e); s != 3*129 {
		t.Fatalf("spentCents = %d, want %d (three scans at 129)", s, 3*129)
	}
	if p := priceOn(t, e, mutti, 1, "2026-11-09"); p == nil || p.PriceCents == nil || *p.PriceCents != 129 {
		t.Fatalf("Price of the day = %+v, want 129", p)
	}
	if n := len(e.cat.prices); n != 1 {
		t.Fatalf("%d Price rows, want one per Product, Shop and day", n)
	}
	if after := e.bus.count(shopservice.Topic); after != before+1 {
		t.Fatalf("published %d times, want once for the whole row", after-before)
	}
}

func TestSetPricesKeepsOnePricePerShopPerDayAcrossTheDaysOfTheRow(t *testing.T) {
	e := setPricesEnv(t)
	apply(t, e, packScan("a", mutti, 700))
	yesterday := packScan("b", mutti, 700)
	yesterday.ScannedAt = "2026-11-08T12:00:00Z"
	apply(t, e, yesterday)

	if _, err := setPrices(e, service.SetPricesInput{ClientUUIDs: []string{"a", "b"}, PriceCents: 129}); err != nil {
		t.Fatal(err)
	}
	for _, d := range []stock.Date{"2026-11-08", "2026-11-09"} {
		if p := priceOn(t, e, mutti, 1, d); p == nil || *p.PriceCents != 129 {
			t.Errorf("Price on %s = %+v, want 129", d, p)
		}
	}
	if n := len(e.cat.prices); n != 2 {
		t.Fatalf("%d Price rows, want 2 (one per day)", n)
	}
}

func TestSetPricesIsIdempotent(t *testing.T) {
	e := setPricesEnv(t)
	e.cat.seedPrice(mutti, 1, "2026-11-02", 159)
	apply(t, e, packScan("a", mutti, 700))
	apply(t, e, packScan("b", mutti, 700))
	in := service.SetPricesInput{ClientUUIDs: []string{"a", "b"}, PriceCents: 129}
	first, err := setPrices(e, in)
	if err != nil {
		t.Fatal(err)
	}
	rows, total := len(e.cat.prices), spent(t, e)
	second, err := setPrices(e, in)
	if err != nil {
		t.Fatal(err)
	}
	a, _ := json.Marshal(first)
	b, _ := json.Marshal(second)
	if string(a) != string(b) {
		t.Fatalf("second call = %s, first = %s", b, a)
	}
	if len(e.cat.prices) != rows || spent(t, e) != total || total != 258 {
		t.Fatalf("rows %d (was %d), spent %d (was %d), want 258", len(e.cat.prices), rows, spent(t, e), total)
	}
	// The earlier day's Price, and the other days, are untouched.
	if p := priceOn(t, e, mutti, 1, "2026-11-02"); p == nil || *p.PriceCents != 159 {
		t.Fatalf("Price of 2 Nov = %+v, want 159", p)
	}
}

func TestSetPricesCountsAUuidSentTwiceOnce(t *testing.T) {
	e := setPricesEnv(t)
	apply(t, e, packScan("a", mutti, 700))
	got, err := setPrices(e, service.SetPricesInput{ClientUUIDs: []string{"a", "a"}, PriceCents: 129})
	if err != nil || len(got) != 1 || spent(t, e) != 129 {
		t.Fatalf("got %+v, %v, spent %d; want one result and 129", got, err, spent(t, e))
	}
}

func TestSetPricesWithAPricePerKgPricesEachScanByItsWeight(t *testing.T) {
	e := setPricesEnv(t)
	apply(t, e, packScan("pack", fusilli, 500))
	apply(t, e, weighedScan("weighed", fusilli, 312))

	got, err := setPrices(e, service.SetPricesInput{ClientUUIDs: []string{"pack", "weighed"}, PriceCents: 1000, PricePerKgCents: ip(2000)})
	if err != nil || len(got) != 2 {
		t.Fatalf("SetPrices = %+v, %v", got, err)
	}
	// 500 g x 20.00/kg = 10.00; 312 g x 20.00/kg = 6.24 (the Scanned row's "€6.24 / €20.00/kg").
	if priceOf(t, got[0]) != 1000 || priceOf(t, got[1]) != 624 {
		t.Fatalf("prices = %d and %d, want 1000 and 624", priceOf(t, got[0]), priceOf(t, got[1]))
	}
	if s := spent(t, e); s != 1624 {
		t.Fatalf("spentCents = %d, want 1624", s)
	}
	// The Price of the day keeps what was sent: the pack Price and the per kg Price.
	p := priceOn(t, e, fusilli, 1, "2026-11-09")
	if p == nil || p.PriceCents == nil || *p.PriceCents != 1000 || p.PricePerKgCents == nil || *p.PricePerKgCents != 2000 {
		t.Fatalf("Price of the day = %+v, want 1000 and 2000 per kg", p)
	}
}

func TestSetPricesRoundsAWeightedPriceHalfUp(t *testing.T) {
	e := setPricesEnv(t)
	apply(t, e, weighedScan("w", fusilli, 450))
	// 450 g x 8.99/kg = 404.55 cents -> 405 (product.PriceForWeight, as for a weighed barcode).
	got, err := setPrices(e, service.SetPricesInput{ClientUUIDs: []string{"w"}, PriceCents: 899, PricePerKgCents: ip(899)})
	if err != nil || priceOf(t, got[0]) != 405 {
		t.Fatalf("got %+v, %v, want 405", got, err)
	}
}

func TestAPricePerLitreForAProductInMillilitres(t *testing.T) {
	e := setPricesEnv(t)
	apply(t, e, packScan("a", juice, 500))
	got, err := setPrices(e, service.SetPricesInput{ClientUUIDs: []string{"a"}, PriceCents: 150, PricePerKgCents: ip(300)})
	if err != nil || priceOf(t, got[0]) != 150 {
		t.Fatalf("got %+v, %v, want 150 (500 ml at 3.00 per l)", got, err)
	}
	if p := priceOn(t, e, juice, 1, "2026-11-09"); p == nil || p.PricePerKgCents == nil || *p.PricePerKgCents != 300 {
		t.Fatalf("Price = %+v, want 300 per l stored in the per kg field", p)
	}
}

func TestAPricePerKgOnAPiecesProductIsRefusedAndNothingChanges(t *testing.T) {
	e := setPricesEnv(t)
	apply(t, e, packScan("a", eggs, 6))
	_, err := setPrices(e, service.SetPricesInput{ClientUUIDs: []string{"a"}, PriceCents: 250, PricePerKgCents: ip(500)})
	var ve *scan.ValidationError
	if !errors.As(err, &ve) || ve.Field != "pricePerKgCents" {
		t.Fatalf("err = %v, want a ValidationError on pricePerKgCents", err)
	}
	if len(e.cat.prices) != 0 || spent(t, e) != 0 {
		t.Fatalf("a refused edit wrote: %d Prices, %d spent", len(e.cat.prices), spent(t, e))
	}
	// The pack Price of the same Product is fine.
	if _, err := setPrices(e, service.SetPricesInput{ClientUUIDs: []string{"a"}, PriceCents: 250}); err != nil || spent(t, e) != 250 {
		t.Fatalf("pack Price: %v, spent %d", err, spent(t, e))
	}
}

func TestSetPricesWithoutAPricePerKgKeepsTheDaysEarlierPricePerKg(t *testing.T) {
	e := setPricesEnv(t)
	apply(t, e, packScan("a", fusilli, 500))
	if _, err := setPrices(e, service.SetPricesInput{ClientUUIDs: []string{"a"}, PriceCents: 1000, PricePerKgCents: ip(2000)}); err != nil {
		t.Fatal(err)
	}
	// Switching the row back to a per pack Price sets the scan to the pack Price and keeps the day's per kg (as SetPrice does).
	got, err := setPrices(e, service.SetPricesInput{ClientUUIDs: []string{"a"}, PriceCents: 900})
	if err != nil || priceOf(t, got[0]) != 900 {
		t.Fatalf("got %+v, %v, want 900", got, err)
	}
	if p := priceOn(t, e, fusilli, 1, "2026-11-09"); p == nil || *p.PriceCents != 900 || p.PricePerKgCents == nil || *p.PricePerKgCents != 2000 {
		t.Fatalf("Price = %+v, want 900 with the earlier 2000 per kg kept", p)
	}
}

func TestSetPricesErrorsLeaveEverythingAsItWas(t *testing.T) {
	setup := func(t *testing.T) *env {
		e := setPricesEnv(t)
		apply(t, e, packScan("a", mutti, 700))
		apply(t, e, packScan("b", mutti, 700))
		other := packScan("shop2", mutti, 700)
		other.ShopID = i64(2)
		apply(t, e, other)
		apply(t, e, packScan("pasta", fusilli, 500))
		apply(t, e, stockTake("take", scan.PlusPack))
		apply(t, e, packScan("gone", mutti, 700))
		if _, err := e.svc.Undo(context.Background(), "gone"); err != nil {
			t.Fatal(err)
		}
		return e
	}
	vals := func(field string) func(error) bool {
		return func(err error) bool {
			var ve *scan.ValidationError
			return errors.As(err, &ve) && ve.Field == field
		}
	}
	cases := []struct {
		name string
		in   service.SetPricesInput
		is   func(error) bool
	}{
		{"an unknown uuid, such as a scan still queued on the phone", service.SetPricesInput{ClientUUIDs: []string{"a", "queued-on-the-phone"}, PriceCents: 129},
			func(err error) bool { return errors.Is(err, service.ErrNotFound) }},
		{"an undone scan", service.SetPricesInput{ClientUUIDs: []string{"a", "gone"}, PriceCents: 129},
			func(err error) bool { return errors.Is(err, service.ErrAlreadyUndone) }},
		{"a stock-take", service.SetPricesInput{ClientUUIDs: []string{"a", "take"}, PriceCents: 129},
			func(err error) bool { return errors.Is(err, service.ErrNotUndoable) }},
		{"scans of two Shops", service.SetPricesInput{ClientUUIDs: []string{"a", "shop2"}, PriceCents: 129}, vals("clientUuids")},
		{"scans of two Products", service.SetPricesInput{ClientUUIDs: []string{"a", "pasta"}, PriceCents: 129}, vals("clientUuids")},
		{"no uuids", service.SetPricesInput{PriceCents: 129}, vals("clientUuids")},
		{"a zero price", service.SetPricesInput{ClientUUIDs: []string{"a", "b"}}, vals("priceCents")},
		{"a negative price", service.SetPricesInput{ClientUUIDs: []string{"a", "b"}, PriceCents: -5}, vals("priceCents")},
		{"a zero price per kg", service.SetPricesInput{ClientUUIDs: []string{"a", "b"}, PriceCents: 129, PricePerKgCents: ip(0)}, vals("pricePerKgCents")},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			e := setup(t)
			rowsBefore, spentBefore := len(e.cat.prices), spent(t, e)
			recordedBefore, published := len(e.cat.recorded), e.bus.count(shopservice.Topic)
			got, err := setPrices(e, c.in)
			if err == nil || !c.is(err) {
				t.Fatalf("err = %v, want %s", err, c.name)
			}
			if got != nil {
				t.Fatalf("results %+v with an error, want none", got)
			}
			if len(e.cat.prices) != rowsBefore || len(e.cat.recorded) != recordedBefore || spent(t, e) != spentBefore {
				t.Fatalf("an error wrote: %d Prices (was %d), %d recorded (was %d), spent %d (was %d)",
					len(e.cat.prices), rowsBefore, len(e.cat.recorded), recordedBefore, spent(t, e), spentBefore)
			}
			if e.bus.count(shopservice.Topic) != published {
				t.Fatal("an error published a change")
			}
		})
	}
}

func TestSetPricesLeavesTheOtherShopsPriceAlone(t *testing.T) {
	e := setPricesEnv(t)
	e.cat.seedPrice(mutti, 2, "2026-11-09", 300)
	apply(t, e, packScan("a", mutti, 700))
	if _, err := setPrices(e, service.SetPricesInput{ClientUUIDs: []string{"a"}, PriceCents: 129}); err != nil {
		t.Fatal(err)
	}
	if p := priceOn(t, e, mutti, 2, "2026-11-09"); p == nil || *p.PriceCents != 300 {
		t.Fatalf("the other Shop's Price = %+v, want 300", p)
	}
}

// SetPrice (one scan, per pack) keeps its signature; PATCH /api/scan/{uuid} with pricePerKgCents goes through SetPrices.
func TestSetPriceOfOneScanStillWorks(t *testing.T) {
	e := setPricesEnv(t)
	apply(t, e, packScan("a", mutti, 700))
	if res, err := e.svc.SetPrice(context.Background(), "a", 179); err != nil || priceOf(t, res) != 179 {
		t.Fatalf("SetPrice = %+v, %v", res, err)
	}
}

// OfflineProduct gains LastPriceDate next to LastPriceCents: "YYYY-MM-DD", absent from the JSON with no Price.
func TestOfflineProductCarriesLastPriceDateOnlyWhenThereIsAPrice(t *testing.T) {
	with, _ := json.Marshal(service.OfflineProduct{ID: 1, LastPriceCents: ip(129), LastPriceDate: "2026-11-02"})
	if !strings.Contains(string(with), `"lastPriceDate":"2026-11-02"`) {
		t.Fatalf("with a Price: %s", with)
	}
	without, _ := json.Marshal(service.OfflineProduct{ID: 1})
	if strings.Contains(string(without), "lastPriceDate") || !strings.Contains(string(without), `"lastPriceCents":null`) {
		t.Fatalf("without a Price: %s (lastPriceDate absent, lastPriceCents stays null)", without)
	}
}

// −1 on a priced row is the Undo of its latest scan: the day's Price stays while another scan of the row still uses it,
// and goes with the last one (Remove: "Their Stock Lots and Price go too").
func TestUndoOfOneScanOfAPricedRowKeepsTheDaysPrice(t *testing.T) {
	e := setPricesEnv(t)
	apply(t, e, packScan("a", mutti, 700))
	apply(t, e, packScan("b", mutti, 700))
	if _, err := setPrices(e, service.SetPricesInput{ClientUUIDs: []string{"a", "b"}, PriceCents: 129}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Undo(context.Background(), "b"); err != nil {
		t.Fatal(err)
	}
	if p := priceOn(t, e, mutti, 1, "2026-11-09"); p == nil || *p.PriceCents != 129 {
		t.Fatalf("after −1 the Price of the day = %+v, want 129 (scan a still has it)", p)
	}
	if _, err := e.svc.Undo(context.Background(), "a"); err != nil {
		t.Fatal(err)
	}
	if p := priceOn(t, e, mutti, 1, "2026-11-09"); p != nil {
		t.Fatalf("after the last Undo the Price of the day = %+v, want none", p)
	}
}

// A row priced over a Price the day already had (typed on the Prices page) puts that Price back when the row goes.
func TestUndoOfARowPricedOverAnEarlierPriceOfTheDayRestoresIt(t *testing.T) {
	e := setPricesEnv(t)
	apply(t, e, packScan("a", mutti, 700))
	e.cat.seedPrice(mutti, 1, "2026-11-09", 150) // typed on the Prices page after the scan
	if _, err := setPrices(e, service.SetPricesInput{ClientUUIDs: []string{"a"}, PriceCents: 129}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Undo(context.Background(), "a"); err != nil {
		t.Fatal(err)
	}
	if p := priceOn(t, e, mutti, 1, "2026-11-09"); p == nil || *p.PriceCents != 150 {
		t.Fatalf("after Undo the Price of the day = %+v, want the earlier 150 back", p)
	}
}

// The second scan of a row is prefilled from the first one's Price of the day: undoing the first one (out of order)
// keeps the Price for the second, and the last Undo removes it.
func TestUndoOutOfOrderKeepsTheDaysPriceForTheScansLeft(t *testing.T) {
	e := setPricesEnv(t)
	first := packScan("a", mutti, 700)
	first.PriceCents = ip(159)
	apply(t, e, first)
	apply(t, e, packScan("b", mutti, 700)) // prefilled 159 from today's Price
	if _, err := e.svc.Undo(context.Background(), "a"); err != nil {
		t.Fatal(err)
	}
	if p := priceOn(t, e, mutti, 1, "2026-11-09"); p == nil || *p.PriceCents != 159 {
		t.Fatalf("after undoing a the Price of the day = %+v, want 159 (b still has it)", p)
	}
	if _, err := e.svc.Undo(context.Background(), "b"); err != nil {
		t.Fatal(err)
	}
	if p := priceOn(t, e, mutti, 1, "2026-11-09"); p != nil {
		t.Fatalf("after the last Undo the Price of the day = %+v, want none", p)
	}
}
