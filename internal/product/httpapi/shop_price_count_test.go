package httpapi_test

import (
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-30 (SET-14b): GET /api/shops carries `priceCount`, the number of DISTINCT Products with a Price at the Shop, so the Shops list can
// say "12 Prices · Location saved" without one request per Shop. Red until the Shops query counts them.
//
// Pinned shape: every Shop of GET /api/shops has "priceCount": integer, 0 when the Shop has no Price; a Product with several Prices at the
// Shop (a history) counts once; another Shop's Prices never count; an archived Product's Prices are not counted (the Shop page lists none
// of them either: GET /api/shops/{id}/prices leaves archived Products out).

type shopWithCount struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	PriceCount *int   `json:"priceCount"`
}

func priceCounts(t *testing.T, c *testkit.Client) map[string]int {
	t.Helper()
	var rows []shopWithCount
	r := c.Get("/api/shops")
	r.MustJSON(t, &rows)
	if r.Status != 200 {
		t.Fatalf("GET /api/shops = %d %s", r.Status, r.Body)
	}
	out := map[string]int{}
	for _, s := range rows {
		if s.PriceCount == nil {
			t.Fatalf("Shop %q has no priceCount: %s", s.Name, r.Body)
		}
		out[s.Name] = *s.PriceCount
	}
	return out
}

func TestShopsListCountsDistinctProductsWithAPrice(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	coop, aldi, _ := mkShop(t, u, "Coop"), mkShop(t, u, "Aldi"), mkShop(t, u, "Lidl")
	ing := mkIngredient(t, env, "butter")
	butter := mkProduct(t, u, "Butter", ing, 250)
	jam := mkProduct(t, u, "Apple jam", ing, 300)
	mkPrice(t, u, butter, coop, "2026-10-01", 350)
	mkPrice(t, u, butter, coop, "2026-11-14", 374)
	mkPrice(t, u, jam, coop, "2026-11-14", 249)
	mkPrice(t, u, butter, aldi, "2026-11-15", 100)

	got := priceCounts(t, u)
	if got["Coop"] != 2 || got["Aldi"] != 1 || got["Lidl"] != 0 {
		t.Errorf("priceCount = %v, want Coop 2 (Butter twice counts once), Aldi 1, Lidl 0", got)
	}
}

func TestShopsListLeavesOutPricesOfArchivedProducts(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	coop := mkShop(t, u, "Coop")
	ing := mkIngredient(t, env, "butter")
	butter := mkProduct(t, u, "Butter", ing, 250)
	jam := mkProduct(t, u, "Apple jam", ing, 300)
	mkPrice(t, u, butter, coop, "2026-11-14", 374)
	mkPrice(t, u, jam, coop, "2026-11-14", 249)
	if r := u.Post(fmt.Sprintf("/api/products/%d/archive", jam), map[string]any{}); r.Status != 200 {
		t.Fatalf("archive = %d %s", r.Status, r.Body)
	}
	if got := priceCounts(t, u); got["Coop"] != 1 {
		t.Errorf("priceCount = %v, want Coop 1 (the archived Product's Price is not counted)", got)
	}
}
