package httpapi_test

import (
	"net/http"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func seedIngredient(t *testing.T, env *testkit.Env, name, base string) int64 {
	t.Helper()
	res, err := env.DB.Exec(`INSERT INTO ingredients (name, name_key, base_unit, shelf_life_days, created_at, updated_at)
		VALUES (?, ?, ?, NULL, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`, name, name, base)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func TestEveryShoppingRouteRequiresSignIn(t *testing.T) {
	env := testkit.Start(t)
	anon := env.Anonymous()
	routes := []struct{ method, path string }{
		{"GET", "/api/shopping/list"}, {"POST", "/api/shopping/extras"}, {"DELETE", "/api/shopping/extras/1"},
		{"POST", "/api/shopping/extras/1/tick"}, {"DELETE", "/api/shopping/extras/1/tick"},
		{"POST", "/api/shopping/ticks"}, {"DELETE", "/api/shopping/ticks?ingredientId=1&to=2026-11-15"},
	}
	for _, rt := range routes {
		var body any
		if rt.method == "POST" {
			body = map[string]any{}
		}
		if r := anon.Do(rt.method, rt.path, body); r.Status != http.StatusUnauthorized || r.ErrorCode() != "unauthenticated" {
			t.Errorf("%s %s = %d %s", rt.method, rt.path, r.Status, r.Body)
		}
	}
}

func TestAnEmptyListHasTheRangeTheCurrencyAndEmptyArrays(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	r := c.Get("/api/shopping/list")
	var v map[string]any
	r.MustJSON(t, &v)
	if r.Status != 200 || v["today"] != "2026-11-09" || v["to"] != "2026-11-15" || v["defaultTo"] != "2026-11-15" || v["maxTo"] != "2026-11-15" ||
		v["currency"] != "USD" || v["complete"] != false || v["from"] != "2026-11-09" {
		t.Fatalf("list = %d %s", r.Status, r.Body)
	}
	for _, k := range []string{"lines", "extras"} {
		if arr, ok := v[k].([]any); !ok || len(arr) != 0 {
			t.Errorf("%s = %v, want []", k, v[k])
		}
	}
	if p, _ := v["progress"].(map[string]any); p["ticked"] != float64(0) || p["total"] != float64(0) {
		t.Errorf("progress = %v", v["progress"])
	}
}

func TestAChosenDateIsClampedAndAnUnknownShopIs404(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	var v map[string]any
	c.Get("/api/shopping/list?to=2027-01-01").MustJSON(t, &v)
	if v["to"] != "2026-11-15" {
		t.Errorf("to = %v, want it capped at the horizon", v["to"])
	}
	if r := c.Get("/api/shopping/list?shop=999"); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("unknown shop = %d %s", r.Status, r.Body)
	}
}

func TestManualExtrasStayInTheListUntilDeleted(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seedIngredient(t, env, "milk", "ml")
	var text, ing struct {
		ID           int64    `json:"id"`
		Text         *string  `json:"text"`
		IngredientID *int64   `json:"ingredientId"`
		Quantity     *float64 `json:"quantity"`
	}
	r := c.Post("/api/shopping/extras", map[string]any{"text": "toilet paper"})
	r.MustJSON(t, &text)
	if r.Status != 201 || text.ID == 0 || text.Text == nil || *text.Text != "toilet paper" {
		t.Fatalf("text extra = %d %s", r.Status, r.Body)
	}
	r = c.Post("/api/shopping/extras", map[string]any{"ingredientId": milk, "quantity": 2000})
	r.MustJSON(t, &ing)
	if r.Status != 201 || ing.IngredientID == nil || *ing.IngredientID != milk || ing.Quantity == nil || *ing.Quantity != 2000 {
		t.Fatalf("Ingredient extra = %d %s", r.Status, r.Body)
	}
	var v struct {
		Extras []map[string]any `json:"extras"`
	}
	c.Get("/api/shopping/list").MustJSON(t, &v)
	if len(v.Extras) != 2 {
		t.Fatalf("extras in the list = %v", v.Extras)
	}
	if r := c.Delete("/api/shopping/extras/" + itoa(text.ID)); r.Status != 204 {
		t.Fatalf("delete = %d %s", r.Status, r.Body)
	}
	if r := c.Delete("/api/shopping/extras/" + itoa(text.ID)); r.Status != 404 {
		t.Fatalf("second delete = %d", r.Status)
	}
}

func TestBadExtrasAreRejected(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seedIngredient(t, env, "milk", "ml")
	for name, body := range map[string]map[string]any{
		"both":      {"text": "x", "ingredientId": milk, "quantity": 1},
		"neither":   {},
		"blank":     {"text": "   "},
		"no amount": {"ingredientId": milk},
		"negative":  {"ingredientId": milk, "quantity": -5},
	} {
		if r := c.Post("/api/shopping/extras", body); r.Status != 422 || r.ErrorCode() != "validation_failed" {
			t.Errorf("%s = %d %s", name, r.Status, r.Body)
		}
	}
	if r := c.Post("/api/shopping/extras", map[string]any{"ingredientId": 9999, "quantity": 5}); r.Status != 422 || r.ErrorCode() != "unknown_ingredient" {
		t.Errorf("unknown Ingredient = %d %s", r.Status, r.Body)
	}
}

func TestTickingByHandAddsAStockLotAndIsIdempotent(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seedIngredient(t, env, "milk", "ml")
	body := map[string]any{"ingredientId": milk, "to": "2026-11-15", "quantity": 400, "clientUuid": "tick-1"}
	var first, second struct {
		Ticked  bool   `json:"ticked"`
		LotID   *int64 `json:"lotId"`
		Created bool   `json:"created"`
	}
	r := c.Post("/api/shopping/ticks", body)
	r.MustJSON(t, &first)
	if r.Status != 200 || !first.Ticked || first.LotID == nil || !first.Created {
		t.Fatalf("first = %d %s", r.Status, r.Body)
	}
	c.Post("/api/shopping/ticks", body).MustJSON(t, &second)
	if second.Created || second.LotID == nil || *second.LotID != *first.LotID {
		t.Fatalf("second = %+v, want the same Lot, not created", second)
	}
	var stock struct {
		Ingredients []struct {
			Total float64 `json:"total"`
		} `json:"ingredients"`
	}
	c.Get("/api/stock").MustJSON(t, &stock)
	if len(stock.Ingredients) != 1 || stock.Ingredients[0].Total != 400 {
		t.Fatalf("Stock = %+v, want 400 ml", stock)
	}
	if r := c.Delete("/api/shopping/ticks?ingredientId=" + itoa(milk) + "&to=2026-11-15"); r.Status != 204 {
		t.Fatalf("untick = %d %s", r.Status, r.Body)
	}
	if r := c.Post("/api/shopping/ticks", map[string]any{"ingredientId": milk, "to": "2026-11-15", "quantity": -1}); r.Status != 422 || r.ErrorCode() != "validation_failed" {
		t.Fatalf("negative = %d %s", r.Status, r.Body)
	}
}

func TestEveryWritePublishesAShoppingEvent(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	ch, cancel := env.App.Deps.Events.Subscribe("shopping")
	defer cancel()
	c.Post("/api/shopping/extras", map[string]any{"text": "candles"})
	select {
	case ev := <-ch:
		if ev.Topic != "shopping" {
			t.Fatalf("event = %+v", ev)
		}
	default:
		t.Fatal("the extra was added but no shopping event was published before the response")
	}
}
