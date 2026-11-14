package store_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/store"
)

// B9-23 (reviewer): an Ingredient merge moves every tick addition, and a range both Ingredients ticked keeps one tick
// that covers both Lines and carries both additions with their Stock Lots.
func TestTheIngredientMoverMovesTickAdditionsAndCoversBothLines(t *testing.T) {
	st, db, milk, rice := setupDB(t)
	ctx := context.Background()
	for _, c := range []struct {
		ing  int64
		uuid string
		lot  int64
		q    float64
	}{{milk, "m1", 1, 300}, {rice, "r1", 2, 500}} {
		if _, ok, err := st.AddLineAddition(ctx, "2026-11-15", c.ing, shopping.Addition{ClientUUID: c.uuid, By: "hand", LotID: c.lot,
			Quantity: c.q, Covers: c.q}); err != nil || !ok {
			t.Fatalf("AddLineAddition(%s) = %v, %v", c.uuid, ok, err)
		}
	}
	if _, ok, err := st.AddLineAddition(ctx, "2026-11-12", milk, shopping.Addition{ClientUUID: "m2", By: "hand", LotID: 3, Quantity: 50, Covers: 50}); err != nil || !ok {
		t.Fatal(err)
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := (store.Mover{}).Move(ctx, tx, milk, rice); err != nil {
		t.Fatalf("Move: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	ticks, err := st.Ticks(ctx, "2026-11-15")
	if err != nil {
		t.Fatal(err)
	}
	tk, ok := ticks[rice]
	if !ok || len(ticks) != 1 || tk.Needed != 800 || tk.Added != 800 || len(tk.Additions) != 2 {
		t.Fatalf("11-15 ticks = %+v; want rice's tick covering 800 with both additions (800 added)", ticks)
	}
	if ticks, _ := st.Ticks(ctx, "2026-11-12"); len(ticks) != 1 || ticks[rice].Needed != 50 || len(ticks[rice].Additions) != 1 {
		t.Fatalf("11-12 ticks = %+v; want milk's tick moved to rice with its addition", ticks)
	}
	if n, _ := (store.Mover{}).Count(ctx, db, milk); n != 0 {
		t.Errorf("Count of the old Ingredient = %d, want 0", n)
	}
}
