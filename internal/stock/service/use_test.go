package service_test

import (
	"database/sql"
	"errors"
	"math"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/service"
	"github.com/fabbarix/feeder-ng/internal/stock/stocktest"
)

// H9 (docs/dev/design/household-items.md section 4.11): quick Use of a Supply, and its Undo. Pinned API of the service:
//
//	type UsedLot struct { LotID int64; Quantity float64; Purchased stock.Date; StoragePlaceID, ProductID, ShopID *int64 }
//	type SupplyUse struct { IngredientID int64; Name, BaseUnit string; Quantity float64; Total float64; Taken []UsedLot }
//	func (s *Service) UseSupply(ctx, ingredientID int64, quantity float64) (SupplyUse, error)
//	func (s *Service) UndoSupplyUse(ctx, ingredientID int64, taken []UsedLot) (SupplyUse, error) // Quantity = what came back, Total = Stock now
//	errors (each satisfies errors.Is(err, service.ErrInvalid)): ErrNotSupply (food), ErrUseInvalid (0 or less, NaN, Inf; an
//	empty or non-positive Undo), ErrUseExceedsStock (more than is in Stock). An unknown Ingredient is ErrUnknownIngredient.
// UseSupply takes from the Supply's Lots oldest purchased first (stock.Use), records no waste and no go-off, and publishes
// one `stock` event {changed: "lots", ingredientIds: [id]} after it commits. Nothing changes and nothing is published when
// it is refused.

type supplyFixture struct {
	fixture
	paper int64 // Toilet paper, a Supply counted in piece
}

func supplySetup(t *testing.T) supplyFixture {
	t.Helper()
	var paper int64
	f := setupWith(t, func(f fixture, ings service.Ingredients) service.Ingredients {
		paper = stocktest.SeedIngredient(t, f.db, "toilet paper", "piece", nil)
		m := ings.(fakeIngredients)
		m[paper] = service.IngredientInfo{ID: paper, Name: "toilet paper", BaseUnit: "piece", Supply: true}
		return m
	})
	return supplyFixture{fixture: f, paper: paper}
}

func (f supplyFixture) lotsOf(t *testing.T, ing int64) []service.LotView {
	t.Helper()
	lots, err := f.svc.Lots(ctx, ing)
	if err != nil {
		t.Fatal(err)
	}
	return lots
}

func TestUseSupplyTakesFromTheOldestPurchasedLotAndSaysWhatItTook(t *testing.T) {
	f := supplySetup(t)
	newer := f.add(t, f.paper, 9, "2026-11-05")
	older := f.add(t, f.paper, 4, "2026-11-01")
	out, err := f.svc.UseSupply(ctx, f.paper, 1)
	if err != nil {
		t.Fatal(err)
	}
	if out.IngredientID != f.paper || out.Name != "toilet paper" || out.BaseUnit != "piece" || out.Quantity != 1 || out.Total != 12 {
		t.Fatalf("out = %+v", out)
	}
	if len(out.Taken) != 1 || out.Taken[0].LotID != older.ID || out.Taken[0].Quantity != 1 || out.Taken[0].Purchased != "2026-11-01" {
		t.Fatalf("taken = %+v, want 1 from the Lot bought on 2026-11-01", out.Taken)
	}
	if total(t, f.fixture, f.paper) != 12 {
		t.Fatalf("stored total = %v, want 12", total(t, f.fixture, f.paper))
	}
	_ = newer
}

func TestUseSupplySpansLotsAndRemovesTheEmptiedOne(t *testing.T) {
	f := supplySetup(t)
	newer := f.add(t, f.paper, 9, "2026-11-05")
	older := f.add(t, f.paper, 4, "2026-11-01")
	out, err := f.svc.UseSupply(ctx, f.paper, 6)
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Taken) != 2 || out.Taken[0].LotID != older.ID || out.Taken[0].Quantity != 4 || out.Taken[1].LotID != newer.ID || out.Taken[1].Quantity != 2 {
		t.Fatalf("taken = %+v, want 4 from the older Lot then 2 from the newer", out.Taken)
	}
	lots := f.lotsOf(t, f.paper)
	if len(lots) != 1 || lots[0].ID != newer.ID || lots[0].Quantity != 7 || out.Total != 7 {
		t.Fatalf("lots = %+v, total %v, want only the newer Lot with 7", lots, out.Total)
	}
}

