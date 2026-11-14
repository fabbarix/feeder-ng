package httpapi_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-06, SAFE-02: the Ingredient impact read for Delete Ingredient's confirm ("It is on no Recipe, Product or Shopping
// List."). Red until the route exists.
//
// Pinned shape: GET /api/ingredients/{id}/impact (any User) -> {"references":{<what refers to it>:n},"total":n}.
// "references" is the same map the Ingredient detail serves (the ReferenceMovers' names, only counts above 0).
// 404 for an unknown Ingredient. It never changes anything.

type impactJSON struct {
	References map[string]int `json:"references"`
	Total      int            `json:"total"`
}

func TestAnIngredientOnNothingHasAnEmptyImpact(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	id := plainIngredient(t, env, "Temp Ingredient", "g")
	var got impactJSON
	r := u.Get(fmt.Sprintf("/api/ingredients/%d/impact", id))
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Total != 0 || len(got.References) != 0 {
		t.Fatalf("impact = %d %s, want 200 with no references", r.Status, r.Body)
	}
	if r := u.Get(fmt.Sprintf("/api/ingredients/%d", id)); r.Status != 200 {
		t.Errorf("the Ingredient is gone after a read: %d", r.Status)
	}
}

func TestAnIngredientImpactCountsItsProducts(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	id := plainIngredient(t, env, "Passata", "g")
	for _, name := range []string{"Mutti 700 g", "Own brand 500 g"} {
		if r := u.Post("/api/products", map[string]any{"name": name, "ingredientId": id, "packSize": 700}); r.Status != 201 {
			t.Fatalf("create Product = %d %s", r.Status, r.Body)
		}
	}
	var got impactJSON
	r := u.Get(fmt.Sprintf("/api/ingredients/%d/impact", id))
	r.MustJSON(t, &got)
	if r.Status != 200 || got.References["products"] != 2 || got.Total != 2 {
		t.Fatalf("impact = %d %s, want 2 products, total 2", r.Status, r.Body)
	}
	// The same counts the detail serves, so the confirm and the refusal never disagree.
	var detail struct {
		References map[string]int `json:"references"`
	}
	u.Get(fmt.Sprintf("/api/ingredients/%d", id)).MustJSON(t, &detail)
	if detail.References["products"] != got.References["products"] {
		t.Errorf("detail references %v, impact %v", detail.References, got.References)
	}
}

func TestAnIngredientImpactOfAnUnknownIngredientIs404(t *testing.T) {
	env := testkit.Start(t)
	r := env.LoginUser(t).Get("/api/ingredients/999/impact")
	if r.Status != 404 || strings.Contains(string(r.Body), "No such API route") {
		t.Fatalf("got %d %s, want 404 for the Ingredient (the route must exist)", r.Status, r.Body)
	}
}
