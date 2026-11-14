package service

import (
	"context"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

// TakenBack is what TakeBackLot took from a Stock Lot.
type TakenBack struct {
	IngredientID int64
	Taken        float64
	Removed      bool
}

// TakeBackLot takes back what is left of a Stock Lot, never more than added (what the tick added), in one transaction
// (ADR 0019, docs/dev/design/b8-undo.md). An unknown Lot (used up, deleted, or already taken back) is not an error:
// nothing is taken. One stock event is published when something was taken, none otherwise.
func (s *Service) TakeBackLot(ctx context.Context, lotID int64, added float64) (TakenBack, error) {
	// A Lot never changes Ingredient, so reading it before the transaction is safe; the take-back itself reads, changes
	// and writes the Ingredient's lots inside one transaction (store.Update).
	lot, err := s.st.Lot(ctx, lotID)
	if errors.Is(err, store.ErrNotFound) {
		return TakenBack{}, nil
	}
	if err != nil {
		return TakenBack{}, err
	}
	var res stock.TakeBackResult
	_, err = s.st.Update(ctx, lot.IngredientID, func(lots []stock.Lot) (store.Mutation, error) {
		res = stock.TakeBack(lots, lotID, added)
		return store.Mutation{Lots: res.Lots}, nil
	})
	if err != nil {
		return TakenBack{}, err
	}
	if res.Taken > 0 {
		s.publish(map[string]any{"changed": "lots", "ingredientIds": []int64{lot.IngredientID}})
	}
	return TakenBack{IngredientID: lot.IngredientID, Taken: res.Taken, Removed: res.Removed}, nil
}
