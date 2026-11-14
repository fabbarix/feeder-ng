package service_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/service"
)

// B9-11 (SAFE-03): a Cooked deduction says what it took, Lot by Lot, with each Lot as it was, so that Planning can give
// exactly that back when Cooked is undone.

func TestDeductForCookedTxReportsWhatItTookFromEachLot(t *testing.T) {
	f := setup(t)
	older := f.add(t, f.milk, 300, "2026-11-01")
	newer := f.add(t, f.milk, 400, "2026-11-08")
	before := map[int64]float64{older.ID: 300, newer.ID: 400}
	tx, err := f.st.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	d, err := f.svc.DeductForCookedTx(ctx, tx, []stock.Need{{IngredientID: f.milk, Quantity: 500}})
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if len(d.Takes) != 2 {
		t.Fatalf("takes = %+v, want one per Lot it took from", d.Takes)
	}
	var sum float64
	for _, tk := range d.Takes {
		if tk.Lot.IngredientID != f.milk || tk.Lot.Quantity != before[tk.Lot.ID] {
			t.Errorf("take %+v: want the Lot as it was before (%v)", tk, before[tk.Lot.ID])
		}
		sum += tk.Taken
	}
	if sum != 500 {
		t.Errorf("taken in all = %v, want 500", sum)
	}
	out, err := f.svc.GiveBack(ctx, d.Takes)
	if err != nil {
		t.Fatal(err)
	}
	if got := total(t, f, f.milk); got != 700 || len(out.Gone) != 0 {
		t.Errorf("after GiveBack of the takes: Stock %v (want 700), gone %v", got, out.Gone)
	}
}

func TestDeductForCookedTxTakesNothingWhenThereIsNoStock(t *testing.T) {
	f := setup(t)
	tx, err := f.st.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()
	d, err := f.svc.DeductForCookedTx(ctx, tx, []stock.Need{{IngredientID: f.milk, Quantity: 100}})
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Takes) != 0 {
		t.Errorf("takes = %+v, want none", d.Takes)
	}
}

func TestDeductForCookedPickedTxReportsThePicksAndTheRest(t *testing.T) {
	f := setup(t)
	older := f.add(t, f.milk, 300, "2026-11-01")
	newer := f.add(t, f.milk, 400, "2026-11-08")
	d, err := f.runPicked(t, []service.CookedMeal{{
		Needs:    []stock.Need{{IngredientID: f.milk, Quantity: 500}},
		UsedFrom: []service.IngredientPicks{{IngredientID: f.milk, Picks: []stock.Pick{{LotID: newer.ID, Quantity: 350}}}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	taken := map[int64]float64{}
	for _, tk := range d.Takes {
		taken[tk.Lot.ID] += tk.Taken
	}
	if taken[newer.ID] != 350 || taken[older.ID] != 150 {
		t.Errorf("taken = %v, want 350 from the picked Lot and the rest (150) from the other", taken)
	}
	if _, err := f.svc.GiveBack(ctx, d.Takes); err != nil {
		t.Fatal(err)
	}
	if got := total(t, f, f.milk); got != 700 {
		t.Errorf("Stock after GiveBack = %v, want 700", got)
	}
}
