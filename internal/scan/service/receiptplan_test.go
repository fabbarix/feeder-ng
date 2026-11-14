package service_test

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/receipt"
	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/service"
	shopservice "github.com/fabbarix/feeder-ng/internal/shopping/service"
)

// RR3 (docs/design/receipt-reading.md §8.2, §8.3). The contract these tests pin, in package service:
//
//	type ReceiptApplyResult struct{ Results []scan.Result }
//	func (s *Service) ApplyReceiptPlan(ctx context.Context, plan receipt.Plan) (ReceiptApplyResult, error)
//
//	type ProductUpdate struct { Name string; PackSize float64 }        // both always set (the inverse restores both)
//	Catalogue gains   UpdateProduct(ctx, id int64, in ProductUpdate) (ProductInfo, error)   // ErrProductGone
//	                  DeleteProduct(ctx, id int64) error                                      // the inverse of CreateProduct
//
//	func (s *Service) SessionEvents(ctx context.Context, shopID int64, uuids []string) ([]receipt.ScanEvent, error)
//	  the one loader the read and the apply share (§7.1 step 1): the scans of uuids that exist, are shop_scan or
//	  shop_unknown, at this Shop and not undone, in ledger order (seq); unknown, undone or other-Shop uuids are ignored.
//	  ScanEvent.Date is the household date of the scan; PriceCents is the scan's price (-1 none); PerKgCents is the per
//	  kg of the Price of that day (-1 none).
//
// ApplyReceiptPlan takes the scan lock ONCE and runs every step with the lock-held variants (apply, undo, setPrices);
// it publishes ONE update at the end, and none when it fails and everything was put back.
//
// A step maps to the service's existing operations:
//
//	new_scan        scan.Op{shop_scan, ClientUUID: Op.UUID, ScannedAt: Op.Date + "T12:00:00Z", ShopID, ProductID, Quantity,
//	                PriceCents (if >= 0), PricePerKgCents (if >= 0)}; with Ref set, ProductID is the Product the plan's
//	                create_product step with the same Ref made. A Result that is rejected fails the step.
//	undo            undo(Op.UUID); a scan that is already undone is done (no error).
//	set_prices      setPrices over the uuids of Op.Prices (all of one row, one price for all): PriceCents = the pack
//	                Price; with PerKgCents >= 0 also PricePerKgCents, and PriceCents = product.PriceForWeight(perKg, packSize).
//	                Its inverse is restorePrices of what it returned, never Step.Inverse.
//	update_product  Catalogue.UpdateProduct(ProductID, {Name, PackSize}); inverse = Step.Inverse (the same op, old values).
//	create_product  Ingredients.Ensure(name, baseUnit, kind) (kind "supply" else food) when Ingredient.New, then
//	                Catalogue.CreateProduct(no barcode); inverse = DeleteProduct of the Product made for Ref.
//
// Compensation: on the first failing step k the inverses of the steps before k run in reverse, every one of them even
// if an earlier one fails. The failure is a *ReceiptApplyError (errors.Is ErrReceiptApplyFailed):
//
//	type ReceiptApplyError struct { Step int; Kind receipt.OpKind; Err error; Compensation error }
//
// Compensation is nil when everything was put back. A step that did nothing in this run (a new_scan answered
// "duplicate", an undo of an already undone scan) is not compensated.
// Results: the Results of the new_scan and set_prices steps, one per uuid (the latest), in order of first appearance.
// Idempotent: the plan run again answers "duplicate" for its scans, makes no second Lot and no second Product (a
// create_product whose Ref already has a scan in the ledger reuses that scan's Product).

const (
	rr3Day   = "2026-11-09"
	rr3Read  = "r1"
	uSecond  = "receipt:r1:0"
	uAdd     = "receipt:r1:1"
	uRestore = "receipt:r1:undo:u1"
)

// ---- fault injection --------------------------------------------------------------------------------------------

type rule struct {
	method string
	match  func(any) bool
	fired  bool
	// block, when set, is called instead of failing: the call waits there (the lock test)
	block func()
}

type faultPlan struct {
	mu    sync.Mutex
	rules []*rule
}

func (f *faultPlan) arm(method string, match func(any) bool) *rule {
	f.mu.Lock()
	defer f.mu.Unlock()
	r := &rule{method: method, match: match}
	f.rules = append(f.rules, r)
	return r
}

func (f *faultPlan) hit(method string, arg any) error {
	f.mu.Lock()
	var blk func()
	var err error
	for _, r := range f.rules {
		if r.method != method || r.fired || !r.match(arg) {
			continue
		}
		r.fired = true
		if r.block != nil {
			blk = r.block
		} else {
			err = errors.New("injected failure of " + method)
		}
		break
	}
	f.mu.Unlock()
	if blk != nil {
		blk()
	}
	return err
}

func any_(any) bool { return true }

type faultStock struct {
	service.Stock
	f *faultPlan
}

func (s faultStock) AddLot(ctx context.Context, in service.StockAdd) (int64, bool, error) {
	if err := s.f.hit("AddLot", in); err != nil {
		return 0, false, err
	}
	return s.Stock.AddLot(ctx, in)
}

type faultCat struct {
	service.Catalogue
	f *faultPlan
}

