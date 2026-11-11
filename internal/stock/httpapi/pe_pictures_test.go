package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// PE: Stock rows (GET /api/stock) carry the Ingredient's Picture URL, always present: "/api/images/<id>" or "".

func TestStockRowsCarryTheIngredientPicture(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	flour := seed(t, env, "flour", "g", nil)
	salt := seed(t, env, "salt", "g", nil)
	const img = "0123456789abcdef0123456789abcdef"
	if _, err := env.DB.Exec(`UPDATE ingredients SET image = ? WHERE id = ?`, img, flour); err != nil {
		t.Fatal(err)
	}
	for _, id := range []int64{flour, salt} {
		if r := c.Post("/api/stock/lots", map[string]any{"ingredientId": id, "quantity": 500, "purchased": "2026-11-09"}); r.Status != 201 {
			t.Fatalf("lot = %d %s", r.Status, r.Body)
		}
	}
	var got struct {
		Ingredients []struct {
			Name     string  `json:"name"`
			ImageURL *string `json:"imageUrl"`
		} `json:"ingredients"`
	}
	c.Get("/api/stock").MustJSON(t, &got)
	if len(got.Ingredients) != 2 {
		t.Fatalf("rows = %+v", got)
	}
	want := map[string]string{"flour": "/api/images/" + img, "salt": ""}
	for _, row := range got.Ingredients {
		if row.ImageURL == nil || *row.ImageURL != want[row.Name] {
			t.Errorf("row %q imageUrl = %v, want %q", row.Name, row.ImageURL, want[row.Name])
		}
	}
}
