package shopping_test

import (
	"math"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// "Now" is Monday 2026-11-09 12:00 UTC; dinners are at 19:00.
var now = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)

const (
	chicken = int64(1)
	passata = int64(2)
	milk    = int64(3)
	rice    = int64(4)
)

var ingredients = map[int64]shopping.IngredientInfo{
	chicken: {Name: "chicken thighs", BaseUnit: "g"},
	passata: {Name: "Passata", BaseUnit: "g"},
	milk:    {Name: "milk", BaseUnit: "ml"},
	rice:    {Name: "rice", BaseUnit: "g"},
}

func dinner(date string, batches float64, needs ...shopping.Need) shopping.Meal {
	at, _ := time.Parse("2006-01-02 15:04", date+" 19:00")
	return shopping.Meal{Date: stock.Date(date), At: at, Batches: batches, Needs: needs}
}

func need(ing int64, q float64) shopping.Need { return shopping.Need{IngredientID: ing, Quantity: q} }

func input(meals ...shopping.Meal) shopping.Input {
	return shopping.Input{Now: now, From: "2026-11-09", To: "2026-11-15", Meals: meals, Ingredients: ingredients}
}

func near(a, b float64) bool { return math.Abs(a-b) < 1e-6 }

func line(t *testing.T, l shopping.List, ing int64) shopping.Line {
	t.Helper()
	got, ok := l.LineFor(ing)
	if !ok {
		t.Fatalf("no Line for Ingredient %d in %+v", ing, l.Lines)
	}
	return got
}

func noLine(t *testing.T, l shopping.List, ing int64) {
	t.Helper()
	if got, ok := l.LineFor(ing); ok {
		t.Fatalf("unexpected Line for Ingredient %d: %+v", ing, got)
	}
}

func TestNeedIsBatchesTimesQuantitySummedOverMeals(t *testing.T) {
	l := shopping.Derive(input(
		dinner("2026-11-09", 2, need(chicken, 350)),
		dinner("2026-11-11", 1.5, need(chicken, 400), need(rice, 100)),
	))
	c := line(t, l, chicken)
	if !near(c.Need, 1300) || !near(c.Quantity, 1300) || !near(c.Available, 0) {
		t.Fatalf("chicken Need/Quantity/Available = %v/%v/%v, want 1300/1300/0", c.Need, c.Quantity, c.Available)
	}
	if c.Name != "chicken thighs" || c.BaseUnit != "g" {
		t.Fatalf("Line name/unit = %q/%q", c.Name, c.BaseUnit)
	}
	if r := line(t, l, rice); !near(r.Quantity, 150) {
		t.Fatalf("rice Quantity = %v, want 150", r.Quantity)
	}
}

func TestOptionalLinesAreExcluded(t *testing.T) {
	l := shopping.Derive(input(dinner("2026-11-09", 1, need(rice, 200), shopping.Need{IngredientID: milk, Quantity: 100, Optional: true})))
	noLine(t, l, milk)
	line(t, l, rice)
}

func TestLeftoverMealsNeedNothing(t *testing.T) {
	served := dinner("2026-11-10", 0, need(chicken, 400))
	served.Leftover = true
	served.Batches = 1 // even if a Batch count slipped through, a Leftover meal needs nothing
	l := shopping.Derive(input(dinner("2026-11-09", 1, need(chicken, 400)), served))
	if c := line(t, l, chicken); !near(c.Need, 400) {
		t.Fatalf("chicken Need = %v, want 400 (the Leftover meal adds nothing)", c.Need)
	}
}

func TestMealsOutsideTheRangeOrAlreadyPastAreIgnored(t *testing.T) {
	lunchGone := dinner("2026-11-09", 1, need(milk, 500))
	lunchGone.At = time.Date(2026, 11, 9, 11, 30, 0, 0, time.UTC) // before Now
	after := dinner("2026-11-16", 1, need(rice, 500))             // after To (2026-11-15)
	before := dinner("2026-11-08", 1, need(chicken, 500))         // before From
	lastDay := dinner("2026-11-15", 1, need(passata, 700))        // To is inclusive
	l := shopping.Derive(input(lunchGone, after, before, lastDay))
	noLine(t, l, milk)
	noLine(t, l, rice)
	noLine(t, l, chicken)
	line(t, l, passata)
}

