package httpapi_test

import (
	"fmt"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// BR-B (docs/dev/design/base-recipes.md §10, §16): the Base recipe API. Red until the routes and fields exist.
//
// The route table these tests pin:
//   POST/PUT /api/recipes        body gains baseRecipe, yieldUnit, takeOver; line gains id, baseRecipeId, neededAtStep
//   GET /api/recipes?kind=plannable|base|all
//   DELETE /api/recipes/{id}     409 base_recipe_in_use { usedBy }
//   POST /api/recipes/{id}/to-base[?dryRun=1]   POST /api/recipes/{id}/to-plannable
//   POST|DELETE /api/recipes/{id}/lines/{lineId}/base
//   GET /api/recipes/{id}/link-candidates   POST /api/recipes/{id}/link   POST /api/recipes/{id}/unlink

type refJSON struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Archived bool   `json:"archived"`
}

type baseLine struct {
	ID                     int64 `json:"id"`
	IngredientID           int64 `json:"ingredientId"`
	Quantity               float64
	Unit                   string
	LinkedFromIngredientID *int64 `json:"linkedFromIngredientId"`
	NeededAtStep           *int   `json:"neededAtStep"`
	NeededAt               int    `json:"neededAt"`
	BaseRecipe             *struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		Archived bool   `json:"archived"`
		Empty    bool   `json:"empty"`
	} `json:"baseRecipe"`
}

type baseRecipeOut struct {
	ID               int64      `json:"id"`
	Name             string     `json:"name"`
	Yield            float64    `json:"yield"`
	YieldUnit        *string    `json:"yieldUnit"`
	BaseRecipe       bool       `json:"baseRecipe"`
	BaseIngredientID int64      `json:"baseIngredientId"`
	Courses          []any      `json:"courses"`
	WholeMeal        bool       `json:"wholeMeal"`
	UsedBy           []refJSON  `json:"usedBy"`
	Lines            []baseLine `json:"lines"`
	Within           []struct {
		IngredientID int64    `json:"ingredientId"`
		Name         string   `json:"name"`
		Path         []string `json:"path"`
	} `json:"within"`
}

type askOut struct {
	Error struct {
		Code        string    `json:"code"`
		Ingredient  refJSON   `json:"ingredient"`
		Recipes     []refJSON `json:"recipes"`
		StockLots   int       `json:"stockLots"`
		Convertible bool      `json:"convertible"`
	} `json:"error"`
}

type richRefusal struct {
	Error struct {
		Code       string    `json:"code"`
		Field      string    `json:"field"`
		Reason     string    `json:"reason"`
		Path       []string  `json:"path"`
		UsedBy     []refJSON `json:"usedBy"`
		Ingredient refJSON   `json:"ingredient"`
	} `json:"error"`
}

func baseBody(name string, yield float64, unit string, extra map[string]any) map[string]any {
	m := map[string]any{"name": name, "yield": yield, "yieldUnit": unit, "baseRecipe": true, "tags": []string{}, "lines": []any{}}
	for k, v := range extra {
		m[k] = v
	}
	return m
}

func lineOf(ing int64, q float64, unit string) map[string]any {
	return map[string]any{"ingredientId": ing, "quantity": q, "unit": unit}
}

func baseLineOf(baseID int64, q float64, unit string) map[string]any {
	return map[string]any{"baseRecipeId": baseID, "quantity": q, "unit": unit}
}

func mustCreate(t *testing.T, user *testkit.Client, body map[string]any) baseRecipeOut {
	t.Helper()
	r := user.Post("/api/recipes", body)
	var out baseRecipeOut
	r.MustJSON(t, &out)
	if r.Status != 201 {
		t.Fatalf("create %v = %d %s", body["name"], r.Status, r.Body)
	}
	return out
}

func ingredient(t *testing.T, env *testkit.Env, name, base string) int64 {
	t.Helper()
	return mustExec(t, env, `INSERT INTO ingredients (name, name_key, base_unit, created_at, updated_at) VALUES (?, lower(?), ?, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`, name, name, base)
}

func wantRich(t *testing.T, label string, r *testkit.Response, status int, code, field, reason string) richRefusal {
	t.Helper()
	var e richRefusal
	r.MustJSON(t, &e)
	if r.Status != status || e.Error.Code != code || e.Error.Field != field || e.Error.Reason != reason {
		t.Errorf("%s: got %d %s field=%q reason=%q (%s), want %d %s field=%q reason=%q", label, r.Status, e.Error.Code, e.Error.Field, e.Error.Reason, r.Body, status, code, field, reason)
	}
	return e
}

