package cook_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// R11c: a Lot goes off on the day after its go-off date (still fine on the date itself).
func TestZeroWasteStreak(t *testing.T) {
	const today = stock.Date("2026-11-09")
	const old = stock.Date("2026-01-01") // a Household old enough not to cap anything
	cases := []struct {
		name string
		in   cook.StreakInput
		want int
	}{
		{"no Lots and no waste counts the Household's age", cook.StreakInput{Today: today, Created: "2026-11-02"}, 7},
		{"Household created today is 0", cook.StreakInput{Today: today, Created: today}, 0},
		{"Household with no known creation date is 0", cook.StreakInput{Today: today}, 0},
		{"Household created in the future is 0", cook.StreakInput{Today: today, Created: "2026-12-01"}, 0},

		// (a) going off resets on the go-off day
		{"a Lot spoiled and not acted on resets on the day it went off",
			cook.StreakInput{Today: today, Created: old, Lots: []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-05"}}}, 3}, // went off 11-06
		{"a Lot that goes off today is still fine, no reset",
			cook.StreakInput{Today: today, Created: "2026-11-01", Lots: []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-09"}}}, 8},
		{"a Lot that went off yesterday resets to 0 today",
			cook.StreakInput{Today: today, Created: old, Lots: []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-08"}}}, 0},
		{"a Lot without a go-off date never resets",
			cook.StreakInput{Today: today, Created: "2026-11-01", Lots: []cook.LotGoOff{{ID: 1}}}, 8},
		{"a Lot that will go off later does not reset",
			cook.StreakInput{Today: today, Created: "2026-11-01", Lots: []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-20"}}}, 8},
		{"the newest of several go-offs wins",
			cook.StreakInput{Today: today, Created: old, Lots: []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-01"}, {ID: 2, GoesOff: "2026-11-06"}, {ID: 3, GoesOff: "2026-11-03"}}}, 2},

		// Keep
		{"Keep before it went off: the pushed go-off date has not passed, no reset",
			cook.StreakInput{Today: today, Created: "2026-11-01", Lots: []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-10", KeptOn: "2026-11-08"}}}, 8},
		{"Keep after it went off forgives that go-off even though the new date is still past",
			cook.StreakInput{Today: today, Created: "2026-11-01", Lots: []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-04", KeptOn: "2026-11-09"}}}, 8},
		{"a Kept Lot that goes off again after the Keep resets on that new day",
			cook.StreakInput{Today: today, Created: old, Lots: []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-06", KeptOn: "2026-11-05"}}}, 2}, // went off 11-07
		{"Keep on the very day it went off forgives that day",
			cook.StreakInput{Today: today, Created: "2026-11-01", Lots: []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-07", KeptOn: "2026-11-08"}}}, 8},

		// Throw out
		{"Throw out of a Lot that was already gone off counts from the day it went off, not the throw-out day",
			cook.StreakInput{Today: today, Created: old, Waste: []cook.WasteEvent{{LotID: 1, WastedOn: "2026-11-08", LotGoesOff: "2026-11-03"}}}, 5}, // went off 11-04
		{"Throw out of a gone-off Lot is not a second waste event next to its own go-off",
			cook.StreakInput{Today: today, Created: old,
				Lots:  []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-03"}},
				Waste: []cook.WasteEvent{{LotID: 1, WastedOn: "2026-11-08", LotGoesOff: "2026-11-03"}}}, 5},
		{"Throw out of a fresh Lot counts on its throw-out day",
			cook.StreakInput{Today: today, Created: old, Waste: []cook.WasteEvent{{LotID: 1, WastedOn: "2026-11-07"}}}, 2},
		{"a discarded Leftover counts on the day it was discarded",
			cook.StreakInput{Today: today, Created: old, Waste: []cook.WasteEvent{{WastedOn: "2026-11-06"}}}, 3},
		{"waste today is 0",
			cook.StreakInput{Today: today, Created: old, Waste: []cook.WasteEvent{{WastedOn: today}}}, 0},
		{"a Lot thrown out after a Keep forgave its go-off counts on the throw-out day",
			cook.StreakInput{Today: today, Created: old, Waste: []cook.WasteEvent{{LotID: 1, WastedOn: "2026-11-08"}}}, 1},
		{"waste after a go-off: the newer event wins",
			cook.StreakInput{Today: today, Created: old,
				Lots:  []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-01"}},
				Waste: []cook.WasteEvent{{WastedOn: "2026-11-07"}}}, 2},

		// household-age cap
		{"the streak never exceeds the Household's age (waste long ago)",
			cook.StreakInput{Today: today, Created: "2026-11-05", Waste: []cook.WasteEvent{{WastedOn: "2026-09-01"}}}, 4},
		{"a backdated go-off before the Household existed does not inflate or reset",
			cook.StreakInput{Today: today, Created: "2026-11-05", Lots: []cook.LotGoOff{{ID: 1, GoesOff: "2026-10-01"}}}, 4},
		{"a Lot go-off on the creation day itself leaves the age as the cap",
			cook.StreakInput{Today: today, Created: "2026-11-05", Lots: []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-04"}}}, 4},

		// robustness
		{"a go-off or waste dated after today is ignored",
			cook.StreakInput{Today: today, Created: "2026-11-01",
				Lots:  []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-20"}},
				Waste: []cook.WasteEvent{{WastedOn: "2026-11-12"}}}, 8},
		{"across a month end", cook.StreakInput{Today: "2026-12-02", Created: old, Waste: []cook.WasteEvent{{WastedOn: "2026-11-28"}}}, 4},
	}
	for _, tc := range cases {
		if got := cook.ZeroWasteStreak(tc.in); got != tc.want {
			t.Errorf("%s: ZeroWasteStreak = %d, want %d", tc.name, got, tc.want)
		}
	}
}

// R11c: the pure function works in household dates; "today" in the household zone decides which
// go-offs have happened. Near midnight UTC the same instant is two different household days.
func TestZeroWasteStreakUsesTheHouseholdDate(t *testing.T) {
	lots := []cook.LotGoOff{{ID: 1, GoesOff: "2026-11-09"}}
	// 2026-11-09 23:30 UTC is already 2026-11-10 in Rome: the Lot went off today there.
	if got := cook.ZeroWasteStreak(cook.StreakInput{Today: "2026-11-10", Created: "2026-10-01", Lots: lots}); got != 0 {
		t.Errorf("household day 11-10: streak = %d, want 0 (went off today)", got)
	}
	// ...but on the household day 11-09 (e.g. Los Angeles) it is still fine.
	if got := cook.ZeroWasteStreak(cook.StreakInput{Today: "2026-11-09", Created: "2026-10-01", Lots: lots}); got != 39 {
		t.Errorf("household day 11-09: streak = %d, want 39 (age)", got)
	}
}
