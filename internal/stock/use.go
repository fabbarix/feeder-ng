package stock

import (
	"errors"
	"math"
)

// ErrUseNotPositive is returned by Use for a quantity that is not more than 0, NaN or infinite.
var ErrUseNotPositive = errors.New("use quantity must be more than 0")

// ErrUseExceedsStock is returned by Use for a quantity more than the Lots hold (beyond eps). Nothing is taken.
var ErrUseExceedsStock = errors.New("use quantity exceeds stock")

// UseResult is the outcome of Use.
type UseResult struct {
	Lots  []Lot   // what is left: emptied Lots dropped, original order
	Taken []Taken // in the order taken
}

// Use takes quantity (Base Units) out of a Supply's lots, the way a quick Use does (household-items.md section 4.11):
// the same consumption order as Deduct, oldest purchase first then lowest ID for undated Lots. Unlike Deduct it never
// floors: a quantity more than the Stock holds is ErrUseExceedsStock and takes nothing; a quantity that is not more than
// 0, NaN or infinite is ErrUseNotPositive. The input is not modified.
func Use(lots []Lot, quantity float64) (UseResult, error) {
	if !(quantity > 0) || math.IsInf(quantity, 0) {
		return UseResult{}, ErrUseNotPositive
	}
	if quantity > Total(lots)+eps {
		return UseResult{}, ErrUseExceedsStock
	}
	res := Deduct(lots, quantity)
	return UseResult{Lots: res.Lots, Taken: res.Taken}, nil
}
