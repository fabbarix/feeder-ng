package stock

import "math"

// Take is what an action (Cooked, a Stock-take, Throw out) took from one Stock Lot: Before is the Lot as it was just
// before the action, Taken the quantity the action took from it (0 < Taken <= Before.Quantity).
type Take struct {
	Before Lot
	Taken  float64
}

// GiveBackResult is the outcome of GiveBack.
type GiveBackResult struct {
	Lots     []Lot   // the Lots after the give-back: the ones given, then the Lots put back whole
	Restored []int64 // ids of the Lots that got quantity back, or were put back whole, in the order of the takes
	Gone     []int64 // ids of Lots that were gone since, so their Stock was not put back
}

// GiveBack puts back what takes took from lots (SAFE-03, SAFE-09). Per Lot, by what it is now:
//   - it exists: the quantity taken is added to the quantity it has now (it may have changed since);
//   - it is gone and the action emptied it (taken >= Before.Quantity): it is put back whole, with its id, dates and
//     KeptOn, and the quantity taken;
//   - it is gone and the action left some of it: somebody deleted it since, so its Stock is not invented (Gone).
//
// Takes of the same Lot add up. A take whose Taken is not more than 0 (or NaN, or infinite) is ignored. The input is
// not modified.
func GiveBack(lots []Lot, takes []Take) GiveBackResult {
	out := make([]Lot, len(lots))
	copy(out, lots)
	res := GiveBackResult{}

	// Add up the takes per Lot, in the order each Lot first appears.
	type sum struct {
		before Lot
		taken  float64
	}
	var order []int64
	sums := map[int64]*sum{}
	for _, t := range takes {
		if !(t.Taken > 0) || math.IsInf(t.Taken, 0) {
			continue
		}
		if s, ok := sums[t.Before.ID]; ok {
			s.taken += t.Taken
			continue
		}
		sums[t.Before.ID] = &sum{before: t.Before, taken: t.Taken}
		order = append(order, t.Before.ID)
	}

	at := make(map[int64]int, len(out))
	for i, l := range out {
		at[l.ID] = i
	}
	for _, id := range order {
		s := sums[id]
		if i, ok := at[id]; ok {
			out[i].Quantity += s.taken
			res.Restored = append(res.Restored, id)
			continue
		}
		if s.taken >= s.before.Quantity-eps {
			back := s.before
			back.Quantity = s.taken
			out = append(out, back)
			at[id] = len(out) - 1
			res.Restored = append(res.Restored, id)
			continue
		}
		res.Gone = append(res.Gone, id)
	}
	res.Lots = out
	return res
}

// KeepUntil is Keep with the date the Lot is good until (SSP-17): GoesOff becomes goodUntil and KeptOn becomes today,
// so the zero-waste streak forgives the go-offs so far, exactly as Keep does. Nothing else changes. A Lot with no go-off
// date is returned unchanged. The caller checks that goodUntil is a date and not before today.
func KeepUntil(lot Lot, goodUntil, today Date) Lot {
	if lot.GoesOff.IsNone() {
		return lot
	}
	lot.GoesOff = goodUntil
	lot.KeptOn = today
	return lot
}
