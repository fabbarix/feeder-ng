package service_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/service"
	"github.com/fabbarix/feeder-ng/internal/stock/stocktest"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

var ctx = context.Background()

const today = stock.Date("2026-11-09")

type fakeIngredients map[int64]service.IngredientInfo

func (f fakeIngredients) Ingredient(_ context.Context, id int64) (service.IngredientInfo, error) {
	if i, ok := f[id]; ok {
		return i, nil
	}
	return service.IngredientInfo{}, service.ErrUnknownIngredient
}

type published struct {
	Topic string
	Data  any
}

type fakePub struct {
	mu     sync.Mutex
	events []published
}

func (p *fakePub) Publish(topic string, data any) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.events = append(p.events, published{topic, data})
}
func (p *fakePub) count() int { p.mu.Lock(); defer p.mu.Unlock(); return len(p.events) }

// failingIngredients fails the lookup of one Ingredient with a database-style
// error (not ErrUnknownIngredient), to stop a Cooked deduction partway.
type failingIngredients struct {
	service.Ingredients
	failID int64
}

var errLookup = errors.New("ingredient lookup failed")

func (f failingIngredients) Ingredient(ctx context.Context, id int64) (service.IngredientInfo, error) {
	if id == f.failID {
		return service.IngredientInfo{}, errLookup
	}
	return f.Ingredients.Ingredient(ctx, id)
}

type fixture struct {
	db     *sql.DB
	svc    *service.Service
	st     *store.Store
	pub    *fakePub
	thighs int64 // 4-day Shelf Life, g
	milk   int64 // no Shelf Life, ml
	eggs   int64 // 21-day Shelf Life, piece
}

func setup(t *testing.T) fixture {
	t.Helper()
	return setupWith(t, nil)
}

// setupWith builds the fixture; wrap, if set, wraps the Ingredient lookup (given the fixture's ids).
func setupWith(t *testing.T, wrap func(f fixture, ings service.Ingredients) service.Ingredients) fixture {
	t.Helper()
	d := stocktest.NewDB(t)
	st := store.New(d, clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)))
	four, twentyOne := 4, 21
	f := fixture{
		db: d, st: st, pub: &fakePub{},
		thighs: stocktest.SeedIngredient(t, d, "chicken thighs", "g", &four),
		milk:   stocktest.SeedIngredient(t, d, "milk", "ml", nil),
		eggs:   stocktest.SeedIngredient(t, d, "eggs", "piece", &twentyOne),
	}
	ings := fakeIngredients{
		f.thighs: {ID: f.thighs, Name: "chicken thighs", BaseUnit: "g", ShelfLifeDays: &four},
		f.milk:   {ID: f.milk, Name: "milk", BaseUnit: "ml"},
		f.eggs:   {ID: f.eggs, Name: "eggs", BaseUnit: "piece", ShelfLifeDays: &twentyOne},
	}
	var lookup service.Ingredients = ings
	if wrap != nil {
		lookup = wrap(f, ings)
	}
	f.svc = service.New(st, lookup, func(context.Context) (stock.Date, error) { return today, nil }, f.pub)
	return f
}

func (f fixture) add(t *testing.T, ing int64, qty float64, purchased stock.Date) service.LotView {
	t.Helper()
	v, created, err := f.svc.AddLot(ctx, service.AddInput{IngredientID: ing, Quantity: qty, Purchased: purchased})
	if err != nil || !created {
		t.Fatalf("AddLot: created=%v err=%v", created, err)
	}
	return v
}

func total(t *testing.T, f fixture, ing int64) float64 {
	t.Helper()
	lots, err := f.svc.Lots(ctx, ing)
	if err != nil {
		t.Fatal(err)
	}
	var sum float64
	for _, l := range lots {
		sum += l.Quantity
	}
	return sum
}

func TestAddLotComputesGoOffFromShelfLife(t *testing.T) {
	f := setup(t)
	v := f.add(t, f.thighs, 800, "2026-11-07")
	if v.GoesOff != "2026-11-11" || v.Source != store.SourceManual || v.Purchased != "2026-11-07" ||
		v.IngredientName != "chicken thighs" || v.BaseUnit != "g" || v.Spoiled || !v.UseSoon {
		t.Fatalf("view = %+v", v)
	}
	m := f.add(t, f.milk, 1000, "")
	if !m.GoesOff.IsNone() || m.Purchased != today || m.UseSoon || m.Spoiled {
		t.Fatalf("milk = %+v", m)
	}
}

