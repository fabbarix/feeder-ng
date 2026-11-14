package service

import (
	"context"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// ErrNotByHand: Change or Take back was asked for a tick that a Scan made (a Scan's Lot is undone from the Scanned list).
var ErrNotByHand = errors.New("shopping: the tick was made by a Scan")

// Adjuster sets a Stock Lot's quantity (0 removes it): the stock service's AdjustLot.
type Adjuster interface {
	AdjustLot(ctx context.Context, lotID int64, quantity float64) error
}

// Users resolves User ids to display names; an unknown id is absent.
type Users interface {
	Names(ctx context.Context, ids []int64) (map[int64]string, error)
}

// ChangeInput changes the quantity one tick addition put into Stock (SSP-01 Change, RES-03 Take back). ClientUUID
// addresses one addition of the Line (any User's, by hand); empty means the User's own latest addition by hand.
// Quantity 0 is Take back (ADR 0019): what is left of that addition's Lot goes, the tick stays.
type ChangeInput struct {
	IngredientID int64
	To           stock.Date
	ShopID       *int64
	Quantity     float64
	ClientUUID   string
	UserID       int64
}

// ChangeResult is the addition after the change. LotID is nil when it has no Stock Lot.
type ChangeResult struct {
	LotID    *int64
	Quantity float64
}

// ChangeTick: B9-23 test stub, not implemented.
func (s *Service) ChangeTick(ctx context.Context, in ChangeInput) (ChangeResult, error) {
	return ChangeResult{}, errors.New("not implemented")
}

// ChangeExtraTick is ChangeTick for an Ingredient extra's tick: B9-23 test stub, not implemented.
func (s *Service) ChangeExtraTick(ctx context.Context, id int64, quantity float64) (ChangeResult, error) {
	return ChangeResult{}, errors.New("not implemented")
}

// UntickAddition takes back the addition with that client UUID and removes it; the tick goes when it was the last one
// (RES-03 shop_untick). An unknown UUID changes nothing. B9-23 test stub, not implemented.
func (s *Service) UntickAddition(ctx context.Context, clientUUID string) error {
	return errors.New("not implemented")
}

// Snapshot derives the Shopping List for the range ending on `to` (the default when empty) without prices, Packs,
// the Scan ledger or the currency: the smallest read the plan side needs to take shopping.Diff before and after a
// write. B9-23 test stub, not implemented.
func (s *Service) Snapshot(ctx context.Context, to stock.Date) (shopping.List, error) {
	return shopping.List{}, errors.New("not implemented")
}
