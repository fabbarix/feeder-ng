package httpapi_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

type lot struct {
	ID             int64   `json:"id"`
	IngredientID   int64   `json:"ingredientId"`
	IngredientName string  `json:"ingredientName"`
	BaseUnit       string  `json:"baseUnit"`
	Quantity       float64 `json:"quantity"`
	Purchased      string  `json:"purchased"`
	GoesOff        *string `json:"goesOff"`
	Source         string  `json:"source"`
	ProductID      *int64  `json:"productId"`
	ShopID         *int64  `json:"shopId"`
	Spoiled        bool    `json:"spoiled"`
	UseSoon        bool    `json:"useSoon"`
}

func seed(t *testing.T, env *testkit.Env, name, base string, shelf any) int64 {
	t.Helper()
	res, err := env.DB.Exec(`INSERT INTO ingredients (name, name_key, base_unit, shelf_life_days, created_at, updated_at)
		VALUES (?, ?, ?, ?, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`, name, name, base, shelf)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func TestEveryStockRouteRequiresSignIn(t *testing.T) {
	env := testkit.Start(t)
	anon := env.Anonymous()
	routes := []struct{ method, path string }{
		{"GET", "/api/stock"}, {"GET", "/api/stock/lots"}, {"POST", "/api/stock/lots"},
		{"PUT", "/api/stock/ingredients/1/total"}, {"GET", "/api/stock/spoiled"},
		{"POST", "/api/stock/lots/1/throw-out"}, {"POST", "/api/stock/lots/1/keep"},
		{"POST", "/api/stock/cooked"}, {"GET", "/api/stock/projected"}, {"GET", "/api/stock/waste"},
	}
	for _, rt := range routes {
		r := anon.Do(rt.method, rt.path, nil)
		if r.Status != http.StatusUnauthorized || r.ErrorCode() != "unauthenticated" {
			t.Errorf("%s %s = %d %s", rt.method, rt.path, r.Status, r.Body)
		}
	}
}

func TestAddLotReturnsLotAndRepeatedUUIDReturns200(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seed(t, env, "milk", "ml", nil)
	body := map[string]any{"ingredientId": milk, "quantity": 1000, "source": "scan", "clientUuid": "u-1", "productId": 5, "shopId": 6}
	var first, second lot
	r := c.Post("/api/stock/lots", body)
	r.MustJSON(t, &first)
	if r.Status != 201 || first.ID == 0 || first.Source != "scan" || first.GoesOff != nil ||
		first.ProductID == nil || *first.ProductID != 5 || first.ShopID == nil || *first.ShopID != 6 ||
		first.IngredientName != "milk" || first.BaseUnit != "ml" || first.Purchased != "2026-11-09" {
		t.Fatalf("first = %d %s", r.Status, r.Body)
	}
	r = c.Post("/api/stock/lots", body)
	r.MustJSON(t, &second)
	if r.Status != 200 || second.ID != first.ID {
		t.Fatalf("second = %d %s", r.Status, r.Body)
	}
}

func TestAddLotComputesGoOffAndValidates(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	var l lot
	r := c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 800, "purchased": "2026-11-07"})
	r.MustJSON(t, &l)
	if r.Status != 201 || l.GoesOff == nil || *l.GoesOff != "2026-11-11" || l.Source != "manual" || !l.UseSoon {
		t.Fatalf("add = %d %s", r.Status, r.Body)
	}
	bad := []map[string]any{
		{"ingredientId": thighs, "quantity": 0},
		{"ingredientId": thighs, "quantity": -3},
		{"ingredientId": thighs, "quantity": 5, "purchased": "2026-12-01"},
		{"ingredientId": thighs, "quantity": 5, "source": "stock_take"},
		{"ingredientId": thighs, "quantity": 5, "source": "teleport"},
	}
	for i, b := range bad {
		if r := c.Post("/api/stock/lots", b); r.Status != 422 || r.ErrorCode() != "validation_failed" {
			t.Errorf("bad[%d] = %d %s", i, r.Status, r.Body)
		}
	}
	if r := c.Post("/api/stock/lots", map[string]any{"ingredientId": 9999, "quantity": 5}); r.Status != 422 || r.ErrorCode() != "unknown_ingredient" {
		t.Errorf("unknown ingredient = %d %s", r.Status, r.Body)
	}
	if r := c.Post("/api/stock/lots", "{not json"); r.Status != 400 {
		t.Errorf("bad json = %d", r.Status)
	}
}

