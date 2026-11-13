package service

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/store"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// SetPricesInput is one price for the scans of one row (the same Product at the same Shop).
type SetPricesInput struct {
	ClientUUIDs []string
	// PriceCents is the pack Price, more than 0. It is required, also with PricePerKgCents.
	PriceCents int
	// PricePerKgCents is per kg (Product in g) or per l (Product in ml), more than 0. Each scan then costs its quantity
	// at that price, rounded half up. Refused on a Product in pieces. Without it each scan costs PriceCents.
	PricePerKgCents *int
}

// SetPrices sets the Price of several scans of one row (PATCH /api/scan/prices). It returns one Result per distinct
// uuid, in the order sent. Every check runs before the first write, and on an error after it the writes are put back:
// on any error nothing changes. There is one Price row per Shop and day of the scans; a day's per kg is kept when no
// PricePerKgCents is sent. It takes the scan lock; the receipt Apply, which holds it, calls setPrices.
func (s *Service) SetPrices(ctx context.Context, in SetPricesInput) ([]scan.Result, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out, _, err := s.setPrices(ctx, in)
	if err != nil {
		return nil, err
	}
	s.publish()
	return out, nil
}

// The day's Prices (product store) and the scans' prices (scan ledger) are two writes, not one transaction (ADR 0018
// decision 8: the ports take no *sql.Tx). The scan write is one transaction; a failure of it puts the day's Prices back.
// The gap left: a crash between the two writes, or a failed put-back, leaves a day's Price at the new value while its
// scans keep theirs. Recording a Price is an upsert per Product, Shop and day, so retrying the same call converges.

// PricesBefore is what one setPrices changed, as it was before: restorePrices puts it back (the receipt Apply's inverse
// of a set of Prices, and setPrices' own compensation).
type PricesBefore struct {
	Events []store.EventPrice
	Days   []DayPriceBefore
}

// DayPriceBefore is a Shop's Price of a Product on a day before setPrices wrote it: Before nil means there was none, and
// restoring deletes the row setPrices wrote (WrittenID).
type DayPriceBefore struct {
	ProductID, ShopID int64
	Date              stock.Date
	Before            *PriceInfo
	WrittenID         int64
}

// setPrices is SetPrices with the scan lock held. It also returns what it changed, for restorePrices, and publishes
// nothing: the caller publishes once (the receipt Apply at the end of its plan).
func (s *Service) setPrices(ctx context.Context, in SetPricesInput) ([]scan.Result, PricesBefore, error) {
	uuids := distinct(in.ClientUUIDs)
	if len(uuids) == 0 {
		return nil, PricesBefore{}, &scan.ValidationError{Field: "clientUuids", Message: "at least one scan is required"}
	}
	if in.PriceCents <= 0 {
		return nil, PricesBefore{}, &scan.ValidationError{Field: "priceCents", Message: "a price must be more than 0"}
	}
	if in.PricePerKgCents != nil && *in.PricePerKgCents <= 0 {
		return nil, PricesBefore{}, &scan.ValidationError{Field: "pricePerKgCents", Message: "a price per kg must be more than 0"}
	}

	events, err := s.pricedScans(ctx, uuids)
	if err != nil {
		return nil, PricesBefore{}, err
	}
	shop, pid := *events[0].ShopID, *events[0].ProductID
	p, err := s.d.Catalogue.Product(ctx, pid)
	if errors.Is(err, ErrProductGone) {
		return nil, PricesBefore{}, ErrNotFound
	}
	if err != nil {
		return nil, PricesBefore{}, err
	}
	base := units.Base(p.BaseUnit)
	if in.PricePerKgCents != nil && base == units.Piece {
		return nil, PricesBefore{}, &scan.ValidationError{Field: "pricePerKgCents", Message: "a Product in pieces has no price per kg"}
	}

	today, _, err := s.household(ctx)
	if err != nil {
		return nil, PricesBefore{}, err
	}
	dates := make([]stock.Date, len(events))
	for i, ev := range events {
		if dates[i], err = s.scanDate(ctx, ev.ScannedAt, today); err != nil {
			return nil, PricesBefore{}, err
		}
	}
	// Each day's Price as it is (copied: recording overwrites the same-day row in place), and the day's per kg: the one
	// sent, else the one the day already has.
	var days []DayPriceBefore
	dayIndex := map[stock.Date]int{}
	dayPerKg := map[stock.Date]*int{}
	for _, d := range dates {
		if _, seen := dayIndex[d]; seen {
			continue
		}
		existing, err := s.d.Catalogue.PriceOn(ctx, pid, shop, d)
		if err != nil {
			return nil, PricesBefore{}, err
		}
		var before *PriceInfo
		if existing != nil {
			before = &PriceInfo{ID: existing.ID, Date: existing.Date, PriceCents: copyInt(existing.PriceCents),
				PricePerKgCents: copyInt(existing.PricePerKgCents)}
		}
		dayIndex[d] = len(days)
		days = append(days, DayPriceBefore{ProductID: pid, ShopID: shop, Date: d, Before: before})
		dayPerKg[d] = copyInt(in.PricePerKgCents)
		if in.PricePerKgCents == nil && before != nil {
			dayPerKg[d] = copyInt(before.PricePerKgCents)
		}
	}
	cents := make([]int, len(events))
	for i, ev := range events {
		cents[i] = in.PriceCents
		if in.PricePerKgCents == nil {
			continue
		}
		c, ok := product.PriceForWeight(product.Price{PricePerKgCents: in.PricePerKgCents}, p.PackSize, base, ev.Quantity)
		if !ok {
			return nil, PricesBefore{}, &scan.ValidationError{Field: "pricePerKgCents", Message: "the price per kg gives less than 1 cent for a scan"}
		}
		cents[i] = c
	}

	// All checks passed: the writes start here. A failure puts back what was written (best effort, as purchase does).
	undo := PricesBefore{}
	fail := func(err error) ([]scan.Result, PricesBefore, error) {
		_ = s.restorePrices(context.WithoutCancel(ctx), undo)
		return nil, PricesBefore{}, err
	}
	baseline := map[stock.Date]*string{}
	for i := range days {
		d := &days[i]
		pack := in.PriceCents
		rec, err := s.d.Catalogue.RecordPrice(ctx, pid, PriceInput{ShopID: shop, Date: d.Date, PriceCents: &pack, PricePerKgCents: dayPerKg[d.Date]})
		if err != nil {
			return fail(err)
		}
		d.WrittenID = rec.ID
		undo.Days = append(undo.Days, *d)
		// The scans that now refer to the day's Price share what it was before the first of them wrote it, so an Undo
		// of one of them leaves it to the others and the last one puts that back (see Undo).
		prev, shared, err := s.d.Ledger.SharedPrice(ctx, rec.ID, "")
		if err != nil {
			return fail(err)
		}
		if !shared {
			prev = snapshotJSON(d.Before)
		}
		baseline[d.Date] = &prev
	}
	updates := make([]store.PriceUpdate, len(events))
	for i, ev := range events {
		id := days[dayIndex[dates[i]]].WrittenID
		u := store.PriceUpdate{ClientUUID: ev.ClientUUID, Cents: cents[i], PriceID: &id}
		if ev.PriceID == nil || *ev.PriceID != id {
			u.PrevPriceJSON = baseline[dates[i]]
		}
		updates[i] = u
		undo.Events = append(undo.Events, ev.PriceState())
	}
	if err := s.d.Ledger.UpdatePrices(ctx, updates); err != nil {
		undo.Events = nil // the transaction rolled back
		switch {
		case errors.Is(err, store.ErrNotFound):
			err = ErrNotFound
		case errors.Is(err, store.ErrUndone):
			err = ErrAlreadyUndone
		}
		return fail(err)
	}

	out := make([]scan.Result, len(events))
	for i, ev := range events {
		var res scan.Result
		if err := json.Unmarshal([]byte(ev.ResultJSON), &res); err != nil {
			return fail(err)
		}
		res.Status, res.Error = scan.StatusApplied, nil
		if res.Scan != nil {
			c := cents[i]
			res.Scan.PriceCents = &c
		}
		out[i] = res
	}
	return out, undo, nil
}

