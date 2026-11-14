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

// b8-rxgo: a failed receipt apply's put-back lets its own undone scans go of the Ingredient it created; a live scan, a
// scan outside the list and a scan of another Ingredient keep theirs.
func TestReleaseIngredientClearsOnlyTheListedUndoneScansOfThatIngredient(t *testing.T) {
	db := stocktest.NewDB(t)
	st := store.New(db, clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)))
	ctx := context.Background()
	for _, e := range []struct {
		uuid string
		ing  int64
		undo bool
	}{{"put-back", 42, true}, {"live", 42, false}, {"other-run", 42, true}, {"other-ing", 43, true}} {
		ev := event(e.uuid, 159, 1)
		ev.IngredientID = i64(e.ing)
		if _, err := st.Insert(ctx, ev); err != nil {
			t.Fatal(err)
		}
		if e.undo {
			if _, err := st.MarkUndone(ctx, e.uuid); err != nil {
				t.Fatal(err)
			}
		}
	}
	n, err := st.ReleaseIngredient(ctx, []string{"put-back", "live", "other-ing", "ghost"}, 42)
	if err != nil || n != 1 {
		t.Fatalf("ReleaseIngredient = %d, %v; want 1", n, err)
	}
	want := map[string]*int64{"put-back": nil, "live": i64(42), "other-run": i64(42), "other-ing": i64(43)}
	for u, w := range want {
		got, _, _ := st.Get(ctx, u)
		if (got.IngredientID == nil) != (w == nil) || (w != nil && *got.IngredientID != *w) {
			t.Errorf("%s: IngredientID = %v, want %v", u, got.IngredientID, w)
		}
	}
	if c, err := (store.Mover{}).Count(ctx, db, 42); err != nil || c != 2 {
		t.Errorf("Mover.Count(42) = %d, %v; want 2 (the live scan and the other run's undone scan)", c, err)
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

// The transaction re-checks Undo: an event undone since the service read it is ErrUndone, and nothing is written.
func TestUpdatePricesRefusesAnUndoneEvent(t *testing.T) {
	st, _ := setup(t)
	ctx := context.Background()
	_, _ = st.Insert(ctx, event("a", 100, 1))
	_, _ = st.Insert(ctx, event("b", 100, 2))
	_, _ = st.MarkUndone(ctx, "b")
	err := st.UpdatePrices(ctx, []store.PriceUpdate{{ClientUUID: "a", Cents: 129}, {ClientUUID: "b", Cents: 129}})
	if !errors.Is(err, store.ErrUndone) {
		t.Fatalf("err = %v, want ErrUndone", err)
	}
	if a, _, _ := st.Get(ctx, "a"); *a.PriceCents != 100 {
		t.Fatalf("a = %d, want 100", *a.PriceCents)
	}
}

func TestUpdatePricesSetsTheReplacedPriceOnlyWhenGiven(t *testing.T) {
	st, _ := setup(t)
	ctx := context.Background()
	ev := event("a", 100, 1)
	ev.PrevPriceJSON = `{"date":"2026-11-09","priceCents":90}`
	_, _ = st.Insert(ctx, ev)
	_, _ = st.Insert(ctx, event("b", 100, 2))
	empty, set := "", `{"date":"2026-11-09","priceCents":80}`
	_ = st.UpdatePrices(ctx, []store.PriceUpdate{{ClientUUID: "a", Cents: 129}, {ClientUUID: "b", Cents: 129, PrevPriceJSON: &set}})
	a, _, _ := st.Get(ctx, "a")
	b, _, _ := st.Get(ctx, "b")
	if a.PrevPriceJSON != ev.PrevPriceJSON || b.PrevPriceJSON != set {
		t.Fatalf("a %q, b %q", a.PrevPriceJSON, b.PrevPriceJSON)
	}
	_ = st.UpdatePrices(ctx, []store.PriceUpdate{{ClientUUID: "a", Cents: 129, PrevPriceJSON: &empty}})
	if a, _, _ := st.Get(ctx, "a"); a.PrevPriceJSON != "" {
		t.Fatalf("a %q, want cleared", a.PrevPriceJSON)
	}
}

func TestRestorePricesPutsBackNoPrice(t *testing.T) {
	st, _ := setup(t)
	ctx := context.Background()
	ev := event("a", 0, 1)
	ev.PriceCents, ev.ResultJSON = nil, `{"status":"applied","scan":{"priceCents":null}}`
	before, _ := st.Insert(ctx, ev)
	_ = st.UpdatePrices(ctx, []store.PriceUpdate{{ClientUUID: "a", Cents: 129, PriceID: i64(5)}})
	if err := st.RestorePrices(ctx, []store.EventPrice{before.PriceState()}); err != nil {
		t.Fatal(err)
	}
	a, _, _ := st.Get(ctx, "a")
	if a.PriceCents != nil || a.PriceID != nil || strings.Contains(a.ResultJSON, "129") {
		t.Fatalf("a = %+v", a)
	}
	if err := st.RestorePrices(ctx, []store.EventPrice{{ClientUUID: "ghost"}}); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("ghost: err = %v", err)
	}
}

func TestSharedPriceIsAnotherLiveEventOnTheSamePriceRow(t *testing.T) {
	st, _ := setup(t)
	ctx := context.Background()
	a := event("a", 100, 1)
	a.PriceID, a.PrevPriceJSON = i64(5), `{"date":"2026-11-09","priceCents":90}`
	b := event("b", 100, 2)
	b.PriceID = i64(5)
	_, _ = st.Insert(ctx, a)
	_, _ = st.Insert(ctx, b)
	if prev, shared, err := st.SharedPrice(ctx, 5, "b"); err != nil || !shared || prev != a.PrevPriceJSON {
		t.Fatalf("for b: %q %v %v, want a's", prev, shared, err)
	}
	_, _ = st.MarkUndone(ctx, "a")
	if _, shared, _ := st.SharedPrice(ctx, 5, "b"); shared {
		t.Fatal("an undone event does not share")
	}
}
