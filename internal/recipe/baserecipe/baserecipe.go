// Package baserecipe is the pure domain of Base recipes (ADR 0015, beta.6): expansion of a Recipe's need tree
// through Base recipe lines (scaled by Yield, through Unit Conversion), Stock-first resolution, composition of
// the cooking timeline, Needed at, cycle detection, and the matching that import, the picker and the bulk
// link use. No SQL, HTTP or clock; the recipe store implements Catalog.
//
// STATUS: stubs (BR-A red phase). Every function returns a zero value or ErrNotImplemented.
package baserecipe

import (
	"errors"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// ErrNotImplemented is returned by the stubs.
var ErrNotImplemented = errors.New("baserecipe: not implemented")

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
}

// Expand returns the need tree of one Batch of the Recipe. An unconvertible line is skipped. A Base recipe
// that is (transitively) on its own path is a *CycleError. An unknown Recipe id is ErrNotFound.
func Expand(cat Catalog, recipeID int64) ([]Need, error) { return nil, ErrNotImplemented }

// Flatten returns the leaves of the tree, depth first, for the planner and Exclusions: every plain Ingredient
// at its full Quantity, every Base recipe Ingredient as an optional line of Quantity 0 (placed before the
// leaves inside it), and an empty Base recipe's Ingredient as a real line at its Quantity.
func Flatten(tree []Need) []Need { return nil }

// Resolve walks the tree Stock first, for the given number of Batches. For each Base recipe node needing
// q = Quantity x batches it takes min(have(id), q) of the Base recipe Ingredient (calling take(id, taken) so
// the caller's availability shrinks for later nodes), then resolves Made scaled by (q-taken)/q. The result is
// flat: the Base recipe Ingredient for the part Stock covered, plain Ingredients for the part made; an empty
// Base recipe contributes its Ingredient for the whole q (the covered part and the rest). Optional is kept.
func Resolve(tree []Need, batches float64, have func(ingredientID int64) float64, take func(ingredientID int64, q float64)) []Need {
	return nil
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

// ComposeSteps builds the Step list for one Batch-independent Recipe, Base recipes included (§4.4). made(path)
// is the fraction (0..1) of that Base recipe line still to make *of what its parent asks* (relative, like
// Resolve): 1 with no Stock, 0 when Stock covers it; the effective fraction multiplies down the path. A nil
// made means 1 everywhere. Positions are chosen as if nothing were in Stock, so Stock never moves an index.
func ComposeSteps(cat Catalog, recipeID int64, made func(Path) float64) (Composed, error) {
	return Composed{}, ErrNotImplemented
}

// NeededAt is the default Needed at Step of the Base recipe line lineIndex of r (§3.3): the stored override
// when it points at a non-Advance Step; else the first non-Advance Step whose Uses name the line's Ingredient;
// else the first non-Advance Step whose text names baseName (whole words, case and accents folded); else 0.
func NeededAt(r Recipe, lineIndex int, baseName string) int { return -1 }

// FindCycle looks for a cycle through the saved Recipe in the "calls for" graph (Recipe id to the ids of the
// Base recipes its lines call for) and returns its names, closed: [Béchamel Roux Béchamel], a self call
// [Béchamel Béchamel]. nil when the saved Recipe is on no cycle (a cycle elsewhere is not reported).
func FindCycle(edges map[int64][]int64, names map[int64]string, saved int64) []string { return nil }

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

// MatchReference ranks the candidates for a Reference (§4.5): a cue pick first, then exact key matches
// (units.NormalizeName, accents folded, a trailing plural "s" dropped), then fuzzy matches with
// ingredient.Score >= ingredient.MinScore; within each, Base recipes, then file Recipes, then plannable ones,
// then score descending, then name.
func MatchReference(ref Reference, candidates []RefCandidate) []Suggestion { return nil }

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

// LinkCandidates lists the plain lines whose Ingredient name has the Base recipe's key (§3.8), ordered by
// Recipe name then line index. The Base recipe's own lines are left out. A line on a Recipe the Base recipe
// (transitively) calls for would make a cycle: listed with ReasonCycle (checked before the unit). A unit that
// does not convert for baseUnits is ReasonUnitUnconvertible. Archived Recipes are included.
func LinkCandidates(baseName string, baseRecipeID int64, lines []CandidateLine, graph map[int64][]int64, baseUnits units.Ingredient) []LinkCandidate {
	return nil
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

// PickerOrder orders the picker for a line on Recipe selfID whose Ingredient is named lineName (§3.7): the
// Base recipes group first, then the plannable group; within a group the exact name match, then close matches
// (score descending), then the rest by name. Archived Recipes and selfID are left out; a Recipe that reaches
// selfID in graph is listed disabled with ReasonCycle.
func PickerOrder(lineName string, selfID int64, recipes []PickerRecipe, graph map[int64][]int64) []PickerRow {
	return nil
}
