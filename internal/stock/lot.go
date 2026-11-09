// Package stock holds the pure Stock rules of Feeder (ADR 0003): Stock Lots,
// deduction when a Planned Meal is Cooked, Stock-take, spoiled detection and
// totals. No SQL, HTTP or clock: dates and "today" are passed in.
package stock

import (
	"errors"
	"math"
	"sort"
	"time"
)

// Date is a household-time calendar date as "YYYY-MM-DD". The empty Date means
// "none". Valid dates compare correctly as strings.
type Date string

// None is the absent Date.
const None Date = ""

const dateLayout = "2006-01-02"

// eps is the float tolerance for quantities: a lot at or below eps is empty,
// and a difference at or below eps is no difference (Deduct and SetTotal).
const eps = 1e-9

// AddDays returns the date n days later (n may be negative). The receiver must
// be a valid date.
func (d Date) AddDays(n int) Date {
	t, err := time.Parse(dateLayout, string(d))
	if err != nil {
		return None
	}
	return Date(t.AddDate(0, 0, n).Format(dateLayout))
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
	goesOff := None
	if shelfLifeDays != nil {
		goesOff = purchased.AddDays(*shelfLifeDays)
	}
	return Lot{
		ID:           id,
		IngredientID: ingredientID,
		Quantity:     quantity,
		Purchased:    purchased,
		GoesOff:      goesOff,
	}
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

// consumptionLess orders lots for consumption: lots with a go-off date first
// (soonest first), then lots without one; ties by oldest purchase, then lowest ID.
func consumptionLess(a, b Lot) bool {
	if a.GoesOff.IsNone() != b.GoesOff.IsNone() {
		return !a.GoesOff.IsNone()
	}
	if a.GoesOff != b.GoesOff {
		return a.GoesOff < b.GoesOff
	}
	if a.Purchased != b.Purchased {
		return a.Purchased < b.Purchased
	}
	return a.ID < b.ID
}

// Deduct takes need (Base Units) from lots: lots with a go-off date first,
// soonest first, then lots without one; ties (and the undated lots) oldest
// purchase first, then lowest ID. Stock floors at 0; the uncovered part is
// reported as Shortfall. need <= 0 or NaN/Inf changes nothing. Lots at or below
// eps are dropped and a Shortfall at or below eps is 0. The input is not modified.
func Deduct(lots []Lot, need float64) DeductResult {
	remaining := make([]Lot, len(lots))
	copy(remaining, lots)
	var res DeductResult
	if need <= 0 || math.IsNaN(need) || math.IsInf(need, 0) {
		res.Lots = remaining
		return res
	}

	order := make([]int, len(lots))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(i, j int) bool {
		return consumptionLess(lots[order[i]], lots[order[j]])
	})

	left := need
	for _, idx := range order {
		if left <= eps {
			break
		}
		l := &remaining[idx]
		if l.Quantity <= eps {
			continue
		}
		take := math.Min(left, l.Quantity)
		res.Taken = append(res.Taken, Taken{LotID: l.ID, Quantity: take})
		l.Quantity -= take
		left -= take
	}
	if left > eps {
		res.Shortfall = left
	}

	res.Lots = make([]Lot, 0, len(remaining))
	for _, l := range remaining {
		if l.Quantity > eps {
			res.Lots = append(res.Lots, l)
		}
	}
	return res
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
	if !(batches > 0) || math.IsInf(batches, 0) {
		return nil
	}
	var out []Need
	index := map[int64]int{}
	for _, l := range lines {
		if l.Optional {
			continue
		}
		qty := batches * l.Quantity
		if i, ok := index[l.IngredientID]; ok {
			out[i].Quantity += qty
			continue
		}
		index[l.IngredientID] = len(out)
		out = append(out, Need{IngredientID: l.IngredientID, Quantity: qty})
	}
	return out
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
	if math.IsNaN(total) || total < 0 {
		return SetTotalResult{}, ErrNegativeTotal
	}
	current := Total(lots)
	diff := total - current

	switch {
	case math.Abs(diff) < eps:
		kept := make([]Lot, len(lots))
		copy(kept, lots)
		return SetTotalResult{Lots: kept}, nil

	case diff < 0:
		res := Deduct(lots, -diff)
		return SetTotalResult{Lots: res.Lots, Removed: res.Taken}, nil

	default:
		goesOff := None
		if shelfLifeDays != nil {
			goesOff = today.AddDays(*shelfLifeDays)
		}
		added := Lot{
			ID:           0,
			IngredientID: ingredientID,
			Quantity:     diff,
			Purchased:    today,
			GoesOff:      goesOff,
		}
		out := make([]Lot, 0, len(lots)+1)
		out = append(out, lots...)
		out = append(out, added)
		return SetTotalResult{Lots: out, Added: &added}, nil
	}
}

// Total sums the quantities of lots.
func Total(lots []Lot) float64 {
	var sum float64
	for _, l := range lots {
		sum += l.Quantity
	}
	return sum
}

// Totals sums the quantities per Ingredient.
func Totals(lots []Lot) map[int64]float64 {
	out := make(map[int64]float64)
	for _, l := range lots {
		out[l.IngredientID] += l.Quantity
	}
	return out
}

// Spoiled returns the lots whose go-off date is before today (a lot is still
// fine on its go-off date), ordered by go-off date then ID. Lots without a
// go-off date are never spoiled.
func Spoiled(lots []Lot, today Date) []Lot {
	var out []Lot
	for _, l := range lots {
		if !l.GoesOff.IsNone() && l.GoesOff < today {
			out = append(out, l)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].GoesOff != out[j].GoesOff {
			return out[i].GoesOff < out[j].GoesOff
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// Keep returns the lot with its go-off date pushed out by 1 day ("Keep" on a
// spoiled lot). A lot without a go-off date is returned unchanged.
func Keep(lot Lot) Lot {
	if lot.GoesOff.IsNone() {
		return lot
	}
	lot.GoesOff = lot.GoesOff.AddDays(1)
	return lot
}
