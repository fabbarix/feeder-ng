package stock

// Take is what an action (Cooked, a Stock-take, Throw out) took from one Stock Lot: Before is the Lot as it was just
// before the action, Taken the quantity the action took from it (0 < Taken <= Before.Quantity). B9-05 test stub.
type Take struct {
	Before Lot
	Taken  float64
}

// GiveBackResult is the outcome of GiveBack. B9-05 test stub.
type GiveBackResult struct {
	Lots     []Lot   // the Lots after the give-back
	Restored []int64 // ids of the Lots that got quantity back, or were put back whole
	Gone     []int64 // ids of Lots that were gone since, so their Stock was not put back
}

// GiveBack puts back what takes took. B9-05 test stub: the developer implements it.
func GiveBack(lots []Lot, takes []Take) GiveBackResult { return GiveBackResult{Lots: lots} }

// KeepUntil is Keep with a date the Lot is good until (SSP-17). B9-05 test stub.
func KeepUntil(lot Lot, goodUntil, today Date) Lot { return lot }
