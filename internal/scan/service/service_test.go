package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/service"
)

func apply(t *testing.T, e *env, op scan.Op) scan.Result {
	t.Helper()
	res, err := e.svc.Apply(context.Background(), op)
	if err != nil {
		t.Fatalf("Apply(%s): %v", op.ClientUUID, err)
	}
	return res
}

func TestAResolvedScanAddsALotRecordsTheProductAndAPurchaseAndReducesTheLine(t *testing.T) {
	e := newEnv(t)
	res := apply(t, e, packScan("scan-0001", mutti, 700))
	if res.Status != scan.StatusApplied || res.Scan == nil || res.Error != nil {
		t.Fatalf("Result = %+v", res)
	}
	s := res.Scan
	if s.IngredientID != passataIng || s.IngredientName != "Passata" || s.ProductID != mutti || s.ProductName != "Mutti passata 700 g" || s.Quantity != 700 || s.BaseUnit != "g" {
		t.Fatalf("Applied = %+v", s)
	}
	if !s.OnList || s.Remaining != 700 || s.Ticked || s.LotID == nil {
		t.Fatalf("list effect = onList %v remaining %v ticked %v lot %v; want on the list, 700 g left", s.OnList, s.Remaining, s.Ticked, s.LotID)
	}
	if e.stock.lotCount() != 1 {
		t.Fatalf("Stock Lots = %d, want 1", e.stock.lotCount())
	}
	lot := e.stock.lots[*s.LotID]
	if lot.IngredientID != passataIng || lot.Quantity != 700 || lot.ClientUUID != "scan-0001" || lot.ShopID == nil || *lot.ShopID != 1 || lot.ProductID == nil || *lot.ProductID != mutti || lot.Purchased != "2026-11-09" {
		t.Fatalf("StockAdd = %+v", lot)
	}
	if !e.cat.soldAt[[2]int64{mutti, 1}] || len(e.cat.purchases) != 1 || e.cat.purchased[0] != "2026-11-09" {
		t.Fatalf("sold at %v, purchases %v (%v)", e.cat.soldAt, e.cat.purchases, e.cat.purchased)
	}
	if len(e.list.after) != 1 || e.list.after[0].IngredientID != passataIng || e.list.after[0].To != "2026-11-15" || e.list.after[0].Quantity != 700 ||
		e.list.after[0].ShopID == nil || *e.list.after[0].ShopID != 1 || e.list.after[0].LotID != *s.LotID {
		t.Fatalf("AfterLot calls = %+v", e.list.after)
	}
	if e.bus.count("shopping") == 0 {
		t.Fatal("a scan must publish a shopping event")
	}
	if ev, ok, _ := e.ledger.Get(context.Background(), "scan-0001"); !ok || ev.Kind != "shop_scan" || ev.LotID == nil || !ev.OnList || !ev.SoldAtAdded || ev.PurchaseID == nil {
		t.Fatalf("ledger event = %+v, %v", ev, ok)
	}
}

func TestTheSecondPackCoveringTheLineTicksIt(t *testing.T) {
	e := newEnv(t)
	first := apply(t, e, packScan("scan-0001", mutti, 700))
	second := apply(t, e, packScan("scan-0002", mutti, 700))
	if first.Scan.Ticked || !second.Scan.Ticked || second.Scan.Remaining != 0 {
		t.Fatalf("ticked: first %v, second %v (remaining %v); want only the second pack to tick it", first.Scan.Ticked, second.Scan.Ticked, second.Scan.Remaining)
	}
}

func TestAnOffListScanStillAddsStockAndSaysSo(t *testing.T) {
	e := newEnv(t)
	res := apply(t, e, packScan("scan-0001", milkProd, 1000))
	if res.Status != scan.StatusApplied || res.Scan.OnList || res.Scan.Ticked || res.Scan.LotID == nil {
		t.Fatalf("Result = %+v / %+v; want a Lot added, off the list", res, res.Scan)
	}
	if e.stock.totals[milkIng] != 1000 {
		t.Fatalf("Stock = %v", e.stock.totals)
	}
}

func TestThePriceIsPrefilledFromTheLastPriceAtThisShop(t *testing.T) {
	e := newEnv(t)
	e.cat.seedPrice(mutti, 1, "2026-11-02", 159)
	res := apply(t, e, packScan("scan-0001", mutti, 700))
	if res.Scan.PriceCents == nil || *res.Scan.PriceCents != 159 {
		t.Fatalf("PriceCents = %v, want the last Price 159", res.Scan.PriceCents)
	}
	if p, _ := e.cat.PriceOn(context.Background(), mutti, 1, "2026-11-09"); p == nil || *p.PriceCents != 159 {
		t.Fatalf("today's Price = %+v, want 159 recorded", p)
	}
}

