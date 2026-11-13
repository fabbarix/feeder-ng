package shopping_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// H4 (docs/dev/design/household-items.md §4.4): a Supply whose Stock is below its Restock level gets a Line of level
// less Stock, from today's Stock, whatever the range. The contract these tests pin:
//
//   - shopping.Restock(level, have) float64 is the pure rule: level - have when have < level, else 0.
//   - IngredientInfo gains Supply (bool) and RestockLevel (*float64, Base Units). Derive adds a Restock Line for every
//     Ingredient in Input.Ingredients that is a Supply with a level and whose Stock (the sum of its Lots in Input.Lots) is
//     below it. A food Ingredient with a stray level is ignored.
//   - The Line has Supply true, Restock = &RestockInfo{Level, Stock}, Need = level, Available = Stock, Quantity = level - Stock
//     (not rounded) and Pack = SuggestPack(Quantity, pack): packs are rounded up in the suggestion, as for every Line.
//   - A Line from the plan never gets Restock (a Supply is never planned; if it were, the plan's Line wins and is left alone).
//   - Lines sort: open food, open Supplies, ticked food, ticked Supplies; each group by name.
//   - ExtraLine gains Supply (bool).

const (
	paper   = int64(20) // Toilet paper, a Supply, piece
	bags    = int64(21) // Bin bags, a Supply, piece
	flourID = int64(22) // flour, food with a stray Restock level
	soapGel = int64(23)
)

func fp(v float64) *float64 { return &v }

func supplyInfo() map[int64]shopping.IngredientInfo {
	m := map[int64]shopping.IngredientInfo{}
	for k, v := range ingredients {
		m[k] = v
	}
	m[paper] = shopping.IngredientInfo{Name: "Toilet paper", BaseUnit: "piece", Supply: true, RestockLevel: fp(9)}
	m[bags] = shopping.IngredientInfo{Name: "Bin bags", BaseUnit: "piece", Supply: true, RestockLevel: fp(20)}
	m[flourID] = shopping.IngredientInfo{Name: "flour", BaseUnit: "g", RestockLevel: fp(500)}
	m[soapGel] = shopping.IngredientInfo{Name: "Dish soap", BaseUnit: "ml", Supply: true} // a Supply with no level
	return m
}

func supplyInput(lots ...stock.Lot) shopping.Input {
	return shopping.Input{Now: now, From: "2026-11-09", To: "2026-11-15", Lots: lots, Ingredients: supplyInfo()}
}

func lot(id, ing int64, q float64) stock.Lot {
	return stock.Lot{ID: id, IngredientID: ing, Quantity: q, Purchased: "2026-11-01", GoesOff: stock.None}
}

func TestRestockIsTheLevelLessStockWhenStockIsBelowTheLevel(t *testing.T) {
	for _, c := range []struct{ level, have, want float64 }{
		{9, 2, 7}, {9, 0, 9}, {9, 8.5, 0.5}, {20, 19, 1},
		{9, 9, 0}, {9, 10, 0}, {9, 100, 0}, // at or above the level: nothing
		{0.3, 0.1 + 0.2, 0}, // float noise at the level is not "below"
	} {
		if got := shopping.Restock(c.level, c.have); !near(got, c.want) {
			t.Errorf("Restock(level %v, stock %v) = %v, want %v", c.level, c.have, got, c.want)
		}
	}
}

func TestBelowTheRestockLevelTheListGetsALineOfLevelLessStock(t *testing.T) {
	l := shopping.Derive(supplyInput(lot(1, paper, 2)))
	got := line(t, l, paper)
	if !got.Supply || got.Name != "Toilet paper" || got.BaseUnit != "piece" {
		t.Fatalf("Line = %+v, want the Supply Toilet paper", got)
	}
	if !near(got.Quantity, 7) || !near(got.Need, 9) || !near(got.Available, 2) {
		t.Fatalf("Quantity/Need/Available = %v/%v/%v, want 7/9/2", got.Quantity, got.Need, got.Available)
	}
	if got.Restock == nil || !near(got.Restock.Level, 9) || !near(got.Restock.Stock, 2) {
		t.Fatalf("Restock = %+v, want level 9, stock 2", got.Restock)
	}
	if got.Ticked || len(got.PastPlannedMeals) != 0 {
		t.Fatalf("Line = %+v, want open and with no Planned Meals", got)
	}
}

