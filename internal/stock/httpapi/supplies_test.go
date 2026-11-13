package httpapi_test

import (
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// H4 (docs/dev/design/household-items.md §4.2, §5.3), pinned here:
//
//   - every Stock Lot JSON (GET /api/stock/lots, POST /api/stock/lots, PATCH /api/stock/lots/{id}, GET
//     /api/stock/spoiled) and every GET /api/stock row carries "kind": "food" | "supply".
//   - A Supply's Lot never has a go-off date. The server IGNORES a go-off date for it instead of refusing (the plan's §4
//     says "goes_off is always null" and the web hides the field; offline clients that still send one must not fail):
//     PATCH /api/stock/lots/{id} with a "goesOff" answers 200 with "goesOff": null; the Shelf Life suggestion is not used
//     either, so a stray shelf_life_days on a Supply row (data from before it was a Supply) never gives a Lot a date.
//   - Used up is no new API (§4.2): the whole Lot is DELETE /api/stock/lots/{id}, part of it PATCH with the new
//     quantity. Neither records waste.

func seedSupply(t *testing.T, env *testkit.Env, name, base string, strayShelfLife any) int64 {
	t.Helper()
	res, err := env.DB.Exec(`INSERT INTO ingredients (name, name_key, base_unit, kind, shelf_life_days, created_at, updated_at)
		VALUES (?, ?, ?, 'supply', ?, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`, name, name, base, strayShelfLife)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

type kindLot struct {
	lot
	Kind string `json:"kind"`
}

func TestStockLotsAndTotalsCarryKind(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seed(t, env, "milk", "ml", nil)
	paper := seedSupply(t, env, "Toilet paper", "piece", nil)
	var added, addedSupply kindLot
	c.Post("/api/stock/lots", map[string]any{"ingredientId": milk, "quantity": 1000, "purchased": "2026-11-08"}).MustJSON(t, &added)
	r := c.Post("/api/stock/lots", map[string]any{"ingredientId": paper, "quantity": 9, "purchased": "2026-11-08"})
	r.MustJSON(t, &addedSupply)
	if r.Status != 201 || added.Kind != "food" || addedSupply.Kind != "supply" {
		t.Fatalf("add: kinds %q / %q, %d %s", added.Kind, addedSupply.Kind, r.Status, r.Body)
	}
	var list struct{ Lots []kindLot }
	c.Get("/api/stock/lots").MustJSON(t, &list)
	got := map[int64]string{}
	for _, l := range list.Lots {
		got[l.IngredientID] = l.Kind
	}
	if len(list.Lots) != 2 || got[milk] != "food" || got[paper] != "supply" {
		t.Fatalf("lots = %s", c.Get("/api/stock/lots").Body)
	}
	var one struct{ Lots []kindLot }
	c.Get(fmt.Sprintf("/api/stock/lots?ingredientId=%d", paper)).MustJSON(t, &one)
	if len(one.Lots) != 1 || one.Lots[0].Kind != "supply" {
		t.Fatalf("lots of the Supply = %+v", one.Lots)
	}
	var tot struct {
		Ingredients []struct {
			IngredientID int64  `json:"ingredientId"`
			Kind         string `json:"kind"`
		} `json:"ingredients"`
	}
	c.Get("/api/stock").MustJSON(t, &tot)
	kinds := map[int64]string{}
	for _, i := range tot.Ingredients {
		kinds[i.IngredientID] = i.Kind
	}
	if len(tot.Ingredients) != 2 || kinds[milk] != "food" || kinds[paper] != "supply" {
		t.Fatalf("totals = %s", c.Get("/api/stock").Body)
	}
}

func TestPatchingASupplysLotAnswersItsKind(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper := seedSupply(t, env, "Toilet paper", "piece", nil)
	var l lot
	c.Post("/api/stock/lots", map[string]any{"ingredientId": paper, "quantity": 9, "purchased": "2026-11-08"}).MustJSON(t, &l)
	var got kindLot
	r := c.Patch(fmt.Sprintf("/api/stock/lots/%d", l.ID), map[string]any{"quantity": 6})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Kind != "supply" || got.Quantity != 6 {
		t.Fatalf("patch = %d %s", r.Status, r.Body)
	}
}

func TestASupplysLotGetsNoGoOffDateFromLotEdit(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper := seedSupply(t, env, "Toilet paper", "piece", nil)
	var l lot
	c.Post("/api/stock/lots", map[string]any{"ingredientId": paper, "quantity": 9, "purchased": "2026-11-08"}).MustJSON(t, &l)
	path := fmt.Sprintf("/api/stock/lots/%d", l.ID)
	var got kindLot
	r := c.Patch(path, map[string]any{"goesOff": "2026-11-20"})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.GoesOff != nil || got.Spoiled || got.UseSoon {
		t.Fatalf("a go-off date on a Supply's Lot = %d %s, want it ignored (200, goesOff null)", r.Status, r.Body)
	}
	got = kindLot{}
	r = c.Patch(path, map[string]any{"goesOff": "2026-11-20", "quantity": 5, "purchased": "2026-11-01"})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.GoesOff != nil || got.Quantity != 5 || got.Purchased != "2026-11-01" {
		t.Fatalf("the rest of the edit still applies: %d %s", r.Status, r.Body)
	}
	var list struct{ Lots []kindLot }
	c.Get("/api/stock/lots").MustJSON(t, &list)
	if len(list.Lots) != 1 || list.Lots[0].GoesOff != nil {
		t.Fatalf("the stored Lot = %+v, want no go-off date", list.Lots)
	}
}

func TestChangingThePurchaseDateOfASupplysLotDoesNotSuggestAGoOffDate(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper := seedSupply(t, env, "Toilet paper", "piece", 30) // a stray Shelf Life, from before it was a Supply
	var l lot
	c.Post("/api/stock/lots", map[string]any{"ingredientId": paper, "quantity": 9, "purchased": "2026-11-08"}).MustJSON(t, &l)
	var got kindLot
	r := c.Patch(fmt.Sprintf("/api/stock/lots/%d", l.ID), map[string]any{"purchased": "2026-11-05"})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.GoesOff != nil {
		t.Fatalf("patch = %d %s, want goesOff null", r.Status, r.Body)
	}
}

func TestAddToStockGivesASupplyNoGoOffDateWhateverIsSentOrStored(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper := seedSupply(t, env, "Toilet paper", "piece", 30)
	var got kindLot
	r := c.Post("/api/stock/lots", map[string]any{"ingredientId": paper, "quantity": 9, "purchased": "2026-11-08", "goesOff": "2026-12-01"})
	r.MustJSON(t, &got)
	if r.Status != 201 || got.GoesOff != nil || got.Spoiled || got.UseSoon {
		t.Fatalf("add = %d %s, want a Lot with no go-off date", r.Status, r.Body)
	}
}

func TestSetTotalOnASupplyCreatesLotsWithNoGoOffDate(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper := seedSupply(t, env, "Toilet paper", "piece", 30)
	if r := c.Put(fmt.Sprintf("/api/stock/ingredients/%d/total", paper), map[string]any{"total": 12}); r.Status != 200 {
		t.Fatalf("set total = %d %s", r.Status, r.Body)
	}
	var list struct{ Lots []kindLot }
	c.Get("/api/stock/lots").MustJSON(t, &list)
	if len(list.Lots) != 1 || list.Lots[0].Quantity != 12 || list.Lots[0].GoesOff != nil {
		t.Fatalf("lots = %+v, want one Lot of 12 with no go-off date", list.Lots)
	}
}

func TestFoodStillGetsItsGoOffDate(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	var got kindLot
	c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 800, "purchased": "2026-11-08"}).MustJSON(t, &got)
	if got.GoesOff == nil || *got.GoesOff != "2026-11-12" || got.Kind != "food" {
		t.Fatalf("food Lot = %+v, want good until 2026-11-12", got)
	}
}