func TestWithoutAnyPriceNothingIsRecorded(t *testing.T) {
	e := newEnv(t)
	res := apply(t, e, packScan("scan-0001", mutti, 700))
	if res.Scan.PriceCents != nil || len(e.cat.recorded) != 0 {
		t.Fatalf("price %v, recorded %v; want none", res.Scan.PriceCents, e.cat.recorded)
	}
}

func TestAPriceFromThePhoneWinsAndReplacesTodaysPrice(t *testing.T) {
	e := newEnv(t)
	e.cat.seedPrice(mutti, 1, "2026-11-02", 159)
	op := packScan("scan-0001", mutti, 700)
	op.PriceCents = ip(179)
	res := apply(t, e, op)
	if *res.Scan.PriceCents != 179 {
		t.Fatalf("PriceCents = %v, want 179", *res.Scan.PriceCents)
	}
	if l := e.cat.latest(mutti, 1); *l.PriceCents != 179 || l.Date != "2026-11-09" {
		t.Fatalf("latest Price = %+v", l)
	}
}

func TestAWeighedScanRecordsThePricePerKg(t *testing.T) {
	e := newEnv(t)
	e.cat.addProduct(20, "Loose carrots", 4, "carrots", 1000)
	op := packScan("scan-0001", 20, 750)
	op.PriceCents, op.PricePerKgCents = ip(300), ip(400)
	apply(t, e, op)
	if len(e.cat.recorded) != 1 || *e.cat.recorded[0].PricePerKgCents != 400 || *e.cat.recorded[0].PriceCents != 300 {
		t.Fatalf("recorded Price = %+v, want 300 and 400 per kg", e.cat.recorded)
	}
}

func TestARepeatedClientUUIDChangesNothing(t *testing.T) {
	e := newEnv(t)
	first := apply(t, e, packScan("scan-0001", mutti, 700))
	again := apply(t, e, packScan("scan-0001", mutti, 700))
	if again.Status != scan.StatusDuplicate || again.Scan == nil || *again.Scan.LotID != *first.Scan.LotID || again.Scan.Remaining != 700 {
		t.Fatalf("second = %+v / %+v; want the stored result as a duplicate", again, again.Scan)
	}
	if e.stock.lotCount() != 1 || len(e.cat.purchases) != 1 || len(e.list.after) != 1 {
		t.Fatalf("lots %d, purchases %d, list calls %d; want 1 each", e.stock.lotCount(), len(e.cat.purchases), len(e.list.after))
	}
	published := e.bus.count("shopping")
	apply(t, e, packScan("scan-0001", mutti, 700))
	if e.bus.count("shopping") != published {
		t.Fatal("a duplicate must not publish")
	}
}

func TestAnOfflineScanIsDatedByWhenItWasMade(t *testing.T) {
	e := newEnv(t)
	op := packScan("scan-0001", mutti, 700)
	op.ScannedAt = "2026-11-07T17:30:00Z"
	apply(t, e, op)
	lot := e.stock.lots[e.stock.order[0]]
	if lot.Purchased != "2026-11-07" || e.cat.purchased[0] != "2026-11-07" {
		t.Fatalf("Lot purchased %s, purchase %s; want 2026-11-07 (the day of the scan, not of the sync)", lot.Purchased, e.cat.purchased[0])
	}
	future := packScan("scan-0002", mutti, 700)
	future.ScannedAt = "2026-11-12T10:00:00Z" // a phone clock running ahead
	apply(t, e, future)
	if lot := e.stock.lots[e.stock.order[1]]; lot.Purchased != "2026-11-09" {
		t.Fatalf("a timestamp in the future is capped at today, got %s", lot.Purchased)
	}
}

