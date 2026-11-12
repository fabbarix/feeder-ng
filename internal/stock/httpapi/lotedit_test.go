package httpapi_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Beta.5 ST: PATCH and DELETE /api/stock/lots/{id}. The test clock says 2026-11-09. The `lot` type and `seed` helper
// are in httpapi_test.go.

type editedLot struct {
	lot
	StoragePlaceID *int64 `json:"storagePlaceId"`
	ShelfLifeDays  *int   `json:"shelfLifeDays"`
}

func addThighs(t *testing.T, c *testkit.Client, thighs int64, qty float64, purchased string) lot {
	t.Helper()
	var l lot
	r := c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": qty, "purchased": purchased})
	r.MustJSON(t, &l)
	if r.Status != 201 {
		t.Fatalf("add = %d %s", r.Status, r.Body)
	}
	return l
}

func TestLotEditRoutesRequireSignIn(t *testing.T) {
	env := testkit.Start(t)
	anon := env.Anonymous()
	for _, rt := range []struct{ method, path string }{{"PATCH", "/api/stock/lots/1"}, {"DELETE", "/api/stock/lots/1"}} {
		r := anon.Do(rt.method, rt.path, map[string]any{"quantity": 1})
		if r.Status != http.StatusUnauthorized || r.ErrorCode() != "unauthenticated" {
			t.Errorf("%s %s = %d %s", rt.method, rt.path, r.Status, r.Body)
		}
	}
}

func TestPatchLotCorrectsTheQuantity(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	l := addThighs(t, c, thighs, 800, "2026-11-08")
	var got editedLot
	r := c.Patch(fmt.Sprintf("/api/stock/lots/%d", l.ID), map[string]any{"quantity": 650})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.ID != l.ID || got.Quantity != 650 || got.Purchased != "2026-11-08" ||
		got.GoesOff == nil || *got.GoesOff != "2026-11-12" || got.IngredientName != "chicken thighs" {
		t.Fatalf("patch = %d %s", r.Status, r.Body)
	}
	var list struct{ Lots []lot }
	c.Get("/api/stock/lots").MustJSON(t, &list)
	if len(list.Lots) != 1 || list.Lots[0].Quantity != 650 {
		t.Fatalf("lots = %s", c.Get("/api/stock/lots").Body)
	}
}

func TestPatchLotBoughtOnSuggestsGoodUntilUnlessGivenToo(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	l := addThighs(t, c, thighs, 800, "2026-11-05")
	path := fmt.Sprintf("/api/stock/lots/%d", l.ID)

	var got editedLot
	r := c.Patch(path, map[string]any{"purchased": "2026-11-08"})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Purchased != "2026-11-08" || got.GoesOff == nil || *got.GoesOff != "2026-11-12" {
		t.Fatalf("suggested = %d %s", r.Status, r.Body)
	}
	r = c.Patch(path, map[string]any{"purchased": "2026-11-07", "goesOff": "2026-11-20"})
	got = editedLot{}
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Purchased != "2026-11-07" || got.GoesOff == nil || *got.GoesOff != "2026-11-20" {
		t.Fatalf("given = %d %s", r.Status, r.Body)
	}
}

func TestPatchLotNullGoesOffClearsItAndAbsentLeavesIt(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seed(t, env, "milk", "ml", nil)
	var l lot
	c.Post("/api/stock/lots", map[string]any{"ingredientId": milk, "quantity": 800, "purchased": "2026-11-08"}).MustJSON(t, &l)
	path := fmt.Sprintf("/api/stock/lots/%d", l.ID)

	var got editedLot
	r := c.Patch(path, map[string]any{"goesOff": "2026-11-12"})
	if r.Status != 200 {
		t.Fatalf("give a go-off date = %d %s", r.Status, r.Body)
	}
	r = c.Patch(path, map[string]any{"quantity": 700})
	r.MustJSON(t, &got)
	if got.GoesOff == nil || *got.GoesOff != "2026-11-12" {
		t.Fatalf("absent goesOff changed it: %s", r.Body)
	}
	got = editedLot{}
	r = c.Patch(path, map[string]any{"goesOff": nil})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.GoesOff != nil || got.Spoiled || got.UseSoon {
		t.Fatalf("null goesOff = %d %s", r.Status, r.Body)
	}
}

