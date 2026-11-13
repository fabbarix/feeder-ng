package service_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/service"
)

// B5-BO: the shopping service records what a purchase was bought for through the BoughtRecorder port (ADR 0013,
// beta5-plan 2.4): a Scan that matched a line, a Tick by hand that adds a Lot. Undo, unticking and Lot Delete remove
// the Lot's records. Monday 2026-11-09 12:00 UTC, horizon 7, default range ends 2026-11-15.

type fakeBought struct {
	byLot   map[int64][]shopping.Share
	at      map[int64]time.Time
	calls   int
	removed []int64
	err     error
}

func (f *fakeBought) RecordBought(_ context.Context, lotID int64, shares []shopping.Share, at time.Time) error {
	f.calls++
	if f.err != nil {
		return f.err
	}
	if f.byLot == nil {
		f.byLot, f.at = map[int64][]shopping.Share{}, map[int64]time.Time{}
	}
	f.byLot[lotID] = append([]shopping.Share(nil), shares...)
	f.at[lotID] = at
	return nil
}

func (f *fakeBought) RemoveBought(_ context.Context, lotID int64) error {
	f.removed = append(f.removed, lotID)
	delete(f.byLot, lotID)
	return nil
}

func (f *fakeBought) shares(lot int64) string {
	out := ""
	for _, s := range f.byLot[lot] {
		out += fmt.Sprintf("%d/%d=%g ", s.MealID, s.IngredientID, s.Quantity)
	}
	return out
}

// boughtEnv is newEnv with a recorder, and two dinners each needing 300 g of passata (Planned Meals 1 and 2).
func boughtEnv(t *testing.T) (*env, *fakeBought, int64) {
	t.Helper()
	e := newEnv(t)
	rec := &fakeBought{}
	pass := e.ids[passata]
	ing := fakeIngredients{e.ids[milk]: {Name: "milk", BaseUnit: "ml"}, pass: {Name: "Passata", BaseUnit: "g"}}
	e.svc = service.New(e.st, service.Ports{
		Plan: e.plan, Stock: e.stock, Products: e.products, Ingredients: ing,
		Household: fakeHousehold{today: "2026-11-09", horizon: 7, currency: "USD"}, Ledger: e.ledger, Bought: rec,
	}, clock.NewFake(startTime), e.bus)
	first, second := dinner("2026-11-10", 1, shopping.Need{IngredientID: pass, Quantity: 300}), dinner("2026-11-12", 1, shopping.Need{IngredientID: pass, Quantity: 300})
	first.MealID, second.MealID = 1, 2
	e.plan.meals = []shopping.Meal{first, second}
	return e, rec, pass
}

func scanLot(t *testing.T, e *env, ing int64, qty float64) (int64, service.Effect) {
	t.Helper()
	ctx := context.Background()
	id, _, _ := e.stock.AddLot(ctx, service.StockAdd{IngredientID: ing, Quantity: qty})
	eff, err := e.svc.AfterLot(ctx, service.AfterLotInput{IngredientID: ing, To: "2026-11-15", LotID: id, Quantity: qty})
	if err != nil {
		t.Fatalf("AfterLot: %v", err)
	}
	return id, eff
}

func TestAScanThatMatchedALineRecordsWhatItWasBoughtFor(t *testing.T) {
	e, rec, pass := boughtEnv(t)
	lot, eff := scanLot(t, e, pass, 400)
	if !eff.OnList {
		t.Fatalf("setup: %+v", eff)
	}
	if got := rec.shares(lot); got != fmt.Sprintf("1/%d=300 2/%d=100 ", pass, pass) {
		t.Errorf("shares of the Lot = %q, want the earlier dinner covered in full and the later one 100 g", got)
	}
	if !rec.at[lot].Equal(startTime) {
		t.Errorf("recorded at %v, want the clock's now %v", rec.at[lot], startTime)
	}
}

func TestAScanThatLowersALineWithoutTickingItIsStillAPurchase(t *testing.T) {
	e, rec, pass := boughtEnv(t)
	lot, eff := scanLot(t, e, pass, 100)
	if eff.Ticked || eff.Remaining != 500 {
		t.Fatalf("setup: %+v, want a partial scan", eff)
	}
	if got := rec.shares(lot); got != fmt.Sprintf("1/%d=100 ", pass) {
		t.Errorf("shares = %q, want the earliest dinner Bought for 100 g", got)
	}
}

func TestEachScanRecordsItsOwnLot(t *testing.T) {
	e, rec, pass := boughtEnv(t)
	first, _ := scanLot(t, e, pass, 300)
	second, _ := scanLot(t, e, pass, 300)
	if rec.shares(first) != fmt.Sprintf("1/%d=300 ", pass) || rec.shares(second) != fmt.Sprintf("2/%d=300 ", pass) {
		t.Errorf("first %q, second %q; want dinner 1 then dinner 2", rec.shares(first), rec.shares(second))
	}
}

