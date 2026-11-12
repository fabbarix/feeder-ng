package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/service"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

// Beta.5 ST: EditLot, DeleteLot and the Shelf Life that applies to a Lot (today is 2026-11-09; thighs: Shelf Life 4,
// frozen Shelf Life 60 in this fixture; milk: none).

func frozenFixture(t *testing.T) fixture {
	t.Helper()
	return setupWith(t, func(f fixture, _ service.Ingredients) service.Ingredients {
		four, sixty := 4, 60
		return fakeIngredients{
			f.thighs: {ID: f.thighs, Name: "chicken thighs", BaseUnit: "g", ShelfLifeDays: &four, FrozenShelfLifeDays: &sixty},
			f.milk:   {ID: f.milk, Name: "milk", BaseUnit: "ml"},
			f.eggs:   {ID: f.eggs, Name: "eggs", BaseUnit: "piece"},
		}
	})
}

func (f fixture) place(t *testing.T, name string, kind stock.Kind) int64 {
	t.Helper()
	p, err := f.svc.CreateStoragePlace(ctx, name, kind, false)
	if err != nil {
		t.Fatal(err)
	}
	return p.ID
}

func (f fixture) addIn(t *testing.T, ing int64, qty float64, purchased stock.Date, placeID int64) service.LotView {
	t.Helper()
	v, _, err := f.svc.AddLot(ctx, service.AddInput{IngredientID: ing, Quantity: qty, Purchased: purchased, StoragePlaceID: &placeID})
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func qty(f float64) *float64       { return &f }
func day(d stock.Date) *stock.Date { return &d }

func TestEditLotCorrectsQuantity(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 800, "2026-11-08")
	before := f.pub.count()
	v, err := f.svc.EditLot(ctx, l.ID, stock.Edit{Quantity: qty(650)})
	if err != nil {
		t.Fatal(err)
	}
	if v.ID != l.ID || v.Quantity != 650 || v.Purchased != "2026-11-08" || v.GoesOff != "2026-11-12" || v.IngredientName != "chicken thighs" {
		t.Fatalf("view = %+v", v)
	}
	if total(t, f, f.thighs) != 650 {
		t.Fatalf("stored total = %v", total(t, f, f.thighs))
	}
	if f.pub.count() != before+1 || f.pub.events[before].Topic != "stock" {
		t.Fatalf("events = %+v, want one more stock event", f.pub.events)
	}
	data, _ := f.pub.events[before].Data.(map[string]any)
	if data["changed"] != "lots" {
		t.Fatalf("event data = %+v, want changed=lots", f.pub.events[before].Data)
	}
}

func TestEditLotBoughtOnSuggestsGoodUntilFromTheShelfLife(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 800, "2026-11-05") // good until 11-09
	v, err := f.svc.EditLot(ctx, l.ID, stock.Edit{Purchased: day("2026-11-08")})
	if err != nil {
		t.Fatal(err)
	}
	if v.Purchased != "2026-11-08" || v.GoesOff != "2026-11-12" || v.Spoiled {
		t.Fatalf("view = %+v, want bought 11-08, good until 11-12", v)
	}
}

func TestEditLotBoughtOnInAFreezerUsesTheFrozenShelfLife(t *testing.T) {
	f := frozenFixture(t)
	freezer := f.place(t, "Garage Freezer", stock.KindFreezer)
	l := f.addIn(t, f.thighs, 800, "2026-11-09", freezer)
	if l.GoesOff != "2027-01-08" { // purchase + frozen Shelf Life 60
		t.Fatalf("setup: freezer lot good until %s", l.GoesOff)
	}
	v, err := f.svc.EditLot(ctx, l.ID, stock.Edit{Purchased: day("2026-11-01")})
	if err != nil {
		t.Fatal(err)
	}
	if v.GoesOff != "2026-12-31" {
		t.Fatalf("good until = %s, want 2026-12-31 (bought 11-01 + 60 days)", v.GoesOff)
	}
	if v.StoragePlaceID == nil || *v.StoragePlaceID != freezer {
		t.Fatalf("an edit does not move the Lot: %+v", v.StoragePlaceID)
	}
}

