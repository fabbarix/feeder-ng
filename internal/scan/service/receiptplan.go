package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/receipt"
	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// RR3 (docs/design/receipt-reading.md §8.2, §8.3; ADR 0018 decision 8): a receipt's apply plan runs under one scan lock,
// step by step with the lock-held variants of the scan operations, and publishes once at its end. A failed step puts
// back every step before it, in reverse order, with each step's inverse.

// ErrReceiptApplyFailed is matched (errors.Is) by every *ReceiptApplyError.
var ErrReceiptApplyFailed = errors.New("scan: receipt apply failed")

// ReceiptApplyResult is what an applied plan returns: the Result of each scan it made or re-priced, once each, in order
// of first appearance, carrying the latest price.
type ReceiptApplyResult struct {
	Results []scan.Result
}

// ReceiptApplyError is a plan that failed at Step, its index in the plan. Err is the step's error. Compensation is nil
// when every step before it was put back; otherwise it says what could not be. Results are the scans the put-back
// wrote: each scan the plan had undone is applied again under a new uuid (receipt:<readId>:undo:<its uuid>, with a
// "#n" suffix on a retry), which the phone learns only from these Results (receipt-reading §7.2).
type ReceiptApplyError struct {
	Step         int
	Kind         receipt.OpKind
	Err          error
	Compensation error
	Results      []scan.Result
}

func (e *ReceiptApplyError) Error() string {
	msg := fmt.Sprintf("receipt apply: step %d (%s) failed: %v", e.Step, e.Kind, e.Err)
	if e.Compensation != nil {
		msg += "; putting back failed: " + e.Compensation.Error()
	}
	return msg
}

// Unwrap returns the step's error, so its sentinels still match.
func (e *ReceiptApplyError) Unwrap() error { return e.Err }

// Is makes errors.Is(err, ErrReceiptApplyFailed) true.
func (e *ReceiptApplyError) Is(target error) bool { return target == ErrReceiptApplyFailed }

// ErrReceiptSessionChanged is an apply whose session no longer has the read's fingerprint (a Scan, an Undo or a Price
// edit since the read, or a session ended by Change Shop): nothing was written (receipt-reading §7.2 step 2).
var ErrReceiptSessionChanged = errors.New("scan: receipt session changed")

// ReceiptApply is one apply of a read: the phone's session now (its Shop and client uuids), the read's fingerprint,
// and the plan to run once the session still matches it. Build is pure (receipt.BuildPlan over the read); its error
// is returned as is, with nothing written.
type ReceiptApply struct {
	ShopID      int64
	ClientUUIDs []string
	Fingerprint string
	Build       func() (receipt.Plan, error)
}

// ApplyReceipt is the receipt apply (receipt-reading §7.2, §8.2): under ONE hold of the scan lock it loads the
// session's events, compares their fingerprint with the read's, builds the plan and runs it. No Scan, Undo or Price
// edit from another phone can land between the check and the plan. The session is today's scans, as the read keeps
// them (Q5): a scan of an earlier household day among the uuids is left out of the fingerprint here as it is there. A
// session that changed (or is empty) is ErrReceiptSessionChanged.
func (s *Service) ApplyReceipt(ctx context.Context, in ReceiptApply) (ReceiptApplyResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.sessionEvents(ctx, in.ShopID, in.ClientUUIDs)
	if err != nil {
		return ReceiptApplyResult{}, err
	}
	today, _, err := s.household(ctx)
	if err != nil {
		return ReceiptApplyResult{}, err
	}
	events := make([]receipt.ScanEvent, 0, len(all))
	for _, ev := range all {
		if ev.Date == string(today) {
			events = append(events, ev)
		}
	}
	if len(events) == 0 || receipt.Fingerprint(events) != in.Fingerprint {
		return ReceiptApplyResult{}, ErrReceiptSessionChanged
	}
	plan, err := in.Build()
	if err != nil {
		return ReceiptApplyResult{}, err
	}
	return s.applyReceiptPlan(ctx, plan)
}

