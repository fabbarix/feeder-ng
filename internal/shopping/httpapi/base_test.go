package httpapi_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	shoppinghttp "github.com/fabbarix/feeder-ng/internal/shopping/httpapi"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// BR-F wiring (docs/dev/design/base-recipes.md sections 7, 14.1, 16): plans.Meals builds each Planned Meal's need tree
// from Store.NeedTree and the Shopping List is Stock first. Real Recipes through the API (BR-B), Planned Meals and Lots
// as rows, the list read over HTTP. The fixed clock reads Monday 2026-11-09 12:00 UTC.

type brLine struct {
	IngredientID     int64      `json:"ingredientId"`
	Name             string     `json:"name"`
	Need             float64    `json:"need"`
	Quantity         float64    `json:"quantity"`
	PastPlannedMeals []listPast `json:"pastPlannedMeals"`
}

type brList struct {
	Lines []brLine `json:"lines"`
}

type brWorld struct {
	t                    *testing.T
	env                  *testkit.Env
	user                 *testkit.Client
	milk, butter, flour  int64
	bechamel, bechamelIn int64 // the Base recipe and its Ingredient
	lasagne              int64
}

type created struct {
	ID               int64 `json:"id"`
	BaseIngredientID int64 `json:"baseIngredientId"`
}

func newBRWorld(t *testing.T) *brWorld {
	t.Helper()
	env := testkit.Start(t)
	w := &brWorld{t: t, env: env, user: env.LoginUser(t)}
	w.milk = seedIngredient(t, env, "milk", "ml")
	w.butter = seedIngredient(t, env, "butter", "g")
	w.flour = seedIngredient(t, env, "flour", "g")
	return w
}

func (w *brWorld) recipe(body map[string]any) created {
	w.t.Helper()
	body["tags"] = []string{}
	r := w.user.Post("/api/recipes", body)
	var out created
	r.MustJSON(w.t, &out)
	if r.Status != 201 {
		w.t.Fatalf("create %v = %d %s", body["name"], r.Status, r.Body)
	}
	return out
}

func line(ing int64, q float64, unit string) map[string]any {
	return map[string]any{"ingredientId": ing, "quantity": q, "unit": unit}
}

func callFor(base int64, q float64, unit string) map[string]any {
	return map[string]any{"baseRecipeId": base, "quantity": q, "unit": unit}
}

func (w *brWorld) base(name string, yield float64, unit string, lines ...map[string]any) created {
	return w.recipe(map[string]any{"name": name, "yield": yield, "yieldUnit": unit, "baseRecipe": true, "lines": lines})
}

func (w *brWorld) plain(name string, lines ...map[string]any) created {
	return w.recipe(map[string]any{"name": name, "yield": 4, "lines": lines})
}

// simple seeds Béchamel (Yield 1 l: 1000 ml milk, 60 g butter, 60 g flour) and a Lasagne calling for 500 ml of it.
func (w *brWorld) simple() {
	b := w.base("Béchamel", 1, "l", line(w.milk, 1000, "ml"), line(w.butter, 60, "g"), line(w.flour, 60, "g"))
	w.bechamel, w.bechamelIn = b.ID, b.BaseIngredientID
	w.lasagne = w.plain("Lasagne", callFor(b.ID, 500, "ml")).ID
}

func (w *brWorld) settle() {
	w.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	time.Sleep(150 * time.Millisecond)
	if err := w.env.App.WaitIdle(ctx); err != nil {
		w.t.Fatal(err)
	}
}

func (w *brWorld) exec(q string, args ...any) {
	w.t.Helper()
	if _, err := w.env.DB.Exec(q, args...); err != nil {
		w.t.Fatalf("%s: %v", q, err)
	}
}

// dinners adds a Dinner slot (usual time `at`) and a pinned Planned Meal of the Recipe on each date.
func (w *brWorld) dinners(at string, recipeID int64, batches float64, dates ...string) {
	w.t.Helper()
	w.settle() // the planner has finished with the Recipes just saved
	w.exec(`INSERT INTO meal_slots(id,weekday,name,time) VALUES (90,2,'Dinner',?)`, at)
	for _, d := range dates {
		w.exec(`INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,pinned,created_at,updated_at)
			VALUES (?,90,(SELECT id FROM courses WHERE name='Main'),?,?,?,1,'2026-11-09T12:00:00Z','2026-11-09T12:00:00Z')`, d, recipeID, batches, batches*4)
	}
}

