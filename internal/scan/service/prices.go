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

// SetPrices sets the Price of several scans of one row (PATCH /api/scan/prices, and the receipt Apply). It returns one
// Result per distinct uuid, in the order sent. Every check runs before the first write: on any error nothing changes.
// There is one Price row per Shop and day of the scans; a day's per kg is kept when no PricePerKgCents is sent.
func (s *Service) SetPrices(ctx context.Context, in SetPricesInput) ([]scan.Result, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	uuids := distinct(in.ClientUUIDs)
	if len(uuids) == 0 {
		return nil, &scan.ValidationError{Field: "clientUuids", Message: "at least one scan is required"}
	}
	if in.PriceCents <= 0 {
		return nil, &scan.ValidationError{Field: "priceCents", Message: "a price must be more than 0"}
	}
	if in.PricePerKgCents != nil && *in.PricePerKgCents <= 0 {
		return nil, &scan.ValidationError{Field: "pricePerKgCents", Message: "a price per kg must be more than 0"}
	}

	events, err := s.pricedScans(ctx, uuids)
	if err != nil {
		return nil, err
	}
	shop, pid := *events[0].ShopID, *events[0].ProductID
	p, err := s.d.Catalogue.Product(ctx, pid)
	if errors.Is(err, ErrProductGone) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	base := units.Base(p.BaseUnit)
	if in.PricePerKgCents != nil && base == units.Piece {
		return nil, &scan.ValidationError{Field: "pricePerKgCents", Message: "a Product in pieces has no price per kg"}
	}

	today, _, err := s.household(ctx)
	if err != nil {
		return nil, err
	}
	dates := make([]stock.Date, len(events))
	for i, ev := range events {
		if dates[i], err = s.scanDate(ctx, ev.ScannedAt, today); err != nil {
			return nil, err
		}
	}
	// Each day's Price as it is (as prev_price_json keeps it), and the day's per kg: the one sent, else the one the day
	// already has.
	var days []stock.Date
	dayPerKg := map[stock.Date]*int{}
	dayBefore := map[stock.Date]string{}
	for _, d := range dates {
		if _, seen := dayPerKg[d]; seen {
			continue
		}
		days = append(days, d)
		existing, err := s.d.Catalogue.PriceOn(ctx, pid, shop, d)
		if err != nil {
			return nil, err
		}
		dayBefore[d] = snapshotJSON(existing)
		dayPerKg[d] = copyInt(in.PricePerKgCents)
		if in.PricePerKgCents == nil && existing != nil {
			dayPerKg[d] = copyInt(existing.PricePerKgCents)
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
			return nil, &scan.ValidationError{Field: "pricePerKgCents", Message: "the price per kg gives less than 1 cent for a scan"}
		}
		cents[i] = c
	}

	// All checks passed: the writes start here.
	priceIDs := map[stock.Date]int64{}
	baseline := map[stock.Date]*string{}
	for _, d := range days {
		pack := in.PriceCents
		rec, err := s.d.Catalogue.RecordPrice(ctx, pid, PriceInput{ShopID: shop, Date: d, PriceCents: &pack, PricePerKgCents: dayPerKg[d]})
		if err != nil {
			return nil, err
		}
		priceIDs[d] = rec.ID
		// The scans that now refer to the day's Price share what it was before the first of them wrote it, so an Undo
		// of one of them leaves it to the others and the last one puts that back (see Undo).
		prev, shared, err := s.d.Ledger.SharedPrice(ctx, rec.ID, "")
		if err != nil {
			return nil, err
		}
		if !shared {
			prev = dayBefore[d]
		}
		baseline[d] = &prev
	}
	updates := make([]store.PriceUpdate, len(events))
	for i, ev := range events {
		id := priceIDs[dates[i]]
		u := store.PriceUpdate{ClientUUID: ev.ClientUUID, Cents: cents[i], PriceID: &id}
		if ev.PriceID == nil || *ev.PriceID != id {
			u.PrevPriceJSON = baseline[dates[i]]
		}
		updates[i] = u
	}
	if err := s.d.Ledger.UpdatePrices(ctx, updates); err != nil {
		return nil, err
	}

	out := make([]scan.Result, len(events))
	for i, ev := range events {
		var res scan.Result
		if err := json.Unmarshal([]byte(ev.ResultJSON), &res); err != nil {
			return nil, err
		}
		res.Status, res.Error = scan.StatusApplied, nil
		if res.Scan != nil {
			c := cents[i]
			res.Scan.PriceCents = &c
		}
		out[i] = res
	}
	s.publish()
	return out, nil
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
