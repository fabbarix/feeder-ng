package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// PE: Ingredient search options (exact and suggestions) already carry imageUrl; this pins it, the Ingredient pickers depend on it.

func TestIngredientSearchResultsCarryThePicture(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	id := upload(t, u)
	u.Post("/api/ingredients", map[string]any{"name": "Flour", "baseUnit": "g", "image": id})
	var res struct {
		Exact       *pictured `json:"exact"`
		Suggestions []struct {
			Ingredient pictured `json:"ingredient"`
		} `json:"suggestions"`
	}
	u.Get("/api/ingredients/search?q=Flour").MustJSON(t, &res)
	if res.Exact == nil || res.Exact.ImageURL != "/api/images/"+id {
		t.Errorf("exact = %+v", res.Exact)
	}
	u.Get("/api/ingredients/search?q=Flou").MustJSON(t, &res)
	if len(res.Suggestions) == 0 || res.Suggestions[0].Ingredient.ImageURL != "/api/images/"+id {
		t.Errorf("suggestions = %+v", res.Suggestions)
	}
}