func (w *brWorld) lot(ing int64, qty float64) {
	w.t.Helper()
	w.exec(`INSERT INTO stock_lots(ingredient_id, quantity, purchased, source, created_at) VALUES (?,?,'2026-11-09','manual','2026-11-09T12:00:00Z')`, ing, qty)
}

func (w *brWorld) list() brList {
	w.t.Helper()
	var v brList
	r := w.user.Get("/api/shopping/list?to=2026-11-15")
	r.MustJSON(w.t, &v)
	if r.Status != 200 {
		w.t.Fatalf("list = %d %s", r.Status, r.Body)
	}
	return v
}

func (v brList) find(ing int64) (brLine, bool) {
	for _, l := range v.Lines {
		if l.IngredientID == ing {
			return l, true
		}
	}
	return brLine{}, false
}

func (w *brWorld) wantLines(v brList, want map[int64]float64) {
	w.t.Helper()
	for ing, q := range want {
		l, ok := v.find(ing)
		if !ok || l.Quantity != q {
			w.t.Errorf("Ingredient %d: Line %+v (found %v), want Quantity %v; Lines %+v", ing, l, ok, q, v.Lines)
		}
	}
	if len(v.Lines) != len(want) {
		w.t.Errorf("Lines = %+v, want exactly the Ingredients %v", v.Lines, want)
	}
}

func TestAJarOfBechamelCoversPartOfALasagneAndTheRestIsListedAsIngredients(t *testing.T) {
	w := newBRWorld(t)
	w.simple()
	w.dinners("19:00", w.lasagne, 1, "2026-11-10")
	w.lot(w.bechamelIn, 300)
	// 500 ml asked, 300 ml in the jar, 200 ml to make: 200 ml milk, 12 g butter, 12 g flour. No line for Béchamel.
	w.wantLines(w.list(), map[int64]float64{w.milk: 200, w.butter: 12, w.flour: 12})
}

func TestAJarThatCoversAllOfItListsNothingForBechamelOrItsIngredients(t *testing.T) {
	w := newBRWorld(t)
	w.simple()
	w.dinners("19:00", w.lasagne, 1, "2026-11-10")
	w.lot(w.bechamelIn, 600)
	w.wantLines(w.list(), map[int64]float64{})
}

func TestWithoutAJarTheListAsksForTheBaseRecipesIngredientsNotForTheBaseRecipe(t *testing.T) {
	w := newBRWorld(t)
	w.simple()
	w.dinners("19:00", w.lasagne, 1, "2026-11-10")
	w.wantLines(w.list(), map[int64]float64{w.milk: 500, w.butter: 30, w.flour: 30})
}

func TestTwoPlannedMealsShareOneJar(t *testing.T) {
	w := newBRWorld(t)
	w.simple()
	w.dinners("19:00", w.lasagne, 1, "2026-11-10", "2026-11-11")
	w.lot(w.bechamelIn, 600)
	// Tuesday takes 500 ml of the jar, Wednesday finds 100 ml and makes the other 400 ml.
	w.wantLines(w.list(), map[int64]float64{w.milk: 400, w.butter: 24, w.flour: 24})
}

func TestNestedBaseRecipesResolveStockFirstThroughTheStore(t *testing.T) {
	w := newBRWorld(t)
	rx := w.base("Roux", 300, "g", line(w.butter, 150, "g"), line(w.flour, 150, "g"))
	b := w.base("Béchamel", 1, "l", line(w.milk, 1000, "ml"), callFor(rx.ID, 100, "g"))
	w.lasagne = w.plain("Lasagne", callFor(b.ID, 500, "ml")).ID
	w.dinners("19:00", w.lasagne, 1, "2026-11-10")
	w.lot(b.BaseIngredientID, 300)
	w.wantLines(w.list(), map[int64]float64{w.milk: 200, w.butter: 10, w.flour: 10})
	w.lot(rx.BaseIngredientID, 12) // 20 g of Roux are still to make; the jar covers 12, 8 g (2/5) are left
	w.wantLines(w.list(), map[int64]float64{w.milk: 200, w.butter: 4, w.flour: 4})
}