func TestCreatingABaseRecipeReturnsItsKindYieldUnitIngredientAndNoCourses(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	milk := ingredient(t, env, "milk", "ml")
	r := user.Post("/api/recipes", baseBody("Béchamel", 1, "l", map[string]any{"lines": []any{lineOf(milk, 1000, "ml")}}))
	var out baseRecipeOut
	r.MustJSON(t, &out)
	if r.Status != 201 || !out.BaseRecipe || out.YieldUnit == nil || *out.YieldUnit != "l" || out.BaseIngredientID == 0 {
		t.Fatalf("create = %d %s, want a Base recipe of 1 l with its Ingredient", r.Status, r.Body)
	}
	if len(out.Courses) != 0 || out.WholeMeal || out.UsedBy == nil || len(out.UsedBy) != 0 || out.Within == nil {
		t.Errorf("recipe = %+v, want courses [], wholeMeal false, usedBy [] and within [] (never null)", out)
	}
	var key string
	env.DB.QueryRow(`SELECT name_key FROM ingredients WHERE id = ?`, out.BaseIngredientID).Scan(&key)
	if key != fmt.Sprintf("base-recipe:%d", out.ID) {
		t.Errorf("name_key = %q", key)
	}
}

func TestAPlannableRecipeShowsNullYieldUnitAndBaseRecipeFalse(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	r := user.Post("/api/recipes", body(seedIngredient(t, env), "Roast", nil))
	var out baseRecipeOut
	r.MustJSON(t, &out)
	if r.Status != 201 || out.BaseRecipe || out.YieldUnit != nil || out.UsedBy == nil {
		t.Errorf("plannable = %d %s, want baseRecipe false, yieldUnit null", r.Status, r.Body)
	}
}

func TestBaseRecipeFieldAndKindRefusalsAreValidationFailed(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	main := courseID(t, env, "Main")
	wantRich(t, "no yield unit", user.Post("/api/recipes", baseBody("A", 1, "", nil)), 422, "validation_failed", "yieldUnit", "yield_unit_invalid")
	wantRich(t, "bad yield unit", user.Post("/api/recipes", baseBody("A", 1, "furlong", nil)), 422, "validation_failed", "yieldUnit", "yield_unit_invalid")
	wantRich(t, "ready meal", user.Post("/api/recipes", baseBody("A", 1, "l", map[string]any{"readyMeal": true})), 422, "validation_failed", "readyMeal", "base_recipe_ready_meal")
	wantRich(t, "courses", user.Post("/api/recipes", baseBody("A", 1, "l", map[string]any{"courseIds": []int64{main}})), 422, "validation_failed", "courses", "base_recipe_field")
	wantRich(t, "cool-down", user.Post("/api/recipes", baseBody("A", 1, "l", map[string]any{"cooldownDays": 3})), 422, "validation_failed", "cooldownDays", "base_recipe_field")
	wantRich(t, "yield too big", user.Post("/api/recipes", baseBody("A", 100001, "g", nil)), 422, "validation_failed", "yield", "yield_invalid")
	plain := body(seedIngredient(t, env), "Roast", map[string]any{"yieldUnit": "portion"})
	wantRich(t, "plannable with a yield unit", user.Post("/api/recipes", plain), 422, "validation_failed", "yieldUnit", "yield_unit_invalid")
	if n := count(t, env, `SELECT count(*) FROM recipes`); n != 0 {
		t.Errorf("%d Recipes stored after the refusals, want none", n)
	}
}

func TestAPutCannotChangeTheKindAndAbsentKeepsIt(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	b := mustCreate(t, user, baseBody("Béchamel", 1, "l", nil))
	same := baseBody("Béchamel", 2, "l", nil)
	delete(same, "baseRecipe")
	r := user.Put(fmt.Sprintf("/api/recipes/%d", b.ID), same)
	var out baseRecipeOut
	r.MustJSON(t, &out)
	if r.Status != 200 || !out.BaseRecipe || out.Yield != 2 {
		t.Errorf("PUT with no baseRecipe = %d %s, want the kind kept", r.Status, r.Body)
	}
	flip := baseBody("Béchamel", 1, "l", map[string]any{"baseRecipe": false})
	wantRich(t, "flip", user.Put(fmt.Sprintf("/api/recipes/%d", b.ID), flip), 422, "validation_failed", "baseRecipe", "base_recipe_kind")
}

