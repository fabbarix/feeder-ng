package stock

import (
	"errors"
	"math"
	"time"
)

// Editing a Stock Lot by hand (beta.5, spec §6 "Editing and deleting a Lot"). An edit is a correction: it never
// records waste and never counts as a Keep. Storage Place is not part of an edit (Move to changes it).

// Edit is what a User corrects on a Lot. A nil field is left as it is; GoesOff pointing at None clears the go-off date.
type Edit struct {
	Quantity  *float64 // Base Units, > 0
	Purchased *Date    // "Bought on", not after today
	GoesOff   *Date    // "Good until", not before the purchase date; None = no go-off date
}

var (
	// ErrEditEmpty is returned for an Edit that names nothing to change.
	ErrEditEmpty = errors.New("nothing to change")
	// ErrEditQuantity is returned for a quantity that is not a number above zero.
	ErrEditQuantity = errors.New("quantity must be more than zero")
	// ErrEditDate is returned for a date that is not a YYYY-MM-DD calendar date.
	ErrEditDate = errors.New("date must be as YYYY-MM-DD")
	// ErrEditPurchasedFuture is returned for a purchase date after today.
	ErrEditPurchasedFuture = errors.New("bought on cannot be after today")
	// ErrEditGoesOffBeforePurchased is returned for a go-off date before the purchase date.
	ErrEditGoesOffBeforePurchased = errors.New("good until cannot be before bought on")
)

// ValidateEdit applies edit to lot and returns the corrected Lot, or the first rule it breaks.
//
// shelfLifeDays is the Shelf Life that applies where the Lot is (ShelfLifeIn the Lot's Storage Place kind: the frozen
// one in a Freezer), nil when the Ingredient does not spoil there.
//
// Rules:
//   - an Edit with no field is ErrEditEmpty;
//   - Quantity must be finite and > 0 (ErrEditQuantity);
//   - Purchased and GoesOff must be calendar dates (ErrEditDate); Purchased must not be after today (ErrEditPurchasedFuture);
//   - Changing Purchased with no GoesOff given re-suggests the go-off date: new purchase date + shelfLifeDays; with
//     shelfLifeDays nil the go-off date stays;
//   - a go-off date, given or kept, must not be before the (new) purchase date (ErrEditGoesOffBeforePurchased); a
//     Quantity-only edit never fails on dates;
//   - when the go-off date ends up different, KeptOn is cleared (the correction starts the Lot's go-off afresh: a
//     Keep forgave the old date, not the new one);
//   - ID, IngredientID and every other field are untouched.
func ValidateEdit(lot Lot, edit Edit, today Date, shelfLifeDays *int) (Lot, error) {
	if edit.Quantity == nil && edit.Purchased == nil && edit.GoesOff == nil {
		return lot, ErrEditEmpty
	}
	out := lot
	if edit.Quantity != nil {
		q := *edit.Quantity
		if math.IsNaN(q) || math.IsInf(q, 0) || q <= 0 {
			return lot, ErrEditQuantity
		}
		out.Quantity = q
	}
	dateGiven := edit.Purchased != nil || edit.GoesOff != nil
	purchasedChanged := false
	if edit.Purchased != nil {
		p := *edit.Purchased
		if !isDate(p) {
			return lot, ErrEditDate
		}
		if p > today {
			return lot, ErrEditPurchasedFuture
		}
		purchasedChanged = p != lot.Purchased
		out.Purchased = p
	}
	switch {
	case edit.GoesOff != nil:
		if g := *edit.GoesOff; !g.IsNone() && !isDate(g) {
			return lot, ErrEditDate
		}
		out.GoesOff = *edit.GoesOff
	case purchasedChanged && shelfLifeDays != nil:
		out.GoesOff = out.Purchased.AddDays(*shelfLifeDays)
	}
	if dateGiven && !out.GoesOff.IsNone() && out.GoesOff < out.Purchased {
		return lot, ErrEditGoesOffBeforePurchased
	}
	if out.GoesOff != lot.GoesOff {
		out.KeptOn = None
	}
	return out, nil
}

// isDate reports whether d is a strict YYYY-MM-DD calendar date.
func isDate(d Date) bool {
	t, err := time.Parse(dateLayout, string(d))
	return err == nil && t.Format(dateLayout) == string(d)
}
