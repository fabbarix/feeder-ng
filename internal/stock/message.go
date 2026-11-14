package stock

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

// UseSoonDays is how many days ahead a lot counts as "use soon": a lot that
// goes off today or within the next 3 days (and has not gone off yet).
const UseSoonDays = 3

// IsSpoiled reports whether the lot has gone off: it has a go-off date before
// today. A lot is still fine on its go-off date; a lot with no go-off date is
// never spoiled. This is the single definition the service and Spoiled share.
func IsSpoiled(lot Lot, today Date) bool {
	return !lot.GoesOff.IsNone() && lot.GoesOff < today
}

// IsUseSoon reports whether the lot should be used soon: it has a go-off date
// from today up to today+UseSoonDays inclusive. A spoiled lot is not "use soon"
// (it is spoiled), and a lot with no go-off date never is.
func IsUseSoon(lot Lot, today Date) bool {
	return useSoonWithin(lot, today, UseSoonDays)
}

// useSoonWithin is the use-soon window for any number of days: go-off from
// today to today+days inclusive, and not spoiled.
func useSoonWithin(lot Lot, today Date, days int) bool {
	if lot.GoesOff.IsNone() || IsSpoiled(lot, today) {
		return false
	}
	return lot.GoesOff <= today.AddDays(days)
}

// FormatQuantity writes a Base Unit quantity as text: "300 g", "1.5 ml",
// "1 piece", "2 pieces". At most 2 decimals, trailing zeros trimmed. From
// 1000 g / 1000 ml (after that rounding) it reads in kg and l, as the web app's
// lib/units does (SSP-16, decision SSP 7): "1.5 kg", "12 kg", "1.25 l". Digits
// are grouped with "," ("1,250 pieces", "1,250 kg"). The Base Unit stays the
// stored unit; only the text promotes.
func FormatQuantity(q float64, base string) string {
	if (base == "g" || base == "ml") && centi(math.Abs(q)) >= 1000*100 {
		unit := "kg"
		if base == "ml" {
			unit = "l"
		}
		return formatNumber(q/1000) + " " + unit
	}
	num := formatNumber(q)
	if base == "piece" && num != "1" {
		return num + " pieces"
	}
	if base == "piece" {
		return num + " piece"
	}
	return num + " " + base
}

// centi rounds a non-negative q half up to hundredths (on the decimal value,
// millionths first to absorb float noise) and returns them as an integer.
func centi(q float64) int64 {
	micro := math.Round(q * 1e6)
	return int64(micro+5000) / 10000
}

// maxCenti is the largest quantity centi handles without overflowing int64;
// beyond it the number is written whole.
const maxCenti = 1e12

// formatNumber rounds half up to 2 decimals (on the decimal value, so 2.345
// reads as 2.35), trims trailing zeros and groups the whole part with ",".
func formatNumber(q float64) string {
	if math.IsNaN(q) || math.IsInf(q, 0) {
		return "0"
	}
	neg := q < 0
	if neg {
		q = -q
	}
	var s string
	if q >= maxCenti {
		s = groupDigits(strconv.FormatFloat(math.Round(q), 'f', 0, 64))
	} else {
		c := centi(q)
		whole, frac := c/100, c%100
		w := groupDigits(strconv.FormatInt(whole, 10))
		switch {
		case frac == 0:
			s = w
		case frac%10 == 0:
			s = fmt.Sprintf("%s.%d", w, frac/10)
		default:
			s = fmt.Sprintf("%s.%02d", w, frac)
		}
	}
	if neg && s != "0" {
		s = "-" + s
	}
	return s
}

// groupDigits puts a "," between each group of three digits: "1250" -> "1,250".
func groupDigits(digits string) string {
	if len(digits) <= 3 {
		return digits
	}
	var b strings.Builder
	head := len(digits) % 3
	if head > 0 {
		b.WriteString(digits[:head])
	}
	for i := head; i < len(digits); i += 3 {
		if b.Len() > 0 {
			b.WriteByte(',')
		}
		b.WriteString(digits[i : i+3])
	}
	return b.String()
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
	var out []Lot
	for _, l := range lots {
		if useSoonWithin(l, today, days) {
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