func TestEditLotGoodUntilGivenInTheSameEditWinsOverTheSuggestion(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 800, "2026-11-05")
	v, err := f.svc.EditLot(ctx, l.ID, stock.Edit{Purchased: day("2026-11-08"), GoesOff: day("2026-11-20")})
	if err != nil || v.GoesOff != "2026-11-20" {
		t.Fatalf("view = %+v err = %v", v, err)
	}
}

func TestEditLotCanClearGoodUntil(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 800, "2026-11-08")
	v, err := f.svc.EditLot(ctx, l.ID, stock.Edit{GoesOff: day(stock.None)})
	if err != nil || !v.GoesOff.IsNone() || v.Spoiled || v.UseSoon {
		t.Fatalf("view = %+v err = %v", v, err)
	}
}

func TestEditLotRefusesWhatValidateEditRefuses(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 800, "2026-11-08")
	before := f.pub.count()
	for name, e := range map[string]stock.Edit{
		"empty":             {},
		"zero quantity":     {Quantity: qty(0)},
		"bought tomorrow":   {Purchased: day("2026-11-10")},
		"bought not a date": {Purchased: day("yesterday")},
		"good until early":  {GoesOff: day("2026-11-01")},
	} {
		_, err := f.svc.EditLot(ctx, l.ID, e)
		if !errors.Is(err, service.ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
	if f.pub.count() != before {
		t.Errorf("a refused edit published an event")
	}
	if got, _ := f.svc.Lots(ctx, f.thighs); got[0].Quantity != 800 || got[0].Purchased != "2026-11-08" {
		t.Errorf("a refused edit changed the Lot: %+v", got[0])
	}
}

func TestEditLotUnknownLotIsNotFound(t *testing.T) {
	f := setup(t)
	if _, err := f.svc.EditLot(ctx, 4242, stock.Edit{Quantity: qty(5)}); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("err = %v, want store.ErrNotFound", err)
	}
}

// Moving the Good until of a Lot that went off to a later day removes that go-off: the Lot is not spoiled any more.
func TestEditLotGoodUntilLaterUnspoilsALotAndForgetsItsGoOff(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 800, "2026-11-01") // good until 11-05, gone off
	if _, err := f.db.Exec(`INSERT INTO stock_go_offs (lot_id, goes_off, recorded_on) VALUES (?, '2026-11-05', '2026-11-09')`, l.ID); err != nil {
		t.Fatal(err)
	}
	if sp, _ := f.svc.Spoiled(ctx); len(sp) != 1 {
		t.Fatalf("setup: spoiled = %+v", sp)
	}
	v, err := f.svc.EditLot(ctx, l.ID, stock.Edit{GoesOff: day("2026-11-15")})
	if err != nil || v.Spoiled {
		t.Fatalf("view = %+v err = %v", v, err)
	}
	if sp, _ := f.svc.Spoiled(ctx); len(sp) != 0 {
		t.Fatalf("spoiled = %+v, want none", sp)
	}
	if got := f.goOffs(t); len(got) != 0 {
		t.Fatalf("go-offs = %+v, want none", got)
	}
}

// Moving it earlier can make the Lot spoiled now (then Throw out and Keep apply).
func TestEditLotGoodUntilEarlierCanSpoilTheLot(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 800, "2026-11-08")
	v, err := f.svc.EditLot(ctx, l.ID, stock.Edit{GoesOff: day("2026-11-08")})
	if err != nil || !v.Spoiled {
		t.Fatalf("view = %+v err = %v", v, err)
	}
	if sp, _ := f.svc.Spoiled(ctx); len(sp) != 1 || sp[0].ID != l.ID {
		t.Fatalf("spoiled = %+v", sp)
	}
}

// An edit is a correction: no waste, no go-off record, no Keep.
func TestEditLotRecordsNoWasteNoGoOffAndNoKeep(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 800, "2026-11-01") // gone off
	if _, err := f.svc.EditLot(ctx, l.ID, stock.Edit{Quantity: qty(100), GoesOff: day("2026-11-02")}); err != nil {
		t.Fatal(err)
	}
	if w, _ := f.svc.Waste(ctx, "", ""); len(w) != 0 {
		t.Errorf("waste = %+v, want none", w)
	}
	if got := f.goOffs(t); len(got) != 0 {
		t.Errorf("go-offs = %+v, want none", got)
	}
	lot, _ := f.st.Lot(ctx, l.ID)
	if !lot.KeptOn.IsNone() {
		t.Errorf("KeptOn = %q, want none: an edit is not a Keep", lot.KeptOn)
	}
}

