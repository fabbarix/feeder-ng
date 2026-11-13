package service_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/service"
)

// Beta.5 UF-stock: Used from in the stock service (today is 2026-11-09; thighs: Shelf Life 4 days, milk and eggs as in
// the fixture). Default order: soonest go-off first, undated last.

// runPicked runs DeductForCookedPickedTx in a transaction; on success it commits and publishes, else it rolls back.
func (f fixture) runPicked(t *testing.T, meals []service.CookedMeal) (service.PickedDeduction, error) {
	t.Helper()
	tx, err := f.st.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	d, err := f.svc.DeductForCookedPickedTx(ctx, tx, meals)
	if err != nil {
		_ = tx.Rollback()
		return d, err
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	f.svc.PublishDeduction(d.Deduction)
	return d, nil
}

func lotQuantities(t *testing.T, f fixture, ing int64) map[int64]float64 {
	t.Helper()
	lots, err := f.svc.Lots(ctx, ing)
	if err != nil {
		t.Fatal(err)
	}
	out := map[int64]float64{}
	for _, l := range lots {
		out[l.ID] = l.Quantity
	}
	return out
}

func meal(need float64, ing int64, picks ...stock.Pick) service.CookedMeal {
	m := service.CookedMeal{Needs: []stock.Need{{IngredientID: ing, Quantity: need}}}
	if picks != nil {
		m.UsedFrom = []service.IngredientPicks{{IngredientID: ing, Picks: picks}}
	}
	return m
}

// thighs fixture: old goes off 11-11, new goes off 11-13.
func thighLots(t *testing.T, f fixture) (oldLot, newLot service.LotView) {
	t.Helper()
	oldLot = f.add(t, f.thighs, 500, "2026-11-07")
	newLot = f.add(t, f.thighs, 800, "2026-11-09")
	return
}

func TestPickedWithoutPicksIsTheDefaultOrder(t *testing.T) {
	f := setup(t)
	oldLot, newLot := thighLots(t, f)
	d, err := f.runPicked(t, []service.CookedMeal{meal(600, f.thighs)})
	if err != nil {
		t.Fatal(err)
	}
	if got := lotQuantities(t, f, f.thighs); !reflect.DeepEqual(got, map[int64]float64{newLot.ID: 700}) {
		t.Fatalf("lots = %+v, want old lot used up (%d) and 100 g from the new one", got, oldLot.ID)
	}
	if len(d.Warnings) != 0 || !reflect.DeepEqual(d.ChangedIngredientIDs, []int64{f.thighs}) {
		t.Fatalf("deduction = %+v", d)
	}
	if len(d.PerMeal) != 1 || d.PerMeal[0] == nil || len(d.PerMeal[0]) != 0 {
		t.Fatalf("PerMeal = %#v, want one empty (non-nil) slice", d.PerMeal)
	}
}

func TestPickedTakesTheChosenLotFirst(t *testing.T) {
	f := setup(t)
	oldLot, newLot := thighLots(t, f)
	before := f.pub.count()
	if _, err := f.runPicked(t, []service.CookedMeal{meal(600, f.thighs, stock.Pick{LotID: newLot.ID, Quantity: 600})}); err != nil {
		t.Fatal(err)
	}
	if got := lotQuantities(t, f, f.thighs); !reflect.DeepEqual(got, map[int64]float64{oldLot.ID: 500, newLot.ID: 200}) {
		t.Fatalf("lots = %+v, want the new lot used and the old one untouched", got)
	}
	if f.pub.count() != before+1 || f.pub.events[before].Topic != "stock" {
		t.Fatalf("events = %+v, want one stock event", f.pub.events)
	}
}

func TestPickedPartThenDefaultRest(t *testing.T) {
	f := setup(t)
	oldLot, newLot := thighLots(t, f)
	if _, err := f.runPicked(t, []service.CookedMeal{meal(600, f.thighs, stock.Pick{LotID: newLot.ID, Quantity: 250})}); err != nil {
		t.Fatal(err)
	}
	// 250 from the new lot, the other 350 from the soonest (old) lot.
	if got := lotQuantities(t, f, f.thighs); !reflect.DeepEqual(got, map[int64]float64{oldLot.ID: 150, newLot.ID: 550}) {
		t.Fatalf("lots = %+v", got)
	}
}

func TestPickedAboveTheNeedIsTakenAsPicked(t *testing.T) {
	f := setup(t)
	oldLot, newLot := thighLots(t, f)
	if _, err := f.runPicked(t, []service.CookedMeal{meal(100, f.thighs, stock.Pick{LotID: newLot.ID, Quantity: 700})}); err != nil {
		t.Fatal(err)
	}
	if got := lotQuantities(t, f, f.thighs); !reflect.DeepEqual(got, map[int64]float64{oldLot.ID: 500, newLot.ID: 100}) {
		t.Fatalf("lots = %+v", got)
	}
}

func TestPickedStillNeverBlocksOnShortStock(t *testing.T) {
	f := setup(t)
	_, newLot := thighLots(t, f) // 1300 g in all
	d, err := f.runPicked(t, []service.CookedMeal{meal(2000, f.thighs, stock.Pick{LotID: newLot.ID, Quantity: 800})})
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Warnings) != 1 || d.Warnings[0].IngredientID != f.thighs || d.Warnings[0].Shortfall != 700 || d.Warnings[0].Have != 1300 {
		t.Fatalf("warnings = %+v, want one Shortfall of 700 (had 1300)", d.Warnings)
	}
	if len(d.PerMeal) != 1 || len(d.PerMeal[0]) != 1 || d.PerMeal[0][0].Shortfall != 700 {
		t.Fatalf("PerMeal = %+v", d.PerMeal)
	}
	if got := lotQuantities(t, f, f.thighs); len(got) != 0 {
		t.Fatalf("lots = %+v, want Stock floored at 0", got)
	}
}

