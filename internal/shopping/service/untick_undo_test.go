package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/shopping/service"
)

// Beta.8 (undo): Untick takes back the Stock the tick added (docs/dev/design/b8-undo.md, ADR 0019). Contract:
//
//	Ports.Stock gains TakeBack(ctx, lotID int64, added float64) (service.TakenBack{Taken float64; Removed bool}, error)
//	Untick reads the tick's Lot and the quantity it added (shopping_ticks.lot_id, lot_quantity), takes them back
//	through Stock, forgets what was bought for the Lot only when the Lot is gone, then removes the tick.
//	UntickExtra does the same for an Ingredient extra's tick and gives the quantity back to `got`.

func tickBy(t *testing.T, e *env, ing int64, qty float64) service.TickResult {
	t.Helper()
	res, err := e.svc.Tick(context.Background(), service.TickInput{IngredientID: ing, To: "2026-11-15", Quantity: qty})
	if err != nil || res.LotID == nil {
		t.Fatalf("Tick = %+v, %v", res, err)
	}
	return res
}

func TestUntickTakesBackTheLotTheTickAdded(t *testing.T) {
	e := newEnv(t)
	m := e.ids[milk]
	res := tickBy(t, e, m, 400)
	if err := e.svc.Untick(context.Background(), m, "2026-11-15"); err != nil {
		t.Fatal(err)
	}
	if len(e.stock.takes) != 1 || e.stock.takes[0] != [2]float64{float64(*res.LotID), 400} {
		t.Fatalf("TakeBack calls = %v, want the tick's Lot and 400", e.stock.takes)
	}
	if got := e.stock.total(m); got != 0 {
		t.Fatalf("Stock = %v, want 0", got)
	}
	if ticks, _ := e.st.Ticks(context.Background(), "2026-11-15"); len(ticks) != 0 {
		t.Fatalf("ticks = %+v, want none", ticks)
	}
}

func TestThreeTickAndUndoCyclesLeaveNoStockBehind(t *testing.T) {
	e := newEnv(t)
	m := e.ids[milk]
	for i := 0; i < 3; i++ {
		tickBy(t, e, m, 4000)
		if err := e.svc.Untick(context.Background(), m, "2026-11-15"); err != nil {
			t.Fatal(err)
		}
	}
	if got := e.stock.total(m); got != 0 {
		t.Fatalf("Stock = %v after three tick and Undo cycles, want 0 (it was 14 kg of Cauliflower)", got)
	}
}

func TestUntickOfALotPartlyUsedTakesBackWhatIsLeft(t *testing.T) {
	e := newEnv(t)
	m := e.ids[milk]
	tickBy(t, e, m, 400)
	e.stock.lots[0].Quantity = 150 // Cooked used 250
	if err := e.svc.Untick(context.Background(), m, "2026-11-15"); err != nil {
		t.Fatal(err)
	}
	if got := e.stock.total(m); got != 0 {
		t.Fatalf("Stock = %v, want the 150 left taken back, none more", got)
	}
}

func TestUntickOfALotEditedUpLeavesWhatTheTickDidNotAdd(t *testing.T) {
	e := newEnv(t)
	m := e.ids[milk]
	e.stock.lots = append(e.stock.lots, stockLot(99, m, 1000)) // an older Lot
	tickBy(t, e, m, 400)
	e.stock.lots[1].Quantity = 600
	if err := e.svc.Untick(context.Background(), m, "2026-11-15"); err != nil {
		t.Fatal(err)
	}
	if got := e.stock.total(m); got != 1200 {
		t.Fatalf("Stock = %v, want 1000 (older Lot) + 200 (what the tick did not add)", got)
	}
}

func TestUntickTwiceOrWithoutATickIsANoOp(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	m := e.ids[milk]
	if err := e.svc.Untick(ctx, m, "2026-11-15"); err != nil {
		t.Fatalf("untick with no tick: %v", err)
	}
	tickBy(t, e, m, 400)
	for i := 0; i < 2; i++ {
		if err := e.svc.Untick(ctx, m, "2026-11-15"); err != nil {
			t.Fatalf("untick %d: %v", i, err)
		}
	}
	if len(e.stock.takes) != 1 {
		t.Fatalf("TakeBack ran %d times, want once: the second untick has no tick", len(e.stock.takes))
	}
}

func TestUntickOfALotAlreadyGoneIsNotAnError(t *testing.T) {
	e := newEnv(t)
	m := e.ids[milk]
	tickBy(t, e, m, 400)
	e.stock.lots = nil // used up, or deleted by hand
	if err := e.svc.Untick(context.Background(), m, "2026-11-15"); err != nil {
		t.Fatalf("Untick = %v, want nil", err)
	}
	if ticks, _ := e.st.Ticks(context.Background(), "2026-11-15"); len(ticks) != 0 {
		t.Fatalf("ticks = %+v, want the tick removed", ticks)
	}
}