func TestABaseRecipeNamedLikeAPlainIngredientAsksWith409AndTheAnswerDecides(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	jar := ingredient(t, env, "béchamel", "ml")
	lasagne := mustCreate(t, user, body(jar, "Lasagne", nil))
	mustExec(t, env, `INSERT INTO stock_lots(ingredient_id, quantity, purchased, source, created_at) VALUES (?, 400, '2026-11-01', 'manual', '2026-11-01T00:00:00Z')`, jar)

	r := user.Post("/api/recipes", baseBody("Béchamel", 1, "l", nil))
	var ask askOut
	r.MustJSON(t, &ask)
	if r.Status != 409 || ask.Error.Code != "base_recipe_take_over" || ask.Error.Ingredient.ID != jar || ask.Error.StockLots != 1 || !ask.Error.Convertible ||
		len(ask.Error.Recipes) != 1 || ask.Error.Recipes[0].ID != lasagne.ID || ask.Error.Recipes[0].Name != "Lasagne" {
		t.Fatalf("create = %d %s, want 409 base_recipe_take_over naming the Ingredient, its Recipes and Stock", r.Status, r.Body)
	}
	if n := count(t, env, `SELECT count(*) FROM recipes WHERE name = 'Béchamel'`); n != 0 {
		t.Error("the ask creates nothing")
	}

	yes := user.Post("/api/recipes", baseBody("Béchamel", 1, "l", map[string]any{"takeOver": true}))
	var out baseRecipeOut
	yes.MustJSON(t, &out)
	if yes.Status != 201 || out.BaseIngredientID != jar {
		t.Fatalf("Yes = %d %s, want the plain Ingredient taken over", yes.Status, yes.Body)
	}
	var got baseRecipeOut
	user.Get(fmt.Sprintf("/api/recipes/%d", lasagne.ID)).MustJSON(t, &got)
	if got.Lines[0].BaseRecipe == nil || got.Lines[0].BaseRecipe.ID != out.ID {
		t.Errorf("Lasagne's line = %+v, want a Base recipe line", got.Lines[0])
	}

	no := user.Post("/api/recipes", baseBody("Béchamel two", 1, "l", map[string]any{"takeOver": false}))
	if no.Status != 201 {
		t.Errorf("No = %d %s", no.Status, no.Body)
	}
}

func TestNamesHeldByABaseRecipeOrAReadyMealAreRefusedOnTheNameField(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	mustCreate(t, user, baseBody("Béchamel", 1, "l", nil))
	wantRich(t, "second Base recipe", user.Post("/api/recipes", baseBody("béchamel", 1, "l", nil)), 422, "validation_failed", "name", "base_recipe_name_taken")

	pack := ingredient(t, env, "Lasagne pack", "piece")
	rm := user.Post("/api/recipes", map[string]any{"name": "Lasagne pack", "yield": 2, "readyMeal": true, "lines": []any{lineOf(pack, 1, "piece")}})
	if rm.Status != 201 {
		t.Fatalf("Ready Meal = %d %s", rm.Status, rm.Body)
	}
	wantRich(t, "Base recipe named like a Ready Meal", user.Post("/api/recipes", baseBody("Lasagne pack", 1, "portion", nil)), 422, "validation_failed", "name", "ready_meal_name_taken")
	wantRich(t, "Ready Meal named like a Base recipe", user.Post("/api/recipes", map[string]any{"name": "Béchamel", "yield": 2, "readyMeal": true, "lines": []any{}}),
		422, "validation_failed", "name", "base_recipe_name_taken")
}