func TestRejectedOperationsHaveNoSideEffects(t *testing.T) {
	e := newEnv(t)
	cases := map[string]struct {
		op   scan.Op
		code string
	}{
		"invalid":         {scan.Op{ClientUUID: "x1", ScannedAt: "2026-11-09T12:00:00Z", Kind: scan.KindShopScan}, service.CodeValidation},
		"unknown product": {packScan("x2", 999, 700), service.CodeUnknownProduct},
		"unknown shop":    {func() scan.Op { o := packScan("x3", mutti, 700); o.ShopID = i64(42); return o }(), service.CodeUnknownShop},
	}
	for name, c := range cases {
		res, err := e.svc.Apply(context.Background(), c.op)
		if err != nil || res.Status != scan.StatusRejected || res.Error == nil || res.Error.Code != c.code || res.Scan != nil {
			t.Errorf("%s: Result = %+v, %v; want rejected with %s", name, res, err, c.code)
		}
	}
	if e.stock.lotCount() != 0 || len(e.cat.purchases) != 0 || len(e.cat.soldAt) != 0 || e.bus.count("shopping") != 0 {
		t.Fatal("a rejected operation must change nothing")
	}
}

func TestUndoReversesTheLotThePurchaseTheLinkThePriceAndTheTick(t *testing.T) {
	e := newEnv(t)
	apply(t, e, packScan("scan-0001", mutti, 700)) // 700 left
	op := packScan("scan-0002", mutti, 700)
	op.PriceCents = ip(159)
	res := apply(t, e, op) // covers the line, ticks it, records a Price
	if !res.Scan.Ticked {
		t.Fatalf("setup: %+v", res.Scan)
	}
	out, err := e.svc.Undo(context.Background(), "scan-0002")
	if err != nil || !out.Undone || out.AlreadyUndone {
		t.Fatalf("Undo = %+v, %v", out, err)
	}
	if e.stock.lotCount() != 1 || len(e.stock.removed) != 1 || e.stock.removed[0] != *res.Scan.LotID {
		t.Fatalf("Lots %d, removed %v; want only the second Lot removed", e.stock.lotCount(), e.stock.removed)
	}
	if len(e.cat.purchases) != 1 {
		t.Fatalf("purchases = %d, want the second one deleted", len(e.cat.purchases))
	}
	if !e.cat.soldAt[[2]int64{mutti, 1}] {
		t.Fatal("the Product was already sold here from the first scan; Undo must not unlink it")
	}
	if len(e.cat.prices) != 0 || len(e.cat.deleted) != 1 {
		t.Fatalf("Prices = %d (deleted %v); want the Price this scan wrote removed", len(e.cat.prices), e.cat.deleted)
	}
	if len(e.list.undo) != 1 || !e.list.undo[0].Unmark || e.list.undo[0].Quantity != 700 || e.list.undo[0].IngredientID != passataIng || e.list.undo[0].To != "2026-11-15" {
		t.Fatalf("UndoLot calls = %+v, want Unmark (this scan ticked the line)", e.list.undo)
	}
	if e.list.ticked[passataIng] || e.list.remaining[passataIng] != 700 {
		t.Fatalf("list after Undo: ticked %v remaining %v", e.list.ticked, e.list.remaining)
	}
	if total := e.stock.totals[passataIng]; total != 700 {
		t.Fatalf("Stock = %v, want 700", total)
	}
}

func TestUndoUnlinksAProductThatThisScanLinkedAndRestoresTheEarlierPrice(t *testing.T) {
	e := newEnv(t)
	e.cat.seedPrice(mutti, 1, "2026-11-09", 150) // an earlier price entry today
	op := packScan("scan-0001", mutti, 700)
	op.PriceCents = ip(159)
	apply(t, e, op)
	if _, err := e.svc.Undo(context.Background(), "scan-0001"); err != nil {
		t.Fatal(err)
	}
	if e.cat.soldAt[[2]int64{mutti, 1}] || len(e.cat.purchases) != 0 {
		t.Fatalf("sold at %v, purchases %v; want both reversed", e.cat.soldAt, e.cat.purchases)
	}
	if p, _ := e.cat.PriceOn(context.Background(), mutti, 1, "2026-11-09"); p == nil || *p.PriceCents != 150 {
		t.Fatalf("today's Price = %+v, want the earlier 150 restored", p)
	}
	if e.list.undo[0].Unmark {
		t.Fatal("the scan did not tick the line (700 of 1400), so Undo must not untick")
	}
}

