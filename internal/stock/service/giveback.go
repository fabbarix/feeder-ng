package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"sort"

	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

// B9-05 (SAFE-03, SAFE-09, SSP-01, SSP-10, SSP-17): Stock give-back, the Undo of a Throw out, AdjustLot, MoveMany,
// KeepUntil and the Stock-take that says what it took.

var (
	// ErrNotUndoable is returned by UndoThrowOut for a waste record with no Lot to put back (a discarded Leftover, or
	// waste recorded before migration 1572). The API answers 409 not_undoable.
	ErrNotUndoable = errors.New("stock: this waste cannot be undone")
	// ErrUndoWindowOver is returned by UndoThrowOut for waste recorded on an earlier household day (409 undo_window_over).
	ErrUndoWindowOver = errors.New("stock: it is too late to undo this waste")
)

// LotTake is what an action took from one Stock Lot: the Lot as it was before (with its Storage Place, Product and Shop)
// and the quantity taken. It is what Planning's cooked_takes and the Scan ledger keep (as JSON) for Undo.
type LotTake struct {
	Lot   store.StoredLot
	Taken float64
}

// GiveBackOutcome says what GiveBackTx did.
type GiveBackOutcome struct {
	IngredientIDs []int64 // Ingredients whose Stock changed, ascending
	Restored      []int64 // Lot ids that got Stock back
	Gone          []int64 // Lot ids that were gone since, so their Stock was not put back
}

// GiveBackTx puts back what takes took, inside the caller's transaction (stock.GiveBack per Ingredient): a Lot that
// still exists gets the quantity back, an emptied Lot is put back whole with its id, dates and Storage Place, and a Lot
// deleted since is reported Gone. The Lots of an Ingredient that no longer exists are Gone too. It publishes nothing
// (PublishGiveBack does, after the caller commits).
func (s *Service) GiveBackTx(ctx context.Context, tx *sql.Tx, takes []LotTake) (GiveBackOutcome, error) {
	var out GiveBackOutcome
	byIng := map[int64][]LotTake{}
	var order []int64
	for _, t := range takes {
		if !(t.Taken > 0) || math.IsInf(t.Taken, 0) {
			continue
		}
		id := t.Lot.IngredientID
		if _, ok := byIng[id]; !ok {
			order = append(order, id)
		}
		byIng[id] = append(byIng[id], t)
	}
	for _, ingID := range order {
		group := byIng[ingID]
		if _, err := s.ingredient(ctx, ingID); errors.Is(err, ErrUnknownIngredient) {
			for _, t := range group {
				out.Gone = appendOnce(out.Gone, t.Lot.ID)
			}
			continue
		} else if err != nil {
			return GiveBackOutcome{}, err
		}
		current, err := s.st.LotsOfTx(ctx, tx, ingID)
		if err != nil {
			return GiveBackOutcome{}, err
		}
		plain := make([]stock.Lot, len(current))
		exists := make(map[int64]bool, len(current))
		for i, l := range current {
			plain[i] = l.Lot
			exists[l.ID] = true
		}
		before := make(map[int64]store.StoredLot, len(group))
		pure := make([]stock.Take, 0, len(group))
		for _, t := range group {
			if _, ok := before[t.Lot.ID]; !ok {
				before[t.Lot.ID] = t.Lot
			}
			pure = append(pure, stock.Take{Before: t.Lot.Lot, Taken: t.Taken})
		}
		res := stock.GiveBack(plain, pure)
		// Lots put back whole go in first, with their own ids, so the update below finds every Lot it names.
		for _, l := range res.Lots {
			if exists[l.ID] {
				continue
			}
			back := before[l.ID]
			back.Lot = l
			if _, err := s.st.RestoreLotTx(ctx, tx, back); err != nil {
				return GiveBackOutcome{}, err
			}
		}
		if len(res.Restored) > 0 {
			if _, err := s.st.UpdateTx(ctx, tx, ingID, func([]stock.Lot) (store.Mutation, error) {
				return store.Mutation{Lots: res.Lots}, nil
			}); err != nil {
				return GiveBackOutcome{}, err
			}
			out.IngredientIDs = append(out.IngredientIDs, ingID)
		}
		out.Restored = append(out.Restored, res.Restored...)
		out.Gone = append(out.Gone, res.Gone...)
	}
	sort.Slice(out.IngredientIDs, func(i, j int) bool { return out.IngredientIDs[i] < out.IngredientIDs[j] })
	return out, nil
}