func TestAddLotFlagsSpoiledWhenPastGoOff(t *testing.T) {
	f := setup(t)
	v := f.add(t, f.thighs, 100, "2026-11-01") // goes off 11-05
	if !v.Spoiled || v.UseSoon {
		t.Fatalf("view = %+v", v)
	}
}

func TestAddLotValidation(t *testing.T) {
	f := setup(t)
	tests := []struct {
		name string
		in   service.AddInput
		is   error
	}{
		{"zero quantity", service.AddInput{IngredientID: f.milk, Quantity: 0}, service.ErrInvalid},
		{"negative quantity", service.AddInput{IngredientID: f.milk, Quantity: -5}, service.ErrInvalid},
		{"future purchase date", service.AddInput{IngredientID: f.milk, Quantity: 5, Purchased: "2026-11-10"}, service.ErrInvalid},
		{"malformed date", service.AddInput{IngredientID: f.milk, Quantity: 5, Purchased: "yesterday"}, service.ErrInvalid},
		{"stock_take source not allowed", service.AddInput{IngredientID: f.milk, Quantity: 5, Source: store.SourceStockTake}, service.ErrInvalid},
		{"unknown ingredient", service.AddInput{IngredientID: 999, Quantity: 5}, service.ErrUnknownIngredient},
	}
	for _, tc := range tests {
		if _, _, err := f.svc.AddLot(ctx, tc.in); !errors.Is(err, tc.is) {
			t.Errorf("%s: err = %v, want %v", tc.name, err, tc.is)
		}
	}
	if f.pub.count() != 0 {
		t.Errorf("failed adds published %d events", f.pub.count())
	}
}

func TestAddLotScanIsIdempotentAndPublishesOnce(t *testing.T) {
	f := setup(t)
	in := service.AddInput{IngredientID: f.milk, Quantity: 1000, Source: store.SourceScan, ClientUUID: "c-1"}
	a, created, err := f.svc.AddLot(ctx, in)
	if err != nil || !created {
		t.Fatalf("first: %v %v", created, err)
	}
	b, created, err := f.svc.AddLot(ctx, in)
	if err != nil || created || b.ID != a.ID {
		t.Fatalf("second: id %d/%d created=%v err=%v", b.ID, a.ID, created, err)
	}
	if got := total(t, f, f.milk); got != 1000 {
		t.Fatalf("total = %v, want 1000", got)
	}
	if f.pub.count() != 1 {
		t.Fatalf("events = %d, want 1", f.pub.count())
	}
}

func TestMutationsPublishStockEvent(t *testing.T) {
	f := setup(t)
	f.add(t, f.milk, 1000, "")
	if f.pub.count() != 1 || f.pub.events[0].Topic != "stock" {
		t.Fatalf("events = %+v", f.pub.events)
	}
}

func TestSetTotalDecreaseTakesSoonestToSpoilFirst(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 500, "2026-11-08") // goes off 11-12
	f.add(t, f.thighs, 300, "2026-11-06") // goes off 11-10
	// 800 g -> 600 g removes 200 g from the soonest-to-spoil lot (300 g -> 100 g), leaving two lots.
	got, err := f.svc.SetTotal(ctx, f.thighs, 600)
	if err != nil {
		t.Fatal(err)
	}
	if got.Total != 600 || got.LotCount != 2 || got.NextGoesOff != "2026-11-10" {
		t.Fatalf("after = %+v", got)
	}
}

func TestSetTotalIncreaseAddsStockTakeLotDatedToday(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 300, "2026-11-08")
	got, err := f.svc.SetTotal(ctx, f.thighs, 1000)
	if err != nil || got.Total != 1000 || got.LotCount != 2 {
		t.Fatalf("after = %+v %v", got, err)
	}
	lots, _ := f.svc.Lots(ctx, f.thighs)
	var added service.LotView
	for _, l := range lots {
		if l.Quantity == 700 {
			added = l
		}
	}
	if added.Source != store.SourceStockTake || added.Purchased != today || added.GoesOff != "2026-11-13" {
		t.Fatalf("added = %+v", added)
	}
}

