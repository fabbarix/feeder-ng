package httpapi_test

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// A change to a Supply clears the go-off dates of its Lots, so the Pantry (which refreshes on the stock topic) is told;
// a change to food, or a patch that keeps the kind, changes no Lot and publishes no stock event.
func TestAKindChangeToSupplyPublishesAStockEvent(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	i := createFood(t, u, "Toilet paper", "piece")
	ch, cancel := env.App.Deps.Events.Subscribe("stock")
	defer cancel()

	stockEvent := func(what string, want bool) {
		t.Helper()
		select {
		case ev := <-ch:
			if !want {
				t.Fatalf("%s published a stock event: %s", what, ev.Data)
			}
			var p struct {
				Changed       string  `json:"changed"`
				IngredientIDs []int64 `json:"ingredientIds"`
			}
			if err := json.Unmarshal(ev.Data, &p); err != nil || p.Changed != "lots" || len(p.IngredientIDs) != 1 || p.IngredientIDs[0] != i.ID {
				t.Errorf("%s: stock event = %s, want {changed: lots, ingredientIds: [%d]}", what, ev.Data, i.ID)
			}
		case <-time.After(300 * time.Millisecond):
			if want {
				t.Fatalf("%s published no stock event", what)
			}
		}
	}

	if r := u.Patch(fmt.Sprintf("/api/ingredients/%d", i.ID), map[string]any{"kind": "food"}); r.Status != 200 {
		t.Fatalf("food to food = %d %s", r.Status, r.Body)
	}
	stockEvent("food to food", false)
	if r := u.Patch(fmt.Sprintf("/api/ingredients/%d", i.ID), map[string]any{"kind": "supply"}); r.Status != 200 {
		t.Fatalf("to supply = %d %s", r.Status, r.Body)
	}
	stockEvent("the change to a Supply", true)
	if r := u.Patch(fmt.Sprintf("/api/ingredients/%d", i.ID), map[string]any{"kind": "food"}); r.Status != 200 {
		t.Fatalf("to food = %d %s", r.Status, r.Body)
	}
	stockEvent("the change to food", false)
}