func (c faultCat) RecordPrice(ctx context.Context, p int64, in service.PriceInput) (service.PriceInfo, error) {
	if err := c.f.hit("RecordPrice", in); err != nil {
		return service.PriceInfo{}, err
	}
	return c.Catalogue.RecordPrice(ctx, p, in)
}
func (c faultCat) UpdateProduct(ctx context.Context, id int64, in service.ProductUpdate) (service.ProductInfo, error) {
	if err := c.f.hit("UpdateProduct", in); err != nil {
		return service.ProductInfo{}, err
	}
	return c.Catalogue.UpdateProduct(ctx, id, in)
}
func (c faultCat) CreateProduct(ctx context.Context, in service.NewProduct) (service.ProductInfo, error) {
	if err := c.f.hit("CreateProduct", in); err != nil {
		return service.ProductInfo{}, err
	}
	return c.Catalogue.CreateProduct(ctx, in)
}
func (c faultCat) DeleteProduct(ctx context.Context, id int64) error {
	if err := c.f.hit("DeleteProduct", id); err != nil {
		return err
	}
	return c.Catalogue.DeleteProduct(ctx, id)
}

// faultIng wraps the concrete fake, so the extra port methods (EnsureNew, DeleteUnused) are the fake's own.
type faultIng struct {
	*fakeIngredients
	f *faultPlan
}

func (i faultIng) DeleteUnused(ctx context.Context, id int64) (bool, error) {
	if err := i.f.hit("DeleteUnused", id); err != nil {
		return false, err
	}
	return i.fakeIngredients.DeleteUnused(ctx, id)
}

type faultList struct {
	service.List
	f *faultPlan
}

func (l faultList) UndoLot(ctx context.Context, in shopservice.UndoLotInput) error {
	if err := l.f.hit("UndoLot", in); err != nil {
		return err
	}
	return l.List.UndoLot(ctx, in)
}

// The fake Catalogue's new methods (the real adapter is in internal/scan/httpapi).
func (f *fakeCatalogue) UpdateProduct(_ context.Context, id int64, in service.ProductUpdate) (service.ProductInfo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	p, ok := f.products[id]
	if !ok {
		return service.ProductInfo{}, service.ErrProductGone
	}
	p.Name, p.PackSize = in.Name, in.PackSize
	f.products[id] = p
	return p, nil
}

func (f *fakeCatalogue) DeleteProduct(_ context.Context, id int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.products, id)
	return nil
}

// ---- fixtures ---------------------------------------------------------------------------------------------------

type rr3Env struct {
	*env
	svc *service.Service
	f   *faultPlan
}

// newRR3Env is the session of the RR1 fixture: u1 and u2 are two Mutti packs at 129, u3 is a Milk at 150, all at Shop 1.
func newRR3Env(t *testing.T) *rr3Env {
	t.Helper()
	e := newEnv(t)
	f := &faultPlan{}
	svc := service.New(service.Deps{Ledger: e.ledger, Stock: faultStock{e.stock, f}, Catalogue: faultCat{e.cat, f}, Ingredients: faultIng{e.ing, f},
		List: faultList{e.list, f}, Household: household{}, Dates: utcDates{}, Clock: clock.NewFake(startTime), Publisher: e.bus})
	r := &rr3Env{env: e, svc: svc, f: f}
	r.scan(t, "u1", mutti, 700, 129)
	r.scan(t, "u2", mutti, 700, 129)
	r.scan(t, "u3", milkProd, 1000, 150)
	return r
}

func (r *rr3Env) scan(t *testing.T, uuid string, product int64, qty float64, cents int) {
	t.Helper()
	op := packScan(uuid, product, qty)
	op.PriceCents = ip(cents)
	if res, err := r.svc.Apply(context.Background(), op); err != nil || res.Status != scan.StatusApplied {
		t.Fatalf("scan %s = %+v, %v", uuid, res, err)
	}
}

func newScanOp(uuid string, product int64, qty float64, cents int) receipt.Op {
	return receipt.Op{Kind: receipt.OpNewScan, UUID: uuid, ProductID: product, Quantity: qty, PriceCents: cents, PerKgCents: -1, ShopID: 1, Date: rr3Day}
}

func undoOp(uuid string) receipt.Op { return receipt.Op{Kind: receipt.OpUndo, UUID: uuid} }

// restoreOp is the inverse BuildPlan gives an Undo: the original scan again, under a new uuid.
func restoreOp(readID, uuid string, product int64, qty float64, cents int) receipt.Op {
	o := newScanOp("receipt:"+readID+":undo:"+uuid, product, qty, cents)
	return o
}

func step(phase receipt.Phase, op, inv receipt.Op) receipt.Step {
	return receipt.Step{Phase: phase, Op: op, Inverse: inv}
}