func TestSetTotalZeroEmptiesAndHidesFromTotals(t *testing.T) {
	f := setup(t)
	f.add(t, f.milk, 1000, "")
	got, err := f.svc.SetTotal(ctx, f.milk, 0)
	if err != nil || got.Total != 0 || got.LotCount != 0 {
		t.Fatalf("after = %+v %v", got, err)
	}
	tot, _ := f.svc.Totals(ctx)
	if len(tot) != 0 {
		t.Fatalf("totals = %+v", tot)
	}
}

func TestSetTotalRejectsNegativeAndUnknown(t *testing.T) {
	f := setup(t)
	if _, err := f.svc.SetTotal(ctx, f.milk, -1); !errors.Is(err, service.ErrInvalid) {
		t.Errorf("negative: %v", err)
	}
	if _, err := f.svc.SetTotal(ctx, 999, 5); !errors.Is(err, service.ErrUnknownIngredient) {
		t.Errorf("unknown: %v", err)
	}
}

func TestSetTotalUnchangedPublishesNothingNew(t *testing.T) {
	f := setup(t)
	f.add(t, f.milk, 1000, "")
	before := f.pub.count()
	if _, err := f.svc.SetTotal(ctx, f.milk, 1000); err != nil {
		t.Fatal(err)
	}
	if f.pub.count() != before {
		t.Fatalf("events %d -> %d", before, f.pub.count())
	}
}

func TestTotalsOrderAndFields(t *testing.T) {
	f := setup(t)
	f.add(t, f.milk, 1000, "")
	f.add(t, f.eggs, 6, "2026-11-09")     // goes off 11-30
	f.add(t, f.thighs, 800, "2026-11-08") // goes off 11-12: use soon
	f.add(t, f.thighs, 200, "2026-11-01") // goes off 11-05: spoiled
	got, err := f.svc.Totals(ctx)
	if err != nil || len(got) != 3 {
		t.Fatalf("totals = %+v %v", got, err)
	}
	th := got[0]
	if th.Name != "chicken thighs" || th.Total != 1000 || th.LotCount != 2 || th.NextGoesOff != "2026-11-05" ||
		!th.UseSoon || th.SpoiledCount != 1 || th.BaseUnit != "g" {
		t.Fatalf("thighs = %+v", th)
	}
	if got[1].Name != "eggs" || got[2].Name != "milk" || got[1].UseSoon || got[2].NextGoesOff != stock.None {
		t.Fatalf("rest = %+v %+v", got[1], got[2])
	}
}

func TestDeductForCookedWarnsOnShortfallAndFloorsAtZero(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 300, "2026-11-08")
	warns, err := f.svc.DeductForCooked(ctx, []stock.Need{{IngredientID: f.thighs, Quantity: 800}})
	if err != nil {
		t.Fatal(err)
	}
	if len(warns) != 1 {
		t.Fatalf("warnings = %+v", warns)
	}
	w := warns[0]
	if w.IngredientID != f.thighs || w.Name != "chicken thighs" || w.BaseUnit != "g" || w.Have != 300 || w.Need != 800 || w.Shortfall != 500 ||
		w.Message != "Stock shows only 300 g chicken thighs, the recipe uses 800 g" {
		t.Fatalf("warning = %+v", w)
	}
	if got := total(t, f, f.thighs); got != 0 {
		t.Fatalf("Stock = %v, want floored at 0", got)
	}
}

func TestDeductForCookedNoStockAtAll(t *testing.T) {
	f := setup(t)
	warns, err := f.svc.DeductForCooked(ctx, []stock.Need{{IngredientID: f.milk, Quantity: 250}})
	if err != nil || len(warns) != 1 || warns[0].Have != 0 || warns[0].Shortfall != 250 ||
		warns[0].Message != "Stock shows no milk, the recipe uses 250 ml" {
		t.Fatalf("warnings = %+v %v", warns, err)
	}
}

func TestDeductForCookedEnoughStockGivesNoWarning(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 500, "2026-11-08") // goes off 11-12
	f.add(t, f.thighs, 300, "2026-11-06") // goes off 11-10, used first
	warns, err := f.svc.DeductForCooked(ctx, []stock.Need{{IngredientID: f.thighs, Quantity: 600}})
	if err != nil || len(warns) != 0 {
		t.Fatalf("warnings = %+v %v", warns, err)
	}
	lots, _ := f.svc.Lots(ctx, f.thighs)
	if len(lots) != 1 || lots[0].Quantity != 200 || lots[0].GoesOff != "2026-11-12" {
		t.Fatalf("lots = %+v", lots)
	}
}

