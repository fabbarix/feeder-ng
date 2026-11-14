package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Residual atomicity (beta.8 undo review): Untick takes back the Stock, then removes the tick. If removing the tick
// fails after the take-back committed, the tick stays and the Undo is retried; the retry must not take the tick's
// amount a second time from a Lot that was edited up. A SQLite trigger makes the last step fail once.

func failOnce(t *testing.T, env *testkit.Env, trigger string) func() {
	t.Helper()
	if _, err := env.DB.Exec(trigger); err != nil {
		t.Fatal(err)
	}
	return func() {
		if _, err := env.DB.Exec(`DROP TRIGGER test_fail`); err != nil {
			t.Fatal(err)
		}
	}
}

func TestARetriedUntickTakesTheStockBackOnce(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seedIngredient(t, env, "milk", "ml")
	var tick struct {
		LotID *int64 `json:"lotId"`
	}
	c.Post("/api/shopping/ticks", map[string]any{"ingredientId": milk, "to": "2026-11-15", "quantity": 400, "clientUuid": "a"}).MustJSON(t, &tick)
	if r := c.Patch("/api/stock/lots/"+itoa(*tick.LotID), map[string]any{"quantity": 1000}); r.Status != 200 {
		t.Fatalf("edit = %d %s", r.Status, r.Body)
	}
	release := failOnce(t, env, `CREATE TRIGGER test_fail BEFORE DELETE ON shopping_ticks BEGIN SELECT RAISE(ABORT, 'boom'); END`)
	if r := c.Delete("/api/shopping/ticks?ingredientId=" + itoa(milk) + "&to=2026-11-15"); r.Status < 500 {
		t.Fatalf("untick with the tick delete failing = %d %s, want a server error", r.Status, r.Body)
	}
	if got := stockOf(t, c, milk); len(got.Lots) != 1 || got.Lots[0].Quantity != 600 {
		t.Fatalf("after the failed Undo: Lots = %+v, want 600 ml (the take-back committed)", got.Lots)
	}
	release()
	if r := c.Delete("/api/shopping/ticks?ingredientId=" + itoa(milk) + "&to=2026-11-15"); r.Status != 204 {
		t.Fatalf("retried untick = %d %s", r.Status, r.Body)
	}
	if got := stockOf(t, c, milk); len(got.Lots) != 1 || got.Lots[0].Quantity != 600 {
		t.Fatalf("after the retry: Lots = %+v, want still 600 ml (taken back once)", got.Lots)
	}
	var n int
	if err := env.DB.QueryRow(`SELECT count(*) FROM shopping_ticks WHERE ingredient_id = ?`, milk).Scan(&n); err != nil || n != 0 {
		t.Fatalf("ticks = %d, %v; want the tick removed", n, err)
	}
}

func TestARetriedExtraUntickTakesTheStockAndTheGotBackOnce(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seedIngredient(t, env, "milk", "ml")
	var x struct {
		ID int64 `json:"id"`
	}
	c.Post("/api/shopping/extras", map[string]any{"ingredientId": milk, "quantity": 2000}).MustJSON(t, &x)
	if r := c.Post("/api/shopping/extras/"+itoa(x.ID)+"/tick", map[string]any{"quantity": 400, "clientUuid": "x1"}); r.Status != 200 {
		t.Fatalf("tick extra = %d %s", r.Status, r.Body)
	}
	lots := stockOf(t, c, milk).Lots
	if len(lots) != 1 {
		t.Fatalf("Lots = %+v, want the one the extra's tick added", lots)
	}
	if r := c.Patch("/api/stock/lots/"+itoa(lots[0].ID), map[string]any{"quantity": 1000}); r.Status != 200 {
		t.Fatalf("edit = %d %s", r.Status, r.Body)
	}
	release := failOnce(t, env, `CREATE TRIGGER test_fail BEFORE UPDATE OF ticked_on ON shopping_extras
		WHEN NEW.ticked_on IS NULL BEGIN SELECT RAISE(ABORT, 'boom'); END`)
	if r := c.Delete("/api/shopping/extras/" + itoa(x.ID) + "/tick"); r.Status < 500 {
		t.Fatalf("untick with the extra update failing = %d %s, want a server error", r.Status, r.Body)
	}
	release()
	if r := c.Delete("/api/shopping/extras/" + itoa(x.ID) + "/tick"); r.Status != 200 && r.Status != 204 {
		t.Fatalf("retried untick = %d %s", r.Status, r.Body)
	}
	if got := stockOf(t, c, milk); len(got.Lots) != 1 || got.Lots[0].Quantity != 600 {
		t.Fatalf("Lots = %+v, want 600 ml (taken back once)", got.Lots)
	}
	var got float64
	var ticked *string
	if err := env.DB.QueryRow(`SELECT got, ticked_on FROM shopping_extras WHERE id = ?`, x.ID).Scan(&got, &ticked); err != nil {
		t.Fatal(err)
	}
	if got != 0 || ticked != nil {
		t.Fatalf("extra got = %v, ticked_on = %v; want 0 and unticked (400 taken off once)", got, ticked)
	}
}