func TestWithNoStockAtAllTheLineIsTheWholeLevel(t *testing.T) {
	l := shopping.Derive(supplyInput())
	if got := line(t, l, paper); !near(got.Quantity, 9) || got.Restock == nil || !near(got.Restock.Stock, 0) {
		t.Fatalf("Line = %+v, want 9 with Stock 0", got)
	}
}

func TestStockIsTheSumOfAllTheSuppliesLots(t *testing.T) {
	l := shopping.Derive(supplyInput(lot(1, paper, 2), lot(2, paper, 3), lot(3, bags, 100)))
	if got := line(t, l, paper); !near(got.Quantity, 4) || !near(got.Restock.Stock, 5) {
		t.Fatalf("Line = %+v, want 9 less 2+3 = 4", got)
	}
	noLine(t, l, bags) // 100 bags are in Stock: above the level of 20
}

func TestAtOrAboveTheRestockLevelThereIsNoLine(t *testing.T) {
	for name, lots := range map[string][]stock.Lot{
		"at the level":    {lot(1, paper, 9), lot(2, bags, 20)},
		"above the level": {lot(1, paper, 12), lot(2, bags, 21)},
		"in several Lots": {lot(1, paper, 4), lot(2, paper, 5), lot(3, bags, 20)},
	} {
		l := shopping.Derive(supplyInput(lots...))
		if len(l.Lines) != 0 {
			t.Errorf("%s: Lines = %+v, want none", name, l.Lines)
		}
	}
}

func TestASupplyWithoutALevelNeverGetsALine(t *testing.T) {
	l := shopping.Derive(supplyInput(lot(1, paper, 9), lot(2, bags, 20)))
	noLine(t, l, soapGel)
}

func TestAStrayLevelOnFoodIsIgnored(t *testing.T) {
	l := shopping.Derive(supplyInput(lot(1, paper, 9), lot(2, bags, 20)))
	noLine(t, l, flourID) // 0 g in Stock, level 500, but flour is food: levels are for Supplies only
}

func TestTheRangeAndThePlanDoNotChangeARestockLine(t *testing.T) {
	short := supplyInput(lot(1, paper, 2))
	short.To = "2026-11-09"
	long := supplyInput(lot(1, paper, 2))
	long.To = "2026-11-15"
	long.Meals = []shopping.Meal{dinner("2026-11-10", 1, need(rice, 100))}
	for name, in := range map[string]shopping.Input{"range of one day": short, "range of a week with a meal": long} {
		if got := line(t, shopping.Derive(in), paper); !near(got.Quantity, 7) {
			t.Errorf("%s: Quantity = %v, want 7", name, got.Quantity)
		}
	}
}

func TestARestockLineHasTheSuggestionRoundedUpToWholePacks(t *testing.T) {
	for _, c := range []struct {
		name      string
		have      float64
		size      float64
		wantQ     float64
		wantCount int
		wantRem   float64
	}{
		{"7 short of a pack of 9 is one pack", 2, 9, 7, 1, 2},
		{"nothing in Stock, level 9, packs of 9: one pack", 0, 9, 9, 1, 0}, // level 9: exactly one pack
		{"level 20 with 2 in Stock and packs of 6: 18 is three packs", 2, 6, 18, 3, 0},
		{"level 20 with 4 in Stock and packs of 6: 16 is three packs", 4, 6, 16, 3, 2},
	} {
		in := supplyInput(lot(1, bags, c.have))
		in.Packs = map[int64]shopping.Pack{bags: {ProductID: 5, Name: "Bin bags", Size: c.size}}
		got := line(t, shopping.Derive(in), bags)
		if !near(got.Quantity, c.wantQ) || got.Pack == nil || got.Pack.Count != c.wantCount || !near(got.Pack.Remainder, c.wantRem) {
			t.Errorf("%s: Quantity %v, Pack %+v; want %v and %d packs with %v left over", c.name, got.Quantity, got.Pack, c.wantQ, c.wantCount, c.wantRem)
		}
	}
}

