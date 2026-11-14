package service_test

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/service"
	"github.com/fabbarix/feeder-ng/internal/stock/stocktest"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

// B9-05 (SAFE-03, SAFE-09, SSP-01, SSP-10, SSP-17): Stock give-back, waste Undo, AdjustLot, MoveMany, KeepUntil and
// the Stock-take that says what it took. Today is 2026-11-09. The signatures are in giveback.go.

// storedLot reads a Lot as the store keeps it.
func (f fixture) storedLot(t *testing.T, id int64) store.StoredLot {
	t.Helper()
	l, err := f.st.Lot(ctx, id)
	if err != nil {
		t.Fatalf("Lot %d: %v", id, err)
	}
	return l
}

// sameLot compares Lots the way a person would, by value (StoragePlaceID, ProductID and ShopID are pointers, so == would
// compare addresses), leaving out created_at, which is when the row was written.
func sameLot(a, b store.StoredLot) bool {
	a.CreatedAt, b.CreatedAt = time.Time{}, time.Time{}
	return reflect.DeepEqual(a, b)
}

// ---- GiveBack ----

func TestGiveBackPutsBackWhatCookedTookFromALotThatStillExists(t *testing.T) {
	f := setup(t)
	lot := f.add(t, f.milk, 400, "")
	before := f.storedLot(t, lot.ID)
	if _, err := f.svc.DeductForCooked(ctx, []stock.Need{{IngredientID: f.milk, Quantity: 250}}); err != nil {
		t.Fatal(err)
	}
	events := f.pub.count()
	out, err := f.svc.GiveBack(ctx, []service.LotTake{{Lot: before, Taken: 250}})
	if err != nil {
		t.Fatal(err)
	}
	if got := total(t, f, f.milk); got != 400 {
		t.Fatalf("Stock = %v, want 400 back", got)
	}
	if len(out.Restored) != 1 || out.Restored[0] != lot.ID || len(out.Gone) != 0 || len(out.IngredientIDs) != 1 || out.IngredientIDs[0] != f.milk {
		t.Errorf("outcome = %+v", out)
	}
	if f.pub.count() != events+1 {
		t.Errorf("events %d -> %d, want one stock event", events, f.pub.count())
	}
}

func TestGiveBackPutsALotTakenWholeBackWithItsIdDatesAndStoragePlace(t *testing.T) {
	f := setup(t)
	fridge := f.place(t, "Fridge", stock.KindFridge)
	lot := f.addIn(t, f.thighs, 300, "2026-11-08", fridge)
	before := f.storedLot(t, lot.ID)
	if _, err := f.svc.DeductForCooked(ctx, []stock.Need{{IngredientID: f.thighs, Quantity: 300}}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.st.Lot(ctx, lot.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("setup: the Lot should be used up, got %v", err)
	}
	out, err := f.svc.GiveBack(ctx, []service.LotTake{{Lot: before, Taken: 300}})
	if err != nil || len(out.Restored) != 1 {
		t.Fatalf("GiveBack = %+v, %v", out, err)
	}
	after := f.storedLot(t, lot.ID) // the same id
	if !sameLot(after, before) {
		t.Errorf("Lot after = %+v, want exactly the Lot before %+v (id, dates, Storage Place, source)", after, before)
	}
}

func TestGiveBackDoesNotInventAPartlyUsedLotThatWasDeletedSince(t *testing.T) {
	f := setup(t)
	lot := f.add(t, f.milk, 400, "")
	before := f.storedLot(t, lot.ID)
	if _, err := f.svc.DeductForCooked(ctx, []stock.Need{{IngredientID: f.milk, Quantity: 250}}); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.DeleteLot(ctx, lot.ID); err != nil {
		t.Fatal(err)
	}
	events := f.pub.count()
	out, err := f.svc.GiveBack(ctx, []service.LotTake{{Lot: before, Taken: 250}})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Gone) != 1 || out.Gone[0] != lot.ID || len(out.Restored) != 0 {
		t.Errorf("outcome = %+v, want the Lot reported gone", out)
	}
	if got := total(t, f, f.milk); got != 0 {
		t.Errorf("Stock = %v, want 0: gone Stock is reported, not invented", got)
	}
	if f.pub.count() != events {
		t.Errorf("a give-back that restored nothing published %d events", f.pub.count()-events)
	}
}

