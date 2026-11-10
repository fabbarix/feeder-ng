// Package today holds the Today screen's own data rules. The zero-waste streak
// is T14's (internal/cook): the kitchen board and Today show the same number.
package today

import (
	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// Streak is the zero-waste streak in whole days, forwarded to cook.Streak: today
// minus the household date of the last waste record, or, when nothing was ever
// wasted, today minus since (the earliest Stock Lot purchase). Waste today gives
// 0. Empty or malformed dates give 0, and dates after today count as today.
func Streak(today, lastWaste, since string) int {
	return cook.Streak(stock.Date(today), stock.Date(lastWaste), stock.Date(since))
}
