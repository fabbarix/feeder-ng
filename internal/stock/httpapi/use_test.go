package httpapi_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// H9 (docs/dev/design/household-items.md section 4.11): quick Use of a Supply. Pinned API:
//
//	POST /api/stock/ingredients/{id}/use        {"quantity": 1}                    (r.User)
//	  200 {"ingredientId", "name", "baseUnit", "quantity", "total", "taken": [{"lotId", "quantity", "purchased",
//	       "storagePlaceId", "productId", "shopId"}]}      taken in the order taken (oldest purchased first); total = Stock left
//	POST /api/stock/ingredients/{id}/use/undo   {"taken": [<the taken array of the use answer>]}
//	  200 {"ingredientId", "name", "baseUnit", "quantity", "total", "taken": <the same Lots, as they are now>} quantity = what came back
//	Refusals: 422 "ingredient_not_supply" (food; field "ingredientId"), 422 "use_quantity_invalid" (quantity 0, below 0 or
//	absent; for Undo an empty list, a quantity of 0 or less or a missing purchase date), 422 "use_exceeds_stock" (more than is in
//	Stock, nothing taken), 404 "not_found" (no such Ingredient), 401 without a session. Neither records waste or a go-off.

type usedLotJSON struct {
	LotID          int64   `json:"lotId"`
	Quantity       float64 `json:"quantity"`
	Purchased      string  `json:"purchased"`
	StoragePlaceID *int64  `json:"storagePlaceId"`
	ProductID      *int64  `json:"productId"`
	ShopID         *int64  `json:"shopId"`
}

type useAnswer struct {
	IngredientID int64         `json:"ingredientId"`
	Name         string        `json:"name"`
	BaseUnit     string        `json:"baseUnit"`
	Quantity     float64       `json:"quantity"`
	Total        float64       `json:"total"`
	Taken        []usedLotJSON `json:"taken"`
}

func usePath(id int64) string  { return fmt.Sprintf("/api/stock/ingredients/%d/use", id) }
func undoPath(id int64) string { return usePath(id) + "/undo" }

// paperWithTwoLots seeds the Supply "Toilet paper" with 4 bought on 2026-11-01 and 9 bought on 2026-11-05 (added newest first).
func paperWithTwoLots(t *testing.T, env *testkit.Env, c *testkit.Client) (paper int64, older, newer kindLot) {
	t.Helper()
	paper = seedSupply(t, env, "Toilet paper", "piece", nil)
	c.Post("/api/stock/lots", map[string]any{"ingredientId": paper, "quantity": 9, "purchased": "2026-11-05"}).MustJSON(t, &newer)
	c.Post("/api/stock/lots", map[string]any{"ingredientId": paper, "quantity": 4, "purchased": "2026-11-01", "productId": 5, "shopId": 6}).MustJSON(t, &older)
	return paper, older, newer
}

func TestUseAndUndoRoutesRequireSignIn(t *testing.T) {
	env := testkit.Start(t)
	anon := env.Anonymous()
	for _, p := range []string{"/api/stock/ingredients/1/use", "/api/stock/ingredients/1/use/undo"} {
		r := anon.Post(p, map[string]any{})
		if r.Status != http.StatusUnauthorized || r.ErrorCode() != "unauthenticated" {
			t.Errorf("POST %s = %d %s", p, r.Status, r.Body)
		}
	}
}

func TestUseOneTakesFromTheOldestLotAndAnswersWhatItTook(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper, older, _ := paperWithTwoLots(t, env, c)
	var got useAnswer
	r := c.Post(usePath(paper), map[string]any{"quantity": 1})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.IngredientID != paper || got.Name != "Toilet paper" || got.BaseUnit != "piece" || got.Quantity != 1 || got.Total != 12 {
		t.Fatalf("use = %d %s", r.Status, r.Body)
	}
	if len(got.Taken) != 1 || got.Taken[0].LotID != older.ID || got.Taken[0].Quantity != 1 || got.Taken[0].Purchased != "2026-11-01" ||
		got.Taken[0].ProductID == nil || *got.Taken[0].ProductID != 5 || got.Taken[0].ShopID == nil || *got.Taken[0].ShopID != 6 {
		t.Fatalf("taken = %+v, want 1 from the Lot bought on 2026-11-01, with its Product and Shop", got.Taken)
	}
}

