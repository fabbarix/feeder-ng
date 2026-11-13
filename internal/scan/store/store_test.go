package store_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/scan/store"
	"github.com/fabbarix/feeder-ng/internal/stock/stocktest"
)

func setup(t *testing.T) (*store.Store, *clock.Fake) {
	t.Helper()
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	return store.New(stocktest.NewDB(t), clk), clk
}

func i64(v int64) *int64 { return &v }
func i(v int) *int       { return &v }

func event(uuid string, price int, lot int64) store.Event {
	return store.Event{ClientUUID: uuid, Kind: "shop_scan", ScannedAt: "2026-11-09T11:59:00Z", ShopID: i64(1), ProductID: i64(7),
		Quantity: 700, PriceCents: i(price), RangeTo: "2026-11-15", LotID: i64(lot), ResultJSON: `{"status":"applied"}`}
}

func TestInsertSetsSequenceAndTimeAndGetReadsItBack(t *testing.T) {
	st, _ := setup(t)
	ctx := context.Background()
	a, err := st.Insert(ctx, event("a", 159, 1))
	if err != nil || a.Seq != 1 || a.AppliedAt != "2026-11-09T12:00:00Z" {
		t.Fatalf("first Insert = %+v, %v", a, err)
	}
	b, _ := st.Insert(ctx, event("b", 159, 2))
	if b.Seq != 2 {
		t.Fatalf("second Seq = %d, want 2 (application order)", b.Seq)
	}
	got, ok, err := st.Get(ctx, "a")
	if err != nil || !ok || got.Quantity != 700 || got.ProductID == nil || *got.ProductID != 7 || got.PriceCents == nil || *got.PriceCents != 159 ||
		got.RangeTo != "2026-11-15" || got.ResultJSON != `{"status":"applied"}` || got.UndoneAt != "" {
		t.Fatalf("Get = %+v, %v, %v", got, ok, err)
	}
	if _, ok, _ := st.Get(ctx, "nope"); ok {
		t.Fatal("unknown uuid must not be found")
	}
}

func TestInsertTwiceIsADuplicate(t *testing.T) {
	st, _ := setup(t)
	ctx := context.Background()
	_, _ = st.Insert(ctx, event("a", 159, 1))
	if _, err := st.Insert(ctx, event("a", 159, 2)); !errors.Is(err, store.ErrDuplicate) {
		t.Fatalf("err = %v, want ErrDuplicate", err)
	}
}

func TestMarkUndoneIsIdempotent(t *testing.T) {
	st, clk := setup(t)
	ctx := context.Background()
	_, _ = st.Insert(ctx, event("a", 159, 1))
	clk.Advance(time.Minute)
	if changed, err := st.MarkUndone(ctx, "a"); err != nil || !changed {
		t.Fatalf("first = %v, %v", changed, err)
	}
	if changed, err := st.MarkUndone(ctx, "a"); err != nil || changed {
		t.Fatalf("second = %v, %v; want unchanged", changed, err)
	}
	if got, _, _ := st.Get(ctx, "a"); got.UndoneAt != "2026-11-09T12:01:00Z" {
		t.Fatalf("UndoneAt = %q", got.UndoneAt)
	}
	if _, err := st.MarkUndone(ctx, "ghost"); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("unknown: err = %v", err)
	}
}

func TestTotalsCountTheRangesAppliedScansOnly(t *testing.T) {
	st, _ := setup(t)
	ctx := context.Background()
	_, _ = st.Insert(ctx, event("a", 159, 1))
	_, _ = st.Insert(ctx, event("b", 241, 2))
	_, _ = st.Insert(ctx, event("c", 500, 3)) // undone below
	other := event("d", 999, 4)
	other.RangeTo = "2026-11-12"
	_, _ = st.Insert(ctx, other)
	noPrice := event("e", 0, 5)
	noPrice.PriceCents = nil
	_, _ = st.Insert(ctx, noPrice)
	take := event("t", 0, 6)
	take.Kind, take.RangeTo, take.PriceCents = "stock_take", "", nil
	_, _ = st.Insert(ctx, take)
	_, _ = st.MarkUndone(ctx, "c")
	spent, lots, err := st.Totals(ctx, "2026-11-15")
	if err != nil || spent != 400 || lots != 3 {
		t.Fatalf("Totals = %d, %d, %v; want 400 spent, 3 Lots (a, b, e)", spent, lots, err)
	}
}

