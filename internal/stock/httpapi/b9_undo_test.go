package httpapi_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-05: POST /api/stock/waste/{id}/undo (SAFE-09), POST /api/stock/lots/{id}/keep with {goodUntil} (SSP-17) and
// POST /api/stock/lots/put-away (SSP-10). The test clock says 2026-11-09. The `lot` type and `seed` are in httpapi_test.go.

func throwOutOld(t *testing.T, c *testkit.Client, thighs int64) (lotID, wasteID int64) {
	t.Helper()
	l := addThighs(t, c, thighs, 200, "2026-11-01") // goes off 11-05
	var rec struct {
		ID int64 `json:"id"`
	}
	r := c.Post(fmt.Sprintf("/api/stock/lots/%d/throw-out", l.ID), nil)
	r.MustJSON(t, &rec)
	if r.Status != 200 || rec.ID == 0 {
		t.Fatalf("throw out = %d %s", r.Status, r.Body)
	}
	return l.ID, rec.ID
}

func TestUndoThrowOutPutsTheLotBackAndTheWasteGoes(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	lotID, wasteID := throwOutOld(t, c, thighs)

	var back lot
	r := c.Post(fmt.Sprintf("/api/stock/waste/%d/undo", wasteID), nil)
	r.MustJSON(t, &back)
	if r.Status != 200 || back.ID != lotID || back.Quantity != 200 || back.Purchased != "2026-11-01" ||
		back.GoesOff == nil || *back.GoesOff != "2026-11-05" || !back.Spoiled {
		t.Fatalf("undo = %d %s", r.Status, r.Body)
	}
	var waste struct {
		Records []struct{} `json:"records"`
	}
	c.Get("/api/stock/waste").MustJSON(t, &waste)
	if len(waste.Records) != 0 {
		t.Errorf("waste = %s, want none", c.Get("/api/stock/waste").Body)
	}
	var sp struct {
		Lots []lot `json:"lots"`
	}
	c.Get("/api/stock/spoiled").MustJSON(t, &sp)
	if len(sp.Lots) != 1 || sp.Lots[0].ID != lotID {
		t.Errorf("spoiled = %+v, want the Lot back in Throw out or keep?", sp)
	}
}

func TestUndoThrowOutErrors(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	if r := c.Post("/api/stock/waste/9999/undo", nil); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("unknown = %d %s", r.Status, r.Body)
	}
	if r := c.Post("/api/stock/waste/abc/undo", nil); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("bad id = %d %s", r.Status, r.Body)
	}
	_, wasteID := throwOutOld(t, c, thighs)
	if r := c.Post(fmt.Sprintf("/api/stock/waste/%d/undo", wasteID), nil); r.Status != 200 {
		t.Fatalf("first undo = %d %s", r.Status, r.Body)
	}
	if r := c.Post(fmt.Sprintf("/api/stock/waste/%d/undo", wasteID), nil); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("second undo = %d %s, want 404 (the waste is gone)", r.Status, r.Body)
	}
}

func TestUndoThrowOutIsRefusedTheNextDay(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	_, wasteID := throwOutOld(t, c, thighs)
	env.Clock.Advance(24 * time.Hour)
	r := c.Post(fmt.Sprintf("/api/stock/waste/%d/undo", wasteID), nil)
	if r.Status != 409 || r.ErrorCode() != "undo_window_over" {
		t.Fatalf("next day = %d %s, want 409 undo_window_over", r.Status, r.Body)
	}
	var waste struct {
		Records []struct{} `json:"records"`
	}
	c.Get("/api/stock/waste").MustJSON(t, &waste)
	if len(waste.Records) != 1 {
		t.Errorf("waste = %s, want the record kept", c.Get("/api/stock/waste").Body)
	}
}

func TestKeepWithAGoodUntilDate(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	l := addThighs(t, c, thighs, 200, "2026-10-01") // off 10-05: five weeks overdue
	path := fmt.Sprintf("/api/stock/lots/%d/keep", l.ID)

	if r := c.Post(path, map[string]any{"goodUntil": "2026-11-08"}); r.Status != 422 || r.ErrorCode() != "validation_failed" {
		t.Errorf("a date before today = %d %s, want 422 validation_failed", r.Status, r.Body)
	}
	if r := c.Post(path, map[string]any{"goodUntil": "soon"}); r.Status != 422 || r.ErrorCode() != "validation_failed" {
		t.Errorf("nonsense = %d %s", r.Status, r.Body)
	}
	var kept lot
	r := c.Post(path, map[string]any{"goodUntil": "2026-11-12"})
	r.MustJSON(t, &kept)
	if r.Status != 200 || kept.GoesOff == nil || *kept.GoesOff != "2026-11-12" || kept.Spoiled {
		t.Fatalf("keep until = %d %s", r.Status, r.Body)
	}
}

