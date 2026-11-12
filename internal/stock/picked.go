package stock

import "errors"

// Pick is the quantity (Base Units) the User says a Cooked Planned Meal took from one Stock Lot (Used from, ADR 0011).
type Pick struct {
	LotID    int64
	Quantity float64
}

var (
	// ErrPickQuantity: a Pick whose quantity is not a positive finite number.
	ErrPickQuantity = errors.New("pick quantity must be above 0")
	// ErrPickUnknownLot: a Pick names a Lot that is not among the lots given (unknown, gone, empty or of another Ingredient).
	ErrPickUnknownLot = errors.New("pick names a Stock Lot that is not in this Ingredient's Stock")
	// ErrPickTooMuch: the Picks of one Lot add up to more than the Lot holds.
	ErrPickTooMuch = errors.New("pick takes more than the Stock Lot holds")
)

// DeductPicked is Deduct for Used from (ADR 0011). lots are one Ingredient's lots. It takes each Pick from its Lot in the
// order given (a Pick above need is taken as picked), then deducts what is left of need (need minus the picked total,
// when above 0) from what the lots still hold, in Deduct's order. need <= 0 still takes the Picks (Mark all Cooked
// applies every Course's Picks before any default rest). With no Picks the result equals Deduct(lots, need).
// Taken has one entry per Lot (picked and default quantity added), picked Lots first in Pick order, then the default
// Lots in consumption order. Lots, Shortfall and the eps rules are those of Deduct; Shortfall is the part of need that
// neither Picks nor Stock covered. Refused (zero result): ErrPickQuantity, ErrPickUnknownLot, ErrPickTooMuch (the
// Picks of one Lot are summed first). The input is not modified.
func DeductPicked(lots []Lot, need float64, picks []Pick) (DeductResult, error) {
	return DeductResult{}, nil // red stub: b5-ufs developer implements
}
