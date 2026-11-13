package shopping

import (
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// B5-BO (docs/adr/0013-bought-planned-meals-held.md, docs/dev/design/b5-bo.md §3): which Planned Meals a purchase was
// bought for. Pure, like Derive: no SQL, HTTP or time.Now.

// Share is the part of one purchase (one Stock Lot) that was bought for one Planned Meal: the amount, in Base Units,
// by which the Lot lowered that Planned Meal's own shortfall on the Ingredient.
type Share struct {
	MealID       int64
	IngredientID int64
	Quantity     float64
}

// Attribute says what the Stock Lot lotID was bought for. It derives the shortfall of every Planned Meal twice from
// the same derivedLines (Planned Meals in date and time order draw Stock one after the other): without the Lot and
// with it (in.Lots holds the Lot already). Each Planned Meal's share is how much its own shortfall on an Ingredient
// went down, so the earliest Planned Meal that was still short is covered first.
//
//   - Only required Lines count (an optional Line is never short), and a Planned Meal served from a Leftover needs
//     nothing.
//   - Only Planned Meals up to in.To count (Meals dated later get nothing), and only those whose slot has not passed
//     (Meal.At is not before in.Now; decision Q18): a Planned Meal of a slot already over still absorbs Stock first, as
//     it does on the list, and gets no share. A Meal with MealID 0 gets none either.
//   - Ticks, Not needed marks and extras play no part.
//   - A share is > 0. Shares are ordered by Planned Meal (date, time, then input order), then by IngredientID; one
//     Planned Meal's several Lines of one Ingredient are one Share.
//   - A lotID that is not in in.Lots, or a Lot that lowers no shortfall, gives nil.
//
// Property (attribute_bought_test.go): when every Planned Meal is in range and not past, the shares of an Ingredient
// add up to the drop in that Ingredient's Line quantity between Derive without the Lot and Derive with it.
func Attribute(in Input, lotID int64) []Share {
	withLot := draws(in)
	without := in
	without.Lots = lotsWithout(in.Lots, lotID)
	withoutLot := draws(without) // the same Planned Meals in the same order: index k is the same meal in both
	// A Lot only changes the draws of its own Ingredient at the top level, but a Base recipe's Ingredient changes what
	// its children make. A share is therefore named under the Lot's Ingredient only (round 2: a bought jar is attributed
	// under its Base recipe Ingredient, not under the milk, butter and flour it saved).
	ing, ok := lotIngredient(in.Lots, lotID)
	if !ok {
		return nil
	}
	var out []Share
	for k, d := range withLot {
		m := d.meal
		if m.MealID == 0 || m.At.Before(in.Now) {
			continue
		}
		if share := withoutLot[k].short[ing] - d.short[ing]; share > eps {
			out = append(out, Share{MealID: m.MealID, IngredientID: ing, Quantity: share})
		}
	}
	return out
}

// lotIngredient is the Ingredient of the Lot with id.
func lotIngredient(lots []stock.Lot, id int64) (int64, bool) {
	for _, l := range lots {
		if l.ID == id {
			return l.IngredientID, true
		}
	}
	return 0, false
}

// lotsWithout returns the Stock Lots except the one with id.
func lotsWithout(lots []stock.Lot, id int64) []stock.Lot {
	out := make([]stock.Lot, 0, len(lots))
	for _, l := range lots {
		if l.ID != id {
			out = append(out, l)
		}
	}
	return out
}