// restorePrices puts back what one setPrices changed: each scan's price, Price row and replaced Price, then each day's
// Price (re-recorded, or deleted when the day had none). It runs every step and returns the errors joined.
func (s *Service) restorePrices(ctx context.Context, b PricesBefore) error {
	var errs []error
	if len(b.Events) > 0 {
		errs = append(errs, s.d.Ledger.RestorePrices(ctx, b.Events))
	}
	for i := len(b.Days) - 1; i >= 0; i-- {
		d := b.Days[i]
		if d.Before == nil {
			errs = append(errs, s.d.Catalogue.DeletePrice(ctx, d.WrittenID))
			continue
		}
		_, err := s.d.Catalogue.RecordPrice(ctx, d.ProductID, PriceInput{ShopID: d.ShopID, Date: d.Date,
			PriceCents: copyInt(d.Before.PriceCents), PricePerKgCents: copyInt(d.Before.PricePerKgCents)})
		errs = append(errs, err)
	}
	return errors.Join(errs...)
}

// snapshotJSON is a day's Price as prev_price_json keeps it ("" for none).
func snapshotJSON(p *PriceInfo) string {
	if p == nil {
		return ""
	}
	b, _ := json.Marshal(priceSnapshot{Date: p.Date, PriceCents: p.PriceCents, PricePerKgCents: p.PricePerKgCents})
	return string(b)
}

// pricedScans loads the scans to price, in the order given. Each must exist, be a Shop scan and not be undone, and all of
// them must be at the same Shop and of the same Product.
func (s *Service) pricedScans(ctx context.Context, uuids []string) ([]store.Event, error) {
	events := make([]store.Event, 0, len(uuids))
	for _, u := range uuids {
		ev, ok, err := s.d.Ledger.Get(ctx, u)
		if err != nil {
			return nil, err
		}
		switch {
		case !ok:
			return nil, ErrNotFound
		case ev.Kind == string(scan.KindStockTake) || ev.ProductID == nil || ev.ShopID == nil:
			return nil, ErrNotUndoable
		case ev.UndoneAt != "":
			return nil, ErrAlreadyUndone
		}
		events = append(events, ev)
	}
	for _, ev := range events[1:] {
		if *ev.ShopID != *events[0].ShopID || *ev.ProductID != *events[0].ProductID {
			return nil, &scan.ValidationError{Field: "clientUuids", Message: "the scans must be of one Product at one Shop"}
		}
	}
	return events, nil
}

// distinct keeps the first of each uuid, in order.
func distinct(in []string) []string {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, u := range in {
		if !seen[u] {
			seen[u] = true
			out = append(out, u)
		}
	}
	return out
}
