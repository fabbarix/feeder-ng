package httpapi_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-06 (docs/design/ui-review-3): Prices by Shop (SET-02), the typed barcode check (SET-04, SET 1) and the Shop
// impact read for Delete Shop's confirm (SAFE-02). Red until the routes exist.
//
// Pinned shapes:
//   GET /api/shops/{id}/prices  (any User) -> [{"product":{"id","name","image"},"price":{...Price...}}], 404 for an unknown Shop
//   GET /api/shops/{id}/impact  (Admin)    -> {"shopBarcodes":n,"weightBarcodeRules":n,"prices":n}, 404 for an unknown Shop
//   POST /api/products/{id}/barcodes with a bad all-digit code -> 400 invalid_barcode

type shopRow struct {
	ID int64 `json:"id"`
}

type priceRow struct {
	Product struct {
		ID    int64  `json:"id"`
		Name  string `json:"name"`
		Image string `json:"image"`
	} `json:"product"`
	Price struct {
		ShopID            int64  `json:"shopId"`
		Date              string `json:"date"`
		PriceCents        *int   `json:"priceCents"`
		PricePerKgCents   *int   `json:"pricePerKgCents"`
		PricePerKgDerived bool   `json:"pricePerKgDerived"`
	} `json:"price"`
}

func mkShop(t *testing.T, c *testkit.Client, name string) int64 {
	t.Helper()
	var s shopRow
	r := c.Post("/api/shops", map[string]any{"name": name})
	r.MustJSON(t, &s)
	if r.Status != 201 {
		t.Fatalf("create Shop = %d %s", r.Status, r.Body)
	}
	return s.ID
}

