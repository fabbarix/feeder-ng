package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// H4: the Shopping List JSON.
//
//	GET /api/shopping/list: every Line (in lines and notNeeded) gains
//	  "kind": "food" | "supply"
//	  "restock": {"level": n, "stock": n} | null   (null for a Line that is not a Restock Line, and once a Restock Line
//	                                                is ticked and its level is met)
//	every extra gains "kind": "food" | "supply" for an Ingredient extra, null for a free-text extra.
//	Supplies group after food: lines are ordered open food, open Supplies, ticked food, ticked Supplies.
//
// The test clock says 2026-11-09. A Supply is made through POST /api/ingredients (admin), its Products through
// POST /api/products, its Stock through POST /api/stock/lots.

type restockFixture struct {
	env     *testkit.Env
	user    *testkit.Client
	shop    int64
	paper   int64 // Toilet paper, Supply, piece, level 9
	product int64 // Lotus 9 rolls, pack of 9, barcode 5410091000004
}

func newRestockFixture(t *testing.T) restockFixture {
	t.Helper()
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	var shop, ing, prod struct {
		ID int64 `json:"id"`
	}
	admin.Post("/api/shops", map[string]any{"name": "Coop"}).MustJSON(t, &shop)
	r := admin.Post("/api/ingredients", map[string]any{"name": "Toilet paper", "baseUnit": "piece", "kind": "supply", "restockLevel": 9})
	r.MustJSON(t, &ing)
	if r.Status != 201 {
		t.Fatalf("fixture: Supply %d %s", r.Status, r.Body)
	}
	user := env.LoginUser(t)
	r = user.Post("/api/products", map[string]any{"name": "Lotus 9 rolls", "ingredientId": ing.ID, "packSize": 9, "barcodes": []string{"5410091000004"}})
	r.MustJSON(t, &prod)
	if r.Status != 201 || shop.ID == 0 {
		t.Fatalf("fixture: Product %d %s, Shop %d", r.Status, r.Body, shop.ID)
	}
	return restockFixture{env: env, user: user, shop: shop.ID, paper: ing.ID, product: prod.ID}
}

func (f restockFixture) addStock(t *testing.T, ing int64, qty float64, uuid string) {
	t.Helper()
	if r := f.user.Post("/api/stock/lots", map[string]any{"ingredientId": ing, "quantity": qty, "purchased": "2026-11-08", "clientUuid": uuid}); r.Status != 201 {
		t.Fatalf("add stock = %d %s", r.Status, r.Body)
	}
}

type restockLine struct {
	IngredientID int64   `json:"ingredientId"`
	Name         string  `json:"name"`
	Kind         *string `json:"kind"`
	Quantity     float64 `json:"quantity"`
	Ticked       bool    `json:"ticked"`
	Restock      *struct {
		Level float64 `json:"level"`
		Stock float64 `json:"stock"`
	} `json:"restock"`
	Pack *struct {
		Count int `json:"count"`
	} `json:"pack"`
}

type restockList struct {
	Lines     []restockLine `json:"lines"`
	NotNeeded []restockLine `json:"notNeeded"`
	Extras    []struct {
		Name *string `json:"name"`
		Kind *string `json:"kind"`
	} `json:"extras"`
	Complete bool `json:"complete"`
	Progress struct {
		Ticked int `json:"ticked"`
		Total  int `json:"total"`
	} `json:"progress"`
	EstimatedCostCents int `json:"estimatedCostCents"`
}

func (f restockFixture) list(t *testing.T) restockList {
	t.Helper()
	var l restockList
	r := f.user.Get("/api/shopping/list")
	r.MustJSON(t, &l)
	if r.Status != 200 {
		t.Fatalf("list = %d %s", r.Status, r.Body)
	}
	return l
}