func TestUseSupplyCanTakeTheLastOfTheStock(t *testing.T) {
	f := supplySetup(t)
	f.add(t, f.paper, 2, "2026-11-01")
	out, err := f.svc.UseSupply(ctx, f.paper, 2)
	if err != nil || out.Total != 0 || len(f.lotsOf(t, f.paper)) != 0 {
		t.Fatalf("out = %+v, err = %v, lots = %+v, want none left", out, err, f.lotsOf(t, f.paper))
	}
}

func TestUseSupplyRecordsNoWasteAndNoGoOff(t *testing.T) {
	f := supplySetup(t)
	f.add(t, f.paper, 3, "2026-11-01")
	if _, err := f.svc.UseSupply(ctx, f.paper, 3); err != nil { // empties the Lot: still no waste
		t.Fatal(err)
	}
	waste, err := f.svc.Waste(ctx, "2000-01-01", "2100-01-01")
	if err != nil || len(waste) != 0 {
		t.Fatalf("waste = %+v, err = %v, want none", waste, err)
	}
	count := func(table string) int {
		var n int
		if err := f.db.QueryRow(`SELECT COUNT(*) FROM ` + table).Scan(&n); err != nil && !errors.Is(err, sql.ErrNoRows) {
			t.Fatal(err)
		}
		return n
	}
	if count("stock_go_offs") != 0 || count("stock_waste") != 0 {
		t.Fatalf("go-offs %d, waste rows %d, want none", count("stock_go_offs"), count("stock_waste"))
	}
}

func TestUseSupplyPublishesOneStockEvent(t *testing.T) {
	f := supplySetup(t)
	f.add(t, f.paper, 9, "2026-11-01")
	before := f.pub.count()
	if _, err := f.svc.UseSupply(ctx, f.paper, 1); err != nil {
		t.Fatal(err)
	}
	if f.pub.count() != before+1 || f.pub.events[before].Topic != "stock" {
		t.Fatalf("events = %+v, want one more stock event", f.pub.events)
	}
	data, _ := f.pub.events[before].Data.(map[string]any)
	ids, _ := data["ingredientIds"].([]int64)
	if data["changed"] != "lots" || len(ids) != 1 || ids[0] != f.paper {
		t.Fatalf("event data = %+v, want changed=lots, ingredientIds=[%d]", f.pub.events[before].Data, f.paper)
	}
}

func TestUseSupplyRefusesFood(t *testing.T) {
	f := supplySetup(t)
	f.add(t, f.milk, 1000, "2026-11-08")
	before := f.pub.count()
	_, err := f.svc.UseSupply(ctx, f.milk, 100)
	if !errors.Is(err, service.ErrNotSupply) || !errors.Is(err, service.ErrInvalid) {
		t.Fatalf("err = %v, want ErrNotSupply (an ErrInvalid)", err)
	}
	if total(t, f.fixture, f.milk) != 1000 || f.pub.count() != before {
		t.Fatalf("food Stock moved or an event was published")
	}
}

func TestUseSupplyRefusesNothingOrLess(t *testing.T) {
	f := supplySetup(t)
	f.add(t, f.paper, 9, "2026-11-01")
	before := f.pub.count()
	for _, q := range []float64{0, -1, math.NaN(), math.Inf(1)} {
		_, err := f.svc.UseSupply(ctx, f.paper, q)
		if !errors.Is(err, service.ErrUseInvalid) || !errors.Is(err, service.ErrInvalid) {
			t.Errorf("UseSupply(%v) err = %v, want ErrUseInvalid (an ErrInvalid)", q, err)
		}
	}
	if total(t, f.fixture, f.paper) != 9 || f.pub.count() != before {
		t.Fatalf("Stock moved or an event was published")
	}
}