func TestBaseRecipeLinesCarryTheirBaseRecipeAndNeededAt(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	milk := ingredient(t, env, "milk", "ml")
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", map[string]any{"lines": []any{lineOf(milk, 1000, "ml")}}))
	steps := []map[string]any{{"text": "Prep", "kind": "active", "durationMinutes": 5}, {"text": "Layer the lasagne with béchamel", "kind": "active", "durationMinutes": 10}}

	lasagne := mustCreate(t, user, map[string]any{"name": "Lasagne", "yield": 4, "lines": []any{baseLineOf(bech.ID, 500, "ml")}, "steps": steps})
	l := lasagne.Lines[0]
	if l.ID == 0 || l.BaseRecipe == nil || l.BaseRecipe.ID != bech.ID || l.BaseRecipe.Name != "Béchamel" || l.BaseRecipe.Archived || l.BaseRecipe.Empty ||
		l.IngredientID != bech.BaseIngredientID || l.NeededAtStep != nil || l.NeededAt != 1 {
		t.Errorf("line = %+v, want a Base recipe line, no stored override, effective neededAt 1", l)
	}
	if len(lasagne.UsedBy) != 0 {
		t.Error("a plannable Recipe is used by nobody")
	}
	var again baseRecipeOut
	user.Get(fmt.Sprintf("/api/recipes/%d", bech.ID)).MustJSON(t, &again)
	if len(again.UsedBy) != 1 || again.UsedBy[0].Name != "Lasagne" {
		t.Errorf("Béchamel usedBy = %+v", again.UsedBy)
	}
	var withIn baseRecipeOut
	user.Get(fmt.Sprintf("/api/recipes/%d", lasagne.ID)).MustJSON(t, &withIn)
	if len(withIn.Within) != 1 || withIn.Within[0].Name != "milk" || !reflect.DeepEqual(withIn.Within[0].Path, []string{"Béchamel"}) {
		t.Errorf("within = %+v, want milk through [Béchamel]", withIn.Within)
	}

	bad := map[string]any{"name": "Lasagne 2", "yield": 4, "lines": []any{map[string]any{"baseRecipeId": bech.ID, "quantity": 500, "unit": "ml", "neededAtStep": 7}}, "steps": steps}
	wantRich(t, "stale neededAtStep", user.Post("/api/recipes", bad), 422, "validation_failed", "lines[0].neededAtStep", "needed_at_step_invalid")
	plainLine := map[string]any{"name": "Lasagne 3", "yield": 4, "lines": []any{map[string]any{"ingredientId": milk, "quantity": 5, "unit": "ml", "neededAtStep": 0}}, "steps": steps}
	wantRich(t, "neededAtStep on a plain line", user.Post("/api/recipes", plainLine), 422, "validation_failed", "lines[0].neededAtStep", "needed_at_step_invalid")
}

func TestACycleIs422WithThePathAndTheLine(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	milk := ingredient(t, env, "milk", "ml")
	roux := mustCreate(t, user, baseBody("Roux", 1, "kg", map[string]any{"lines": []any{lineOf(milk, 1, "l")}}))
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", map[string]any{"lines": []any{baseLineOf(roux.ID, 100, "g")}}))
	put := baseBody("Roux", 1, "kg", map[string]any{"lines": []any{lineOf(milk, 1, "l"), baseLineOf(bech.ID, 100, "ml")}})
	e := wantRich(t, "cycle", user.Put(fmt.Sprintf("/api/recipes/%d", roux.ID), put), 422, "validation_failed", "lines[1]", "base_recipe_cycle")
	if !reflect.DeepEqual(e.Error.Path, []string{"Roux", "Béchamel", "Roux"}) {
		t.Errorf("path = %v, want [Roux Béchamel Roux]", e.Error.Path)
	}
	self := baseBody("Béchamel", 1, "l", map[string]any{"lines": []any{baseLineOf(bech.ID, 100, "ml")}})
	e = wantRich(t, "self", user.Put(fmt.Sprintf("/api/recipes/%d", bech.ID), self), 422, "validation_failed", "lines[0]", "base_recipe_cycle")
	if !reflect.DeepEqual(e.Error.Path, []string{"Béchamel", "Béchamel"}) {
		t.Errorf("path = %v", e.Error.Path)
	}
}