func TestGiveBackTxPublishesNothingAndRollsBackWithItsTransaction(t *testing.T) {
	f := setup(t)
	lot := f.add(t, f.milk, 400, "")
	before := f.storedLot(t, lot.ID)
	if _, err := f.svc.DeductForCooked(ctx, []stock.Need{{IngredientID: f.milk, Quantity: 250}}); err != nil {
		t.Fatal(err)
	}
	events := f.pub.count()
	tx, err := f.st.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	out, err := f.svc.GiveBackTx(ctx, tx, []service.LotTake{{Lot: before, Taken: 250}})
	if err != nil || len(out.Restored) != 1 {
		t.Fatalf("GiveBackTx = %+v, %v", out, err)
	}
	if f.pub.count() != events {
		t.Fatal("GiveBackTx published before its caller committed")
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if got := total(t, f, f.milk); got != 150 {
		t.Errorf("after rollback Stock = %v, want 150", got)
	}

	tx, err = f.st.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	out, err = f.svc.GiveBackTx(ctx, tx, []service.LotTake{{Lot: before, Taken: 250}})
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	f.svc.PublishGiveBack(out)
	if f.pub.count() != events+1 || total(t, f, f.milk) != 400 {
		t.Errorf("events %d -> %d, Stock %v; want one event and 400", events, f.pub.count(), total(t, f, f.milk))
	}
	f.svc.PublishGiveBack(service.GiveBackOutcome{})
	if f.pub.count() != events+1 {
		t.Error("PublishGiveBack of an outcome that restored nothing published an event")
	}
}

// ---- Throw out Undo (SAFE-09) ----

// clockFixture is the fixture with a household day the test can move.
func clockFixture(t *testing.T) (fixture, *stock.Date) {
	t.Helper()
	d := stocktest.NewDB(t)
	st := store.New(d, clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)))
	four := 4
	f := fixture{db: d, st: st, pub: &fakePub{}, thighs: stocktest.SeedIngredient(t, d, "chicken thighs", "g", &four)}
	day := today
	f.svc = service.New(st, fakeIngredients{f.thighs: {ID: f.thighs, Name: "chicken thighs", BaseUnit: "g", ShelfLifeDays: &four}},
		func(context.Context) (stock.Date, error) { return day, nil }, f.pub)
	return f, &day
}

func TestThrowOutKeepsTheLotSoItCanBePutBack(t *testing.T) {
	f := setup(t)
	lot := f.add(t, f.thighs, 200, "2026-11-01") // off 11-05, spoiled
	rec, err := f.svc.ThrowOut(ctx, lot.ID)
	if err != nil {
		t.Fatal(err)
	}
	if rec.LotJSON == "" {
		t.Fatal("ThrowOut must keep the Lot as lot_json (migration 1572)")
	}
	var kept store.StoredLot
	if err := json.Unmarshal([]byte(rec.LotJSON), &kept); err != nil || kept.ID != lot.ID || kept.Quantity != 200 || kept.GoesOff != "2026-11-05" {
		t.Errorf("LotJSON = %s (%v), want the Lot as it was", rec.LotJSON, err)
	}
	recs, err := f.svc.Waste(ctx, "", "")
	if err != nil || len(recs) != 1 || recs[0].LotJSON == "" {
		t.Errorf("Waste() = %+v, %v; the stored record carries lot_json too", recs, err)
	}
}

