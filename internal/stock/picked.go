package stock

import (
	"errors"
	"math"
	"sort"
)

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
// Taken has one entry per Lot (picked and default quantity added), the Lots the User chose first in Pick order, then
// the default Lots in consumption order. Lots, Shortfall and the eps rules are those of Deduct; Shortfall is the part
// of need that neither Picks nor Stock covered. Refused (zero result): ErrPickQuantity, ErrPickUnknownLot,
// ErrPickTooMuch (the Picks of one Lot are summed first). The input is not modified.
func DeductPicked(lots []Lot, need float64, picks []Pick) (DeductResult, error) {
	if len(picks) == 0 {
		return Deduct(lots, need), nil
	}

	remaining := make([]Lot, len(lots))
	copy(remaining, lots)
	index := make(map[int64]int, len(lots))
	for i, l := range remaining {
		if l.Quantity > eps {
			index[l.ID] = i
		}
	}

	var res DeductResult
	pos := map[int64]int{} // LotID -> its entry in res.Taken
	var picked float64
	for _, p := range picks {
		if !(p.Quantity > 0) || math.IsInf(p.Quantity, 0) {
			return DeductResult{}, ErrPickQuantity
		}
		idx, ok := index[p.LotID]
		if !ok {
			return DeductResult{}, ErrPickUnknownLot
		}
		if remaining[idx].Quantity-p.Quantity < -eps {
			return DeductResult{}, ErrPickTooMuch
		}
		remaining[idx].Quantity = math.Max(0, remaining[idx].Quantity-p.Quantity)
		picked += p.Quantity
		addTaken(&res, pos, p.LotID, p.Quantity)
	}

	rest := Deduct(remaining, need-picked)
	for _, t := range rest.Taken {
		addTaken(&res, pos, t.LotID, t.Quantity)
	}
	res.Shortfall = rest.Shortfall

	res.Lots = make([]Lot, 0, len(rest.Lots))
	for _, l := range rest.Lots {
		if l.Quantity > eps {
			res.Lots = append(res.Lots, l)
		}
	}
	return res, nil
}

// addTaken adds q to the Taken entry of lotID, creating it at the end when the Lot has none yet.
func addTaken(res *DeductResult, pos map[int64]int, lotID int64, q float64) {
	if at, ok := pos[lotID]; ok {
		res.Taken[at].Quantity += q
		return
	}
	pos[lotID] = len(res.Taken)
	res.Taken = append(res.Taken, Taken{LotID: lotID, Quantity: q})
}

// ConsumptionOrder returns the indexes of lots in the order Deduct takes them (soonest to go off first, undated last,
// ties oldest purchase then lowest ID). lots is not modified.
func ConsumptionOrder(lots []Lot) []int {
	order := make([]int, len(lots))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(i, j int) bool {
		return consumptionLess(lots[order[i]], lots[order[j]])
	})
	return order
}
