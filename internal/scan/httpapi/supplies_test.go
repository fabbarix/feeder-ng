package httpapi_test

import (
	"fmt"
	"testing"
)

// H4 (household-items.md §4.1, §5.3), pinned here:
//
//   - The unknown-barcode Op's new Ingredient takes an optional "kind": {"name":"Toilet paper","baseUnit":"piece","kind":"supply"}
//     ("food" when absent). The row is found by name first: an existing row keeps its own kind (offline sync never converts).
//     An unknown kind is a 422 rejected Op with error code validation_failed.
//   - The result's scan ("applied") and each GET /api/scan/offline Product carry "ingredientKind": "food" | "supply"
//     (the kind of the Product's Ingredient; Product rows have no kind of their own, so the key says whose it is).
//   - A Supply's Lot never has a go-off date, even when a stray shelf_life_days is stored on the row (the server ignores
//     a date for a Supply, as for Lot Edit).

type kindApplied struct {
	Status string `json:"status"`
	Error  struct {
		Code string `json:"code"`
	} `json:"error"`
	Scan struct {
		IngredientID   int64  `json:"ingredientId"`
		IngredientName string `json:"ingredientName"`
		IngredientKind string `json:"ingredientKind"`
		ProductID      int64  `json:"productId"`
		ProductCreated bool   `json:"productCreated"`
		LotID          *int64 `json:"lotId"`
	} `json:"scan"`
}

func (f fixture) newSupplyOp(uuid, code, name string) map[string]any {
	return map[string]any{"clientUuid": uuid, "scannedAt": "2026-11-09T12:00:00Z", "kind": "shop_unknown", "shopId": f.shop, "barcode": code, "scope": "global",
		"ingredient": map[string]any{"name": name, "baseUnit": "piece", "kind": "supply"}, "productName": "Lotus 9 rolls", "packSize": 9, "quantity": 9, "priceCents": 549, "rangeTo": "2026-11-15"}
}

func TestAnUnknownBarcodeCanBeSavedAsANewSupplyWithALotAndAPrice(t *testing.T) {
	f := newFixture(t)
	var res kindApplied
	r := f.user.Post("/api/scan", f.newSupplyOp("scan-0001", "5410091000004", "Toilet paper"))
	r.MustJSON(t, &res)
	if r.Status != 200 || res.Status != "applied" || !res.Scan.ProductCreated || res.Scan.IngredientKind != "supply" || res.Scan.LotID == nil {
		t.Fatalf("scan = %d %s", r.Status, r.Body)
	}
	var ing struct {
		Kind          string   `json:"kind"`
		BaseUnit      string   `json:"baseUnit"`
		ShelfLifeDays *int     `json:"shelfLifeDays"`
		RestockLevel  *float64 `json:"restockLevel"`
	}
	f.user.Get(fmt.Sprintf("/api/ingredients/%d", res.Scan.IngredientID)).MustJSON(t, &ing)
	if ing.Kind != "supply" || ing.BaseUnit != "piece" || ing.ShelfLifeDays != nil || ing.RestockLevel != nil {
		t.Fatalf("the new Ingredient = %+v, want a Supply in pieces with no Shelf Life and no Restock level", ing)
	}
	var lots struct {
		Lots []struct {
			Kind     string  `json:"kind"`
			GoesOff  *string `json:"goesOff"`
			Quantity float64 `json:"quantity"`
		} `json:"lots"`
	}
	f.user.Get("/api/stock/lots").MustJSON(t, &lots)
	if len(lots.Lots) != 1 || lots.Lots[0].Kind != "supply" || lots.Lots[0].GoesOff != nil || lots.Lots[0].Quantity != 9 {
		t.Fatalf("lots = %+v, want one Lot of 9 pieces with no go-off date", lots.Lots)
	}
}

func TestAnUnknownBarcodeWithNoKindCreatesFood(t *testing.T) {
	f := newFixture(t)
	op := f.newSupplyOp("scan-0001", "5410091000004", "Tin of beans")
	delete(op["ingredient"].(map[string]any), "kind")
	var res kindApplied
	f.user.Post("/api/scan", op).MustJSON(t, &res)
	if res.Status != "applied" || res.Scan.IngredientKind != "food" {
		t.Fatalf("scan = %+v, want an applied scan of food", res)
	}
}

func TestAnExistingIngredientKeepsItsOwnKindWhateverTheOpSays(t *testing.T) {
	f := newFixture(t) // "passata" is food
	op := f.newSupplyOp("scan-0001", "5410091000004", "passata")
	var res kindApplied
	f.user.Post("/api/scan", op).MustJSON(t, &res)
	if res.Status != "applied" || res.Scan.IngredientID != f.ingr || res.Scan.IngredientKind != "food" {
		t.Fatalf("scan = %+v, want it on the existing food passata", res)
	}
}