func TestUndoThrowOutPutsTheLotBackAsItWasAndRemovesTheWaste(t *testing.T) {
	f := setup(t)
	fridge := f.place(t, "Fridge", stock.KindFridge)
	lot := f.addIn(t, f.thighs, 200, "2026-11-01", fridge)
	f.keptStillPast(t, lot.ID) // kept: off 11-06, still past, KeptOn today
	before := f.storedLot(t, lot.ID)
	rec, err := f.svc.ThrowOut(ctx, lot.ID)
	if err != nil {
		t.Fatal(err)
	}
	events := f.pub.count()
	view, err := f.svc.UndoThrowOut(ctx, rec.ID)
	if err != nil {
		t.Fatal(err)
	}
	if view.ID != lot.ID || view.Quantity != 200 || view.GoesOff != "2026-11-06" || !view.Spoiled || view.IngredientName != "chicken thighs" {
		t.Errorf("view = %+v", view)
	}
	if after := f.storedLot(t, lot.ID); !sameLot(after, before) {
		t.Errorf("Lot after Undo = %+v, want the Lot as before the Throw out %+v (id, dates, KeptOn, Storage Place)", after, before)
	}
	if recs, _ := f.svc.Waste(ctx, "", ""); len(recs) != 0 {
		t.Errorf("waste = %+v, want none: the streak comes back", recs)
	}
	if sp, _ := f.svc.Spoiled(ctx); len(sp) != 1 || sp[0].ID != lot.ID {
		t.Errorf("Spoiled = %+v, want the Lot back in Throw out or keep?", sp)
	}
	if f.pub.count() <= events {
		t.Error("Undo published no event")
	}
}

func TestUndoThrowOutTwiceIsNotFound(t *testing.T) {
	f := setup(t)
	lot := f.add(t, f.thighs, 200, "2026-11-01")
	rec, _ := f.svc.ThrowOut(ctx, lot.ID)
	if _, err := f.svc.UndoThrowOut(ctx, rec.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.UndoThrowOut(ctx, rec.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("second Undo = %v, want store.ErrNotFound (the waste is gone)", err)
	}
	if got := total(t, f, f.thighs); got != 200 {
		t.Errorf("Stock = %v, want 200 once", got)
	}
	if _, err := f.svc.UndoThrowOut(ctx, 9999); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown waste = %v", err)
	}
}

func TestUndoThrowOutIsOnlyForTheSameHouseholdDay(t *testing.T) {
	f, now := clockFixture(t)
	lot := f.add(t, f.thighs, 200, "2026-11-01")
	rec, err := f.svc.ThrowOut(ctx, lot.ID)
	if err != nil {
		t.Fatal(err)
	}
	*now = "2026-11-10"
	if _, err := f.svc.UndoThrowOut(ctx, rec.ID); !errors.Is(err, service.ErrUndoWindowOver) {
		t.Fatalf("next day: %v, want ErrUndoWindowOver", err)
	}
	if recs, _ := f.svc.Waste(ctx, "", ""); len(recs) != 1 {
		t.Errorf("waste = %+v, want it kept", recs)
	}
	if got := total(t, f, f.thighs); got != 0 {
		t.Errorf("Stock = %v, want nothing put back", got)
	}
}

func TestUndoThrowOutRefusesWasteThatIsNotAThrownOutLot(t *testing.T) {
	f := setup(t)
	leftover, err := f.svc.RecordWaste(ctx, store.WasteRecord{Quantity: 2, Reason: store.ReasonLeftoverDiscarded})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.UndoThrowOut(ctx, leftover.ID); !errors.Is(err, service.ErrNotUndoable) {
		t.Errorf("a Leftover thrown out: %v, want ErrNotUndoable", err)
	}
	ing := f.thighs
	old, err := f.svc.RecordWaste(ctx, store.WasteRecord{IngredientID: &ing, Quantity: 100, Reason: store.ReasonSpoiled}) // no lot_json
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.UndoThrowOut(ctx, old.ID); !errors.Is(err, service.ErrNotUndoable) {
		t.Errorf("waste with no lot_json: %v, want ErrNotUndoable", err)
	}
}

// ---- AdjustLot (SSP-01 Change) ----

