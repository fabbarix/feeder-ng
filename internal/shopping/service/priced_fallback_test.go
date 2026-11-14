package service_test

import (
	"context"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/service"
)

// B9-06, SSP-13 and SSP-14 (docs/design/ui-review-3/shopscan.md). These tests read the new fields by reflection,
// because shopping.Line, shopping.PackSuggestion and shopping.Meal live outside this package's files: a missing field
// fails the test with a clear message instead of failing to compile. The developer adds:
//   - shopping.PackSuggestion.Bought bool (true when the Pack is the Product last bought, false for a priced fallback);
//   - shopping.Line.PlannedMeals []shopping.PlannedMeal{Date, MealSlotID, MealSlotName, CourseName, RecipeName};
//   - shopping.Meal.RecipeName string;
//   - the Products port's PricedPacks(ctx, ingredientIDs, shopID) (map[int64]shopping.Pack, error), implemented in
//     internal/shopping/httpapi/wiring.go over productstore.Store.PricedPacks (B9-04's file: see the hand-back).

func field(t *testing.T, v any, name string) reflect.Value {
	t.Helper()
	rv := reflect.Indirect(reflect.ValueOf(v))
	f := rv.FieldByName(name)
	if !f.IsValid() {
		t.Fatalf("%s has no field %s yet", rv.Type(), name)
	}
	return f
}

func boughtOf(t *testing.T, l shopping.Line) bool {
	t.Helper()
	if l.Pack == nil {
		t.Fatalf("Line %s has no Pack", l.Name)
	}
	return field(t, l.Pack, "Bought").Bool()
}

func TestALineIsEstimatedFromAPriceBeforeTheFirstPurchase(t *testing.T) {
	e := newEnv(t)
	pass := e.ids[passata]
	e.plan.meals = []shopping.Meal{dinner("2026-11-09", 2, shopping.Need{IngredientID: pass, Quantity: 700})}
	e.products.priced = map[int64]shopping.Pack{pass: {ProductID: 7, Name: "Mutti 700 g", Size: 700}}
	e.products.prices = map[int64]int{7: 349}
	// Nothing was ever bought: LastBought answers nothing.
	v, err := e.svc.List(context.Background(), service.Query{})
	if err != nil {
		t.Fatal(err)
	}
	l := v.Lines[0]
	if l.Pack == nil || l.Pack.ProductID != 7 || l.Pack.Count != 2 {
		t.Fatalf("Pack = %+v, want 2 x the priced Mutti 700 g", l.Pack)
	}
	if l.EstimatedCostCents == nil || *l.EstimatedCostCents != 698 || v.EstimatedCostCents != 698 {
		t.Fatalf("estimate = %v / %d, want 698 (2 x 349)", l.EstimatedCostCents, v.EstimatedCostCents)
	}
	if boughtOf(t, l) {
		t.Errorf("Pack.Bought = true, want false: it is a priced fallback, not a purchase")
	}
}

func TestAPackLastBoughtBeatsThePricedFallback(t *testing.T) {
	e := newEnv(t)
	pass := e.ids[passata]
	e.plan.meals = []shopping.Meal{dinner("2026-11-09", 1, shopping.Need{IngredientID: pass, Quantity: 700})}
	e.products.packs = map[int64]shopping.Pack{pass: {ProductID: 7, Name: "Mutti 700 g", Size: 700}}
	e.products.priced = map[int64]shopping.Pack{pass: {ProductID: 8, Name: "Cheaper 500 g", Size: 500}}
	e.products.prices = map[int64]int{7: 349, 8: 199}
	v, err := e.svc.List(context.Background(), service.Query{})
	if err != nil {
		t.Fatal(err)
	}
	l := v.Lines[0]
	if l.Pack == nil || l.Pack.ProductID != 7 || !boughtOf(t, l) {
		t.Fatalf("Pack = %+v, want the Product last bought, Bought true", l.Pack)
	}
}

func TestThePricedFallbackIsAskedAtTheSelectedShop(t *testing.T) {
	e := newEnv(t)
	pass := e.ids[passata]
	e.plan.meals = []shopping.Meal{dinner("2026-11-09", 1, shopping.Need{IngredientID: pass, Quantity: 700})}
	if _, err := e.svc.List(context.Background(), service.Query{ShopID: ptr(int64(2))}); err != nil {
		t.Fatal(err)
	}
	if len(e.products.pricedShop) != 1 || e.products.pricedShop[0] == nil || *e.products.pricedShop[0] != 2 {
		t.Fatalf("PricedPacks was asked for Shop %v, want 2 (the selected Shop)", e.products.pricedShop)
	}
	if _, err := e.svc.List(context.Background(), service.Query{}); err != nil {
		t.Fatal(err)
	}
	if n := len(e.products.pricedShop); n != 2 || e.products.pricedShop[1] != nil {
		t.Fatalf("PricedPacks Shops = %v, want a second call with nil (any Shop)", e.products.pricedShop)
	}
}

func TestOnlyLinesWithNoPricedProductCountAsUnpriced(t *testing.T) {
	e := newEnv(t)
	pass, milkID := e.ids[passata], e.ids[milk]
	e.plan.meals = []shopping.Meal{dinner("2026-11-09", 1,
		shopping.Need{IngredientID: pass, Quantity: 700}, shopping.Need{IngredientID: milkID, Quantity: 1000})}
	e.products.priced = map[int64]shopping.Pack{pass: {ProductID: 7, Name: "Mutti 700 g", Size: 700}}
	e.products.prices = map[int64]int{7: 349}
	v, err := e.svc.List(context.Background(), service.Query{})
	if err != nil {
		t.Fatal(err)
	}
	if v.UnpricedLines != 1 {
		t.Fatalf("UnpricedLines = %d, want 1: Passata is priced by its Product, only Milk has none", v.UnpricedLines)
	}
}