// SessionEvents is the one loader the read and the apply share (receipt-reading §7.1 step 1): the live shop_scan and
// shop_unknown events among uuids, at this Shop, in ledger order. Unknown, undone and other-Shop uuids are ignored.
// It takes the scan lock, so it never sees a plan half applied.
func (s *Service) SessionEvents(ctx context.Context, shopID int64, uuids []string) ([]receipt.ScanEvent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sessionEvents(ctx, shopID, uuids)
}

// sessionEvents is SessionEvents with the scan lock held.
//
// Barcode is the Product's first global barcode (canonical GTIN-14, the smallest; "" for none, as for a Product known
// only by a Shop or weighed code).
//
// The weighed rule (receipt-reading §7.1, decided in the RR3 review): the ledger keeps no weighed flag, so a scan of a
// Product in g or ml is weighed when its Price was taken per kg, that is when the day's Price row has a recorded per kg
// (Catalogue.PriceOn never serves a derived one) and the scan's Price is that per kg at its quantity
// (product.PriceForWeight, within 1 minor unit for a price read off a label), or else when its quantity is not the
// Product's pack size. A weighed scan's PerKgCents is the day's per kg (-1 for none); a pack scan's is always -1, even
// when the day's row holds a per kg from another scan.
func (s *Service) sessionEvents(ctx context.Context, shopID int64, uuids []string) ([]receipt.ScanEvent, error) {
	var evs []store.Event
	seen := make(map[string]bool, len(uuids))
	for _, u := range uuids {
		if seen[u] {
			continue
		}
		seen[u] = true
		ev, ok, err := s.d.Ledger.Get(ctx, u)
		if err != nil {
			return nil, err
		}
		if !ok || ev.UndoneAt != "" || ev.ShopID == nil || *ev.ShopID != shopID || ev.ProductID == nil {
			continue
		}
		if ev.Kind != string(scan.KindShopScan) && ev.Kind != string(scan.KindShopUnknown) {
			continue
		}
		evs = append(evs, ev)
	}
	sort.SliceStable(evs, func(i, j int) bool { return evs[i].Seq < evs[j].Seq })

	today, _, err := s.household(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]receipt.ScanEvent, 0, len(evs))
	for _, ev := range evs {
		p, err := s.d.Catalogue.Product(ctx, *ev.ProductID)
		if errors.Is(err, ErrProductGone) {
			continue
		}
		if err != nil {
			return nil, err
		}
		date, err := s.scanDate(ctx, ev.ScannedAt, today)
		if err != nil {
			return nil, err
		}
		day, err := s.d.Catalogue.PriceOn(ctx, p.ID, shopID, date)
		if err != nil {
			return nil, err
		}
		price := -1
		if ev.PriceCents != nil {
			price = *ev.PriceCents
		}
		weighed, perKg := weighedScan(p, ev.Quantity, price, day)
		out = append(out, receipt.ScanEvent{UUID: ev.ClientUUID, ProductID: p.ID, Product: p.Name, Barcode: p.Barcode,
			BaseUnit: p.BaseUnit, PackSize: int(p.PackSize), Weighed: weighed, Quantity: ev.Quantity, PriceCents: price,
			PerKgCents: perKg, ShopID: shopID, Date: string(date)})
	}
	return out, nil
}

// weighedScan applies the weighed rule (see sessionEvents) to one scan: whether it is weighed, and its per kg (-1 none).
func weighedScan(p ProductInfo, qty float64, price int, day *PriceInfo) (bool, int) {
	base := units.Base(p.BaseUnit)
	if base == units.Piece {
		return false, -1
	}
	perKg := -1
	if day != nil && day.PricePerKgCents != nil {
		perKg = *day.PricePerKgCents
	}
	pricedPerKg := false
	if perKg >= 0 && price >= 0 {
		if c, ok := product.PriceForWeight(product.Price{PricePerKgCents: &perKg}, p.PackSize, base, qty); ok {
			pricedPerKg = c-price <= 1 && price-c <= 1
		}
	}
	if !pricedPerKg && qty == p.PackSize {
		return false, -1
	}
	return true, perKg
}