// fullPlan has one step of every kind, in phase order:
//
//	0 update_product  Mutti renamed                       1 undo u1            2 new_scan receipt:r1:0 (135)
//	3 set_prices u2, receipt:r1:0 -> 140                  4 create_product "Pane casereccio" (Ref add:0)
//	5 new_scan receipt:r1:1 (Ref add:0, 225)              6 undo u3
func fullPlan() receipt.Plan {
	add := receipt.Op{Kind: receipt.OpCreateProduct, Ref: "add:0", Name: "Pane casereccio", PackSize: 450, BaseUnit: "g",
		Ingredient: &receipt.IngredientChoice{New: &receipt.NewIngredient{Name: "pane", BaseUnit: "g", Kind: "food"}}}
	addScan := newScanOp(uAdd, 0, 450, 225)
	addScan.Ref = "add:0"
	return receipt.Plan{Steps: []receipt.Step{
		step(receipt.PhaseCorrection,
			receipt.Op{Kind: receipt.OpUpdateProduct, ProductID: mutti, Name: "Mutti passata 700 g (new)", PackSize: 700},
			receipt.Op{Kind: receipt.OpUpdateProduct, ProductID: mutti, Name: "Mutti passata 700 g", PackSize: 700}),
		step(receipt.PhaseReplace, undoOp("u1"), restoreOp(rr3Read, "u1", mutti, 700, 129)),
		step(receipt.PhaseReplace, newScanOp(uSecond, mutti, 700, 135), undoOp(uSecond)),
		step(receipt.PhasePrice,
			receipt.Op{Kind: receipt.OpSetPrices, Prices: []receipt.PriceChange{{UUID: "u2", PriceCents: 140, PerKgCents: -1}, {UUID: uSecond, PriceCents: 140, PerKgCents: -1}}},
			receipt.Op{Kind: receipt.OpSetPrices, Prices: []receipt.PriceChange{{UUID: "u2", PriceCents: 129, PerKgCents: -1}, {UUID: uSecond, PriceCents: 135, PerKgCents: -1}}}),
		step(receipt.PhaseAdd, add, receipt.Op{Kind: receipt.OpDeleteProduct, Ref: "add:0"}),
		step(receipt.PhaseAdd, addScan, undoOp(uAdd)),
		step(receipt.PhaseRemove, undoOp("u3"), restoreOp(rr3Read, "u3", milkProd, 1000, 150)),
	}}
}

// snapshot is everything a compensation must put back, as comparable text: the live scans, the Stock Lots, the
// Shopping List, the Prices, the purchases and sold-at links and the Products. Ids and uuids are left out: an Undo is
// compensated by a new scan, so the ledger rows differ while the household's state is the same.
func (r *rr3Env) snapshot(t *testing.T) string {
	t.Helper()
	var out []string
	rows, err := r.db.Query(`SELECT product_id, quantity, IFNULL(price_cents,-1), shop_id, substr(scanned_at,1,10) FROM scan_events WHERE undone_at IS NULL`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var p, s int64
		var q float64
		var c int
		var d string
		if err := rows.Scan(&p, &q, &c, &s, &d); err != nil {
			t.Fatal(err)
		}
		out = append(out, fmt.Sprintf("scan p%d q%v c%d s%d %s", p, q, c, s, d))
	}
	rows.Close()
	for _, l := range r.stock.lots {
		out = append(out, fmt.Sprintf("lot i%d q%v", l.IngredientID, l.Quantity))
	}
	for i, tot := range r.stock.totals {
		out = append(out, fmt.Sprintf("total i%d %v", i, tot))
	}
	for i, rem := range r.list.remaining {
		out = append(out, fmt.Sprintf("list i%d %v ticked=%v", i, rem, r.list.ticked[i]))
	}
	for _, p := range r.cat.prices {
		cents, perKg := -1, -1
		if p.PriceCents != nil {
			cents = *p.PriceCents
		}
		if p.PricePerKgCents != nil {
			perKg = *p.PricePerKgCents
		}
		out = append(out, fmt.Sprintf("price p%d s%d %s %d/%d", r.cat.priceProd[p.ID], r.cat.priceShop[p.ID], p.Date, cents, perKg))
	}
	out = append(out, fmt.Sprintf("purchases %d", len(r.cat.purchases)))
	for k := range r.cat.soldAt {
		out = append(out, fmt.Sprintf("soldat %v", k))
	}
	for id, p := range r.cat.products {
		out = append(out, fmt.Sprintf("product %d %q %v", id, p.Name, p.PackSize))
	}
	for name := range r.ing.byName {
		out = append(out, "ingredient "+name)
	}
	sort.Strings(out)
	return strings.Join(out, "\n")
}

func (r *rr3Env) apply(t *testing.T, plan receipt.Plan) (service.ReceiptApplyResult, error) {
	t.Helper()
	type out struct {
		res service.ReceiptApplyResult
		err error
	}
	done := make(chan out, 1)
	go func() {
		res, err := r.svc.ApplyReceiptPlan(context.Background(), plan)
		done <- out{res, err}
	}()
	select {
	case o := <-done:
		return o.res, o.err
	case <-time.After(10 * time.Second):
		t.Fatal("ApplyReceiptPlan did not return: a lock-held step probably takes the scan lock again")
		return service.ReceiptApplyResult{}, nil
	}
}

func (r *rr3Env) live(t *testing.T, uuid string) bool {
	t.Helper()
	ev, ok, err := r.ledger.Get(context.Background(), uuid)
	if err != nil {
		t.Fatal(err)
	}
	return ok && ev.UndoneAt == ""
}

func (r *rr3Env) priceOfScan(t *testing.T, uuid string) int {
	t.Helper()
	ev, ok, err := r.ledger.Get(context.Background(), uuid)
	if err != nil || !ok || ev.PriceCents == nil {
		t.Fatalf("scan %s: %+v %v %v", uuid, ev, ok, err)
	}
	return *ev.PriceCents
}

func resultUUIDs(res service.ReceiptApplyResult) []string {
	var out []string
	for _, r := range res.Results {
		out = append(out, r.ClientUUID)
	}
	return out
}

// ---- the plan, applied -----------------------------------------------------------------------------------------

func TestAnEmptyPlanDoesNothingAndPublishesNothing(t *testing.T) {
	e := newRR3Env(t)
	before, published := e.snapshot(t), e.bus.count(shopservice.Topic)
	res, err := e.apply(t, receipt.Plan{})
	if err != nil || len(res.Results) != 0 {
		t.Fatalf("empty plan = %+v, %v", res, err)
	}
	if e.snapshot(t) != before || e.bus.count(shopservice.Topic) != published {
		t.Error("an empty plan changed or published something")
	}
}

