// Package shopping is the pure side of the Shopping List (functional spec §9): from the uncooked Planned Meals
// in a range, the projected Stock and the Products last bought it derives each Ingredient's Line (need less
// available), pack suggestions, estimated cost and progress. No SQL, HTTP or time.Now: "now" is an input.
// Design: docs/dev/design/t13-shopping-scan.md.
package shopping

import (
	"math"
	"sort"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/stock"
)

// Need is one Recipe line for ONE Batch, in Base Units.
type Need struct {
	IngredientID int64
	Quantity     float64
	Optional     bool
}

// Meal is an uncooked, non-skipped Planned Meal in the range. A meal served from a Leftover (Leftover true) needs nothing.
type Meal struct {
	Date     stock.Date
	At       time.Time // slot instant; a meal whose At is before Input.Now is ignored
	Batches  float64
	Leftover bool
	Needs    []Need
}

// IngredientInfo is what a Line shows about its Ingredient.
type IngredientInfo struct{ Name, BaseUnit string }

// Pack is the pack size (Base Units) of the Product last bought for an Ingredient.
type Pack struct {
	ProductID int64
	Name      string
	Size      float64
}

// Extra is a manual extra: free text, or an Ingredient with a quantity (Got = scanned or ticked so far).
type Extra struct {
	ID           int64
	Text         string
	IngredientID int64
	Quantity     float64
	Got          float64
	Ticked       bool
}

// Tick is the ticked state of one Ingredient for the current range; Needed is the Line quantity when it was ticked.
type Tick struct {
	IngredientID int64
	Needed       float64
	By           string // "scan" | "hand"
}

// Input is everything Derive needs.
type Input struct {
	Now         time.Time
	From, To    stock.Date
	Meals       []Meal
	Lots        []stock.Lot
	Ingredients map[int64]IngredientInfo
	Packs       map[int64]Pack // by Ingredient: the Product last bought
	PackPrices  map[int64]int  // by Product: cents per pack (latest Price at the selected Shop, else any Shop); absent = no Price
	Extras      []Extra
	Ticks       map[int64]Tick // by Ingredient, for this range
}

// PackSuggestion is "2 x Mutti 700 g": Count packs, Remainder left over.
type PackSuggestion struct {
	ProductID int64
	Name      string
	Size      float64
	Count     int
	Remainder float64
}

// Line is one Ingredient line of the Shopping List. Quantity is what is still to buy (0 for a tick-only line).
type Line struct {
	IngredientID       int64
	Name, BaseUnit     string
	Need, Available    float64
	Quantity           float64
	Ticked             bool
	Pack               *PackSuggestion
	EstimatedCostCents *int
}

// ExtraLine is a manual extra in the list; Quantity is the remaining amount of an Ingredient extra.
type ExtraLine struct {
	ID             int64
	Text           string
	IngredientID   int64
	Name, BaseUnit string
	Quantity       float64
	Ticked         bool
}

// Progress is ticked over total (Ingredient Lines plus extras).
type Progress struct{ Ticked, Total int }

// List is the derived Shopping List.
type List struct {
	From, To           stock.Date
	Lines              []Line
	Extras             []ExtraLine
	Progress           Progress
	EstimatedCostCents int
	UnpricedLines      int
	Complete           bool
}

// eps is the float tolerance for quantities.
const eps = 1e-9

// Derive builds the list. See the design note for the rules.
func Derive(in Input) List {
	out := List{From: in.From, To: in.To}
	lines := derivedLines(in)
	ticked := map[int64]bool{}
	for ing, t := range in.Ticks {
		ticked[ing] = true
		if _, ok := lines[ing]; ok {
			continue
		}
		// Covered by Stock (or by this range's scans) and kept as ticked.
		info := in.Ingredients[ing]
		lines[ing] = Line{IngredientID: ing, Name: info.Name, BaseUnit: info.BaseUnit, Need: t.Needed, Available: t.Needed}
	}
	for ing, l := range lines {
		if ticked[ing] {
			l.Ticked = true
			l.Pack = nil
			l.EstimatedCostCents = nil
			lines[ing] = l
		}
		if !l.Ticked && l.EstimatedCostCents == nil {
			out.UnpricedLines++
		}
		if !l.Ticked && l.EstimatedCostCents != nil {
			out.EstimatedCostCents += *l.EstimatedCostCents
		}
	}
	for _, l := range lines {
		out.Lines = append(out.Lines, l)
	}
	sortLines(out.Lines)
	out.Extras = extraLines(in.Extras, in.Ingredients)
	out.Progress = Progress{Total: len(out.Lines) + len(out.Extras)}
	for _, l := range out.Lines {
		if l.Ticked {
			out.Progress.Ticked++
		}
	}
	for _, e := range out.Extras {
		if e.Ticked {
			out.Progress.Ticked++
		}
	}
	out.Complete = out.Progress.Total > 0 && out.Progress.Ticked == out.Progress.Total
	return out
}

