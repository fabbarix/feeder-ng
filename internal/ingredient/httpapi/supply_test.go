package httpapi_test

import (
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Supplies in the Ingredient API (ADR 0017, docs/dev/design/household-items.md §5.3): `kind` and `restockLevel` on
// every Ingredient, `?kind=` on the list and on search, the 422 and 409 refusals, the merge block. Red until the
// routes have them.
//
// Errors pinned here:
//   422 validation_failed, reason supply_has_shelf_life, field shelfLifeDays | frozenShelfLifeDays  (a Supply with a Shelf Life)
//   422 validation_failed, reason restock_level_on_food, field restockLevel                         (a food with a Restock level)
//   400 invalid_ingredient                                                                         (unknown kind, level <= 0)
//   400 bad_request                                                                                (?kind= with another value)
//   409 kind_in_use, error.reasons = ["recipe_lines" | "exclusions" | "base_recipe", ...]          (kind change to supply refused)
//   409 kind_differs                                                                               (merge across kinds)
//   409 name_taken                                                                                 (a name is unique across both kinds)

type supplyJSON struct {
	ID                  int64    `json:"id"`
	Name                string   `json:"name"`
	BaseUnit            string   `json:"baseUnit"`
	Kind                string   `json:"kind"`
	RestockLevel        *float64 `json:"restockLevel"`
	ShelfLifeDays       *int     `json:"shelfLifeDays"`
	FrozenShelfLifeDays *int     `json:"frozenShelfLifeDays"`
}

type refusal struct {
	Error struct {
		Code    string   `json:"code"`
		Reason  string   `json:"reason"`
		Field   string   `json:"field"`
		Reasons []string `json:"reasons"`
	} `json:"error"`
}

func createSupply(t *testing.T, c *testkit.Client, name, base string, level any) supplyJSON {
	t.Helper()
	body := map[string]any{"name": name, "baseUnit": base, "kind": "supply"}
	if level != nil {
		body["restockLevel"] = level
	}
	r := c.Post("/api/ingredients", body)
	var out supplyJSON
	r.MustJSON(t, &out)
	if r.Status != 201 {
		t.Fatalf("create Supply %s = %d %s", name, r.Status, r.Body)
	}
	return out
}

func createFood(t *testing.T, c *testkit.Client, name, base string) supplyJSON {
	t.Helper()
	r := c.Post("/api/ingredients", map[string]any{"name": name, "baseUnit": base})
	var out supplyJSON
	r.MustJSON(t, &out)
	if r.Status != 201 {
		t.Fatalf("create %s = %d %s", name, r.Status, r.Body)
	}
	return out
}

func wantRefusal(t *testing.T, what string, r *testkit.Response, status int, code, reason, field string) refusal {
	t.Helper()
	var e refusal
	r.MustJSON(t, &e)
	if r.Status != status || e.Error.Code != code || e.Error.Reason != reason || e.Error.Field != field {
		t.Fatalf("%s = %d %s, want %d %s reason %q field %q", what, r.Status, r.Body, status, code, reason, field)
	}
	return e
}

func TestAnIngredientIsFoodByDefaultAndSaysSoInEveryRead(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	milk := createFood(t, u, "milk", "ml")
	if milk.Kind != "food" || milk.RestockLevel != nil {
		t.Fatalf("created = %+v, want kind food, restockLevel null", milk)
	}
	var raw map[string]any
	u.Get(fmt.Sprintf("/api/ingredients/%d", milk.ID)).MustJSON(t, &raw)
	if v, ok := raw["restockLevel"]; !ok || v != nil {
		t.Errorf("detail restockLevel = %v (present %v), want null", v, ok)
	}
	if raw["kind"] != "food" {
		t.Errorf("detail kind = %v, want food", raw["kind"])
	}
	var all []supplyJSON
	u.Get("/api/ingredients").MustJSON(t, &all)
	if len(all) != 1 || all[0].Kind != "food" {
		t.Errorf("list = %+v, want one food Ingredient", all)
	}
}

func TestCreateASupplyWithARestockLevel(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	s := createSupply(t, u, "Toilet paper", "piece", 9)
	if s.Kind != "supply" || s.RestockLevel == nil || *s.RestockLevel != 9 || s.ShelfLifeDays != nil || s.FrozenShelfLifeDays != nil {
		t.Fatalf("created = %+v", s)
	}
	var back supplyJSON
	u.Get(fmt.Sprintf("/api/ingredients/%d", s.ID)).MustJSON(t, &back)
	if back.Kind != "supply" || back.RestockLevel == nil || *back.RestockLevel != 9 {
		t.Errorf("detail = %+v", back)
	}
	bags := createSupply(t, u, "Bin bags", "piece", nil)
	if bags.RestockLevel != nil {
		t.Errorf("a Supply without a level has restockLevel %v, want null", bags.RestockLevel)
	}
}

func TestACreateOfASupplyWithAShelfLifeIs422(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	for _, field := range []string{"shelfLifeDays", "frozenShelfLifeDays"} {
		r := u.Post("/api/ingredients", map[string]any{"name": "soap " + field, "baseUnit": "piece", "kind": "supply", field: 30})
		wantRefusal(t, "Supply with "+field, r, 422, "validation_failed", "supply_has_shelf_life", field)
	}
	var all []supplyJSON
	u.Get("/api/ingredients").MustJSON(t, &all)
	if len(all) != 0 {
		t.Errorf("refused creates left %d Ingredients", len(all))
	}
}

func TestARestockLevelOnFoodIs422(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	r := u.Post("/api/ingredients", map[string]any{"name": "rice", "baseUnit": "g", "restockLevel": 500})
	wantRefusal(t, "create food with a level", r, 422, "validation_failed", "restock_level_on_food", "restockLevel")
	rice := createFood(t, u, "rice", "g")
	r = u.Patch(fmt.Sprintf("/api/ingredients/%d", rice.ID), map[string]any{"restockLevel": 500})
	wantRefusal(t, "patch food with a level", r, 422, "validation_failed", "restock_level_on_food", "restockLevel")
	r = u.Post("/api/ingredients", map[string]any{"name": "rice 2", "baseUnit": "g", "kind": "food", "restockLevel": 500})
	wantRefusal(t, "create explicit food with a level", r, 422, "validation_failed", "restock_level_on_food", "restockLevel")
}

func TestAnUnknownKindAndAnImpossibleLevelAre400(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	for name, body := range map[string]map[string]any{
		"unknown kind":   {"name": "x", "baseUnit": "g", "kind": "item"},
		"empty kind":     {"name": "x", "baseUnit": "g", "kind": ""},
		"zero level":     {"name": "x", "baseUnit": "piece", "kind": "supply", "restockLevel": 0},
		"negative level": {"name": "x", "baseUnit": "piece", "kind": "supply", "restockLevel": -2},
	} {
		if r := u.Post("/api/ingredients", body); r.Status != 400 || r.ErrorCode() != "invalid_ingredient" {
			t.Errorf("%s = %d %s, want 400 invalid_ingredient", name, r.Status, r.Body)
		}
	}
}

func TestPatchTheRestockLevelOfASupply(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	s := createSupply(t, u, "Batteries", "piece", nil)
	path := fmt.Sprintf("/api/ingredients/%d", s.ID)
	var got supplyJSON
	r := u.Patch(path, map[string]any{"restockLevel": 4})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.RestockLevel == nil || *got.RestockLevel != 4 {
		t.Fatalf("set = %d %s", r.Status, r.Body)
	}
	r = u.Patch(path, map[string]any{"name": "AA batteries"})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.RestockLevel == nil || *got.RestockLevel != 4 || got.Name != "AA batteries" {
		t.Errorf("rename = %d %s, want the level kept (absent = unchanged)", r.Status, r.Body)
	}
	r = u.Patch(path, map[string]any{"restockLevel": nil})
	got = supplyJSON{}
	r.MustJSON(t, &got)
	if r.Status != 200 || got.RestockLevel != nil {
		t.Errorf("clear = %d %s, want restockLevel null (presence-aware, like shelfLifeDays)", r.Status, r.Body)
	}
	if r := u.Patch(path, map[string]any{"restockLevel": 0}); r.Status != 400 || r.ErrorCode() != "invalid_ingredient" {
		t.Errorf("level 0 = %d %s, want 400 invalid_ingredient", r.Status, r.Body)
	}
}

func TestAShelfLifeOnASupplyIs422OnPatch(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	s := createSupply(t, u, "Dish soap", "ml", nil)
	r := u.Patch(fmt.Sprintf("/api/ingredients/%d", s.ID), map[string]any{"shelfLifeDays": 30})
	wantRefusal(t, "Shelf Life on a Supply", r, 422, "validation_failed", "supply_has_shelf_life", "shelfLifeDays")
	r = u.Patch(fmt.Sprintf("/api/ingredients/%d", s.ID), map[string]any{"frozenShelfLifeDays": 30})
	wantRefusal(t, "Frozen Shelf Life on a Supply", r, 422, "validation_failed", "supply_has_shelf_life", "frozenShelfLifeDays")
	food := createFood(t, u, "milk", "ml")
	r = u.Patch(fmt.Sprintf("/api/ingredients/%d", food.ID), map[string]any{"kind": "supply", "shelfLifeDays": 3})
	wantRefusal(t, "to supply with a Shelf Life in one patch", r, 422, "validation_failed", "supply_has_shelf_life", "shelfLifeDays")
}

func TestListFiltersByKind(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	createFood(t, u, "milk", "ml")
	createSupply(t, u, "Bin bags", "piece", nil)
	createFood(t, u, "apple", "piece")
	createSupply(t, u, "AA batteries", "piece", 4)
	names := func(q string) []string {
		var got []supplyJSON
		r := u.Get("/api/ingredients" + q)
		r.MustJSON(t, &got)
		if r.Status != 200 {
			t.Fatalf("GET %s = %d %s", q, r.Status, r.Body)
		}
		out := []string{}
		for _, i := range got {
			out = append(out, i.Name)
		}
		return out
	}
	eq := func(what string, got, want []string) {
		t.Helper()
		if fmt.Sprint(got) != fmt.Sprint(want) {
			t.Errorf("%s = %v, want %v", what, got, want)
		}
	}
	eq("?kind=food", names("?kind=food"), []string{"apple", "milk"})
	eq("?kind=supply", names("?kind=supply"), []string{"AA batteries", "Bin bags"})
	eq("no kind", names(""), []string{"AA batteries", "apple", "Bin bags", "milk"})
	eq("?kind=supply&q=bat", names("?kind=supply&q=bat"), []string{"AA batteries"})
	eq("?kind=food&q=bat", names("?kind=food&q=bat"), []string{})
	if r := u.Get("/api/ingredients?kind=item"); r.Status != 400 || r.ErrorCode() != "bad_request" {
		t.Errorf("?kind=item = %d %s, want 400 bad_request", r.Status, r.Body)
	}
}

func TestSearchFiltersByKind(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	createFood(t, u, "tomato", "piece")
	createSupply(t, u, "Tomato cleaner", "ml", nil)
	var both, food, supply struct {
		Exact       *supplyJSON `json:"exact"`
		Suggestions []struct {
			Ingredient supplyJSON `json:"ingredient"`
		} `json:"suggestions"`
	}
	u.Get("/api/ingredients/search?q=tomato%20cleaner").MustJSON(t, &both)
	if both.Exact == nil || both.Exact.Kind != "supply" {
		t.Errorf("both kinds: exact = %+v, want the Supply (New Ingredient's Did you mean searches both)", both.Exact)
	}
	u.Get("/api/ingredients/search?q=tomato%20cleaner&kind=food").MustJSON(t, &food)
	if food.Exact != nil {
		t.Errorf("kind=food: exact = %+v, want none", food.Exact)
	}
	for _, s := range food.Suggestions {
		if s.Ingredient.Kind != "food" {
			t.Errorf("kind=food suggested %+v", s.Ingredient)
		}
	}
	u.Get("/api/ingredients/search?q=tomato%20cleaner&kind=supply").MustJSON(t, &supply)
	if supply.Exact == nil || supply.Exact.Name != "Tomato cleaner" {
		t.Errorf("kind=supply: exact = %+v", supply.Exact)
	}
}

func TestANameIsUniqueAcrossKinds(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	createFood(t, u, "Vinegar", "ml")
	r := u.Post("/api/ingredients", map[string]any{"name": "vinegar", "baseUnit": "ml", "kind": "supply"})
	if r.Status != 409 || r.ErrorCode() != "name_taken" {
		t.Errorf("a Supply named like a food = %d %s, want 409 name_taken", r.Status, r.Body)
	}
}

func recipeWithLine(t *testing.T, u *testkit.Client, name string, ing int64) {
	t.Helper()
	r := u.Post("/api/recipes", map[string]any{"name": name, "yield": 2, "tags": []string{}, "lines": []any{map[string]any{"ingredientId": ing, "quantity": 1, "unit": "piece"}}})
	if r.Status != 201 {
		t.Fatalf("create Recipe %s = %d %s", name, r.Status, r.Body)
	}
}

func TestAKindChangeToSupplyIsRefusedWhileARecipeLineUsesTheIngredient(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	vinegar := createFood(t, u, "vinegar", "piece")
	recipeWithLine(t, u, "Pickles", vinegar.ID)
	r := u.Patch(fmt.Sprintf("/api/ingredients/%d", vinegar.ID), map[string]any{"kind": "supply"})
	e := wantRefusal(t, "kind change", r, 409, "kind_in_use", "", "")
	if fmt.Sprint(e.Error.Reasons) != "[recipe_lines]" {
		t.Errorf("reasons = %v, want [recipe_lines]", e.Error.Reasons)
	}
	var back supplyJSON
	u.Get(fmt.Sprintf("/api/ingredients/%d", vinegar.ID)).MustJSON(t, &back)
	if back.Kind != "food" {
		t.Errorf("kind = %q after a refused change, want food", back.Kind)
	}
}

func TestAKindChangeToSupplyIsRefusedForABaseRecipesIngredient(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	_, ing := seedBase(t, env, u, "Béchamel", []any{})
	r := u.Patch(fmt.Sprintf("/api/ingredients/%d", ing), map[string]any{"kind": "supply"})
	e := wantRefusal(t, "kind change of a Base recipe's Ingredient", r, 409, "kind_in_use", "", "")
	if fmt.Sprint(e.Error.Reasons) != "[base_recipe]" {
		t.Errorf("reasons = %v, want [base_recipe]", e.Error.Reasons)
	}
}

func TestAKindChangeToSupplyClearsTheShelfLifeAndTheLotsGoOffDates(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	r := u.Post("/api/ingredients", map[string]any{"name": "Toilet paper", "baseUnit": "piece", "shelfLifeDays": 365, "frozenShelfLifeDays": 400})
	var tp supplyJSON
	r.MustJSON(t, &tp)
	if r.Status != 201 {
		t.Fatalf("create = %d %s", r.Status, r.Body)
	}
	if _, err := env.DB.Exec(`INSERT INTO stock_lots(ingredient_id,quantity,purchased,goes_off,source,created_at) VALUES (?,9,'2026-11-01','2026-11-30','manual','2026-11-01T10:00:00Z')`, tp.ID); err != nil {
		t.Fatal(err)
	}
	var got supplyJSON
	r = u.Patch(fmt.Sprintf("/api/ingredients/%d", tp.ID), map[string]any{"kind": "supply", "restockLevel": 9})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Kind != "supply" || got.ShelfLifeDays != nil || got.FrozenShelfLifeDays != nil || got.RestockLevel == nil || *got.RestockLevel != 9 {
		t.Fatalf("kind change = %d %s, want a Supply, level 9, no Shelf Life", r.Status, r.Body)
	}
	var goesOff *string
	if err := env.DB.QueryRow(`SELECT goes_off FROM stock_lots WHERE ingredient_id = ?`, tp.ID).Scan(&goesOff); err != nil || goesOff != nil {
		t.Errorf("Lot goes_off = %v, %v; want NULL", goesOff, err)
	}
}

func TestAKindChangeToFoodClearsTheRestockLevel(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	s := createSupply(t, u, "Vinegar", "ml", 500)
	var got supplyJSON
	r := u.Patch(fmt.Sprintf("/api/ingredients/%d", s.ID), map[string]any{"kind": "food"})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Kind != "food" || got.RestockLevel != nil {
		t.Errorf("to food = %d %s, want food with restockLevel null", r.Status, r.Body)
	}
}

func TestMergingAcrossKindsIsBlockedInThePreviewAndRefusedByTheMerge(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	food := createFood(t, u, "vinegar", "ml")
	supply := createSupply(t, u, "descaler", "ml", nil)
	for name, ids := range map[string][2]int64{"supply into food": {supply.ID, food.ID}, "food into supply": {food.ID, supply.ID}} {
		var p struct {
			Blocked string     `json:"blocked"`
			Source  supplyJSON `json:"source"`
			Target  supplyJSON `json:"target"`
		}
		r := u.Get(fmt.Sprintf("/api/ingredients/%d/merge-preview?into=%d", ids[0], ids[1]))
		r.MustJSON(t, &p)
		if r.Status != 200 || p.Blocked != "kind_differs" || p.Source.Kind == p.Target.Kind {
			t.Errorf("%s preview = %d %s, want blocked kind_differs with each side's kind", name, r.Status, r.Body)
		}
		m := u.Post(fmt.Sprintf("/api/ingredients/%d/merge", ids[0]), map[string]any{"into": ids[1]})
		if m.Status != 409 || m.ErrorCode() != "kind_differs" {
			t.Errorf("%s merge = %d %s, want 409 kind_differs", name, m.Status, m.Body)
		}
	}
	if r := u.Get(fmt.Sprintf("/api/ingredients/%d", supply.ID)); r.Status != 200 {
		t.Errorf("the Supply is gone after refused merges: %d", r.Status)
	}
}

func TestTwoSuppliesMerge(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	a := createSupply(t, u, "loo roll", "piece", 4)
	b := createSupply(t, u, "toilet paper", "piece", 9)
	var p struct {
		Blocked string `json:"blocked"`
	}
	u.Get(fmt.Sprintf("/api/ingredients/%d/merge-preview?into=%d", a.ID, b.ID)).MustJSON(t, &p)
	if p.Blocked != "" {
		t.Errorf("blocked = %q, want none", p.Blocked)
	}
	var got supplyJSON
	r := u.Post(fmt.Sprintf("/api/ingredients/%d/merge", a.ID), map[string]any{"into": b.ID})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.ID != b.ID || got.Kind != "supply" || got.RestockLevel == nil || *got.RestockLevel != 9 {
		t.Errorf("merge = %d %s, want the target, still a Supply with its own level", r.Status, r.Body)
	}
}