func TestEveryStepKindRunsInOrderUnderOneLockAndPublishesOnce(t *testing.T) {
	e := newRR3Env(t)
	published := e.bus.count(shopservice.Topic)
	res, err := e.apply(t, fullPlan())
	if err != nil {
		t.Fatalf("ApplyReceiptPlan: %v", err)
	}
	if got := e.bus.count(shopservice.Topic) - published; got != 1 {
		t.Errorf("the plan published %d updates, want exactly 1 (at the end)", got)
	}
	if e.live(t, "u1") || e.live(t, "u3") || !e.live(t, "u2") || !e.live(t, uSecond) || !e.live(t, uAdd) {
		t.Error("undone/live scans are wrong after the plan")
	}
	if e.priceOfScan(t, "u2") != 140 || e.priceOfScan(t, uSecond) != 140 || e.priceOfScan(t, uAdd) != 225 {
		t.Errorf("prices: u2=%d new=%d add=%d", e.priceOfScan(t, "u2"), e.priceOfScan(t, uSecond), e.priceOfScan(t, uAdd))
	}
	if e.cat.products[mutti].Name != "Mutti passata 700 g (new)" {
		t.Errorf("the Product was not corrected: %+v", e.cat.products[mutti])
	}
	// the Add: the Ingredient through Ensure (food), the Product without a barcode, the scan on that Product
	if k := e.ing.kinds["pane"]; k != ingredient.KindFood {
		t.Errorf("Ensure kind = %q", k)
	}
	if len(e.cat.created) != 1 || e.cat.created[0].Name != "Pane casereccio" || e.cat.created[0].PackSize != 450 ||
		len(e.cat.created[0].Barcodes) != 0 || len(e.cat.created[0].ShopBarcodes) != 0 {
		t.Errorf("created Products = %+v", e.cat.created)
	}
	ev, _, _ := e.ledger.Get(context.Background(), uAdd)
	if ev.ProductID == nil || e.cat.products[*ev.ProductID].Name != "Pane casereccio" {
		t.Errorf("the Add's scan is on %v", ev.ProductID)
	}
	// Results: the new scans and the re-priced ones, once each, in order of first appearance, with the final price
	if got := strings.Join(resultUUIDs(res), ","); got != uSecond+",u2,"+uAdd {
		t.Fatalf("results = %s", got)
	}
	for _, r := range res.Results {
		if r.Status != scan.StatusApplied || r.Scan == nil || r.Scan.PriceCents == nil {
			t.Errorf("result = %+v", r)
		}
	}
	if *res.Results[0].Scan.PriceCents != 140 {
		t.Errorf("the re-priced new scan's Result says %d, want 140", *res.Results[0].Scan.PriceCents)
	}
}

func TestAnAddOfASupplyAsksEnsureForTheSupplyKind(t *testing.T) {
	e := newRR3Env(t)
	plan := receipt.Plan{Steps: []receipt.Step{
		step(receipt.PhaseAdd, receipt.Op{Kind: receipt.OpCreateProduct, Ref: "add:0", Name: "Fairy soap", PackSize: 1, BaseUnit: "piece",
			Ingredient: &receipt.IngredientChoice{New: &receipt.NewIngredient{Name: "dish soap", BaseUnit: "piece", Kind: "supply"}}},
			receipt.Op{Kind: receipt.OpDeleteProduct, Ref: "add:0"}),
	}}
	s := newScanOp(uAdd, 0, 1, 299)
	s.Ref = "add:0"
	plan.Steps = append(plan.Steps, step(receipt.PhaseAdd, s, undoOp(uAdd)))
	if _, err := e.apply(t, plan); err != nil {
		t.Fatal(err)
	}
	if k := e.ing.kinds["dish soap"]; k != ingredient.KindSupply {
		t.Errorf("Ensure kind = %q, want supply", k)
	}
}

func TestAnAddOfAnExistingIngredientDoesNotEnsure(t *testing.T) {
	e := newRR3Env(t)
	plan := receipt.Plan{Steps: []receipt.Step{
		step(receipt.PhaseAdd, receipt.Op{Kind: receipt.OpCreateProduct, Ref: "add:0", Name: "Mutti polpa", PackSize: 400, BaseUnit: "g",
			Ingredient: &receipt.IngredientChoice{ID: passataIng}}, receipt.Op{Kind: receipt.OpDeleteProduct, Ref: "add:0"}),
	}}
	if _, err := e.apply(t, plan); err != nil {
		t.Fatal(err)
	}
	if len(e.ing.calls) != 0 || len(e.cat.created) != 1 || e.cat.created[0].IngredientID != passataIng {
		t.Errorf("Ensure calls = %v, created = %+v", e.ing.calls, e.cat.created)
	}
}

func TestAPriceOfAWeighedScanKeepsItsPricePerKg(t *testing.T) {
	e := newRR3Env(t)
	op := packScan("w1", mutti, 312)
	if res, err := e.svc.Apply(context.Background(), op); err != nil || res.Status != scan.StatusApplied {
		t.Fatalf("weighed scan: %+v %v", res, err)
	}
	plan := receipt.Plan{Steps: []receipt.Step{step(receipt.PhasePrice,
		receipt.Op{Kind: receipt.OpSetPrices, Prices: []receipt.PriceChange{{UUID: "w1", PriceCents: 624, PerKgCents: 2000}}},
		receipt.Op{Kind: receipt.OpSetPrices, Prices: []receipt.PriceChange{{UUID: "w1", PriceCents: -1, PerKgCents: -1}}})}}
	res, err := e.apply(t, plan)
	if err != nil {
		t.Fatal(err)
	}
	if e.priceOfScan(t, "w1") != 624 || len(res.Results) != 1 || *res.Results[0].Scan.PriceCents != 624 {
		t.Errorf("weighed price = %d, results %+v", e.priceOfScan(t, "w1"), res.Results)
	}
	// the day's Price: the pack Price is what the per kg gives for one pack (2000 x 700 / 1000), and the per kg is kept
	var day *service.PriceInfo
	for _, p := range e.cat.prices {
		if p.PricePerKgCents != nil {
			day = p
		}
	}
	if day == nil || *day.PricePerKgCents != 2000 || day.PriceCents == nil || *day.PriceCents != 1400 {
		t.Errorf("the day's Price = %+v", day)
	}
}