func TestAvailableIsLotsStillWithinTheirGoOffDateOnTheDayEachMealNeedsThem(t *testing.T) {
	in := input(dinner("2026-11-09", 1, need(chicken, 300)), dinner("2026-11-11", 1, need(chicken, 300)))
	in.Lots = []stock.Lot{{ID: 1, IngredientID: chicken, Quantity: 500, Purchased: "2026-11-07", GoesOff: "2026-11-10"}}
	c := line(t, shopping.Derive(in), chicken)
	// Monday's 300 g come from the lot; it has gone off by Wednesday, so Wednesday's 300 g must be bought.
	if !near(c.Need, 600) || !near(c.Available, 300) || !near(c.Quantity, 300) {
		t.Fatalf("Need/Available/Quantity = %v/%v/%v, want 600/300/300", c.Need, c.Available, c.Quantity)
	}
}

func TestAGoOffDateIsStillGoodOnThatDay(t *testing.T) {
	in := input(dinner("2026-11-10", 1, need(chicken, 300)))
	in.Lots = []stock.Lot{{ID: 1, IngredientID: chicken, Quantity: 300, GoesOff: "2026-11-10"}}
	noLine(t, shopping.Derive(in), chicken)
}

func TestLotsThatGoOffSoonestAreUsedFirst(t *testing.T) {
	in := input(dinner("2026-11-09", 1, need(rice, 300)), dinner("2026-11-13", 1, need(rice, 150)))
	in.Lots = []stock.Lot{
		{ID: 1, IngredientID: rice, Quantity: 200, GoesOff: "2026-11-12"},
		{ID: 2, IngredientID: rice, Quantity: 200}, // never goes off
	}
	// Monday uses the 200 g that go off first plus 100 g of the other; Friday's 150 g find 100 g left, so 50 g are missing.
	r := line(t, shopping.Derive(in), rice)
	if !near(r.Quantity, 50) || !near(r.Available, 400) {
		t.Fatalf("Quantity/Available = %v/%v, want 50/400", r.Quantity, r.Available)
	}
}

func TestStockThatCoversTheNeedGivesNoLine(t *testing.T) {
	in := input(dinner("2026-11-09", 1, need(milk, 500)), dinner("2026-11-10", 1, need(milk, 500)))
	in.Lots = []stock.Lot{{ID: 1, IngredientID: milk, Quantity: 1000}}
	noLine(t, shopping.Derive(in), milk)
}

func TestOtherIngredientsLotsAreNotUsed(t *testing.T) {
	in := input(dinner("2026-11-09", 1, need(milk, 500)))
	in.Lots = []stock.Lot{{ID: 1, IngredientID: rice, Quantity: 5000}}
	if m := line(t, shopping.Derive(in), milk); !near(m.Quantity, 500) {
		t.Fatalf("milk Quantity = %v, want 500", m.Quantity)
	}
}

func TestPackSuggestionRoundsUpToWholePacks(t *testing.T) {
	cases := []struct {
		quantity  float64
		count     int
		remainder float64
	}{{1400, 2, 0}, {1401, 3, 699}, {700, 1, 0}, {50, 1, 650}, {699.9999999999, 1, 0.0000000001}}
	for _, c := range cases {
		got := shopping.SuggestPack(c.quantity, shopping.Pack{ProductID: 9, Name: "Mutti 700 g", Size: 700})
		if got.Count != c.count || !near(got.Remainder, c.remainder) || got.ProductID != 9 || got.Size != 700 || got.Name != "Mutti 700 g" {
			t.Errorf("SuggestPack(%v) = %+v, want %d packs, remainder %v", c.quantity, got, c.count, c.remainder)
		}
	}
}

