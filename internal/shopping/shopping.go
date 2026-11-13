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
//
// Made (BR-F, beta.6, docs/dev/design/base-recipes.md section 7) is set on a Base recipe line: what making the whole
// Quantity of the Base recipe Ingredient needs (the Base recipe's own lines already scaled by Quantity over its Yield,
// nested Base recipes included). A node with Made draws the Base recipe Ingredient from the projected Stock first and
// only the shortfall is expanded: each child counts child.Quantity * shortfall / Quantity. The Base recipe Ingredient
// itself is then never a Line. Made nil is a plain Ingredient, or an empty Base recipe, which is listed as itself.
type Need struct {
	IngredientID int64
	Quantity     float64
	Optional     bool
	Made         []Need
}

// Meal is an uncooked, non-skipped Planned Meal in the range. A meal served from a Leftover (Leftover true) needs nothing.
type Meal struct {
	Date     stock.Date
	At       time.Time // slot instant: a meal whose slot instant is before Input.Now is "past" (it waits in To confirm) but still counts
	Batches  float64
	Leftover bool
	Needs    []Need
	// B5-BO: the Planned Meal's id (planned_meals.id), what Attribute names a Share by. 0 = unknown: never attributed.
	MealID int64
	// B5-SH: what the "Includes Tue Dinner, not marked Cooked yet" hint names. SlotID 0 = unknown (never hinted).
	SlotID     int64
	SlotName   string
	CourseName string
}

// IngredientInfo is what a Line shows about its Ingredient.
type IngredientInfo struct {
	Name, BaseUnit string
	ImageURL       string // PE: "/api/images/<id>" of the Ingredient's Picture, "" without one
}

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

// NotNeeded is the Not needed mark of one Ingredient for the current range (B5-SH, docs/dev/design/beta5-plan.md 2.5);
// Needed is the Line quantity when it was set.
type NotNeeded struct {
	IngredientID int64
	Needed       float64
}

// PastMeal is a Planned Meal whose slot has passed and that is not marked Cooked or Not cooked yet, named on the
// Line it contributes to: one entry per Course of a slot.
type PastMeal struct {
	Date         stock.Date
	MealSlotID   int64
	MealSlotName string
	CourseName   string
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
	Ticks       map[int64]Tick      // by Ingredient, for this range
	NotNeeded   map[int64]NotNeeded // by Ingredient, for this range
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
	ImageURL           string
	Need, Available    float64
	Quantity           float64
	Ticked             bool
	Pack               *PackSuggestion
	EstimatedCostCents *int
	// PastPlannedMeals are the uncooked meals of slots already past that this Line's need includes (date, slot, Course order).
	PastPlannedMeals []PastMeal
}

// ExtraLine is a manual extra in the list; Quantity is the remaining amount of an Ingredient extra.
type ExtraLine struct {
	ID             int64
	Text           string
	IngredientID   int64
	Name, BaseUnit string
	ImageURL       string
	Quantity       float64
	Ticked         bool
}

// Progress is ticked over total (Ingredient Lines plus extras).
type Progress struct{ Ticked, Total int }

// List is the derived Shopping List.
type List struct {
	From, To           stock.Date
	Lines              []Line
	NotNeeded          []Line // Lines taken off the list for this range, by name; not in Progress, the estimate or Complete
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
		lines[ing] = Line{IngredientID: ing, Name: info.Name, BaseUnit: info.BaseUnit, ImageURL: info.ImageURL, Need: t.Needed, Available: t.Needed}
	}
	// Not needed: an open Line the User took off the list for this range. A ticked Line stays where it is.
	for ing := range in.NotNeeded {
		l, ok := lines[ing]
		if !ok || ticked[ing] {
			continue
		}
		delete(lines, ing)
		out.NotNeeded = append(out.NotNeeded, l)
	}
	sortLines(out.NotNeeded)
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

// mealDraw is one Planned Meal of a derivation: what it needs per required Ingredient, and how much of that its own draw
// from the projected Stock could not cover (its shortfall).
type mealDraw struct {
	meal  Meal
	need  map[int64]float64
	short map[int64]float64
}

