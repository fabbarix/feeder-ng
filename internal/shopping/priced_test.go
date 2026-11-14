package shopping_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// B9-06: the priced fallback (SSP-13) and the Planned Meals a Line is for (SSP-14), on Derive itself.

func TestDeriveUsesThePricedPackOnlyWhenNothingWasBought(t *testing.T) {
	in := input(dinner("2026-11-09", 1, need(passata, 700), need(milk, 1000)))
	in.Packs = map[int64]shopping.Pack{milk: {ProductID: 1, Name: "Milk 1 l", Size: 1000}}
	in.Priced = map[int64]shopping.Pack{
		passata: {ProductID: 7, Name: "Mutti 700 g", Size: 700},
		milk:    {ProductID: 8, Name: "Cheaper milk", Size: 500},
	}
	in.PackPrices = map[int64]int{1: 129, 7: 349, 8: 50}
	l := shopping.Derive(in)

	p := line(t, l, passata)
	if p.Pack == nil || p.Pack.ProductID != 7 || p.Pack.Bought || p.EstimatedCostCents == nil || *p.EstimatedCostCents != 349 {
		t.Errorf("Passata = %+v / %+v, want the priced Mutti, not bought, 349", p.Pack, p.EstimatedCostCents)
	}
	m := line(t, l, milk)
	if m.Pack == nil || m.Pack.ProductID != 1 || !m.Pack.Bought {
		t.Errorf("Milk pack = %+v, want the Product last bought, Bought", m.Pack)
	}
	if l.UnpricedLines != 0 || l.EstimatedCostCents != 349+129 {
		t.Errorf("unpriced %d, estimate %d; want 0 and 478", l.UnpricedLines, l.EstimatedCostCents)
	}
}

func TestDeriveNamesEveryPlannedMealOfALineOnceInDateOrder(t *testing.T) {
	named := func(m shopping.Meal, recipe, course string) shopping.Meal {
		m.SlotID, m.SlotName, m.CourseName, m.RecipeName = 2, "Dinner", course, recipe
		return m
	}
	late := named(dinner("2026-11-11", 1, need(rice, 100)), "Risotto", "Main")
	early := named(dinner("2026-11-10", 1, need(rice, 50), need(milk, 0)), "Rice salad", "Starter")
	optional := named(dinner("2026-11-12", 1, shopping.Need{IngredientID: rice, Quantity: 80, Optional: true}), "Curry", "Main")
	l := shopping.Derive(input(late, early, optional))

	got := line(t, l, rice).PlannedMeals
	want := []shopping.PlannedMeal{
		{Date: stock.Date("2026-11-10"), MealSlotID: 2, MealSlotName: "Dinner", CourseName: "Starter", RecipeName: "Rice salad"},
		{Date: stock.Date("2026-11-11"), MealSlotID: 2, MealSlotName: "Dinner", CourseName: "Main", RecipeName: "Risotto"},
	}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("PlannedMeals = %+v, want %+v (an optional need is not a need)", got, want)
	}
}

// B9-23, extra 2: the Price behind a priced fallback travels with the pack, so the Line sheet can say "$2.99 a pack,
// 14 Nov · not bought here yet" with no second read. Input.Priced's Pack carries it in Pack.Price; the Line's
// PackSuggestion copies it for a priced fallback only (Bought false).
func TestDeriveCarriesThePriceBehindAPricedFallback(t *testing.T) {
	in := input(dinner("2026-11-09", 1, need(passata, 700), need(milk, 1000)))
	price := &shopping.PackPrice{Cents: 299, Date: "2026-11-14", ShopID: 2}
	in.Packs = map[int64]shopping.Pack{milk: {ProductID: 1, Name: "Milk 1 l", Size: 1000, Price: &shopping.PackPrice{Cents: 129, Date: "2026-11-01", ShopID: 1}}}
	in.Priced = map[int64]shopping.Pack{passata: {ProductID: 7, Name: "Mutti 700 g", Size: 700, Price: price}}
	in.PackPrices = map[int64]int{1: 129, 7: 299}
	l := shopping.Derive(in)

	p := line(t, l, passata)
	if p.Pack == nil || p.Pack.Price == nil || *p.Pack.Price != *price {
		t.Fatalf("Passata pack = %+v, want Price %+v", p.Pack, price)
	}
	if m := line(t, l, milk); m.Pack == nil || m.Pack.Price != nil {
		t.Errorf("a Product last bought carries no Price on the pack: %+v", m.Pack)
	}
}
