package httpapi_test

import (
	"net/http"
	"strconv"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

type fixture struct {
	env     *testkit.Env
	user    *testkit.Client
	shop    int64
	ingr    int64
	product int64
}

func newFixture(t *testing.T) fixture {
	t.Helper()
	env := testkit.Start(t)
	res, err := env.DB.Exec(`INSERT INTO ingredients (name, name_key, base_unit, shelf_life_days, created_at, updated_at)
		VALUES ('passata', 'passata', 'g', NULL, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`)
	if err != nil {
		t.Fatal(err)
	}
	ing, _ := res.LastInsertId()
	var shop, prod struct {
		ID int64 `json:"id"`
	}
	env.LoginAdmin(t).Post("/api/shops", map[string]any{"name": "Coop"}).MustJSON(t, &shop)
	user := env.LoginUser(t)
	r := user.Post("/api/products", map[string]any{"name": "Mutti passata 700 g", "ingredientId": ing, "packSize": 700, "barcodes": []string{"8000500310427"}})
	r.MustJSON(t, &prod)
	if r.Status != 201 || shop.ID == 0 {
		t.Fatalf("fixture: product %d %s, shop %d", r.Status, r.Body, shop.ID)
	}
	return fixture{env: env, user: user, shop: shop.ID, ingr: ing, product: prod.ID}
}

func (f fixture) op(uuid string) map[string]any {
	return map[string]any{"clientUuid": uuid, "scannedAt": "2026-11-09T12:00:00Z", "kind": "shop_scan", "shopId": f.shop, "productId": f.product, "quantity": 700, "priceCents": 159, "rangeTo": "2026-11-15"}
}

func TestEveryScanRouteRequiresSignIn(t *testing.T) {
	env := testkit.Start(t)
	anon := env.Anonymous()
	for _, rt := range []struct{ method, path string }{
		{"GET", "/api/scan/bundle"}, {"POST", "/api/scan"}, {"POST", "/api/scan/sync"}, {"POST", "/api/scan/u-1/undo"}, {"PATCH", "/api/scan/u-1"},
	} {
		var body any
		if rt.method != "GET" {
			body = map[string]any{}
		}
		if r := anon.Do(rt.method, rt.path, body); r.Status != http.StatusUnauthorized || r.ErrorCode() != "unauthenticated" {
			t.Errorf("%s %s = %d %s", rt.method, rt.path, r.Status, r.Body)
		}
	}
}

func TestAShopScanAddsALotAndReportsItOffTheList(t *testing.T) {
	f := newFixture(t)
	var res struct {
		ClientUUID string `json:"clientUuid"`
		Status     string `json:"status"`
		Scan       struct {
			IngredientName string  `json:"ingredientName"`
			Quantity       float64 `json:"quantity"`
			LotID          *int64  `json:"lotId"`
			PriceCents     *int    `json:"priceCents"`
			OnList         bool    `json:"onList"`
		} `json:"scan"`
	}
	r := f.user.Post("/api/scan", f.op("scan-0001"))
	r.MustJSON(t, &res)
	if r.Status != 200 || res.Status != "applied" || res.ClientUUID != "scan-0001" || res.Scan.IngredientName != "passata" || res.Scan.Quantity != 700 ||
		res.Scan.LotID == nil || res.Scan.PriceCents == nil || *res.Scan.PriceCents != 159 || res.Scan.OnList {
		t.Fatalf("scan = %d %s", r.Status, r.Body)
	}
	var lots struct {
		Lots []struct {
			Source    string `json:"source"`
			ProductID *int64 `json:"productId"`
			ShopID    *int64 `json:"shopId"`
			Quantity  float64
		} `json:"lots"`
	}
	f.user.Get("/api/stock/lots").MustJSON(t, &lots)
	if len(lots.Lots) != 1 || lots.Lots[0].Source != "scan" || lots.Lots[0].ShopID == nil || *lots.Lots[0].ShopID != f.shop || lots.Lots[0].ProductID == nil || *lots.Lots[0].ProductID != f.product {
		t.Fatalf("Stock Lots = %+v", lots)
	}
	var again struct {
		Status string `json:"status"`
	}
	f.user.Post("/api/scan", f.op("scan-0001")).MustJSON(t, &again)
	if again.Status != "duplicate" {
		t.Fatalf("repeat = %s", again.Status)
	}
	f.user.Get("/api/stock/lots").MustJSON(t, &lots)
	if len(lots.Lots) != 1 {
		t.Fatalf("a repeated client uuid added a second Lot: %+v", lots)
	}
}

func TestARejectedOperationAnswers422WithItsError(t *testing.T) {
	f := newFixture(t)
	r := f.user.Post("/api/scan", map[string]any{"clientUuid": "bad", "scannedAt": "2026-11-09T12:00:00Z", "kind": "shop_scan"})
	var res struct {
		Status string `json:"status"`
		Error  struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	r.MustJSON(t, &res)
	if r.Status != 422 || res.Status != "rejected" || res.Error.Code != "validation_failed" {
		t.Fatalf("bad op = %d %s", r.Status, r.Body)
	}
	op := f.op("scan-0002")
	op["productId"] = 9999
	r = f.user.Post("/api/scan", op)
	r.MustJSON(t, &res)
	if r.Status != 422 || res.Error.Code != "unknown_product" {
		t.Fatalf("unknown product = %d %s", r.Status, r.Body)
	}
}

func TestSyncReturnsResultsInOrder(t *testing.T) {
	f := newFixture(t)
	var out struct {
		Results []struct {
			ClientUUID string `json:"clientUuid"`
			Status     string `json:"status"`
		} `json:"results"`
	}
	bad := map[string]any{"clientUuid": "bad", "scannedAt": "2026-11-09T12:00:00Z", "kind": "shop_scan"}
	r := f.user.Post("/api/scan/sync", map[string]any{"ops": []any{f.op("a"), bad, f.op("b"), f.op("a")}})
	r.MustJSON(t, &out)
	got := ""
	for _, x := range out.Results {
		got += x.ClientUUID + ":" + x.Status + " "
	}
	if r.Status != 200 || got != "a:applied bad:rejected b:applied a:duplicate " {
		t.Fatalf("sync = %d %q", r.Status, got)
	}
}

func TestUndoRemovesTheLotAndIsIdempotent(t *testing.T) {
	f := newFixture(t)
	f.user.Post("/api/scan", f.op("scan-0001"))
	var out struct {
		Undone        bool `json:"undone"`
		AlreadyUndone bool `json:"alreadyUndone"`
	}
	r := f.user.Post("/api/scan/scan-0001/undo", nil)
	r.MustJSON(t, &out)
	if r.Status != 200 || !out.Undone {
		t.Fatalf("undo = %d %s", r.Status, r.Body)
	}
	var lots struct {
		Lots []any `json:"lots"`
	}
	f.user.Get("/api/stock/lots").MustJSON(t, &lots)
	if len(lots.Lots) != 0 {
		t.Fatalf("Lots after Undo = %v", lots.Lots)
	}
	f.user.Post("/api/scan/scan-0001/undo", nil).MustJSON(t, &out)
	if !out.AlreadyUndone {
		t.Fatalf("second undo = %+v", out)
	}
	if r := f.user.Post("/api/scan/ghost/undo", nil); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Fatalf("unknown = %d %s", r.Status, r.Body)
	}
}

func TestStockTakeCannotBeUndone(t *testing.T) {
	f := newFixture(t)
	r := f.user.Post("/api/scan", map[string]any{"clientUuid": "take-1", "scannedAt": "2026-11-09T12:00:00Z", "kind": "stock_take", "productId": f.product, "action": "plus_pack"})
	if r.Status != 200 {
		t.Fatalf("stock-take = %d %s", r.Status, r.Body)
	}
	if r := f.user.Post("/api/scan/take-1/undo", nil); r.Status != 409 || r.ErrorCode() != "not_undoable" {
		t.Fatalf("undo = %d %s", r.Status, r.Body)
	}
}

func TestEditingThePriceKeepsTheScanAndChangesThePrice(t *testing.T) {
	f := newFixture(t)
	f.user.Post("/api/scan", f.op("scan-0001"))
	var res struct {
		Scan struct {
			PriceCents *int `json:"priceCents"`
		} `json:"scan"`
	}
	r := f.user.Patch("/api/scan/scan-0001", map[string]any{"priceCents": 179})
	r.MustJSON(t, &res)
	if r.Status != 200 || res.Scan.PriceCents == nil || *res.Scan.PriceCents != 179 {
		t.Fatalf("patch = %d %s", r.Status, r.Body)
	}
	var price struct {
		PriceCents *int `json:"priceCents"`
	}
	f.user.Get("/api/products/"+strconv.FormatInt(f.product, 10)+"/prices/latest?shop="+strconv.FormatInt(f.shop, 10)).MustJSON(t, &price)
	if price.PriceCents == nil || *price.PriceCents != 179 {
		t.Fatalf("latest Price = %+v", price)
	}
	if r := f.user.Patch("/api/scan/scan-0001", map[string]any{"priceCents": 0}); r.Status != 422 {
		t.Fatalf("zero price = %d", r.Status)
	}
	if r := f.user.Patch("/api/scan/ghost", map[string]any{"priceCents": 100}); r.Status != 404 {
		t.Fatalf("unknown = %d", r.Status)
	}
}

func TestTheBundleHoldsTheCatalogTheProductsAndTheLastPrice(t *testing.T) {
	f := newFixture(t)
	f.user.Post("/api/scan", f.op("scan-0001"))
	var b struct {
		ShopID   *int64 `json:"shopId"`
		ShopName string `json:"shopName"`
		Catalog  struct {
			GlobalBarcodes map[string]int64 `json:"globalBarcodes"`
		} `json:"catalog"`
		Products []struct {
			ID             int64   `json:"id"`
			Name           string  `json:"name"`
			IngredientName string  `json:"ingredientName"`
			BaseUnit       string  `json:"baseUnit"`
			PackSize       float64 `json:"packSize"`
			LastPriceCents *int    `json:"lastPriceCents"`
		} `json:"products"`
	}
	r := f.user.Get("/api/scan/bundle?shop=" + strconv.FormatInt(f.shop, 10))
	r.MustJSON(t, &b)
	if r.Status != 200 || b.ShopName != "Coop" || b.Catalog.GlobalBarcodes["08000500310427"] != f.product || len(b.Products) != 1 {
		t.Fatalf("bundle = %d %s", r.Status, r.Body)
	}
	if p := b.Products[0]; p.ID != f.product || p.Name != "Mutti passata 700 g" || p.IngredientName != "passata" || p.BaseUnit != "g" || p.PackSize != 700 || p.LastPriceCents == nil || *p.LastPriceCents != 159 {
		t.Fatalf("product = %+v", p)
	}
	var home struct {
		ShopID *int64 `json:"shopId"`
	}
	f.user.Get("/api/scan/bundle").MustJSON(t, &home)
	if home.ShopID != nil {
		t.Fatalf("home bundle shopId = %v, want null", home.ShopID)
	}
	if r := f.user.Get("/api/scan/bundle?shop=9999"); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Fatalf("unknown shop = %d %s", r.Status, r.Body)
	}
}