// ApplyReceiptPlan runs a receipt's plan under the scan lock: each step in order, and on the first failure the inverses
// of the steps that did something, in reverse, every one tried. It publishes one update at the end; a failure that was put
// back cleanly publishes nothing, and one whose put-back failed publishes so the phones reload. It does not check the
// session: the apply route uses ApplyReceipt, which does, under the same lock.
func (s *Service) ApplyReceiptPlan(ctx context.Context, plan receipt.Plan) (ReceiptApplyResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.applyReceiptPlan(ctx, plan)
}

// applyReceiptPlan is ApplyReceiptPlan with the scan lock held.
func (s *Service) applyReceiptPlan(ctx context.Context, plan receipt.Plan) (ReceiptApplyResult, error) {
	r := &planRun{s: s, refs: map[string]int64{}, scanOf: map[string]string{}, index: map[string]int{}, uuids: map[string]string{}}
	for _, st := range plan.Steps {
		if st.Op.Kind == receipt.OpNewScan && st.Op.Ref != "" {
			r.scanOf[st.Op.Ref] = st.Op.UUID
		}
	}
	var undo []func(context.Context) error
	for i, st := range plan.Steps {
		comp, err := r.step(ctx, st)
		if err != nil {
			compErr := putBack(ctx, undo)
			if compErr != nil {
				s.publish()
			}
			return ReceiptApplyResult{}, &ReceiptApplyError{Step: i, Kind: st.Op.Kind, Err: err, Compensation: compErr,
				Results: r.restored}
		}
		if comp != nil {
			undo = append(undo, comp)
		}
	}
	if len(plan.Steps) > 0 {
		s.publish()
	}
	return ReceiptApplyResult{Results: r.results}, nil
}

// planRun is one plan's state: the Products made for each Ref, the plan's scan uuid for each Ref, and the Results so far.
type planRun struct {
	s       *Service
	refs    map[string]int64  // Ref -> the Product for it
	scanOf  map[string]string // Ref -> the uuid of the plan's new scan for it
	index   map[string]int    // client uuid -> its place in results
	uuids   map[string]string // a plan uuid -> the uuid this run writes it under (see resolveUUID)
	results []scan.Result
	// restored are the Results of the scans a put-back wrote (an undone scan applied again under a new uuid).
	restored []scan.Result
}

// errNoFreeUUID: every suffix of a plan uuid is taken by a put-back attempt (never expected; see resolveUUID).
var errNoFreeUUID = errors.New("receipt apply: no free uuid for a plan scan")

// resolveUUID is the uuid a plan scan is written under in this run. The plan's uuids come from the read, so a retry of
// an apply that went through finds its scans live ("duplicate": nothing is done twice). A plan uuid whose scan is there
// but undone was put back by an earlier attempt that failed; writing it again would answer "duplicate" and silently
// skip the scan, so this attempt writes under the next free suffix ("#2", "#3", ...), which a later retry finds live.
func (r *planRun) resolveUUID(ctx context.Context, u string) (string, error) {
	if v, ok := r.uuids[u]; ok {
		return v, nil
	}
	cand := u
	for k := 2; k <= 100; k++ {
		ev, ok, err := r.s.d.Ledger.Get(ctx, cand)
		if err != nil {
			return "", err
		}
		if !ok || ev.UndoneAt == "" {
			r.uuids[u] = cand
			return cand, nil
		}
		cand = fmt.Sprintf("%s#%d", u, k)
	}
	return "", errNoFreeUUID
}

// mapped is the uuid a plan uuid was written under in this run (itself when it was not, or is not a plan uuid).
func (r *planRun) mapped(u string) string {
	if v, ok := r.uuids[u]; ok {
		return v
	}
	return u
}

// putBack runs the compensations in reverse order, every one even after a failure, and joins their errors.
func putBack(ctx context.Context, undo []func(context.Context) error) error {
	ctx = context.WithoutCancel(ctx)
	var errs []error
	for i := len(undo) - 1; i >= 0; i-- {
		errs = append(errs, undo[i](ctx))
	}
	return errors.Join(errs...)
}

