package stock

// UseSoonDays is how many days ahead a lot counts as "use soon".
const UseSoonDays = 3

// FormatQuantity writes a Base Unit quantity as text: "300 g", "1.5 ml",
// "1 piece", "2 pieces". At most 2 decimals, trailing zeros trimmed.
func FormatQuantity(q float64, base string) string {
	panic("TODO")
}

// ShortfallMessage is the warning shown when Stock cannot cover a Cooked meal:
// "Stock shows only 300 g chicken thighs, the recipe uses 800 g". With nothing in
// Stock: "Stock shows no chicken thighs, the recipe uses 800 g".
func ShortfallMessage(name, base string, have, need float64) string {
	panic("TODO")
}

// UseSoon returns the lots that go off today or within days days (not yet
// spoiled), ordered by go-off date then ID. Lots without a go-off date never qualify.
func UseSoon(lots []Lot, today Date, days int) []Lot {
	panic("TODO")
}

// ProjectedStock is the read model the planner and Shopping List consume: the
// current lots per Ingredient, each slice in consumption order (Deduct order).
type ProjectedStock map[int64][]Lot

// Project groups lots per Ingredient in consumption order. The input is not modified.
func Project(lots []Lot) ProjectedStock {
	panic("TODO")
}

// Available is the quantity of the Ingredient in lots that are still within their
// go-off date on the given date (no go-off date, or GoesOff >= on).
func (p ProjectedStock) Available(ingredientID int64, on Date) float64 {
	panic("TODO")
}
