package httpapi_test

import (
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// BR-B (docs/dev/design/base-recipes.md §10, §16): the Ingredient routes and Base recipe Ingredients. The Ingredient
// store reads no Recipe table; the module wires the Base recipe port at mount. Red until it does.

type baseIngredient struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	BaseUnit   string `json:"baseUnit"`
	BaseRecipe *struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		Archived bool   `json:"archived"`
	} `json:"baseRecipe"`
	Conversions []conversionJSONTest `json:"conversions"`
}

type conversionJSONTest struct {
	Unit   string  `json:"unit"`
	ToBase float64 `json:"toBase"`
}

type errBody struct {
	Error struct {
		Code   string   `json:"code"`
		Reason string   `json:"reason"`
		Path   []string `json:"path"`
	} `json:"error"`
}

func seedBase(t *testing.T, env *testkit.Env, user *testkit.Client, name string, lines []any) (recipeID, ingredientID int64) {
	t.Helper()
	r := user.Post("/api/recipes", map[string]any{"name": name, "yield": 1, "yieldUnit": "l", "baseRecipe": true, "lines": lines, "tags": []string{}})
	var out struct {
		ID               int64 `json:"id"`
		BaseIngredientID int64 `json:"baseIngredientId"`
	}
	r.MustJSON(t, &out)
	if r.Status != 201 || out.BaseIngredientID == 0 {
		t.Fatalf("create Base recipe %s = %d %s", name, r.Status, r.Body)
	}
	return out.ID, out.BaseIngredientID
}