func TestAnUnknownKindRejectsTheOp(t *testing.T) {
	f := newFixture(t)
	op := f.newSupplyOp("scan-0001", "5410091000004", "Toilet paper")
	op["ingredient"].(map[string]any)["kind"] = "toy"
	var res kindApplied
	r := f.user.Post("/api/scan", op)
	r.MustJSON(t, &res)
	if r.Status != 422 || res.Status != "rejected" || res.Error.Code != "validation_failed" {
		t.Fatalf("scan = %d %s", r.Status, r.Body)
	}
}

func TestSyncCreatesASupplyFromAnOfflineOp(t *testing.T) {
	f := newFixture(t)
	var out struct {
		Results []kindApplied `json:"results"`
	}
	r := f.user.Post("/api/scan/sync", map[string]any{"ops": []any{f.newSupplyOp("scan-0001", "5410091000004", "Toilet paper"), f.op("scan-0002")}})
	r.MustJSON(t, &out)
	if r.Status != 200 || len(out.Results) != 2 || out.Results[0].Scan.IngredientKind != "supply" || out.Results[1].Scan.IngredientKind != "food" {
		t.Fatalf("sync = %d %s", r.Status, r.Body)
	}
}

func TestTheOfflineProductsCarryTheKindOfTheirIngredient(t *testing.T) {
	f := newFixture(t)
	if r := f.user.Post("/api/scan", f.newSupplyOp("scan-0001", "5410091000004", "Toilet paper")); r.Status != 200 {
		t.Fatalf("scan = %d %s", r.Status, r.Body)
	}
	var b struct {
		Products []struct {
			IngredientName string `json:"ingredientName"`
			IngredientKind string `json:"ingredientKind"`
		} `json:"products"`
	}
	r := f.user.Get(fmt.Sprintf("/api/scan/offline?shop=%d", f.shop))
	r.MustJSON(t, &b)
	got := map[string]string{}
	for _, p := range b.Products {
		got[p.IngredientName] = p.IngredientKind
	}
	if len(b.Products) != 2 || got["passata"] != "food" || got["Toilet paper"] != "supply" {
		t.Fatalf("offline = %s, want passata food and Toilet paper supply", r.Body)
	}
}

func TestAShopScanOfASupplyProductGivesItsLotNoGoOffDateEvenWithAStrayShelfLife(t *testing.T) {
	f := newFixture(t)
	var res kindApplied
	f.user.Post("/api/scan", f.newSupplyOp("scan-0001", "5410091000004", "Toilet paper")).MustJSON(t, &res)
	if _, err := f.env.DB.Exec(`UPDATE ingredients SET shelf_life_days = 30 WHERE id = ?`, res.Scan.IngredientID); err != nil {
		t.Fatal(err)
	}
	again := map[string]any{"clientUuid": "scan-0002", "scannedAt": "2026-11-09T12:00:00Z", "kind": "shop_scan", "shopId": f.shop, "productId": res.Scan.ProductID,
		"quantity": 9, "priceCents": 549, "rangeTo": "2026-11-15"}
	if r := f.user.Post("/api/scan", again); r.Status != 200 {
		t.Fatalf("scan = %d %s", r.Status, r.Body)
	}
	var lots struct {
		Lots []struct {
			GoesOff *string `json:"goesOff"`
		} `json:"lots"`
	}
	f.user.Get("/api/stock/lots").MustJSON(t, &lots)
	if len(lots.Lots) != 2 {
		t.Fatalf("lots = %+v", lots.Lots)
	}
	for _, l := range lots.Lots {
		if l.GoesOff != nil {
			t.Fatalf("a Supply's Lot has the go-off date %s; want none", *l.GoesOff)
		}
	}
}

func TestAStockTakeSetTotalOfASupplyMakesLotsWithNoGoOffDate(t *testing.T) {
	f := newFixture(t)
	var res kindApplied
	f.user.Post("/api/scan", f.newSupplyOp("scan-0001", "5410091000004", "Toilet paper")).MustJSON(t, &res)
	if _, err := f.env.DB.Exec(`UPDATE ingredients SET shelf_life_days = 30 WHERE id = ?`, res.Scan.IngredientID); err != nil {
		t.Fatal(err)
	}
	take := map[string]any{"clientUuid": "take-1", "scannedAt": "2026-11-09T12:00:00Z", "kind": "stock_take", "productId": res.Scan.ProductID, "action": "set_total", "total": 18}
	var tk struct {
		Status string `json:"status"`
		Scan   struct {
			Total *float64 `json:"total"`
		} `json:"scan"`
	}
	r := f.user.Post("/api/scan", take)
	r.MustJSON(t, &tk)
	if r.Status != 200 || tk.Status != "applied" || tk.Scan.Total == nil || *tk.Scan.Total != 18 {
		t.Fatalf("stock-take = %d %s, want a total of 18", r.Status, r.Body)
	}
	var lots struct {
		Lots []struct {
			GoesOff *string `json:"goesOff"`
		} `json:"lots"`
	}
	f.user.Get("/api/stock/lots").MustJSON(t, &lots)
	for _, l := range lots.Lots {
		if l.GoesOff != nil {
			t.Fatalf("a Supply's Lot has the go-off date %s; want none", *l.GoesOff)
		}
	}
}
