package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/service"
)

func ptr[T any](v T) *T { return &v }

func TestListUsesTheDefaultRangeAndTheHouseholdCurrency(t *testing.T) {
	e := newEnv(t)
	e.plan.meals = []shopping.Meal{dinner("2026-11-09", 2, shopping.Need{IngredientID: e.ids[passata], Quantity: 700})}
	v, err := e.svc.List(context.Background(), service.Query{})
	if err != nil {
		t.Fatal(err)
	}
	// Horizon 7 starting today: the last planned day is 2026-11-15, which also caps today + 7.
	if v.Today != "2026-11-09" || v.To != "2026-11-15" || v.DefaultTo != "2026-11-15" || v.MaxTo != "2026-11-15" || v.HorizonDays != 7 || v.Currency != "USD" {
		t.Fatalf("view header = today %s to %s default %s max %s horizon %d currency %s", v.Today, v.To, v.DefaultTo, v.MaxTo, v.HorizonDays, v.Currency)
	}
	if len(e.plan.calls) != 1 || e.plan.calls[0][0] != "2026-11-09" || e.plan.calls[0][1] != "2026-11-15" {
		t.Fatalf("Planning was asked for %v, want 2026-11-09..2026-11-15", e.plan.calls)
	}
	if len(v.Lines) != 1 || v.Lines[0].Quantity != 1400 || v.Lines[0].Name != "Passata" {
		t.Fatalf("Lines = %+v, want passata 1400 g", v.Lines)
	}
}

func TestListClampsAChosenDateToTheHorizon(t *testing.T) {
	e := newEnv(t)
	v, err := e.svc.List(context.Background(), service.Query{To: "2026-12-31"})
	if err != nil || v.To != "2026-11-15" {
		t.Fatalf("To = %s, %v; want it capped at 2026-11-15", v.To, err)
	}
	v, _ = e.svc.List(context.Background(), service.Query{To: "2026-11-11"})
	if v.To != "2026-11-11" || e.plan.calls[len(e.plan.calls)-1][1] != "2026-11-11" {
		t.Fatalf("To = %s, Planning asked %v", v.To, e.plan.calls)
	}
}

func TestListPrefersTheSelectedShopForPacksAndPrices(t *testing.T) {
	e := newEnv(t)
	pass := e.ids[passata]
	e.plan.meals = []shopping.Meal{dinner("2026-11-09", 2, shopping.Need{IngredientID: pass, Quantity: 700})}
	e.products.packs = map[int64]shopping.Pack{pass: {ProductID: 7, Name: "Mutti 700 g", Size: 700}}
	e.products.prices = map[int64]int{7: 159}
	v, err := e.svc.List(context.Background(), service.Query{ShopID: ptr(int64(2))})
	if err != nil {
		t.Fatal(err)
	}
	if len(e.products.lastBoughtShop) != 1 || e.products.lastBoughtShop[0] == nil || *e.products.lastBoughtShop[0] != 2 ||
		len(e.products.priceShop) != 1 || e.products.priceShop[0] == nil || *e.products.priceShop[0] != 2 {
		t.Fatalf("Products asked for Shop %v / %v, want 2", e.products.lastBoughtShop, e.products.priceShop)
	}
	l := v.Lines[0]
	if l.Pack == nil || l.Pack.Count != 2 || l.CostCents == nil || *l.CostCents != 318 || v.EstimatedCostCents != 318 {
		t.Fatalf("Line = %+v, estimated %d; want 2 packs, 318", l, v.EstimatedCostCents)
	}
}

func TestListWithoutAShopAsksForAnyShop(t *testing.T) {
	e := newEnv(t)
	if _, err := e.svc.List(context.Background(), service.Query{}); err != nil {
		t.Fatal(err)
	}
	if len(e.products.lastBoughtShop) != 1 || e.products.lastBoughtShop[0] != nil {
		t.Fatalf("LastBought shop = %v, want nil (any Shop)", e.products.lastBoughtShop)
	}
}

func TestListRejectsAnUnknownShop(t *testing.T) {
	e := newEnv(t)
	if _, err := e.svc.List(context.Background(), service.Query{ShopID: ptr(int64(99))}); !errors.Is(err, service.ErrUnknownShop) {
		t.Fatalf("err = %v, want ErrUnknownShop", err)
	}
}

