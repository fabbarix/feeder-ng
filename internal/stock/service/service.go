// Package service orchestrates Stock: it loads and saves Stock Lots through the
// store, applies the pure rules of package stock, and publishes `stock` events.
// Ingredients and "today" come in through small interfaces so the service does
// not depend on the Ingredient or household modules.
package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

var (
	// ErrUnknownIngredient is returned (by Ingredients and the service) for an Ingredient that does not exist.
	ErrUnknownIngredient = errors.New("unknown ingredient")
	// ErrNotSpoiled is returned by ThrowOut and Keep for a lot that has not gone off.
	ErrNotSpoiled = errors.New("stock lot has not gone off")
	// ErrInvalid wraps every input validation failure (errors.Is); the message names the field.
	ErrInvalid = errors.New("invalid stock input")
)

// IngredientInfo is what Stock needs to know about an Ingredient.
type IngredientInfo struct {
	ID            int64
	Name          string
	BaseUnit      string // g, ml or piece
	ShelfLifeDays *int
	// FrozenShelfLifeDays is the Shelf Life in a Freezer (Storage Place of kind freezer); nil = no different.
	FrozenShelfLifeDays *int
	ImageURL            string // PE: "/api/images/<id>" of the Ingredient's Picture, "" without one
}

// Ingredients looks Ingredients up (adapter over the Ingredient store).
type Ingredients interface {
	// Ingredient returns ErrUnknownIngredient for an unknown id.
	Ingredient(ctx context.Context, id int64) (IngredientInfo, error)
}

// Today returns today's date in household time.
type Today func(ctx context.Context) (stock.Date, error)

// Publisher is satisfied by *events.Bus.
type Publisher interface{ Publish(topic string, data any) }

// Service is the Stock use-case layer.
type Service struct {
	st    *store.Store
	ing   Ingredients
	today Today
	pub   Publisher
}

// New returns a Service.
func New(st *store.Store, ing Ingredients, today Today, pub Publisher) *Service {
	return &Service{st: st, ing: ing, today: today, pub: pub}
}

// AddInput is a manual add or a scan. Purchased defaults to today; Source to manual.
type AddInput struct {
	IngredientID int64
	Quantity     float64 // Base Units, > 0
	Purchased    stock.Date
	Source       store.Source // manual or scan
	ProductID    *int64
	ShopID       *int64
	ClientUUID   string
	// StoragePlaceID puts the Lot in that Storage Place (and remembers it for the Ingredient); nil = where the
	// Ingredient was last put, else the default Storage Place, else none.
	StoragePlaceID *int64
}

// LotView is a Stock Lot with the Ingredient facts the screens need.
type LotView struct {
	store.StoredLot
	IngredientName string
	BaseUnit       string
	Spoiled        bool // GoesOff before today
	UseSoon        bool // GoesOff within stock.UseSoonDays
	// IngredientImageURL is the Ingredient's Picture ("" without one).
	IngredientImageURL string
	// ShelfLifeDays is the Shelf Life that applies where the Lot is (stock.ShelfLifeIn the Storage Place's kind:
	// the frozen one in a Freezer); nil = it does not spoil there. The Edit sheet suggests Good until from it.
	ShelfLifeDays *int
}

// IngredientStock is one Ingredient's Stock: the total and its soonest go-off date.
type IngredientStock struct {
	IngredientID int64
	Name         string
	BaseUnit     string
	Total        float64
	LotCount     int
	NextGoesOff  stock.Date // soonest go-off among its lots, None if no lot has one
	UseSoon      bool
	SpoiledCount int
	ImageURL     string
}

// Warning says Stock could not cover a Cooked meal's need for an Ingredient.
type Warning struct {
	IngredientID int64
	Name         string
	BaseUnit     string
	Have         float64 // Stock before the deduction
	Need         float64
	Shortfall    float64
	Message      string // stock.ShortfallMessage
}

// topic is the live-update topic every Stock change is published on.
const topic = "stock"

// Today is the household's calendar date now. The lots and spoiled responses
// carry it so the web app words go-off dates against the server's day, not the device's.
func (s *Service) Today(ctx context.Context) (stock.Date, error) { return s.today(ctx) }