func TestAdjustLotSetsTheQuantityUpAndDown(t *testing.T) {
	f := setup(t)
	lot := f.add(t, f.milk, 400, "")
	events := f.pub.count()
	up, err := f.svc.AdjustLot(ctx, lot.ID, 600)
	if err != nil || up.Removed || up.Lot.ID != lot.ID || up.Lot.Quantity != 600 || up.Lot.IngredientName != "milk" {
		t.Fatalf("up = %+v, %v", up, err)
	}
	down, err := f.svc.AdjustLot(ctx, lot.ID, 150)
	if err != nil || down.Removed || down.Lot.Quantity != 150 {
		t.Fatalf("down = %+v, %v", down, err)
	}
	if got := total(t, f, f.milk); got != 150 {
		t.Errorf("Stock = %v, want 150", got)
	}
	if f.pub.count() != events+2 {
		t.Errorf("events %d -> %d, want one per change", events, f.pub.count())
	}
}

func TestAdjustLotToZeroRemovesTheLotWithoutAGoOff(t *testing.T) {
	f := setup(t)
	lot := f.add(t, f.thighs, 200, "2026-11-01") // gone off: a correction must not record a go-off
	got, err := f.svc.AdjustLot(ctx, lot.ID, 0)
	if err != nil || !got.Removed {
		t.Fatalf("AdjustLot(0) = %+v, %v", got, err)
	}
	if _, err := f.st.Lot(ctx, lot.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("the Lot should be gone: %v", err)
	}
	if g := f.goOffs(t); len(g) != 0 {
		t.Errorf("go-offs = %+v, want none: this is a correction", g)
	}
}

func TestAdjustLotToTheSameQuantityChangesNothingAndIsQuiet(t *testing.T) {
	f := setup(t)
	lot := f.add(t, f.milk, 400, "")
	events := f.pub.count()
	got, err := f.svc.AdjustLot(ctx, lot.ID, 400)
	if err != nil || got.Removed || got.Lot.Quantity != 400 {
		t.Fatalf("AdjustLot = %+v, %v", got, err)
	}
	if f.pub.count() != events {
		t.Error("an unchanged quantity published an event")
	}
}

func TestAdjustLotRefusesWhatItCannotDo(t *testing.T) {
	f := setup(t)
	lot := f.add(t, f.milk, 400, "")
	if _, err := f.svc.AdjustLot(ctx, 9999, 10); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown Lot: %v", err)
	}
	for _, q := range []float64{-1, nan()} {
		if _, err := f.svc.AdjustLot(ctx, lot.ID, q); !errors.Is(err, service.ErrInvalid) {
			t.Errorf("AdjustLot(%v) = %v, want ErrInvalid", q, err)
		}
	}
	if got := total(t, f, f.milk); got != 400 {
		t.Errorf("Stock = %v after refusals", got)
	}
}

// ---- KeepUntil (SSP-17) ----

func TestKeepUntilDefaultsToTodayInOneKeep(t *testing.T) {
	f := setup(t)
	old := f.add(t, f.eggs, 6, "2026-10-01") // off 10-22: 18 days overdue
	kept, err := f.svc.KeepUntil(ctx, old.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	if kept.GoesOff != today || kept.Spoiled || kept.ID != old.ID {
		t.Fatalf("kept = %+v, want good until today and not spoiled", kept)
	}
	if got := f.storedLot(t, old.ID); got.KeptOn != today {
		t.Errorf("KeptOn = %q, want %s (the streak forgives the go-offs so far)", got.KeptOn, today)
	}
	if sp, _ := f.svc.Spoiled(ctx); len(sp) != 0 {
		t.Errorf("Spoiled = %+v, want it off the tile until tomorrow", sp)
	}
}

func TestKeepUntilALaterDate(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 200, "2026-11-01")
	kept, err := f.svc.KeepUntil(ctx, l.ID, "2026-11-12")
	if err != nil || kept.GoesOff != "2026-11-12" || kept.Spoiled {
		t.Fatalf("kept = %+v, %v", kept, err)
	}
}

