package store

import (
	"context"
	"errors"
)

// B9-06 stubs: the test author's minimal signatures. The developer replaces the bodies (SET-02, SSP-13).

// ShopPriceProduct is the Product part of a Prices by Shop row.
type ShopPriceProduct struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Image string `json:"image"`
}

// ShopPrice is one row of "Prices by Shop": a Product and its latest Price at that Shop.
type ShopPrice struct {
	Product ShopPriceProduct `json:"product"`
	Price   Price            `json:"price"`
}

// ShopPrices is the latest Price of each active Product at the Shop, by Product name (ErrNotFound for an unknown Shop).
func (s *Store) ShopPrices(ctx context.Context, shopID int64) ([]ShopPrice, error) {
	return nil, errors.New("not implemented")
}

// PricedPack is the Product that prices an Ingredient before any purchase, with the Price used.
type PricedPack struct {
	Product Product
	Price   Price
}

// PricedPacks answers, per Ingredient, its priced Product: an active Product with a pack Price, at the Shop when one
// is selected and has any, else at any Shop; the most recent Price, ties broken by the lowest price per Base Unit.
// An Ingredient with no priced Product is absent.
func (s *Store) PricedPacks(ctx context.Context, ingredientIDs []int64, shopID *int64) (map[int64]PricedPack, error) {
	return nil, errors.New("not implemented")
}