func TestListSubtractsProjectedStockAndShowsTicksAndExtras(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	m := e.ids[milk]
	e.plan.meals = []shopping.Meal{dinner("2026-11-10", 1, shopping.Need{IngredientID: m, Quantity: 1000})}
	if _, err := e.svc.AddExtra(ctx, service.ExtraInput{Text: "candles"}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Tick(ctx, service.TickInput{IngredientID: m, To: "2026-11-15", Quantity: 400}); err != nil {
		t.Fatal(err)
	}
	v, _ := e.svc.List(ctx, service.Query{})
	if len(v.Lines) != 1 || !v.Lines[0].Ticked || v.Lines[0].Quantity != 600 {
		t.Fatalf("Lines = %+v, want milk ticked with 600 ml still to buy (400 ml were added by the tick)", v.Lines)
	}
	if len(v.Extras) != 1 || v.Extras[0].Text != "candles" || v.Progress.Total != 2 || v.Progress.Done != 1 {
		t.Fatalf("Extras/Progress = %+v / %+v", v.Extras, v.Progress)
	}
}

func TestTicksBelongToTheirRange(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	m := e.ids[milk]
	e.plan.meals = []shopping.Meal{dinner("2026-11-09", 1, shopping.Need{IngredientID: m, Quantity: 1000})}
	if _, err := e.svc.Tick(ctx, service.TickInput{IngredientID: m, To: "2026-11-15", Quantity: 0}); err != nil {
		t.Fatal(err)
	}
	other, _ := e.svc.List(ctx, service.Query{To: "2026-11-12"})
	if other.Lines[0].Ticked {
		t.Fatal("a tick for the range ending 11-15 must not show in the range ending 11-12")
	}
	same, _ := e.svc.List(ctx, service.Query{To: "2026-11-15"})
	if !same.Lines[0].Ticked {
		t.Fatal("the tick must show in its own range")
	}
}

func TestTickByHandAddsAStockLotWithTheAmountAsked(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	m := e.ids[milk]
	e.plan.meals = []shopping.Meal{dinner("2026-11-09", 1, shopping.Need{IngredientID: m, Quantity: 1000})}
	res, err := e.svc.Tick(ctx, service.TickInput{IngredientID: m, To: "2026-11-15", ShopID: ptr(int64(1)), Quantity: 1000, ClientUUID: "tick-1"})
	if err != nil || res.LotID == nil || !res.Created {
		t.Fatalf("Tick = %+v, %v; want a Lot added", res, err)
	}
	if len(e.stock.adds) != 1 || e.stock.adds[0].IngredientID != m || e.stock.adds[0].Quantity != 1000 || e.stock.adds[0].ClientUUID != "tick-1" ||
		e.stock.adds[0].ShopID == nil || *e.stock.adds[0].ShopID != 1 {
		t.Fatalf("Stock adds = %+v", e.stock.adds)
	}
	ticks, _ := e.st.Ticks(ctx, "2026-11-15")
	if got := ticks[m]; got.By != "hand" || got.Needed != 1000 {
		t.Fatalf("stored tick = %+v, want by hand, Needed 1000 (the Line quantity)", got)
	}
	if e.bus.count(service.Topic) == 0 {
		t.Fatal("ticking must publish a shopping event")
	}
	// Repeating the same client id adds no second Lot.
	again, err := e.svc.Tick(ctx, service.TickInput{IngredientID: m, To: "2026-11-15", Quantity: 1000, ClientUUID: "tick-1"})
	if err != nil || again.Created || len(e.stock.adds) != 1 {
		t.Fatalf("repeat = %+v, %v, adds %d; want no second Lot", again, err, len(e.stock.adds))
	}
}

func TestTickWithZeroAddsNoLot(t *testing.T) {
	e := newEnv(t)
	res, err := e.svc.Tick(context.Background(), service.TickInput{IngredientID: e.ids[milk], To: "2026-11-15", Quantity: 0})
	if err != nil || res.LotID != nil || len(e.stock.adds) != 0 {
		t.Fatalf("Tick(0) = %+v, %v, adds %d; want none", res, err, len(e.stock.adds))
	}
}

func TestTickRejectsANegativeAmountAndAnUnknownIngredient(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	if _, err := e.svc.Tick(ctx, service.TickInput{IngredientID: e.ids[milk], To: "2026-11-15", Quantity: -1}); !errors.Is(err, service.ErrInvalid) {
		t.Fatalf("negative: err = %v, want ErrInvalid", err)
	}
	if _, err := e.svc.Tick(ctx, service.TickInput{IngredientID: 9999, To: "2026-11-15", Quantity: 1}); !errors.Is(err, service.ErrUnknownIngredient) {
		t.Fatalf("unknown Ingredient: err = %v, want ErrUnknownIngredient", err)
	}
}

func TestUntickRemovesTheTickAndPublishes(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	m := e.ids[milk]
	_, _ = e.svc.Tick(ctx, service.TickInput{IngredientID: m, To: "2026-11-15"})
	before := e.bus.count(service.Topic)
	if err := e.svc.Untick(ctx, m, "2026-11-15"); err != nil {
		t.Fatal(err)
	}
	if ticks, _ := e.st.Ticks(ctx, "2026-11-15"); len(ticks) != 0 || e.bus.count(service.Topic) != before+1 {
		t.Fatalf("ticks %+v, events %d -> %d", ticks, before, e.bus.count(service.Topic))
	}
}

func TestExtrasAreAddedValidatedAndDeleted(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	x, err := e.svc.AddExtra(ctx, service.ExtraInput{IngredientID: e.ids[milk], Quantity: 2000})
	if err != nil || x.IngredientID != e.ids[milk] || x.Quantity != 2000 {
		t.Fatalf("AddExtra = %+v, %v", x, err)
	}
	for name, in := range map[string]service.ExtraInput{
		"both":          {Text: "x", IngredientID: e.ids[milk], Quantity: 1},
		"neither":       {},
		"blank":         {Text: "  "},
		"zero quantity": {IngredientID: e.ids[milk]},
	} {
		if _, err := e.svc.AddExtra(ctx, in); !errors.Is(err, service.ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
	if _, err := e.svc.AddExtra(ctx, service.ExtraInput{IngredientID: 9999, Quantity: 1}); !errors.Is(err, service.ErrUnknownIngredient) {
		t.Errorf("unknown Ingredient: err = %v", err)
	}
	if err := e.svc.DeleteExtra(ctx, x.ID); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.DeleteExtra(ctx, x.ID); !errors.Is(err, service.ErrNotFound) {
		t.Errorf("second delete: err = %v, want ErrNotFound", err)
	}
}

func TestTickingAnIngredientExtraAddsALotLikeAnyLine(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	x, _ := e.svc.AddExtra(ctx, service.ExtraInput{IngredientID: e.ids[milk], Quantity: 2000})
	res, err := e.svc.TickExtra(ctx, x.ID, 2000, nil)
	if err != nil || res.LotID == nil || len(e.stock.adds) != 1 || e.stock.adds[0].Quantity != 2000 {
		t.Fatalf("TickExtra = %+v, %v, adds %+v", res, err, e.stock.adds)
	}
	text, _ := e.svc.AddExtra(ctx, service.ExtraInput{Text: "candles"})
	if res, err := e.svc.TickExtra(ctx, text.ID, 0, nil); err != nil || res.LotID != nil || len(e.stock.adds) != 1 {
		t.Fatalf("ticking a text extra adds no Lot: %+v, %v", res, err)
	}
	v, _ := e.svc.List(ctx, service.Query{})
	if v.Progress.Done != 2 || v.Progress.Total != 2 || !v.Complete {
		t.Fatalf("Progress = %+v complete %v, want 2 of 2", v.Progress, v.Complete)
	}
	if err := e.svc.UntickExtra(ctx, text.ID); err != nil {
		t.Fatal(err)
	}
}

func TestAfterLotReducesTheLineAndTicksItWhenCovered(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	pass := e.ids[passata]
	e.plan.meals = []shopping.Meal{dinner("2026-11-09", 2, shopping.Need{IngredientID: pass, Quantity: 700})} // 1400 g
	scan := func(qty float64) service.Effect {
		id, _, _ := e.stock.AddLot(ctx, service.StockAdd{IngredientID: pass, Quantity: qty})
		eff, err := e.svc.AfterLot(ctx, service.AfterLotInput{IngredientID: pass, To: "2026-11-15", LotID: id, Quantity: qty})
		if err != nil {
			t.Fatal(err)
		}
		return eff
	}
	first := scan(700)
	if !first.OnList || first.Remaining != 700 || first.Ticked {
		t.Fatalf("first pack = %+v, want on the list, 700 g remaining, not ticked", first)
	}
	second := scan(700)
	if !second.OnList || second.Remaining != 0 || !second.Ticked {
		t.Fatalf("second pack = %+v, want covered and ticked", second)
	}
	ticks, _ := e.st.Ticks(ctx, "2026-11-15")
	if got := ticks[pass]; got.By != "scan" || got.Needed != 700 {
		t.Fatalf("stored tick = %+v, want by scan, Needed 700 (what was left before the covering pack)", got)
	}
	// A third pack: the Ingredient is on the list (ticked) but this scan ticks nothing new.
	third := scan(700)
	if !third.OnList || third.Ticked {
		t.Fatalf("third pack = %+v, want on the list, not newly ticked", third)
	}
}

func TestAfterLotForAnIngredientNotOnTheListSaysSo(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	m := e.ids[milk]
	id, _, _ := e.stock.AddLot(ctx, service.StockAdd{IngredientID: m, Quantity: 1000})
	eff, err := e.svc.AfterLot(ctx, service.AfterLotInput{IngredientID: m, To: "2026-11-15", LotID: id, Quantity: 1000})
	if err != nil || eff.OnList || eff.Ticked {
		t.Fatalf("Effect = %+v, %v; want off the list", eff, err)
	}
	if ticks, _ := e.st.Ticks(ctx, "2026-11-15"); len(ticks) != 0 {
		t.Fatalf("nothing to tick: %+v", ticks)
	}
}

func TestAfterLotCountsAgainstAnOpenIngredientExtraWhenThePlanHasNoLine(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	m := e.ids[milk]
	x, _ := e.svc.AddExtra(ctx, service.ExtraInput{IngredientID: m, Quantity: 2000})
	id, _, _ := e.stock.AddLot(ctx, service.StockAdd{IngredientID: m, Quantity: 1000})
	eff, _ := e.svc.AfterLot(ctx, service.AfterLotInput{IngredientID: m, To: "2026-11-15", LotID: id, Quantity: 1000})
	if !eff.OnList || eff.Remaining != 1000 || eff.Ticked || eff.ExtraID != x.ID {
		t.Fatalf("first litre = %+v, want the extra with 1000 ml remaining", eff)
	}
	id, _, _ = e.stock.AddLot(ctx, service.StockAdd{IngredientID: m, Quantity: 1000})
	eff, _ = e.svc.AfterLot(ctx, service.AfterLotInput{IngredientID: m, To: "2026-11-15", LotID: id, Quantity: 1000})
	if !eff.Ticked || eff.Remaining != 0 {
		t.Fatalf("second litre = %+v, want the extra ticked", eff)
	}
	v, _ := e.svc.List(ctx, service.Query{})
	if len(v.Extras) != 1 || !v.Extras[0].Ticked {
		t.Fatalf("Extras = %+v, want the milk extra ticked", v.Extras)
	}
}

func TestUndoLotUnticksOnlyWhatTheScanTicked(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	pass := e.ids[passata]
	e.plan.meals = []shopping.Meal{dinner("2026-11-09", 1, shopping.Need{IngredientID: pass, Quantity: 700})}
	id, _, _ := e.stock.AddLot(ctx, service.StockAdd{IngredientID: pass, Quantity: 700})
	eff, _ := e.svc.AfterLot(ctx, service.AfterLotInput{IngredientID: pass, To: "2026-11-15", LotID: id, Quantity: 700})
	if !eff.Ticked {
		t.Fatalf("setup: %+v", eff)
	}
	if err := e.svc.UndoLot(ctx, service.UndoLotInput{IngredientID: pass, To: "2026-11-15", Quantity: 700, Unmark: true}); err != nil {
		t.Fatal(err)
	}
	if ticks, _ := e.st.Ticks(ctx, "2026-11-15"); len(ticks) != 0 {
		t.Fatalf("Undo must untick: %+v", ticks)
	}
	// Unmark false (the line was ticked before this scan) keeps the tick.
	_ = e.st.SetTick(ctx, "2026-11-15", shopping.Tick{IngredientID: pass, Needed: 700, By: "hand"}, nil)
	if err := e.svc.UndoLot(ctx, service.UndoLotInput{IngredientID: pass, To: "2026-11-15", Quantity: 700}); err != nil {
		t.Fatal(err)
	}
	if ticks, _ := e.st.Ticks(ctx, "2026-11-15"); len(ticks) != 1 {
		t.Fatalf("an older tick stays: %+v", ticks)
	}
}

func TestSummaryAddsTheLedgerAndTheLotsOfTicksByHand(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	m, pass := e.ids[milk], e.ids[passata]
	e.plan.meals = []shopping.Meal{dinner("2026-11-09", 1, shopping.Need{IngredientID: m, Quantity: 500}, shopping.Need{IngredientID: pass, Quantity: 700})}
	e.ledger.spent, e.ledger.lots = 1590, 1
	_, _ = e.svc.Tick(ctx, service.TickInput{IngredientID: m, To: "2026-11-15", Quantity: 500})
	_ = e.st.SetTick(ctx, "2026-11-15", shopping.Tick{IngredientID: pass, Needed: 700, By: "scan"}, nil)
	v, _ := e.svc.List(ctx, service.Query{To: "2026-11-15"})
	if !v.Complete || v.Summary.Items != 2 || v.Summary.SpentCents != 1590 || v.Summary.LotsAdded != 2 {
		t.Fatalf("Summary = %+v complete %v, want items 2, spent 1590, lots 2 (one scanned, one by hand)", v.Summary, v.Complete)
	}
}

func TestEveryWritePublishesAShoppingEvent(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	x, _ := e.svc.AddExtra(ctx, service.ExtraInput{Text: "candles"})
	n := e.bus.count(service.Topic)
	_, _ = e.svc.TickExtra(ctx, x.ID, 0, nil)
	_ = e.svc.UntickExtra(ctx, x.ID)
	_ = e.svc.DeleteExtra(ctx, x.ID)
	if got := e.bus.count(service.Topic); got != n+3 {
		t.Fatalf("shopping events = %d, want %d", got, n+3)
	}
}
