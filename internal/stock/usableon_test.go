package stock

import "testing"

// beta.8, base team (docs/dev/design/b8-base.md section 2): the Stock a meal can count on its date, the one rule of the
// Shopping List's draw (a Lot with a go-off date before the date has gone off and is not drawn), so Cook Mode and the
// notification facts use it too. A Lot goes off the day after its go-off date: GoesOff == date is still usable.
//
// Pinned API in package stock: func UsableOn(lots []Lot, date Date) map[int64]float64, the quantity per Ingredient of
// the Lots with Quantity > 0 and either no go-off date or GoesOff >= date.

func TestUsableOnLeavesOutLotsThatHaveGoneOffByTheDate(t *testing.T) {
	lots := []Lot{
		{ID: 1, IngredientID: 7, Quantity: 500, GoesOff: "2026-11-08"}, // gone off by 11-09
		{ID: 2, IngredientID: 7, Quantity: 200, GoesOff: "2026-11-09"}, // goes off after the 9th: usable on it
		{ID: 3, IngredientID: 7, Quantity: 100, GoesOff: None},         // no Shelf Life
		{ID: 4, IngredientID: 8, Quantity: 50, GoesOff: "2026-11-01"},  // all gone off
	}
	got := UsableOn(lots, "2026-11-09")
	if !near(got[7], 300) {
		t.Errorf("Ingredient 7 = %v, want 300 (the 11-08 Lot is out)", got[7])
	}
	if q, has := got[8]; has && q != 0 {
		t.Errorf("Ingredient 8 = %v, want nothing", q)
	}
}

func TestUsableOnAWiderDateDropsMoreLots(t *testing.T) {
	lots := []Lot{{ID: 1, IngredientID: 7, Quantity: 500, GoesOff: "2026-11-10"}}
	if got := UsableOn(lots, "2026-11-10"); !near(got[7], 500) {
		t.Errorf("on 11-10 = %v, want 500", got[7])
	}
	if got := UsableOn(lots, "2026-11-12"); got[7] != 0 {
		t.Errorf("on 11-12 = %v, want 0: gone off by the meal date", got[7])
	}
}

func TestUsableOnIgnoresEmptyLotsAndNoLots(t *testing.T) {
	if got := UsableOn(nil, "2026-11-09"); got == nil || len(got) != 0 {
		t.Errorf("no Lots = %v, want an empty map", got)
	}
	if got := UsableOn([]Lot{{ID: 1, IngredientID: 7, Quantity: 0}}, "2026-11-09"); got[7] != 0 {
		t.Errorf("empty Lot = %v", got)
	}
}