// step runs one plan step. It returns the step's compensation, or nil when the step did nothing in this run.
func (r *planRun) step(ctx context.Context, st receipt.Step) (func(context.Context) error, error) {
	switch st.Op.Kind {
	case receipt.OpNewScan:
		res, err := r.newScan(ctx, st.Op)
		if err != nil {
			return nil, err
		}
		r.putScan(res)
		if res.Status != scan.StatusApplied {
			return nil, nil
		}
		return r.inverse(st.Inverse), nil

	case receipt.OpUndo:
		res, err := r.s.undo(ctx, r.mapped(st.Op.UUID))
		if err != nil {
			return nil, err
		}
		if !res.Undone {
			return nil, nil // already undone: nothing to put back
		}
		return r.inverse(st.Inverse), nil

	case receipt.OpUpdateProduct:
		if err := r.exec(ctx, st.Op); err != nil {
			return nil, err
		}
		return r.inverse(st.Inverse), nil

	case receipt.OpCreateProduct:
		id, reused, err := r.createProduct(ctx, st.Op)
		if err != nil {
			return nil, err
		}
		r.refs[st.Op.Ref] = id
		if reused {
			return nil, nil
		}
		return r.inverse(st.Inverse), nil

	case receipt.OpSetPrices:
		res, before, err := r.setPrices(ctx, st.Op)
		if err != nil {
			return nil, err
		}
		if len(res) == 0 {
			return nil, nil
		}
		for _, x := range res {
			r.putPrice(x)
		}
		return func(ctx context.Context) error { return r.s.restorePrices(ctx, before) }, nil
	}
	return nil, fmt.Errorf("receipt apply: unknown step %q", st.Op.Kind)
}

// inverse is the compensation of a step: its inverse operation, run again.
func (r *planRun) inverse(op receipt.Op) func(context.Context) error {
	return func(ctx context.Context) error { return r.exec(ctx, op) }
}

// exec runs one operation of an inverse (or a correction): the operations the plan's steps use, against the same ports.
// A new scan only comes from an inverse (an Undo put back); its Result is kept in restored.
func (r *planRun) exec(ctx context.Context, op receipt.Op) error {
	switch op.Kind {
	case receipt.OpNewScan:
		res, err := r.newScan(ctx, op)
		if err == nil && res.Status == scan.StatusApplied {
			r.restored = append(r.restored, res)
		}
		return err
	case receipt.OpUndo:
		_, err := r.s.undo(ctx, r.mapped(op.UUID))
		return err
	case receipt.OpUpdateProduct:
		_, err := r.s.d.Catalogue.UpdateProduct(ctx, op.ProductID, ProductUpdate{Name: op.Name, PackSize: float64(op.PackSize)})
		return err
	case receipt.OpDeleteProduct:
		id, ok := r.refs[op.Ref]
		if !ok {
			return fmt.Errorf("receipt apply: no Product was made for %s", op.Ref)
		}
		return r.s.d.Catalogue.DeleteProduct(ctx, id)
	}
	return fmt.Errorf("receipt apply: no inverse operation %q", op.Kind)
}

// newScan is a new_scan step: a shop_scan at the target Shop, on the receipt's date at noon. A rejected Result fails it.
func (r *planRun) newScan(ctx context.Context, op receipt.Op) (scan.Result, error) {
	pid := op.ProductID
	if op.Ref != "" {
		id, ok := r.refs[op.Ref]
		if !ok {
			return scan.Result{}, fmt.Errorf("receipt apply: no Product was made for %s", op.Ref)
		}
		pid = id
	}
	uuid, err := r.resolveUUID(ctx, op.UUID)
	if err != nil {
		return scan.Result{}, err
	}
	shop := op.ShopID
	so := scan.Op{ClientUUID: uuid, ScannedAt: op.Date + "T12:00:00Z", Kind: scan.KindShopScan, ShopID: &shop,
		ProductID: pid, Quantity: op.Quantity}
	if op.PriceCents >= 0 {
		c := op.PriceCents
		so.PriceCents = &c
	}
	if op.PerKgCents >= 0 {
		k := op.PerKgCents
		so.PricePerKgCents = &k
	}
	res, err := r.s.apply(ctx, so)
	if err != nil {
		return scan.Result{}, err
	}
	if res.Status == scan.StatusRejected {
		msg := "scan rejected"
		if res.Error != nil {
			msg = "scan rejected: " + res.Error.Message
		}
		return scan.Result{}, errors.New(msg)
	}
	return res, nil
}

