package service

import (
	"context"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

// TakenBack is what TakeBackLot took from a Stock Lot.
type TakenBack struct {
	IngredientID int64 // 0 when the Lot is unknown or was taken back before
	Taken        float64
	Removed      bool
}

// TakeBackLot takes back what is left of a Stock Lot, never more than added (what the tick added), in one transaction
// (ADR 0019, docs/dev/design/b8-undo.md). The take-back is recorded in that transaction and a Lot is taken back at most
// once: a second call for the same Lot (a retried Undo) changes nothing and answers what the first one took, so the
// caller can finish its own steps. An unknown Lot (used up or deleted) that was never taken back is not an error:
// nothing is taken. One stock event is published when something was taken, none otherwise.
func (s *Service) TakeBackLot(ctx context.Context, lotID int64, added float64) (TakenBack, error) {
	// A Lot never changes Ingredient, so reading it before the transaction is safe; the take-back itself reads, changes
	// and writes the Ingredient's lots inside one transaction.
	lot, err := s.st.Lot(ctx, lotID)
	known := err == nil
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		return TakenBack{}, err
	}
	tx, err := s.st.Begin(ctx)
	if err != nil {
		return TakenBack{}, err
	}
	defer func() { _ = tx.Rollback() }()
	if rec, ok, err := s.st.TakeBackTx(ctx, tx, lotID); err != nil {
		return TakenBack{}, err
	} else if ok {
		return TakenBack{Taken: rec.Taken, Removed: rec.Removed}, nil
	}
	if !known {
		return TakenBack{}, nil
	}
	var res stock.TakeBackResult
	if _, err := s.st.UpdateTx(ctx, tx, lot.IngredientID, func(lots []stock.Lot) (store.Mutation, error) {
		res = stock.TakeBack(lots, lotID, added)
		return store.Mutation{Lots: res.Lots}, nil
	}); err != nil {
		return TakenBack{}, err
	}
	if res.Taken > 0 {
		if err := s.st.RecordTakeBackTx(ctx, tx, store.TakeBackRecord{LotID: lotID, Taken: res.Taken, Removed: res.Removed}); err != nil {
			return TakenBack{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return TakenBack{}, err
	}
	if res.Taken > 0 {
		s.publish(map[string]any{"changed": "lots", "ingredientIds": []int64{lot.IngredientID}})
	}
	return TakenBack{IngredientID: lot.IngredientID, Taken: res.Taken, Removed: res.Removed}, nil
}