func TestASupplyBelowItsRestockLevelIsALineWithKindAndRestock(t *testing.T) {
	f := newRestockFixture(t)
	f.addStock(t, f.paper, 2, "s-1")
	l := f.list(t)
	if len(l.Lines) != 1 {
		t.Fatalf("Lines = %+v, want the Toilet paper Restock Line", l.Lines)
	}
	ln := l.Lines[0]
	if ln.IngredientID != f.paper || ln.Name != "Toilet paper" || ln.Quantity != 7 || ln.Kind == nil || *ln.Kind != "supply" ||
		ln.Restock == nil || ln.Restock.Level != 9 || ln.Restock.Stock != 2 || ln.Ticked {
		t.Fatalf("Line = %+v", ln)
	}
}

func TestNoLineAtOrAboveTheRestockLevelAndNoneForFoodWithNoLevel(t *testing.T) {
	f := newRestockFixture(t)
	f.addStock(t, f.paper, 9, "s-1")
	if l := f.list(t); len(l.Lines) != 0 {
		t.Fatalf("at the level: Lines = %+v, want none", l.Lines)
	}
}

func TestARestockLineHasTheSuggestedPacksAndTheEstimatedCost(t *testing.T) {
	f := newRestockFixture(t)
	// A purchase of the Product at the Shop gives it a Price and makes it "the Product last bought".
	r := f.user.Post("/api/scan", map[string]any{"clientUuid": "scan-1", "scannedAt": "2026-11-08T12:00:00Z", "kind": "shop_scan", "shopId": f.shop,
		"productId": f.product, "quantity": 9, "priceCents": 549, "rangeTo": "2026-11-15"})
	if r.Status != 200 {
		t.Fatalf("scan = %d %s", r.Status, r.Body)
	}
	// Used up 7 of the 9 (a Lot patch): Stock 2, below the level.
	var lots struct{ Lots []struct{ ID int64 } }
	f.user.Get("/api/stock/lots").MustJSON(t, &lots)
	if p := f.user.Patch("/api/stock/lots/"+itoa(lots.Lots[0].ID), map[string]any{"quantity": 2}); p.Status != 200 {
		t.Fatalf("patch = %d %s", p.Status, p.Body)
	}
	// The scan ticked the Line for the range ending 11-15; the range ending 11-14 has no tick and the same Restock Line.
	var l restockList
	f.user.Get("/api/shopping/list?to=2026-11-14").MustJSON(t, &l)
	if len(l.Lines) != 1 || l.Lines[0].Pack == nil || l.Lines[0].Pack.Count != 1 || l.EstimatedCostCents != 549 {
		t.Fatalf("list = %+v, want one pack and an estimate of 549", l)
	}
}

func TestSuppliesGroupAfterFoodAndExtrasCarryKind(t *testing.T) {
	f := newRestockFixture(t)
	milk := seedIngredient(t, f.env, "milk", "ml")
	f.addStock(t, f.paper, 2, "s-1")
	// a food Line from an Ingredient extra's neighbour: an open food extra, a Supply extra and a free-text extra.
	for _, body := range []map[string]any{
		{"ingredientId": milk, "quantity": 1000}, {"ingredientId": f.paper, "quantity": 4}, {"text": "candles"},
	} {
		if r := f.user.Post("/api/shopping/extras", body); r.Status != 201 {
			t.Fatalf("extra = %d %s", r.Status, r.Body)
		}
	}
	l := f.list(t)
	kinds := map[string]string{}
	for _, e := range l.Extras {
		name, kind := "text", "null"
		if e.Name != nil {
			name = *e.Name
		}
		if e.Kind != nil {
			kind = *e.Kind
		}
		kinds[name] = kind
	}
	if kinds["milk"] != "food" || kinds["Toilet paper"] != "supply" || kinds["text"] != "null" || len(l.Extras) != 3 {
		t.Fatalf("extra kinds = %v, want milk food, Toilet paper supply, free text null", kinds)
	}
	// both the Restock Line and the extra of the same Supply show
	if len(l.Lines) != 1 || l.Lines[0].Quantity != 7 || l.Progress.Total != 4 {
		t.Fatalf("Lines %+v, progress %+v; want the Line of 7 and 4 entries in all", l.Lines, l.Progress)
	}
}