func TestPatchLotGoodUntilMovesTheSpoiledFlag(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	l := addThighs(t, c, thighs, 800, "2026-11-01") // good until 11-05: gone off
	path := fmt.Sprintf("/api/stock/lots/%d", l.ID)
	var sp struct{ Lots []lot }
	c.Get("/api/stock/spoiled").MustJSON(t, &sp)
	if len(sp.Lots) != 1 {
		t.Fatalf("setup: spoiled = %v", sp.Lots)
	}
	var got editedLot
	r := c.Patch(path, map[string]any{"goesOff": "2026-11-15"})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Spoiled {
		t.Fatalf("later = %d %s", r.Status, r.Body)
	}
	sp.Lots = nil
	c.Get("/api/stock/spoiled").MustJSON(t, &sp)
	if len(sp.Lots) != 0 {
		t.Fatalf("spoiled after the edit = %v", sp.Lots)
	}
	got = editedLot{}
	r = c.Patch(path, map[string]any{"goesOff": "2026-11-08"})
	r.MustJSON(t, &got)
	if r.Status != 200 || !got.Spoiled {
		t.Fatalf("earlier = %d %s", r.Status, r.Body)
	}
}

func TestPatchLotValidates(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	l := addThighs(t, c, thighs, 800, "2026-11-08")
	path := fmt.Sprintf("/api/stock/lots/%d", l.ID)
	for name, body := range map[string]map[string]any{
		"empty body":                        {},
		"zero quantity":                     {"quantity": 0},
		"negative quantity":                 {"quantity": -5},
		"bought after today":                {"purchased": "2026-11-10"},
		"bought not a date":                 {"purchased": "last week"},
		"good until not date":               {"goesOff": "soon"},
		"good until before bought on":       {"goesOff": "2026-11-01"},
		"bought null":                       {"purchased": nil},
		"good until null with a Shelf Life": {"goesOff": nil},
	} {
		r := c.Patch(path, body)
		if r.Status != 422 || r.ErrorCode() != "validation_failed" {
			t.Errorf("%s = %d %s, want 422 validation_failed", name, r.Status, r.Body)
		}
	}
	if r := c.Patch(path, "{not json"); r.Status != 400 {
		t.Errorf("bad json = %d", r.Status)
	}
	var list struct{ Lots []lot }
	c.Get("/api/stock/lots").MustJSON(t, &list)
	if list.Lots[0].Quantity != 800 || list.Lots[0].Purchased != "2026-11-08" {
		t.Errorf("a refused edit changed the Lot: %+v", list.Lots[0])
	}
}

func TestPatchLotUnknownIs404(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	for _, path := range []string{"/api/stock/lots/4242", "/api/stock/lots/abc"} {
		if r := c.Patch(path, map[string]any{"quantity": 5}); r.Status != 404 || r.ErrorCode() != "not_found" {
			t.Errorf("PATCH %s = %d %s", path, r.Status, r.Body)
		}
		if r := c.Delete(path); r.Status != 404 || r.ErrorCode() != "not_found" {
			t.Errorf("DELETE %s = %d %s", path, r.Status, r.Body)
		}
	}
}

func TestPatchDoesNotMoveALot(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	var place struct {
		ID int64 `json:"id"`
	}
	c.Post("/api/storage-places", map[string]any{"name": "Garage Fridge", "kind": "fridge"}).MustJSON(t, &place)
	var l editedLot
	c.Post("/api/stock/lots", map[string]any{"ingredientId": thighs, "quantity": 800, "purchased": "2026-11-08", "storagePlaceId": place.ID}).MustJSON(t, &l)
	var other struct {
		ID int64 `json:"id"`
	}
	c.Post("/api/storage-places", map[string]any{"name": "Cellar", "kind": "pantry"}).MustJSON(t, &other)
	var got editedLot
	r := c.Patch(fmt.Sprintf("/api/stock/lots/%d", l.ID), map[string]any{"quantity": 700, "storagePlaceId": other.ID})
	r.MustJSON(t, &got)
	if r.Status != 200 && r.Status != 400 && r.Status != 422 { // ignored or refused, never applied
		t.Fatalf("patch = %d %s", r.Status, r.Body)
	}
	if r.Status == 200 && (got.StoragePlaceID == nil || *got.StoragePlaceID != place.ID) {
		t.Fatalf("Storage Place changed by an edit (Move to does that): %s", r.Body)
	}
}

