package stock_test

import (
	"errors"
	"math"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/stock"
)

// Beta.5 UF-stock: DeductPicked (ADR 0011). Default order (Deduct): soonest go-off first, undated last, ties oldest
// purchase, lowest id.

func pickLots() []stock.Lot {
	return []stock.Lot{
		{ID: 1, IngredientID: 7, Quantity: 300, Purchased: "2026-11-01", GoesOff: "2026-11-10"}, // soonest
		{ID: 2, IngredientID: 7, Quantity: 500, Purchased: "2026-11-05", GoesOff: "2026-11-20"},
		{ID: 3, IngredientID: 7, Quantity: 400, Purchased: "2026-11-02"}, // undated
	}
}

func takenMap(ts []stock.Taken) map[int64]float64 {
	m := map[int64]float64{}
	for _, t := range ts {
		m[t.LotID] += t.Quantity
	}
	return m
}

func TestDeductPickedWithoutPicksEqualsDeduct(t *testing.T) {
	for _, picks := range [][]stock.Pick{nil, {}} {
		for _, need := range []float64{0, -3, 100, 300, 301, 1200, 5000} {
			got, err := stock.DeductPicked(pickLots(), need, picks)
			if err != nil {
				t.Fatalf("need %v: %v", need, err)
			}
			want := stock.Deduct(pickLots(), need)
			if !reflect.DeepEqual(got, want) {
				t.Errorf("need %v picks %#v: got %+v, want %+v", need, picks, got, want)
			}
		}
	}
}

func TestDeductPickedTakesPicksFirstThenDefaultRest(t *testing.T) {
	// need 600: user used 250 of lot 2 and 50 of lot 3; the rest 300 is lot 1 (soonest), which holds exactly 300.
	res, err := stock.DeductPicked(pickLots(), 600, []stock.Pick{{LotID: 2, Quantity: 250}, {LotID: 3, Quantity: 50}})
	if err != nil {
		t.Fatal(err)
	}
	want := []stock.Taken{{LotID: 2, Quantity: 250}, {LotID: 3, Quantity: 50}, {LotID: 1, Quantity: 300}}
	if !reflect.DeepEqual(res.Taken, want) {
		t.Fatalf("Taken = %+v, want %+v", res.Taken, want)
	}
	if res.Shortfall != 0 {
		t.Fatalf("Shortfall = %v", res.Shortfall)
	}
	left := map[int64]float64{}
	for _, l := range res.Lots {
		left[l.ID] = l.Quantity
	}
	if !reflect.DeepEqual(left, map[int64]float64{2: 250, 3: 350}) {
		t.Fatalf("remaining = %+v (lot 1 emptied and dropped)", left)
	}
}

func TestDeductPickedKeepsTheUsersOrderOfPicks(t *testing.T) {
	res, err := stock.DeductPicked(pickLots(), 100, []stock.Pick{{LotID: 3, Quantity: 60}, {LotID: 2, Quantity: 40}})
	if err != nil {
		t.Fatal(err)
	}
	want := []stock.Taken{{LotID: 3, Quantity: 60}, {LotID: 2, Quantity: 40}}
	if !reflect.DeepEqual(res.Taken, want) {
		t.Fatalf("Taken = %+v, want %+v", res.Taken, want)
	}
}

func TestDeductPickedRestMayUseWhatIsLeftOfAPickedLot(t *testing.T) {
	// Lot 1 is the soonest; the user picked 100 of it for a need of 500: the rest 400 starts with lot 1's remaining 200.
	res, err := stock.DeductPicked(pickLots(), 500, []stock.Pick{{LotID: 1, Quantity: 100}})
	if err != nil {
		t.Fatal(err)
	}
	want := []stock.Taken{{LotID: 1, Quantity: 300}, {LotID: 2, Quantity: 200}}
	if !reflect.DeepEqual(res.Taken, want) {
		t.Fatalf("Taken = %+v, want one entry per Lot %+v", res.Taken, want)
	}
}

func TestDeductPickedAboveTheNeedIsTakenAsPicked(t *testing.T) {
	res, err := stock.DeductPicked(pickLots(), 100, []stock.Pick{{LotID: 2, Quantity: 450}})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(res.Taken, []stock.Taken{{LotID: 2, Quantity: 450}}) || res.Shortfall != 0 {
		t.Fatalf("res = %+v, want 450 from lot 2 only, no rest, no Shortfall", res)
	}
	if got := takenMap(res.Taken)[1]; got != 0 {
		t.Fatalf("lot 1 touched: %v", got)
	}
}