// GiveBack is GiveBackTx in its own transaction, publishing one stock event when something was restored.
func (s *Service) GiveBack(ctx context.Context, takes []LotTake) (GiveBackOutcome, error) {
	tx, err := s.st.Begin(ctx)
	if err != nil {
		return GiveBackOutcome{}, err
	}
	defer func() { _ = tx.Rollback() }()
	out, err := s.GiveBackTx(ctx, tx, takes)
	if err != nil {
		return GiveBackOutcome{}, err
	}
	if err := tx.Commit(); err != nil {
		return GiveBackOutcome{}, err
	}
	s.PublishGiveBack(out)
	return out, nil
}

// PublishGiveBack publishes one stock event for what GiveBackTx restored; nothing when nothing was.
func (s *Service) PublishGiveBack(o GiveBackOutcome) {
	if len(o.Restored) == 0 || len(o.IngredientIDs) == 0 {
		return
	}
	s.publish(map[string]any{"changed": "lots", "ingredientIds": o.IngredientIDs})
}

// UndoThrowOut puts a thrown-out Lot back (same id, dates, Kept on and Storage Place) and removes its waste record, in
// one transaction, so the zero-waste streak comes back. Only on the household day of the Throw out
// (ErrUndoWindowOver after); a waste record with no Lot to put back is ErrNotUndoable; an unknown or already undone
// one is store.ErrNotFound.
func (s *Service) UndoThrowOut(ctx context.Context, wasteID int64) (LotView, error) {
	today, err := s.today(ctx)
	if err != nil {
		return LotView{}, err
	}
	tx, err := s.st.Begin(ctx)
	if err != nil {
		return LotView{}, err
	}
	defer func() { _ = tx.Rollback() }()
	rec, err := s.st.WasteTx(ctx, tx, wasteID)
	if err != nil {
		return LotView{}, err
	}
	if rec.Reason != store.ReasonSpoiled || rec.LotJSON == "" {
		return LotView{}, ErrNotUndoable
	}
	if rec.WastedOn != today {
		return LotView{}, ErrUndoWindowOver
	}
	var lot store.StoredLot
	if err := json.Unmarshal([]byte(rec.LotJSON), &lot); err != nil {
		return LotView{}, ErrNotUndoable
	}
	if rec.IngredientID != nil {
		lot.IngredientID = *rec.IngredientID // an Ingredient merge since moved the waste record, so the Lot follows it
	}
	ing, err := s.ingredient(ctx, lot.IngredientID)
	if err != nil {
		return LotView{}, err
	}
	back, err := s.st.RestoreLotTx(ctx, tx, lot)
	if err != nil {
		return LotView{}, err
	}
	if err := s.st.DeleteWasteTx(ctx, tx, wasteID); err != nil {
		return LotView{}, err
	}
	if err := tx.Commit(); err != nil {
		return LotView{}, err
	}
	s.publish(map[string]any{"changed": "lots", "ingredientIds": []int64{ing.ID}})
	s.publish(map[string]any{"changed": "waste"})
	kind, err := s.kindOf(ctx, back.StoragePlaceID)
	if err != nil {
		return LotView{}, err
	}
	return view(back, ing, today, kind), nil
}

// Adjusted is what AdjustLot did.
type Adjusted struct {
	Lot     LotView // the Lot after (its Quantity 0 when Removed)
	Removed bool
}

// AdjustLot sets a Lot's quantity (SSP-01 Change): more or less than it holds, and 0 removes it. It is a correction:
// no waste and no go-off is recorded. The same quantity changes nothing and publishes nothing. A quantity below 0 (or
// NaN, or infinite) is ErrInvalid; an unknown Lot store.ErrNotFound.
func (s *Service) AdjustLot(ctx context.Context, lotID int64, quantity float64) (Adjusted, error) {
	if math.IsNaN(quantity) || math.IsInf(quantity, 0) || quantity < 0 {
		return Adjusted{}, invalid("quantity cannot be negative")
	}
	lot, err := s.st.Lot(ctx, lotID)
	if err != nil {
		return Adjusted{}, err
	}
	today, err := s.today(ctx)
	if err != nil {
		return Adjusted{}, err
	}
	ing, err := s.ingredient(ctx, lot.IngredientID)
	if err != nil {
		return Adjusted{}, err
	}
	kind, err := s.kindOf(ctx, lot.StoragePlaceID)
	if err != nil {
		return Adjusted{}, err
	}
	const eps = 1e-9
	switch {
	case math.Abs(quantity-lot.Quantity) <= eps:
		return Adjusted{Lot: view(lot, ing, today, kind)}, nil
	case quantity <= eps:
		if err := s.RemoveLot(ctx, lotID); err != nil {
			return Adjusted{}, err
		}
		gone := lot
		gone.Quantity = 0
		return Adjusted{Lot: view(gone, ing, today, kind), Removed: true}, nil
	}
	saved, err := s.st.Update(ctx, ing.ID, func(lots []stock.Lot) (store.Mutation, error) {
		out := make([]stock.Lot, len(lots))
		copy(out, lots)
		for i := range out {
			if out[i].ID == lotID {
				out[i].Quantity = quantity
				return store.Mutation{Lots: out}, nil
			}
		}
		return store.Mutation{}, store.ErrNotFound
	})
	if err != nil {
		return Adjusted{}, err
	}
	s.publishLots(ing.ID)
	for _, l := range saved {
		if l.ID == lotID {
			return Adjusted{Lot: view(l, ing, today, kind)}, nil
		}
	}
	return Adjusted{}, store.ErrNotFound
}