func TestUpdatePriceChangesTheTotal(t *testing.T) {
	st, _ := setup(t)
	ctx := context.Background()
	_, _ = st.Insert(ctx, event("a", 159, 1))
	if err := st.UpdatePrice(ctx, "a", 179, i64(12)); err != nil {
		t.Fatal(err)
	}
	if spent, _, _ := st.Totals(ctx, "2026-11-15"); spent != 179 {
		t.Fatalf("spent = %d, want 179", spent)
	}
	if got, _, _ := st.Get(ctx, "a"); got.PriceID == nil || *got.PriceID != 12 {
		t.Fatalf("PriceID = %v", got.PriceID)
	}
	if err := st.UpdatePrice(ctx, "ghost", 1, nil); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("unknown: err = %v", err)
	}
}

func TestUndoStepsAreRecordedOnceEachInTheOrderTheyRan(t *testing.T) {
	st, _ := setup(t)
	ctx := context.Background()
	_, _ = st.Insert(ctx, event("a", 159, 1))
	if got, _, _ := st.Get(ctx, "a"); len(got.UndoSteps) != 0 {
		t.Fatalf("UndoSteps before Undo = %v, want none", got.UndoSteps)
	}
	for _, step := range []string{store.UndoStepList, store.UndoStepList, store.UndoStepLot} {
		if err := st.MarkUndoStep(ctx, "a", step); err != nil {
			t.Fatalf("MarkUndoStep(%s): %v", step, err)
		}
	}
	got, _, _ := st.Get(ctx, "a")
	if len(got.UndoSteps) != 2 || got.UndoSteps[0] != store.UndoStepList || got.UndoSteps[1] != store.UndoStepLot || got.UndoneAt != "" {
		t.Fatalf("UndoSteps = %v, undoneAt %q; want [list lot] and not undone yet", got.UndoSteps, got.UndoneAt)
	}
	if _, err := st.MarkUndone(ctx, "a"); err != nil {
		t.Fatal(err)
	}
	if got, _, _ := st.Get(ctx, "a"); len(got.UndoSteps) != 2 {
		t.Fatalf("UndoSteps after MarkUndone = %v, want them kept", got.UndoSteps)
	}
	if err := st.MarkUndoStep(ctx, "ghost", store.UndoStepList); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("unknown uuid: err = %v, want ErrNotFound", err)
	}
}

// SR1: UpdatePrices sets the price of several events in one transaction (the store half of SetPrices).
// type PriceUpdate struct { ClientUUID string; Cents int; PriceID *int64 }  (PriceID nil keeps the one the event has)
// func (s *Store) UpdatePrices(ctx context.Context, updates []PriceUpdate) error
func TestUpdatePricesSetsEveryEventAndItsResult(t *testing.T) {
	st, _ := setup(t)
	ctx := context.Background()
	ev := event("a", 100, 1)
	ev.RangeTo = "2026-11-15"
	_, _ = st.Insert(ctx, ev)
	ev = event("b", 100, 2)
	_, _ = st.Insert(ctx, ev)
	ev = event("c", 100, 3)
	_, _ = st.Insert(ctx, ev)
	if err := st.UpdatePrices(ctx, []store.PriceUpdate{{ClientUUID: "a", Cents: 129, PriceID: i64(5)}, {ClientUUID: "b", Cents: 624}}); err != nil {
		t.Fatal(err)
	}
	a, _, _ := st.Get(ctx, "a")
	b, _, _ := st.Get(ctx, "b")
	c, _, _ := st.Get(ctx, "c")
	if *a.PriceCents != 129 || a.PriceID == nil || *a.PriceID != 5 || !strings.Contains(a.ResultJSON, `"priceCents":129`) {
		t.Fatalf("a = %+v", a)
	}
	if *b.PriceCents != 624 || b.PriceID != nil || !strings.Contains(b.ResultJSON, `"priceCents":624`) {
		t.Fatalf("b = %+v (PriceID nil keeps the event's own)", b)
	}
	if *c.PriceCents != 100 {
		t.Fatalf("c = %+v, want untouched", c)
	}
	if spent, _, _ := st.Totals(ctx, "2026-11-15"); spent != 129+624+100 {
		t.Fatalf("Totals = %d, want %d", spent, 129+624+100)
	}
}

func TestUpdatePricesIsAllOrNothing(t *testing.T) {
	st, _ := setup(t)
	ctx := context.Background()
	_, _ = st.Insert(ctx, event("a", 100, 1))
	err := st.UpdatePrices(ctx, []store.PriceUpdate{{ClientUUID: "a", Cents: 129}, {ClientUUID: "ghost", Cents: 129}})
	if !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
	if a, _, _ := st.Get(ctx, "a"); *a.PriceCents != 100 {
		t.Fatalf("a = %d, want the first update rolled back to 100", *a.PriceCents)
	}
}