// derivedLines builds the Lines that still need buying from the Planned Meals and the projected Stock.
func derivedLines(in Input) map[int64]Line {
	meals := make([]Meal, 0, len(in.Meals))
	for _, m := range in.Meals {
		if m.Leftover || m.Date < in.From || m.Date > in.To || m.At.Before(in.Now) {
			continue
		}
		meals = append(meals, m)
	}
	sort.SliceStable(meals, func(i, j int) bool {
		if meals[i].Date != meals[j].Date {
			return meals[i].Date < meals[j].Date
		}
		return meals[i].At.Before(meals[j].At)
	})

	lots := map[int64][]stock.Lot{}
	for _, l := range in.Lots {
		if l.Quantity > eps {
			lots[l.IngredientID] = append(lots[l.IngredientID], l)
		}
	}
	need := map[int64]float64{}
	short := map[int64]float64{}
	for _, m := range meals {
		for _, n := range m.Needs {
			if n.Optional {
				continue
			}
			q := m.Batches * n.Quantity
			if !(q > 0) {
				continue
			}
			need[n.IngredientID] += q
			short[n.IngredientID] += draw(lots, n.IngredientID, q, m.Date)
		}
	}

	out := map[int64]Line{}
	for ing, total := range need {
		quantity := short[ing]
		if quantity <= eps {
			continue
		}
		info := in.Ingredients[ing]
		line := Line{IngredientID: ing, Name: info.Name, BaseUnit: info.BaseUnit, Need: total, Available: total - quantity, Quantity: quantity}
		if p, ok := in.Packs[ing]; ok {
			s := SuggestPack(quantity, p)
			line.Pack = &s
			if price, ok := in.PackPrices[p.ProductID]; ok {
				c := s.Count * price
				line.EstimatedCostCents = &c
			}
		}
		out[ing] = line
	}
	return out
}

// draw takes q from the Ingredient's lots usable on date (soonest go-off first, then oldest, then lowest id) and
// returns the part Stock could not cover.
func draw(lots map[int64][]stock.Lot, ing int64, q float64, date stock.Date) float64 {
	list := lots[ing]
	order := make([]int, 0, len(list))
	for i, l := range list {
		if l.GoesOff.IsNone() || l.GoesOff >= date {
			order = append(order, i)
		}
	}
	sort.SliceStable(order, func(a, b int) bool {
		la, lb := list[order[a]], list[order[b]]
		if la.GoesOff.IsNone() != lb.GoesOff.IsNone() {
			return !la.GoesOff.IsNone()
		}
		if la.GoesOff != lb.GoesOff {
			return la.GoesOff < lb.GoesOff
		}
		if la.Purchased != lb.Purchased {
			return la.Purchased < lb.Purchased
		}
		return la.ID < lb.ID
	})
	left := q
	for _, i := range order {
		if left <= eps {
			break
		}
		take := math.Min(left, list[i].Quantity)
		list[i].Quantity -= take
		left -= take
	}
	lots[ing] = list
	if left < eps {
		return 0
	}
	return left
}

// extraLines lists the open extras by id, then the ticked ones.
func extraLines(extras []Extra, ings map[int64]IngredientInfo) []ExtraLine {
	sorted := append([]Extra(nil), extras...)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Ticked != sorted[j].Ticked {
			return !sorted[i].Ticked
		}
		return sorted[i].ID < sorted[j].ID
	})
	out := make([]ExtraLine, 0, len(sorted))
	for _, e := range sorted {
		l := ExtraLine{ID: e.ID, Text: e.Text, IngredientID: e.IngredientID, Ticked: e.Ticked}
		if e.IngredientID != 0 {
			info := ings[e.IngredientID]
			l.Name, l.BaseUnit = info.Name, info.BaseUnit
			l.Quantity = math.Max(0, e.Quantity-e.Got)
		}
		out = append(out, l)
	}
	return out
}

// sortLines puts open Lines first, then ticked ones, each by name (case-insensitive) then id.
func sortLines(lines []Line) {
	sort.SliceStable(lines, func(i, j int) bool {
		a, b := lines[i], lines[j]
		if a.Ticked != b.Ticked {
			return !a.Ticked
		}
		na, nb := strings.ToLower(a.Name), strings.ToLower(b.Name)
		if na != nb {
			return na < nb
		}
		return a.IngredientID < b.IngredientID
	})
}

// LineFor returns the Ingredient Line for an Ingredient (ticked or not).
func (l List) LineFor(ingredientID int64) (Line, bool) {
	for _, ln := range l.Lines {
		if ln.IngredientID == ingredientID {
			return ln, true
		}
	}
	return Line{}, false
}

// SuggestPack rounds up to whole packs.
func SuggestPack(quantity float64, p Pack) PackSuggestion {
	s := PackSuggestion{ProductID: p.ProductID, Name: p.Name, Size: p.Size}
	if !(p.Size > 0) {
		return s
	}
	s.Count = int(math.Ceil(quantity/p.Size - 1e-9))
	s.Remainder = math.Max(0, float64(s.Count)*p.Size-quantity)
	return s
}

// LastPlannedDate is the last day of the Planning Horizon (today + horizonDays - 1; today when horizonDays < 1).
func LastPlannedDate(today stock.Date, horizonDays int) stock.Date {
	if horizonDays < 1 {
		return today
	}
	return today.AddDays(horizonDays - 1)
}

// DefaultTo is today + 7 days, capped at the Planning Horizon.
func DefaultTo(today stock.Date, horizonDays int) stock.Date {
	week := today.AddDays(7)
	if last := LastPlannedDate(today, horizonDays); last < week {
		return last
	}
	return week
}

// ClampTo caps a chosen date at the Planning Horizon and raises one before today to today; empty/invalid means DefaultTo.
func ClampTo(today stock.Date, horizonDays int, to stock.Date) stock.Date {
	if !validDate(to) {
		return DefaultTo(today, horizonDays)
	}
	if last := LastPlannedDate(today, horizonDays); to > last {
		return last
	}
	if to < today {
		return today
	}
	return to
}

func validDate(d stock.Date) bool {
	if len(d) != 10 {
		return false
	}
	t, err := time.Parse("2006-01-02", string(d))
	return err == nil && t.Format("2006-01-02") == string(d)
}