// AddLot adds a Stock Lot. created is false when ClientUUID repeats an earlier scan.
func (s *Service) AddLot(ctx context.Context, in AddInput) (LotView, bool, error) {
	if !(in.Quantity > 0) || math.IsInf(in.Quantity, 0) {
		return LotView{}, false, invalid("quantity must be more than 0")
	}
	src := in.Source
	if src == "" {
		src = store.SourceManual
	}
	if src != store.SourceManual && src != store.SourceScan {
		return LotView{}, false, invalid("source must be manual or scan")
	}
	today, err := s.today(ctx)
	if err != nil {
		return LotView{}, false, err
	}
	purchased := in.Purchased
	if purchased == "" {
		purchased = today
	}
	if err := checkDate(purchased, "purchased"); err != nil {
		return LotView{}, false, err
	}
	if purchased > today {
		return LotView{}, false, invalid("purchased date cannot be in the future")
	}
	ing, err := s.ingredient(ctx, in.IngredientID)
	if err != nil {
		return LotView{}, false, err
	}
	place, err := s.placeFor(ctx, ing.ID, in.StoragePlaceID)
	if err != nil {
		return LotView{}, false, err
	}
	kind, placeID := stock.KindNone, (*int64)(nil)
	if place != nil {
		kind, placeID = place.Kind, &place.ID
	}
	planned := stock.NewLot(0, ing.ID, in.Quantity, purchased, stock.ShelfLifeIn(kind, ing.ShelfLifeDays, ing.FrozenShelfLifeDays))
	saved, created, err := s.st.AddLot(ctx, store.NewLot{
		StoragePlaceID: placeID,
		IngredientID:   ing.ID,
		Quantity:       in.Quantity,
		Purchased:      purchased,
		GoesOff:        planned.GoesOff,
		Source:         src,
		ProductID:      in.ProductID,
		ShopID:         in.ShopID,
		ClientUUID:     in.ClientUUID,
	})
	if errors.Is(err, store.ErrDuplicateUUID) {
		return LotView{}, false, invalid("clientUuid is already used for another Ingredient")
	}
	if err != nil {
		return LotView{}, false, err
	}
	if created && in.StoragePlaceID != nil {
		if err := s.st.RememberPlace(ctx, ing.ID, *in.StoragePlaceID); err != nil {
			return LotView{}, false, err
		}
	}
	if created {
		s.publish(map[string]any{"changed": "lots", "ingredientIds": []int64{ing.ID}})
	}
	return view(saved, ing, today), created, nil
}

// SetTotal is a Stock-take: it makes the Ingredient's Stock equal total (Base Units).
func (s *Service) SetTotal(ctx context.Context, ingredientID int64, total float64) (IngredientStock, error) {
	if math.IsNaN(total) || math.IsInf(total, 0) || total < 0 {
		return IngredientStock{}, invalid("total cannot be negative")
	}
	ing, err := s.ingredient(ctx, ingredientID)
	if err != nil {
		return IngredientStock{}, err
	}
	today, err := s.today(ctx)
	if err != nil {
		return IngredientStock{}, err
	}
	// An increase is a new Lot in the remembered Storage Place, so a Freezer's Shelf Life applies to it.
	place, err := s.st.RememberedPlace(ctx, ing.ID)
	if err != nil {
		return IngredientStock{}, err
	}
	shelfLife := ing.ShelfLifeDays
	if place != nil {
		shelfLife = stock.ShelfLifeIn(place.Kind, ing.ShelfLifeDays, ing.FrozenShelfLifeDays)
	}
	changed := false
	saved, err := s.st.Update(ctx, ing.ID, func(lots []stock.Lot) (store.Mutation, error) {
		res, err := stock.SetTotal(lots, ing.ID, total, today, shelfLife)
		if err != nil {
			return store.Mutation{}, invalid("total cannot be negative")
		}
		changed = len(res.Removed) > 0 || res.Added != nil
		return store.Mutation{Lots: res.Lots, NewSource: store.SourceStockTake, Today: today}, nil
	})
	if err != nil {
		return IngredientStock{}, err
	}
	if changed {
		s.publish(map[string]any{"changed": "lots", "ingredientIds": []int64{ing.ID}})
	}
	return summarise(ing, saved, today), nil
}

