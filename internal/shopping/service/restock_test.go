package service_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/service"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// H4: the service feeds Restock Lines to Derive. The Ingredients port gains
//
//	RestockSupplies(ctx) (map[int64]shopping.IngredientInfo, error)
//
// which returns every Supply that has a Restock level (Supply true, RestockLevel set), and the service merges those into
// the Info it gives Derive, asks LastBought and PackPrices about them too, and ticks, buys and scans them like any Line.

const (
	tissue = "Toilet paper"
	gel    = "Dish soap"
)

func fp(v float64) *float64 { return &v }

func supplyEnv(t *testing.T) *env {
	t.Helper()
	e := newEnvWith(t, map[string]shopping.IngredientInfo{
		tissue: {Name: tissue, BaseUnit: "piece", Supply: true, RestockLevel: fp(9)},
		gel:    {Name: gel, BaseUnit: "ml", Supply: true}, // no level
	})
	e.products.packs = map[int64]shopping.Pack{e.ids[tissue]: {ProductID: 7, Name: "Lotus 9 rolls", Size: 9}}
	e.products.prices = map[int64]int{7: 549}
	return e
}

func setStock(e *env, name string, qty float64) {
	e.stock.lots = append(e.stock.lots, stock.Lot{ID: int64(len(e.stock.lots) + 100), IngredientID: e.ids[name], Quantity: qty, Purchased: "2026-11-01", GoesOff: stock.None})
}

func TestTheListHasARestockLineForASupplyBelowItsLevelWithPacksAndCost(t *testing.T) {
	e := supplyEnv(t)
	setStock(e, tissue, 2)
	v, err := e.svc.List(context.Background(), service.Query{})
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Lines) != 1 {
		t.Fatalf("Lines = %+v, want only Toilet paper (Dish soap has no level)", v.Lines)
	}
	l := v.Lines[0]
	if !l.Supply || l.Name != tissue || l.Quantity != 7 || l.Restock == nil || l.Restock.Level != 9 || l.Restock.Stock != 2 {
		t.Fatalf("Line = %+v, want Toilet paper, 7 to buy, Below 9 with 2 in Stock", l)
	}
	if l.Pack == nil || l.Pack.Count != 1 || l.EstimatedCostCents == nil || *l.EstimatedCostCents != 549 || v.EstimatedCostCents != 549 {
		t.Fatalf("Pack %+v, cost %v, estimate %d; want 1 x Lotus 9 rolls at 549", l.Pack, l.EstimatedCostCents, v.EstimatedCostCents)
	}
}

func TestNoRestockLineAtOrAboveTheLevel(t *testing.T) {
	e := supplyEnv(t)
	setStock(e, tissue, 9)
	v, _ := e.svc.List(context.Background(), service.Query{})
	if len(v.Lines) != 0 {
		t.Fatalf("Lines = %+v, want none at the level", v.Lines)
	}
}

func TestTheRestockLineDoesNotDependOnTheRange(t *testing.T) {
	e := supplyEnv(t)
	setStock(e, tissue, 2)
	for _, to := range []stock.Date{"2026-11-09", "2026-11-12", "2026-11-15"} {
		v, _ := e.svc.List(context.Background(), service.Query{To: to})
		if len(v.Lines) != 1 || v.Lines[0].Quantity != 7 {
			t.Errorf("range to %s: Lines = %+v, want one Restock Line of 7", to, v.Lines)
		}
	}
}

func TestTickingARestockLineByHandAddsTheStockAndKeepsTheLineTicked(t *testing.T) {
	e := supplyEnv(t)
	ctx := context.Background()
	setStock(e, tissue, 2)
	id := e.ids[tissue]
	res, err := e.svc.Tick(ctx, service.TickInput{IngredientID: id, To: "2026-11-15", Quantity: 9, ClientUUID: "restock-1"})
	if err != nil || res.LotID == nil || !res.Created {
		t.Fatalf("Tick = %+v, %v; want a Lot added", res, err)
	}
	if len(e.stock.adds) != 1 || e.stock.adds[0].IngredientID != id || e.stock.adds[0].Quantity != 9 {
		t.Fatalf("Stock adds = %+v, want 9 pieces of Toilet paper", e.stock.adds)
	}
	ticks, _ := e.st.Ticks(ctx, "2026-11-15")
	if got := ticks[id]; got.By != "hand" || got.Needed != 7 {
		t.Fatalf("stored tick = %+v, want by hand, Needed 7 (the Restock Line quantity)", got)
	}
	v, _ := e.svc.List(ctx, service.Query{})
	if len(v.Lines) != 1 || !v.Lines[0].Ticked || !v.Lines[0].Supply || v.Progress.Ticked != 1 || !v.Complete {
		t.Fatalf("list = %+v, want the Toilet paper Line ticked and the list complete", v)
	}
}

func TestAScannedLotOfASupplyTicksItsRestockLine(t *testing.T) {
	e := supplyEnv(t)
	ctx := context.Background()
	setStock(e, tissue, 2)
	id := e.ids[tissue]
	e.stock.lots = append(e.stock.lots, stock.Lot{ID: 500, IngredientID: id, Quantity: 9, Purchased: "2026-11-09", GoesOff: stock.None})
	eff, err := e.svc.AfterLot(ctx, service.AfterLotInput{IngredientID: id, To: "2026-11-15", LotID: 500, Quantity: 9})
	if err != nil {
		t.Fatal(err)
	}
	if !eff.OnList || !eff.Ticked || eff.Remaining != 0 {
		t.Fatalf("Effect = %+v, want on the list, ticked, nothing remaining", eff)
	}
}

func TestAScannedLotOfASupplyAtItsLevelIsNotOnTheList(t *testing.T) {
	e := supplyEnv(t)
	setStock(e, tissue, 9)
	id := e.ids[tissue]
	e.stock.lots = append(e.stock.lots, stock.Lot{ID: 500, IngredientID: id, Quantity: 9, Purchased: "2026-11-09", GoesOff: stock.None})
	eff, err := e.svc.AfterLot(context.Background(), service.AfterLotInput{IngredientID: id, To: "2026-11-15", LotID: 500, Quantity: 9})
	if err != nil || eff.OnList {
		t.Fatalf("Effect = %+v, %v; want not on the list", eff, err)
	}
}

func TestNotNeededWorksOnARestockLine(t *testing.T) {
	e := supplyEnv(t)
	ctx := context.Background()
	setStock(e, tissue, 2)
	if err := e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: e.ids[tissue], To: "2026-11-15"}); err != nil {
		t.Fatal(err)
	}
	v, _ := e.svc.List(ctx, service.Query{})
	if len(v.Lines) != 0 || len(v.NotNeeded) != 1 || !v.NotNeeded[0].Supply {
		t.Fatalf("Lines %+v, NotNeeded %+v; want the Restock Line under Not needed", v.Lines, v.NotNeeded)
	}
}

func TestARestockLineAndAnExtraOfTheSameSupplyBothShow(t *testing.T) {
	e := supplyEnv(t)
	ctx := context.Background()
	setStock(e, tissue, 2)
	if _, err := e.svc.AddExtra(ctx, service.ExtraInput{IngredientID: e.ids[tissue], Quantity: 4}); err != nil {
		t.Fatal(err)
	}
	v, _ := e.svc.List(ctx, service.Query{})
	if len(v.Lines) != 1 || v.Lines[0].Quantity != 7 || len(v.Extras) != 1 || v.Extras[0].Quantity != 4 || !v.Extras[0].Supply {
		t.Fatalf("Lines %+v, Extras %+v; want the Line of 7 and the extra of 4", v.Lines, v.Extras)
	}
}