func TestDeletingABaseRecipeInUseIs409WithUsedByAndArchiveIsOffered(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", nil))
	lasagne := mustCreate(t, user, map[string]any{"name": "Lasagne", "yield": 4, "lines": []any{baseLineOf(bech.ID, 500, "ml")}})
	r := user.Delete(fmt.Sprintf("/api/recipes/%d", bech.ID))
	var e richRefusal
	r.MustJSON(t, &e)
	if r.Status != 409 || e.Error.Code != "base_recipe_in_use" || len(e.Error.UsedBy) != 1 || e.Error.UsedBy[0].ID != lasagne.ID || e.Error.UsedBy[0].Name != "Lasagne" {
		t.Fatalf("delete = %d %s, want 409 base_recipe_in_use with usedBy [Lasagne]", r.Status, r.Body)
	}
	if a := user.Post(fmt.Sprintf("/api/recipes/%d/archive", bech.ID), nil); a.Status != 200 {
		t.Errorf("archive = %d %s", a.Status, a.Body)
	}
	if d := user.Delete(fmt.Sprintf("/api/recipes/%d", lasagne.ID)); d.Status != 204 {
		t.Fatalf("delete Lasagne = %d", d.Status)
	}
	if d := user.Delete(fmt.Sprintf("/api/recipes/%d", bech.ID)); d.Status != 204 {
		t.Errorf("delete of an unused Base recipe = %d %s, want 204", d.Status, d.Body)
	}
}

func TestTheRecipesListFiltersByKindAndShowsPlannableByDefault(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", nil))
	mustCreate(t, user, map[string]any{"name": "Lasagne", "yield": 4, "lines": []any{baseLineOf(bech.ID, 500, "ml")}})
	type summary struct {
		Name        string  `json:"name"`
		BaseRecipe  bool    `json:"baseRecipe"`
		YieldUnit   *string `json:"yieldUnit"`
		UsedByCount int     `json:"usedByCount"`
	}
	names := func(path string) []summary {
		r := user.Get(path)
		var out []summary
		r.MustJSON(t, &out)
		if r.Status != 200 {
			t.Fatalf("GET %s = %d %s", path, r.Status, r.Body)
		}
		return out
	}
	if got := names("/api/recipes"); len(got) != 1 || got[0].Name != "Lasagne" || got[0].BaseRecipe || got[0].YieldUnit != nil {
		t.Errorf("default = %+v, want Lasagne only", got)
	}
	got := names("/api/recipes?kind=base")
	if len(got) != 1 || got[0].Name != "Béchamel" || !got[0].BaseRecipe || got[0].YieldUnit == nil || *got[0].YieldUnit != "l" || got[0].UsedByCount != 1 {
		t.Errorf("kind=base = %+v", got)
	}
	if got := names("/api/recipes?kind=all"); len(got) != 2 {
		t.Errorf("kind=all = %+v, want both", got)
	}
	if got := names("/api/recipes?kind=base&sort=last_cooked_desc"); len(got) != 1 {
		t.Errorf("kind=base with a Last cooked sort = %+v, want it accepted (sorts by name)", got)
	}
	wantRich(t, "bad kind", user.Get("/api/recipes?kind=sauce"), 422, "validation_failed", "kind", "kind_invalid")
}

func TestToBaseDryRunNamesTheMealsAndRulesThenTheConfirmApplies(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	basil := ingredient(t, env, "basil", "g")
	main := courseID(t, env, "Main")
	pesto := mustCreate(t, user, map[string]any{"name": "Pesto", "yield": 4, "lines": []any{lineOf(basil, 100, "g")}})
	slot := mustExec(t, env, `INSERT INTO meal_slots(weekday,name,time) VALUES (1,'Dinner','19:00')`)
	mustExec(t, env, `INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,state,pinned,created_at,updated_at) VALUES ('2026-11-10',?,?,?,1,4,'planned',1,'t','t')`, slot, main, pesto.ID)
	mustExec(t, env, `INSERT INTO slot_rules(meal_slot_id,course_id,recipe_id) VALUES (?,?,?)`, slot, main, pesto.ID)

	r := user.Post(fmt.Sprintf("/api/recipes/%d/to-base?dryRun=1", pesto.ID), nil)
	var plan struct {
		PlannedMeals []struct {
			Date         string `json:"date"`
			MealSlotName string `json:"mealSlotName"`
			CourseName   string `json:"courseName"`
			Pinned       bool   `json:"pinned"`
			Bought       bool   `json:"bought"`
		} `json:"plannedMeals"`
		SlotRules   []map[string]any `json:"slotRules"`
		Leftovers   int              `json:"leftovers"`
		Preferences int              `json:"preferences"`
	}
	r.MustJSON(t, &plan)
	if r.Status != 200 || len(plan.PlannedMeals) != 1 || plan.PlannedMeals[0].Date != "2026-11-10" || !plan.PlannedMeals[0].Pinned ||
		plan.PlannedMeals[0].MealSlotName != "Dinner" || plan.PlannedMeals[0].CourseName != "Main" || len(plan.SlotRules) != 1 {
		t.Fatalf("dry run = %d %s", r.Status, r.Body)
	}
	if n := count(t, env, `SELECT count(*) FROM planned_meals`); n != 1 {
		t.Error("a dry run changes nothing")
	}

	ok := user.Post(fmt.Sprintf("/api/recipes/%d/to-base", pesto.ID), map[string]any{"yield": 4, "yieldUnit": "portion"})
	var out baseRecipeOut
	ok.MustJSON(t, &out)
	if ok.Status != 200 || !out.BaseRecipe || out.Yield != 4 || out.YieldUnit == nil || *out.YieldUnit != "portion" {
		t.Fatalf("to-base = %d %s", ok.Status, ok.Body)
	}
	if count(t, env, `SELECT count(*) FROM planned_meals`) != 0 || count(t, env, `SELECT count(*) FROM slot_rules`) != 0 {
		t.Error("the confirm removes the Planned Meals from today and the Slot Rules")
	}
	wantRich(t, "again", user.Post(fmt.Sprintf("/api/recipes/%d/to-base", pesto.ID), map[string]any{"yield": 4, "yieldUnit": "portion"}), 422, "validation_failed", "baseRecipe", "base_recipe_kind")
}