func TestUndoIsIdempotentAndAnUndoneUUIDIsNotReapplied(t *testing.T) {
	e := newEnv(t)
	apply(t, e, packScan("scan-0001", mutti, 700))
	_, _ = e.svc.Undo(context.Background(), "scan-0001")
	again, err := e.svc.Undo(context.Background(), "scan-0001")
	if err != nil || again.Undone || !again.AlreadyUndone {
		t.Fatalf("second Undo = %+v, %v; want alreadyUndone", again, err)
	}
	if len(e.stock.removed) != 1 || len(e.list.undo) != 1 {
		t.Fatalf("removed %v, undo calls %d; want one", e.stock.removed, len(e.list.undo))
	}
	res := apply(t, e, packScan("scan-0001", mutti, 700)) // the queue replays an op the user undid
	if res.Status != scan.StatusDuplicate || e.stock.lotCount() != 0 {
		t.Fatalf("replay after Undo = %+v, lots %d; want a duplicate and no new Lot", res, e.stock.lotCount())
	}
}

func TestUndoOfAnUnknownScanOrAStockTakeFails(t *testing.T) {
	e := newEnv(t)
	if _, err := e.svc.Undo(context.Background(), "ghost"); !errors.Is(err, service.ErrNotFound) {
		t.Fatalf("unknown: err = %v", err)
	}
	apply(t, e, scan.Op{ClientUUID: "take-1", ScannedAt: "2026-11-09T12:00:00Z", Kind: scan.KindStockTake, ProductID: mutti, Action: scan.PlusPack})
	if _, err := e.svc.Undo(context.Background(), "take-1"); !errors.Is(err, service.ErrNotUndoable) {
		t.Fatalf("stock-take: err = %v, want ErrNotUndoable", err)
	}
}

func TestEditingThePriceUpdatesThePriceAndTheTotalSpent(t *testing.T) {
	e := newEnv(t)
	e.cat.seedPrice(mutti, 1, "2026-11-02", 159)
	apply(t, e, packScan("scan-0001", mutti, 700))
	res, err := e.svc.SetPrice(context.Background(), "scan-0001", 179)
	if err != nil || res.Scan == nil || res.Scan.PriceCents == nil || *res.Scan.PriceCents != 179 {
		t.Fatalf("SetPrice = %+v, %v", res, err)
	}
	if p := e.cat.latest(mutti, 1); *p.PriceCents != 179 {
		t.Fatalf("latest Price = %d", *p.PriceCents)
	}
	if spent, lots, _ := e.ledger.Totals(context.Background(), "2026-11-15"); spent != 179 || lots != 1 {
		t.Fatalf("Totals = %d, %d; want 179 spent, 1 Lot", spent, lots)
	}
	if _, err := e.svc.SetPrice(context.Background(), "ghost", 100); !errors.Is(err, service.ErrNotFound) {
		t.Fatalf("unknown: err = %v", err)
	}
}

func unknownPack(uuid string, scope scan.Scope) scan.Op {
	return scan.Op{ClientUUID: uuid, ScannedAt: "2026-11-09T12:00:00Z", Kind: scan.KindShopUnknown, ShopID: i64(1), RangeTo: "2026-11-15",
		Barcode: "08000500310427", Quantity: 700, PackSize: 700, Scope: scope,
		Ingredient: &scan.IngredientRef{Name: "passata", BaseUnit: "g"}, ProductName: "Passata 700 g"}
}

func TestAnUnknownBarcodeCreatesTheProductThenProceedsAsAResolvedScan(t *testing.T) {
	e := newEnv(t)
	res := apply(t, e, unknownPack("scan-0001", scan.ScopeGlobal))
	if res.Status != scan.StatusApplied || !res.Scan.ProductCreated || res.Scan.Merged != nil || res.Scan.ProductName != "Passata 700 g" {
		t.Fatalf("Result = %+v / %+v", res, res.Scan)
	}
	if len(e.ing.calls) != 1 || e.ing.calls[0] != "passata" {
		t.Fatalf("Ingredient lookups = %v, want find-or-create of passata", e.ing.calls)
	}
	c := e.cat.created[0]
	if c.Name != "Passata 700 g" || c.PackSize != 700 || len(c.Barcodes) != 1 || c.Barcodes[0] != "08000500310427" || len(c.ShopBarcodes) != 0 {
		t.Fatalf("NewProduct = %+v, want a global barcode", c)
	}
	if e.stock.lotCount() != 1 || !e.cat.soldAt[[2]int64{res.Scan.ProductID, 1}] || len(e.cat.purchases) != 1 {
		t.Fatalf("lots %d, sold at %v, purchases %d", e.stock.lotCount(), e.cat.soldAt, len(e.cat.purchases))
	}
}