func TestLineCarriesThePackSuggestionOfTheProductLastBought(t *testing.T) {
	in := input(dinner("2026-11-09", 2, need(passata, 700)))
	in.Packs = map[int64]shopping.Pack{passata: {ProductID: 7, Name: "Mutti 700 g", Size: 700}}
	p := line(t, shopping.Derive(in), passata)
	if !near(p.Quantity, 1400) || p.Pack == nil || p.Pack.Count != 2 || p.Pack.ProductID != 7 || !near(p.Pack.Remainder, 0) {
		t.Fatalf("Line = %+v pack %+v, want 1400 g as 2 packs", p, p.Pack)
	}
}

func TestWithoutAProductBoughtTheLineIsExactWithNoPack(t *testing.T) {
	p := line(t, shopping.Derive(input(dinner("2026-11-09", 1, need(passata, 450)))), passata)
	if p.Pack != nil || !near(p.Quantity, 450) || p.CostCents != nil {
		t.Fatalf("Line = %+v, want exactly 450 g, no Pack, no cost", p)
	}
}

func TestEstimatedCostIsPacksTimesThePackPrice(t *testing.T) {
	in := input(dinner("2026-11-09", 2, need(passata, 700), need(milk, 600), need(rice, 250)))
	in.Packs = map[int64]shopping.Pack{
		passata: {ProductID: 7, Name: "Mutti 700 g", Size: 700},
		milk:    {ProductID: 8, Name: "Milk 1 l", Size: 1000},
	}
	in.PackPrices = map[int64]int{7: 159} // no Price known for the milk; rice has no Product at all
	l := shopping.Derive(in)
	if p := line(t, l, passata); p.CostCents == nil || *p.CostCents != 318 {
		t.Fatalf("passata cost = %v, want 318 (2 x 159)", p.CostCents)
	}
	if m := line(t, l, milk); m.CostCents != nil {
		t.Fatalf("milk has no Price, cost = %v, want nil (shown as a dash)", *m.CostCents)
	}
	if line(t, l, rice).CostCents != nil {
		t.Fatalf("rice has no Product, want nil cost")
	}
	if l.EstimatedCostCents != 318 || l.UnpricedLines != 2 {
		t.Fatalf("EstimatedCostCents/UnpricedLines = %d/%d, want 318/2", l.EstimatedCostCents, l.UnpricedLines)
	}
}

func TestTickedLinesAreKeptButLeaveTheCost(t *testing.T) {
	in := input(dinner("2026-11-09", 1, need(passata, 700), need(milk, 500)))
	in.Packs = map[int64]shopping.Pack{passata: {ProductID: 7, Name: "Mutti 700 g", Size: 700}, milk: {ProductID: 8, Name: "Milk 1 l", Size: 1000}}
	in.PackPrices = map[int64]int{7: 159, 8: 120}
	in.Ticks = map[int64]shopping.Tick{passata: {IngredientID: passata, Needed: 700, By: "hand"}}
	l := shopping.Derive(in)
	p := line(t, l, passata)
	if !p.Ticked || p.Pack != nil || p.CostCents != nil {
		t.Fatalf("ticked passata = %+v, want Ticked, no Pack, no cost", p)
	}
	if l.EstimatedCostCents != 120 || l.UnpricedLines != 0 {
		t.Fatalf("EstimatedCostCents/UnpricedLines = %d/%d, want 120/0", l.EstimatedCostCents, l.UnpricedLines)
	}
}

func TestATickedIngredientStaysEvenWhenStockNowCoversIt(t *testing.T) {
	in := input(dinner("2026-11-09", 1, need(milk, 1000)))
	in.Lots = []stock.Lot{{ID: 5, IngredientID: milk, Quantity: 1000}} // the scan that ticked it
	in.Ticks = map[int64]shopping.Tick{milk: {IngredientID: milk, Needed: 1000, By: "scan"}}
	l := shopping.Derive(in)
	m := line(t, l, milk)
	if !m.Ticked || !near(m.Quantity, 0) || !near(m.Need, 1000) {
		t.Fatalf("tick-only Line = %+v, want Ticked, Quantity 0, Need 1000", m)
	}
	if l.Progress != (shopping.Progress{Done: 1, Total: 1}) || !l.Complete {
		t.Fatalf("Progress/Complete = %+v/%v, want 1 of 1 and complete", l.Progress, l.Complete)
	}
}