func TestDeductPickedShortfallWhenStockCannotCoverTheRest(t *testing.T) {
	res, err := stock.DeductPicked(pickLots(), 1500, []stock.Pick{{LotID: 3, Quantity: 400}})
	if err != nil {
		t.Fatal(err)
	}
	if res.Shortfall != 300 || len(res.Lots) != 0 {
		t.Fatalf("res = %+v, want Shortfall 300 and Stock empty", res)
	}
}

func TestDeductPickedWithZeroNeedStillTakesThePicks(t *testing.T) {
	// Mark all Cooked applies every Course's picks first, with need 0, then each Course's rest.
	res, err := stock.DeductPicked(pickLots(), 0, []stock.Pick{{LotID: 2, Quantity: 120}})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(res.Taken, []stock.Taken{{LotID: 2, Quantity: 120}}) || res.Shortfall != 0 {
		t.Fatalf("res = %+v", res)
	}
}

func TestDeductPickedRefusesBadPicks(t *testing.T) {
	tests := []struct {
		name  string
		lots  []stock.Lot
		picks []stock.Pick
		is    error
	}{
		{"unknown lot", pickLots(), []stock.Pick{{LotID: 99, Quantity: 10}}, stock.ErrPickUnknownLot},
		{"lot of another Ingredient is not in the lots given", pickLots(), []stock.Pick{{LotID: 41, Quantity: 10}}, stock.ErrPickUnknownLot},
		{"gone (empty) lot", append(pickLots(), stock.Lot{ID: 4, IngredientID: 7, Quantity: 0}), []stock.Pick{{LotID: 4, Quantity: 1}}, stock.ErrPickUnknownLot},
		{"more than the lot holds", pickLots(), []stock.Pick{{LotID: 1, Quantity: 300.5}}, stock.ErrPickTooMuch},
		{"two picks of one lot add up to too much", pickLots(), []stock.Pick{{LotID: 1, Quantity: 200}, {LotID: 1, Quantity: 150}}, stock.ErrPickTooMuch},
		{"zero quantity", pickLots(), []stock.Pick{{LotID: 1, Quantity: 0}}, stock.ErrPickQuantity},
		{"negative quantity", pickLots(), []stock.Pick{{LotID: 1, Quantity: -5}}, stock.ErrPickQuantity},
		{"NaN quantity", pickLots(), []stock.Pick{{LotID: 1, Quantity: math.NaN()}}, stock.ErrPickQuantity},
		{"infinite quantity", pickLots(), []stock.Pick{{LotID: 1, Quantity: math.Inf(1)}}, stock.ErrPickQuantity},
	}
	for _, tc := range tests {
		res, err := stock.DeductPicked(tc.lots, 100, tc.picks)
		if !errors.Is(err, tc.is) {
			t.Errorf("%s: err = %v, want %v", tc.name, err, tc.is)
		}
		if len(res.Taken) != 0 || len(res.Lots) != 0 || res.Shortfall != 0 {
			t.Errorf("%s: refused call returned %+v, want the zero result", tc.name, res)
		}
	}
}

func TestDeductPickedTwoPicksOfOneLotWithinWhatItHoldsAreSummed(t *testing.T) {
	res, err := stock.DeductPicked(pickLots(), 200, []stock.Pick{{LotID: 1, Quantity: 120}, {LotID: 1, Quantity: 80}})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(res.Taken, []stock.Taken{{LotID: 1, Quantity: 200}}) {
		t.Fatalf("Taken = %+v", res.Taken)
	}
}

func TestDeductPickedDoesNotModifyItsInput(t *testing.T) {
	lots := pickLots()
	picks := []stock.Pick{{LotID: 2, Quantity: 100}}
	if _, err := stock.DeductPicked(lots, 600, picks); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(lots, pickLots()) || !reflect.DeepEqual(picks, []stock.Pick{{LotID: 2, Quantity: 100}}) {
		t.Fatalf("input modified: %+v %+v", lots, picks)
	}
}
