// Package shopping is the pure side of the Shopping List (functional spec §9): from the uncooked Planned Meals
// in a range, the projected Stock and the Products last bought it derives each Ingredient's Line (need less
// available), pack suggestions, estimated cost and progress. No SQL, HTTP or time.Now: "now" is an input.
// Design: docs/dev/design/t13-shopping-scan.md. Stubs only until the Developer implements them.
package shopping

import (
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
	IngredientID    int64
	Name, BaseUnit  string
	Need, Available float64
	Quantity        float64
	Ticked          bool
	Pack            *PackSuggestion
	CostCents       *int
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
type Progress struct{ Done, Total int }

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

// Derive builds the list. See the design note for the rules.
func Derive(in Input) List { return List{} }

// LineFor returns the Ingredient Line for an Ingredient (ticked or not).
func (l List) LineFor(ingredientID int64) (Line, bool) { return Line{}, false }

// SuggestPack rounds up to whole packs.
func SuggestPack(quantity float64, p Pack) PackSuggestion { return PackSuggestion{} }

// LastPlannedDate is the last day of the Planning Horizon (today + horizonDays - 1; today when horizonDays < 1).
func LastPlannedDate(today stock.Date, horizonDays int) stock.Date { return stock.None }

// DefaultTo is today + 7 days, capped at the Planning Horizon.
func DefaultTo(today stock.Date, horizonDays int) stock.Date { return stock.None }

// ClampTo caps a chosen date at the Planning Horizon and raises one before today to today; empty/invalid means DefaultTo.
func ClampTo(today stock.Date, horizonDays int, to stock.Date) stock.Date { return stock.None }