func TestLinesAreSortedByNameOpenFirstThenTicked(t *testing.T) {
	in := input(dinner("2026-11-09", 1, need(rice, 100), need(chicken, 100), need(passata, 100), need(milk, 100)))
	in.Ticks = map[int64]shopping.Tick{chicken: {IngredientID: chicken, Needed: 100, By: "hand"}}
	l := shopping.Derive(in)
	var got []string
	for _, ln := range l.Lines {
		got = append(got, ln.Name)
	}
	want := []string{"milk", "Passata", "rice", "chicken thighs"} // names compared ignoring case; the ticked Line last
	if len(got) != len(want) {
		t.Fatalf("lines = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("lines = %v, want %v", got, want)
		}
	}
}

func TestManualExtrasAreNotTiedToThePlan(t *testing.T) {
	in := input(dinner("2026-11-09", 1, need(milk, 500)))
	in.Extras = []shopping.Extra{
		{ID: 1, Text: "toilet paper"},
		{ID: 2, IngredientID: milk, Quantity: 1000, Got: 400},
		{ID: 3, Text: "candles", Ticked: true},
	}
	l := shopping.Derive(in)
	if m := line(t, l, milk); !near(m.Quantity, 500) {
		t.Fatalf("the milk extra must not merge into the plan Line: Quantity = %v, want 500", m.Quantity)
	}
	if len(l.Extras) != 3 {
		t.Fatalf("Extras = %+v, want 3", l.Extras)
	}
	if e := l.Extras[0]; e.ID != 1 || e.Text != "toilet paper" || e.Ticked {
		t.Fatalf("first extra = %+v", e)
	}
	if e := l.Extras[1]; e.ID != 2 || e.Name != "milk" || e.BaseUnit != "ml" || !near(e.Quantity, 600) {
		t.Fatalf("Ingredient extra = %+v, want milk with 600 ml remaining", e)
	}
	if e := l.Extras[2]; e.ID != 3 || !e.Ticked {
		t.Fatalf("ticked extra = %+v, want it last", e)
	}
	if l.Progress != (shopping.Progress{Done: 1, Total: 3 + 1}) {
		t.Fatalf("Progress = %+v, want 1 of 4 (one plan Line, three extras)", l.Progress)
	}
}

func TestProgressAndCompleteCountLinesAndExtras(t *testing.T) {
	in := input(dinner("2026-11-09", 1, need(rice, 100), need(milk, 100)))
	in.Ticks = map[int64]shopping.Tick{rice: {IngredientID: rice, Needed: 100, By: "scan"}}
	in.Extras = []shopping.Extra{{ID: 1, Text: "candles", Ticked: true}}
	l := shopping.Derive(in)
	if l.Progress != (shopping.Progress{Done: 2, Total: 3}) || l.Complete {
		t.Fatalf("Progress/Complete = %+v/%v, want 2 of 3, not complete", l.Progress, l.Complete)
	}
	in.Ticks[milk] = shopping.Tick{IngredientID: milk, Needed: 100, By: "hand"}
	if l = shopping.Derive(in); l.Progress != (shopping.Progress{Done: 3, Total: 3}) || !l.Complete {
		t.Fatalf("Progress/Complete = %+v/%v, want 3 of 3, complete", l.Progress, l.Complete)
	}
}

func TestAnEmptyListIsNotComplete(t *testing.T) {
	l := shopping.Derive(input())
	if l.Complete || l.Progress != (shopping.Progress{}) || len(l.Lines) != 0 || l.EstimatedCostCents != 0 {
		t.Fatalf("empty list = %+v", l)
	}
	if l.From != "2026-11-09" || l.To != "2026-11-15" {
		t.Fatalf("From/To = %s/%s", l.From, l.To)
	}
}
