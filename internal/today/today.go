// Package today holds the pure rules behind the Today screen's own tiles.
// T14's kitchen board shows the same zero-waste streak and should reuse Streak.
package today

// Streak is the zero-waste streak in whole days: today minus the household date
// of the last waste record (Throw out of a spoiled Stock Lot, or an auto-discarded
// Leftover), or, when nothing was ever wasted, today minus since (the date of the
// earliest Stock Lot purchase). Waste today gives 0. Empty or malformed dates
// and dates after today give 0. Dates are YYYY-MM-DD household dates. Not
// implemented yet.
func Streak(today, lastWaste, since string) int { return -1 }