func TestTotalsLotsAndSetTotal(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 300, "purchased": "2026-11-08"})

	var list struct {
		Ingredients []struct {
			IngredientID int64   `json:"ingredientId"`
			Name         string  `json:"name"`
			Total        float64 `json:"total"`
			LotCount     int     `json:"lotCount"`
			NextGoesOff  *string `json:"nextGoesOff"`
			UseSoon      bool    `json:"useSoon"`
			SpoiledCount int     `json:"spoiledCount"`
		} `json:"ingredients"`
	}
	c.Get("/api/stock").MustJSON(t, &list)
	if len(list.Ingredients) != 1 || list.Ingredients[0].Total != 300 || !list.Ingredients[0].UseSoon ||
		list.Ingredients[0].NextGoesOff == nil || *list.Ingredients[0].NextGoesOff != "2026-11-12" {
		t.Fatalf("totals = %+v", list)
	}

	var set struct {
		Ingredient struct {
			Total    float64 `json:"total"`
			LotCount int     `json:"lotCount"`
		} `json:"ingredient"`
		Lots []lot `json:"lots"`
	}
	r := c.Put(fmt.Sprintf("/api/stock/ingredients/%d/total", thighs), map[string]any{"total": 1000})
	r.MustJSON(t, &set)
	if r.Status != 200 || set.Ingredient.Total != 1000 || len(set.Lots) != 2 {
		t.Fatalf("set total = %d %s", r.Status, r.Body)
	}

	var lots struct {
		Lots []lot `json:"lots"`
	}
	c.Get(fmt.Sprintf("/api/stock/lots?ingredientId=%d", thighs)).MustJSON(t, &lots)
	if len(lots.Lots) != 2 {
		t.Fatalf("lots = %+v", lots)
	}

	if r := c.Put(fmt.Sprintf("/api/stock/ingredients/%d/total", thighs), map[string]any{"total": -1}); r.Status != 422 || r.ErrorCode() != "validation_failed" {
		t.Errorf("negative total = %d %s", r.Status, r.Body)
	}
	if r := c.Put("/api/stock/ingredients/9999/total", map[string]any{"total": 1}); r.Status != 422 || r.ErrorCode() != "unknown_ingredient" {
		t.Errorf("unknown = %d %s", r.Status, r.Body)
	}
}

func TestCookedDeductsAndWarns(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", nil)
	c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 300})
	var out struct {
		Warnings []struct {
			IngredientID int64   `json:"ingredientId"`
			Name         string  `json:"name"`
			BaseUnit     string  `json:"baseUnit"`
			Have         float64 `json:"have"`
			Need         float64 `json:"need"`
			Shortfall    float64 `json:"shortfall"`
			Message      string  `json:"message"`
		} `json:"warnings"`
	}
	r := c.Post("/api/stock/cooked", map[string]any{"needs": []map[string]any{{"ingredientId": thighs, "quantity": 800}}})
	r.MustJSON(t, &out)
	if r.Status != 200 || len(out.Warnings) != 1 || out.Warnings[0].Shortfall != 500 ||
		out.Warnings[0].Message != "Stock shows only 300 g chicken thighs, the recipe uses 800 g" {
		t.Fatalf("cooked = %d %s", r.Status, r.Body)
	}
	var list struct {
		Ingredients []any `json:"ingredients"`
	}
	c.Get("/api/stock").MustJSON(t, &list)
	if len(list.Ingredients) != 0 {
		t.Fatalf("Stock should be 0: %+v", list)
	}
	// Short Stock never blocks, and an empty need list is fine.
	if r := c.Post("/api/stock/cooked", map[string]any{"needs": []any{}}); r.Status != 200 {
		t.Errorf("empty needs = %d", r.Status)
	}
}

func TestSpoiledThrowOutKeepAndWaste(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	var old, fresh lot
	c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 200, "purchased": "2026-11-01"}).MustJSON(t, &old)
	c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 100, "purchased": "2026-11-08"}).MustJSON(t, &fresh)

	var sp struct {
		Lots []lot `json:"lots"`
	}
	c.Get("/api/stock/spoiled").MustJSON(t, &sp)
	if len(sp.Lots) != 1 || sp.Lots[0].ID != old.ID || !sp.Lots[0].Spoiled {
		t.Fatalf("spoiled = %+v", sp)
	}

	if r := c.Post(fmt.Sprintf("/api/stock/lots/%d/keep", fresh.ID), nil); r.Status != 409 || r.ErrorCode() != "not_spoiled" {
		t.Errorf("keep fresh = %d %s", r.Status, r.Body)
	}
	if r := c.Post("/api/stock/lots/9999/throw-out", nil); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("unknown = %d %s", r.Status, r.Body)
	}

	var kept lot
	r := c.Post(fmt.Sprintf("/api/stock/lots/%d/keep", old.ID), nil)
	r.MustJSON(t, &kept)
	if r.Status != 200 || kept.GoesOff == nil || *kept.GoesOff != "2026-11-06" {
		t.Fatalf("keep = %d %s", r.Status, r.Body)
	}

	var rec struct {
		ID           int64   `json:"id"`
		IngredientID int64   `json:"ingredientId"`
		Quantity     float64 `json:"quantity"`
		WastedOn     string  `json:"wastedOn"`
		Reason       string  `json:"reason"`
		LotID        int64   `json:"lotId"`
	}
	r = c.Post(fmt.Sprintf("/api/stock/lots/%d/throw-out", old.ID), nil)
	r.MustJSON(t, &rec)
	if r.Status != 200 || rec.Quantity != 200 || rec.Reason != "spoiled" || rec.WastedOn != "2026-11-09" || rec.LotID != old.ID {
		t.Fatalf("throw out = %d %s", r.Status, r.Body)
	}
	var waste struct {
		Records []struct {
			Quantity float64 `json:"quantity"`
		} `json:"records"`
	}
	c.Get("/api/stock/waste").MustJSON(t, &waste)
	if len(waste.Records) != 1 {
		t.Fatalf("waste = %+v", waste)
	}
}