func plainIngredient(t *testing.T, env *testkit.Env, name, base string) int64 {
	t.Helper()
	res, err := env.DB.Exec(`INSERT INTO ingredients (name, name_key, base_unit, created_at, updated_at) VALUES (?, lower(?), ?, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`, name, name, base)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func TestListAndDetailSayWhichBaseRecipeAnIngredientBelongsTo(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	recipeID, ing := seedBase(t, env, user, "Béchamel", []any{})
	milk := plainIngredient(t, env, "milk", "ml")

	var one baseIngredient
	r := user.Get(fmt.Sprintf("/api/ingredients/%d", ing))
	r.MustJSON(t, &one)
	if r.Status != 200 || one.BaseRecipe == nil || one.BaseRecipe.ID != recipeID || one.BaseRecipe.Name != "Béchamel" || one.BaseRecipe.Archived {
		t.Fatalf("detail = %d %s, want baseRecipe {id, name, archived}", r.Status, r.Body)
	}
	var plain baseIngredient
	user.Get(fmt.Sprintf("/api/ingredients/%d", milk)).MustJSON(t, &plain)
	if plain.BaseRecipe != nil {
		t.Errorf("a plain Ingredient has baseRecipe null, got %+v", plain.BaseRecipe)
	}
	var all []baseIngredient
	user.Get("/api/ingredients").MustJSON(t, &all)
	found := false
	for _, i := range all {
		if i.ID == ing {
			found = i.BaseRecipe != nil && i.BaseRecipe.ID == recipeID
		} else if i.ID == milk && i.BaseRecipe != nil {
			t.Error("milk listed as a Base recipe's Ingredient")
		}
	}
	if !found {
		t.Errorf("list = %+v, want the Base recipe's Ingredient with baseRecipe", all)
	}
	// The batch conversion the store keeps is part of the Ingredient.
	hasBatch := false
	for _, c := range one.Conversions {
		hasBatch = hasBatch || (c.Unit == "batch" && c.ToBase == 1000)
	}
	if !hasBatch {
		t.Errorf("conversions = %+v, want batch = 1000", one.Conversions)
	}
}

func TestARenameOfABaseRecipesIngredientIs409AndTellsYouToRenameTheBaseRecipe(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	_, ing := seedBase(t, env, user, "Béchamel", []any{})
	r := user.Patch(fmt.Sprintf("/api/ingredients/%d", ing), map[string]any{"name": "White sauce"})
	if r.Status != 409 || r.ErrorCode() != "base_recipe_ingredient" {
		t.Errorf("rename = %d %s, want 409 base_recipe_ingredient", r.Status, r.Body)
	}
	if r := user.Patch(fmt.Sprintf("/api/ingredients/%d", ing), map[string]any{"shelfLifeDays": 4}); r.Status != 200 {
		t.Errorf("Shelf Life stays editable: %d %s", r.Status, r.Body)
	}
}

func TestDeletingABaseRecipesIngredientIs409InUse(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	_, ing := seedBase(t, env, user, "Béchamel", []any{})
	r := user.Delete(fmt.Sprintf("/api/ingredients/%d", ing))
	if r.Status != 409 || r.ErrorCode() != "in_use" {
		t.Errorf("delete = %d %s, want 409 in_use", r.Status, r.Body)
	}
}

func TestMergingABaseRecipesIngredientAwayIs409AndMergingIntoItIsAllowed(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	_, ing := seedBase(t, env, user, "Béchamel", []any{})
	old := plainIngredient(t, env, "white sauce", "ml")

	away := user.Post(fmt.Sprintf("/api/ingredients/%d/merge", ing), map[string]any{"into": old})
	if away.Status != 409 || away.ErrorCode() != "base_recipe_ingredient" {
		t.Errorf("merge away = %d %s, want 409 base_recipe_ingredient", away.Status, away.Body)
	}
	preview := user.Get(fmt.Sprintf("/api/ingredients/%d/merge-preview?into=%d", ing, old))
	if preview.Status != 409 || preview.ErrorCode() != "base_recipe_ingredient" {
		t.Errorf("merge preview away = %d %s", preview.Status, preview.Body)
	}
	into := user.Post(fmt.Sprintf("/api/ingredients/%d/merge", old), map[string]any{"into": ing})
	var got baseIngredient
	into.MustJSON(t, &got)
	if into.Status != 200 || got.ID != ing || got.BaseRecipe == nil {
		t.Errorf("merge into = %d %s, want the Base recipe's Ingredient back", into.Status, into.Body)
	}
}

func TestMergingIntoABaseRecipesIngredientThatWouldMakeACycleIs422WithThePath(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	white := plainIngredient(t, env, "white sauce", "ml")
	rouxID, _ := seedBase(t, env, user, "Roux", []any{map[string]any{"ingredientId": white, "quantity": 100, "unit": "ml"}})
	_, bechIng := seedBase(t, env, user, "Béchamel", []any{map[string]any{"baseRecipeId": rouxID, "quantity": 100, "unit": "ml"}})
	r := user.Post(fmt.Sprintf("/api/ingredients/%d/merge", white), map[string]any{"into": bechIng})
	var e errBody
	r.MustJSON(t, &e)
	if r.Status != 422 || e.Error.Code != "validation_failed" || e.Error.Reason != "base_recipe_cycle" || len(e.Error.Path) != 3 || e.Error.Path[0] != "Roux" {
		t.Errorf("merge = %d %s, want 422 base_recipe_cycle with the path [Roux Béchamel Roux]", r.Status, r.Body)
	}
}

func TestTheBatchConversionOfABaseRecipesIngredientIsReadOnly(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	_, ing := seedBase(t, env, user, "Béchamel", []any{})
	put := user.Put(fmt.Sprintf("/api/ingredients/%d/conversions/batch", ing), map[string]any{"toBase": 500})
	if put.Status != 409 || put.ErrorCode() != "base_recipe_ingredient" {
		t.Errorf("PUT batch = %d %s, want 409 base_recipe_ingredient (Set by the Base recipe)", put.Status, put.Body)
	}
	del := user.Delete(fmt.Sprintf("/api/ingredients/%d/conversions/batch", ing))
	if del.Status != 409 || del.ErrorCode() != "base_recipe_ingredient" {
		t.Errorf("DELETE batch = %d %s", del.Status, del.Body)
	}
	if ok := user.Put(fmt.Sprintf("/api/ingredients/%d/conversions/jar", ing), map[string]any{"toBase": 400}); ok.Status != 200 {
		t.Errorf("another Unit Conversion = %d %s, want it editable", ok.Status, ok.Body)
	}
}

func TestAPlainIngredientOfABaseRecipesNameCanBeCreatedAndSearchFindsItExactly(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	_, bechIng := seedBase(t, env, user, "Béchamel", []any{})
	r := user.Post("/api/ingredients", map[string]any{"name": "béchamel", "baseUnit": "ml"})
	var plain baseIngredient
	r.MustJSON(t, &plain)
	if r.Status != 201 || plain.ID == bechIng {
		t.Fatalf("create = %d %s, want a separate plain Ingredient", r.Status, r.Body)
	}
	var res struct {
		Exact       *baseIngredient `json:"exact"`
		Suggestions []struct {
			Ingredient baseIngredient `json:"ingredient"`
		} `json:"suggestions"`
	}
	user.Get("/api/ingredients/search?q=b%C3%A9chamel").MustJSON(t, &res)
	if res.Exact == nil || res.Exact.ID != plain.ID {
		t.Errorf("exact = %+v, want the plain Ingredient %d, never a Base recipe's through the plain key", res.Exact, plain.ID)
	}
	listed := false
	for _, s := range res.Suggestions {
		listed = listed || (s.Ingredient.ID == bechIng && s.Ingredient.BaseRecipe != nil)
	}
	if !listed {
		t.Errorf("suggestions = %+v, want the Base recipe's Ingredient too, with its baseRecipe (the picker shows both)", res.Suggestions)
	}
}
