package store_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/stocktest"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

var ctx = context.Background()

type fixture struct {
	db     *sql.DB
	st     *store.Store
	thighs int64 // Ingredient ids
	milk   int64
	clock  *clock.Fake
}

func setup(t *testing.T) fixture {
	t.Helper()
	d := stocktest.NewDB(t)
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	days := 4
	return fixture{
		db: d, st: store.New(d, clk), clock: clk,
		thighs: stocktest.SeedIngredient(t, d, "chicken thighs", "g", &days),
		milk:   stocktest.SeedIngredient(t, d, "milk", "ml", nil),
	}
}

func (f fixture) add(t *testing.T, ing int64, qty float64, purchased, goesOff stock.Date) store.StoredLot {
	t.Helper()
	l, created, err := f.st.AddLot(ctx, store.NewLot{IngredientID: ing, Quantity: qty, Purchased: purchased, GoesOff: goesOff, Source: store.SourceManual})
	if err != nil || !created {
		t.Fatalf("AddLot: created=%v err=%v", created, err)
	}
	return l
}

func TestAddLotRoundTrip(t *testing.T) {
	f := setup(t)
	prod, shop := int64(11), int64(22)
	l, created, err := f.st.AddLot(ctx, store.NewLot{
		IngredientID: f.thighs, Quantity: 800, Purchased: "2026-11-09", GoesOff: "2026-11-13",
		Source: store.SourceScan, ProductID: &prod, ShopID: &shop, ClientUUID: "uuid-1",
	})
	if err != nil || !created || l.ID == 0 {
		t.Fatalf("AddLot = %+v created=%v err=%v", l, created, err)
	}
	got, err := f.st.Lot(ctx, l.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.IngredientID != f.thighs || got.Quantity != 800 || got.Purchased != "2026-11-09" || got.GoesOff != "2026-11-13" ||
		got.Source != store.SourceScan || got.ClientUUID != "uuid-1" ||
		got.ProductID == nil || *got.ProductID != 11 || got.ShopID == nil || *got.ShopID != 22 ||
		!got.CreatedAt.Equal(f.clock.Now()) {
		t.Fatalf("round trip = %+v", got)
	}
}

func TestAddLotWithoutGoOffOrProductStoresNull(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.milk, 1000, "2026-11-09", stock.None)
	got, _ := f.st.Lot(ctx, l.ID)
	if !got.GoesOff.IsNone() || got.ProductID != nil || got.ShopID != nil || got.ClientUUID != "" {
		t.Fatalf("expected NULLs, got %+v", got)
	}
}

func TestAddLotIsIdempotentOnClientUUID(t *testing.T) {
	f := setup(t)
	n := store.NewLot{IngredientID: f.milk, Quantity: 1000, Purchased: "2026-11-09", Source: store.SourceScan, ClientUUID: "scan-42"}
	first, created, err := f.st.AddLot(ctx, n)
	if err != nil || !created {
		t.Fatalf("first: %v %v", created, err)
	}
	second, created, err := f.st.AddLot(ctx, n)
	if err != nil || created || second.ID != first.ID {
		t.Fatalf("second: id %d vs %d created=%v err=%v", second.ID, first.ID, created, err)
	}
	lots, _ := f.st.Lots(ctx, f.milk)
	if len(lots) != 1 {
		t.Fatalf("expected 1 lot, got %d", len(lots))
	}
}

