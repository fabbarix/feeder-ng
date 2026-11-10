package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/store"
	"github.com/fabbarix/feeder-ng/internal/stock/stocktest"
)

func setup(t *testing.T) (*store.Store, int64, int64) {
	t.Helper()
	db := stocktest.NewDB(t)
	milk := stocktest.SeedIngredient(t, db, "milk", "ml", nil)
	rice := stocktest.SeedIngredient(t, db, "rice", "g", nil)
	return store.New(db, clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))), milk, rice
}

func TestTextExtrasAreTrimmedAndBlankOnesRejected(t *testing.T) {
	st, _, _ := setup(t)
	ctx := context.Background()
	e, err := st.AddTextExtra(ctx, "  toilet   paper ")
	if err != nil || e.ID == 0 || e.Text != "toilet paper" || e.Ticked || e.IngredientID != 0 {
		t.Fatalf("AddTextExtra = %+v, %v", e, err)
	}
	if _, err := st.AddTextExtra(ctx, "   "); !errors.Is(err, store.ErrInvalid) {
		t.Fatalf("blank text: err = %v, want ErrInvalid", err)
	}
}

func TestIngredientExtrasNeedAPositiveQuantityAndAKnownIngredient(t *testing.T) {
	st, milk, _ := setup(t)
	ctx := context.Background()
	e, err := st.AddIngredientExtra(ctx, milk, 1000)
	if err != nil || e.IngredientID != milk || e.Quantity != 1000 || e.Got != 0 || e.Text != "" {
		t.Fatalf("AddIngredientExtra = %+v, %v", e, err)
	}
	if _, err := st.AddIngredientExtra(ctx, milk, 0); !errors.Is(err, store.ErrInvalid) {
		t.Fatalf("zero quantity: err = %v, want ErrInvalid", err)
	}
	if _, err := st.AddIngredientExtra(ctx, 9999, 5); err == nil {
		t.Fatal("an unknown Ingredient must be rejected")
	}
}

func TestExtrasStayUntilTickedOrDeleted(t *testing.T) {
	st, milk, _ := setup(t)
	ctx := context.Background()
	a, _ := st.AddTextExtra(ctx, "candles")
	b, _ := st.AddIngredientExtra(ctx, milk, 500)
	got, err := st.Extras(ctx, "2026-11-09")
	if err != nil || len(got) != 2 || got[0].ID != a.ID || got[1].ID != b.ID {
		t.Fatalf("Extras = %+v, %v; want both, in id order", got, err)
	}
	// An open extra is still there days later.
	if got, _ = st.Extras(ctx, "2026-11-20"); len(got) != 2 {
		t.Fatalf("open extras after 11 days = %+v, want 2", got)
	}
	if err := st.TickExtra(ctx, a.ID, "2026-11-09"); err != nil {
		t.Fatal(err)
	}
	if got, _ = st.Extras(ctx, "2026-11-09"); len(got) != 2 || !got[0].Ticked {
		t.Fatalf("a ticked extra stays listed (as ticked) on the day it was ticked: %+v", got)
	}
	if got, _ = st.Extras(ctx, "2026-11-10"); len(got) != 1 || got[0].ID != b.ID {
		t.Fatalf("a ticked extra is dropped the next day: %+v", got)
	}
	if err := st.UntickExtra(ctx, a.ID); err != nil {
		t.Fatal(err)
	}
	if got, _ = st.Extras(ctx, "2026-11-10"); len(got) != 2 {
		t.Fatalf("an unticked extra is open again: %+v", got)
	}
	if err := st.DeleteExtra(ctx, b.ID); err != nil {
		t.Fatal(err)
	}
	if got, _ = st.Extras(ctx, "2026-11-10"); len(got) != 1 || got[0].ID != a.ID {
		t.Fatalf("after delete = %+v", got)
	}
	for name, err := range map[string]error{"delete": st.DeleteExtra(ctx, 999), "tick": st.TickExtra(ctx, 999, "2026-11-09"), "untick": st.UntickExtra(ctx, 999)} {
		if !errors.Is(err, store.ErrNotFound) {
			t.Errorf("%s of an unknown extra: err = %v, want ErrNotFound", name, err)
		}
	}
}