// draws walks the Planned Meals that count, in date and time order (the order Stock is drawn in), and gives each one its
// need and shortfall. derivedLines and Attribute both use it, so they agree on what each Planned Meal draws.
func draws(in Input) []mealDraw {
	meals := make([]Meal, 0, len(in.Meals))
	for _, m := range in.Meals {
		if m.Leftover || m.Date > in.To {
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

	usable := make([]stock.Lot, 0, len(in.Lots))
	for _, l := range in.Lots {
		if l.Quantity > eps {
			usable = append(usable, l)
		}
	}
	projected := stock.Project(usable)
	out := make([]mealDraw, 0, len(meals))
	for _, m := range meals {
		d := mealDraw{meal: m, need: map[int64]float64{}, short: map[int64]float64{}}
		for _, n := range m.Needs {
			if n.Optional {
				continue
			}
			q := m.Batches * n.Quantity
			if !(q > 0) {
				continue
			}
			d.add(projected, n, q, drawDate(m.Date, in.From))
		}
		out = append(out, d)
	}
	return out
}

// add draws one need of the Planned Meal, amount in the Ingredient's Base Units. A plain Ingredient (and an empty Base
// recipe, which Made leaves nil) is needed and drawn as it is. A Base recipe node (Made set) draws its own Ingredient
// first, and only the shortfall s is made: each child is drawn for child.Quantity * s / node.Quantity, recursively, so
// nested Base recipes resolve the same way Resolve does (section 7). Children are always walked, even for an amount of
// 0, so both walks of Attribute carry the same keys.
func (d *mealDraw) add(p stock.ProjectedStock, n Need, amount float64, date stock.Date) {
	if n.Made == nil {
		d.need[n.IngredientID] += amount
		d.short[n.IngredientID] += draw(p, n.IngredientID, amount, date)
		return
	}
	s := draw(p, n.IngredientID, amount, date)
	ratio := 0.0
	if n.Quantity > 0 {
		ratio = s / n.Quantity
	}
	for _, c := range n.Made {
		if c.Optional {
			continue
		}
		d.add(p, c, c.Quantity*ratio, date)
	}
}

// derivedLines builds the Lines that still need buying from the Planned Meals and the projected Stock. Every
// uncooked meal up to To counts, including one whose slot has passed and that waits in To confirm, and one dated
// before From (it is simulated on the first day of the range, when its Stock is what is still good).
func derivedLines(in Input) map[int64]Line {
	need := map[int64]float64{}
	short := map[int64]float64{}
	pastFor := map[int64][]PastMeal{}
	for _, d := range draws(in) {
		m := d.meal
		past := m.SlotID != 0 && m.At.Before(in.Now)
		for ing, q := range d.need {
			need[ing] += q
		}
		for ing, s := range d.short {
			short[ing] += s
			// A past meal that Stock does not cover is still to confirm and is named on the Line it adds to.
			if pm := (PastMeal{Date: m.Date, MealSlotID: m.SlotID, MealSlotName: m.SlotName, CourseName: m.CourseName}); past && s > eps {
				if p := pastFor[ing]; len(p) == 0 || p[len(p)-1] != pm {
					pastFor[ing] = append(p, pm)
				}
			}
		}
	}

	out := map[int64]Line{}
	for ing, total := range need {
		quantity := short[ing]
		if quantity <= eps {
			continue
		}
		info := in.Ingredients[ing]
		line := Line{IngredientID: ing, Name: info.Name, BaseUnit: info.BaseUnit, ImageURL: info.ImageURL, Need: total, Available: total - quantity, Quantity: quantity,
			PastPlannedMeals: pastFor[ing]}
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

// drawDate is the day a meal's Stock is taken on: its own date, or the first day of the range for an earlier meal.
func drawDate(mealDate, from stock.Date) stock.Date {
	if mealDate < from {
		return from
	}
	return mealDate
}

// draw takes q from the Ingredient's lots usable on date, in the Stock consumption order (stock.Project: soonest
// go-off first, then oldest, then lowest id), and returns the part Stock could not cover.
func draw(p stock.ProjectedStock, ing int64, q float64, date stock.Date) float64 {
	left := q
	list := p[ing]
	for i := range list {
		if left <= eps {
			break
		}
		if !list[i].GoesOff.IsNone() && list[i].GoesOff < date {
			continue
		}
		take := math.Min(left, list[i].Quantity)
		list[i].Quantity -= take
		left -= take
	}
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
			l.Name, l.BaseUnit, l.ImageURL = info.Name, info.BaseUnit, info.ImageURL
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
