package service

import (
	"context"
	"errors"
	"fmt"
	"math"

	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

// Quick Use of a Supply (H9, household-items.md section 4.11): a Use is Used up, never waste, so it records no waste and
// no go-off. Each error also satisfies errors.Is(err, ErrInvalid); the httpapi maps them to 422.
var (
	// ErrNotSupply is returned when the Ingredient is food: Use is for Supplies only (422 ingredient_not_supply).
	ErrNotSupply = fmt.Errorf("%w: the Ingredient is food, not a Supply", ErrInvalid)
	// ErrUseInvalid is returned for a quantity that is not more than 0 (or NaN, or infinite), or an Undo with no
	// Lots, a non-positive quantity or no purchase date (422 use_quantity_invalid).
	ErrUseInvalid = fmt.Errorf("%w: a use needs a quantity of more than 0", ErrInvalid)
	// ErrUseExceedsStock is returned for a Use of more than the Supply's Stock, and nothing is taken (422 use_exceeds_stock).
	ErrUseExceedsStock = fmt.Errorf("%w: more than is in Stock", ErrInvalid)
)

// UsedLot is one Lot's share of a Use: what Undo needs to put it back, including the Lot's Purchased date, Storage
// Place, Product and Shop so an emptied Lot can be recreated.
type UsedLot struct {
	LotID          int64
	Quantity       float64
	Purchased      stock.Date
	StoragePlaceID *int64
	ProductID      *int64
	ShopID         *int64
}

// SupplyUse is the answer to a Use or an Undo. For a Use, Quantity is what was taken and Taken is in the order taken.
// For an Undo, Quantity is what came back and Taken lists the Lots as they are now (a recreated Lot has its new ID).
// Total is the Stock left.
type SupplyUse struct {
	IngredientID int64
	Name         string
	BaseUnit     string
	Quantity     float64
	Total        float64
	Taken        []UsedLot
}

// supply is the Ingredient, or ErrUnknownIngredient, or ErrNotSupply when it is food.
func (s *Service) supply(ctx context.Context, id int64) (IngredientInfo, error) {
	ing, err := s.ingredient(ctx, id)
	if err != nil {
		return IngredientInfo{}, err
	}
	if !ing.Supply {
		return IngredientInfo{}, ErrNotSupply
	}
	return ing, nil
}

// UseSupply takes quantity (Base Units) out of a Supply's Lots, oldest purchased first (stock.Use), in one transaction.
// Emptied Lots are deleted. It publishes one stock event after the commit. A refusal changes nothing and publishes nothing.
func (s *Service) UseSupply(ctx context.Context, ingredientID int64, quantity float64) (SupplyUse, error) {
	ing, err := s.supply(ctx, ingredientID)
	if err != nil {
		return SupplyUse{}, err
	}
	if !(quantity > 0) || math.IsInf(quantity, 0) {
		return SupplyUse{}, ErrUseInvalid
	}
	tx, err := s.st.Begin(ctx)
	if err != nil {
		return SupplyUse{}, err
	}
	defer func() { _ = tx.Rollback() }()

	stored, err := s.st.LotsOfTx(ctx, tx, ing.ID)
	if err != nil {
		return SupplyUse{}, err
	}
	byID := make(map[int64]store.StoredLot, len(stored))
	for _, l := range stored {
		byID[l.ID] = l
	}
	var res stock.UseResult
	if _, err := s.st.UpdateTx(ctx, tx, ing.ID, func(lots []stock.Lot) (store.Mutation, error) {
		r, err := stock.Use(lots, quantity)
		if err != nil {
			return store.Mutation{}, err
		}
		res = r
		return store.Mutation{Lots: r.Lots}, nil
	}); err != nil {
		return SupplyUse{}, useError(err)
	}
	if err := tx.Commit(); err != nil {
		return SupplyUse{}, err
	}

	taken := make([]UsedLot, 0, len(res.Taken))
	for _, t := range res.Taken {
		l := byID[t.LotID]
		taken = append(taken, UsedLot{
			LotID:          t.LotID,
			Quantity:       t.Quantity,
			Purchased:      l.Purchased,
			StoragePlaceID: l.StoragePlaceID,
			ProductID:      l.ProductID,
			ShopID:         l.ShopID,
		})
	}
	s.publishLots(ing.ID)
	return SupplyUse{
		IngredientID: ing.ID,
		Name:         ing.Name,
		BaseUnit:     ing.BaseUnit,
		Quantity:     quantity,
		Total:        stock.Total(res.Lots),
		Taken:        taken,
	}, nil
}

// UndoSupplyUse puts back what a Use took, in one transaction: a Lot that still exists gets its quantity added, and an
// emptied Lot is recreated with its Purchased date, Storage Place, Product and Shop and no go-off date. It publishes one
// stock event after the commit. Undo is not idempotent: each call puts the quantities back again.
func (s *Service) UndoSupplyUse(ctx context.Context, ingredientID int64, taken []UsedLot) (SupplyUse, error) {
	ing, err := s.supply(ctx, ingredientID)
	if err != nil {
		return SupplyUse{}, err
	}
	if len(taken) == 0 {
		return SupplyUse{}, ErrUseInvalid
	}
	for _, t := range taken {
		if !(t.Quantity > 0) || math.IsInf(t.Quantity, 0) || t.Purchased.IsNone() || checkDate(t.Purchased, "purchased") != nil {
			return SupplyUse{}, ErrUseInvalid
		}
	}
	tx, err := s.st.Begin(ctx)
	if err != nil {
		return SupplyUse{}, err
	}
	defer func() { _ = tx.Rollback() }()

	stored, err := s.st.LotsOfTx(ctx, tx, ing.ID)
	if err != nil {
		return SupplyUse{}, err
	}
	exists := make(map[int64]bool, len(stored))
	for _, l := range stored {
		exists[l.ID] = true
	}
	// Lots that still exist get their quantity back in the same write as the rest of the Ingredient's Lots.
	if _, err := s.st.UpdateTx(ctx, tx, ing.ID, func(lots []stock.Lot) (store.Mutation, error) {
		out := make([]stock.Lot, len(lots))
		copy(out, lots)
		at := make(map[int64]int, len(out))
		for i, l := range out {
			at[l.ID] = i
		}
		for _, t := range taken {
			if i, ok := at[t.LotID]; ok {
				out[i].Quantity += t.Quantity
			}
		}
		return store.Mutation{Lots: out}, nil
	}); err != nil {
		return SupplyUse{}, err
	}

	back := make([]UsedLot, len(taken))
	copy(back, taken)
	for i, t := range taken {
		if exists[t.LotID] {
			continue
		}
		made, err := s.st.AddLotTx(ctx, tx, store.NewLot{
			IngredientID:   ing.ID,
			Quantity:       t.Quantity,
			Purchased:      t.Purchased,
			GoesOff:        stock.None, // a Supply's Lot has no go-off date (H4)
			Source:         store.SourceManual,
			ProductID:      t.ProductID,
			ShopID:         t.ShopID,
			StoragePlaceID: t.StoragePlaceID,
		})
		if err != nil {
			return SupplyUse{}, err
		}
		back[i].LotID = made.ID
	}

	now, err := s.st.LotsOfTx(ctx, tx, ing.ID)
	if err != nil {
		return SupplyUse{}, err
	}
	if err := tx.Commit(); err != nil {
		return SupplyUse{}, err
	}
	var quantity float64
	for _, t := range taken {
		quantity += t.Quantity
	}
	s.publishLots(ing.ID)
	left := make([]stock.Lot, 0, len(now))
	for _, l := range now {
		left = append(left, l.Lot)
	}
	return SupplyUse{
		IngredientID: ing.ID,
		Name:         ing.Name,
		BaseUnit:     ing.BaseUnit,
		Quantity:     quantity,
		Total:        stock.Total(left),
		Taken:        back,
	}, nil
}

// useError maps the pure rule's errors onto the service's.
func useError(err error) error {
	switch {
	case errors.Is(err, stock.ErrUseExceedsStock):
		return ErrUseExceedsStock
	case errors.Is(err, stock.ErrUseNotPositive):
		return ErrUseInvalid
	}
	return err
}

// publishLots publishes the `stock` event for one Ingredient's Lots (after a commit).
func (s *Service) publishLots(ingredientID int64) {
	s.publish(map[string]any{"changed": "lots", "ingredientIds": []int64{ingredientID}})
}