func TestAReadyMealCannotBeTurnedIntoABaseRecipe(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	pack := ingredient(t, env, "Lasagne pack", "piece")
	rm := mustCreate(t, user, map[string]any{"name": "Lasagne pack", "yield": 2, "readyMeal": true, "lines": []any{lineOf(pack, 1, "piece")}})
	wantRich(t, "dry run", user.Post(fmt.Sprintf("/api/recipes/%d/to-base?dryRun=1", rm.ID), nil), 422, "validation_failed", "readyMeal", "base_recipe_ready_meal")
	wantRich(t, "apply", user.Post(fmt.Sprintf("/api/recipes/%d/to-base", rm.ID), map[string]any{"yield": 2, "yieldUnit": "portion"}), 422, "validation_failed", "readyMeal", "base_recipe_ready_meal")
}

func TestToPlannableIsRefusedInUseAndNamesAConflictingIngredient(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", nil))
	lasagne := mustCreate(t, user, map[string]any{"name": "Lasagne", "yield": 4, "lines": []any{baseLineOf(bech.ID, 500, "ml")}})
	r := user.Post(fmt.Sprintf("/api/recipes/%d/to-plannable", bech.ID), map[string]any{"yield": 4})
	var e richRefusal
	r.MustJSON(t, &e)
	if r.Status != 409 || e.Error.Code != "base_recipe_in_use" || len(e.Error.UsedBy) != 1 {
		t.Fatalf("to-plannable in use = %d %s", r.Status, r.Body)
	}
	user.Delete(fmt.Sprintf("/api/recipes/%d", lasagne.ID))

	plain := ingredient(t, env, "béchamel", "ml")
	r = user.Post(fmt.Sprintf("/api/recipes/%d/to-plannable", bech.ID), map[string]any{"yield": 4})
	r.MustJSON(t, &e)
	if r.Status != 409 || e.Error.Code != "ingredient_name_taken" || e.Error.Ingredient.ID != plain {
		t.Fatalf("to-plannable with a plain Ingredient of the name = %d %s, want 409 ingredient_name_taken naming it", r.Status, r.Body)
	}
	mustExec(t, env, `DELETE FROM ingredients WHERE id = ?`, plain)
	ok := user.Post(fmt.Sprintf("/api/recipes/%d/to-plannable", bech.ID), map[string]any{"yield": 4})
	var out baseRecipeOut
	ok.MustJSON(t, &out)
	if ok.Status != 200 || out.BaseRecipe || out.YieldUnit != nil || len(out.Courses) != 1 {
		t.Errorf("to-plannable = %d %s, want a plannable Recipe in the main Course", ok.Status, ok.Body)
	}
}