// PlaceMove is one move of MoveMany.
type PlaceMove struct{ LotID, PlaceID int64 }

// MovedMany is what MoveMany did.
type MovedMany struct {
	Moved   []LotView // the Lots moved, in request order
	Skipped []int64   // Lot ids that already had a Storage Place, left where they are
}

// MoveMany puts Not sorted Lots into Storage Places, all or none (SSP-10 Put away), in one transaction with one stock
// event. Each go-off date follows stock.GoOffAfterMove as MoveLot's does, and each Ingredient remembers where it was
// put. A Lot that already has a Storage Place is left there and reported in Skipped. No moves, a Lot named twice or an
// unknown Storage Place is ErrInvalid; an unknown Lot store.ErrNotFound; then nothing moves.
func (s *Service) MoveMany(ctx context.Context, moves []PlaceMove) (MovedMany, error) {
	if len(moves) == 0 {
		return MovedMany{}, invalid("moves must name at least one Stock Lot")
	}
	today, err := s.today(ctx)
	if err != nil {
		return MovedMany{}, err
	}
	seen := make(map[int64]bool, len(moves))
	ings := map[int64]IngredientInfo{}
	places := map[int64]store.StoragePlace{}
	plan := make([]store.Move, 0, len(moves))
	for _, m := range moves {
		if seen[m.LotID] {
			return MovedMany{}, invalid("a Stock Lot can be put away once")
		}
		seen[m.LotID] = true
		lot, err := s.st.Lot(ctx, m.LotID)
		if err != nil {
			return MovedMany{}, err
		}
		to, ok := places[m.PlaceID]
		if !ok {
			to, err = s.st.StoragePlace(ctx, m.PlaceID)
			if errors.Is(err, store.ErrPlaceNotFound) {
				return MovedMany{}, invalid("storagePlaceId names no Storage Place")
			}
			if err != nil {
				return MovedMany{}, err
			}
			places[m.PlaceID] = to
		}
		ing, ok := ings[lot.IngredientID]
		if !ok {
			if ing, err = s.ingredient(ctx, lot.IngredientID); err != nil {
				return MovedMany{}, err
			}
			ings[lot.IngredientID] = ing
		}
		// A Lot being put away is Not sorted; one sorted meanwhile is skipped by the store, whatever this says.
		goesOff := stock.GoOffAfterMove(lot.GoesOff, stock.KindNone, to.Kind, today, shelfLifeOf(ing, stock.KindNone), ing.FrozenShelfLifeDays)
		if ing.Supply {
			goesOff = stock.None // H4: a Supply's Lot never has a go-off date
		}
		plan = append(plan, store.Move{LotID: m.LotID, PlaceID: m.PlaceID, GoesOff: goesOff})
	}
	moved, skipped, err := s.st.MoveLots(ctx, plan)
	if errors.Is(err, store.ErrPlaceNotFound) {
		return MovedMany{}, invalid("storagePlaceId names no Storage Place")
	}
	if err != nil {
		return MovedMany{}, err
	}
	out := MovedMany{Moved: make([]LotView, 0, len(moved)), Skipped: skipped}
	if out.Skipped == nil {
		out.Skipped = []int64{}
	}
	var changed []int64
	for _, l := range moved {
		out.Moved = append(out.Moved, view(l, ings[l.IngredientID], today, places[*l.StoragePlaceID].Kind))
		changed = appendOnce(changed, l.IngredientID)
	}
	if len(changed) > 0 {
		sort.Slice(changed, func(i, j int) bool { return changed[i] < changed[j] })
		s.publish(map[string]any{"changed": "lots", "ingredientIds": changed})
	}
	return out, nil
}

