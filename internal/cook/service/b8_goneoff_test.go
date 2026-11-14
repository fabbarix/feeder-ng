package service_test

import (
	"context"
	"errors"
	"github.com/fabbarix/feeder-ng/internal/units"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook/service"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	recipestore "github.com/fabbarix/feeder-ng/internal/recipe/store"
	"github.com/fabbarix/feeder-ng/internal/stock/stocktest"
)

// beta.8, base team (docs/dev/design/b8-base.md section 2): Cook Mode's cover check ignores Stock Lots that have gone off by
// the meal's date, as the Shopping List does. The Recipes port gets the meal's date:
//
//	MealSteps(ctx, recipeID, batches, date string)   and   SlotMeal{RecipeID, Batches, Date}
//
// The adapter counts Stock with stock.UsableOn(lots, later of the meal date and the household's today) (a meal of a past
// date is judged by today: nothing that has gone off since covers it). Cooked is not touched.

func TestTheServiceGivesTheMealsDateToTheRecipesPort(t *testing.T) {
	svc, recipes, _ := brgSetup(t)
	if _, err := svc.CourseView(ctx, "2026-11-09", 3, 5); err != nil {
		t.Fatal(err)
	}
	if recipes.lastDate != "2026-11-09" {
		t.Errorf("MealSteps got date %q, want the Planned Meal's 2026-11-09", recipes.lastDate)
	}
}

type goneOffWorld struct {
	svc              service.Recipes
	lasagne          int64
	bechamelIng      int64
	addLot           func(t *testing.T, goesOff string)
	coveredAt        func(t *testing.T, date string) bool
	coveredViaSlotAt func(t *testing.T, date string) bool
}

// newGoneOffWorld is the real adapters over a database holding Béchamel (a Base recipe) and Lasagne (500 g of it); today is
// 2026-11-09.
func newGoneOffWorld(t *testing.T) *goneOffWorld {
	t.Helper()
	d := stocktest.NewDB(t)
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	milk := stocktest.SeedIngredient(t, d, "milk", "g", nil)
	spinach := stocktest.SeedIngredient(t, d, "spinach", "g", nil)
	ings := ingredientstore.New(d, clk, ingredientstore.WithBaseRecipes(recipestore.NewBaseRecipePort(d)))
	rs := recipestore.New(d, clk, ingredientUnitsOf{ings}).WithIngredients(ings)
	yes := true
	base, err := rs.Create(ctx, recipe.Input{Name: "Béchamel", Yield: 1000, YieldUnit: "g", BaseRecipe: &yes,
		Lines: []recipe.Line{{IngredientID: milk, Quantity: 1000, Unit: "g"}},
		Steps: []recipe.Step{{Text: "Simmer the sauce", Kind: schedule.Passive, DurationMinutes: 20}}})
	if err != nil {
		t.Fatalf("create Béchamel: %v", err)
	}
	lasagne, err := rs.Create(ctx, recipe.Input{Name: "Lasagne", Yield: 4,
		Lines: []recipe.Line{{IngredientID: spinach, Quantity: 200, Unit: "g"}, {BaseRecipeID: base.ID, Quantity: 500, Unit: "g"}},
		Steps: []recipe.Step{{Text: "Bake", Kind: schedule.Passive, DurationMinutes: 30}}})
	if err != nil {
		t.Fatalf("create Lasagne: %v", err)
	}
	w := &goneOffWorld{svc: service.NewDB(d, clk).Recipes(), lasagne: lasagne.ID, bechamelIng: base.BaseIngredientID}
	w.addLot = func(t *testing.T, goesOff string) {
		t.Helper()
		var off any
		if goesOff != "" {
			off = goesOff
		}
		exec(t, d, `INSERT INTO stock_lots(ingredient_id,quantity,purchased,goes_off,source,created_at) VALUES (?,500,'2026-11-01',?,'manual','2026-11-01T00:00:00Z')`, w.bechamelIng, off)
	}
	w.coveredAt = func(t *testing.T, date string) bool {
		t.Helper()
		got, err := w.svc.(service.MealRecipes).MealSteps(ctx, w.lasagne, 1, date)
		if err != nil {
			t.Fatal(err)
		}
		for _, st := range got.Steps {
			if st.BaseRecipe != nil && st.Covered {
				return true
			}
		}
		return false
	}
	w.coveredViaSlotAt = func(t *testing.T, date string) bool {
		t.Helper()
		got, err := w.svc.(service.SlotRecipes).SlotSteps(ctx, []service.SlotMeal{{RecipeID: w.lasagne, Batches: 1, Date: date}})
		if err != nil {
			t.Fatal(err)
		}
		for _, st := range got[0].Steps {
			if st.BaseRecipe != nil && st.Covered {
				return true
			}
		}
		return false
	}
	return w
}

// ingredientUnitsOf gives the recipe store the Ingredients' unit conversions.
type ingredientUnitsOf struct{ st *ingredientstore.Store }

func (u ingredientUnitsOf) Units(ctx context.Context, id int64) (units.Ingredient, bool, error) {
	ing, err := u.st.Get(ctx, id)
	if errors.Is(err, ingredientstore.ErrNotFound) {
		return units.Ingredient{}, false, nil
	}
	if err != nil {
		return units.Ingredient{}, false, err
	}
	return ing.Units(), true, nil
}

func TestAJarThatHasNotGoneOffCoversTheBaseRecipeForTheMeal(t *testing.T) {
	w := newGoneOffWorld(t)
	w.addLot(t, "2026-11-12")
	if !w.coveredAt(t, "2026-11-09") || !w.coveredViaSlotAt(t, "2026-11-09") {
		t.Error("a jar good until the 12th covers a meal on the 9th: its Béchamel Steps are hidden")
	}
}

func TestAJarThatHasGoneOffByTheMealDateDoesNotCover(t *testing.T) {
	w := newGoneOffWorld(t)
	w.addLot(t, "2026-11-10")
	if w.coveredAt(t, "2026-11-12") || w.coveredViaSlotAt(t, "2026-11-12") {
		t.Error("a jar that goes off on the 10th does not cover a meal on the 12th: the Shopping List asks to buy Béchamel, so Cook Mode shows its Steps")
	}
	if !w.coveredAt(t, "2026-11-10") {
		t.Error("the jar is still usable on its go-off date")
	}
}

func TestAJarThatWentOffBeforeTodayDoesNotCoverAMealOfAPastDate(t *testing.T) {
	w := newGoneOffWorld(t)
	w.addLot(t, "2026-11-07") // good on the 5th, gone off by today (the 9th)
	if w.coveredAt(t, "2026-11-05") {
		t.Error("a past meal is judged by today, as the Shopping List does: the jar has gone off")
	}
}

func TestAJarWithNoShelfLifeAlwaysCovers(t *testing.T) {
	w := newGoneOffWorld(t)
	w.addLot(t, "")
	if !w.coveredAt(t, "2026-12-24") {
		t.Error("a Lot without a go-off date never goes off")
	}
}