func TestLinkingALineByRoute(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	jar := ingredient(t, env, "béchamel", "ml")
	lasagne := mustCreate(t, user, body(jar, "Lasagne", map[string]any{"lines": []any{lineOf(jar, 500, "ml")}}))
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", map[string]any{"takeOver": false}))
	line := lasagne.Lines[0].ID

	r := user.Post(fmt.Sprintf("/api/recipes/%d/lines/%d/base", lasagne.ID, line), map[string]any{"baseRecipeId": bech.ID})
	var out baseRecipeOut
	r.MustJSON(t, &out)
	l := out.Lines[0]
	if r.Status != 200 || l.BaseRecipe == nil || l.BaseRecipe.ID != bech.ID || l.Quantity != 500 || l.LinkedFromIngredientID == nil || *l.LinkedFromIngredientID != jar {
		t.Fatalf("link = %d %s", r.Status, r.Body)
	}
	wantRich(t, "again", user.Post(fmt.Sprintf("/api/recipes/%d/lines/%d/base", lasagne.ID, line), map[string]any{"baseRecipeId": bech.ID}), 422, "validation_failed", "lineId", "line_not_plain")
	wantRich(t, "no way", user.Post(fmt.Sprintf("/api/recipes/%d/lines/%d/base", lasagne.ID, line), map[string]any{}), 422, "validation_failed", "link", "link_invalid")

	back := user.Do("DELETE", fmt.Sprintf("/api/recipes/%d/lines/%d/base", lasagne.ID, line), nil)
	back.MustJSON(t, &out)
	if back.Status != 200 || out.Lines[0].BaseRecipe != nil || out.Lines[0].IngredientID != jar || out.Lines[0].NeededAtStep != nil {
		t.Errorf("unlink = %d %s", back.Status, back.Body)
	}
	wantRich(t, "not a Base recipe line", user.Do("DELETE", fmt.Sprintf("/api/recipes/%d/lines/%d/base", lasagne.ID, line), nil), 422, "validation_failed", "lineId", "line_not_base")
	if r := user.Post(fmt.Sprintf("/api/recipes/%d/lines/99999/base", lasagne.ID), map[string]any{"baseRecipeId": bech.ID}); r.Status != 404 {
		t.Errorf("unknown line = %d, want 404", r.Status)
	}
}

func TestLinkingAnUnconvertibleUnitAnswersTheUnknownUnitShapeOnTheBaseRecipesIngredient(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	jar := ingredient(t, env, "béchamel", "ml")
	mustExec(t, env, `INSERT INTO ingredient_conversions(ingredient_id, unit, to_base) VALUES (?, 'jar', 400)`, jar)
	cann := mustCreate(t, user, body(jar, "Cannelloni", map[string]any{"lines": []any{lineOf(jar, 2, "jar")}}))
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", map[string]any{"takeOver": false}))
	r := user.Post(fmt.Sprintf("/api/recipes/%d/lines/%d/base", cann.ID, cann.Lines[0].ID), map[string]any{"baseRecipeId": bech.ID})
	var e struct {
		Error struct {
			Code         string `json:"code"`
			Field        string `json:"field"`
			IngredientID int64  `json:"ingredientId"`
			Unit         string `json:"unit"`
			BaseUnit     string `json:"baseUnit"`
		} `json:"error"`
	}
	r.MustJSON(t, &e)
	if r.Status != 422 || e.Error.Code != "unknown_unit" || e.Error.IngredientID != bech.BaseIngredientID || e.Error.Unit != "jar" || e.Error.BaseUnit != "ml" {
		t.Errorf("link = %d %s, want 422 unknown_unit on the Base recipe's Ingredient", r.Status, r.Body)
	}
}