func TestLotNotFound(t *testing.T) {
	f := setup(t)
	if _, err := f.st.Lot(ctx, 999); err != store.ErrNotFound {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestLotsOrderedByGoOffThenPurchasedThenID(t *testing.T) {
	f := setup(t)
	a := f.add(t, f.thighs, 100, "2026-11-01", "2026-11-12")
	b := f.add(t, f.thighs, 100, "2026-11-01", stock.None)
	c := f.add(t, f.thighs, 100, "2026-11-02", "2026-11-10")
	d := f.add(t, f.thighs, 100, "2026-11-01", "2026-11-12")
	f.add(t, f.milk, 500, "2026-11-01", stock.None)
	lots, err := f.st.Lots(ctx, f.thighs)
	if err != nil {
		t.Fatal(err)
	}
	want := []int64{c.ID, a.ID, d.ID, b.ID}
	if len(lots) != 4 {
		t.Fatalf("len = %d", len(lots))
	}
	for i, id := range want {
		if lots[i].ID != id {
			t.Fatalf("position %d: id %d, want %d", i, lots[i].ID, id)
		}
	}
	all, _ := f.st.Lots(ctx, 0)
	if len(all) != 5 {
		t.Fatalf("all lots = %d, want 5", len(all))
	}
}

func TestUpdateAppliesPureDeductAtomically(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 500, "2026-11-01", "2026-11-12")
	f.add(t, f.thighs, 300, "2026-11-05", "2026-11-10")
	var shortfall float64
	saved, err := f.st.Update(ctx, f.thighs, func(lots []stock.Lot) (store.Mutation, error) {
		res := stock.Deduct(lots, 600)
		shortfall = res.Shortfall
		return store.Mutation{Lots: res.Lots}, nil
	})
	if err != nil || shortfall != 0 {
		t.Fatalf("Update: %v shortfall=%v", err, shortfall)
	}
	// 300 taken from the lot going off 11-10 (emptied, deleted), 300 from the other.
	if len(saved) != 1 || saved[0].Quantity != 200 || saved[0].GoesOff != "2026-11-12" {
		t.Fatalf("saved = %+v", saved)
	}
	again, _ := f.st.Lots(ctx, f.thighs)
	if len(again) != 1 || again[0].Quantity != 200 {
		t.Fatalf("persisted = %+v", again)
	}
}

func TestUpdateInsertsNewLotWithSource(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 100, "2026-11-01", "2026-11-12")
	days := 4
	saved, err := f.st.Update(ctx, f.thighs, func(lots []stock.Lot) (store.Mutation, error) {
		res, err := stock.SetTotal(lots, f.thighs, 1000, "2026-11-09", &days)
		return store.Mutation{Lots: res.Lots, NewSource: store.SourceStockTake}, err
	})
	if err != nil || len(saved) != 2 {
		t.Fatalf("Update: %v %+v", err, saved)
	}
	var added store.StoredLot
	for _, l := range saved {
		if l.Quantity == 900 {
			added = l
		}
	}
	if added.ID == 0 || added.Source != store.SourceStockTake || added.Purchased != "2026-11-09" || added.GoesOff != "2026-11-13" {
		t.Fatalf("added = %+v", added)
	}
}

func TestUpdateErrorRollsBackAndIsReturned(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 100, "2026-11-01", stock.None)
	_, err := f.st.Update(ctx, f.thighs, func(lots []stock.Lot) (store.Mutation, error) {
		return store.Mutation{}, stock.ErrNegativeTotal
	})
	if err != stock.ErrNegativeTotal {
		t.Fatalf("err = %v", err)
	}
	got, _ := f.st.Lot(ctx, l.ID)
	if got.Quantity != 100 {
		t.Fatalf("lot changed to %v", got.Quantity)
	}
}

func TestUpdateOnlySeesAndTouchesThatIngredient(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 100, "2026-11-01", stock.None)
	m := f.add(t, f.milk, 500, "2026-11-01", stock.None)
	_, err := f.st.Update(ctx, f.thighs, func(lots []stock.Lot) (store.Mutation, error) {
		if len(lots) != 1 || lots[0].IngredientID != f.thighs {
			t.Errorf("fn saw %+v", lots)
		}
		return store.Mutation{Lots: nil}, nil // remove all thighs
	})
	if err != nil {
		t.Fatal(err)
	}
	if got, err := f.st.Lot(ctx, m.ID); err != nil || got.Quantity != 500 {
		t.Fatalf("milk lot touched: %+v %v", got, err)
	}
	if left, _ := f.st.Lots(ctx, f.thighs); len(left) != 0 {
		t.Fatalf("thighs left: %+v", left)
	}
}