func TestUseSpansLotsAndTheStockListsShowIt(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper, older, newer := paperWithTwoLots(t, env, c)
	var got useAnswer
	r := c.Post(usePath(paper), map[string]any{"quantity": 6})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Total != 7 || len(got.Taken) != 2 ||
		got.Taken[0].LotID != older.ID || got.Taken[0].Quantity != 4 || got.Taken[1].LotID != newer.ID || got.Taken[1].Quantity != 2 {
		t.Fatalf("use = %d %s", r.Status, r.Body)
	}
	var lots struct{ Lots []kindLot }
	c.Get(fmt.Sprintf("/api/stock/lots?ingredientId=%d", paper)).MustJSON(t, &lots)
	if len(lots.Lots) != 1 || lots.Lots[0].ID != newer.ID || lots.Lots[0].Quantity != 7 {
		t.Fatalf("lots = %+v, want only the newer Lot with 7", lots.Lots)
	}
	var tot struct {
		Ingredients []struct {
			IngredientID int64   `json:"ingredientId"`
			Total        float64 `json:"total"`
		} `json:"ingredients"`
	}
	c.Get("/api/stock").MustJSON(t, &tot)
	if len(tot.Ingredients) != 1 || tot.Ingredients[0].Total != 7 {
		t.Fatalf("totals = %s", c.Get("/api/stock").Body)
	}
}

func TestUseRecordsNoWaste(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper, _, _ := paperWithTwoLots(t, env, c)
	if r := c.Post(usePath(paper), map[string]any{"quantity": 13}); r.Status != 200 { // everything
		t.Fatalf("use all = %d %s", r.Status, r.Body)
	}
	var waste struct {
		Records []any `json:"records"`
	}
	c.Get("/api/stock/waste?from=2000-01-01&to=2100-01-01").MustJSON(t, &waste)
	if len(waste.Records) != 0 {
		t.Fatalf("waste = %+v, want none", waste.Records)
	}
}

func TestUseRefusesFoodWithIngredientNotSupply(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seed(t, env, "milk", "ml", nil)
	c.Post("/api/stock/lots", map[string]any{"ingredientId": milk, "quantity": 1000, "purchased": "2026-11-08"})
	r := c.Post(usePath(milk), map[string]any{"quantity": 100})
	if r.Status != 422 || r.ErrorCode() != "ingredient_not_supply" {
		t.Fatalf("use food = %d %s", r.Status, r.Body)
	}
	var tot struct {
		Ingredients []struct{ Total float64 } `json:"ingredients"`
	}
	c.Get("/api/stock").MustJSON(t, &tot)
	if len(tot.Ingredients) != 1 || tot.Ingredients[0].Total != 1000 {
		t.Fatalf("food Stock moved: %s", c.Get("/api/stock").Body)
	}
}

func TestUseRefusesAQuantityOfZeroOrLessOrNone(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper, _, _ := paperWithTwoLots(t, env, c)
	for name, body := range map[string]map[string]any{
		"zero": {"quantity": 0}, "negative": {"quantity": -2}, "absent": {},
	} {
		r := c.Post(usePath(paper), body)
		if r.Status != 422 || r.ErrorCode() != "use_quantity_invalid" {
			t.Errorf("%s: %d %s", name, r.Status, r.Body)
		}
	}
	var list struct{ Lots []kindLot }
	c.Get(fmt.Sprintf("/api/stock/lots?ingredientId=%d", paper)).MustJSON(t, &list)
	if len(list.Lots) != 2 {
		t.Fatalf("a refused Use changed the Lots: %+v", list.Lots)
	}
}

func TestUseRefusesMoreThanIsInStockAndTakesNothing(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper, _, _ := paperWithTwoLots(t, env, c)
	r := c.Post(usePath(paper), map[string]any{"quantity": 13.5})
	if r.Status != 422 || r.ErrorCode() != "use_exceeds_stock" {
		t.Fatalf("use too much = %d %s", r.Status, r.Body)
	}
	var list struct{ Lots []kindLot }
	c.Get(fmt.Sprintf("/api/stock/lots?ingredientId=%d", paper)).MustJSON(t, &list)
	if len(list.Lots) != 2 || list.Lots[0].Quantity+list.Lots[1].Quantity != 13 {
		t.Fatalf("lots = %+v, want both Lots untouched", list.Lots)
	}
	empty := seedSupply(t, env, "Batteries", "piece", nil)
	if r := c.Post(usePath(empty), map[string]any{"quantity": 1}); r.Status != 422 || r.ErrorCode() != "use_exceeds_stock" {
		t.Fatalf("use with none in Stock = %d %s", r.Status, r.Body)
	}
}