func TestPickedRefusesInvalidPicksAndWritesNothing(t *testing.T) {
	f := setup(t)
	oldLot, newLot := thighLots(t, f)
	milkLot := f.add(t, f.milk, 1000, "")
	cases := []struct {
		name string
		meal service.CookedMeal
	}{
		{"unknown lot", meal(100, f.thighs, stock.Pick{LotID: 9999, Quantity: 10})},
		{"lot of another Ingredient", meal(100, f.thighs, stock.Pick{LotID: milkLot.ID, Quantity: 10})},
		{"more than the lot holds", meal(100, f.thighs, stock.Pick{LotID: oldLot.ID, Quantity: 501})},
		{"zero quantity", meal(100, f.thighs, stock.Pick{LotID: oldLot.ID, Quantity: 0})},
		{"Ingredient not in the meal's needs", service.CookedMeal{
			Needs:    []stock.Need{{IngredientID: f.thighs, Quantity: 100}},
			UsedFrom: []service.IngredientPicks{{IngredientID: f.milk, Picks: []stock.Pick{{LotID: milkLot.ID, Quantity: 10}}}},
		}},
		{"a good pick before a bad one", service.CookedMeal{
			Needs: []stock.Need{{IngredientID: f.thighs, Quantity: 100}, {IngredientID: f.milk, Quantity: 100}},
			UsedFrom: []service.IngredientPicks{
				{IngredientID: f.thighs, Picks: []stock.Pick{{LotID: newLot.ID, Quantity: 100}}},
				{IngredientID: f.milk, Picks: []stock.Pick{{LotID: oldLot.ID, Quantity: 10}}},
			},
		}},
	}
	for _, tc := range cases {
		before := f.pub.count()
		_, err := f.runPicked(t, []service.CookedMeal{tc.meal})
		if !errors.Is(err, service.ErrUsedFromInvalid) || !errors.Is(err, service.ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrUsedFromInvalid (an ErrInvalid)", tc.name, err)
		}
		if f.pub.count() != before {
			t.Errorf("%s: a refused call published an event", tc.name)
		}
		if got := lotQuantities(t, f, f.thighs); !reflect.DeepEqual(got, map[int64]float64{oldLot.ID: 500, newLot.ID: 800}) {
			t.Errorf("%s: thighs changed: %+v", tc.name, got)
		}
		if got := lotQuantities(t, f, f.milk); !reflect.DeepEqual(got, map[int64]float64{milkLot.ID: 1000}) {
			t.Errorf("%s: milk changed: %+v", tc.name, got)
		}
	}
}

