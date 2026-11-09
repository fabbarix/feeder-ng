package cook

import (
	"time"

	"github.com/fabbarix/feeder-ng/internal/stock"
)

// Streak is the zero-waste streak in days: consecutive complete household days
// ending today without a waste record. lastWaste is the newest waste date
// (stock.None when there is none) and since the household's first Stock
// activity (stock.None when there is none).
//
//	waste today -> 0; waste yesterday -> 1; waste 6 days ago -> 6;
//	no waste ever -> today - since; no waste and no activity -> 0.
//
// The streak never counts days before since, and never goes negative (a
// lastWaste or since after today counts as today).
func Streak(today, lastWaste, since stock.Date) int {
	ref := lastWaste
	if ref.IsNone() || (!since.IsNone() && since > ref) {
		ref = since
	}
	if ref.IsNone() {
		return 0
	}
	t, errT := time.Parse("2006-01-02", string(today))
	r, errR := time.Parse("2006-01-02", string(ref))
	if errT != nil || errR != nil {
		return 0
	}
	days := int(t.Sub(r).Hours() / 24)
	if days < 0 {
		return 0
	}
	return days
}