func TestAScanOfAnIngredientNoPlannedMealNeedsRecordsNothing(t *testing.T) {
	e, rec, _ := boughtEnv(t)
	scanLot(t, e, e.ids[milk], 1000)
	if rec.calls != 0 {
		t.Errorf("RecordBought called %d times for an Ingredient nobody needs, want none", rec.calls)
	}
}

func TestAScanCountedAgainstAnIngredientExtraIsNotBoughtForAPlannedMeal(t *testing.T) {
	e, rec, _ := boughtEnv(t)
	m := e.ids[milk]
	if _, err := e.svc.AddExtra(context.Background(), service.ExtraInput{IngredientID: m, Quantity: 2000}); err != nil {
		t.Fatal(err)
	}
	scanLot(t, e, m, 1000)
	if rec.calls != 0 {
		t.Errorf("RecordBought called %d times for an extra, want none: extras are not Planned Meals", rec.calls)
	}
}

func TestAPlannedMealWhoseSlotHasPassedGetsNoShare(t *testing.T) {
	e, rec, pass := boughtEnv(t)
	past := dinner("2026-11-08", 1, shopping.Need{IngredientID: pass, Quantity: 300})
	past.MealID = 7
	e.plan.meals = append([]shopping.Meal{past}, e.plan.meals...)
	lot, _ := scanLot(t, e, pass, 400)
	if got := rec.shares(lot); got != fmt.Sprintf("1/%d=100 ", pass) {
		t.Errorf("shares = %q, want the unconfirmed dinner of 11-08 to take its 300 g and get none, and dinner 1 the last 100 g", got)
	}
}

func TestARecorderFailureFailsTheScanSoItsUndoRunsAndNothingHalfRecords(t *testing.T) {
	e, rec, pass := boughtEnv(t)
	rec.err = errors.New("boom")
	id, _, _ := e.stock.AddLot(context.Background(), service.StockAdd{IngredientID: pass, Quantity: 400})
	if _, err := e.svc.AfterLot(context.Background(), service.AfterLotInput{IngredientID: pass, To: "2026-11-15", LotID: id, Quantity: 400}); err == nil {
		t.Fatal("AfterLot succeeded although the recorder failed")
	}
}

func TestATickByHandThatAddsALotRecordsWhatItWasBoughtFor(t *testing.T) {
	e, rec, pass := boughtEnv(t)
	res, err := e.svc.Tick(context.Background(), service.TickInput{IngredientID: pass, To: "2026-11-15", Quantity: 400})
	if err != nil || res.LotID == nil {
		t.Fatalf("Tick = %+v, %v", res, err)
	}
	if got := rec.shares(*res.LotID); got != fmt.Sprintf("1/%d=300 2/%d=100 ", pass, pass) {
		t.Errorf("shares = %q, want the earlier dinner covered and the later one 100 g", got)
	}
}

func TestATickByHandWithZeroBuysNothing(t *testing.T) {
	e, rec, pass := boughtEnv(t)
	if _, err := e.svc.Tick(context.Background(), service.TickInput{IngredientID: pass, To: "2026-11-15", Quantity: 0}); err != nil {
		t.Fatal(err)
	}
	if rec.calls != 0 {
		t.Errorf("RecordBought called %d times for a tick with 0 (no Lot), want none", rec.calls)
	}
}

func TestARetriedTickWithTheSameClientUUIDRecordsTheSameSharesAgain(t *testing.T) {
	// The second answer finds the same Lot (created == false). Recording again is harmless (a record is keyed by Planned
	// Meal, Ingredient and Lot) and it repairs a first attempt whose recorder failed after the Lot was added.
	e, rec, pass := boughtEnv(t)
	in := service.TickInput{IngredientID: pass, To: "2026-11-15", Quantity: 400, ClientUUID: "tick-1"}
	first, err := e.svc.Tick(context.Background(), in)
	if err != nil || first.LotID == nil {
		t.Fatalf("Tick = %+v, %v", first, err)
	}
	want := rec.shares(*first.LotID)
	second, err := e.svc.Tick(context.Background(), in)
	if err != nil || second.LotID == nil || *second.LotID != *first.LotID || second.Created {
		t.Fatalf("retried Tick = %+v, %v; want the same Lot, not created", second, err)
	}
	if got := rec.shares(*first.LotID); got == "" || got != want {
		t.Errorf("shares after the retry = %q, want the same %q (and not doubled)", got, want)
	}
	if len(e.stock.adds) != 1 {
		t.Errorf("%d Lots added, want one", len(e.stock.adds))
	}
}

func TestATickWhoseRecorderFailedIsRepairedByTheRetry(t *testing.T) {
	e, rec, pass := boughtEnv(t)
	in := service.TickInput{IngredientID: pass, To: "2026-11-15", Quantity: 400, ClientUUID: "tick-2"}
	rec.err = errors.New("boom")
	if _, err := e.svc.Tick(context.Background(), in); err == nil {
		t.Fatal("Tick succeeded although the recorder failed")
	}
	rec.err = nil
	res, err := e.svc.Tick(context.Background(), in)
	if err != nil || res.LotID == nil {
		t.Fatalf("retry = %+v, %v", res, err)
	}
	if got := rec.shares(*res.LotID); got != fmt.Sprintf("1/%d=300 2/%d=100 ", pass, pass) {
		t.Errorf("shares after the retry = %q, want the earlier dinner covered and the later one 100 g", got)
	}
}

