package httpapi_test

import (
	"encoding/json"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-23, ruling 5: a tick from before migration 1560 kept its Stock Lot but not the quantity it added. Migration 1576
// makes it an addition with a NULL quantity. The list says `tick.added: null` and the addition's `quantity: null` (not
// known), and Take back (PATCH quantity 0) takes what is left of the Lot, as Undo did in beta.8.
func TestALegacyTickWithALotButNoQuantitySaysAddedNullAndTakeBackTakesWhatIsLeft(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	var lot struct {
		ID int64 `json:"id"`
	}
	if r := c.Post("/api/stock/lots", map[string]any{"ingredientId": rice, "quantity": 400}); r.Status != 201 && r.Status != 200 {
		t.Fatalf("add Lot = %d %s", r.Status, r.Body)
	} else {
		r.MustJSON(t, &lot)
	}
	if r := c.Patch("/api/stock/lots/"+itoa(lot.ID), map[string]any{"quantity": 150}); r.Status != 200 { // a Cooked meal used 250
		t.Fatalf("use = %d %s", r.Status, r.Body)
	}
	if _, err := env.DB.Exec(`INSERT INTO shopping_ticks(range_to,ingredient_id,needed,by,ticked_at)
		VALUES ('2026-11-15',?,300,'hand','2026-11-09T10:00:00Z')`, rice); err != nil {
		t.Fatal(err)
	}
	if _, err := env.DB.Exec(`INSERT INTO shopping_tick_additions(range_to,ingredient_id,by,lot_id,quantity,covers,ticked_at)
		VALUES ('2026-11-15',?,'hand',?,NULL,300,'2026-11-09T10:00:00Z')`, rice, lot.ID); err != nil {
		t.Fatal(err)
	}

	r := c.Get("/api/shopping/list")
	var raw struct {
		Lines []map[string]json.RawMessage `json:"lines"`
	}
	r.MustJSON(t, &raw)
	if len(raw.Lines) != 1 {
		t.Fatalf("lines = %s", r.Body)
	}
	var tick struct {
		By        string                       `json:"by"`
		Added     *float64                     `json:"added"`
		Additions []map[string]json.RawMessage `json:"additions"`
	}
	if err := json.Unmarshal(raw.Lines[0]["tick"], &tick); err != nil || tick.By != "hand" || tick.Added != nil || len(tick.Additions) != 1 {
		t.Fatalf("tick = %s (%v); want by hand, added null and one addition", raw.Lines[0]["tick"], err)
	}
	if q := string(tick.Additions[0]["quantity"]); q != "null" {
		t.Errorf("addition quantity = %s, want null (not known)", q)
	}

	var got struct {
		LotID    *int64  `json:"lotId"`
		Quantity float64 `json:"quantity"`
	}
	p := patchTick(c, rice, 0, "")
	p.MustJSON(t, &got)
	if p.Status != 200 || got.LotID != nil || got.Quantity != 0 {
		t.Fatalf("Take back = %d %s; want quantity 0 and no Lot", p.Status, p.Body)
	}
	if lots := stockOf(t, c, rice); len(lots.Lots) != 0 {
		t.Errorf("Lots = %+v, want the 150 left taken back", lots.Lots)
	}
	v, _ := listAs(t, c)
	if l := lineOf(t, v, rice); !l.Ticked || l.Tick == nil || l.Tick.Added != nil {
		t.Errorf("Line %+v Tick %+v; want still ticked, nothing added", l, l.Tick)
	}
}