func TestAnEmptyBaseRecipeIsListedAsItself(t *testing.T) {
	w := newBRWorld(t)
	pesto := w.base("Pesto", 200, "g")
	toast := w.plain("Toast", line(w.flour, 100, "g"), callFor(pesto.ID, 50, "g"))
	w.dinners("19:00", toast.ID, 1, "2026-11-10")
	l, ok := w.list().find(pesto.BaseIngredientID)
	if !ok || l.Name != "Pesto" || l.Quantity != 50 {
		t.Fatalf("Pesto Line = %+v (found %v), want 50 g of Pesto itself", l, ok)
	}
	w.lot(pesto.BaseIngredientID, 20)
	if l, _ := w.list().find(pesto.BaseIngredientID); l.Quantity != 30 {
		t.Errorf("with a 20 g jar the Pesto Line = %+v, want 30", l)
	}
}

func TestAnArchivedBaseRecipeStillExpandsOnTheList(t *testing.T) {
	w := newBRWorld(t)
	w.simple()
	w.dinners("19:00", w.lasagne, 1, "2026-11-10")
	if r := w.user.Post(fmt.Sprintf("/api/recipes/%d/archive", w.bechamel), nil); r.Status != 200 && r.Status != 204 {
		t.Fatalf("archive Béchamel = %d %s", r.Status, r.Body)
	}
	w.wantLines(w.list(), map[int64]float64{w.milk: 500, w.butter: 30, w.flour: 30})
}

func TestThePastMealHintShowsOnLinesThatCameFromABaseRecipe(t *testing.T) {
	w := newBRWorld(t)
	w.simple()
	w.dinners("08:00", w.lasagne, 1, "2026-11-09") // Monday's dinner was at 08:00: over at 12:00, not marked Cooked
	w.lot(w.bechamelIn, 300)
	want := listPast{Date: "2026-11-09", MealSlotID: 90, MealSlotName: "Dinner", CourseName: "Main"}
	v := w.list()
	for _, ing := range []int64{w.milk, w.butter, w.flour} {
		l, ok := v.find(ing)
		if !ok || len(l.PastPlannedMeals) != 1 || l.PastPlannedMeals[0] != want {
			t.Errorf("Ingredient %d Line = %+v (found %v), want the unconfirmed Dinner named", ing, l, ok)
		}
	}
}

// ---- ShoppingNeeds, the conversion plans.Meals does from Store.NeedTree ----

func TestShoppingNeedsKeepsTheTreeNestedAndOptional(t *testing.T) {
	tree := []baserecipe.Need{
		{IngredientID: 1, Quantity: 200},
		{IngredientID: 10, Quantity: 500, BaseRecipeID: 7, Optional: true, Made: []baserecipe.Need{
			{IngredientID: 3, Quantity: 500, Optional: true},
			{IngredientID: 11, Quantity: 50, BaseRecipeID: 8, Optional: true, Made: []baserecipe.Need{{IngredientID: 12, Quantity: 25, Optional: true}}},
		}},
		{IngredientID: 14, Quantity: 50, BaseRecipeID: 9}, // an empty Base recipe: no Made
	}
	got := shoppinghttp.ShoppingNeeds(tree)
	if len(got) != 3 {
		t.Fatalf("ShoppingNeeds = %+v, want 3 nodes", got)
	}
	if g := got[0]; g.IngredientID != 1 || g.Quantity != 200 || g.Optional || g.Made != nil {
		t.Errorf("plain node = %+v", got[0])
	}
	b := got[1]
	if b.IngredientID != 10 || b.Quantity != 500 || !b.Optional || len(b.Made) != 2 || b.Made[0].IngredientID != 3 || len(b.Made[1].Made) != 1 || b.Made[1].Made[0].IngredientID != 12 || b.Made[1].Made[0].Quantity != 25 {
		t.Errorf("Base recipe node = %+v, want its Made children, nested, with Optional kept", b)
	}
	if e := got[2]; e.IngredientID != 14 || e.Quantity != 50 || e.Made != nil {
		t.Errorf("empty Base recipe node = %+v, want a plain Need of its Ingredient (Made nil)", e)
	}
}

// The tree plans.Meals reads is the one BR-G's Cooked reads: DBSources.NeedTrees (internal/plan/runner/basetree.go).
var _ = (*runner.DBSources).NeedTrees
