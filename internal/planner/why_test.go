package planner

import (
	"reflect"
	"testing"
)

// §7.2 step 5: why chips are the 1-3 largest POSITIVE score terms, as structured reason codes.

func whyCodes(p Placement) []ReasonCode {
	var out []ReasonCode
	for _, w := range p.Why {
		out = append(out, w.Code)
	}
	return out
}

func TestWhyChipsAreTheTopThreePositiveTerms(t *testing.T) {
	// Recipe 2 (Yield 4: pasta 200, spinach 300) on day 0 scores:
	//   Favourite 2 x 2 = 4, perishable use 0.5 x 3 = 1.5, extra portions fits 1, stock coverage 0.5 x 0.75 = 0.375 (+ jitter).
	// The top 3 are favourite, perishable use, leftover fits; stock coverage is cut.
	in := baseInput([]Slot{dinner(0), dinner(1)}, rcp(1, 2, needs(need(chicken, 500))), rcp(2, 4, needs(need(pasta, 200), need(spinach, 300))))
	w := WeightsFor(0.5)
	in.Weights = &w
	in.Members = map[MemberID]Preferences{anna: {Favourites: []RecipeID{2}}, ben: {Favourites: []RecipeID{2}}}
	in.Lots = []StockLot{lot(1, spinach, 300, day(1))}
	p := placementAt(t, mustPlan(t, in), key(0))
	if p.RecipeID != 2 {
		t.Fatalf("recipe = %d, want 2", p.RecipeID)
	}
	want := []Why{
		{Code: ReasonFavourite, Value: 4, MemberIDs: []MemberID{anna, ben}},
		{Code: ReasonPerishableUse, Value: 1.5, IngredientID: spinach, Date: day(1)},
		{Code: ReasonLeftoverFits, Value: 1, Date: day(1)},
	}
	if len(p.Why) != 3 {
		t.Fatalf("chips = %+v, want 3", p.Why)
	}
	for i := range want {
		got := p.Why[i]
		if !approx(got.Value, want[i].Value) {
			t.Errorf("chip %d value = %v, want %v", i, got.Value, want[i].Value)
		}
		got.Value, want[i].Value = 0, 0
		if !reflect.DeepEqual(got, want[i]) {
			t.Errorf("chip %d = %+v, want %+v", i, got, want[i])
		}
	}
	for _, c := range whyCodes(p) {
		if c == ReasonStockCoverage {
			t.Errorf("stock coverage should have been cut: %+v", p.Why)
		}
	}
}

func TestWhyChipsCount(t *testing.T) {
	t.Run("a single positive term gives a single chip", func(t *testing.T) {
		in := weighted(baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2)), Weights{Favourite: 3})
		in = prefs(in, anna, Preferences{Favourites: []RecipeID{2}})
		p := placementAt(t, mustPlan(t, in), key(0))
		if got := whyCodes(p); !reflect.DeepEqual(got, []ReasonCode{ReasonFavourite}) {
			t.Errorf("chips = %v", got)
		}
		if !reflect.DeepEqual(p.Why[0].MemberIDs, []MemberID{anna}) {
			t.Errorf("member ids = %v", p.Why[0].MemberIDs)
		}
	})
	t.Run("two positive terms give two chips, largest first", func(t *testing.T) {
		in := weighted(baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2, needs(need(spinach, 300)))), Weights{Favourite: 1, StockCoverage: 3})
		in = prefs(in, anna, Preferences{Favourites: []RecipeID{2}})
		in.Lots = []StockLot{lot(1, spinach, 300, "")}
		p := placementAt(t, mustPlan(t, in), key(0))
		if got := whyCodes(p); !reflect.DeepEqual(got, []ReasonCode{ReasonStockCoverage, ReasonFavourite}) {
			t.Errorf("chips = %v", got)
		}
	})
	t.Run("negative terms never become chips", func(t *testing.T) {
		in := weighted(baseInput([]Slot{dinner(0)}, rcp(1, 2)), Weights{Dislike: -2})
		in = prefs(in, anna, Preferences{Dislikes: []RecipeID{1}})
		p := placementAt(t, mustPlan(t, in), key(0))
		if got := whyCodes(p); !reflect.DeepEqual(got, []ReasonCode{ReasonBestAvailable}) {
			t.Errorf("chips = %v", got)
		}
	})
	t.Run("jitter never becomes a chip; with nothing positive there is still one chip", func(t *testing.T) {
		in := weighted(baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2)), Weights{Jitter: 0.5})
		p := placementAt(t, mustPlan(t, in), key(0))
		if got := whyCodes(p); !reflect.DeepEqual(got, []ReasonCode{ReasonBestAvailable}) {
			t.Errorf("chips = %v", got)
		}
	})
}