func TestDeductForCookedHandlesSeveralNeedsAndSkipsBadOnes(t *testing.T) {
	f := setup(t)
	f.add(t, f.milk, 1000, "")
	f.add(t, f.eggs, 2, "2026-11-09")
	warns, err := f.svc.DeductForCooked(ctx, []stock.Need{
		{IngredientID: f.milk, Quantity: 250},
		{IngredientID: f.eggs, Quantity: 6},
		{IngredientID: 999, Quantity: 10}, // unknown: skipped, never blocks
		{IngredientID: f.thighs, Quantity: 0},
		{IngredientID: f.thighs, Quantity: -5},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(warns) != 1 || warns[0].IngredientID != f.eggs || warns[0].Message != "Stock shows only 2 pieces eggs, the recipe uses 6 pieces" {
		t.Fatalf("warnings = %+v", warns)
	}
	if total(t, f, f.milk) != 750 || total(t, f, f.eggs) != 0 {
		t.Fatalf("milk=%v eggs=%v", total(t, f, f.milk), total(t, f, f.eggs))
	}
}

func TestDeductForCookedPublishesOnlyWhenStockChanged(t *testing.T) {
	f := setup(t)
	before := f.pub.count()
	if _, err := f.svc.DeductForCooked(ctx, []stock.Need{{IngredientID: f.milk, Quantity: 100}}); err != nil {
		t.Fatal(err)
	}
	if f.pub.count() != before {
		t.Fatal("nothing was in Stock, so nothing changed and no event is expected")
	}
	f.add(t, f.milk, 1000, "")
	before = f.pub.count()
	if _, err := f.svc.DeductForCooked(ctx, []stock.Need{{IngredientID: f.milk, Quantity: 100}}); err != nil {
		t.Fatal(err)
	}
	if f.pub.count() != before+1 {
		t.Fatalf("events %d -> %d, want one more", before, f.pub.count())
	}
}

func TestSpoiledListsLotsPastGoOffOnly(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 200, "2026-11-01") // off 11-05 spoiled
	f.add(t, f.thighs, 300, "2026-11-05") // off 11-09: today, fine
	f.add(t, f.milk, 1000, "2026-10-01")  // no go-off
	f.add(t, f.eggs, 6, "2026-10-01")     // off 10-22 spoiled
	got, err := f.svc.Spoiled(ctx)
	if err != nil || len(got) != 2 {
		t.Fatalf("spoiled = %+v %v", got, err)
	}
	if got[0].IngredientName != "eggs" || got[1].IngredientName != "chicken thighs" || !got[0].Spoiled {
		t.Fatalf("order/flags = %+v", got)
	}
}

func TestThrowOutRemovesLotAndRecordsWaste(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 200, "2026-11-01")
	rec, err := f.svc.ThrowOut(ctx, l.ID)
	if err != nil {
		t.Fatal(err)
	}
	if rec.ID == 0 || *rec.IngredientID != f.thighs || rec.Quantity != 200 || rec.WastedOn != today || rec.Reason != store.ReasonSpoiled || *rec.LotID != l.ID {
		t.Fatalf("record = %+v", rec)
	}
	if lots, _ := f.svc.Lots(ctx, f.thighs); len(lots) != 0 {
		t.Fatalf("lot still there: %+v", lots)
	}
	waste, _ := f.svc.Waste(ctx, "", "")
	if len(waste) != 1 {
		t.Fatalf("waste = %+v", waste)
	}
}

func TestThrowOutAndKeepRefuseLotsThatHaveNotGoneOff(t *testing.T) {
	f := setup(t)
	fresh := f.add(t, f.thighs, 200, "2026-11-08")
	today9 := f.add(t, f.thighs, 100, "2026-11-05") // goes off today: still fine
	for _, id := range []int64{fresh.ID, today9.ID} {
		if _, err := f.svc.ThrowOut(ctx, id); !errors.Is(err, service.ErrNotSpoiled) {
			t.Errorf("ThrowOut(%d) = %v", id, err)
		}
		if _, err := f.svc.Keep(ctx, id); !errors.Is(err, service.ErrNotSpoiled) {
			t.Errorf("Keep(%d) = %v", id, err)
		}
	}
	if _, err := f.svc.ThrowOut(ctx, 999); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown lot: %v", err)
	}
	if _, err := f.svc.Keep(ctx, 999); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown lot: %v", err)
	}
}