// RemoveLot deletes one Stock Lot whole: the Undo of a scan (store.ErrNotFound for an unknown lot).
func (s *Service) RemoveLot(ctx context.Context, lotID int64) error {
	lot, err := s.st.Lot(ctx, lotID)
	if err != nil {
		return err
	}
	if err := s.st.DeleteLot(ctx, lotID); err != nil {
		return err
	}
	s.publish(map[string]any{"changed": "lots", "ingredientIds": []int64{lot.IngredientID}})
	return nil
}

// EditLot corrects a Lot's quantity, purchase date and go-off date (stock.ValidateEdit with the Shelf Life that applies
// where the Lot is). A correction: no waste, no Keep, and a go-off record of the Lot is forgotten when its go-off date
// changes. Invalid input is ErrInvalid; an unknown Lot store.ErrNotFound.
func (s *Service) EditLot(ctx context.Context, lotID int64, edit stock.Edit) (LotView, error) {
	return LotView{}, errors.New("not implemented (b5-st)")
}

// DeleteLot deletes a Lot as a correction (a double Scan): the Lot leaves Stock, no waste is recorded and no go-off is
// kept, and its go-off record, if any, goes (like the Undo of a Scan). Publishes stock {"changed":"lots"}.
func (s *Service) DeleteLot(ctx context.Context, lotID int64) error {
	return errors.New("not implemented (b5-st)")
}