// The Keep toast's Change: after Keep took the Lot off the spoiled list, a second Keep the same day sets another date.
func TestKeepUntilChangesTheDateOfAKeepMadeToday(t *testing.T) {
	f, now := clockFixture(t)
	l := f.add(t, f.thighs, 200, "2026-11-01")
	if _, err := f.svc.KeepUntil(ctx, l.ID, ""); err != nil {
		t.Fatal(err)
	}
	kept, err := f.svc.KeepUntil(ctx, l.ID, "2026-11-12")
	if err != nil || kept.GoesOff != "2026-11-12" || kept.Spoiled {
		t.Fatalf("Change = %+v, %v, want good until 2026-11-12", kept, err)
	}
	if got := f.storedLot(t, l.ID); got.KeptOn != today {
		t.Errorf("KeptOn = %q, want %s", got.KeptOn, today)
	}
	*now = "2026-11-10" // the next day the Lot is neither spoiled nor kept today
	if _, err := f.svc.KeepUntil(ctx, l.ID, "2026-11-14"); !errors.Is(err, service.ErrNotSpoiled) {
		t.Errorf("Keep the next day of a Lot that has not gone off = %v, want ErrNotSpoiled", err)
	}
}

func TestKeepUntilRefusesADateBeforeTodayAndNonsense(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 200, "2026-11-01")
	for _, d := range []stock.Date{"2026-11-08", "tomorrow", "2026-13-40"} {
		if _, err := f.svc.KeepUntil(ctx, l.ID, d); !errors.Is(err, service.ErrInvalid) {
			t.Errorf("KeepUntil(%q) = %v, want ErrInvalid", d, err)
		}
	}
	if got := f.storedLot(t, l.ID); got.GoesOff != "2026-11-05" || !got.KeptOn.IsNone() {
		t.Errorf("the Lot changed after refusals: %+v", got)
	}
}

func TestKeepUntilRefusesALotThatHasNotGoneOffAndAnUnknownOne(t *testing.T) {
	f := setup(t)
	fresh := f.add(t, f.thighs, 200, "2026-11-08")
	if _, err := f.svc.KeepUntil(ctx, fresh.ID, ""); !errors.Is(err, service.ErrNotSpoiled) {
		t.Errorf("fresh: %v", err)
	}
	if _, err := f.svc.KeepUntil(ctx, 9999, ""); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown: %v", err)
	}
}

// ---- MoveMany (SSP-10) ----

func TestMoveManyPutsAwayNotSortedLotsInOneStockEvent(t *testing.T) {
	f := setup(t)
	fridge := f.place(t, "Fridge", stock.KindFridge)
	pantry := f.place(t, "Pantry", stock.KindPantry)
	a := f.add(t, f.eggs, 6, "2026-11-08")
	b := f.add(t, f.thighs, 300, "2026-11-08")
	c := f.add(t, f.milk, 1000, "")
	events := f.pub.count()
	res, err := f.svc.MoveMany(ctx, []service.PlaceMove{{LotID: a.ID, PlaceID: fridge}, {LotID: b.ID, PlaceID: fridge}, {LotID: c.ID, PlaceID: pantry}})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Moved) != 3 || len(res.Skipped) != 0 {
		t.Fatalf("result = %+v", res)
	}
	want := map[int64]int64{a.ID: fridge, b.ID: fridge, c.ID: pantry}
	for _, v := range res.Moved {
		if v.StoragePlaceID == nil || *v.StoragePlaceID != want[v.ID] {
			t.Errorf("Lot %d in %v, want place %d", v.ID, v.StoragePlaceID, want[v.ID])
		}
		if got := f.storedLot(t, v.ID); got.StoragePlaceID == nil || *got.StoragePlaceID != want[v.ID] {
			t.Errorf("stored Lot %d in %v", v.ID, got.StoragePlaceID)
		}
	}
	if f.pub.count() != events+1 {
		t.Errorf("events %d -> %d, want exactly one stock event for the whole move", events, f.pub.count())
	}
}