// Used up (§4.2, decision D7): no new API. Whole: DELETE; part: PATCH with the new quantity. Never waste.
func TestUsedUpAWholeSupplyLotIsADeleteAndIsNotWaste(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper := seedSupply(t, env, "Toilet paper", "piece", nil)
	var l lot
	c.Post("/api/stock/lots", map[string]any{"ingredientId": paper, "quantity": 9, "purchased": "2026-11-08"}).MustJSON(t, &l)
	if r := c.Delete(fmt.Sprintf("/api/stock/lots/%d", l.ID)); r.Status != 204 {
		t.Fatalf("delete = %d %s", r.Status, r.Body)
	}
	var list struct{ Lots []kindLot }
	c.Get("/api/stock/lots").MustJSON(t, &list)
	var waste struct{ Records []map[string]any }
	c.Get("/api/stock/waste").MustJSON(t, &waste)
	if len(list.Lots) != 0 || len(waste.Records) != 0 {
		t.Fatalf("lots %+v, waste %+v; want none of either", list.Lots, waste.Records)
	}
}

func TestUsedUpPartOfASupplyLotIsAPatchOfTheQuantityAndIsNotWaste(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper := seedSupply(t, env, "Toilet paper", "piece", nil)
	var l lot
	c.Post("/api/stock/lots", map[string]any{"ingredientId": paper, "quantity": 9, "purchased": "2026-11-08"}).MustJSON(t, &l)
	var got kindLot
	r := c.Patch(fmt.Sprintf("/api/stock/lots/%d", l.ID), map[string]any{"quantity": 7})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Quantity != 7 || got.Kind != "supply" || got.GoesOff != nil {
		t.Fatalf("patch = %d %s", r.Status, r.Body)
	}
	var tot struct {
		Ingredients []struct {
			Total float64 `json:"total"`
		} `json:"ingredients"`
	}
	c.Get("/api/stock").MustJSON(t, &tot)
	var waste struct{ Records []map[string]any }
	c.Get("/api/stock/waste").MustJSON(t, &waste)
	if len(tot.Ingredients) != 1 || tot.Ingredients[0].Total != 7 || len(waste.Records) != 0 {
		t.Fatalf("totals %s, waste %+v; want 7 pieces and no waste", c.Get("/api/stock").Body, waste.Records)
	}
}