// Totals lists every Ingredient with Stock, those with spoiled or use-soon lots
// first, then by name.
func (s *Service) Totals(ctx context.Context) ([]IngredientStock, error) {
	today, err := s.today(ctx)
	if err != nil {
		return nil, err
	}
	all, err := s.st.Lots(ctx, 0)
	if err != nil {
		return nil, err
	}
	byIng := map[int64][]store.StoredLot{}
	var order []int64
	for _, l := range all {
		if _, ok := byIng[l.IngredientID]; !ok {
			order = append(order, l.IngredientID)
		}
		byIng[l.IngredientID] = append(byIng[l.IngredientID], l)
	}
	out := []IngredientStock{}
	for _, id := range order {
		ing, err := s.ingredient(ctx, id)
		if err != nil {
			return nil, err
		}
		out = append(out, summarise(ing, byIng[id], today))
	}
	sort.SliceStable(out, func(i, j int) bool {
		hi := func(x IngredientStock) bool { return x.UseSoon || x.SpoiledCount > 0 }
		if hi(out[i]) != hi(out[j]) {
			return hi(out[i])
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

// Lots lists the lots of one Ingredient (0 = all).
func (s *Service) Lots(ctx context.Context, ingredientID int64) ([]LotView, error) {
	today, err := s.today(ctx)
	if err != nil {
		return nil, err
	}
	stored, err := s.st.Lots(ctx, ingredientID)
	if err != nil {
		return nil, err
	}
	return s.views(ctx, stored, today)
}

// Spoiled lists the lots past their go-off date ("Throw out or keep?").
func (s *Service) Spoiled(ctx context.Context) ([]LotView, error) {
	today, err := s.today(ctx)
	if err != nil {
		return nil, err
	}
	stored, err := s.st.Lots(ctx, 0)
	if err != nil {
		return nil, err
	}
	byID := make(map[int64]store.StoredLot, len(stored))
	plain := make([]stock.Lot, 0, len(stored))
	for _, l := range stored {
		byID[l.ID] = l
		plain = append(plain, l.Lot)
	}
	var keep []store.StoredLot
	for _, l := range stock.Spoiled(plain, today) {
		keep = append(keep, byID[l.ID])
	}
	return s.views(ctx, keep, today)
}

// ThrowOut removes a spoiled lot and records the waste (reason spoiled, dated today).
func (s *Service) ThrowOut(ctx context.Context, lotID int64) (store.WasteRecord, error) {
	today, err := s.today(ctx)
	if err != nil {
		return store.WasteRecord{}, err
	}
	lot, err := s.spoiledLot(ctx, lotID, today)
	if err != nil {
		return store.WasteRecord{}, err
	}
	ingID := lot.IngredientID
	rec := store.WasteRecord{
		IngredientID: &ingID,
		Quantity:     lot.Quantity,
		WastedOn:     today,
		Reason:       store.ReasonSpoiled,
		LotID:        &lotID,
	}
	if lot.GoesOff.AddDays(1) > lot.KeptOn { // the go-off was not forgiven by a Keep
		rec.LotGoesOff = lot.GoesOff
	}
	_, err = s.st.Update(ctx, ingID, func(lots []stock.Lot) (store.Mutation, error) {
		var rest []stock.Lot
		found := false
		for _, l := range lots {
			if l.ID == lotID {
				found = true
				continue
			}
			rest = append(rest, l)
		}
		if !found {
			return store.Mutation{}, store.ErrNotFound
		}
		return store.Mutation{Lots: rest, Waste: []store.WasteRecord{rec}, Today: today}, nil
	})
	if err != nil {
		return store.WasteRecord{}, err
	}
	s.publish(map[string]any{"changed": "lots", "ingredientIds": []int64{ingID}})
	return s.wasteFor(ctx, lotID, today)
}

// Keep pushes a spoiled lot's go-off date out by 1 day from its existing go-off date.
func (s *Service) Keep(ctx context.Context, lotID int64) (LotView, error) {
	today, err := s.today(ctx)
	if err != nil {
		return LotView{}, err
	}
	lot, err := s.spoiledLot(ctx, lotID, today)
	if err != nil {
		return LotView{}, err
	}
	ing, err := s.ingredient(ctx, lot.IngredientID)
	if err != nil {
		return LotView{}, err
	}
	saved, err := s.st.Update(ctx, ing.ID, func(lots []stock.Lot) (store.Mutation, error) {
		out := make([]stock.Lot, 0, len(lots))
		found := false
		for _, l := range lots {
			if l.ID == lotID {
				found = true
				l = stock.KeepOn(l, today)
			}
			out = append(out, l)
		}
		if !found {
			return store.Mutation{}, store.ErrNotFound
		}
		return store.Mutation{Lots: out, Today: today}, nil
	})
	if err != nil {
		return LotView{}, err
	}
	s.publish(map[string]any{"changed": "lots", "ingredientIds": []int64{ing.ID}})
	for _, l := range saved {
		if l.ID == lotID {
			return view(l, ing, today), nil
		}
	}
	return LotView{}, store.ErrNotFound
}

// DeductForCooked takes needs (Base Units) out of Stock when a Planned Meal is
// Cooked. It never blocks: Stock floors at 0, unknown Ingredients and
// non-positive needs are skipped, and each uncovered need yields a Warning.
// The deduction runs in its own transaction across every Ingredient (all or
// nothing) and the `stock` event is published only after it commits.
func (s *Service) DeductForCooked(ctx context.Context, needs []stock.Need) ([]Warning, error) {
	todo, err := s.resolve(ctx, needs)
	if err != nil {
		return nil, err
	}
	tx, err := s.st.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	d, err := s.apply(ctx, tx, todo)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	s.PublishDeduction(d)
	return d.Warnings, nil
}

// Deduction is the outcome of DeductForCookedTx: the shortfall Warnings and the
// Ingredients whose Stock changed (their `stock` event is published later, see
// PublishDeduction).
type Deduction struct {
	Warnings             []Warning
	ChangedIngredientIDs []int64
}

// DeductForCookedTx is DeductForCooked inside the caller's transaction (Planning
// calls it in the same transaction that marks the Planned Meal Cooked). It
// begins, commits and publishes nothing: a failure anywhere returns the error
// and leaves the caller to roll tx back, so Stock is all-or-nothing across every
// Ingredient; a commit makes every deduction final. After a successful commit
// the caller calls PublishDeduction. Behaviour per need is that of DeductForCooked.
// Every Ingredient is resolved before the first write, so a lookup failure
// writes nothing.
func (s *Service) DeductForCookedTx(ctx context.Context, tx *sql.Tx, needs []stock.Need) (Deduction, error) {
	todo, err := s.resolve(ctx, needs)
	if err != nil {
		return Deduction{}, err
	}
	return s.apply(ctx, tx, todo)
}

// PublishDeduction publishes the `stock` event for a committed Deduction (only
// if some Stock changed). Call it after the caller's transaction commits, never before.
func (s *Service) PublishDeduction(d Deduction) {
	if len(d.ChangedIngredientIDs) > 0 {
		s.publish(map[string]any{"changed": "lots", "ingredientIds": d.ChangedIngredientIDs})
	}
}

// deduction is one resolved need: the Ingredient looked up and the need to take out.
type deduction struct {
	ing  IngredientInfo
	need stock.Need
}

// resolve looks up every Ingredient of the needs, skipping unknown Ingredients
// and non-positive needs. Any other lookup error is returned before anything is written.
func (s *Service) resolve(ctx context.Context, needs []stock.Need) ([]deduction, error) {
	var out []deduction
	for _, n := range needs {
		if !(n.Quantity > 0) || math.IsInf(n.Quantity, 0) {
			continue
		}
		ing, err := s.ingredient(ctx, n.IngredientID)
		if errors.Is(err, ErrUnknownIngredient) {
			continue
		}
		if err != nil {
			return nil, err
		}
		out = append(out, deduction{ing: ing, need: n})
	}
	return out, nil
}

// apply takes each resolved need out of its Ingredient's lots inside tx.
func (s *Service) apply(ctx context.Context, tx *sql.Tx, todo []deduction) (Deduction, error) {
	d := Deduction{Warnings: []Warning{}}
	if len(todo) == 0 {
		return d, nil
	}
	today, err := s.today(ctx)
	if err != nil {
		return Deduction{}, err
	}
	for _, t := range todo {
		var have, shortfall float64
		changed := false
		_, err := s.st.UpdateTx(ctx, tx, t.ing.ID, func(lots []stock.Lot) (store.Mutation, error) {
			have = stock.Total(lots)
			res := stock.Deduct(lots, t.need.Quantity)
			shortfall = res.Shortfall
			changed = len(res.Taken) > 0
			return store.Mutation{Lots: res.Lots, Today: today}, nil
		})
		if err != nil {
			return Deduction{}, err
		}
		if changed {
			d.ChangedIngredientIDs = append(d.ChangedIngredientIDs, t.ing.ID)
		}
		if shortfall > 0 {
			d.Warnings = append(d.Warnings, Warning{
				IngredientID: t.ing.ID,
				Name:         t.ing.Name,
				BaseUnit:     t.ing.BaseUnit,
				Have:         have,
				Need:         t.need.Quantity,
				Shortfall:    shortfall,
				Message:      stock.ShortfallMessage(t.ing.Name, t.ing.BaseUnit, have, t.need.Quantity),
			})
		}
	}
	return d, nil
}

// Projected returns the current lots per Ingredient in consumption order.
func (s *Service) Projected(ctx context.Context) (stock.ProjectedStock, error) {
	stored, err := s.st.Lots(ctx, 0)
	if err != nil {
		return nil, err
	}
	plain := make([]stock.Lot, 0, len(stored))
	for _, l := range stored {
		plain = append(plain, l.Lot)
	}
	return stock.Project(plain), nil
}

// RecordWaste records waste directly (Planning: discarded Leftovers, reason leftover_discarded).
func (s *Service) RecordWaste(ctx context.Context, in store.WasteRecord) (store.WasteRecord, error) {
	in, err := s.checkWaste(ctx, in)
	if err != nil {
		return store.WasteRecord{}, err
	}
	rec, err := s.st.AddWaste(ctx, in)
	if err != nil {
		return store.WasteRecord{}, err
	}
	s.publish(map[string]any{"changed": "waste"})
	return rec, nil
}

// RecordWasteTx is RecordWaste inside the caller's transaction (Planning records the waste of a discarded
// Leftover in the same transaction as the discard). It publishes nothing: the caller publishes after its commit.
func (s *Service) RecordWasteTx(ctx context.Context, tx *sql.Tx, in store.WasteRecord) (store.WasteRecord, error) {
	in, err := s.checkWaste(ctx, in)
	if err != nil {
		return store.WasteRecord{}, err
	}
	return s.st.AddWasteTx(ctx, tx, in)
}

// checkWaste validates a waste record and fills its date (today when unset).
func (s *Service) checkWaste(ctx context.Context, in store.WasteRecord) (store.WasteRecord, error) {
	if math.IsNaN(in.Quantity) || math.IsInf(in.Quantity, 0) || in.Quantity < 0 {
		return store.WasteRecord{}, invalid("waste quantity cannot be negative")
	}
	if in.Reason != store.ReasonSpoiled && in.Reason != store.ReasonLeftoverDiscarded {
		return store.WasteRecord{}, invalid("reason must be spoiled or leftover_discarded")
	}
	today, err := s.today(ctx)
	if err != nil {
		return store.WasteRecord{}, err
	}
	if in.WastedOn == "" {
		in.WastedOn = today
	}
	if err := checkDate(in.WastedOn, "wastedOn"); err != nil {
		return store.WasteRecord{}, err
	}
	if in.IngredientID != nil {
		if _, err := s.ingredient(ctx, *in.IngredientID); err != nil {
			return store.WasteRecord{}, err
		}
	}
	return in, nil
}

// ProjectedTx is Projected inside the caller's transaction (see store.LotsTx).
func (s *Service) ProjectedTx(ctx context.Context, tx *sql.Tx) (stock.ProjectedStock, error) {
	stored, err := s.st.LotsTx(ctx, tx)
	if err != nil {
		return nil, err
	}
	plain := make([]stock.Lot, 0, len(stored))
	for _, l := range stored {
		plain = append(plain, l.Lot)
	}
	return stock.Project(plain), nil
}

// Waste lists waste records with a date in [from, to] (empty bound = open).
func (s *Service) Waste(ctx context.Context, from, to stock.Date) ([]store.WasteRecord, error) {
	return s.st.Waste(ctx, from, to)
}

// ingredient looks an Ingredient up, returning ErrUnknownIngredient for a missing one.
func (s *Service) ingredient(ctx context.Context, id int64) (IngredientInfo, error) {
	ing, err := s.ing.Ingredient(ctx, id)
	if err != nil {
		if errors.Is(err, ErrUnknownIngredient) {
			return IngredientInfo{}, ErrUnknownIngredient
		}
		return IngredientInfo{}, err
	}
	return ing, nil
}

// spoiledLot loads a lot and checks it has gone off: ErrNotFound, or ErrNotSpoiled.
func (s *Service) spoiledLot(ctx context.Context, lotID int64, today stock.Date) (store.StoredLot, error) {
	lot, err := s.st.Lot(ctx, lotID)
	if err != nil {
		return store.StoredLot{}, err
	}
	if !stock.IsSpoiled(lot.Lot, today) {
		return store.StoredLot{}, ErrNotSpoiled
	}
	return lot, nil
}

// wasteFor finds the waste record written for a lot thrown out today.
func (s *Service) wasteFor(ctx context.Context, lotID int64, today stock.Date) (store.WasteRecord, error) {
	recs, err := s.st.Waste(ctx, today, today)
	if err != nil {
		return store.WasteRecord{}, err
	}
	for i := len(recs) - 1; i >= 0; i-- {
		if recs[i].LotID != nil && *recs[i].LotID == lotID && recs[i].Reason == store.ReasonSpoiled {
			return recs[i], nil
		}
	}
	return store.WasteRecord{}, store.ErrNotFound
}

// views decorates lots with their Ingredient facts. Ingredients are looked up once each.
func (s *Service) views(ctx context.Context, stored []store.StoredLot, today stock.Date) ([]LotView, error) {
	ings := map[int64]IngredientInfo{}
	out := make([]LotView, 0, len(stored))
	for _, l := range stored {
		ing, ok := ings[l.IngredientID]
		if !ok {
			var err error
			if ing, err = s.ingredient(ctx, l.IngredientID); err != nil {
				return nil, err
			}
			ings[l.IngredientID] = ing
		}
		out = append(out, view(l, ing, today))
	}
	return out, nil
}

func view(l store.StoredLot, ing IngredientInfo, today stock.Date) LotView {
	return LotView{
		StoredLot:          l,
		IngredientName:     ing.Name,
		BaseUnit:           ing.BaseUnit,
		Spoiled:            stock.IsSpoiled(l.Lot, today),
		UseSoon:            stock.IsUseSoon(l.Lot, today),
		IngredientImageURL: ing.ImageURL,
	}
}

// summarise builds one Ingredient's Stock from its lots (none = empty Stock).
func summarise(ing IngredientInfo, lots []store.StoredLot, today stock.Date) IngredientStock {
	out := IngredientStock{IngredientID: ing.ID, Name: ing.Name, BaseUnit: ing.BaseUnit, ImageURL: ing.ImageURL}
	for _, l := range lots {
		out.Total += l.Quantity
		out.LotCount++
		if l.GoesOff.IsNone() {
			continue
		}
		if out.NextGoesOff.IsNone() || l.GoesOff < out.NextGoesOff {
			out.NextGoesOff = l.GoesOff
		}
		switch {
		case stock.IsSpoiled(l.Lot, today):
			out.SpoiledCount++
		case stock.IsUseSoon(l.Lot, today):
			out.UseSoon = true
		}
	}
	return out
}

func (s *Service) publish(data any) { s.pub.Publish(topic, data) }

// invalid wraps ErrInvalid with a message for the client.
func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, args...))
}

// checkDate requires a strict YYYY-MM-DD date.
func checkDate(d stock.Date, field string) error {
	t, err := time.Parse("2006-01-02", string(d))
	if err != nil || t.Format("2006-01-02") != string(d) {
		return invalid("%s must be a date as YYYY-MM-DD", field)
	}
	return nil
}

// placeFor is the Storage Place a new Lot goes to: the one asked for (it must exist), else the remembered one.
func (s *Service) placeFor(ctx context.Context, ingredientID int64, asked *int64) (*store.StoragePlace, error) {
	if asked == nil {
		return s.st.RememberedPlace(ctx, ingredientID)
	}
	p, err := s.st.StoragePlace(ctx, *asked)
	if errors.Is(err, store.ErrPlaceNotFound) {
		return nil, invalid("storagePlaceId names no Storage Place")
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// StoragePlaces lists the Storage Places by name.
func (s *Service) StoragePlaces(ctx context.Context) ([]store.StoragePlace, error) {
	return s.st.StoragePlaces(ctx)
}

// CreateStoragePlace adds a Storage Place (any User).
func (s *Service) CreateStoragePlace(ctx context.Context, name string, kind stock.Kind, def bool) (store.StoragePlace, error) {
	p, err := s.st.CreateStoragePlace(ctx, name, kind, def)
	if err == nil {
		s.publish(map[string]any{"changed": "storagePlaces"})
	}
	return p, err
}

// UpdateStoragePlace renames it, changes its kind or its default flag.
func (s *Service) UpdateStoragePlace(ctx context.Context, id int64, p store.PlacePatch) (store.StoragePlace, error) {
	out, err := s.st.UpdateStoragePlace(ctx, id, p)
	if err == nil {
		s.publish(map[string]any{"changed": "storagePlaces"})
	}
	return out, err
}

// DeleteStoragePlace removes it; its Lots stay in Stock, not sorted.
func (s *Service) DeleteStoragePlace(ctx context.Context, id int64) error {
	err := s.st.DeleteStoragePlace(ctx, id)
	if err == nil {
		s.publish(map[string]any{"changed": "storagePlaces"})
	}
	return err
}

// MoveLot moves a Stock Lot, or quantity of it (0 = all), to a Storage Place. Its go-off date follows
// stock.GoOffAfterMove: into a Freezer it restarts on the frozen Shelf Life, out of one on the ordinary Shelf Life.
func (s *Service) MoveLot(ctx context.Context, lotID, placeID int64, quantity float64) (LotView, error) {
	if math.IsNaN(quantity) || math.IsInf(quantity, 0) || quantity < 0 {
		return LotView{}, invalid("quantity cannot be negative")
	}
	lot, err := s.st.Lot(ctx, lotID)
	if err != nil {
		return LotView{}, err
	}
	if quantity > lot.Quantity+1e-9 {
		return LotView{}, invalid("cannot move more than the Lot holds")
	}
	to, err := s.st.StoragePlace(ctx, placeID)
	if errors.Is(err, store.ErrPlaceNotFound) {
		return LotView{}, invalid("storagePlaceId names no Storage Place")
	}
	if err != nil {
		return LotView{}, err
	}
	from := stock.KindNone
	if lot.StoragePlaceID != nil {
		if p, err := s.st.StoragePlace(ctx, *lot.StoragePlaceID); err == nil {
			from = p.Kind
		}
	}
	ing, err := s.ingredient(ctx, lot.IngredientID)
	if err != nil {
		return LotView{}, err
	}
	today, err := s.today(ctx)
	if err != nil {
		return LotView{}, err
	}
	goesOff := stock.GoOffAfterMove(lot.GoesOff, from, to.Kind, today, ing.ShelfLifeDays, ing.FrozenShelfLifeDays)
	moved, err := s.st.MoveLot(ctx, store.Move{LotID: lotID, PlaceID: placeID, Quantity: quantity, GoesOff: goesOff})
	if err != nil {
		return LotView{}, err
	}
	s.publish(map[string]any{"changed": "lots", "ingredientIds": []int64{ing.ID}})
	return view(moved, ing, today), nil
}
