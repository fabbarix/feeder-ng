package stock

import (
	"fmt"
	"math"
	"sort"
)

// UseSoonDays is how many days ahead a lot counts as "use soon": a lot that
// goes off today or within the next 3 days (and has not gone off yet).
const UseSoonDays = 3

// IsSpoiled reports whether the lot has gone off: it has a go-off date before
// today. A lot is still fine on its go-off date; a lot with no go-off date is
// never spoiled. This is the single definition the service and Spoiled share.
func IsSpoiled(lot Lot, today Date) bool {
	return false // STUB: Developer implements (tests first)
}

// IsUseSoon reports whether the lot should be used soon: it has a go-off date
// from today up to today+UseSoonDays inclusive. A spoiled lot is not "use soon"
// (it is spoiled), and a lot with no go-off date never is.
func IsUseSoon(lot Lot, today Date) bool {
	return false // STUB: Developer implements (tests first)
}

// FormatQuantity writes a Base Unit quantity as text: "300 g", "1.5 ml",
// "1 piece", "2 pieces". At most 2 decimals, trailing zeros trimmed.
func FormatQuantity(q float64, base string) string {
	num := formatNumber(q)
	if base == "piece" && num != "1" {
		return num + " pieces"
	}
	if base == "piece" {
		return num + " piece"
	}
	return num + " " + base
}

// formatNumber rounds half up to 2 decimals (on the decimal value, so 2.345
// reads as 2.35) and trims trailing zeros.
func formatNumber(q float64) string {
	if math.IsNaN(q) || math.IsInf(q, 0) {
		return "0"
	}
	neg := q < 0
	if neg {
		q = -q
	}
	// Millionths first to absorb float noise, then half-up to hundredths.
	micro := math.Round(q * 1e6)
	centi := int64(micro+5000) / 10000
	whole, frac := centi/100, centi%100
	var s string
	switch {
	case frac == 0:
		s = fmt.Sprintf("%d", whole)
	case frac%10 == 0:
		s = fmt.Sprintf("%d.%d", whole, frac/10)
	default:
		s = fmt.Sprintf("%d.%02d", whole, frac)
	}
	if neg && s != "0" {
		s = "-" + s
	}
	return s
}

// ShortfallMessage is the warning shown when Stock cannot cover a Cooked meal:
// "Stock shows only 300 g chicken thighs, the recipe uses 800 g". With nothing in
// Stock: "Stock shows no chicken thighs, the recipe uses 800 g".
func ShortfallMessage(name, base string, have, need float64) string {
	if have <= 0 {
		return fmt.Sprintf("Stock shows no %s, the recipe uses %s", name, FormatQuantity(need, base))
	}
	return fmt.Sprintf("Stock shows only %s %s, the recipe uses %s",
		FormatQuantity(have, base), name, FormatQuantity(need, base))
}

// UseSoon returns the lots that go off today or within days days (not yet
// spoiled), ordered by go-off date then ID. Lots without a go-off date never qualify.
func UseSoon(lots []Lot, today Date, days int) []Lot {
	last := today.AddDays(days)
	var out []Lot
	for _, l := range lots {
		if l.GoesOff.IsNone() {
			continue
		}
		if l.GoesOff >= today && l.GoesOff <= last {
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

// ProjectedStock is the read model the planner and Shopping List consume: the
// current lots per Ingredient, each slice in consumption order (Deduct order).
type ProjectedStock map[int64][]Lot

// Project groups lots per Ingredient in consumption order. The input is not modified.
func Project(lots []Lot) ProjectedStock {
	out := ProjectedStock{}
	for _, l := range lots {
		out[l.IngredientID] = append(out[l.IngredientID], l)
	}
	for id := range out {
		sort.SliceStable(out[id], func(i, j int) bool {
			return consumptionLess(out[id][i], out[id][j])
		})
	}
	return out
}

// Available is the quantity of the Ingredient in lots that are still within their
// go-off date on the given date (no go-off date, or GoesOff >= on).
func (p ProjectedStock) Available(ingredientID int64, on Date) float64 {
	var sum float64
	for _, l := range p[ingredientID] {
		if l.GoesOff.IsNone() || l.GoesOff >= on {
			sum += l.Quantity
		}
	}
	return sum
}