func TestPickedRefusesAGoneLot(t *testing.T) {
	f := setup(t)
	oldLot, newLot := thighLots(t, f)
	if err := f.svc.DeleteLot(ctx, oldLot.ID); err != nil { // the sheet was open while the Lot was deleted
		t.Fatal(err)
	}
	_, err := f.runPicked(t, []service.CookedMeal{meal(100, f.thighs, stock.Pick{LotID: oldLot.ID, Quantity: 100})})
	if !errors.Is(err, service.ErrUsedFromInvalid) {
		t.Fatalf("err = %v, want ErrUsedFromInvalid", err)
	}
	if got := lotQuantities(t, f, f.thighs); !reflect.DeepEqual(got, map[int64]float64{newLot.ID: 800}) {
		t.Fatalf("lots = %+v", got)
	}
}

func TestPickedAcrossMealsSumsPicksPerLot(t *testing.T) {
	f := setup(t)
	oldLot, newLot := thighLots(t, f)
	over := []service.CookedMeal{
		meal(300, f.thighs, stock.Pick{LotID: oldLot.ID, Quantity: 300}),
		meal(300, f.thighs, stock.Pick{LotID: oldLot.ID, Quantity: 300}), // 600 > the 500 g the Lot holds
	}
	if _, err := f.runPicked(t, over); !errors.Is(err, service.ErrUsedFromInvalid) {
		t.Fatalf("err = %v, want ErrUsedFromInvalid", err)
	}
	if got := lotQuantities(t, f, f.thighs); !reflect.DeepEqual(got, map[int64]float64{oldLot.ID: 500, newLot.ID: 800}) {
		t.Fatalf("lots = %+v, want nothing written", got)
	}
}

func TestPickedAcrossMealsDoesNotDependOnCourseOrder(t *testing.T) {
	// Meal 1 (no picks) would by default eat the whole old lot; meal 2 picked 400 g of that lot. All picks are taken first,
	// so meal 2's pick holds and meal 1's default need comes from what is left (100 g old, then the new lot).
	for _, order := range []string{"default meal first", "picked meal first"} {
		f := setup(t)
		oldLot, newLot := thighLots(t, f)
		defaults := meal(500, f.thighs)
		picked := meal(400, f.thighs, stock.Pick{LotID: oldLot.ID, Quantity: 400})
		meals := []service.CookedMeal{defaults, picked}
		if order == "picked meal first" {
			meals = []service.CookedMeal{picked, defaults}
		}
		if _, err := f.runPicked(t, meals); err != nil {
			t.Fatalf("%s: %v", order, err)
		}
		// old: 500-400 picked-100 default = 0; new: 800 - 400 default = 400.
		if got := lotQuantities(t, f, f.thighs); !reflect.DeepEqual(got, map[int64]float64{newLot.ID: 400}) {
			t.Errorf("%s: lots = %+v, want only 400 g of the new lot left", order, got)
		}
	}
}

func TestPickedPerMealWarnings(t *testing.T) {
	f := setup(t)
	f.add(t, f.milk, 300, "")
	d, err := f.runPicked(t, []service.CookedMeal{meal(200, f.milk), meal(200, f.milk)})
	if err != nil {
		t.Fatal(err)
	}
	if len(d.PerMeal) != 2 || len(d.PerMeal[0]) != 0 || len(d.PerMeal[1]) != 1 || d.PerMeal[1][0].Shortfall != 100 {
		t.Fatalf("PerMeal = %+v, want meal 1 covered and meal 2 short by 100", d.PerMeal)
	}
	if len(d.Warnings) != 1 {
		t.Fatalf("Warnings = %+v, want the same single warning flattened", d.Warnings)
	}
}

func TestPickedSkipsUnknownIngredientsAndNonPositiveNeeds(t *testing.T) {
	f := setup(t)
	f.add(t, f.milk, 300, "")
	m := service.CookedMeal{Needs: []stock.Need{{IngredientID: 9999, Quantity: 5}, {IngredientID: f.milk, Quantity: 0}, {IngredientID: f.milk, Quantity: -1}}}
	d, err := f.runPicked(t, []service.CookedMeal{m})
	if err != nil {
		t.Fatal(err)
	}
	if len(d.ChangedIngredientIDs) != 0 || len(d.Warnings) != 0 || total(t, f, f.milk) != 300 {
		t.Fatalf("deduction = %+v", d)
	}
}

