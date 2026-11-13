package httpapi_test

import (
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// BR-B round 3, section 17: deleting a Base recipe whose Ingredient keeps Stock or Products while a plain Ingredient
// already holds the name is refused with 409 ingredient_name_taken, naming that Ingredient so the dialog can offer the
// merge, as to-plannable does. Nothing changes when it is refused.

func addLot(t *testing.T, env *testkit.Env, ingredientID int64) {
	t.Helper()
	mustExec(t, env, `INSERT INTO stock_lots(ingredient_id, quantity, purchased, source, created_at) VALUES (?, 500, '2026-11-01', 'manual', '2026-11-01T00:00:00Z')`, ingredientID)
}

func TestDeletingABaseRecipeWhoseIngredientKeepsStockWhileAPlainIngredientHoldsTheNameIs409IngredientNameTaken(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", nil))
	addLot(t, env, bech.BaseIngredientID)
	plain := ingredient(t, env, "béchamel", "ml")

	r := user.Delete(fmt.Sprintf("/api/recipes/%d", bech.ID))
	var e richRefusal
	r.MustJSON(t, &e)
	if r.Status != 409 || e.Error.Code != "ingredient_name_taken" || e.Error.Ingredient.ID != plain || e.Error.Ingredient.Name != "béchamel" {
		t.Fatalf("delete = %d %s, want 409 ingredient_name_taken naming the plain Ingredient", r.Status, r.Body)
	}
	got := user.Get(fmt.Sprintf("/api/recipes/%d", bech.ID))
	var out baseRecipeOut
	got.MustJSON(t, &out)
	if got.Status != 200 || !out.BaseRecipe || out.BaseIngredientID != bech.BaseIngredientID {
		t.Errorf("after the refusal the Base recipe is still there: %d %s", got.Status, got.Body)
	}
	if n := count(t, env, `SELECT count(*) FROM stock_lots WHERE ingredient_id = ?`, bech.BaseIngredientID); n != 1 {
		t.Errorf("Stock lots = %d, want the one it had", n)
	}
	if n := count(t, env, `SELECT count(*) FROM ingredients WHERE id = ?`, plain); n != 1 {
		t.Error("the plain Ingredient is untouched")
	}
}

func TestDeletingABaseRecipeWhoseIngredientKeepsProductsIsRefusedTheSameWay(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", nil))
	mustExec(t, env, `INSERT INTO products(name, ingredient_id, pack_size, created_at, updated_at) VALUES ('Jar of béchamel', ?, 400, 't', 't')`, bech.BaseIngredientID)
	plain := ingredient(t, env, "béchamel", "ml")
	r := user.Delete(fmt.Sprintf("/api/recipes/%d", bech.ID))
	var e richRefusal
	r.MustJSON(t, &e)
	if r.Status != 409 || e.Error.Code != "ingredient_name_taken" || e.Error.Ingredient.ID != plain {
		t.Fatalf("delete = %d %s, want 409 ingredient_name_taken", r.Status, r.Body)
	}
}

func TestDeletingABaseRecipeSucceedsOnceThePlainIngredientIsGoneOrWhenNothingIsKept(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)

	// Nothing kept: the Ingredient goes with the Base recipe, so the plain Ingredient's name is not in the way.
	roux := mustCreate(t, user, baseBody("Roux", 300, "g", nil))
	ingredient(t, env, "roux", "g")
	if r := user.Delete(fmt.Sprintf("/api/recipes/%d", roux.ID)); r.Status != 204 {
		t.Errorf("delete with nothing kept = %d %s, want 204", r.Status, r.Body)
	}

	// Kept, name held: refused; after the plain Ingredient is gone it works and the Ingredient stays as an ordinary one.
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", nil))
	addLot(t, env, bech.BaseIngredientID)
	plain := ingredient(t, env, "béchamel", "ml")
	if r := user.Delete(fmt.Sprintf("/api/recipes/%d", bech.ID)); r.Status != 409 {
		t.Fatalf("delete = %d %s, want 409", r.Status, r.Body)
	}
	mustExec(t, env, `DELETE FROM ingredients WHERE id = ?`, plain)
	if r := user.Delete(fmt.Sprintf("/api/recipes/%d", bech.ID)); r.Status != 204 {
		t.Fatalf("delete after the plain Ingredient is gone = %d %s, want 204", r.Status, r.Body)
	}
	if n := count(t, env, `SELECT count(*) FROM ingredients WHERE id = ? AND name_key = 'béchamel'`, bech.BaseIngredientID); n != 1 {
		t.Error("the kept Ingredient takes the plain key back")
	}
}

func TestDeletingABaseRecipeCalledForStaysBaseRecipeInUseBeforeTheNameIsLookedAt(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", nil))
	mustCreate(t, user, map[string]any{"name": "Lasagne", "yield": 4, "lines": []any{baseLineOf(bech.ID, 500, "ml")}})
	addLot(t, env, bech.BaseIngredientID)
	ingredient(t, env, "béchamel", "ml")
	r := user.Delete(fmt.Sprintf("/api/recipes/%d", bech.ID))
	var e richRefusal
	r.MustJSON(t, &e)
	if r.Status != 409 || e.Error.Code != "base_recipe_in_use" {
		t.Errorf("delete = %d %s, want 409 base_recipe_in_use first", r.Status, r.Body)
	}
}