func mkIngredient(t *testing.T, env *testkit.Env, name string) int64 {
	t.Helper()
	res, err := env.DB.Exec(`INSERT INTO ingredients (name, name_key, base_unit, created_at, updated_at) VALUES (?, lower(?), 'g', '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`, name, name)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func mkProduct(t *testing.T, c *testkit.Client, name string, ing int64, size float64, codes ...string) int64 {
	t.Helper()
	var p struct {
		ID int64 `json:"id"`
	}
	r := c.Post("/api/products", map[string]any{"name": name, "ingredientId": ing, "packSize": size, "barcodes": codes})
	r.MustJSON(t, &p)
	if r.Status != 201 {
		t.Fatalf("create Product = %d %s", r.Status, r.Body)
	}
	return p.ID
}

func mkPrice(t *testing.T, c *testkit.Client, productID, shopID int64, date string, cents int) {
	t.Helper()
	r := c.Put(fmt.Sprintf("/api/products/%d/prices", productID), map[string]any{"shopId": shopID, "date": date, "priceCents": cents})
	if r.Status != 200 {
		t.Fatalf("record Price = %d %s", r.Status, r.Body)
	}
}

func TestPricesByShopListTheLatestPricesEvenWithoutShopBarcodes(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	coop, aldi := mkShop(t, u, "Coop"), mkShop(t, u, "Aldi")
	ing := mkIngredient(t, env, "butter")
	butter := mkProduct(t, u, "Butter", ing, 250)
	jam := mkProduct(t, u, "Apple jam", ing, 300)
	mkPrice(t, u, butter, coop, "2026-10-01", 350)
	mkPrice(t, u, butter, coop, "2026-11-14", 374)
	mkPrice(t, u, jam, coop, "2026-11-14", 249)
	mkPrice(t, u, butter, aldi, "2026-11-15", 100)

	var rows []priceRow
	r := u.Get(fmt.Sprintf("/api/shops/%d/prices", coop))
	r.MustJSON(t, &rows)
	if r.Status != 200 || len(rows) != 2 {
		t.Fatalf("GET prices = %d %s, want 2 rows", r.Status, r.Body)
	}
	if rows[0].Product.Name != "Apple jam" || rows[1].Product.Name != "Butter" {
		t.Errorf("rows = %s, want sorted by Product name", r.Body)
	}
	b := rows[1]
	if b.Product.ID != butter || b.Price.ShopID != coop || b.Price.Date != "2026-11-14" || b.Price.PriceCents == nil || *b.Price.PriceCents != 374 {
		t.Errorf("Butter row = %+v, want the 14 Nov Price at Coop", b)
	}
	if b.Price.PricePerKgCents == nil || *b.Price.PricePerKgCents != 1496 || !b.Price.PricePerKgDerived {
		t.Errorf("Butter per kg = %+v, want 1496 derived from the 250 g pack", b.Price)
	}
}

func TestPricesByShopOfAShopWithNoPricesIsAnEmptyArray(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	coop := mkShop(t, u, "Coop")
	r := u.Get(fmt.Sprintf("/api/shops/%d/prices", coop))
	if r.Status != 200 || string(r.Body) != "[]" && string(r.Body) != "[]\n" {
		t.Fatalf("GET prices = %d %q, want 200 []", r.Status, r.Body)
	}
}

func TestPricesByShopOfAnUnknownShopIs404AndNeedsASession(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	if r := u.Get("/api/shops/999/prices"); r.Status != 404 || contains(r.Body, "No such API route") {
		t.Errorf("unknown Shop = %d %s, want 404", r.Status, r.Body)
	}
	coop := mkShop(t, u, "Coop")
	if r := env.Anonymous().Get(fmt.Sprintf("/api/shops/%d/prices", coop)); r.Status != 401 {
		t.Errorf("no session = %d, want 401", r.Status)
	}
}

func TestShopImpactCountsWhatDeleteShopTakesWithIt(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	coop := mkShop(t, admin, "Coop")
	empty := mkShop(t, admin, "Empty")
	ing := mkIngredient(t, env, "passata")
	p := mkProduct(t, admin, "Passata", ing, 700)
	mkPrice(t, admin, p, coop, "2026-11-14", 349)
	mkPrice(t, admin, p, coop, "2026-11-10", 329)
	if r := admin.Post(fmt.Sprintf("/api/shops/%d/barcodes", coop), map[string]any{"productId": p, "code": "COOP-PASSATA"}); r.Status != 201 {
		t.Fatalf("Shop Barcode = %d %s", r.Status, r.Body)
	}
	rule := admin.Post(fmt.Sprintf("/api/shops/%d/weight-rules", coop), map[string]any{
		"prefix": "21", "item": map[string]int{"start": 3, "length": 5}, "value": map[string]int{"start": 8, "length": 5}, "valueKind": "weight"})
	if rule.Status != 201 {
		t.Fatalf("Weight Barcode Rule = %d %s", rule.Status, rule.Body)
	}

	var got struct {
		ShopBarcodes       int `json:"shopBarcodes"`
		WeightBarcodeRules int `json:"weightBarcodeRules"`
		Prices             int `json:"prices"`
	}
	r := admin.Get(fmt.Sprintf("/api/shops/%d/impact", coop))
	r.MustJSON(t, &got)
	if r.Status != 200 || got.ShopBarcodes != 1 || got.WeightBarcodeRules != 1 || got.Prices != 2 {
		t.Fatalf("impact = %d %s, want 1 Shop Barcode, 1 Weight Barcode Rule, 2 Prices", r.Status, r.Body)
	}
	r = admin.Get(fmt.Sprintf("/api/shops/%d/impact", empty))
	r.MustJSON(t, &got)
	if r.Status != 200 || got.ShopBarcodes != 0 || got.WeightBarcodeRules != 0 || got.Prices != 0 {
		t.Fatalf("empty Shop impact = %d %s, want all zero", r.Status, r.Body)
	}
	// A read: nothing was deleted.
	if r := admin.Get(fmt.Sprintf("/api/shops/%d/prices", coop)); r.Status != 200 {
		t.Errorf("Shop gone after the impact read: %d", r.Status)
	}
}

func TestShopImpactOfAnUnknownShopIs404(t *testing.T) {
	env := testkit.Start(t)
	if r := env.LoginAdmin(t).Get("/api/shops/999/impact"); r.Status != 404 || contains(r.Body, "No such API route") {
		t.Fatalf("got %d %s, want 404", r.Status, r.Body)
	}
}

func TestATypedBarcodeOfTheWrongLengthOrCheckDigitIsRefusedByTheServer(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	ing := mkIngredient(t, env, "passata")
	p := mkProduct(t, u, "Passata", ing, 700)
	for _, code := range []string{"123", "12345678901", "8001234567890"} {
		r := u.Post(fmt.Sprintf("/api/products/%d/barcodes", p), map[string]any{"code": code})
		if r.Status != 400 || !contains(r.Body, `"invalid_barcode"`) {
			t.Errorf("add %q = %d %s, want 400 invalid_barcode", code, r.Status, r.Body)
		}
	}
	for _, code := range []string{"4006381333931", "PRIVATE-77"} {
		if r := u.Post(fmt.Sprintf("/api/products/%d/barcodes", p), map[string]any{"code": code}); r.Status != 201 {
			t.Errorf("add %q = %d %s, want 201", code, r.Status, r.Body)
		}
	}
	r := u.Post("/api/products", map[string]any{"name": "Rice", "ingredientId": ing, "packSize": 1000, "barcodes": []string{"123"}})
	if r.Status != 400 || !contains(r.Body, `"invalid_barcode"`) {
		t.Errorf("create with %q = %d %s, want 400 invalid_barcode", "123", r.Status, r.Body)
	}
}

func contains(b []byte, s string) bool {
	return strings.Contains(string(b), s)
}
