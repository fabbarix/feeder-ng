package today_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/today"
)

func TestStreak(t *testing.T) {
	cases := []struct {
		name                    string
		today, lastWaste, since string
		want                    int
	}{
		{"waste three days ago", "2026-11-09", "2026-11-06", "2026-10-01", 3},
		{"waste yesterday", "2026-11-09", "2026-11-08", "2026-10-01", 1},
		{"waste today resets to zero", "2026-11-09", "2026-11-09", "2026-10-01", 0},
		{"never wasted counts from the first Stock Lot", "2026-11-09", "", "2026-11-01", 8},
		{"never wasted and no Stock yet", "2026-11-09", "", "", 0},
		{"first Stock Lot bought today", "2026-11-09", "", "2026-11-09", 0},
		{"across a month end", "2026-03-02", "2026-02-27", "", 3},
		{"across a leap day", "2028-03-01", "2028-02-27", "", 3},
		{"waste dated in the future is ignored", "2026-11-09", "2026-11-12", "2026-11-01", 0},
		{"malformed dates", "2026-11-09", "yesterday", "", 0},
		{"malformed today", "soon", "2026-11-06", "", 0},
	}
	for _, c := range cases {
		if got := today.Streak(c.today, c.lastWaste, c.since); got != c.want {
			t.Errorf("%s: Streak(%q, %q, %q) = %d, want %d", c.name, c.today, c.lastWaste, c.since, got, c.want)
		}
	}
}