func TestBulkLinkByRoutes(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	jar := ingredient(t, env, "béchamel", "ml")
	lasagne := mustCreate(t, user, body(jar, "Lasagne", map[string]any{"lines": []any{lineOf(jar, 500, "ml")}}))
	moussaka := mustCreate(t, user, body(jar, "Moussaka", map[string]any{"lines": []any{lineOf(jar, 300, "ml")}}))
	user.Post(fmt.Sprintf("/api/recipes/%d/archive", moussaka.ID), nil)
	mustExec(t, env, `INSERT INTO ingredient_conversions(ingredient_id, unit, to_base) VALUES (?, 'jar', 400)`, jar)
	cann := mustCreate(t, user, body(jar, "Cannelloni", map[string]any{"lines": []any{lineOf(jar, 2, "jar")}}))
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", map[string]any{"takeOver": false}))

	r := user.Get(fmt.Sprintf("/api/recipes/%d/link-candidates", bech.ID))
	var cands struct {
		Lines []struct {
			LineID         int64   `json:"lineId"`
			RecipeID       int64   `json:"recipeId"`
			RecipeName     string  `json:"recipeName"`
			Archived       bool    `json:"archived"`
			IngredientID   int64   `json:"ingredientId"`
			IngredientName string  `json:"ingredientName"`
			Quantity       float64 `json:"quantity"`
			Unit           string  `json:"unit"`
			Linkable       bool    `json:"linkable"`
			Reason         string  `json:"reason"`
		} `json:"lines"`
	}
	r.MustJSON(t, &cands)
	if r.Status != 200 || len(cands.Lines) != 3 {
		t.Fatalf("link-candidates = %d %s", r.Status, r.Body)
	}
	if c := cands.Lines[0]; c.RecipeName != "Cannelloni" || c.Linkable || c.Reason != "unit_unconvertible" {
		t.Errorf("first = %+v, want Cannelloni disabled for its unit", c)
	}
	if c := cands.Lines[2]; c.RecipeName != "Moussaka" || !c.Archived || !c.Linkable || c.IngredientName != "béchamel" || c.Quantity != 300 {
		t.Errorf("last = %+v", c)
	}

	bad := user.Post(fmt.Sprintf("/api/recipes/%d/link", bech.ID), map[string]any{"lineIds": []int64{cands.Lines[1].LineID, cands.Lines[0].LineID}})
	wantRich(t, "not a candidate", bad, 422, "validation_failed", "lineIds", "not_a_candidate")
	if n := count(t, env, `SELECT count(*) FROM recipe_lines WHERE linked_from_ingredient_id IS NOT NULL`); n != 0 {
		t.Error("all or nothing")
	}

	ids := []int64{cands.Lines[1].LineID, cands.Lines[2].LineID}
	ok := user.Post(fmt.Sprintf("/api/recipes/%d/link", bech.ID), map[string]any{"lineIds": ids})
	var res struct {
		Linked     []int64 `json:"linked"`
		MergeOffer []struct {
			IngredientID int64  `json:"ingredientId"`
			Name         string `json:"name"`
			StockLots    int    `json:"stockLots"`
			Products     int    `json:"products"`
		} `json:"mergeOffer"`
	}
	ok.MustJSON(t, &res)
	if ok.Status != 200 || !reflect.DeepEqual(res.Linked, ids) || res.MergeOffer == nil || len(res.MergeOffer) != 0 {
		t.Fatalf("link = %d %s, want both linked and mergeOffer [] (Cannelloni still uses the plain Ingredient)", ok.Status, ok.Body)
	}
	_ = lasagne

	un := user.Post(fmt.Sprintf("/api/recipes/%d/unlink", bech.ID), map[string]any{"lineIds": ids})
	if un.Status != 200 {
		t.Fatalf("unlink = %d %s", un.Status, un.Body)
	}
	if n := count(t, env, `SELECT count(*) FROM recipe_lines WHERE ingredient_id = ?`, jar); n != 3 {
		t.Errorf("%d lines on the plain Ingredient after Undo, want all 3 (Lasagne, Moussaka, Cannelloni)", n)
	}
	_ = cann
}

func TestABaseRecipeHasOnlyExclusionsAsPreferences(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", nil))
	member := mustExec(t, env, `INSERT INTO members(name, colour, avatar, portion_factor, created_at) VALUES ('Sam', '#336699', '', 1.0, '2026-11-09T12:00:00Z')`)
	wantRich(t, "favourite", user.Put(fmt.Sprintf("/api/recipes/%d/preference", bech.ID), map[string]any{"state": "favourite", "memberId": member}), 422, "validation_failed", "state", "base_recipe_preference")
	r := user.Put(fmt.Sprintf("/api/recipes/%d/preference", bech.ID), map[string]any{"state": "exclusion", "memberId": member})
	if r.Status != 200 {
		t.Fatalf("exclusion = %d %s", r.Status, r.Body)
	}
	if n := count(t, env, `SELECT count(*) FROM member_ingredient_exclusions WHERE member_id = ? AND ingredient_id = ?`, member, bech.BaseIngredientID); n != 1 {
		t.Error("the Exclusion is stored as the Exclusion of the Base recipe's Ingredient")
	}
}