// A Keep forgave the old go-off date; a corrected date starts afresh.
func TestEditLotChangingGoodUntilClearsAnEarlierKeep(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 800, "2026-11-01")
	if _, err := f.svc.Keep(ctx, l.ID); err != nil {
		t.Fatal(err)
	}
	if lot, _ := f.st.Lot(ctx, l.ID); lot.KeptOn.IsNone() {
		t.Fatal("setup: Keep did not record KeptOn")
	}
	if _, err := f.svc.EditLot(ctx, l.ID, stock.Edit{GoesOff: day("2026-11-12")}); err != nil {
		t.Fatal(err)
	}
	if lot, _ := f.st.Lot(ctx, l.ID); !lot.KeptOn.IsNone() {
		t.Errorf("KeptOn = %q, want none", lot.KeptOn)
	}
}

func TestLotsCarryTheShelfLifeThatAppliesWhereTheyAre(t *testing.T) {
	f := frozenFixture(t)
	pantry := f.place(t, "Kitchen Pantry", stock.KindPantry)
	freezer := f.place(t, "Garage Freezer", stock.KindFreezer)
	f.addIn(t, f.thighs, 100, "2026-11-09", pantry)
	f.addIn(t, f.thighs, 200, "2026-11-09", freezer)
	f.add(t, f.milk, 1000, "")
	lots, err := f.svc.Lots(ctx, 0)
	if err != nil {
		t.Fatal(err)
	}
	got := map[float64]*int{}
	for _, l := range lots {
		got[l.Quantity] = l.ShelfLifeDays
	}
	want := func(q float64, days int, isNil bool) {
		t.Helper()
		p, ok := got[q]
		switch {
		case !ok:
			t.Errorf("no Lot of %v", q)
		case isNil && p != nil:
			t.Errorf("Lot of %v: ShelfLifeDays = %d, want nil", q, *p)
		case !isNil && (p == nil || *p != days):
			t.Errorf("Lot of %v: ShelfLifeDays = %v, want %d", q, p, days)
		}
	}
	want(100, 4, false)  // pantry: ordinary Shelf Life
	want(200, 60, false) // freezer: frozen Shelf Life
	want(1000, 0, true)  // no Shelf Life
}

func TestDeleteLotRemovesItWithoutWasteOrGoOff(t *testing.T) {
	f := setup(t)
	gone := f.add(t, f.thighs, 800, "2026-11-01") // gone off 11-06
	f.add(t, f.thighs, 200, "2026-11-08")
	before := f.pub.count()
	if err := f.svc.DeleteLot(ctx, gone.ID); err != nil {
		t.Fatal(err)
	}
	if got := total(t, f, f.thighs); got != 200 {
		t.Fatalf("total = %v, want 200", got)
	}
	if w, _ := f.svc.Waste(ctx, "", ""); len(w) != 0 {
		t.Errorf("waste = %+v, want none: Delete is not waste", w)
	}
	if got := f.goOffs(t); len(got) != 0 {
		t.Errorf("go-offs = %+v, want none: Delete is a correction like the Undo of a Scan", got)
	}
	if f.pub.count() != before+1 {
		t.Fatalf("events = %d, want one more", f.pub.count()-before)
	}
	data, _ := f.pub.events[before].Data.(map[string]any)
	if f.pub.events[before].Topic != "stock" || data["changed"] != "lots" {
		t.Errorf("event = %+v", f.pub.events[before])
	}
}

func TestDeleteLotForgetsAGoOffRecordOfThatLot(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 800, "2026-11-01")
	if _, err := f.db.Exec(`INSERT INTO stock_go_offs (lot_id, goes_off, recorded_on) VALUES (?, '2026-11-05', '2026-11-09')`, l.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.DeleteLot(ctx, l.ID); err != nil {
		t.Fatal(err)
	}
	if got := f.goOffs(t); len(got) != 0 {
		t.Fatalf("go-offs = %+v, want none", got)
	}
}

func TestDeleteLotUnknownIsNotFoundAndPublishesNothing(t *testing.T) {
	f := setup(t)
	before := f.pub.count()
	if err := f.svc.DeleteLot(context.Background(), 4242); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("err = %v, want store.ErrNotFound", err)
	}
	if f.pub.count() != before {
		t.Error("published for an unknown Lot")
	}
}
