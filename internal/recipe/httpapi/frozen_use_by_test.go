package httpapi_test

import (
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B5-LO (plan 2.3 API table): Recipes read and write frozenUseByDays (null = the Household's); 422 validation_failed
// with reason frozen_use_by_invalid outside 1 to 365.

func frozenRecipeBody(t *testing.T, env *testkit.Env, frozen any) map[string]any {
	t.Helper()
	r := env.LoginAdmin(t).Post("/api/ingredients", map[string]any{"name": fmt.Sprintf("salt-%v", frozen), "baseUnit": "g"})
	var ing struct {
		ID int64 `json:"id"`
	}
	if r.Status != 201 || r.JSON(&ing) != nil {
		t.Fatalf("create Ingredient = %d %s", r.Status, r.Body)
	}
	return map[string]any{"name": "Chilli", "yield": 4, "frozenUseByDays": frozen,
		"lines": []map[string]any{{"ingredientId": ing.ID, "quantity": 5, "unit": "g"}}, "steps": []any{}}
}

type frozenRecipe struct {
	ID              int64 `json:"id"`
	FrozenUseByDays *int  `json:"frozenUseByDays"`
}

func TestARecipeKeepsItsFrozenUseByAndMayClearIt(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	body := frozenRecipeBody(t, env, 120)
	r := admin.Post("/api/recipes", body)
	var created frozenRecipe
	if r.Status != 201 || r.JSON(&created) != nil || created.FrozenUseByDays == nil || *created.FrozenUseByDays != 120 {
		t.Fatalf("POST = %d %s, want 201 with frozenUseByDays 120", r.Status, r.Body)
	}
	var got frozenRecipe
	if r := env.LoginUser(t).Get(fmt.Sprintf("/api/recipes/%d", created.ID)); r.JSON(&got) != nil || got.FrozenUseByDays == nil || *got.FrozenUseByDays != 120 {
		t.Errorf("GET = %s, want 120", r.Body)
	}
	body["frozenUseByDays"] = nil
	r = admin.Put(fmt.Sprintf("/api/recipes/%d", created.ID), body)
	var cleared frozenRecipe
	if r.Status != 200 || r.JSON(&cleared) != nil || cleared.FrozenUseByDays != nil {
		t.Errorf("PUT null = %d %s, want 200 with frozenUseByDays null", r.Status, r.Body)
	}
}

func TestARecipeWithoutAFrozenUseByReadsNull(t *testing.T) {
	env := testkit.Start(t)
	body := frozenRecipeBody(t, env, nil)
	delete(body, "frozenUseByDays")
	r := env.LoginAdmin(t).Post("/api/recipes", body)
	var created map[string]any
	if r.Status != 201 || r.JSON(&created) != nil {
		t.Fatalf("POST = %d %s", r.Status, r.Body)
	}
	if v, ok := created["frozenUseByDays"]; !ok || v != nil {
		t.Errorf("frozenUseByDays = %v (present %v), want an explicit null", v, ok)
	}
}

func TestAFrozenUseByOutsideOneToThreeHundredSixtyFiveIsRefused(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	for _, days := range []int{0, -1, 366} {
		r := admin.Post("/api/recipes", frozenRecipeBody(t, env, days))
		var e struct {
			Error struct{ Code, Field, Reason string }
		}
		_ = r.JSON(&e)
		if r.Status != 422 || e.Error.Code != "validation_failed" || e.Error.Field != "frozenUseByDays" || e.Error.Reason != "frozen_use_by_invalid" {
			t.Errorf("%d days = %d %s, want 422 validation_failed on frozenUseByDays, reason frozen_use_by_invalid", days, r.Status, r.Body)
		}
	}
}
