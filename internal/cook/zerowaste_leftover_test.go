package cook_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// B5-LO (ADR 0012, spec 6.1): the Zero-waste streak with Leftovers asked about before they count. The pure function
// needs no change: an answered Threw it out is a WasteEvent dated by the runner (Use-by + 1, or the day of the hand
// action), and an unanswered Leftover, Had it and Wasn't there write no WasteEvent at all. These cases pin that contract
// so the runner's dates (runner/leftover_test.go) and the streak agree. They pass today by design.
func TestZeroWasteStreakWithLeftoversByHand(t *testing.T) {
	const today = stock.Date("2026-11-09")
	const old = stock.Date("2026-01-01")
	cases := []struct {
		name string
		in   cook.StreakInput
		want int
	}{
		{"a Leftover thrown out by hand today starts the streak again",
			cook.StreakInput{Today: today, Created: old, Waste: []cook.WasteEvent{{WastedOn: today}}}, 0},
		{"a Leftover answered Threw it out counts on the day after its Use-by (Use-by 11-04)",
			cook.StreakInput{Today: today, Created: old, Waste: []cook.WasteEvent{{WastedOn: "2026-11-05"}}}, 4},
		{"answered late: the streak drops back to that day, not to the day of the answer",
			cook.StreakInput{Today: today, Created: old, Waste: []cook.WasteEvent{{WastedOn: "2026-11-05"}, {WastedOn: "2026-10-01"}}}, 4},
		{"an unanswered Leftover writes nothing, so the streak holds",
			cook.StreakInput{Today: today, Created: "2026-10-01"}, 39},
		{"Had it and Wasn't there write nothing either",
			cook.StreakInput{Today: today, Created: "2026-10-01", Waste: nil}, 39},
		{"waste of a Leftover is never mistaken for a Lot (no Lot id)",
			cook.StreakInput{Today: today, Created: old,
				Lots:  []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-01"}},
				Waste: []cook.WasteEvent{{WastedOn: "2026-11-05"}}}, 4},
		{"the newest of a Leftover answer and a Lot going off wins",
			cook.StreakInput{Today: today, Created: old,
				Lots:  []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-07"}},
				Waste: []cook.WasteEvent{{WastedOn: "2026-11-05"}}}, 1},
	}
	for _, tc := range cases {
		if got := cook.ZeroWasteStreak(tc.in); got != tc.want {
			t.Errorf("%s: ZeroWasteStreak = %d, want %d", tc.name, got, tc.want)
		}
	}
}