// KeepUntil makes a spoiled Lot good until goodUntil ("" = today) in one Keep (SSP-17): its go-off date becomes that
// day and its Kept on today, so the streak forgives its go-offs so far. A Lot kept today can be kept again with
// another date: that is the Keep toast's Change, after the first Keep took the Lot off the spoiled list. A date that is
// not YYYY-MM-DD or is before today is ErrInvalid; a Lot that has not gone off and was not kept today ErrNotSpoiled;
// an unknown Lot store.ErrNotFound.
func (s *Service) KeepUntil(ctx context.Context, lotID int64, goodUntil stock.Date) (LotView, error) {
	today, err := s.today(ctx)
	if err != nil {
		return LotView{}, err
	}
	if goodUntil == stock.None {
		goodUntil = today
	}
	if err := checkDate(goodUntil, "goodUntil"); err != nil {
		return LotView{}, err
	}
	if goodUntil < today {
		return LotView{}, invalid("goodUntil cannot be before today")
	}
	lot, err := s.st.Lot(ctx, lotID)
	if err != nil {
		return LotView{}, err
	}
	if !stock.IsSpoiled(lot.Lot, today) && lot.KeptOn != today {
		return LotView{}, ErrNotSpoiled
	}
	ing, err := s.ingredient(ctx, lot.IngredientID)
	if err != nil {
		return LotView{}, err
	}
	saved, err := s.st.Update(ctx, ing.ID, func(lots []stock.Lot) (store.Mutation, error) {
		out := make([]stock.Lot, len(lots))
		copy(out, lots)
		for i := range out {
			if out[i].ID == lotID {
				out[i] = stock.KeepUntil(out[i], goodUntil, today)
				return store.Mutation{Lots: out, Today: today}, nil
			}
		}
		return store.Mutation{}, store.ErrNotFound
	})
	if err != nil {
		return LotView{}, err
	}
	s.publishLots(ing.ID)
	kind, err := s.kindOf(ctx, lot.StoragePlaceID)
	if err != nil {
		return LotView{}, err
	}
	for _, l := range saved {
		if l.ID == lotID {
			return view(l, ing, today, kind), nil
		}
	}
	return LotView{}, store.ErrNotFound
}

// TotalChange is what SetTotalRecorded did.
type TotalChange struct {
	Stock      IngredientStock
	Takes      []LotTake // what a decrease took (the Lots before, with the quantity taken from each)
	AddedLotID int64     // the Lot an increase created, 0 when none
}

// SetTotalRecorded is SetTotal that also says what it took or added, so a Stock-take can be undone (SAFE-09): a
// decrease lists the Lots as they were with what was taken from each (GiveBack puts it back), an increase names the
// Lot it created (RemoveLot takes it away). An unchanged total takes and adds nothing and publishes nothing.
func (s *Service) SetTotalRecorded(ctx context.Context, ingredientID int64, total float64) (TotalChange, error) {
	if math.IsNaN(total) || math.IsInf(total, 0) || total < 0 {
		return TotalChange{}, invalid("total cannot be negative")
	}
	ing, err := s.ingredient(ctx, ingredientID)
	if err != nil {
		return TotalChange{}, err
	}
	today, err := s.today(ctx)
	if err != nil {
		return TotalChange{}, err
	}
	// An increase is a new Lot in the remembered Storage Place, so a Freezer's Shelf Life applies to it.
	place, err := s.st.RememberedPlace(ctx, ing.ID)
	if err != nil {
		return TotalChange{}, err
	}
	shelfLife := shelfLifeOf(ing, stock.KindNone)
	if place != nil {
		shelfLife = shelfLifeOf(ing, place.Kind)
	}
	tx, err := s.st.Begin(ctx)
	if err != nil {
		return TotalChange{}, err
	}
	defer func() { _ = tx.Rollback() }()
	before, err := s.st.LotsOfTx(ctx, tx, ing.ID)
	if err != nil {
		return TotalChange{}, err
	}
	byID := make(map[int64]store.StoredLot, len(before))
	for _, l := range before {
		byID[l.ID] = l
	}
	var res stock.SetTotalResult
	saved, err := s.st.UpdateTx(ctx, tx, ing.ID, func(lots []stock.Lot) (store.Mutation, error) {
		r, err := stock.SetTotal(lots, ing.ID, total, today, shelfLife)
		if err != nil {
			return store.Mutation{}, invalid("total cannot be negative")
		}
		res = r
		return store.Mutation{Lots: r.Lots, NewSource: store.SourceStockTake, Today: today}, nil
	})
	if err != nil {
		return TotalChange{}, err
	}
	if err := tx.Commit(); err != nil {
		return TotalChange{}, err
	}
	out := TotalChange{Stock: summarise(ing, saved, today)}
	for _, t := range res.Removed {
		out.Takes = append(out.Takes, LotTake{Lot: byID[t.LotID], Taken: t.Quantity})
	}
	if res.Added != nil {
		for _, l := range saved {
			if _, had := byID[l.ID]; !had {
				out.AddedLotID = l.ID
			}
		}
	}
	if len(res.Removed) > 0 || res.Added != nil {
		s.publishLots(ing.ID)
	}
	return out, nil
}

// appendOnce appends id unless ids has it already.
func appendOnce(ids []int64, id int64) []int64 {
	for _, x := range ids {
		if x == id {
			return ids
		}
	}
	return append(ids, id)
}
