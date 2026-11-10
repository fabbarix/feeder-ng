package cook

import "github.com/fabbarix/feeder-ng/internal/stock"

// LotGoOff is a Stock Lot still in Stock, as the zero-waste streak sees it (R11c).
type LotGoOff struct {
	ID      int64
	GoesOff stock.Date // the Lot's go-off date, None when it has none
	KeptOn  stock.Date // household date of the last Keep, None when never Kept
}

// WasteEvent is one waste record (a thrown-out Lot or a discarded Leftover), as the streak sees it (R11c).
type WasteEvent struct {
	LotID      int64      // 0 for a discarded Leftover
	WastedOn   stock.Date // household date the record was made
	LotGoesOff stock.Date // go-off date of a Lot that had already gone off unforgiven, else None
}

// StreakInput is everything ZeroWasteStreak needs. All dates are household dates.
type StreakInput struct {
	Today   stock.Date
	Created stock.Date // the day the Household was created in Feeder; None when unknown
	Lots    []LotGoOff
	Waste   []WasteEvent
}

// ZeroWasteStreak is the zero-waste streak in days (R11c, spec section 6): today minus the newest
// waste-event day, but never more than the Household's age (Today minus Created).
// STUB (R11c test author): returns 0; the developer implements it and removes Streak.
func ZeroWasteStreak(in StreakInput) int {
	return 0
}
