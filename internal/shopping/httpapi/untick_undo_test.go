package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Beta.8 (undo): DELETE /api/shopping/ticks takes back the Stock the tick added, for the Shop screen and the Scan
// screen's To get Undo alike (docs/dev/design/b8-undo.md, ADR 0019). The response stays 204.

type lotsBody struct {
	Lots []struct {
		ID       int64   `json:"id"`
		Quantity float64 `json:"quantity"`
	} `json:"lots"`
}

func stockOf(t *testing.T, c *testkit.Client, ing int64) lotsBody {
	t.Helper()
	var l lotsBody
	c.Get("/api/stock/lots?ingredientId="+itoa(ing)).MustJSON(t, &l)
	return l
}

func TestUntickTakesBackTheStockTheTickAdded(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	cauli := seedIngredient(t, env, "cauliflower", "g")
	for i := 0; i < 3; i++ {
		if r := c.Post("/api/shopping/ticks", map[string]any{"ingredientId": cauli, "to": "2026-11-15", "quantity": 4000, "clientUuid": "t-" + itoa(int64(i))}); r.Status != 200 {
			t.Fatalf("tick = %d %s", r.Status, r.Body)
		}
		if got := stockOf(t, c, cauli); len(got.Lots) != 1 || got.Lots[0].Quantity != 4000 {
			t.Fatalf("after tick %d: Lots = %+v, want one Lot of 4000 g", i, got.Lots)
		}
		if r := c.Delete("/api/shopping/ticks?ingredientId=" + itoa(cauli) + "&to=2026-11-15"); r.Status != 204 {
			t.Fatalf("untick = %d %s", r.Status, r.Body)
		}
		if got := stockOf(t, c, cauli); len(got.Lots) != 0 {
			t.Fatalf("after Undo %d: Lots = %+v, want none", i, got.Lots)
		}
	}
}

func TestUntickTwiceTakesBackOnce(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seedIngredient(t, env, "milk", "ml")
	c.Post("/api/shopping/ticks", map[string]any{"ingredientId": milk, "to": "2026-11-15", "quantity": 400, "clientUuid": "a"})
	// A Lot bought by hand afterwards is not the tick's and must stay.
	c.Post("/api/stock/lots", map[string]any{"ingredientId": milk, "quantity": 1000})
	for i := 0; i < 2; i++ {
		if r := c.Delete("/api/shopping/ticks?ingredientId=" + itoa(milk) + "&to=2026-11-15"); r.Status != 204 {
			t.Fatalf("untick %d = %d %s", i, r.Status, r.Body)
		}
	}
	if got := stockOf(t, c, milk); len(got.Lots) != 1 || got.Lots[0].Quantity != 1000 {
		t.Fatalf("Lots = %+v, want only the Lot added by hand", got.Lots)
	}
}

func TestUntickOfALotEditedUpTakesBackOnlyWhatTheTickAdded(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seedIngredient(t, env, "milk", "ml")
	var tick struct {
		LotID *int64 `json:"lotId"`
	}
	c.Post("/api/shopping/ticks", map[string]any{"ingredientId": milk, "to": "2026-11-15", "quantity": 400, "clientUuid": "a"}).MustJSON(t, &tick)
	if r := c.Patch("/api/stock/lots/"+itoa(*tick.LotID), map[string]any{"quantity": 600}); r.Status != 200 {
		t.Fatalf("edit = %d %s", r.Status, r.Body)
	}
	c.Delete("/api/shopping/ticks?ingredientId=" + itoa(milk) + "&to=2026-11-15")
	if got := stockOf(t, c, milk); len(got.Lots) != 1 || got.Lots[0].Quantity != 200 {
		t.Fatalf("Lots = %+v, want 200 ml left", got.Lots)
	}
}

func TestUntickOfALotAlreadyDeletedIsStill204(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seedIngredient(t, env, "milk", "ml")
	var tick struct {
		LotID *int64 `json:"lotId"`
	}
	c.Post("/api/shopping/ticks", map[string]any{"ingredientId": milk, "to": "2026-11-15", "quantity": 400, "clientUuid": "a"}).MustJSON(t, &tick)
	c.Delete("/api/stock/lots/" + itoa(*tick.LotID))
	if r := c.Delete("/api/shopping/ticks?ingredientId=" + itoa(milk) + "&to=2026-11-15"); r.Status != 204 {
		t.Fatalf("untick = %d %s", r.Status, r.Body)
	}
}

func TestUntickExtraTakesBackTheStockTheTickAdded(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seedIngredient(t, env, "milk", "ml")
	var x struct {
		ID int64 `json:"id"`
	}
	c.Post("/api/shopping/extras", map[string]any{"ingredientId": milk, "quantity": 2000}).MustJSON(t, &x)
	c.Post("/api/shopping/extras/"+itoa(x.ID)+"/tick", map[string]any{"quantity": 2000, "clientUuid": "x1"})
	for i := 0; i < 2; i++ {
		if r := c.Delete("/api/shopping/extras/" + itoa(x.ID) + "/tick"); r.Status != 204 && r.Status != 200 {
			t.Fatalf("untick extra %d = %d %s", i, r.Status, r.Body)
		}
	}
	if got := stockOf(t, c, milk); len(got.Lots) != 0 {
		t.Fatalf("Lots = %+v, want none", got.Lots)
	}
}