func TestAddGotAccumulatesAndFloorsAtZero(t *testing.T) {
	st, milk, _ := setup(t)
	ctx := context.Background()
	e, _ := st.AddIngredientExtra(ctx, milk, 1000)
	if e, err := st.AddGot(ctx, e.ID, 400); err != nil || e.Got != 400 {
		t.Fatalf("AddGot +400 = %+v, %v", e, err)
	}
	if e, err := st.AddGot(ctx, e.ID, -1000); err != nil || e.Got != 0 {
		t.Fatalf("AddGot -1000 = %+v, %v; want floor 0", e, err)
	}
	if _, err := st.AddGot(ctx, 999, 1); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("unknown extra: err = %v", err)
	}
}

func TestTicksAreKeptPerRangeAndIngredient(t *testing.T) {
	st, milk, rice := setup(t)
	ctx := context.Background()
	lot := int64(41)
	if err := st.SetTick(ctx, "2026-11-15", shopping.Tick{IngredientID: milk, Needed: 1000, By: "hand"}, &lot); err != nil {
		t.Fatal(err)
	}
	if err := st.SetTick(ctx, "2026-11-15", shopping.Tick{IngredientID: rice, Needed: 300, By: "scan"}, nil); err != nil {
		t.Fatal(err)
	}
	if err := st.SetTick(ctx, "2026-11-12", shopping.Tick{IngredientID: milk, Needed: 400, By: "scan"}, nil); err != nil {
		t.Fatal(err)
	}
	ticks, err := st.Ticks(ctx, "2026-11-15")
	if err != nil || len(ticks) != 2 {
		t.Fatalf("Ticks(11-15) = %+v, %v", ticks, err)
	}
	if m := ticks[milk]; m.Needed != 1000 || m.By != "hand" || m.IngredientID != milk {
		t.Fatalf("milk tick = %+v", m)
	}
	if other, _ := st.Ticks(ctx, "2026-11-12"); len(other) != 1 || other[milk].Needed != 400 {
		t.Fatalf("a range of its own: %+v", other)
	}
	// Ticking again replaces.
	_ = st.SetTick(ctx, "2026-11-15", shopping.Tick{IngredientID: milk, Needed: 800, By: "scan"}, nil)
	if ticks, _ = st.Ticks(ctx, "2026-11-15"); ticks[milk].Needed != 800 || ticks[milk].By != "scan" {
		t.Fatalf("upsert: %+v", ticks[milk])
	}
	if err := st.DeleteTick(ctx, "2026-11-15", rice); err != nil {
		t.Fatal(err)
	}
	if err := st.DeleteTick(ctx, "2026-11-15", rice); err != nil {
		t.Fatalf("unticking twice must be harmless: %v", err)
	}
	if ticks, _ = st.Ticks(ctx, "2026-11-15"); len(ticks) != 1 {
		t.Fatalf("after DeleteTick: %+v", ticks)
	}
}

func TestPurgeBeforeDropsOnlyEndedRanges(t *testing.T) {
	st, milk, _ := setup(t)
	ctx := context.Background()
	_ = st.SetTick(ctx, "2026-11-08", shopping.Tick{IngredientID: milk, Needed: 1, By: "hand"}, nil)
	_ = st.SetTick(ctx, "2026-11-09", shopping.Tick{IngredientID: milk, Needed: 2, By: "hand"}, nil)
	if err := st.PurgeBefore(ctx, "2026-11-09"); err != nil {
		t.Fatal(err)
	}
	if old, _ := st.Ticks(ctx, "2026-11-08"); len(old) != 0 {
		t.Fatalf("a range that ended yesterday must go: %+v", old)
	}
	if kept, _ := st.Ticks(ctx, "2026-11-09"); len(kept) != 1 {
		t.Fatalf("a range ending today stays: %+v", kept)
	}
}

func TestLotsAddedCountsTicksThatAddedALot(t *testing.T) {
	st, milk, rice := setup(t)
	ctx := context.Background()
	lot := int64(7)
	_ = st.SetTick(ctx, "2026-11-15", shopping.Tick{IngredientID: milk, Needed: 1, By: "hand"}, &lot)
	_ = st.SetTick(ctx, "2026-11-15", shopping.Tick{IngredientID: rice, Needed: 1, By: "hand"}, nil)
	if n, err := st.LotsAdded(ctx, "2026-11-15"); err != nil || n != 1 {
		t.Fatalf("LotsAdded = %d, %v; want 1", n, err)
	}
}