func TestLotsCarryTheShelfLifeThatApplies(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	milk := seed(t, env, "milk", "ml", nil)
	addThighs(t, c, thighs, 800, "2026-11-08")
	c.Post("/api/stock/lots", map[string]any{"ingredientId": milk, "quantity": 1000})
	var list struct{ Lots []editedLot }
	c.Get("/api/stock/lots").MustJSON(t, &list)
	for _, l := range list.Lots {
		switch l.IngredientName {
		case "chicken thighs":
			if l.ShelfLifeDays == nil || *l.ShelfLifeDays != 4 {
				t.Errorf("thighs shelfLifeDays = %v, want 4", l.ShelfLifeDays)
			}
		case "milk":
			if l.ShelfLifeDays != nil {
				t.Errorf("milk shelfLifeDays = %v, want null", *l.ShelfLifeDays)
			}
		}
	}
}

func TestDeleteLotIsNoWasteAndNoGoOff(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	gone := addThighs(t, c, thighs, 800, "2026-11-01") // gone off
	addThighs(t, c, thighs, 200, "2026-11-08")
	r := c.Delete(fmt.Sprintf("/api/stock/lots/%d", gone.ID))
	if r.Status != 204 {
		t.Fatalf("delete = %d %s", r.Status, r.Body)
	}
	var list struct{ Lots []lot }
	c.Get("/api/stock/lots").MustJSON(t, &list)
	if len(list.Lots) != 1 || list.Lots[0].Quantity != 200 {
		t.Fatalf("lots = %+v", list.Lots)
	}
	var waste struct{ Records []map[string]any }
	c.Get("/api/stock/waste").MustJSON(t, &waste)
	if len(waste.Records) != 0 {
		t.Fatalf("waste = %+v, want none", waste.Records)
	}
	var n int
	if err := env.DB.QueryRow(`SELECT COUNT(*) FROM stock_go_offs`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("stock_go_offs = %d (%v), want none", n, err)
	}
	if r := c.Delete(fmt.Sprintf("/api/stock/lots/%d", gone.ID)); r.Status != 404 {
		t.Errorf("second delete = %d", r.Status)
	}
}

// The 422 body names the field and the reason (plan 2.6): {"error":{"code":"validation_failed","message",
// "field","reason"}}.
func TestPatchLotValidationNamesFieldAndReason(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	thighs := seed(t, env, "chicken thighs", "g", 4)
	l := addThighs(t, c, thighs, 800, "2026-11-08")
	path := fmt.Sprintf("/api/stock/lots/%d", l.ID)
	for name, tc := range map[string]struct {
		body          map[string]any
		field, reason string
	}{
		"zero quantity":                        {map[string]any{"quantity": 0}, "quantity", "quantity_invalid"},
		"negative quantity":                    {map[string]any{"quantity": -2}, "quantity", "quantity_invalid"},
		"bought after today":                   {map[string]any{"purchased": "2026-11-10"}, "purchased", "purchased_future"},
		"good until before bought":             {map[string]any{"goesOff": "2026-11-01"}, "goesOff", "goes_off_before_purchase"},
		"good until before the new bought on":  {map[string]any{"purchased": "2026-11-09", "goesOff": "2026-11-08"}, "goesOff", "goes_off_before_purchase"},
		"good until cleared with a Shelf Life": {map[string]any{"goesOff": nil}, "goesOff", "goes_off_required"},
	} {
		r := c.Patch(path, tc.body)
		var b struct {
			Error struct {
				Code    string `json:"code"`
				Message string `json:"message"`
				Field   string `json:"field"`
				Reason  string `json:"reason"`
			} `json:"error"`
		}
		_ = r.JSON(&b)
		if r.Status != 422 || b.Error.Code != "validation_failed" || b.Error.Field != tc.field || b.Error.Reason != tc.reason || b.Error.Message == "" {
			t.Errorf("%s = %d %s, want 422 validation_failed field %s reason %s", name, r.Status, r.Body, tc.field, tc.reason)
		}
	}
}
