package stock

import "math"

// TakeBackResult is the outcome of TakeBack.
type TakeBackResult struct {
	Lots    []Lot   // the Lots after the take-back, original order; emptied Lots are removed
	Taken   float64 // quantity taken from the Lot (0 when nothing was taken)
	Removed bool    // nothing is left of the Lot
}

// TakeBack is what Undo of a tick does to the Stock Lot the tick added (ADR 0019): it takes back what is left of that
// Lot, never more than the tick added, and never touches another Lot. An unknown Lot, or an added amount that is not
// more than 0 (or NaN), changes nothing. What is left at or below eps is gone. The input is not modified.
func TakeBack(lots []Lot, lotID int64, added float64) TakeBackResult {
	out := make([]Lot, len(lots))
	copy(out, lots)
	res := TakeBackResult{Lots: out}
	if !(added > 0) {
		return res
	}
	idx := -1
	for i, l := range out {
		if l.ID == lotID {
			idx = i
			break
		}
	}
	if idx < 0 {
		return res
	}
	take := math.Min(out[idx].Quantity, added)
	if take < 0 {
		take = 0
	}
	res.Taken = take
	rest := out[idx].Quantity - take
	if rest <= eps {
		res.Removed = true
		res.Lots = append(out[:idx], out[idx+1:]...)
		return res
	}
	out[idx].Quantity = rest
	return res
}
