package cook

import (
	"time"

	"github.com/fabbarix/feeder-ng/internal/stock"
)

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

// GoOffEvent is a Lot that went off unforgiven and then left Stock without a Throw out (used up by
// Cooked or counted away by a Stock-take). It counts on GoesOff+1 like any go-off (R11c).
type GoOffEvent struct {
	LotID   int64
	GoesOff stock.Date
}

// StreakInput is everything ZeroWasteStreak needs. All dates are household dates.
type StreakInput struct {
	Today   stock.Date
	Created stock.Date // the day the Household was created in Feeder; None when unknown
	Lots    []LotGoOff
	Waste   []WasteEvent
	GoOffs  []GoOffEvent // go-offs of Lots no longer in Stock and not thrown out
}

// ZeroWasteStreak is the zero-waste streak in days (R11c, spec section 6.1): today minus the newest
// waste-event day, but never more than the Household's age (Today minus Created).
func ZeroWasteStreak(in StreakInput) int {
	if in.Created.IsNone() || in.Today.IsNone() {
		return 0
	}
	// gone: Lots already counted through a waste record (thrown out); a Lot is never counted twice.
	gone := map[int64]bool{}
	for _, w := range in.Waste {
		if w.LotID != 0 {
			gone[w.LotID] = true
		}
	}
	newest := in.Created
	see := func(d stock.Date) {
		if d <= in.Today && d > newest {
			newest = d
		}
	}
	for _, l := range in.Lots {
		if l.GoesOff.IsNone() || gone[l.ID] {
			continue
		}
		if e := l.GoesOff.AddDays(1); e > l.KeptOn { // None sorts first
			see(e)
		}
	}
	for _, w := range in.Waste {
		e := w.WastedOn
		if !w.LotGoesOff.IsNone() {
			if g := w.LotGoesOff.AddDays(1); g < e {
				e = g
			}
		}
		see(e)
	}
	for _, g := range in.GoOffs {
		if !g.GoesOff.IsNone() && !gone[g.LotID] {
			see(g.GoesOff.AddDays(1))
		}
	}
	t, errT := time.Parse("2006-01-02", string(in.Today))
	r, errR := time.Parse("2006-01-02", string(newest))
	if errT != nil || errR != nil {
		return 0
	}
	if days := int(t.Sub(r).Hours() / 24); days > 0 {
		return days
	}
	return 0
}