func TestARestockLineIsPricedFromItsPackAndCountsInTheEstimate(t *testing.T) {
	in := supplyInput(lot(1, paper, 2), lot(2, bags, 5))
	in.Packs = map[int64]shopping.Pack{paper: {ProductID: 7, Name: "Lotus 9", Size: 9}}
	in.PackPrices = map[int64]int{7: 549}
	l := shopping.Derive(in)
	p := line(t, l, paper)
	if p.EstimatedCostCents == nil || *p.EstimatedCostCents != 549 || l.EstimatedCostCents != 549 {
		t.Fatalf("Toilet paper cost = %v, list estimate %d, want 549", p.EstimatedCostCents, l.EstimatedCostCents)
	}
	if l.UnpricedLines != 1 { // the Bin bags Line has no pack, so no Price
		t.Fatalf("UnpricedLines = %d, want 1", l.UnpricedLines)
	}
	if l.Progress.Total != 2 || l.Progress.Ticked != 0 {
		t.Fatalf("Progress = %+v, want 0 of 2: a Restock Line is a Line", l.Progress)
	}
}

// A Supply both restocked and added by hand shows both, as a food Line and its extra do today (§4.4).
func TestARestockLineAndAnExtraOfTheSameSupplyShowBoth(t *testing.T) {
	in := supplyInput(lot(1, paper, 2))
	in.Extras = []shopping.Extra{{ID: 1, IngredientID: paper, Quantity: 4}}
	l := shopping.Derive(in)
	got := line(t, l, paper)
	if !near(got.Quantity, 7) {
		t.Fatalf("Line Quantity = %v, want 7: the extra does not reduce the Restock Line", got.Quantity)
	}
	if len(l.Extras) != 1 || l.Extras[0].IngredientID != paper || !near(l.Extras[0].Quantity, 4) || !l.Extras[0].Supply {
		t.Fatalf("Extras = %+v, want Toilet paper x4, marked as a Supply", l.Extras)
	}
	if l.Progress.Total != 2 {
		t.Fatalf("Progress.Total = %d, want 2 (the Line and the extra)", l.Progress.Total)
	}
}

func TestAnExtraOfFoodIsNotASupply(t *testing.T) {
	in := supplyInput()
	in.Extras = []shopping.Extra{{ID: 1, IngredientID: milk, Quantity: 1000}, {ID: 2, Text: "candles"}}
	l := shopping.Derive(in)
	for _, e := range l.Extras {
		if e.Supply {
			t.Errorf("extra %+v is marked a Supply", e)
		}
	}
}

func TestAnExtraOfASupplyWithoutALevelIsMarkedASupply(t *testing.T) {
	in := supplyInput()
	in.Extras = []shopping.Extra{{ID: 1, IngredientID: soapGel, Quantity: 500}}
	l := shopping.Derive(in)
	if len(l.Extras) != 1 || !l.Extras[0].Supply || len(l.Lines) != 1 { // the only Line is Toilet paper at 0 of 9
		t.Fatalf("Extras = %+v, Lines = %+v", l.Extras, l.Lines)
	}
}