func TestKeepWithNoBodyIsGoodUntilTodayAndLeavesTheTile(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	l := addThighs(t, c, thighs, 200, "2026-10-01")
	var kept lot
	r := c.Post(fmt.Sprintf("/api/stock/lots/%d/keep", l.ID), nil)
	r.MustJSON(t, &kept)
	if r.Status != 200 || kept.GoesOff == nil || *kept.GoesOff != "2026-11-09" || kept.Spoiled {
		t.Fatalf("keep = %d %s", r.Status, r.Body)
	}
	var sp struct {
		Lots []lot `json:"lots"`
	}
	c.Get("/api/stock/spoiled").MustJSON(t, &sp)
	if len(sp.Lots) != 0 {
		t.Errorf("spoiled = %+v, want none until tomorrow", sp)
	}
	env.Clock.Advance(24 * time.Hour)
	c.Get("/api/stock/spoiled").MustJSON(t, &sp)
	if len(sp.Lots) != 1 {
		t.Errorf("the next day spoiled = %+v, want the Lot back", sp)
	}
}

type placed struct {
	lot
	StoragePlaceID *int64 `json:"storagePlaceId"`
}

type putAwayResult struct {
	Lots    []placed `json:"lots"`
	Skipped []int64  `json:"skipped"`
}

func newPlace(t *testing.T, c *testkit.Client, name, kind string) int64 {
	t.Helper()
	var p struct {
		ID int64 `json:"id"`
	}
	c.Post("/api/storage-places", map[string]any{"name": name, "kind": kind}).MustJSON(t, &p)
	return p.ID
}

func TestPutAwayMovesTheLotsInOneRequest(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	milk := seed(t, env, "milk", "ml", nil)
	a := addThighs(t, c, thighs, 300, "2026-11-08")
	b := addThighs(t, c, milk, 1000, "2026-11-08")
	fridge := newPlace(t, c, "Kitchen Fridge", "fridge")
	pantry := newPlace(t, c, "Pantry", "pantry")

	var res putAwayResult
	r := c.Post("/api/stock/lots/put-away", map[string]any{"moves": []map[string]any{
		{"lotId": a.ID, "storagePlaceId": fridge}, {"lotId": b.ID, "storagePlaceId": pantry},
	}})
	r.MustJSON(t, &res)
	if r.Status != 200 || len(res.Lots) != 2 || len(res.Skipped) != 0 {
		t.Fatalf("put away = %d %s", r.Status, r.Body)
	}
	for _, l := range res.Lots {
		want := fridge
		if l.ID == b.ID {
			want = pantry
		}
		if l.StoragePlaceID == nil || *l.StoragePlaceID != want {
			t.Errorf("Lot %d in %v, want %d", l.ID, l.StoragePlaceID, want)
		}
	}
	// "Goes where it was last put": the next milk goes to the Pantry.
	next := placed{}
	c.Post("/api/stock/lots", map[string]any{"ingredientId": milk, "quantity": 500}).MustJSON(t, &next)
	if next.StoragePlaceID == nil || *next.StoragePlaceID != pantry {
		t.Errorf("next Lot of milk in %v, want Pantry", next.StoragePlaceID)
	}
}

func TestPutAwayIsAllOrNoneAndSaysWhatIsWrong(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	a := addThighs(t, c, thighs, 300, "2026-11-08")
	fridge := newPlace(t, c, "Kitchen Fridge", "fridge")

	r := c.Post("/api/stock/lots/put-away", map[string]any{"moves": []map[string]any{
		{"lotId": a.ID, "storagePlaceId": fridge}, {"lotId": a.ID + 100, "storagePlaceId": fridge}}})
	if r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("unknown Lot = %d %s", r.Status, r.Body)
	}
	r = c.Post("/api/stock/lots/put-away", map[string]any{"moves": []map[string]any{{"lotId": a.ID, "storagePlaceId": 9999}}})
	if r.Status != 422 || r.ErrorCode() != "validation_failed" {
		t.Errorf("unknown Storage Place = %d %s", r.Status, r.Body)
	}
	r = c.Post("/api/stock/lots/put-away", map[string]any{"moves": []any{}})
	if r.Status != 422 || r.ErrorCode() != "validation_failed" {
		t.Errorf("no moves = %d %s", r.Status, r.Body)
	}
	var list struct {
		Lots []placed `json:"lots"`
	}
	c.Get("/api/stock/lots").MustJSON(t, &list)
	if len(list.Lots) != 1 || list.Lots[0].StoragePlaceID != nil {
		t.Errorf("a refused put-away moved something: %s", c.Get("/api/stock/lots").Body)
	}
}

func TestPutAwayReportsALotSortedMeanwhileAsSkipped(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	fridge := newPlace(t, c, "Kitchen Fridge", "fridge")
	pantry := newPlace(t, c, "Pantry", "pantry")
	var sorted placed
	c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 300, "purchased": "2026-11-08", "storagePlaceId": pantry}).MustJSON(t, &sorted)
	var res putAwayResult
	r := c.Post("/api/stock/lots/put-away", map[string]any{"moves": []map[string]any{{"lotId": sorted.ID, "storagePlaceId": fridge}}})
	r.MustJSON(t, &res)
	if r.Status != 200 || len(res.Lots) != 0 || len(res.Skipped) != 1 || res.Skipped[0] != sorted.ID {
		t.Fatalf("put away = %d %s", r.Status, r.Body)
	}
}
