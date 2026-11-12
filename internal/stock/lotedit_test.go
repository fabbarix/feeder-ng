package stock

import (
	"errors"
	"math"
	"testing"
)

func fp(f float64) *float64 { return &f }
func dp(d Date) *Date       { return &d }

func TestValidateEdit(t *testing.T) {
	const today = Date("2026-11-12")
	base := Lot{ID: 7, IngredientID: 3, Quantity: 800, Purchased: "2026-11-09", GoesOff: "2026-11-13", KeptOn: "2026-11-11"}
	noGoOff := Lot{ID: 8, IngredientID: 3, Quantity: 500, Purchased: "2026-11-09"}
	tests := []struct {
		name  string
		lot   Lot
		edit  Edit
		shelf *int
		want  Lot
		err   error
	}{
		{name: "empty edit", lot: base, edit: Edit{}, shelf: ptr(4), err: ErrEditEmpty},
		{name: "quantity only", lot: base, edit: Edit{Quantity: fp(650)}, shelf: ptr(4),
			want: Lot{ID: 7, IngredientID: 3, Quantity: 650, Purchased: "2026-11-09", GoesOff: "2026-11-13", KeptOn: "2026-11-11"}},
		{name: "quantity must be above zero", lot: base, edit: Edit{Quantity: fp(0)}, shelf: ptr(4), err: ErrEditQuantity},
		{name: "negative quantity", lot: base, edit: Edit{Quantity: fp(-1)}, shelf: ptr(4), err: ErrEditQuantity},
		{name: "NaN quantity", lot: base, edit: Edit{Quantity: fp(math.NaN())}, shelf: ptr(4), err: ErrEditQuantity},
		{name: "infinite quantity", lot: base, edit: Edit{Quantity: fp(math.Inf(1))}, shelf: ptr(4), err: ErrEditQuantity},
		{name: "quantity-only edit never fails on dates even when the stored dates are odd", lot: Lot{ID: 1, Quantity: 5, Purchased: "2026-11-10", GoesOff: "2026-11-01"},
			edit: Edit{Quantity: fp(6)}, shelf: ptr(4), want: Lot{ID: 1, Quantity: 6, Purchased: "2026-11-10", GoesOff: "2026-11-01"}},
		{name: "bought on re-suggests good until from the Shelf Life", lot: base, edit: Edit{Purchased: dp("2026-11-10")}, shelf: ptr(4),
			want: Lot{ID: 7, IngredientID: 3, Quantity: 800, Purchased: "2026-11-10", GoesOff: "2026-11-14"}},
		{name: "a Freezer Shelf Life is the caller's shelfLifeDays", lot: base, edit: Edit{Purchased: dp("2026-11-01")}, shelf: ptr(90),
			want: Lot{ID: 7, IngredientID: 3, Quantity: 800, Purchased: "2026-11-01", GoesOff: "2027-01-30"}},
		{name: "bought on without a Shelf Life keeps the go-off date", lot: base, edit: Edit{Purchased: dp("2026-11-11")}, shelf: nil,
			want: Lot{ID: 7, IngredientID: 3, Quantity: 800, Purchased: "2026-11-11", GoesOff: "2026-11-13", KeptOn: "2026-11-11"}},
		{name: "bought on later than a kept go-off date with no Shelf Life is refused", lot: base, edit: Edit{Purchased: dp("2026-11-12")}, shelf: nil, err: ErrEditGoesOffBeforePurchased},
		{name: "bought on unchanged does not re-suggest", lot: base, edit: Edit{Purchased: dp("2026-11-09")}, shelf: ptr(30),
			want: base},
		{name: "good until given in the same edit wins over the suggestion", lot: base, edit: Edit{Purchased: dp("2026-11-10"), GoesOff: dp("2026-11-20")}, shelf: ptr(4),
			want: Lot{ID: 7, IngredientID: 3, Quantity: 800, Purchased: "2026-11-10", GoesOff: "2026-11-20"}},
		{name: "good until alone", lot: base, edit: Edit{GoesOff: dp("2026-11-15")}, shelf: ptr(4),
			want: Lot{ID: 7, IngredientID: 3, Quantity: 800, Purchased: "2026-11-09", GoesOff: "2026-11-15"}},
		{name: "good until on the purchase date is allowed", lot: base, edit: Edit{GoesOff: dp("2026-11-09")}, shelf: ptr(4),
			want: Lot{ID: 7, IngredientID: 3, Quantity: 800, Purchased: "2026-11-09", GoesOff: "2026-11-09"}},
		{name: "good until before bought on", lot: base, edit: Edit{GoesOff: dp("2026-11-08")}, shelf: ptr(4), err: ErrEditGoesOffBeforePurchased},
		{name: "good until before the new bought on", lot: base, edit: Edit{Purchased: dp("2026-11-12"), GoesOff: dp("2026-11-11")}, shelf: ptr(4), err: ErrEditGoesOffBeforePurchased},
		{name: "good until in the past is allowed (the Lot is spoiled now)", lot: base, edit: Edit{GoesOff: dp("2026-11-10")}, shelf: ptr(4),
			want: Lot{ID: 7, IngredientID: 3, Quantity: 800, Purchased: "2026-11-09", GoesOff: "2026-11-10"}},
		{name: "good until moved later clears the Keep", lot: Lot{ID: 9, Quantity: 1, Purchased: "2026-11-01", GoesOff: "2026-11-05", KeptOn: "2026-11-06"},
			edit: Edit{GoesOff: dp("2026-11-30")}, shelf: ptr(4), want: Lot{ID: 9, Quantity: 1, Purchased: "2026-11-01", GoesOff: "2026-11-30"}},
		{name: "good until set to its own value keeps the Keep", lot: base, edit: Edit{GoesOff: dp("2026-11-13")}, shelf: ptr(4), want: base},
		{name: "clearing good until", lot: base, edit: Edit{GoesOff: dp(None)}, shelf: nil,
			want: Lot{ID: 7, IngredientID: 3, Quantity: 800, Purchased: "2026-11-09"}},
		{name: "giving a go-off date to a Lot without one", lot: noGoOff, edit: Edit{GoesOff: dp("2026-11-20")}, shelf: nil,
			want: Lot{ID: 8, IngredientID: 3, Quantity: 500, Purchased: "2026-11-09", GoesOff: "2026-11-20"}},
		{name: "bought on today", lot: base, edit: Edit{Purchased: dp(today)}, shelf: ptr(4),
			want: Lot{ID: 7, IngredientID: 3, Quantity: 800, Purchased: today, GoesOff: "2026-11-16"}},
		{name: "bought on tomorrow", lot: base, edit: Edit{Purchased: dp("2026-11-13")}, shelf: ptr(4), err: ErrEditPurchasedFuture},
		{name: "bought on is not a date", lot: base, edit: Edit{Purchased: dp("12 Nov")}, shelf: ptr(4), err: ErrEditDate},
		{name: "bought on cannot be cleared", lot: base, edit: Edit{Purchased: dp(None)}, shelf: ptr(4), err: ErrEditDate},
		{name: "good until is not a date", lot: base, edit: Edit{GoesOff: dp("2026-13-40")}, shelf: ptr(4), err: ErrEditDate},
		{name: "all three at once", lot: base, edit: Edit{Quantity: fp(250), Purchased: dp("2026-11-05"), GoesOff: dp("2026-11-18")}, shelf: ptr(4),
			want: Lot{ID: 7, IngredientID: 3, Quantity: 250, Purchased: "2026-11-05", GoesOff: "2026-11-18"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ValidateEdit(tc.lot, tc.edit, today, tc.shelf)
			if tc.err != nil {
				if !errors.Is(err, tc.err) {
					t.Fatalf("err = %v, want %v", err, tc.err)
				}
				return
			}
			if err != nil {
				t.Fatalf("err = %v", err)
			}
			if got != tc.want {
				t.Errorf("got  %+v\nwant %+v", got, tc.want)
			}
		})
	}
}

func TestValidateEditDoesNotChangeItsInput(t *testing.T) {
	lot := Lot{ID: 1, Quantity: 5, Purchased: "2026-11-01", GoesOff: "2026-11-05"}
	q := 9.0
	if _, err := ValidateEdit(lot, Edit{Quantity: &q}, "2026-11-12", nil); err != nil {
		t.Fatal(err)
	}
	if lot.Quantity != 5 || q != 9 {
		t.Errorf("input changed: %+v %v", lot, q)
	}
}