func TestMoveManyRemembersWhereEachIngredientWasLastPut(t *testing.T) {
	f := setup(t)
	f.place(t, "Fridge", stock.KindFridge)
	pantry := f.place(t, "Pantry", stock.KindPantry)
	c := f.add(t, f.milk, 1000, "")
	if _, err := f.svc.MoveMany(ctx, []service.PlaceMove{{LotID: c.ID, PlaceID: pantry}}); err != nil {
		t.Fatal(err)
	}
	next := f.add(t, f.milk, 500, "")
	if next.StoragePlaceID == nil || *next.StoragePlaceID != pantry {
		t.Errorf("the next Lot of milk went to %v, want Pantry %d (last put)", next.StoragePlaceID, pantry)
	}
}

func TestMoveManyIsAllOrNone(t *testing.T) {
	f := setup(t)
	fridge := f.place(t, "Fridge", stock.KindFridge)
	a := f.add(t, f.eggs, 6, "2026-11-08")
	b := f.add(t, f.milk, 1000, "")
	events := f.pub.count()

	if _, err := f.svc.MoveMany(ctx, []service.PlaceMove{{LotID: a.ID, PlaceID: fridge}, {LotID: b.ID, PlaceID: 9999}}); !errors.Is(err, service.ErrInvalid) {
		t.Errorf("unknown Storage Place: %v, want ErrInvalid", err)
	}
	if _, err := f.svc.MoveMany(ctx, []service.PlaceMove{{LotID: a.ID, PlaceID: fridge}, {LotID: 9999, PlaceID: fridge}}); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown Lot: %v, want store.ErrNotFound", err)
	}
	if _, err := f.svc.MoveMany(ctx, nil); !errors.Is(err, service.ErrInvalid) {
		t.Errorf("no moves: %v, want ErrInvalid", err)
	}
	if got := f.storedLot(t, a.ID); got.StoragePlaceID != nil {
		t.Errorf("Lot A moved to %v although a later move failed", *got.StoragePlaceID)
	}
	if f.pub.count() != events {
		t.Error("a refused MoveMany published an event")
	}
}

func TestMoveManyLeavesALotThatWasSortedMeanwhile(t *testing.T) {
	f := setup(t)
	fridge := f.place(t, "Fridge", stock.KindFridge)
	pantry := f.place(t, "Pantry", stock.KindPantry)
	sorted := f.addIn(t, f.milk, 1000, "2026-11-08", pantry) // another device already put it away
	loose := f.add(t, f.eggs, 6, "2026-11-08")
	res, err := f.svc.MoveMany(ctx, []service.PlaceMove{{LotID: sorted.ID, PlaceID: fridge}, {LotID: loose.ID, PlaceID: fridge}})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Moved) != 1 || res.Moved[0].ID != loose.ID || len(res.Skipped) != 1 || res.Skipped[0] != sorted.ID {
		t.Fatalf("result = %+v, want the sorted Lot skipped and the loose one moved", res)
	}
	if got := f.storedLot(t, sorted.ID); got.StoragePlaceID == nil || *got.StoragePlaceID != pantry {
		t.Errorf("the sorted Lot moved to %v, want it left in Pantry", got.StoragePlaceID)
	}
}

