package cook_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

func TestStreak(t *testing.T) {
	const today = stock.Date("2026-11-09")
	cases := []struct {
		name             string
		lastWaste, since stock.Date
		want             int
	}{
		{"waste today resets to 0", "2026-11-09", "2026-10-01", 0},
		{"waste yesterday is 1", "2026-11-08", "2026-10-01", 1},
		{"waste six days ago is 6", "2026-11-03", "2026-10-01", 6},
		{"waste across a month end", "2026-10-30", "2026-10-01", 10},
		{"no waste ever counts from the first Stock activity", stock.None, "2026-11-02", 7},
		{"first activity today is 0", stock.None, "2026-11-09", 0},
		{"no waste and no activity is 0", stock.None, stock.None, 0},
		{"waste before the first activity does not count back further", "2026-09-01", "2026-11-05", 4},
		{"future dates count as today", "2026-11-12", "2026-10-01", 0},
		{"future first activity is 0", stock.None, "2026-12-01", 0},
	}
	for _, tc := range cases {
		if got := cook.Streak(today, tc.lastWaste, tc.since); got != tc.want {
			t.Errorf("%s: Streak = %d, want %d", tc.name, got, tc.want)
		}
	}
}