func TestPickedRollsBackWithTheCallersTransaction(t *testing.T) {
	f := setup(t)
	oldLot, newLot := thighLots(t, f)
	tx, err := f.st.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.DeductForCookedPickedTx(ctx, tx, []service.CookedMeal{meal(100, f.thighs, stock.Pick{LotID: newLot.ID, Quantity: 100})}); err != nil {
		t.Fatal(err)
	}
	_ = tx.Rollback()
	if got := lotQuantities(t, f, f.thighs); !reflect.DeepEqual(got, map[int64]float64{oldLot.ID: 500, newLot.ID: 800}) {
		t.Fatalf("lots = %+v, want the rollback to undo the deduction", got)
	}
}

// ---- the cook preview ----

func TestPreviewCookedListsLotsInDeductionOrderWithDefaultSelection(t *testing.T) {
	f := setup(t)
	garage := f.place(t, "Garage Fridge", stock.KindFridge)
	oldLot := f.add(t, f.thighs, 500, "2026-11-07")           // goes off 11-11, not sorted
	newLot := f.addIn(t, f.thighs, 800, "2026-11-09", garage) // goes off 11-13 (add the sorted one last: AddLot remembers the place)
	f.add(t, f.milk, 1000, "")
	got, err := f.svc.PreviewCooked(ctx, []stock.Need{{IngredientID: f.thighs, Quantity: 600}, {IngredientID: f.milk, Quantity: 200}})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("preview = %+v, want one entry per need", got)
	}
	p := got[0]
	if p.IngredientID != f.thighs || p.Name != "chicken thighs" || p.BaseUnit != "g" || p.Need != 600 || p.Have != 1300 || p.Shortfall != 0 {
		t.Fatalf("thighs = %+v", p)
	}
	if len(p.Lots) != 2 || p.Lots[0].ID != oldLot.ID || p.Lots[1].ID != newLot.ID {
		t.Fatalf("Lots = %+v, want soonest to go off first", p.Lots)
	}
	if p.Lots[0].StoragePlaceName != "" || p.Lots[1].StoragePlaceName != "Garage Fridge" {
		t.Fatalf("places = %q, %q", p.Lots[0].StoragePlaceName, p.Lots[1].StoragePlaceName)
	}
	if p.Lots[0].Quantity != 500 || p.Lots[0].GoesOff != "2026-11-11" || p.Lots[0].IngredientName != "chicken thighs" {
		t.Fatalf("lot view = %+v", p.Lots[0])
	}
	if want := []stock.Taken{{LotID: oldLot.ID, Quantity: 500}, {LotID: newLot.ID, Quantity: 100}}; !reflect.DeepEqual(p.Default, want) {
		t.Fatalf("Default = %+v, want %+v", p.Default, want)
	}
	if got[1].IngredientID != f.milk || got[1].Need != 200 || len(got[1].Lots) != 1 {
		t.Fatalf("milk = %+v", got[1])
	}
}

func TestPreviewCookedReportsShortfallAndChangesNothing(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 300, "2026-11-09")
	before := f.pub.count()
	got, err := f.svc.PreviewCooked(ctx, []stock.Need{{IngredientID: f.thighs, Quantity: 1000}, {IngredientID: f.eggs, Quantity: 4}})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Shortfall != 700 || got[0].Have != 300 {
		t.Fatalf("preview = %+v", got)
	}
	if got[1].IngredientID != f.eggs || got[1].Shortfall != 4 || len(got[1].Lots) != 0 || len(got[1].Default) != 0 {
		t.Fatalf("eggs (no Stock) = %+v, want an entry with no Lots and Shortfall 4", got[1])
	}
	if total(t, f, f.thighs) != 300 || f.pub.count() != before {
		t.Fatal("preview changed Stock or published")
	}
}

func TestPreviewCookedSkipsUnknownIngredientsAndNonPositiveNeeds(t *testing.T) {
	f := setup(t)
	f.add(t, f.milk, 300, "")
	got, err := f.svc.PreviewCooked(ctx, []stock.Need{{IngredientID: 9999, Quantity: 5}, {IngredientID: f.milk, Quantity: 0}, {IngredientID: f.milk, Quantity: 100}})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].IngredientID != f.milk || got[0].Need != 100 {
		t.Fatalf("preview = %+v", got)
	}
}