func TestAShopOnlyBarcodeIsStoredAsAShopBarcode(t *testing.T) {
	e := newEnv(t)
	apply(t, e, unknownPack("scan-0001", scan.ScopeShop))
	c := e.cat.created[0]
	if len(c.Barcodes) != 0 || len(c.ShopBarcodes) != 1 || c.ShopBarcodes[0].ShopID != 1 || c.ShopBarcodes[0].Code != "08000500310427" {
		t.Fatalf("NewProduct = %+v, want a Shop Barcode for Shop 1", c)
	}
}

func TestAnExistingIngredientIsNotLookedUpByName(t *testing.T) {
	e := newEnv(t)
	op := unknownPack("scan-0001", scan.ScopeGlobal)
	op.Ingredient = &scan.IngredientRef{ID: passataIng}
	apply(t, e, op)
	if len(e.ing.calls) != 0 || e.cat.created[0].IngredientID != passataIng {
		t.Fatalf("Ingredient lookups %v, created %+v", e.ing.calls, e.cat.created)
	}
}

func TestAWeighedCodeCreatesAProductWithAWeighedShopBarcode(t *testing.T) {
	e := newEnv(t)
	op := scan.Op{ClientUUID: "scan-0001", ScannedAt: "2026-11-09T12:00:00Z", Kind: scan.KindShopUnknown, ShopID: i64(1),
		RuleID: 3, ItemCode: "00005", Quantity: 750, Ingredient: &scan.IngredientRef{ID: 4}, ProductName: "Loose carrots", PricePerKgCents: ip(400), PriceCents: ip(300)}
	res := apply(t, e, op)
	c := e.cat.created[0]
	if len(c.ShopBarcodes) != 1 || c.ShopBarcodes[0].RuleID != 3 || c.ShopBarcodes[0].ItemCode != "00005" || c.ShopBarcodes[0].Code != "" {
		t.Fatalf("NewProduct = %+v, want a weighed Shop Barcode (rule 3, item 00005)", c)
	}
	if c.PackSize != 750 {
		t.Fatalf("PackSize = %v, want the decoded weight 750 g as the nominal size", c.PackSize)
	}
	if lot := e.stock.lots[*res.Scan.LotID]; lot.Quantity != 750 {
		t.Fatalf("Lot = %+v, want 750 g", lot)
	}
	if len(e.cat.recorded) != 1 || *e.cat.recorded[0].PricePerKgCents != 400 {
		t.Fatalf("Price = %+v, want 400/kg recorded", e.cat.recorded)
	}
}

func TestCreatingTheSameBarcodeTwiceMergesIntoTheFirst(t *testing.T) {
	e := newEnv(t)
	first := apply(t, e, unknownPack("scan-0001", scan.ScopeGlobal))
	second := apply(t, e, unknownPack("scan-0002", scan.ScopeGlobal)) // another phone filled the form offline
	if second.Status != scan.StatusApplied || second.Scan.Merged == nil || second.Scan.Merged.ProductID != first.Scan.ProductID || second.Scan.ProductCreated {
		t.Fatalf("second = %+v / %+v; want merged into product %d", second, second.Scan, first.Scan.ProductID)
	}
	if second.Scan.ProductID != first.Scan.ProductID || second.Scan.Merged.ProductName != "Passata 700 g" {
		t.Fatalf("merged = %+v", second.Scan.Merged)
	}
	if len(e.cat.created) != 1 || e.stock.lotCount() != 2 {
		t.Fatalf("Products created %d, Lots %d; want 1 Product and 2 Lots", len(e.cat.created), e.stock.lotCount())
	}
}

func TestSyncAppliesInOrderAndContinuesPastARejection(t *testing.T) {
	e := newEnv(t)
	bad := scan.Op{ClientUUID: "bad", ScannedAt: "2026-11-09T12:00:00Z", Kind: scan.KindShopScan}
	ops := []scan.Op{packScan("a", mutti, 700), bad, packScan("b", mutti, 700), packScan("a", mutti, 700)}
	results, err := e.svc.Sync(context.Background(), ops)
	if err != nil || len(results) != 4 {
		t.Fatalf("Sync = %d results, %v", len(results), err)
	}
	want := []scan.Status{scan.StatusApplied, scan.StatusRejected, scan.StatusApplied, scan.StatusDuplicate}
	for i, r := range results {
		if r.Status != want[i] || r.ClientUUID != ops[i].ClientUUID {
			t.Errorf("result %d = %s %s, want %s %s", i, r.ClientUUID, r.Status, ops[i].ClientUUID, want[i])
		}
	}
	// Order matters: only the second applied pack covers the line.
	if results[0].Scan.Ticked || !results[2].Scan.Ticked {
		t.Fatalf("ticked: a=%v b=%v; the pack applied second must be the one that ticks", results[0].Scan.Ticked, results[2].Scan.Ticked)
	}
	if len(e.stock.order) != 2 || e.stock.lots[e.stock.order[0]].ClientUUID != "a" || e.stock.lots[e.stock.order[1]].ClientUUID != "b" {
		t.Fatalf("Stock Lots were added in the wrong order: %v", e.stock.order)
	}
	a, _, _ := e.ledger.Get(context.Background(), "a")
	b, _, _ := e.ledger.Get(context.Background(), "b")
	if a.Seq >= b.Seq {
		t.Fatalf("ledger sequence a=%d b=%d", a.Seq, b.Seq)
	}
}

