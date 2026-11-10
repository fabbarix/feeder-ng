package shopping_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

func TestLastPlannedDateIncludesTodayInTheHorizon(t *testing.T) {
	cases := []struct {
		horizon int
		want    stock.Date
	}{{7, "2026-11-15"}, {1, "2026-11-09"}, {14, "2026-11-22"}, {0, "2026-11-09"}}
	for _, c := range cases {
		if got := shopping.LastPlannedDate("2026-11-09", c.horizon); got != c.want {
			t.Errorf("LastPlannedDate(horizon %d) = %s, want %s", c.horizon, got, c.want)
		}
	}
}

func TestDefaultToIsTodayPlusSevenCappedAtTheHorizon(t *testing.T) {
	cases := []struct {
		horizon int
		want    stock.Date
	}{{14, "2026-11-16"}, {8, "2026-11-16"}, {7, "2026-11-15"}, {3, "2026-11-11"}}
	for _, c := range cases {
		if got := shopping.DefaultTo("2026-11-09", c.horizon); got != c.want {
			t.Errorf("DefaultTo(horizon %d) = %s, want %s", c.horizon, got, c.want)
		}
	}
}

func TestClampToCapsAtTheHorizonAndRaisesPastDatesToToday(t *testing.T) {
	cases := []struct {
		name    string
		horizon int
		to      stock.Date
		want    stock.Date
	}{
		{"inside", 14, "2026-11-12", "2026-11-12"},
		{"today", 14, "2026-11-09", "2026-11-09"},
		{"last day", 14, "2026-11-22", "2026-11-22"},
		{"beyond the horizon", 14, "2026-12-31", "2026-11-22"},
		{"in the past", 14, "2026-11-01", "2026-11-09"},
		{"empty means the default", 14, "", "2026-11-16"},
		{"invalid means the default", 14, "soon", "2026-11-16"},
		{"default capped at a short horizon", 3, "", "2026-11-11"},
	}
	for _, c := range cases {
		if got := shopping.ClampTo("2026-11-09", c.horizon, c.to); got != c.want {
			t.Errorf("%s: ClampTo(%q) = %s, want %s", c.name, c.to, got, c.want)
		}
	}
}
