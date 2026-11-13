package httpapi_test

import (
	"net/http"
	"strconv"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// SR1 (shop-scan-proposals.md §13.9). The contract these tests pin:
//
//	PATCH /api/scan/prices  {"clientUuids":["a","b"], "priceCents":129, "pricePerKgCents":2000?}
//	  200 {"results":[{"clientUuid":"a","status":"applied","scan":{...,"priceCents":129}}, ...]}  (in the order sent)
//	  404 not_found          any uuid unknown to the server (a scan still queued on the phone, an offline uuid not yet synced)
//	  409 already_undone     any scan was undone;  409 not_undoable  any is a stock_take
//	  422 validation_failed  no uuids, priceCents or pricePerKgCents <= 0 (priceCents is required), scans of more than one
//	                         Shop or Product, pricePerKgCents on a Product in pieces
//	  Nothing is written on any error.
//	PATCH /api/scan/{uuid}  {"priceCents":139, "pricePerKgCents":199?}  the same rules for one scan; the body is the Result.
//	  With pricePerKgCents each scan costs quantity x per kg / 1000, rounded half up; priceCents is the pack Price kept on the
//	  Price of the day with the per kg. Without it the scan costs priceCents (as before).
//	GET /api/scan/offline?shop=N  each product also has "lastPriceDate":"YYYY-MM-DD", the date of its latest Price at that
//	  Shop; the key is absent when lastPriceCents is null.
//
// "prices" is not a client uuid: PATCH /api/scan/prices always means the batch route.

type pricesFixture struct {
	fixture
	shop2  int64
	pieces int64
}

func newPricesFixture(t *testing.T) pricesFixture {
	t.Helper()
	f := newFixture(t)
	var shop struct {
		ID int64 `json:"id"`
	}
	f.env.LoginAdmin(t).Post("/api/shops", map[string]any{"name": "Esselunga"}).MustJSON(t, &shop)
	res, err := f.env.DB.Exec(`INSERT INTO ingredients (name, name_key, base_unit, shelf_life_days, created_at, updated_at)
		VALUES ('eggs', 'eggs', 'piece', NULL, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`)
	if err != nil {
		t.Fatal(err)
	}
	ing, _ := res.LastInsertId()
	var prod struct {
		ID int64 `json:"id"`
	}
	r := f.user.Post("/api/products", map[string]any{"name": "Eggs 6", "ingredientId": ing, "packSize": 6})
	r.MustJSON(t, &prod)
	if r.Status != 201 {
		t.Fatalf("pieces Product: %d %s", r.Status, r.Body)
	}
	return pricesFixture{fixture: f, shop2: shop.ID, pieces: prod.ID}
}

func (f pricesFixture) scan(t *testing.T, uuid string, mod func(map[string]any)) {
	t.Helper()
	op := f.op(uuid)
	if mod != nil {
		mod(op)
	}
	if r := f.user.Post("/api/scan", op); r.Status != 200 {
		t.Fatalf("scan %s = %d %s", uuid, r.Status, r.Body)
	}
}

type scanResults struct {
	Results []struct {
		ClientUUID string `json:"clientUuid"`
		Status     string `json:"status"`
		Scan       struct {
			PriceCents *int `json:"priceCents"`
		} `json:"scan"`
	} `json:"results"`
}

func (f pricesFixture) spent(t *testing.T) int {
	t.Helper()
	var l struct {
		Summary struct {
			SpentCents int `json:"spentCents"`
		} `json:"summary"`
	}
	f.user.Get("/api/shopping/list?to=2026-11-15").MustJSON(t, &l)
	return l.Summary.SpentCents
}

type latestPrice struct {
	Date            string `json:"date"`
	PriceCents      *int   `json:"priceCents"`
	PricePerKgCents *int   `json:"pricePerKgCents"`
}

func (f pricesFixture) latest(t *testing.T, product, shop int64) latestPrice {
	t.Helper()
	var p latestPrice
	f.user.Get("/api/products/"+strconv.FormatInt(product, 10)+"/prices/latest?shop="+strconv.FormatInt(shop, 10)).MustJSON(t, &p)
	return p
}

func TestThePricesRouteRequiresSignIn(t *testing.T) {
	env := testkit.Start(t)
	if r := env.Anonymous().Patch("/api/scan/prices", map[string]any{}); r.Status != http.StatusUnauthorized || r.ErrorCode() != "unauthenticated" {
		t.Fatalf("anonymous = %d %s", r.Status, r.Body)
	}
}

func TestOnePriceForAllTheScansOfARow(t *testing.T) {
	f := newPricesFixture(t)
	for _, u := range []string{"a", "b", "c"} {
		f.scan(t, u, func(op map[string]any) { delete(op, "priceCents") })
	}
	if f.spent(t) != 0 {
		t.Fatalf("unpriced scans spent %d", f.spent(t))
	}
	var res scanResults
	r := f.user.Patch("/api/scan/prices", map[string]any{"clientUuids": []string{"a", "b", "c"}, "priceCents": 129})
	r.MustJSON(t, &res)
	if r.Status != 200 || len(res.Results) != 3 {
		t.Fatalf("patch = %d %s", r.Status, r.Body)
	}
	for i, u := range []string{"a", "b", "c"} {
		if got := res.Results[i]; got.ClientUUID != u || got.Status != "applied" || got.Scan.PriceCents == nil || *got.Scan.PriceCents != 129 {
			t.Errorf("result %d = %+v", i, got)
		}
	}
	if f.spent(t) != 3*129 {
		t.Fatalf("summary.spentCents = %d, want %d", f.spent(t), 3*129)
	}
	if p := f.latest(t, f.product, f.shop); p.PriceCents == nil || *p.PriceCents != 129 || p.Date != "2026-11-09" {
		t.Fatalf("Price of the day = %+v", p)
	}
	var again scanResults
	if r := f.user.Patch("/api/scan/prices", map[string]any{"clientUuids": []string{"a", "b", "c"}, "priceCents": 129}); r.Status != 200 {
		t.Fatalf("repeat = %d %s", r.Status, r.Body)
	} else {
		r.MustJSON(t, &again)
	}
	if len(again.Results) != 3 || f.spent(t) != 3*129 {
		t.Fatalf("repeat changed things: %+v, spent %d", again, f.spent(t))
	}
	var prices []latestPrice
	f.user.Get("/api/products/"+strconv.FormatInt(f.product, 10)+"/prices?shop="+strconv.FormatInt(f.shop, 10)).MustJSON(t, &prices)
	if len(prices) != 1 {
		t.Fatalf("%d Price rows, want one per Shop per day: %+v", len(prices), prices)
	}
}

func TestAPricePerKgPricesEachScanByWeight(t *testing.T) {
	f := newPricesFixture(t)
	f.scan(t, "pack", func(op map[string]any) { delete(op, "priceCents") })                                               // 700 g
	f.scan(t, "weighed", func(op map[string]any) { delete(op, "priceCents"); op["quantity"], op["weighed"] = 312, true }) // 312 g
	var res scanResults
	r := f.user.Patch("/api/scan/prices", map[string]any{"clientUuids": []string{"pack", "weighed"}, "priceCents": 1400, "pricePerKgCents": 2000})
	r.MustJSON(t, &res)
	if r.Status != 200 || len(res.Results) != 2 || *res.Results[0].Scan.PriceCents != 1400 || *res.Results[1].Scan.PriceCents != 624 {
		t.Fatalf("patch = %d %s, want 1400 (700 g) and 624 (312 g) at 20.00/kg", r.Status, r.Body)
	}
	if f.spent(t) != 2024 {
		t.Fatalf("spentCents = %d, want 2024", f.spent(t))
	}
	if p := f.latest(t, f.product, f.shop); p.PriceCents == nil || *p.PriceCents != 1400 || p.PricePerKgCents == nil || *p.PricePerKgCents != 2000 {
		t.Fatalf("Price = %+v, want 1400 and 2000 per kg", p)
	}
}

func TestThePricesRouteRefusesWhatItCannotApplyAndWritesNothing(t *testing.T) {
	f := newPricesFixture(t)
	f.scan(t, "a", nil)
	f.scan(t, "elsewhere", func(op map[string]any) { op["shopId"] = f.shop2 })
	f.scan(t, "eggs", func(op map[string]any) { op["productId"], op["quantity"] = f.pieces, 6 })
	f.scan(t, "gone", nil)
	f.user.Post("/api/scan/gone/undo", nil)
	f.user.Post("/api/scan", map[string]any{"clientUuid": "take", "scannedAt": "2026-11-09T12:00:00Z", "kind": "stock_take", "productId": f.product, "action": "plus_pack"})
	cases := []struct {
		name   string
		body   map[string]any
		status int
		code   string
	}{
		{"unknown uuid", map[string]any{"clientUuids": []string{"a", "not-synced-yet"}, "priceCents": 200}, 404, "not_found"},
		{"undone scan", map[string]any{"clientUuids": []string{"a", "gone"}, "priceCents": 200}, 409, "already_undone"},
		{"stock-take", map[string]any{"clientUuids": []string{"a", "take"}, "priceCents": 200}, 409, "not_undoable"},
		{"two Shops", map[string]any{"clientUuids": []string{"a", "elsewhere"}, "priceCents": 200}, 422, "validation_failed"},
		{"two Products", map[string]any{"clientUuids": []string{"a", "eggs"}, "priceCents": 200}, 422, "validation_failed"},
		{"no uuids", map[string]any{"clientUuids": []string{}, "priceCents": 200}, 422, "validation_failed"},
		{"missing price", map[string]any{"clientUuids": []string{"a"}}, 422, "validation_failed"},
		{"zero price", map[string]any{"clientUuids": []string{"a"}, "priceCents": 0}, 422, "validation_failed"},
		{"zero per kg", map[string]any{"clientUuids": []string{"a"}, "priceCents": 200, "pricePerKgCents": 0}, 422, "validation_failed"},
		{"per kg on pieces", map[string]any{"clientUuids": []string{"eggs"}, "priceCents": 200, "pricePerKgCents": 500}, 422, "validation_failed"},
	}
	spentBefore := f.spent(t)
	for _, c := range cases {
		if r := f.user.Patch("/api/scan/prices", c.body); r.Status != c.status || r.ErrorCode() != c.code {
			t.Errorf("%s = %d %s, want %d %s", c.name, r.Status, r.Body, c.status, c.code)
		}
	}
	if f.spent(t) != spentBefore {
		t.Fatalf("a refused edit changed the total: %d -> %d", spentBefore, f.spent(t))
	}
	if p := f.latest(t, f.product, f.shop); p.PriceCents == nil || *p.PriceCents != 159 {
		t.Fatalf("Price = %+v, want the 159 of the scans", p)
	}
}

func TestAPackPriceOnAPiecesProductIsFine(t *testing.T) {
	f := newPricesFixture(t)
	f.scan(t, "eggs", func(op map[string]any) { op["productId"], op["quantity"] = f.pieces, 6; delete(op, "priceCents") })
	if r := f.user.Patch("/api/scan/prices", map[string]any{"clientUuids": []string{"eggs"}, "priceCents": 320}); r.Status != 200 {
		t.Fatalf("pack Price on pieces = %d %s", r.Status, r.Body)
	}
	if f.spent(t) != 320 {
		t.Fatalf("spentCents = %d", f.spent(t))
	}
}

func TestPatchOneScanAcceptsAPricePerKg(t *testing.T) {
	f := newPricesFixture(t)
	f.scan(t, "weighed", func(op map[string]any) { delete(op, "priceCents"); op["quantity"], op["weighed"] = 312, true })
	var res struct {
		Scan struct {
			PriceCents *int `json:"priceCents"`
		} `json:"scan"`
	}
	r := f.user.Patch("/api/scan/weighed", map[string]any{"priceCents": 1400, "pricePerKgCents": 2000})
	r.MustJSON(t, &res)
	if r.Status != 200 || res.Scan.PriceCents == nil || *res.Scan.PriceCents != 624 {
		t.Fatalf("patch = %d %s, want 624 (312 g at 20.00/kg)", r.Status, r.Body)
	}
	if f.spent(t) != 624 {
		t.Fatalf("spentCents = %d, want 624", f.spent(t))
	}
	if p := f.latest(t, f.product, f.shop); *p.PriceCents != 1400 || *p.PricePerKgCents != 2000 {
		t.Fatalf("Price = %+v", p)
	}
	// 700 g at 1.99/kg = 139.3 -> 139: the pack Price implied, rounded half up.
	f.scan(t, "pack", func(op map[string]any) { delete(op, "priceCents") })
	r = f.user.Patch("/api/scan/pack", map[string]any{"priceCents": 139, "pricePerKgCents": 199})
	r.MustJSON(t, &res)
	if r.Status != 200 || *res.Scan.PriceCents != 139 {
		t.Fatalf("patch = %d %s, want 139", r.Status, r.Body)
	}
	// Without pricePerKgCents the scan costs priceCents, as before.
	r = f.user.Patch("/api/scan/pack", map[string]any{"priceCents": 150})
	r.MustJSON(t, &res)
	if r.Status != 200 || *res.Scan.PriceCents != 150 {
		t.Fatalf("patch = %d %s, want 150", r.Status, r.Body)
	}
}

func TestPatchOneScanRefusesAPricePerKgOnAPiecesProduct(t *testing.T) {
	f := newPricesFixture(t)
	f.scan(t, "eggs", func(op map[string]any) { op["productId"], op["quantity"] = f.pieces, 6 })
	if r := f.user.Patch("/api/scan/eggs", map[string]any{"priceCents": 320, "pricePerKgCents": 500}); r.Status != 422 || r.ErrorCode() != "validation_failed" {
		t.Fatalf("patch = %d %s, want 422 validation_failed", r.Status, r.Body)
	}
	if f.spent(t) != 159 {
		t.Fatalf("spentCents = %d, want the scan's 159 kept", f.spent(t))
	}
	if r := f.user.Patch("/api/scan/eggs", map[string]any{"priceCents": 320, "pricePerKgCents": -1}); r.Status != 422 {
		t.Fatalf("negative per kg = %d", r.Status)
	}
}

func TestTheOfflineDataHasTheDateOfTheLastPrice(t *testing.T) {
	f := newPricesFixture(t)
	f.scan(t, "a", nil) // Mutti passata: 159 on 2026-11-09 at Coop
	if r := f.user.Put("/api/products/"+strconv.FormatInt(f.pieces, 10)+"/prices", map[string]any{"shopId": f.shop, "date": "2026-11-02", "priceCents": 290}); r.Status != 200 {
		t.Fatalf("record Price = %d %s", r.Status, r.Body)
	}
	var b struct {
		Products []map[string]any `json:"products"`
	}
	r := f.user.Get("/api/scan/offline?shop=" + strconv.FormatInt(f.shop, 10))
	r.MustJSON(t, &b)
	byID := map[int64]map[string]any{}
	for _, p := range b.Products {
		byID[int64(p["id"].(float64))] = p
	}
	if p := byID[f.product]; p["lastPriceCents"] != float64(159) || p["lastPriceDate"] != "2026-11-09" {
		t.Fatalf("scanned Product = %v", p)
	}
	if p := byID[f.pieces]; p["lastPriceCents"] != float64(290) || p["lastPriceDate"] != "2026-11-02" {
		t.Fatalf("Product priced by hand = %v", p)
	}
	// At the other Shop, and at home, there is no Price and no date.
	for _, path := range []string{"/api/scan/offline?shop=" + strconv.FormatInt(f.shop2, 10), "/api/scan/offline"} {
		var b struct {
			Products []map[string]any `json:"products"`
		}
		f.user.Get(path).MustJSON(t, &b)
		for _, p := range b.Products {
			if _, has := p["lastPriceDate"]; has {
				t.Fatalf("%s: %v has a lastPriceDate with no Price", path, p)
			}
		}
	}
}