func TestUseSupplyRefusesMoreThanIsInStockAndTakesNothing(t *testing.T) {
	f := supplySetup(t)
	f.add(t, f.paper, 4, "2026-11-01")
	f.add(t, f.paper, 5, "2026-11-05")
	before := f.pub.count()
	_, err := f.svc.UseSupply(ctx, f.paper, 9.5)
	if !errors.Is(err, service.ErrUseExceedsStock) || !errors.Is(err, service.ErrInvalid) {
		t.Fatalf("err = %v, want ErrUseExceedsStock (an ErrInvalid)", err)
	}
	if total(t, f.fixture, f.paper) != 9 || len(f.lotsOf(t, f.paper)) != 2 || f.pub.count() != before {
		t.Fatalf("Stock moved or an event was published")
	}
}

func TestUseSupplyWithNoStockAtAllIsMoreThanIsInStock(t *testing.T) {
	f := supplySetup(t)
	if _, err := f.svc.UseSupply(ctx, f.paper, 1); !errors.Is(err, service.ErrUseExceedsStock) {
		t.Fatalf("err = %v, want ErrUseExceedsStock", err)
	}
}

func TestUseSupplyOfAnUnknownIngredient(t *testing.T) {
	f := supplySetup(t)
	if _, err := f.svc.UseSupply(ctx, 9999, 1); !errors.Is(err, service.ErrUnknownIngredient) {
		t.Fatalf("err = %v, want ErrUnknownIngredient", err)
	}
}

// Undo restores exactly what was taken.

func TestUndoPutsBackWhatWasTakenFromAPartlyUsedLot(t *testing.T) {
	f := supplySetup(t)
	lot := f.add(t, f.paper, 9, "2026-11-01")
	used, err := f.svc.UseSupply(ctx, f.paper, 1)
	if err != nil {
		t.Fatal(err)
	}
	before := f.pub.count()
	back, err := f.svc.UndoSupplyUse(ctx, f.paper, used.Taken)
	if err != nil {
		t.Fatal(err)
	}
	lots := f.lotsOf(t, f.paper)
	if len(lots) != 1 || lots[0].ID != lot.ID || lots[0].Quantity != 9 || back.Total != 9 || back.Quantity != 1 {
		t.Fatalf("lots = %+v, back = %+v, want the same Lot with 9 again", lots, back)
	}
	if f.pub.count() != before+1 || f.pub.events[before].Topic != "stock" {
		t.Fatalf("events = %+v, want a stock event for the Undo", f.pub.events)
	}
}

func TestUndoRecreatesAnEmptiedLotWithItsDateStoragePlaceProductAndShop(t *testing.T) {
	f := supplySetup(t)
	place := f.place(t, "Utility cupboard", stock.KindPantry)
	product, shop := int64(5), int64(6)
	first, _, err := f.svc.AddLot(ctx, service.AddInput{IngredientID: f.paper, Quantity: 4, Purchased: "2026-11-01", StoragePlaceID: &place, ProductID: &product, ShopID: &shop})
	if err != nil {
		t.Fatal(err)
	}
	f.add(t, f.paper, 9, "2026-11-05")
	used, err := f.svc.UseSupply(ctx, f.paper, 6) // empties the first Lot, 2 from the second
	if err != nil {
		t.Fatal(err)
	}
	if used.Taken[0].LotID != first.ID || used.Taken[0].StoragePlaceID == nil || *used.Taken[0].StoragePlaceID != place ||
		used.Taken[0].ProductID == nil || *used.Taken[0].ProductID != product || used.Taken[0].ShopID == nil || *used.Taken[0].ShopID != shop {
		t.Fatalf("taken[0] = %+v, want the Lot's place, Product and Shop", used.Taken[0])
	}
	back, err := f.svc.UndoSupplyUse(ctx, f.paper, used.Taken)
	if err != nil {
		t.Fatal(err)
	}
	lots := f.lotsOf(t, f.paper)
	if len(lots) != 2 || back.Total != 13 || back.Quantity != 6 {
		t.Fatalf("lots = %+v, back = %+v, want 2 Lots holding 13", lots, back)
	}
	var recreated *service.LotView
	for i := range lots {
		if lots[i].Purchased == "2026-11-01" {
			recreated = &lots[i]
		}
	}
	if recreated == nil || recreated.Quantity != 4 || recreated.StoragePlaceID == nil || *recreated.StoragePlaceID != place ||
		recreated.ProductID == nil || *recreated.ProductID != product || recreated.ShopID == nil || *recreated.ShopID != shop || !recreated.GoesOff.IsNone() {
		t.Fatalf("recreated Lot = %+v, want 4 bought on 2026-11-01 in the same place, Product and Shop, with no go-off date", recreated)
	}
}