func TestMoveManyIntoAFreezerRestartsGoOffLikeMoveLot(t *testing.T) {
	f := frozenFixture(t)
	freezer := f.place(t, "Freezer", stock.KindFreezer)
	a := f.add(t, f.thighs, 300, "2026-11-08")
	twin := f.add(t, f.thighs, 300, "2026-11-08")
	res, err := f.svc.MoveMany(ctx, []service.PlaceMove{{LotID: a.ID, PlaceID: freezer}})
	if err != nil || len(res.Moved) != 1 {
		t.Fatalf("MoveMany = %+v, %v", res, err)
	}
	one, err := f.svc.MoveLot(ctx, twin.ID, freezer, 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.Moved[0].GoesOff != one.GoesOff || res.Moved[0].GoesOff == "2026-11-12" {
		t.Errorf("GoesOff %s, MoveLot gives %s: a Freezer's Shelf Life applies the same way", res.Moved[0].GoesOff, one.GoesOff)
	}
}

// ---- SetTotalRecorded: a Stock-take that can be undone (SAFE-09) ----

func TestSetTotalRecordedDecreaseSaysWhatItTookAndGiveBackRestoresIt(t *testing.T) {
	f := setup(t)
	a := f.add(t, f.thighs, 300, "2026-11-06") // goes off 11-10: soonest
	b := f.add(t, f.thighs, 500, "2026-11-08") // 11-12
	ch, err := f.svc.SetTotalRecorded(ctx, f.thighs, 600)
	if err != nil {
		t.Fatal(err)
	}
	if ch.AddedLotID != 0 || ch.Stock.Total != 600 {
		t.Fatalf("change = %+v", ch)
	}
	var taken float64
	for _, tk := range ch.Takes {
		if (tk.Lot.ID != a.ID && tk.Lot.ID != b.ID) || tk.Taken <= 0 || tk.Taken > tk.Lot.Quantity {
			t.Errorf("take = %+v: want a Lot as it was before, and a quantity within it", tk)
		}
		taken += tk.Taken
	}
	if taken != 200 {
		t.Errorf("takes add up to %v, want 200", taken)
	}
	if _, err := f.svc.GiveBack(ctx, ch.Takes); err != nil {
		t.Fatal(err)
	}
	if got := total(t, f, f.thighs); got != 800 {
		t.Errorf("Stock = %v, want 800 back", got)
	}
}

func TestSetTotalRecordedToZeroCanBeGivenBackWholeWithTheLotIds(t *testing.T) {
	f := setup(t)
	a := f.add(t, f.thighs, 300, "2026-11-06")
	b := f.add(t, f.thighs, 500, "2026-11-08")
	ch, err := f.svc.SetTotalRecorded(ctx, f.thighs, 0)
	if err != nil || len(ch.Takes) != 2 {
		t.Fatalf("change = %+v, %v", ch, err)
	}
	if _, err := f.svc.GiveBack(ctx, ch.Takes); err != nil {
		t.Fatal(err)
	}
	for _, id := range []int64{a.ID, b.ID} {
		if _, err := f.st.Lot(ctx, id); err != nil {
			t.Errorf("Lot %d is not back: %v", id, err)
		}
	}
	if got := total(t, f, f.thighs); got != 800 {
		t.Errorf("Stock = %v, want 800", got)
	}
}

func TestSetTotalRecordedIncreaseSaysWhichLotItAdded(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 300, "2026-11-08")
	ch, err := f.svc.SetTotalRecorded(ctx, f.thighs, 1000)
	if err != nil || ch.AddedLotID == 0 || len(ch.Takes) != 0 || ch.Stock.Total != 1000 {
		t.Fatalf("change = %+v, %v", ch, err)
	}
	added := f.storedLot(t, ch.AddedLotID)
	if added.Quantity != 700 || added.Source != store.SourceStockTake {
		t.Errorf("added Lot = %+v, want 700 from a stock_take", added)
	}
	if err := f.svc.RemoveLot(ctx, ch.AddedLotID); err != nil {
		t.Fatal(err)
	}
	if got := total(t, f, f.thighs); got != 300 {
		t.Errorf("Stock = %v after removing the added Lot, want 300", got)
	}
}

func TestSetTotalRecordedToTheSameTotalTakesAndAddsNothing(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 300, "2026-11-08")
	events := f.pub.count()
	ch, err := f.svc.SetTotalRecorded(ctx, f.thighs, 300)
	if err != nil || ch.AddedLotID != 0 || len(ch.Takes) != 0 || ch.Stock.Total != 300 {
		t.Fatalf("change = %+v, %v", ch, err)
	}
	if f.pub.count() != events {
		t.Error("an unchanged total published an event")
	}
	if _, err := f.svc.SetTotalRecorded(ctx, f.thighs, -1); !errors.Is(err, service.ErrInvalid) {
		t.Errorf("negative total: %v, want ErrInvalid", err)
	}
}

func nan() float64 { var z float64; return z / z }