func TestUntickOfATickThatAddedNoLotTouchesNoStock(t *testing.T) {
	e := newEnv(t)
	m := e.ids[milk]
	e.stock.lots = append(e.stock.lots, stockLot(99, m, 1000))
	if _, err := e.svc.Tick(context.Background(), service.TickInput{IngredientID: m, To: "2026-11-15"}); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.Untick(context.Background(), m, "2026-11-15"); err != nil {
		t.Fatal(err)
	}
	if len(e.stock.takes) != 0 || e.stock.total(m) != 1000 {
		t.Fatalf("takes %v, Stock %v; want Stock untouched", e.stock.takes, e.stock.total(m))
	}
}

func TestARetriedTickThenUntickTakesBackOneLot(t *testing.T) {
	e := newEnv(t)
	m := e.ids[milk]
	in := service.TickInput{IngredientID: m, To: "2026-11-15", Quantity: 400, ClientUUID: "tick-1"}
	for i := 0; i < 2; i++ { // the second answer is created=false: the same Lot
		if _, err := e.svc.Tick(context.Background(), in); err != nil {
			t.Fatal(err)
		}
	}
	if err := e.svc.Untick(context.Background(), m, "2026-11-15"); err != nil {
		t.Fatal(err)
	}
	if got := e.stock.total(m); got != 0 || len(e.stock.adds) != 1 {
		t.Fatalf("Stock %v after %d adds, want 0 after 1", got, len(e.stock.adds))
	}
}

func TestUntickKeepsTheTickWhenStockFailsSoItCanBeTriedAgain(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	m := e.ids[milk]
	tickBy(t, e, m, 400)
	e.stock.takeErr = errors.New("database is locked")
	if err := e.svc.Untick(ctx, m, "2026-11-15"); err == nil {
		t.Fatal("Untick = nil, want the error")
	}
	if ticks, _ := e.st.Ticks(ctx, "2026-11-15"); len(ticks) != 1 {
		t.Fatalf("ticks = %+v, want the tick kept", ticks)
	}
	e.stock.takeErr = nil
	if err := e.svc.Untick(ctx, m, "2026-11-15"); err != nil || e.stock.total(m) != 0 {
		t.Fatalf("retry = %v, Stock %v; want it to finish", err, e.stock.total(m))
	}
}

func TestUntickForgetsWhatTheLotWasBoughtForOnlyWhenTheLotIsGone(t *testing.T) {
	e, rec, pass := boughtEnv(t)
	tickBy(t, e, pass, 400)
	e.stock.lots[0].Quantity = 600 // edited up: 200 stays in Stock
	if err := e.svc.Untick(context.Background(), pass, "2026-11-15"); err != nil {
		t.Fatal(err)
	}
	if len(rec.removed) != 0 {
		t.Errorf("records removed for %v, want them kept while part of the Lot stays", rec.removed)
	}
}

func TestUntickOfAScanTickLeavesTheScansLotToItsUndo(t *testing.T) {
	e, _, pass := boughtEnv(t)
	scanLot(t, e, pass, 600)
	if err := e.svc.Untick(context.Background(), pass, "2026-11-15"); err != nil {
		t.Fatal(err)
	}
	if len(e.stock.takes) != 0 || e.stock.total(pass) != 600 {
		t.Fatalf("takes %v, Stock %v; want the scan's Lot untouched: Undo of the Scan owns it", e.stock.takes, e.stock.total(pass))
	}
}

func TestUntickExtraTakesBackTheLotAndGivesTheQuantityBack(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	m := e.ids[milk]
	x, _ := e.svc.AddExtra(ctx, service.ExtraInput{IngredientID: m, Quantity: 2000})
	if _, err := e.svc.TickExtra(ctx, x.ID, 2000, nil, "u1"); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.UntickExtra(ctx, x.ID); err != nil {
		t.Fatal(err)
	}
	if e.stock.total(m) != 0 {
		t.Fatalf("Stock = %v, want 0", e.stock.total(m))
	}
	line, err := e.svc.Extra(ctx, x.ID)
	if err != nil || line.Ticked || line.Quantity != 2000 {
		t.Fatalf("extra = %+v, %v; want open, 2000 still to get", line, err)
	}
	if err := e.svc.UntickExtra(ctx, x.ID); err != nil { // second untick: no-op
		t.Fatal(err)
	}
	if len(e.stock.takes) != 1 {
		t.Fatalf("TakeBack ran %d times, want once", len(e.stock.takes))
	}
}

func TestUntickExtraOfATextExtraTouchesNoStock(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	x, _ := e.svc.AddExtra(ctx, service.ExtraInput{Text: "candles"})
	if _, err := e.svc.TickExtra(ctx, x.ID, 0, nil, ""); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.UntickExtra(ctx, x.ID); err != nil || len(e.stock.takes) != 0 {
		t.Fatalf("UntickExtra = %v, takes %v", err, e.stock.takes)
	}
}