func TestThePlanRunsUnderTheScanLockSoAnotherScanWaitsForIt(t *testing.T) {
	e := newRR3Env(t)
	started, release := make(chan struct{}), make(chan struct{})
	r := e.f.arm("AddLot", func(a any) bool { return a.(service.StockAdd).ClientUUID == uSecond })
	r.block = func() { close(started); <-release }

	planDone := make(chan error, 1)
	go func() { _, err := e.svc.ApplyReceiptPlan(context.Background(), fullPlan()); planDone <- err }()
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("the plan never reached its third step")
	}
	otherDone := make(chan struct{})
	go func() {
		op := packScan("other", milkProd, 1000)
		_, _ = e.svc.Apply(context.Background(), op)
		close(otherDone)
	}()
	select {
	case <-otherDone:
		t.Fatal("another phone's scan ran in the middle of the plan: the lock is not held for the whole plan")
	case <-time.After(150 * time.Millisecond):
	}
	close(release)
	if err := <-planDone; err != nil {
		t.Fatal(err)
	}
	select {
	case <-otherDone:
	case <-time.After(5 * time.Second):
		t.Fatal("the other scan never ran after the plan")
	}
}

// ---- idempotency ------------------------------------------------------------------------------------------------

func TestApplyingTheSamePlanAgainDoesNotDoubleApply(t *testing.T) {
	e := newRR3Env(t)
	if _, err := e.apply(t, fullPlan()); err != nil {
		t.Fatal(err)
	}
	after := e.snapshot(t)
	res, err := e.apply(t, fullPlan())
	if err != nil {
		t.Fatalf("the second apply: %v", err)
	}
	if got := e.snapshot(t); got != after {
		t.Errorf("a second apply changed the state:\nbefore:\n%s\nafter:\n%s", after, got)
	}
	if len(e.cat.created) != 1 {
		t.Errorf("a second apply created %d Products, want 1 in all", len(e.cat.created))
	}
	for _, r := range res.Results {
		if (r.ClientUUID == uSecond || r.ClientUUID == uAdd) && r.Status != scan.StatusDuplicate {
			t.Errorf("the second apply's Result of %s is %q, want duplicate", r.ClientUUID, r.Status)
		}
	}
}

// ---- compensation: a failure at each step kind -----------------------------------------------------------------

func TestAFailureAtEachStepKindPutsBackEverythingAlreadyDone(t *testing.T) {
	cases := []struct {
		name   string
		step   int
		kind   receipt.OpKind
		method string
		match  func(any) bool
	}{
		{"update_product", 0, receipt.OpUpdateProduct, "UpdateProduct", any_},
		{"undo", 1, receipt.OpUndo, "UndoLot", func(a any) bool { return a.(shopservice.UndoLotInput).IngredientID == passataIng }},
		{"new_scan", 2, receipt.OpNewScan, "AddLot", func(a any) bool { return a.(service.StockAdd).ClientUUID == uSecond }},
		{"set_prices", 3, receipt.OpSetPrices, "RecordPrice", func(a any) bool { return *a.(service.PriceInput).PriceCents == 140 }},
		{"create_product", 4, receipt.OpCreateProduct, "CreateProduct", any_},
		{"new_scan of an Add", 5, receipt.OpNewScan, "AddLot", func(a any) bool { return a.(service.StockAdd).ClientUUID == uAdd }},
		{"undo of a removed row", 6, receipt.OpUndo, "UndoLot", func(a any) bool { return a.(shopservice.UndoLotInput).IngredientID == milkIng }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			e := newRR3Env(t)
			before, published := e.snapshot(t), e.bus.count(shopservice.Topic)
			e.f.arm(c.method, c.match)
			res, err := e.apply(t, fullPlan())
			if err == nil {
				t.Fatalf("the plan succeeded with a failure injected at %s", c.name)
			}
			var ae *service.ReceiptApplyError
			if !errors.As(err, &ae) || !errors.Is(err, service.ErrReceiptApplyFailed) {
				t.Fatalf("error = %T %v, want *ReceiptApplyError wrapping ErrReceiptApplyFailed", err, err)
			}
			if ae.Step != c.step || ae.Kind != c.kind || ae.Compensation != nil {
				t.Errorf("failed at step %d (%s), compensation %v; want step %d (%s) put back cleanly", ae.Step, ae.Kind, ae.Compensation, c.step, c.kind)
			}
			if len(res.Results) != 0 {
				t.Errorf("a failed plan returned %d Results", len(res.Results))
			}
			if got := e.snapshot(t); got != before {
				t.Errorf("not put back exactly.\nbefore:\n%s\nafter:\n%s", before, got)
			}
			if got := e.bus.count(shopservice.Topic) - published; got != 0 {
				t.Errorf("a plan that was put back published %d updates, want none", got)
			}
		})
	}
}