// §4.2 "a Freezer move changes nothing": moving a Supply's Lot, whole or part, into a Freezer and back out never gives
// it a go-off date, even with a stray Shelf Life on the row.
func TestMovingASupplysLotNeverGivesItAGoOffDate(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	paper := seedSupply(t, env, "Toilet paper", "piece", 30)
	var freezer, cupboard struct {
		ID int64 `json:"id"`
	}
	c.Post("/api/storage-places", map[string]any{"name": "Chest freezer", "kind": "freezer"}).MustJSON(t, &freezer)
	c.Post("/api/storage-places", map[string]any{"name": "Utility cupboard", "kind": "pantry"}).MustJSON(t, &cupboard)
	var l lot
	c.Post("/api/stock/lots", map[string]any{"ingredientId": paper, "quantity": 9, "purchased": "2026-11-08"}).MustJSON(t, &l)
	moves := []struct {
		place    int64
		quantity float64
	}{{freezer.ID, 4}, {freezer.ID, 0}, {cupboard.ID, 0}}
	for _, m := range moves {
		var got kindLot
		r := c.Post(fmt.Sprintf("/api/stock/lots/%d/move", l.ID), map[string]any{"storagePlaceId": m.place, "quantity": m.quantity})
		r.MustJSON(t, &got)
		if r.Status != 200 || got.GoesOff != nil || got.Kind != "supply" {
			t.Fatalf("move to %d (%v) = %d %s, want goesOff null", m.place, m.quantity, r.Status, r.Body)
		}
	}
	var list struct{ Lots []kindLot }
	c.Get("/api/stock/lots").MustJSON(t, &list)
	for _, got := range list.Lots {
		if got.GoesOff != nil {
			t.Fatalf("lots = %+v, want none with a go-off date", list.Lots)
		}
	}
}
