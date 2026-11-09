//go:build t2merged

package store_test

import (
	"testing"

	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

func TestMoverIsRegisteredWithIngredients(t *testing.T) {
	for _, m := range ingredientstore.DefaultMovers.All() {
		if m.Name() == "stock lots" {
			return
		}
	}
	t.Fatal("stock lots mover not registered")
}

func TestMoverCountsLotsAndWaste(t *testing.T) {
	f := setup(t)
	f.add(t, f.milk, 100, "2026-11-09", stock.None)
	f.add(t, f.milk, 200, "2026-11-09", stock.None)
	if _, err := f.st.AddWaste(ctx, store.WasteRecord{IngredientID: &f.milk, Quantity: 5, WastedOn: "2026-11-09", Reason: store.ReasonSpoiled}); err != nil {
		t.Fatal(err)
	}
	n, err := (store.Mover{}).Count(ctx, f.db, f.milk)
	if err != nil || n != 3 {
		t.Fatalf("Count = %d %v, want 3", n, err)
	}
	if n, _ := (store.Mover{}).Count(ctx, f.db, f.thighs); n != 0 {
		t.Fatalf("Count(thighs) = %d", n)
	}
}

func TestMoverMoveRepointsLotsAndKeepsBothLots(t *testing.T) {
	f := setup(t)
	f.add(t, f.milk, 100, "2026-11-09", stock.None)
	f.add(t, f.thighs, 300, "2026-11-09", stock.None)
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := (store.Mover{}).Move(ctx, tx, f.milk, f.thighs); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if lots, _ := f.st.Lots(ctx, f.thighs); len(lots) != 2 {
		t.Fatalf("thighs lots = %d, want 2", len(lots))
	}
	if lots, _ := f.st.Lots(ctx, f.milk); len(lots) != 0 {
		t.Fatalf("milk lots = %d, want 0", len(lots))
	}
}