func TestAFailureWhilePuttingBackStillRunsTheOtherInverses(t *testing.T) {
	e := newRR3Env(t)
	before := e.snapshot(t)
	e.f.arm("AddLot", func(a any) bool { return a.(service.StockAdd).ClientUUID == uAdd }) // step 5 fails
	e.f.arm("DeleteProduct", any_)                                                         // and so does deleting the Product made by step 4
	published := e.bus.count(shopservice.Topic)
	_, err := e.apply(t, fullPlan())
	var ae *service.ReceiptApplyError
	if !errors.As(err, &ae) || ae.Step != 5 || ae.Compensation == nil {
		t.Fatalf("error = %v (%+v), want step 5 with a compensation error", err, ae)
	}
	if e.bus.count(shopservice.Topic)-published != 1 {
		t.Error("a plan left half put back must publish, so the phones reload")
	}
	// everything else was put back: only the Product that could not be deleted is left over, with the Ingredient it
	// references (b8-rxgo: an Ingredient something references is never removed)
	got := strings.Split(e.snapshot(t), "\n")
	want := strings.Split(before, "\n")
	extra := 0
	for _, l := range got {
		if (strings.HasPrefix(l, "product ") || strings.HasPrefix(l, "ingredient ")) && !strings.Contains(before, l) {
			extra++
			continue
		}
		if !strings.Contains(before, l) {
			t.Errorf("unexpected state left: %s", l)
		}
	}
	if extra != 2 || len(got)-extra != len(want) {
		t.Errorf("state after: %v\nbefore: %v", got, want)
	}
}

func TestARejectedScanFailsTheStepAndPutsBackTheEarlierOnes(t *testing.T) {
	e := newRR3Env(t)
	before := e.snapshot(t)
	plan := receipt.Plan{Steps: []receipt.Step{
		step(receipt.PhaseCorrection,
			receipt.Op{Kind: receipt.OpUpdateProduct, ProductID: mutti, Name: "Renamed", PackSize: 700},
			receipt.Op{Kind: receipt.OpUpdateProduct, ProductID: mutti, Name: "Mutti passata 700 g", PackSize: 700}),
		step(receipt.PhaseQuantity, newScanOp("receipt:r1:0", 999, 700, 100), undoOp("receipt:r1:0")), // unknown Product: rejected
	}}
	_, err := e.apply(t, plan)
	var ae *service.ReceiptApplyError
	if !errors.As(err, &ae) || ae.Step != 1 || ae.Kind != receipt.OpNewScan {
		t.Fatalf("error = %v, want the new scan of step 1 to fail", err)
	}
	if got := e.snapshot(t); got != before {
		t.Errorf("not put back:\n%s\n%s", before, got)
	}
}

// A real read id is a uuid (36 characters) and so is a phone's scan uuid: the uuid of the scan that re-applies an Undo,
// receipt:<readId>:undo:<uuid>, is 86 characters, and a scan.Op's client UUID is limited to 64 until this work.
func TestPuttingBackAnUndoWorksWithRealUuidLengths(t *testing.T) {
	e := newRR3Env(t)
	const readID, sessionUUID = "0b6d3a52-9c1e-4f7a-8d2b-5e3f1a9c7b44", "7c9e6679-7425-40de-944b-e07fc1f90ae7"
	e.scan(t, sessionUUID, mutti, 700, 129)
	before := e.snapshot(t)
	plan := receipt.Plan{Steps: []receipt.Step{
		step(receipt.PhaseRemove, undoOp(sessionUUID), restoreOp(readID, sessionUUID, mutti, 700, 129)),
		step(receipt.PhaseAdd, newScanOp("receipt:"+readID+":0", 999, 1, 1), undoOp("receipt:"+readID+":0")), // rejected: forces the put-back
	}}
	_, err := e.apply(t, plan)
	var ae *service.ReceiptApplyError
	if !errors.As(err, &ae) || ae.Step != 1 || ae.Compensation != nil {
		t.Fatalf("error = %v (%+v): the 86-character uuid of the put-back scan must be accepted", err, ae)
	}
	if got := e.snapshot(t); got != before {
		t.Errorf("not put back:\n%s\n%s", before, got)
	}
}

// ---- the lock-held variants -------------------------------------------------------------------------------------

func TestSessionEventsAreTheLiveShopScansOfThisShopInLedgerOrder(t *testing.T) {
	e := newRR3Env(t)
	e.cat.shops[2] = true
	op := packScan("other-shop", mutti, 700)
	op.ShopID = i64(2)
	if _, err := e.svc.Apply(context.Background(), op); err != nil {
		t.Fatal(err)
	}
	weighed := packScan("w1", mutti, 312)
	weighed.PriceCents, weighed.PricePerKgCents = ip(624), ip(2000)
	if _, err := e.svc.Apply(context.Background(), weighed); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Undo(context.Background(), "u2"); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	evs, err := e.svc.SessionEvents(ctx, 1, []string{"w1", "u3", "u1", "u2", "other-shop", "never-heard-of"})
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, ev := range evs {
		got = append(got, ev.UUID)
	}
	if strings.Join(got, ",") != "u1,u3,w1" {
		t.Fatalf("events = %v, want u1,u3,w1 (ledger order; undone, other-Shop and unknown ignored)", got)
	}
	u1, w1 := evs[0], evs[2]
	if u1.ProductID != mutti || u1.Product != "Mutti passata 700 g" || u1.BaseUnit != "g" || u1.PackSize != 700 || u1.Quantity != 700 ||
		u1.PriceCents != 129 || u1.PerKgCents != -1 || u1.ShopID != 1 || u1.Date != rr3Day {
		t.Errorf("u1 = %+v", u1)
	}
	if w1.Quantity != 312 || w1.PriceCents != 624 || w1.PerKgCents != 2000 {
		t.Errorf("w1 = %+v", w1)
	}
	before := receipt.Fingerprint(evs)
	if _, err := e.svc.SetPrices(ctx, service.SetPricesInput{ClientUUIDs: []string{"u1"}, PriceCents: 130}); err != nil {
		t.Fatal(err)
	}
	evs, _ = e.svc.SessionEvents(ctx, 1, []string{"w1", "u3", "u1", "u2"})
	if receipt.Fingerprint(evs) == before {
		t.Error("a Price edit did not change the fingerprint")
	}
}

