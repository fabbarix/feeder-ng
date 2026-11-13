package stock_test

import (
	"errors"
	"math"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/stock"
)

// H9 (docs/dev/design/household-items.md section 4.11): stock.Use takes a quantity of a Supply out of its Lots, oldest
// purchased first (a Supply's Lots have no go-off date, so this is Deduct's order for undated Lots: oldest purchase,
// then lowest ID). Unlike Deduct it never floors: asking for more than the Stock holds, or for 0 or less, is an error and
// changes nothing. It is pure: no SQL, no clock, the input is not modified.
//
//	func Use(lots []Lot, quantity float64) (UseResult, error)
//	type UseResult struct { Lots []Lot; Taken []Taken }   // Lots: what is left (emptied Lots dropped, original order); Taken: in the order taken
//	var ErrUseNotPositive  // quantity <= 0, NaN or Inf
//	var ErrUseExceedsStock // quantity > Total(lots) (beyond the float tolerance)

func paperLots() []stock.Lot {
	return []stock.Lot{
		{ID: 12, IngredientID: 22, Quantity: 9, Purchased: "2026-11-05"},
		{ID: 11, IngredientID: 22, Quantity: 4, Purchased: "2026-11-01"},
		{ID: 13, IngredientID: 22, Quantity: 9, Purchased: "2026-11-05"},
	}
}

func TestUseTakesFromTheOldestPurchasedLotFirst(t *testing.T) {
	res, err := stock.Use(paperLots(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if want := []stock.Taken{{LotID: 11, Quantity: 1}}; !reflect.DeepEqual(res.Taken, want) {
		t.Fatalf("taken = %+v, want %+v", res.Taken, want)
	}
	if stock.Total(res.Lots) != 21 || len(res.Lots) != 3 {
		t.Fatalf("left = %+v, want 3 Lots holding 21", res.Lots)
	}
}

func TestUseSpansLotsAndDropsTheEmptiedOnes(t *testing.T) {
	res, err := stock.Use(paperLots(), 10) // 4 from #11, 6 from #12
	if err != nil {
		t.Fatal(err)
	}
	want := []stock.Taken{{LotID: 11, Quantity: 4}, {LotID: 12, Quantity: 6}}
	if !reflect.DeepEqual(res.Taken, want) {
		t.Fatalf("taken = %+v, want %+v", res.Taken, want)
	}
	if len(res.Lots) != 2 || res.Lots[0].ID != 12 || res.Lots[0].Quantity != 3 || res.Lots[1].ID != 13 || res.Lots[1].Quantity != 9 {
		t.Fatalf("left = %+v, want #12 with 3 and #13 with 9, in the original order", res.Lots)
	}
}

func TestUseBreaksAPurchaseTieByTheLowestID(t *testing.T) {
	res, err := stock.Use(paperLots(), 6) // #11 gives 4, then #12 (before #13, same day) gives 2
	if err != nil {
		t.Fatal(err)
	}
	want := []stock.Taken{{LotID: 11, Quantity: 4}, {LotID: 12, Quantity: 2}}
	if !reflect.DeepEqual(res.Taken, want) {
		t.Fatalf("taken = %+v, want %+v", res.Taken, want)
	}
}

func TestUseCanTakeEverything(t *testing.T) {
	res, err := stock.Use(paperLots(), 22)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Lots) != 0 || len(res.Taken) != 3 {
		t.Fatalf("res = %+v, want no Lots left and 3 taken", res)
	}
	sum := 0.0
	for _, tk := range res.Taken {
		sum += tk.Quantity
	}
	if sum != 22 {
		t.Fatalf("taken sums to %v, want 22", sum)
	}
}

func TestUseOfFractionsKeepsTheTotalExact(t *testing.T) {
	lots := []stock.Lot{{ID: 1, IngredientID: 21, Quantity: 500, Purchased: "2026-11-01"}}
	res, err := stock.Use(lots, 125.5)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Lots) != 1 || res.Lots[0].Quantity != 374.5 {
		t.Fatalf("left = %+v, want 374.5", res.Lots)
	}
}

func TestUseOfMoreThanTheStockIsRefusedAndChangesNothing(t *testing.T) {
	lots := paperLots()
	before := paperLots()
	res, err := stock.Use(lots, 22.5)
	if !errors.Is(err, stock.ErrUseExceedsStock) {
		t.Fatalf("err = %v, want ErrUseExceedsStock", err)
	}
	if len(res.Taken) != 0 {
		t.Fatalf("taken = %+v, want none", res.Taken)
	}
	if !reflect.DeepEqual(lots, before) {
		t.Fatalf("the input changed: %+v", lots)
	}
}

func TestUseWithNoLotsIsRefusedAsMoreThanTheStock(t *testing.T) {
	if _, err := stock.Use(nil, 1); !errors.Is(err, stock.ErrUseExceedsStock) {
		t.Fatalf("err = %v, want ErrUseExceedsStock", err)
	}
}

func TestUseOfNothingOrLessIsRefused(t *testing.T) {
	for _, q := range []float64{0, -1, math.NaN(), math.Inf(1), math.Inf(-1)} {
		if _, err := stock.Use(paperLots(), q); !errors.Is(err, stock.ErrUseNotPositive) {
			t.Errorf("Use(%v) err = %v, want ErrUseNotPositive", q, err)
		}
	}
}

func TestUseDoesNotModifyItsInput(t *testing.T) {
	lots := paperLots()
	if _, err := stock.Use(lots, 10); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(lots, paperLots()) {
		t.Fatalf("the input changed: %+v", lots)
	}
}

func TestUseTakesInTheOrderDeductDoes(t *testing.T) {
	lots := paperLots()
	got, err := stock.Use(lots, 15)
	if err != nil {
		t.Fatal(err)
	}
	want := stock.Deduct(lots, 15)
	if !reflect.DeepEqual(got.Taken, want.Taken) || !reflect.DeepEqual(got.Lots, want.Lots) {
		t.Fatalf("Use = %+v, Deduct = %+v: for Lots without a go-off date they must agree", got, want)
	}
}