func TestProjectedReadModel(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 500, "purchased": "2026-11-08"})
	c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 300, "purchased": "2026-11-06"})
	var p struct {
		Ingredients []struct {
			IngredientID int64 `json:"ingredientId"`
			Lots         []struct {
				ID       int64   `json:"id"`
				Quantity float64 `json:"quantity"`
				GoesOff  *string `json:"goesOff"`
			} `json:"lots"`
		} `json:"ingredients"`
	}
	c.Get("/api/stock/projected").MustJSON(t, &p)
	if len(p.Ingredients) != 1 || len(p.Ingredients[0].Lots) != 2 || p.Ingredients[0].Lots[0].Quantity != 300 ||
		p.Ingredients[0].Lots[0].GoesOff == nil || *p.Ingredients[0].Lots[0].GoesOff != "2026-11-10" {
		t.Fatalf("projected = %+v", p)
	}
}

func TestStockChangesPublishOnStockTopic(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seed(t, env, "milk", "ml", nil)
	ch, cancel := env.App.Deps.Events.Subscribe("stock")
	defer cancel()
	c.Post("/api/stock/lots", map[string]any{"ingredientId": milk, "quantity": 500})
	select {
	case ev := <-ch:
		if ev.Topic != "stock" {
			t.Fatalf("topic = %s", ev.Topic)
		}
	default:
		t.Fatal("no stock event after adding a Stock Lot")
	}
}

func TestLotsAndSpoiledResponsesCarryHouseholdTodayAndFlags(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	milk := seed(t, env, "milk", "ml", nil)
	var old, soon, far, none lot
	c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 100, "purchased": "2026-11-01"}).MustJSON(t, &old)  // off 11-05
	c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 200, "purchased": "2026-11-08"}).MustJSON(t, &soon) // off 11-12: today+3
	c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 300, "purchased": "2026-11-09"}).MustJSON(t, &far)  // off 11-13: today+4
	c.Post("/api/stock/lots", map[string]any{"ingredientId": milk, "quantity": 1000}).MustJSON(t, &none)

	var all struct {
		Today string `json:"today"`
		Lots  []lot  `json:"lots"`
	}
	c.Get("/api/stock/lots").MustJSON(t, &all)
	if all.Today != "2026-11-09" {
		t.Fatalf("lots today = %q, want the household date 2026-11-09", all.Today)
	}
	want := map[int64][2]bool{old.ID: {true, false}, soon.ID: {false, true}, far.ID: {false, false}, none.ID: {false, false}}
	if len(all.Lots) != 4 {
		t.Fatalf("lots = %+v", all.Lots)
	}
	for _, l := range all.Lots {
		if w := want[l.ID]; l.Spoiled != w[0] || l.UseSoon != w[1] {
			t.Errorf("lot %d: spoiled=%v useSoon=%v, want %v", l.ID, l.Spoiled, l.UseSoon, w)
		}
	}

	var sp struct {
		Today string `json:"today"`
		Lots  []lot  `json:"lots"`
	}
	c.Get("/api/stock/spoiled").MustJSON(t, &sp)
	if sp.Today != "2026-11-09" || len(sp.Lots) != 1 || sp.Lots[0].ID != old.ID || !sp.Lots[0].Spoiled || sp.Lots[0].UseSoon {
		t.Fatalf("spoiled = %+v", sp)
	}

	// An empty spoiled list still says what day it is.
	c.Post(fmt.Sprintf("/api/stock/lots/%d/throw-out", old.ID), nil)
	var none2 struct {
		Today string `json:"today"`
		Lots  []lot  `json:"lots"`
	}
	c.Get("/api/stock/spoiled").MustJSON(t, &none2)
	if none2.Today != "2026-11-09" || len(none2.Lots) != 0 {
		t.Fatalf("empty spoiled = %+v", none2)
	}
}

func TestTotalsUseSoonAndSpoiledCountFollowTheServerRule(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 100, "purchased": "2026-11-01"}) // spoiled
	c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 100, "purchased": "2026-11-09"}) // off 11-13: not use soon
	var list struct {
		Ingredients []struct {
			UseSoon      bool `json:"useSoon"`
			SpoiledCount int  `json:"spoiledCount"`
		} `json:"ingredients"`
	}
	c.Get("/api/stock").MustJSON(t, &list)
	if len(list.Ingredients) != 1 || list.Ingredients[0].UseSoon || list.Ingredients[0].SpoiledCount != 1 {
		t.Fatalf("totals = %+v", list)
	}
}