// ---- the review's additions (RR3 review) --------------------------------------------------------------------------

// Only the receipt Apply writes "receipt:" uuids: a phone's Op with one is refused, so it can never take a plan's uuid.
func TestAPhonesOpCannotUseAReceiptUUID(t *testing.T) {
	e := newRR3Env(t)
	res, err := e.svc.Apply(context.Background(), packScan("receipt:r1:0", mutti, 700))
	if err != nil || res.Status != scan.StatusRejected || res.Error == nil || res.Error.Code != service.CodeValidation {
		t.Fatalf("Apply = %+v, %v; want rejected (validation)", res, err)
	}
	if e.live(t, "receipt:r1:0") {
		t.Error("the receipt uuid was written")
	}
}

// pricePlan re-prices u1 and u2 to 140: a plan that touches the session's own scans.
func pricePlan() receipt.Plan {
	return receipt.Plan{Steps: []receipt.Step{step(receipt.PhasePrice,
		receipt.Op{Kind: receipt.OpSetPrices, Prices: []receipt.PriceChange{{UUID: "u1", PriceCents: 140, PerKgCents: -1}, {UUID: "u2", PriceCents: 140, PerKgCents: -1}}},
		receipt.Op{Kind: receipt.OpSetPrices})}}
}

// A Price edit (from another phone, or this phone's queue) that lands after the read is refused by the apply's own
// check: the session is loaded and fingerprinted under the lock the plan then runs under.
func TestApplyReceiptRefusesASessionThatChangedSinceTheRead(t *testing.T) {
	e := newRR3Env(t)
	ctx := context.Background()
	uuids := []string{"u1", "u2", "u3"}
	evs, err := e.svc.SessionEvents(ctx, 1, uuids)
	if err != nil {
		t.Fatal(err)
	}
	fp := receipt.Fingerprint(evs)
	if _, err := e.svc.SetPrices(ctx, service.SetPricesInput{ClientUUIDs: []string{"u1", "u2"}, PriceCents: 130}); err != nil {
		t.Fatal(err)
	}
	before, published := e.snapshot(t), e.bus.count(shopservice.Topic)
	built := false
	_, err = e.svc.ApplyReceipt(ctx, service.ReceiptApply{ShopID: 1, ClientUUIDs: uuids, Fingerprint: fp,
		Build: func() (receipt.Plan, error) { built = true; return pricePlan(), nil }})
	if !errors.Is(err, service.ErrReceiptSessionChanged) {
		t.Fatalf("err = %v, want ErrReceiptSessionChanged", err)
	}
	if built || e.snapshot(t) != before || e.bus.count(shopservice.Topic) != published {
		t.Errorf("a refused apply built its plan (%v), wrote or published", built)
	}
	if _, err := e.svc.ApplyReceipt(ctx, service.ReceiptApply{ShopID: 1, ClientUUIDs: nil, Fingerprint: receipt.Fingerprint(nil),
		Build: func() (receipt.Plan, error) { return pricePlan(), nil }}); !errors.Is(err, service.ErrReceiptSessionChanged) {
		t.Errorf("an empty session: err = %v, want ErrReceiptSessionChanged", err)
	}
}

// The race the handler had: the check and the plan under two holds of the lock, so an Undo could land between them.
// ApplyReceipt holds the lock from the check to the end of the plan: an Undo sent while it builds waits, and runs after.
func TestApplyReceiptHoldsTheLockFromTheCheckToTheEndOfThePlan(t *testing.T) {
	e := newRR3Env(t)
	ctx := context.Background()
	uuids := []string{"u1", "u2", "u3"}
	evs, err := e.svc.SessionEvents(ctx, 1, uuids)
	if err != nil {
		t.Fatal(err)
	}
	building, release := make(chan struct{}), make(chan struct{})
	applyDone := make(chan error, 1)
	go func() {
		_, err := e.svc.ApplyReceipt(ctx, service.ReceiptApply{ShopID: 1, ClientUUIDs: uuids, Fingerprint: receipt.Fingerprint(evs),
			Build: func() (receipt.Plan, error) { close(building); <-release; return pricePlan(), nil }})
		applyDone <- err
	}()
	select {
	case <-building:
	case <-time.After(5 * time.Second):
		t.Fatal("the apply never built its plan")
	}
	undoDone := make(chan struct{})
	go func() { _, _ = e.svc.Undo(ctx, "u2"); close(undoDone) }()
	select {
	case <-undoDone:
		t.Fatal("an Undo ran between the session check and the plan")
	case <-time.After(150 * time.Millisecond):
	}
	close(release)
	if err := <-applyDone; err != nil {
		t.Fatal(err)
	}
	<-undoDone
	if e.priceOfScan(t, "u1") != 140 || e.live(t, "u2") {
		t.Errorf("u1 = %d, u2 live %v: want the plan first, then the Undo", e.priceOfScan(t, "u1"), e.live(t, "u2"))
	}
}

