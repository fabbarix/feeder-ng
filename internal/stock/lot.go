// Package stock holds the pure Stock rules of Feeder (ADR 0003): Stock Lots,
// deduction when a Planned Meal is Cooked, Stock-take, spoiled detection and
// totals. No SQL, HTTP or clock: dates and "today" are passed in.
package stock

import "errors"

// Date is a household-time calendar date as "YYYY-MM-DD". The empty Date means
// "none". Valid dates compare correctly as strings.
type Date string

// None is the absent Date.
const None Date = ""

// AddDays returns the date n days later (n may be negative). The receiver must
// be a valid date.
func (d Date) AddDays(n int) Date {
	panic("TODO")
}

// IsNone reports whether d is the absent Date.
func (d Date) IsNone() bool { return d == None }

// Lot is a Stock Lot: one purchase's worth of an Ingredient, quantity in Base Units.
type Lot struct {
	ID           int64
	IngredientID int64
	Quantity     float64 // Base Units, > 0 for a stored lot
	Purchased    Date
	GoesOff      Date // purchase date + Shelf Life, or None
}

// NewLot builds a Lot; shelfLifeDays nil means the Ingredient has no Shelf
// Life, so GoesOff is None.
func NewLot(id, ingredientID int64, quantity float64, purchased Date, shelfLifeDays *int) Lot {
	panic("TODO")
}

// Taken is a quantity removed from one lot.
type Taken struct {
	LotID    int64
	Quantity float64
}

// DeductResult is the outcome of Deduct.
type DeductResult struct {
	Lots      []Lot   // remaining lots, original order, emptied lots removed
	Taken     []Taken // in consumption order
	Shortfall float64 // need that Stock could not cover (>= 0)
}

// Deduct takes need (Base Units) from lots: lots with a go-off date first,
// soonest first, then lots without one; ties (and the undated lots) oldest
// purchase first, then lowest ID. Stock floors at 0; the uncovered part is
// reported as Shortfall. need <= 0 changes nothing. The input is not modified.
func Deduct(lots []Lot, need float64) DeductResult {
	panic("TODO")
}

// Line is one Recipe ingredient line already converted to Base Units, for one Batch.
type Line struct {
	IngredientID int64
	Quantity     float64
	Optional     bool
}

// Need is the total to deduct for one Ingredient.
type Need struct {
	IngredientID int64
	Quantity     float64
}

// CookedNeeds returns what marking a Planned Meal Cooked deducts: batches x
// line quantity, optional lines excluded, lines of the same Ingredient summed.
// Order is that of first appearance. batches <= 0 yields nothing.
func CookedNeeds(batches float64, lines []Line) []Need {
	panic("TODO")
}

// ErrNegativeTotal is returned by SetTotal for a negative total.
var ErrNegativeTotal = errors.New("negative total")

// SetTotalResult is the outcome of SetTotal.
type SetTotalResult struct {
	Lots    []Lot   // resulting lots (a new lot, ID 0, is appended last)
	Removed []Taken // decrease: what was removed, soonest-to-spoil first
	Added   *Lot    // increase: the new lot (ID 0, for the store to assign); nil otherwise
}

// SetTotal is a Stock-take: it makes the Ingredient's total equal total. A
// decrease removes quantity exactly as Deduct does (soonest to spoil first); an
// increase adds one new lot of the difference, purchased today, with GoesOff
// today + shelfLifeDays (None when nil). All lots must be of one Ingredient;
// ingredientID is used for the new lot. Unchanged total changes nothing.
func SetTotal(lots []Lot, ingredientID int64, total float64, today Date, shelfLifeDays *int) (SetTotalResult, error) {
	panic("TODO")
}

// Total sums the quantities of lots.
func Total(lots []Lot) float64 {
	panic("TODO")
}

// Totals sums the quantities per Ingredient.
func Totals(lots []Lot) map[int64]float64 {
	panic("TODO")
}

// Spoiled returns the lots whose go-off date is before today (a lot is still
// fine on its go-off date), ordered by go-off date then ID. Lots without a
// go-off date are never spoiled.
func Spoiled(lots []Lot, today Date) []Lot {
	panic("TODO")
}

// Keep returns the lot with its go-off date pushed out by 1 day ("Keep" on a
// spoiled lot). A lot without a go-off date is returned unchanged.
func Keep(lot Lot) Lot {
	panic("TODO")
}