func TestWhyChipParameters(t *testing.T) {
	t.Run("ingredient overlap names the Ingredient and the day the pack was planned", func(t *testing.T) {
		in := weighted(baseInput([]Slot{withRules(dinner(0), SlotRule{RecipeID: 1}), dinner(1)},
			rcp(1, 2, needs(need(chicken, 500))), rcp(2, 2, needs(need(pasta, 200))), rcp(4, 2, needs(need(chicken, 500)))), Weights{IngredientOverlap: 2})
		in.Packs = map[IngredientID]Pack{chicken: {ProductID: 5, Size: 1000}}
		p := placementAt(t, mustPlan(t, in), key(1))
		want := Why{Code: ReasonIngredientOverlap, Value: 2, IngredientID: chicken, Date: day(0)}
		if len(p.Why) != 1 || !approx(p.Why[0].Value, 2) {
			t.Fatalf("chips = %+v", p.Why)
		}
		p.Why[0].Value = 0
		want.Value = 0
		if !reflect.DeepEqual(p.Why[0], want) {
			t.Errorf("chip = %+v, want %+v", p.Why[0], want)
		}
	})
	t.Run("perishable use names the Ingredient with the biggest covered share", func(t *testing.T) {
		in := weighted(baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2, needs(need(pasta, 200), need(spinach, 300)))), Weights{PerishableUse: 4})
		in.Lots = []StockLot{lot(1, pasta, 50, day(1)), lot(2, spinach, 300, day(2))}
		p := placementAt(t, mustPlan(t, in), key(0))
		if len(p.Why) != 1 || p.Why[0].Code != ReasonPerishableUse || p.Why[0].IngredientID != spinach || p.Why[0].Date != day(2) {
			t.Errorf("chips = %+v", p.Why)
		}
	})
	// GW: the chip date is the lot's last good day, i.e. its go-off date itself (a Lot is fine on
	// its go-off date, spec 6.1), never go-off date + 1. The web phrases it "uses X by <day>".
	t.Run("perishable use carries the go-off date, the last good day, even when it is the slot's own day", func(t *testing.T) {
		in := weighted(baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2, needs(need(spinach, 300)))), Weights{PerishableUse: 4})
		in.Lots = []StockLot{lot(1, spinach, 300, day(0))}
		p := placementAt(t, mustPlan(t, in), key(0))
		if len(p.Why) != 1 || p.Why[0].Code != ReasonPerishableUse || p.Why[0].Date != day(0) {
			t.Errorf("chips = %+v, want the go-off date %s", p.Why, day(0))
		}
	})
}

func TestWhyChipForSlotRule(t *testing.T) {
	t.Run("a Slot Rule by Tag comes first, then the best score terms", func(t *testing.T) {
		in := weighted(baseInput([]Slot{withRules(dinner(0), SlotRule{Tag: "pizza"})}, rcp(1, 2), rcp(2, 2, tags("pizza")), rcp(3, 2, tags("pizza"))), Weights{Favourite: 3})
		in = prefs(in, anna, Preferences{Favourites: []RecipeID{3}})
		p := placementAt(t, mustPlan(t, in), key(0))
		if p.RecipeID != 3 {
			t.Fatalf("recipe = %d", p.RecipeID)
		}
		if got := whyCodes(p); !reflect.DeepEqual(got, []ReasonCode{ReasonSlotRule, ReasonFavourite}) {
			t.Fatalf("chips = %v", got)
		}
		if p.Why[0].Tag != "pizza" {
			t.Errorf("slot rule chip = %+v", p.Why[0])
		}
	})
	t.Run("a Slot Rule by Recipe", func(t *testing.T) {
		in := baseInput([]Slot{withRules(dinner(0), SlotRule{RecipeID: 2})}, rcp(1, 2), rcp(2, 2))
		p := placementAt(t, mustPlan(t, in), key(0))
		if len(p.Why) != 1 || p.Why[0].Code != ReasonSlotRule || p.Why[0].RecipeID != 2 {
			t.Errorf("chips = %+v", p.Why)
		}
	})
	t.Run("at most 3 chips including the Slot Rule", func(t *testing.T) {
		in := weighted(baseInput([]Slot{withRules(dinner(0), SlotRule{RecipeID: 2}), dinner(1)}, rcp(1, 2), rcp(2, 4, needs(need(spinach, 300)))),
			Weights{Favourite: 3, StockCoverage: 2, LeftoverFits: 1, PerishableUse: 4})
		in = prefs(in, anna, Preferences{Favourites: []RecipeID{2}})
		in.Lots = []StockLot{lot(1, spinach, 300, day(1))}
		p := placementAt(t, mustPlan(t, in), key(0))
		if len(p.Why) != 3 || p.Why[0].Code != ReasonSlotRule {
			t.Errorf("chips = %+v", p.Why)
		}
	})
}

func TestWhyChipForLeftover(t *testing.T) {
	in := baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2))
	in.Leftovers = []Leftover{{ID: 7, RecipeID: 2, Portions: 2, CookedOn: day(-2), UseBy: day(1)}}
	p := placementAt(t, mustPlan(t, in), key(0))
	if len(p.Why) != 1 || p.Why[0].Code != ReasonLeftover || p.Why[0].Date != day(-2) || p.Why[0].RecipeID != 2 {
		t.Errorf("chips = %+v", p.Why)
	}
}
