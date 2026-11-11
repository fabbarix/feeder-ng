package stock_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/stock"
)

func days(n int) *int { return &n }

func TestValidKind(t *testing.T) {
	for _, k := range []stock.Kind{stock.KindPantry, stock.KindFridge, stock.KindFreezer} {
		if !stock.ValidKind(k) {
			t.Errorf("%q should be valid", k)
		}
	}
	for _, k := range []stock.Kind{"", "garage", "Freezer"} {
		if stock.ValidKind(k) {
			t.Errorf("%q should be invalid", k)
		}
	}
}

func TestShelfLifeIn(t *testing.T) {
	if got := stock.ShelfLifeIn(stock.KindFreezer, days(3), days(90)); got == nil || *got != 90 {
		t.Errorf("freezer with a frozen Shelf Life: got %v", got)
	}
	if got := stock.ShelfLifeIn(stock.KindFreezer, days(3), nil); got == nil || *got != 3 {
		t.Errorf("freezer without one keeps the ordinary Shelf Life: got %v", got)
	}
	if got := stock.ShelfLifeIn(stock.KindFridge, days(3), days(90)); got == nil || *got != 3 {
		t.Errorf("fridge: got %v", got)
	}
	if got := stock.ShelfLifeIn(stock.KindNone, nil, days(90)); got != nil {
		t.Errorf("no Shelf Life outside a Freezer: got %v", got)
	}
}

func TestGoOffAfterMove(t *testing.T) {
	const today stock.Date = "2026-11-11"
	cases := []struct {
		name          string
		current       stock.Date
		from, to      stock.Kind
		shelf, frozen *int
		want          stock.Date
	}{
		{"fridge to freezer restarts on the frozen Shelf Life", "2026-11-13", stock.KindFridge, stock.KindFreezer, days(3), days(90), "2027-02-09"},
		{"unsorted to freezer too", "2026-11-13", stock.KindNone, stock.KindFreezer, days(3), days(90), "2027-02-09"},
		{"freezer to fridge starts the ordinary Shelf Life from today", "2027-02-09", stock.KindFreezer, stock.KindFridge, days(3), days(90), "2026-11-14"},
		{"freezer to freezer keeps it", "2027-02-09", stock.KindFreezer, stock.KindFreezer, days(3), days(90), "2027-02-09"},
		{"pantry to fridge keeps it", "2026-11-13", stock.KindPantry, stock.KindFridge, days(3), days(90), "2026-11-13"},
		{"into a freezer without a frozen Shelf Life keeps it", "2026-11-13", stock.KindFridge, stock.KindFreezer, days(3), nil, "2026-11-13"},
		{"out of a freezer without a Shelf Life keeps it", "", stock.KindFreezer, stock.KindPantry, nil, days(90), ""},
	}
	for _, c := range cases {
		if got := stock.GoOffAfterMove(c.current, c.from, c.to, today, c.shelf, c.frozen); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