func TestReplayingAWholeBatchIsSafe(t *testing.T) {
	e := newEnv(t)
	ops := []scan.Op{unknownPack("u1", scan.ScopeGlobal), packScan("a", mutti, 700)}
	_, _ = e.svc.Sync(context.Background(), ops)
	results, err := e.svc.Sync(context.Background(), ops)
	if err != nil || results[0].Status != scan.StatusDuplicate || results[1].Status != scan.StatusDuplicate {
		t.Fatalf("replay = %+v, %v", results, err)
	}
	if e.stock.lotCount() != 2 || len(e.cat.created) != 1 {
		t.Fatalf("Lots %d, Products %d; want 2 and 1", e.stock.lotCount(), len(e.cat.created))
	}
}

func stockTake(uuid string, a scan.Action) scan.Op {
	return scan.Op{ClientUUID: uuid, ScannedAt: "2026-11-09T18:00:00Z", Kind: scan.KindStockTake, ProductID: mutti, Action: a}
}

func TestStockTakePlusPackAddsALotOfOnePackWithoutTouchingTheList(t *testing.T) {
	e := newEnv(t)
	res := apply(t, e, stockTake("take-1", scan.PlusPack))
	if res.Scan == nil || res.Scan.Quantity != 700 || res.Scan.Total == nil || *res.Scan.Total != 700 || res.Scan.LotID == nil {
		t.Fatalf("Result = %+v / %+v", res, res.Scan)
	}
	lot := e.stock.lots[*res.Scan.LotID]
	if lot.ShopID != nil || lot.ProductID == nil || *lot.ProductID != mutti || lot.Quantity != 700 {
		t.Fatalf("StockAdd = %+v, want the Product, no Shop", lot)
	}
	if len(e.list.after) != 0 || len(e.cat.purchases) != 0 || len(e.cat.soldAt) != 0 {
		t.Fatalf("Stock-take must not touch the list, purchases or sold-at: %d %d %d", len(e.list.after), len(e.cat.purchases), len(e.cat.soldAt))
	}
}

func TestStockTakeMinusPackNeverGoesBelowZero(t *testing.T) {
	e := newEnv(t)
	e.stock.totals[passataIng] = 1000
	res := apply(t, e, stockTake("take-1", scan.MinusPack))
	if *res.Scan.Total != 300 || e.stock.totals[passataIng] != 300 {
		t.Fatalf("total = %v, want 300", *res.Scan.Total)
	}
	res = apply(t, e, stockTake("take-2", scan.MinusPack))
	if *res.Scan.Total != 0 {
		t.Fatalf("total = %v, want 0 (floored)", *res.Scan.Total)
	}
}

func TestStockTakeSetTotalIsIdempotent(t *testing.T) {
	e := newEnv(t)
	op := stockTake("take-1", scan.SetTotal)
	op.Total = fp(1400)
	res := apply(t, e, op)
	if *res.Scan.Total != 1400 || e.stock.totals[passataIng] != 1400 {
		t.Fatalf("total = %v", *res.Scan.Total)
	}
	again := apply(t, e, op)
	if again.Status != scan.StatusDuplicate || len(e.stock.sets) != 1 {
		t.Fatalf("second = %s, SetTotal calls %d; want one", again.Status, len(e.stock.sets))
	}
}

func TestBundleComesFromTheCatalogue(t *testing.T) {
	e := newEnv(t)
	b, err := e.svc.Bundle(context.Background(), i64(1))
	if err != nil || b.ShopName != "Coop" || b.ShopID == nil || *b.ShopID != 1 {
		t.Fatalf("Bundle = %+v, %v", b, err)
	}
}