func TestUseOfAnUnknownIngredientIsNotFound(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	for _, p := range []string{usePath(9999), "/api/stock/ingredients/abc/use", undoPath(9999)} {
		r := c.Post(p, map[string]any{"quantity": 1, "taken": []any{map[string]any{"lotId": 1, "quantity": 1, "purchased": "2026-11-01"}}})
		if r.Status != 404 || r.ErrorCode() != "not_found" {
			t.Errorf("POST %s = %d %s", p, r.Status, r.Body)
		}
	}
}

func TestUndoRestoresAPartlyUsedLotAndAnEmptiedOne(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper, older, newer := paperWithTwoLots(t, env, c)
	var used useAnswer
	c.Post(usePath(paper), map[string]any{"quantity": 6}).MustJSON(t, &used) // empties the older Lot, 2 from the newer
	var back useAnswer
	r := c.Post(undoPath(paper), map[string]any{"taken": used.Taken})
	r.MustJSON(t, &back)
	if r.Status != 200 || back.IngredientID != paper || back.Quantity != 6 || back.Total != 13 {
		t.Fatalf("undo = %d %s", r.Status, r.Body)
	}
	var list struct{ Lots []kindLot }
	c.Get(fmt.Sprintf("/api/stock/lots?ingredientId=%d", paper)).MustJSON(t, &list)
	if len(list.Lots) != 2 {
		t.Fatalf("lots = %+v, want 2 Lots again", list.Lots)
	}
	byPurchase := map[string]kindLot{}
	for _, l := range list.Lots {
		byPurchase[l.Purchased] = l
	}
	o, n := byPurchase["2026-11-01"], byPurchase["2026-11-05"]
	if o.Quantity != 4 || o.GoesOff != nil || o.ProductID == nil || *o.ProductID != 5 || o.ShopID == nil || *o.ShopID != 6 ||
		n.ID != newer.ID || n.Quantity != 9 {
		t.Fatalf("lots after Undo = %+v, want 4 (old, Product 5, Shop 6) and the newer Lot with 9", list.Lots)
	}
	_ = older
}

func TestUndoRefusals(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper, _, _ := paperWithTwoLots(t, env, c)
	milk := seed(t, env, "milk", "ml", nil)
	good := []map[string]any{{"lotId": 1, "quantity": 1, "purchased": "2026-11-01"}}
	cases := []struct {
		name, path, code string
		body             map[string]any
	}{
		{"food", undoPath(milk), "ingredient_not_supply", map[string]any{"taken": good}},
		{"no list", undoPath(paper), "use_quantity_invalid", map[string]any{}},
		{"empty list", undoPath(paper), "use_quantity_invalid", map[string]any{"taken": []any{}}},
		{"zero quantity", undoPath(paper), "use_quantity_invalid", map[string]any{"taken": []map[string]any{{"lotId": 1, "quantity": 0, "purchased": "2026-11-01"}}}},
		{"no purchase date", undoPath(paper), "use_quantity_invalid", map[string]any{"taken": []map[string]any{{"lotId": 1, "quantity": 1}}}},
	}
	for _, tc := range cases {
		if r := c.Post(tc.path, tc.body); r.Status != 422 || r.ErrorCode() != tc.code {
			t.Errorf("%s: %d %s, want 422 %s", tc.name, r.Status, r.Body, tc.code)
		}
	}
	var tot struct {
		Ingredients []struct{ Total float64 } `json:"ingredients"`
	}
	c.Get("/api/stock").MustJSON(t, &tot)
	if len(tot.Ingredients) != 1 || tot.Ingredients[0].Total != 13 {
		t.Fatalf("a refused Undo changed Stock: %s", c.Get("/api/stock").Body)
	}
}