func TestUndoRefusesFoodAnEmptyListAndNonPositiveQuantities(t *testing.T) {
	f := supplySetup(t)
	f.add(t, f.paper, 9, "2026-11-01")
	ok := []service.UsedLot{{LotID: 1, Quantity: 1, Purchased: "2026-11-01"}}
	if _, err := f.svc.UndoSupplyUse(ctx, f.milk, ok); !errors.Is(err, service.ErrNotSupply) {
		t.Errorf("food: err = %v, want ErrNotSupply", err)
	}
	if _, err := f.svc.UndoSupplyUse(ctx, f.paper, nil); !errors.Is(err, service.ErrUseInvalid) {
		t.Errorf("empty: err = %v, want ErrUseInvalid", err)
	}
	for _, q := range []float64{0, -1, math.NaN()} {
		if _, err := f.svc.UndoSupplyUse(ctx, f.paper, []service.UsedLot{{LotID: 1, Quantity: q, Purchased: "2026-11-01"}}); !errors.Is(err, service.ErrUseInvalid) {
			t.Errorf("quantity %v: err = %v, want ErrUseInvalid", q, err)
		}
	}
	if _, err := f.svc.UndoSupplyUse(ctx, f.paper, []service.UsedLot{{LotID: 1, Quantity: 1}}); !errors.Is(err, service.ErrUseInvalid) {
		t.Errorf("no purchase date: err = %v, want ErrUseInvalid", err)
	}
	if total(t, f.fixture, f.paper) != 9 {
		t.Fatalf("a refused Undo changed Stock to %v", total(t, f.fixture, f.paper))
	}
}

// Review (H9): a Use never takes from the same Lot twice, so an Undo that lists a Lot twice is refused and changes nothing.
func TestUndoRefusesALotListedTwice(t *testing.T) {
	f := supplySetup(t)
	lot := f.add(t, f.paper, 9, "2026-11-01")
	twice := []service.UsedLot{{LotID: lot.ID, Quantity: 1, Purchased: "2026-11-01"}, {LotID: lot.ID, Quantity: 1, Purchased: "2026-11-01"}}
	if _, err := f.svc.UndoSupplyUse(ctx, f.paper, twice); !errors.Is(err, service.ErrUseInvalid) {
		t.Fatalf("err = %v, want ErrUseInvalid", err)
	}
	if total(t, f.fixture, f.paper) != 9 {
		t.Fatalf("a refused Undo changed Stock to %v", total(t, f.fixture, f.paper))
	}
}

// Review (H9): the Storage Place of an emptied Lot may be deleted before Undo. Deleting a place unsorts its Lots
// (ON DELETE SET NULL), so the recreated Lot is unsorted too, and the Undo still works.
func TestUndoRecreatesALotWhoseStoragePlaceWasDeletedAsUnsorted(t *testing.T) {
	f := supplySetup(t)
	place := f.place(t, "Utility cupboard", stock.KindPantry)
	if _, _, err := f.svc.AddLot(ctx, service.AddInput{IngredientID: f.paper, Quantity: 4, Purchased: "2026-11-01", StoragePlaceID: &place}); err != nil {
		t.Fatal(err)
	}
	used, err := f.svc.UseSupply(ctx, f.paper, 4)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.svc.DeleteStoragePlace(ctx, place); err != nil {
		t.Fatal(err)
	}
	back, err := f.svc.UndoSupplyUse(ctx, f.paper, used.Taken)
	if err != nil {
		t.Fatalf("Undo after the place was deleted: %v", err)
	}
	lots := f.lotsOf(t, f.paper)
	if back.Total != 4 || len(lots) != 1 || lots[0].StoragePlaceID != nil || lots[0].Purchased != "2026-11-01" {
		t.Fatalf("lots = %+v, back = %+v, want one unsorted Lot of 4 bought on 2026-11-01", lots, back)
	}
}