func TestUntickingATickByHandRemovesTheRecordsOfItsLot(t *testing.T) {
	e, rec, pass := boughtEnv(t)
	res, _ := e.svc.Tick(context.Background(), service.TickInput{IngredientID: pass, To: "2026-11-15", Quantity: 400})
	if res.LotID == nil {
		t.Fatal("setup: no Lot")
	}
	if err := e.svc.Untick(context.Background(), pass, "2026-11-15"); err != nil {
		t.Fatal(err)
	}
	if len(rec.removed) != 1 || rec.removed[0] != *res.LotID {
		t.Errorf("removed Lots = %v, want [%d]", rec.removed, *res.LotID)
	}
	if rec.shares(*res.LotID) != "" {
		t.Errorf("shares left: %q", rec.shares(*res.LotID))
	}
}

func TestUntickingATickThatAddedNoLotRemovesNothing(t *testing.T) {
	e, rec, pass := boughtEnv(t)
	if _, err := e.svc.Tick(context.Background(), service.TickInput{IngredientID: pass, To: "2026-11-15", Quantity: 0}); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.Untick(context.Background(), pass, "2026-11-15"); err != nil {
		t.Fatal(err)
	}
	if len(rec.removed) != 0 {
		t.Errorf("removed Lots = %v, want none: the tick added no Lot", rec.removed)
	}
}

func TestUntickingAScanTickKeepsTheScansRecords(t *testing.T) {
	// A line a scan ticked has no Lot on the tick (the scan owns it, and Undo of the scan removes the records).
	e, rec, pass := boughtEnv(t)
	lot, eff := scanLot(t, e, pass, 600)
	if !eff.Ticked {
		t.Fatalf("setup: %+v", eff)
	}
	if err := e.svc.Untick(context.Background(), pass, "2026-11-15"); err != nil {
		t.Fatal(err)
	}
	if len(rec.removed) != 0 || rec.shares(lot) == "" {
		t.Errorf("removed %v, shares %q; want the scan's records kept", rec.removed, rec.shares(lot))
	}
}

func TestUndoOfAScanRemovesTheRecordsOfItsLot(t *testing.T) {
	e, rec, pass := boughtEnv(t)
	lot, eff := scanLot(t, e, pass, 400)
	err := e.svc.UndoLot(context.Background(), service.UndoLotInput{IngredientID: pass, To: "2026-11-15", Quantity: 400, Unmark: eff.Ticked, LotID: lot})
	if err != nil {
		t.Fatal(err)
	}
	if len(rec.removed) != 1 || rec.removed[0] != lot {
		t.Errorf("removed Lots = %v, want [%d]", rec.removed, lot)
	}
}

func TestUndoWithoutALotIdRemovesNothing(t *testing.T) {
	e, rec, pass := boughtEnv(t)
	scanLot(t, e, pass, 400)
	if err := e.svc.UndoLot(context.Background(), service.UndoLotInput{IngredientID: pass, To: "2026-11-15", Quantity: 400}); err != nil {
		t.Fatal(err)
	}
	if len(rec.removed) != 0 {
		t.Errorf("removed %v, want none: the ledger of an older scan has no Lot id here", rec.removed)
	}
}

func TestForgetLotRemovesTheRecordsOfALotAndToleratesAnUnknownOne(t *testing.T) {
	e, rec, pass := boughtEnv(t)
	lot, _ := scanLot(t, e, pass, 400)
	if err := e.svc.ForgetLot(context.Background(), lot); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.ForgetLot(context.Background(), 31337); err != nil {
		t.Errorf("an unknown Lot: %v", err)
	}
	if len(rec.removed) != 2 || rec.removed[0] != lot || rec.removed[1] != 31337 {
		t.Errorf("removed Lots = %v, want [%d 31337]", rec.removed, lot)
	}
}

func TestWithoutARecorderNothingChanges(t *testing.T) {
	e := newEnv(t) // Ports.Bought is nil
	pass := e.ids[passata]
	m := dinner("2026-11-10", 1, shopping.Need{IngredientID: pass, Quantity: 300})
	m.MealID = 1
	e.plan.meals = []shopping.Meal{m}
	scanLot(t, e, pass, 400)
	if err := e.svc.ForgetLot(context.Background(), 1); err != nil {
		t.Errorf("ForgetLot without a recorder: %v", err)
	}
	if err := e.svc.UndoLot(context.Background(), service.UndoLotInput{IngredientID: pass, To: "2026-11-15", LotID: 1}); err != nil {
		t.Errorf("UndoLot without a recorder: %v", err)
	}
}
