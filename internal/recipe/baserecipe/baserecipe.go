// Package baserecipe is the pure domain of Base recipes (ADR 0015, beta.6): expansion of a Recipe's need tree
// through Base recipe lines (scaled by Yield, through Unit Conversion), Stock-first resolution, composition of
// the cooking timeline, Needed at, cycle detection, and the matching that import, the picker and the bulk
// link use. No SQL, HTTP or clock; the recipe store implements Catalog.
//
// The functions live in expand.go (Expand, Flatten, Resolve), compose.go (ComposeSteps, NeededAt), cycle.go
// (FindCycle) and match.go (MatchReference, LinkCandidates, PickerOrder).
package baserecipe

import (
	"errors"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// ErrCycle is matched (errors.Is) by every *CycleError.
var ErrCycle = errors.New("base recipe cycle")

// ErrNotFound is returned when a Recipe id is not in the Catalog.
var ErrNotFound = errors.New("recipe not found")

// CycleError reports a Base recipe that calls for itself through its lines. Path holds the Recipe names in
// order, from the first Recipe that repeats back to itself: [Béchamel Roux Béchamel]; a Recipe calling for
// itself is [Béchamel Béchamel].
type CycleError struct{ Path []string }

func (e *CycleError) Error() string { return "base recipe cycle: " + strings.Join(e.Path, " -> ") }

// Is makes errors.Is(err, ErrCycle) true.
func (e *CycleError) Is(target error) bool { return target == ErrCycle }

// Catalog is what expansion reads. The recipe store implements it over one read transaction.
type Catalog interface {
	Recipe(id int64) (Recipe, bool)          // lines and Steps of one Batch
	BaseOf(ingredientID int64) (int64, bool) // the Base recipe whose Ingredient this is
	Units(ingredientID int64) (units.Ingredient, bool)
}

// Recipe is one Recipe as expansion sees it.
type Recipe struct {
	ID    int64
	Name  string
	Base  *Yield // nil for a plannable Recipe
	Lines []Line
	Steps []Step
}

// Yield is a Base recipe's Yield: an amount in a unit, and the Ingredient it owns.
type Yield struct {
	IngredientID int64
	Quantity     float64
	Unit         string
}

// Line is an ingredient line. NeededAtStep is the stored override (0-based index into the Recipe's Steps),
// nil for the default.
type Line struct {
	IngredientID int64
	Quantity     float64
	Unit         string
	Optional     bool
	NeededAtStep *int
}

// Step is a Recipe Step as composition sees it. Uses carry the Ingredient ids (schedule.Use).
type Step struct {
	Text            string
	Kind            schedule.Kind
	DurationMinutes int
	LeadTimeMinutes int
	After           []int
	Uses            []schedule.Use
}

// Need is one node of a Recipe's need tree, for ONE Batch of the root Recipe, in the Ingredient's Base Units.
// For a Base recipe line, Quantity is the amount of the Base recipe Ingredient the line asks for and Made is
// what making that whole Quantity needs (the Base recipe's own lines scaled by Quantity / Yield, recursively).
// Made is nil for a plain Ingredient and for an empty Base recipe (§4.6).
type Need struct {
	IngredientID int64
	Quantity     float64
	Optional     bool
	BaseRecipeID int64 // set when IngredientID is a Base recipe's Ingredient
	Made         []Need
	// Path is the node's line in the tree, in the format ComposeSteps uses (raw line indexes from the root,
	// unconvertible lines counted: "1", "1/3"). Set by Expand on every node; empty on the output of Flatten and
	// Resolve.
	Path Path
}

// Path identifies a Base recipe line by the line indexes from the root Recipe, joined by "/": "1" is line 1 of
// the root, "1/3" is line 3 of the Base recipe that line 1 calls for.
type Path string

// Origin says which Base recipe a composed Step belongs to. Names is the chain of Base recipe names from the
// outermost ("Béchamel", "Roux"); BaseRecipeID is the innermost one's id; Path is its line's Path.
type Origin struct {
	BaseRecipeID int64
	Names        []string
	Path         Path
}

// ComposedStep is a Step of the composed list Cook Mode walks. Origin is nil for the root Recipe's own Steps.
// Covered marks a Step of a Base recipe fully covered by Stock: a zero-length Active Step, hidden in Cook Mode.
type ComposedStep struct {
	Step
	Origin  *Origin
	Covered bool
}

// Composed is the Step list of a Recipe with its Base recipes' Steps in it. TotalMinutes is schedule.Compute's
// total of the list as composed with the made function given.
type Composed struct {
	Steps        []ComposedStep
	TotalMinutes int
}

// Kinds of a reference candidate and suggestion, in the order MatchReference offers them.
const (
	KindBase      = "base"      // an existing Base recipe
	KindFile      = "file"      // a Recipe of the same import file
	KindPlannable = "plannable" // an existing plannable Recipe
)

// RefCandidate is a Recipe an import line might call for.
type RefCandidate struct {
	Kind      string // KindBase, KindFile or KindPlannable
	RecipeID  int64  // KindBase, KindPlannable
	FileIndex int    // KindFile: position in the file
	Name      string
}

// Reference is a line that may call for another recipe. FileIndex is the position in the file of the Recipe
// the line is on, -1 when it is not an import.
type Reference struct {
	Name      string
	Cue       string
	FileIndex int
}

// Suggestion is a candidate offered for a Reference. Exact: the match keys are equal. ByCue: picked by a
// "previous recipe" / "above" / "next recipe" cue.
type Suggestion struct {
	RefCandidate
	Exact bool
	ByCue bool
	Score float64
}

// Reasons a line cannot be linked.
const (
	ReasonUnitUnconvertible = "unit_unconvertible"
	ReasonCycle             = "cycle"
)

// CandidateLine is a plain ingredient line on some Recipe.
type CandidateLine struct {
	RecipeID       int64
	RecipeName     string
	Archived       bool
	LineIndex      int
	IngredientName string
	Quantity       float64
	Unit           string
}

// LinkCandidate is a CandidateLine offered for the bulk link; Linkable false carries a Reason.
type LinkCandidate struct {
	CandidateLine
	Linkable bool
	Reason   string
}

// Group of a picker row.
const (
	GroupBase      = "base"
	GroupPlannable = "plannable"
)

// PickerRecipe is a Recipe the BaseRecipePicker may offer.
type PickerRecipe struct {
	ID       int64
	Name     string
	Archived bool
	Base     bool // true: a Base recipe; false: a plannable Recipe
}

// PickerRow is one row of the picker. Disabled rows carry ReasonCycle.
type PickerRow struct {
	PickerRecipe
	Group    string
	Exact    bool
	Disabled bool
	Reason   string
}

// MadeFractions returns the made(path) function ComposeSteps wants, for the given tree and Batches, from the
// same Stock-first walk as Resolve: for each Base recipe node, the fraction (need - taken) / need still to
// make *of what its parent asks* (relative; 0 when the parent was fully covered, so Stock of a nested Base
// recipe is not used under a covered parent). Paths come from Need.Path; an unknown Path is 1. The walk takes
// from a private copy of the availability, so it never touches the caller's Stock, and it is deterministic:
// two lines of one Base recipe share the same jar in line order.
func MadeFractions(tree []Need, batches float64, have func(ingredientID int64) float64) func(Path) float64 {
	return madeFractions(tree, batches, have)
}