// createProduct is a create_product step. A Ref whose plan scan is already in the ledger reuses that scan's Product
// (reused is true, and nothing is made). Otherwise the Ingredient is found or created (with its kind) and the Product is
// created without a barcode.
func (r *planRun) createProduct(ctx context.Context, op receipt.Op) (id int64, reused bool, err error) {
	if planUUID, ok := r.scanOf[op.Ref]; ok {
		uuid, err := r.resolveUUID(ctx, planUUID)
		if err != nil {
			return 0, false, err
		}
		ev, found, err := r.s.d.Ledger.Get(ctx, uuid)
		if err != nil {
			return 0, false, err
		}
		if found && ev.ProductID != nil {
			return *ev.ProductID, true, nil
		}
	}
	if op.Ingredient == nil {
		return 0, false, fmt.Errorf("receipt apply: the Add %s has no Ingredient", op.Ref)
	}
	ingID := op.Ingredient.ID
	if n := op.Ingredient.New; n != nil {
		kind := ingredient.KindFood
		if k, ok := ingredient.ParseKind(n.Kind); ok {
			kind = k
		}
		if ingID, err = r.s.d.Ingredients.Ensure(ctx, strings.TrimSpace(n.Name), n.BaseUnit, kind); err != nil {
			return 0, false, err
		}
	}
	p, err := r.s.d.Catalogue.CreateProduct(ctx, NewProduct{Name: op.Name, IngredientID: ingID, PackSize: float64(op.PackSize)})
	if err != nil {
		return 0, false, err
	}
	return p.ID, false, nil
}

// setPrices is a set_prices step: one pack Price for all its scans. A per kg Price sets each scan's Price from its
// quantity, and the pack Price from one pack. The returned PricesBefore is what restorePrices puts back.
func (r *planRun) setPrices(ctx context.Context, op receipt.Op) ([]scan.Result, PricesBefore, error) {
	if len(op.Prices) == 0 {
		return nil, PricesBefore{}, nil
	}
	uuids := make([]string, len(op.Prices))
	for i, c := range op.Prices {
		uuids[i] = r.mapped(c.UUID)
	}
	first := op.Prices[0]
	in := SetPricesInput{ClientUUIDs: uuids, PriceCents: first.PriceCents}
	if first.PerKgCents >= 0 {
		ev, ok, err := r.s.d.Ledger.Get(ctx, uuids[0])
		if err != nil {
			return nil, PricesBefore{}, err
		}
		if !ok || ev.ProductID == nil {
			return nil, PricesBefore{}, ErrNotFound
		}
		p, err := r.s.d.Catalogue.Product(ctx, *ev.ProductID)
		if err != nil {
			return nil, PricesBefore{}, err
		}
		perKg := first.PerKgCents
		pack, ok := product.PriceForWeight(product.Price{PricePerKgCents: &perKg}, p.PackSize, units.Base(p.BaseUnit), p.PackSize)
		if !ok {
			return nil, PricesBefore{}, &scan.ValidationError{Field: "pricePerKgCents", Message: "the price per kg gives less than 1 cent for a pack"}
		}
		in.PriceCents, in.PricePerKgCents = pack, &perKg
	}
	return r.s.setPrices(ctx, in)
}

// putScan records a new_scan's Result; a later step's Result for the same uuid replaces it.
func (r *planRun) putScan(res scan.Result) {
	if i, ok := r.index[res.ClientUUID]; ok {
		r.results[i] = res
		return
	}
	r.index[res.ClientUUID] = len(r.results)
	r.results = append(r.results, res)
}

// putPrice records a set_prices Result: the latest price on an existing entry (keeping its status), else a new entry.
func (r *planRun) putPrice(res scan.Result) {
	if i, ok := r.index[res.ClientUUID]; ok {
		if res.Scan != nil && r.results[i].Scan != nil {
			r.results[i].Scan.PriceCents = res.Scan.PriceCents
		}
		return
	}
	r.index[res.ClientUUID] = len(r.results)
	r.results = append(r.results, res)
}