func TestUpdateRecordsWasteInSameTransaction(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 250, "2026-11-01", "2026-11-05")
	ing := f.thighs
	_, err := f.st.Update(ctx, f.thighs, func(lots []stock.Lot) (store.Mutation, error) {
		return store.Mutation{Waste: []store.WasteRecord{{
			IngredientID: &ing, Quantity: 250, WastedOn: "2026-11-09", Reason: store.ReasonSpoiled, LotID: &l.ID,
		}}}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	recs, err := f.st.Waste(ctx, "", "")
	if err != nil || len(recs) != 1 {
		t.Fatalf("waste = %+v %v", recs, err)
	}
	r := recs[0]
	if r.ID == 0 || *r.IngredientID != f.thighs || r.Quantity != 250 || r.WastedOn != "2026-11-09" ||
		r.Reason != store.ReasonSpoiled || r.LotID == nil || *r.LotID != l.ID {
		t.Fatalf("record = %+v", r)
	}
}

func TestWasteRangeAndLeftoverWithoutIngredient(t *testing.T) {
	f := setup(t)
	for _, w := range []store.WasteRecord{
		{Quantity: 2, WastedOn: "2026-11-01", Reason: store.ReasonLeftoverDiscarded},
		{IngredientID: &f.milk, Quantity: 300, WastedOn: "2026-11-05", Reason: store.ReasonSpoiled},
		{IngredientID: &f.milk, Quantity: 100, WastedOn: "2026-11-09", Reason: store.ReasonSpoiled},
	} {
		if _, err := f.st.AddWaste(ctx, w); err != nil {
			t.Fatalf("AddWaste: %v", err)
		}
	}
	all, _ := f.st.Waste(ctx, "", "")
	if len(all) != 3 || all[0].IngredientID != nil || all[0].Reason != store.ReasonLeftoverDiscarded {
		t.Fatalf("all = %+v", all)
	}
	mid, _ := f.st.Waste(ctx, "2026-11-05", "2026-11-09")
	if len(mid) != 2 {
		t.Fatalf("range inclusive = %d, want 2", len(mid))
	}
	from, _ := f.st.Waste(ctx, "2026-11-06", "")
	if len(from) != 1 || from[0].Quantity != 100 {
		t.Fatalf("open end = %+v", from)
	}
}

func TestAddWasteRejectsUnknownReason(t *testing.T) {
	f := setup(t)
	if _, err := f.st.AddWaste(ctx, store.WasteRecord{Quantity: 1, WastedOn: "2026-11-09", Reason: "boredom"}); err == nil {
		t.Fatal("expected an error for an unknown reason")
	}
}

// deductTx takes qty out of the Ingredient's lots inside tx.
func (f fixture) deductTx(t *testing.T, tx *sql.Tx, ing int64, qty float64) {
	t.Helper()
	_, err := f.st.UpdateTx(ctx, tx, ing, func(lots []stock.Lot) (store.Mutation, error) {
		return store.Mutation{Lots: stock.Deduct(lots, qty).Lots}, nil
	})
	if err != nil {
		t.Fatalf("UpdateTx: %v", err)
	}
}

func quantityOf(t *testing.T, f fixture, ing int64) float64 {
	t.Helper()
	lots, err := f.st.Lots(ctx, ing)
	if err != nil {
		t.Fatal(err)
	}
	var sum float64
	for _, l := range lots {
		sum += l.Quantity
	}
	return sum
}

func TestUpdateTxCommitsWithTheCallersTransaction(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 300, "2026-11-01", "2026-11-12")
	f.add(t, f.milk, 1000, "2026-11-01", stock.None)
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	f.deductTx(t, tx, f.thighs, 100)
	f.deductTx(t, tx, f.milk, 250)
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if got := quantityOf(t, f, f.thighs); got != 200 {
		t.Errorf("thighs = %v, want 200", got)
	}
	if got := quantityOf(t, f, f.milk); got != 750 {
		t.Errorf("milk = %v, want 750", got)
	}
}

func TestUpdateTxRollsBackWithTheCallersTransaction(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 300, "2026-11-01", "2026-11-12")
	f.add(t, f.milk, 1000, "2026-11-01", stock.None)
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	f.deductTx(t, tx, f.thighs, 100)
	f.deductTx(t, tx, f.milk, 250)
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if quantityOf(t, f, f.thighs) != 300 || quantityOf(t, f, f.milk) != 1000 {
		t.Fatalf("rollback left thighs=%v milk=%v", quantityOf(t, f, f.thighs), quantityOf(t, f, f.milk))
	}
}

func TestUpdateTxReturnsFnErrorAndRecordsWasteInTheCallersTransaction(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 300, "2026-11-01", "2026-11-12")
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := f.st.UpdateTx(ctx, tx, f.thighs, func([]stock.Lot) (store.Mutation, error) {
		return store.Mutation{}, stock.ErrNegativeTotal
	}); err != stock.ErrNegativeTotal {
		t.Fatalf("err = %v, want fn's error as is", err)
	}
	ing := f.thighs
	if _, err := f.st.UpdateTx(ctx, tx, f.thighs, func(lots []stock.Lot) (store.Mutation, error) {
		return store.Mutation{Lots: nil, Waste: []store.WasteRecord{{IngredientID: &ing, Quantity: 300, WastedOn: "2026-11-09", Reason: store.ReasonSpoiled}}}, nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if recs, _ := f.st.Waste(ctx, "", ""); len(recs) != 0 {
		t.Fatalf("waste survived the rollback: %+v", recs)
	}
	if quantityOf(t, f, f.thighs) != 300 {
		t.Fatal("lot changed despite rollback")
	}
}
