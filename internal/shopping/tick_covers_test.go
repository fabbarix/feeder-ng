package shopping_test

import (
	"math"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// B9-23 (SSP-02, RES-03): Derive and a tick that covers an amount. A ticked Line whose need grew keeps its place in
// Ticked and reappears as an open row ("More since your tick") through Line.More. The Stock the tick added is in
// Input.Lots, as it is in the real list, so the Line's Quantity is the need less all Stock.

func tickedChicken(need float64, tick shopping.Tick, stockQty float64) shopping.Input {
	in := input(dinner("2026-11-10", 1, need2(chicken, need)))
	tick.IngredientID = chicken
	if tick.By == "" {
		tick.By = "hand"
	}
	in.Ticks = map[int64]shopping.Tick{chicken: tick}
	if stockQty > 0 {
		in.Lots = []stock.Lot{{ID: 1, IngredientID: chicken, Quantity: stockQty, Purchased: "2026-11-09"}}
	}
	return in
}

func need2(ing int64, q float64) shopping.Need { return shopping.Need{IngredientID: ing, Quantity: q} }

func TestDeriveTickedChickenWhoseNeedGrowsBy750Reappears(t *testing.T) {
	// Ticked at 800 g with 800 g added; a Recipe import raises the need to 1550 g.
	l := shopping.Derive(tickedChicken(1550, shopping.Tick{Needed: 800, Added: 800}, 800))
	c := line(t, l, chicken)
	if !c.Ticked || !near(c.More, 750) {
		t.Fatalf("Chicken Ticked %v More %v, want a ticked Line with 750 g more", c.Ticked, c.More)
	}
	if l.Progress.Total != 2 || l.Progress.Ticked != 1 || l.Complete {
		t.Errorf("progress = %+v complete %v; want 1 of 2 (the extra row counts as an open Line) and not complete", l.Progress, l.Complete)
	}
}

func TestDeriveTickedLineWithNoGrowthHasNoMore(t *testing.T) {
	l := shopping.Derive(tickedChicken(800, shopping.Tick{Needed: 800, Added: 800}, 800))
	c := line(t, l, chicken)
	if !c.Ticked || c.More != 0 || l.Progress.Total != 1 || !l.Complete {
		t.Errorf("Chicken %+v progress %+v complete %v; want ticked, no more, 1 of 1, complete", c, l.Progress, l.Complete)
	}
}

func TestDeriveTickWithoutAddingStaysCoveredUntilTheNeedGrows(t *testing.T) {
	// Q0 800, nothing added, no Stock: the Line's Quantity is 800 and that is what the tick covered.
	c := line(t, shopping.Derive(tickedChicken(800, shopping.Tick{Needed: 800}, 0)), chicken)
	if !c.Ticked || c.More != 0 {
		t.Errorf("Tick without adding: Ticked %v More %v, want ticked and no more", c.Ticked, c.More)
	}
	c = line(t, shopping.Derive(tickedChicken(1550, shopping.Tick{Needed: 800}, 0)), chicken)
	if !c.Ticked || !near(c.More, 750) {
		t.Errorf("Tick without adding, need now 1550: Ticked %v More %v, want 750 more", c.Ticked, c.More)
	}
}

func TestDeriveAPackSmallerThanTheNeedLeavesTheRestCovered(t *testing.T) {
	// Q0 800, a 500 g pack added: 300 g are still open and covered by the tick. Growth of 750 is the more.
	c := line(t, shopping.Derive(tickedChicken(800, shopping.Tick{Needed: 800, Added: 500}, 500)), chicken)
	if c.More != 0 {
		t.Errorf("More = %v, want 0: the 300 g left over were already covered by the tick", c.More)
	}
	c = line(t, shopping.Derive(tickedChicken(1550, shopping.Tick{Needed: 800, Added: 500}, 500)), chicken)
	if !near(c.More, 750) {
		t.Errorf("More = %v, want 750", c.More)
	}
}

func TestDeriveShrinkingNeedAfterATickHasNoMore(t *testing.T) {
	l := shopping.Derive(tickedChicken(500, shopping.Tick{Needed: 800, Added: 800}, 800))
	c := line(t, l, chicken)
	if !c.Ticked || c.More != 0 || !l.Complete {
		t.Errorf("Chicken %+v complete %v; want ticked, no more, complete", c, l.Complete)
	}
}

func TestDeriveASecondAdditionShrinksTheMore(t *testing.T) {
	// Two ticks: covers 800 and 750 (Needed is the largest, 800) and 800 + 200 added. Need 1550 with 1000 g in Stock.
	tick := shopping.Tick{Needed: 800, Added: 1000, Additions: []shopping.Addition{
		{By: "hand", Quantity: 800, Covers: 800, LotID: 1, ClientUUID: "a"},
		{By: "hand", Quantity: 200, Covers: 750, LotID: 2, ClientUUID: "b"},
	}}
	c := line(t, shopping.Derive(tickedChicken(1550, tick, 1000)), chicken)
	if !near(c.More, 550) {
		t.Errorf("More = %v, want 550 (1550 need - 1000 Stock; nothing of the 800 covered is uncovered): the second purchase shrinks it", c.More)
	}
}

func TestDeriveNotNeededOnTheMoreTakesOnlyTheDifferenceOff(t *testing.T) {
	in := tickedChicken(1550, shopping.Tick{Needed: 800, Added: 800}, 800)
	in.NotNeeded = map[int64]shopping.NotNeeded{chicken: {IngredientID: chicken, Needed: 750}}
	l := shopping.Derive(in)
	c := line(t, l, chicken)
	if !c.Ticked || c.More != 0 || len(l.NotNeeded) != 0 || l.Progress.Total != 1 {
		t.Fatalf("Chicken %+v NotNeeded %v progress %+v; want the ticked Line to stay, with no more, and no Not needed Line", c, l.NotNeeded, l.Progress)
	}
	// The need grows by another 100 g: only what is past the 750 g marked reappears.
	in = tickedChicken(1650, shopping.Tick{Needed: 800, Added: 800}, 800)
	in.NotNeeded = map[int64]shopping.NotNeeded{chicken: {IngredientID: chicken, Needed: 750}}
	if c := line(t, shopping.Derive(in), chicken); !near(c.More, 100) {
		t.Errorf("More = %v, want 100", c.More)
	}
}

func TestDeriveTheMoreRowHasItsOwnPackSuggestionAndEstimate(t *testing.T) {
	in := tickedChicken(1550, shopping.Tick{Needed: 800, Added: 800}, 800)
	in.Packs = map[int64]shopping.Pack{chicken: {ProductID: 5, Name: "Chicken 500 g", Size: 500}}
	in.PackPrices = map[int64]int{5: 400}
	l := shopping.Derive(in)
	c := line(t, l, chicken)
	if c.Pack == nil || c.Pack.Count != 2 || c.EstimatedCostCents == nil || *c.EstimatedCostCents != 800 {
		t.Fatalf("Chicken pack %+v cost %v; want 2 packs for the 750 g more, 800 cents", c.Pack, c.EstimatedCostCents)
	}
	if l.EstimatedCostCents != 800 || l.UnpricedLines != 0 {
		t.Errorf("list estimate %d unpriced %d; want 800 and 0: the more row is an open Line", l.EstimatedCostCents, l.UnpricedLines)
	}
	// A ticked Line without more has no suggestion, as before.
	l = shopping.Derive(tickedChicken(800, shopping.Tick{Needed: 800, Added: 800}, 800))
	if c := line(t, l, chicken); c.Pack != nil || c.EstimatedCostCents != nil {
		t.Errorf("ticked Line without more has pack %+v cost %v", c.Pack, c.EstimatedCostCents)
	}
}

func TestDeriveTheLineCarriesItsTick(t *testing.T) {
	at := time.Date(2026, 11, 9, 10, 12, 0, 0, time.UTC)
	tick := shopping.Tick{Needed: 800, Added: 800, By: "hand", Additions: []shopping.Addition{{By: "hand", Quantity: 800, Covers: 800, LotID: 1, ClientUUID: "a", TickedAt: at}}}
	c := line(t, shopping.Derive(tickedChicken(800, tick, 800)), chicken)
	if c.Tick == nil || c.Tick.By != "hand" || c.Tick.Added != 800 || len(c.Tick.Additions) != 1 || c.Tick.Additions[0].ClientUUID != "a" || !c.Tick.Additions[0].TickedAt.Equal(at) {
		t.Errorf("Line.Tick = %+v, want the tick with its addition", c.Tick)
	}
	// A Line covered by Stock and ticked (no derived Line) carries it too; an open Line has none.
	in := input(dinner("2026-11-10", 1, need(chicken, 300), need(rice, 100)))
	in.Ticks = map[int64]shopping.Tick{chicken: {IngredientID: chicken, Needed: 300, Added: 0, By: "scan"}}
	l := shopping.Derive(in)
	if c := line(t, l, chicken); c.Tick == nil || c.Tick.By != "scan" {
		t.Errorf("scan-ticked Line.Tick = %+v, want By scan", c.Tick)
	}
	if r := line(t, l, rice); r.Tick != nil {
		t.Errorf("open Line has Tick %+v", r.Tick)
	}
}

func TestDeriveAnIngredientExtraCarriesItsTick(t *testing.T) {
	in := input()
	in.Extras = []shopping.Extra{{ID: 1, IngredientID: milk, Quantity: 2000, Got: 2000, Ticked: true,
		Additions: []shopping.Addition{{By: "hand", Quantity: 2000, LotID: 3, ClientUUID: "x"}}}, {ID: 2, Text: "Napkins", Ticked: true}, {ID: 3, IngredientID: rice, Quantity: 500}}
	l := shopping.Derive(in)
	byID := map[int64]shopping.ExtraLine{}
	for _, e := range l.Extras {
		byID[e.ID] = e
	}
	if e := byID[1]; e.Tick == nil || e.Tick.Added != 2000 || e.Tick.By != "hand" || len(e.Tick.Additions) != 1 {
		t.Errorf("ticked Ingredient extra Tick = %+v, want Added 2000 by hand with its addition", e.Tick)
	}
	if e := byID[2]; e.Tick == nil || e.Tick.Added != 0 {
		t.Errorf("ticked text extra Tick = %+v, want a tick that added nothing", e.Tick)
	}
	if e := byID[3]; e.Tick != nil {
		t.Errorf("open extra Tick = %+v, want nil", e.Tick)
	}
}

func TestAnAdditionOfUnknownQuantityIsNeverSummedIntoAdded(t *testing.T) {
	// A tick from before migration 1560 (quantity +Inf in the store's convention) and a later addition of 200 g.
	as := []shopping.Addition{{By: "hand", LotID: 1, Quantity: math.Inf(1), Covers: 800}, {By: "hand", LotID: 2, Quantity: 200, Covers: 800}}
	sum, unknown := shopping.AddedOf(as)
	if sum != 200 || !unknown {
		t.Fatalf("AddedOf = %v, %v; want 200 (finite) and unknown", sum, unknown)
	}
	// The Line needs 800 g and the legacy tick's Lot covered it: nothing more, whatever its unknown quantity.
	l := shopping.Derive(tickedChicken(800, shopping.Tick{Needed: 800, Added: sum, AddedUnknown: true, Additions: as}, 1000))
	c := line(t, l, chicken)
	if !c.Ticked || c.More != 0 || math.IsInf(c.Tick.Added, 0) {
		t.Fatalf("Chicken Ticked %v More %v Added %v; want ticked, no More, a finite Added", c.Ticked, c.More, c.Tick.Added)
	}
	// The need grows by 300 g: that much reappears, as for any tick.
	l = shopping.Derive(tickedChicken(1100, shopping.Tick{Needed: 800, Added: sum, AddedUnknown: true, Additions: as}, 800))
	if c := line(t, l, chicken); !near(c.More, 300) {
		t.Errorf("More = %v, want 300", c.More)
	}
}