// ---- SSP-14: plannedMeals ----

func withRecipe(t *testing.T, m shopping.Meal, recipe, slot, course string, slotID int64) shopping.Meal {
	t.Helper()
	field(t, &m, "RecipeName").SetString(recipe)
	m.SlotID, m.SlotName, m.CourseName = slotID, slot, course
	return m
}

func plannedOf(t *testing.T, l shopping.Line) []reflect.Value {
	t.Helper()
	pm := field(t, l, "PlannedMeals")
	out := make([]reflect.Value, pm.Len())
	for i := range out {
		out[i] = pm.Index(i)
	}
	return out
}

func str(t *testing.T, v reflect.Value, name string) string {
	t.Helper()
	return field(t, v.Interface(), name).String()
}

func TestALineCarriesThePlannedMealsItIsFor(t *testing.T) {
	e := newEnv(t)
	pass, milkID := e.ids[passata], e.ids[milk]
	e.plan.meals = []shopping.Meal{
		withRecipe(t, dinner("2026-11-09", 1, shopping.Need{IngredientID: pass, Quantity: 700}), "Pasta al pomodoro", "Dinner", "Main", 2),
		withRecipe(t, dinner("2026-11-11", 1, shopping.Need{IngredientID: pass, Quantity: 350}, shopping.Need{IngredientID: milkID, Quantity: 200}), "Lasagne", "Dinner", "Main", 2),
		withRecipe(t, dinner("2026-11-12", 1, shopping.Need{IngredientID: milkID, Quantity: 500}), "Rice pudding", "Dinner", "Dessert", 2),
	}
	v, err := e.svc.List(context.Background(), service.Query{})
	if err != nil {
		t.Fatal(err)
	}
	var passLine, milkLine shopping.Line
	for _, l := range v.Lines {
		switch l.IngredientID {
		case pass:
			passLine = l
		case milkID:
			milkLine = l
		}
	}
	got := plannedOf(t, passLine)
	if len(got) != 2 {
		t.Fatalf("Passata PlannedMeals = %d, want 2 (Mon and Wed dinners, not Thursday's pudding)", len(got))
	}
	first, second := got[0], got[1]
	if str(t, first, "Date") != "2026-11-09" || str(t, first, "MealSlotName") != "Dinner" || str(t, first, "CourseName") != "Main" ||
		str(t, first, "RecipeName") != "Pasta al pomodoro" || field(t, first.Interface(), "MealSlotID").Int() != 2 {
		t.Errorf("first = %+v, want Mon Dinner (slot 2) Main, Pasta al pomodoro", first)
	}
	if str(t, second, "Date") != "2026-11-11" || str(t, second, "RecipeName") != "Lasagne" {
		t.Errorf("second = %+v, want Wed Lasagne: in date order", second)
	}
	if n := len(plannedOf(t, milkLine)); n != 2 {
		t.Errorf("Milk PlannedMeals = %d, want 2 (Lasagne and Rice pudding)", n)
	}
}

func TestPlannedMealsIncludeMealsAheadAndPastOnesAndSkipLeftovers(t *testing.T) {
	e := newEnv(t)
	pass := e.ids[passata]
	past := withRecipe(t, dinner("2026-11-09", 1, shopping.Need{IngredientID: pass, Quantity: 100}), "Early lunch", "Lunch", "Main", 1)
	past.At = past.At.Add(-10 * 3600 * 1e9) // 09:00, before the household clock's 12:00
	leftover := withRecipe(t, dinner("2026-11-10", 1, shopping.Need{IngredientID: pass, Quantity: 999}), "Leftover chilli", "Dinner", "Main", 2)
	leftover.Leftover = true
	ahead := withRecipe(t, dinner("2026-11-13", 1, shopping.Need{IngredientID: pass, Quantity: 300}), "Bolognese", "Dinner", "Main", 2)
	e.plan.meals = []shopping.Meal{ahead, leftover, past}
	v, err := e.svc.List(context.Background(), service.Query{})
	if err != nil {
		t.Fatal(err)
	}
	got := plannedOf(t, v.Lines[0])
	if len(got) != 2 || str(t, got[0], "RecipeName") != "Early lunch" || str(t, got[1], "RecipeName") != "Bolognese" {
		names := []string{}
		for _, g := range got {
			names = append(names, str(t, g, "RecipeName"))
		}
		t.Fatalf("PlannedMeals = %v, want [Early lunch Bolognese]: past and ahead, by date, no Leftover", names)
	}
}

func TestARestockLineIsForNoPlannedMeal(t *testing.T) {
	e := newEnvWith(t, map[string]shopping.IngredientInfo{"Bin bags": {Name: "Bin bags", BaseUnit: "g", Supply: true, RestockLevel: ptr(10.0)}})
	v, err := e.svc.List(context.Background(), service.Query{})
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Lines) != 1 {
		t.Fatalf("Lines = %+v, want the one Restock Line", v.Lines)
	}
	if got := plannedOf(t, v.Lines[0]); len(got) != 0 {
		t.Errorf("a Restock Line is for no Planned Meal, got %d", len(got))
	}
}