// A plan that failed and was put back leaves its scans in the ledger, undone. Its retry (the session did not change, so
// the fingerprint holds) must scan again, not answer "duplicate" for the undone scans and skip them.
func TestARetryAfterAPutBackScansAgain(t *testing.T) {
	e := newRR3Env(t)
	plan := receipt.Plan{Steps: []receipt.Step{
		// Milk is not on the Shopping List (the fake List does not undo a clamped remaining exactly)
		step(receipt.PhaseQuantity, newScanOp(uSecond, milkProd, 1000, 150), undoOp(uSecond)),
		step(receipt.PhaseCorrection,
			receipt.Op{Kind: receipt.OpUpdateProduct, ProductID: mutti, Name: "Mutti passata 700 g (new)", PackSize: 700},
			receipt.Op{Kind: receipt.OpUpdateProduct, ProductID: mutti, Name: "Mutti passata 700 g", PackSize: 700}),
	}}
	e.f.arm("UpdateProduct", func(a any) bool { return a.(service.ProductUpdate).Name != "Mutti passata 700 g" })
	before := e.snapshot(t)
	if _, err := e.apply(t, plan); err == nil {
		t.Fatal("the plan succeeded with a failure injected")
	}
	if e.snapshot(t) != before || e.live(t, uSecond) {
		t.Fatalf("the failed plan was not put back (live %v):\n%s\n--\n%s", e.live(t, uSecond), before, e.snapshot(t))
	}
	res, err := e.apply(t, plan)
	if err != nil {
		t.Fatal(err)
	}
	if got := resultUUIDs(res); len(got) != 1 || got[0] != uSecond+"#2" || res.Results[0].Status != scan.StatusApplied {
		t.Fatalf("results = %v %+v, want %s#2 applied", got, res.Results, uSecond)
	}
	if !e.live(t, uSecond+"#2") || e.lotCountFor(t) != 4 {
		t.Errorf("the retry did not scan again: live %v, lots %d", e.live(t, uSecond+"#2"), e.lotCountFor(t))
	}
	// and a retry of that retry is idempotent again
	res, err = e.apply(t, plan)
	if err != nil || len(res.Results) != 1 || res.Results[0].Status != scan.StatusDuplicate || e.lotCountFor(t) != 4 {
		t.Errorf("third apply = %+v, %v, lots %d", res.Results, err, e.lotCountFor(t))
	}
}

func (r *rr3Env) lotCountFor(t *testing.T) int {
	t.Helper()
	return r.stock.lotCount()
}

// The weighed rule: a scan priced per kg is weighed even when its weight is the pack size (a Product made from a
// weighed code takes its first weight as pack size); a pack scan on the same day stays a pack scan.
func TestSessionEventsWeighedRule(t *testing.T) {
	e := newRR3Env(t)
	ctx := context.Background()
	w := packScan("w-first", mutti, 700)
	w.PriceCents, w.PricePerKgCents = ip(1400), ip(2000)
	if res, err := e.svc.Apply(ctx, w); err != nil || res.Status != scan.StatusApplied {
		t.Fatal(res, err)
	}
	evs, err := e.svc.SessionEvents(ctx, 1, []string{"u1", "w-first"})
	if err != nil || len(evs) != 2 {
		t.Fatal(evs, err)
	}
	if evs[0].Weighed || evs[0].PerKgCents != -1 {
		t.Errorf("u1 (a pack at 129) = weighed %v, per kg %d", evs[0].Weighed, evs[0].PerKgCents)
	}
	if !evs[1].Weighed || evs[1].PerKgCents != 2000 {
		t.Errorf("w-first (700 g at 20.00/kg) = weighed %v, per kg %d", evs[1].Weighed, evs[1].PerKgCents)
	}
}

// Each event carries its Product's barcode (RR2's read sends it to the assistant).
func TestSessionEventsCarryTheProductsBarcode(t *testing.T) {
	e := newRR3Env(t)
	p := e.cat.products[mutti]
	p.Barcode = "08000500310427"
	e.cat.products[mutti] = p
	evs, err := e.svc.SessionEvents(context.Background(), 1, []string{"u1", "u3"})
	if err != nil || len(evs) != 2 {
		t.Fatal(evs, err)
	}
	if evs[0].Barcode != "08000500310427" || evs[1].Barcode != "" {
		t.Errorf("barcodes = %q, %q", evs[0].Barcode, evs[1].Barcode)
	}
}

// The phone learns which of its scans the plan undid from Undone (receipt-reading §7.2): u1 and u3 here, in plan order.
// A second apply of the same plan undoes nothing again, so it lists none.
func TestAnAppliedPlanListsTheScansItUndid(t *testing.T) {
	e := newRR3Env(t)
	res, err := e.apply(t, fullPlan())
	if err != nil {
		t.Fatalf("ApplyReceiptPlan: %v", err)
	}
	got := strings.Join(res.Undone, ",")
	if got != "u1,u3" && got != "u3,u1" {
		t.Errorf("undone = %q, want u1 and u3", got)
	}
	for _, u := range res.Undone {
		if e.live(t, u) {
			t.Errorf("%s is listed as undone but is live", u)
		}
	}
	again, err := e.apply(t, fullPlan())
	if err != nil {
		t.Fatalf("the second apply: %v", err)
	}
	if len(again.Undone) != 0 {
		t.Errorf("the second apply lists %v as undone, want none", again.Undone)
	}
}