func TestTickedRestockLineWhoseStockWasBoughtStaysOnTheListTicked(t *testing.T) {
	in := supplyInput(lot(1, paper, 2), lot(2, paper, 7)) // 7 bought: Stock is now 9, at the level
	in.Ticks = map[int64]shopping.Tick{paper: {IngredientID: paper, Needed: 7, By: "hand"}}
	l := shopping.Derive(in)
	got := line(t, l, paper)
	if !got.Ticked || !got.Supply || !near(got.Need, 7) || got.Restock != nil {
		t.Fatalf("Line = %+v, want a ticked Supply Line of 7 and no Restock info (the level is met)", got)
	}
	if l.Progress.Ticked != 1 || l.Progress.Total != 1 || !l.Complete {
		t.Fatalf("Progress = %+v, Complete %v", l.Progress, l.Complete)
	}
}

func TestTickedRestockLineStillBelowTheLevelIsTickedWithoutPackOrCost(t *testing.T) {
	in := supplyInput(lot(1, paper, 2))
	in.Packs = map[int64]shopping.Pack{paper: {ProductID: 7, Name: "Lotus 9", Size: 9}}
	in.PackPrices = map[int64]int{7: 549}
	in.Ticks = map[int64]shopping.Tick{paper: {IngredientID: paper, Needed: 7, By: "hand"}}
	l := shopping.Derive(in)
	got := line(t, l, paper)
	if !got.Ticked || got.Pack != nil || got.EstimatedCostCents != nil || l.EstimatedCostCents != 0 {
		t.Fatalf("Line = %+v, estimate %d; want ticked, no pack, no cost", got, l.EstimatedCostCents)
	}
}

func TestNotNeededTakesARestockLineOffTheListForTheRange(t *testing.T) {
	in := supplyInput(lot(1, paper, 2))
	in.NotNeeded = map[int64]shopping.NotNeeded{paper: {IngredientID: paper, Needed: 7}}
	l := shopping.Derive(in)
	noLine(t, l, paper)
	if len(l.NotNeeded) != 1 || l.NotNeeded[0].IngredientID != paper || !l.NotNeeded[0].Supply || !near(l.NotNeeded[0].Quantity, 7) {
		t.Fatalf("NotNeeded = %+v, want the Toilet paper Line, marked a Supply", l.NotNeeded)
	}
	if l.Progress.Total != 0 {
		t.Fatalf("Progress.Total = %d, want 0: Not needed Lines are not counted", l.Progress.Total)
	}
}

func TestSuppliesSortAfterFoodAmongOpenLinesAndAmongTickedLines(t *testing.T) {
	in := supplyInput(lot(1, paper, 2), lot(2, bags, 5), lot(3, 99, 1))
	in.Ingredients[99] = shopping.IngredientInfo{Name: "Zebra gel", BaseUnit: "ml", Supply: true, RestockLevel: fp(10)}
	// food Lines: rice and milk, from the plan; Passata is ticked (food) and Zebra gel is ticked (Supply).
	in.Meals = []shopping.Meal{dinner("2026-11-10", 1, need(rice, 100), need(milk, 100), need(passata, 100))}
	in.Ticks = map[int64]shopping.Tick{passata: {IngredientID: passata, Needed: 100, By: "hand"}, 99: {IngredientID: 99, Needed: 9, By: "hand"}}
	l := shopping.Derive(in)
	var got []string
	for _, ln := range l.Lines {
		got = append(got, ln.Name)
	}
	want := []string{"milk", "rice", "Bin bags", "Toilet paper", "Passata", "Zebra gel"}
	if len(got) != len(want) {
		t.Fatalf("Lines = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("Lines = %v, want %v (open food, open Supplies, ticked food, ticked Supplies; each by name)", got, want)
		}
	}
}

func TestAFoodLineNeverCarriesSupplyOrRestock(t *testing.T) {
	in := supplyInput(lot(1, paper, 9), lot(2, bags, 20))
	in.Meals = []shopping.Meal{dinner("2026-11-10", 1, need(rice, 100))}
	if r := line(t, shopping.Derive(in), rice); r.Supply || r.Restock != nil {
		t.Fatalf("rice Line = %+v, want a food Line with no Restock", r)
	}
}