func TestKeepPushesGoOffOneDayFromExistingDate(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 200, "2026-11-01") // goes off 11-05, 4 days overdue
	kept, err := f.svc.Keep(ctx, l.ID)
	if err != nil {
		t.Fatal(err)
	}
	if kept.GoesOff != "2026-11-06" || !kept.Spoiled {
		t.Fatalf("kept = %+v (from the existing go-off date, not from today)", kept)
	}
	if sp, _ := f.svc.Spoiled(ctx); len(sp) != 1 {
		t.Fatalf("still overdue, so listed again: %+v", sp)
	}
	// A lot that went off yesterday becomes fine on the go-off date after Keep.
	y := f.add(t, f.thighs, 100, "2026-11-04") // off 11-08
	k, _ := f.svc.Keep(ctx, y.ID)
	if k.GoesOff != "2026-11-09" || k.Spoiled {
		t.Fatalf("kept = %+v", k)
	}
}

func TestProjectedGroupsLotsPerIngredient(t *testing.T) {
	f := setup(t)
	f.add(t, f.thighs, 500, "2026-11-08")
	f.add(t, f.thighs, 300, "2026-11-06")
	f.add(t, f.milk, 1000, "")
	p, err := f.svc.Projected(ctx)
	if err != nil || len(p) != 2 {
		t.Fatalf("projected = %+v %v", p, err)
	}
	if got := p[f.thighs]; len(got) != 2 || got[0].Quantity != 300 {
		t.Fatalf("thighs order = %+v", got)
	}
	if got := p.Available(f.thighs, "2026-11-11"); got != 500 {
		t.Fatalf("available on 11-11 = %v, want 500", got)
	}
}

func TestRecordWasteForExpiredLeftover(t *testing.T) {
	f := setup(t)
	rec, err := f.svc.RecordWaste(ctx, store.WasteRecord{Quantity: 2, WastedOn: today, Reason: store.ReasonLeftoverDiscarded})
	if err != nil || rec.ID == 0 || rec.IngredientID != nil {
		t.Fatalf("record = %+v %v", rec, err)
	}
	if _, err := f.svc.RecordWaste(ctx, store.WasteRecord{Quantity: -1, WastedOn: today, Reason: store.ReasonSpoiled}); !errors.Is(err, service.ErrInvalid) {
		t.Errorf("negative waste: %v", err)
	}
	if _, err := f.svc.RecordWaste(ctx, store.WasteRecord{Quantity: 1, WastedOn: today, Reason: "boredom"}); !errors.Is(err, service.ErrInvalid) {
		t.Errorf("bad reason: %v", err)
	}
}

// failMilkUpdates makes any UPDATE of a milk lot abort, a database failure that
// strikes after earlier Ingredients have already been written.
func failMilkUpdates(t *testing.T, f fixture) {
	t.Helper()
	_, err := f.db.Exec(fmt.Sprintf(`CREATE TRIGGER fail_milk BEFORE UPDATE ON stock_lots
		WHEN NEW.ingredient_id = %d BEGIN SELECT RAISE(ABORT, 'injected failure'); END`, f.milk))
	if err != nil {
		t.Fatal(err)
	}
}

func stocked(t *testing.T) fixture {
	t.Helper()
	f := setup(t)
	f.add(t, f.thighs, 600, "2026-11-08")
	f.add(t, f.milk, 1000, "")
	f.add(t, f.eggs, 6, "2026-11-09")
	return f
}

func assertUntouched(t *testing.T, f fixture) {
	t.Helper()
	if total(t, f, f.thighs) != 600 || total(t, f, f.milk) != 1000 || total(t, f, f.eggs) != 6 {
		t.Fatalf("Stock changed: thighs=%v milk=%v eggs=%v", total(t, f, f.thighs), total(t, f, f.milk), total(t, f, f.eggs))
	}
}

// DeductForCooked is all-or-nothing across Ingredients (one transaction).
func TestDeductForCookedIsAllOrNothingWhenALaterIngredientLookupFails(t *testing.T) {
	f := setupWith(t, func(f fixture, ings service.Ingredients) service.Ingredients {
		return failingIngredients{Ingredients: ings, failID: f.eggs}
	})
	f.add(t, f.thighs, 600, "2026-11-08")
	f.add(t, f.milk, 1000, "")
	f.add(t, f.eggs, 6, "2026-11-09")
	before := f.pub.count()
	_, err := f.svc.DeductForCooked(ctx, []stock.Need{
		{IngredientID: f.thighs, Quantity: 200},
		{IngredientID: f.milk, Quantity: 100},
		{IngredientID: f.eggs, Quantity: 2},
	})
	if !errors.Is(err, errLookup) {
		t.Fatalf("err = %v, want the lookup failure", err)
	}
	assertUntouched(t, f)
	if f.pub.count() != before {
		t.Fatal("a failed deduction must publish nothing")
	}
}