func TestATickedRestockLineAddsStockAndStaysTickedWithNoRestockInfo(t *testing.T) {
	f := newRestockFixture(t)
	f.addStock(t, f.paper, 2, "s-1")
	r := f.user.Post("/api/shopping/ticks", map[string]any{"ingredientId": f.paper, "to": "2026-11-15", "quantity": 7, "clientUuid": "tick-1"})
	if r.Status != 200 {
		t.Fatalf("tick = %d %s", r.Status, r.Body)
	}
	var total struct {
		Ingredients []struct {
			IngredientID int64   `json:"ingredientId"`
			Total        float64 `json:"total"`
			Kind         string  `json:"kind"`
		} `json:"ingredients"`
	}
	f.user.Get("/api/stock").MustJSON(t, &total)
	if len(total.Ingredients) != 1 || total.Ingredients[0].Total != 9 {
		t.Fatalf("Stock = %s, want 9 pieces of Toilet paper", f.user.Get("/api/stock").Body)
	}
	l := f.list(t)
	if len(l.Lines) != 1 || !l.Lines[0].Ticked || l.Lines[0].Kind == nil || *l.Lines[0].Kind != "supply" || l.Lines[0].Restock != nil || !l.Complete {
		t.Fatalf("list = %+v, want the Line ticked, kind supply, restock null, complete", l)
	}
}

func TestBuyingARestockLineByScanTicksItAndRaisesStock(t *testing.T) {
	f := newRestockFixture(t)
	f.addStock(t, f.paper, 2, "s-1")
	var res struct {
		Status string `json:"status"`
		Scan   struct {
			OnList    bool    `json:"onList"`
			Ticked    bool    `json:"ticked"`
			Remaining float64 `json:"remaining"`
		} `json:"scan"`
	}
	r := f.user.Post("/api/scan", map[string]any{"clientUuid": "scan-1", "scannedAt": "2026-11-09T12:00:00Z", "kind": "shop_scan", "shopId": f.shop,
		"productId": f.product, "quantity": 9, "priceCents": 549, "rangeTo": "2026-11-15"})
	r.MustJSON(t, &res)
	if r.Status != 200 || res.Status != "applied" || !res.Scan.OnList || !res.Scan.Ticked || res.Scan.Remaining != 0 {
		t.Fatalf("scan = %d %s, want it on the list and ticked", r.Status, r.Body)
	}
	l := f.list(t)
	if len(l.Lines) != 1 || !l.Lines[0].Ticked || !l.Complete {
		t.Fatalf("list = %+v, want the Line ticked", l)
	}
}

func TestNotNeededTakesARestockLineOffTheListWithItsKind(t *testing.T) {
	f := newRestockFixture(t)
	f.addStock(t, f.paper, 2, "s-1")
	if r := f.user.Post("/api/shopping/not-needed", map[string]any{"ingredientId": f.paper, "to": "2026-11-15"}); r.Status != 200 && r.Status != 204 {
		t.Fatalf("not needed = %d %s", r.Status, r.Body)
	}
	l := f.list(t)
	if len(l.Lines) != 0 || len(l.NotNeeded) != 1 || l.NotNeeded[0].Kind == nil || *l.NotNeeded[0].Kind != "supply" {
		t.Fatalf("list = %+v, want the Line under notNeeded with kind supply", l)
	}
}

func TestEveryFoodLineAlsoCarriesKindFoodAndNoRestock(t *testing.T) {
	f := newRestockFixture(t)
	f.addStock(t, f.paper, 9, "s-1")
	milk := seedIngredient(t, f.env, "milk", "ml")
	if r := f.user.Post("/api/shopping/ticks", map[string]any{"ingredientId": milk, "to": "2026-11-15", "quantity": 0}); r.Status != 200 {
		t.Fatalf("tick = %d %s", r.Status, r.Body)
	}
	l := f.list(t)
	if len(l.Lines) != 1 || l.Lines[0].Kind == nil || *l.Lines[0].Kind != "food" || l.Lines[0].Restock != nil {
		t.Fatalf("Lines = %+v, want milk with kind food and restock null", l.Lines)
	}
}