func TestDeductForCookedIsAllOrNothingWhenTheDatabaseFailsPartway(t *testing.T) {
	f := stocked(t)
	failMilkUpdates(t, f)
	before := f.pub.count()
	_, err := f.svc.DeductForCooked(ctx, []stock.Need{
		{IngredientID: f.thighs, Quantity: 200}, // written first
		{IngredientID: f.milk, Quantity: 100},   // aborts
	})
	if err == nil {
		t.Fatal("want the injected failure")
	}
	assertUntouched(t, f)
	if f.pub.count() != before {
		t.Fatal("a failed deduction must publish nothing")
	}
}

func TestDeductForCookedTxCommitsWithTheCaller(t *testing.T) {
	f := stocked(t)
	before := f.pub.count()
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	d, err := f.svc.DeductForCookedTx(ctx, tx, []stock.Need{
		{IngredientID: f.thighs, Quantity: 200},
		{IngredientID: f.milk, Quantity: 100},
		{IngredientID: f.eggs, Quantity: 10}, // 4 short
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Warnings) != 1 || d.Warnings[0].IngredientID != f.eggs || d.Warnings[0].Shortfall != 4 {
		t.Fatalf("warnings = %+v", d.Warnings)
	}
	if len(d.ChangedIngredientIDs) != 3 {
		t.Fatalf("changed = %v, want all three Ingredients", d.ChangedIngredientIDs)
	}
	if f.pub.count() != before {
		t.Fatal("the Tx variant must not publish; the caller does after commit")
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if total(t, f, f.thighs) != 400 || total(t, f, f.milk) != 900 || total(t, f, f.eggs) != 0 {
		t.Fatalf("after commit: thighs=%v milk=%v eggs=%v", total(t, f, f.thighs), total(t, f, f.milk), total(t, f, f.eggs))
	}
	f.svc.PublishDeduction(d)
	if f.pub.count() != before+1 {
		t.Fatalf("events %d -> %d, want exactly one `stock` event", before, f.pub.count())
	}
}

func TestDeductForCookedTxRollsBackWithTheCaller(t *testing.T) {
	f := stocked(t)
	before := f.pub.count()
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.DeductForCookedTx(ctx, tx, []stock.Need{
		{IngredientID: f.thighs, Quantity: 200},
		{IngredientID: f.milk, Quantity: 100},
	}); err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	assertUntouched(t, f)
	if f.pub.count() != before {
		t.Fatal("nothing may be published for a rolled-back deduction")
	}
}

func TestDeductForCookedTxFailureLeavesTheCallersTransactionToRollBack(t *testing.T) {
	f := stocked(t)
	failMilkUpdates(t, f)
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.svc.DeductForCookedTx(ctx, tx, []stock.Need{
		{IngredientID: f.thighs, Quantity: 200},
		{IngredientID: f.milk, Quantity: 100},
	})
	if err == nil {
		t.Fatal("want the injected failure")
	}
	if err := tx.Rollback(); err != nil {
		t.Fatalf("the service must not have ended the caller's transaction: %v", err)
	}
	assertUntouched(t, f)
}

func TestDeductForCookedTxOnAClosedTransactionFails(t *testing.T) {
	f := stocked(t)
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.DeductForCookedTx(ctx, tx, []stock.Need{{IngredientID: f.thighs, Quantity: 200}}); err == nil {
		t.Fatal("want an error from a closed transaction")
	}
	assertUntouched(t, f)
}

func TestPublishDeductionIsSilentWhenNothingChanged(t *testing.T) {
	f := setup(t)
	before := f.pub.count()
	f.svc.PublishDeduction(service.Deduction{})
	if f.pub.count() != before {
		t.Fatal("an empty Deduction must not publish")
	}
}

func TestTodayIsTheHouseholdDate(t *testing.T) {
	f := setup(t)
	got, err := f.svc.Today(ctx)
	if err != nil || got != today {
		t.Fatalf("Today = %v %v", got, err)
	}
}
