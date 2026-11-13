package recipe

// Base recipes, the pure rules (ADR 0015, beta.6; docs/dev/design/base-recipes.md §3, §10): Yield units, who may
// hold a name, the errors the store and API answer with, and the shapes of kind change, link and bulk link.
// No net/http, no database/sql.

import (
	"errors"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/units"
)

// YieldUnits are the units a Base recipe's Yield may be in (§3.1): the global units, piece and portion.
var YieldUnits = []string{"g", "kg", "ml", "l", "dl", "cl", "tsp", "tbsp", "cup", "piece", "portion"}

// YieldBase is the Base Unit a Yield unit gives the Base recipe's Ingredient (§3.2): g and kg are g, the ml family
// (ml, l, dl, cl, tsp, tbsp, cup) is ml, piece and portion are piece. ok is false for any other unit (the unit is
// normalised first, so " L " is l).
func YieldBase(unit string) (base units.Base, ok bool) {
	switch units.NormalizeUnit(unit) {
	case "g", "kg":
		return units.Gram, true
	case "ml", "l", "dl", "cl", "tsp", "tbsp", "cup":
		return units.Millilitre, true
	case "piece", "portion":
		return units.Piece, true
	}
	return "", false
}

// YieldInBase is the Yield in Base Units (1 l is 1000 ml, 2 kg is 2000 g, 4 portion is 4 piece); ok is false for a
// unit YieldBase refuses. It is what the `batch` Unit Conversion of the Base recipe's Ingredient holds.
func YieldInBase(quantity float64, unit string) (float64, bool) {
	base, ok := YieldBase(unit)
	if !ok {
		return 0, false
	}
	if u := units.NormalizeUnit(unit); u == "portion" {
		return quantity, true // 1 portion is 1 piece (§3.2)
	}
	q, err := units.ToBase(quantity, unit, units.Ingredient{Base: base})
	if err != nil {
		return 0, false
	}
	return q, true
}

// IsBase reports whether the Input is a Base recipe (BaseRecipe is set and true).
func (in Input) IsBase() bool { return in.BaseRecipe != nil && *in.BaseRecipe }

// Ref names a Recipe.
type Ref struct {
	ID       int64
	Name     string
	Archived bool
}

// BaseRef is the Base recipe a line calls for, as the line shows it.
type BaseRef struct {
	ID       int64
	Name     string
	Archived bool
	Empty    bool // no lines (§4.6)
}

// Within is an Ingredient inside a Recipe through Base recipes: Path holds the Base recipe names from outermost
// ("Béchamel", "Roux").
type Within struct {
	IngredientID int64
	Name         string
	Path         []string
}

// IngredientRef names an Ingredient.
type IngredientRef struct {
	ID   int64
	Name string
}

// HolderKind says what holds an Ingredient name.
type HolderKind string

// Kinds of name holder.
const (
	HolderPlain      HolderKind = "plain"       // an ordinary Ingredient (name_key = the normalised name)
	HolderBaseRecipe HolderKind = "base_recipe" // a Base recipe's Ingredient (name_key base-recipe:<id>); Name is the Recipe's name
	HolderReadyMeal  HolderKind = "ready_meal"  // a Ready Meal's single-line Ingredient
)

// NameHolder is an Ingredient, or a Base recipe, that holds a name, as NameDecision sees it.
type NameHolder struct {
	IngredientID int64
	Name         string
	Kind         HolderKind
}

// NameAction is what happens to a Base recipe's name.
type NameAction string

// Name actions (§3.2).
const (
	NameOwn    NameAction = "own"    // nobody holds the name: the Base recipe gets its own Ingredient
	NameAsk    NameAction = "ask"    // a plain Ingredient holds it: ask whether to take it over
	NameRefuse NameAction = "refuse" // another Base recipe or a Ready Meal holds it: pick another name
)

// NameDecision is DecideBaseRecipeName's answer. TakeOver is the plain holder to ask about (NameAsk); Code is
// CodeBaseRecipeNameTaken or CodeReadyMealNameTaken (NameRefuse).
type NameDecision struct {
	Action   NameAction
	TakeOver NameHolder
	Code     string
}

// DecideBaseRecipeName applies §3.2 to a Base recipe's name (a create, a kind change or a rename) against the
// holders of that name, compared with units.NormalizeName; the caller leaves out the Base recipe's own Ingredient.
// Another Base recipe holding the name wins over a Ready Meal's Ingredient, which wins over a plain Ingredient (the
// only one that is asked about). A plain Ingredient may exist beside a Base recipe of the same name; that is not a
// holder to refuse.
func DecideBaseRecipeName(name string, holders []NameHolder) NameDecision {
	key := units.NormalizeName(name)
	var plain, ready *NameHolder
	for i := range holders {
		h := &holders[i]
		if units.NormalizeName(h.Name) != key {
			continue
		}
		switch h.Kind {
		case HolderBaseRecipe:
			return NameDecision{Action: NameRefuse, Code: CodeBaseRecipeNameTaken}
		case HolderReadyMeal:
			if ready == nil {
				ready = h
			}
		case HolderPlain:
			if plain == nil {
				plain = h
			}
		}
	}
	switch {
	case ready != nil:
		return NameDecision{Action: NameRefuse, Code: CodeReadyMealNameTaken}
	case plain != nil:
		return NameDecision{Action: NameAsk, TakeOver: *plain}
	}
	return NameDecision{Action: NameOwn}
}

// ErrBaseRecipeInUse is matched by *InUseError.
var ErrBaseRecipeInUse = errors.New("base recipe is in use")

// InUseError: Recipes call for the Base recipe, so it cannot be deleted or made plannable (409 base_recipe_in_use).
type InUseError struct{ UsedBy []Ref }

func (e *InUseError) Error() string        { return "base recipe is used by other Recipes" }
func (e *InUseError) Is(target error) bool { return target == ErrBaseRecipeInUse }

// ErrBaseRecipeCycle is matched by *CycleError.
var ErrBaseRecipeCycle = errors.New("base recipe cycle")

// CycleError: the save would make a Base recipe call for itself (422 base_recipe_cycle). Path holds the names,
// closed: [Béchamel Roux Béchamel]; Field is the offending line ("lines[1]").
type CycleError struct {
	Field string
	Path  []string
}

func (e *CycleError) Error() string {
	return e.Field + ": base recipe cycle: " + strings.Join(e.Path, " -> ")
}
func (e *CycleError) Is(target error) bool { return target == ErrBaseRecipeCycle }

// ErrTakeOver is matched by *TakeOverError.
var ErrTakeOver = errors.New("a plain Ingredient has that name: ask whether to take it over")

// TakeOverError is the ask of §3.2: a plain Ingredient has the Base recipe's name, and Input.TakeOver is nil.
// Recipes are the Recipes it is on (archived included), StockLots its Stock; Convertible is false when the Yield's
// unit does not convert to its Base Unit (only "keep it apart" is then offered). 409 base_recipe_take_over.
type TakeOverError struct {
	Ingredient  IngredientRef
	Recipes     []Ref
	StockLots   int
	Convertible bool
}

func (e *TakeOverError) Error() string {
	return "an Ingredient named " + e.Ingredient.Name + " exists: take it over?"
}
func (e *TakeOverError) Is(target error) bool { return target == ErrTakeOver }

// ErrIngredientNameTaken is matched by *NameTakenError.
var ErrIngredientNameTaken = errors.New("a plain Ingredient already has that name")

// NameTakenError: to-plannable would give the Ingredient back its plain key, but a plain Ingredient holds it
// (409 ingredient_name_taken); the dialog offers to merge the two.
type NameTakenError struct{ Ingredient IngredientRef }

func (e *NameTakenError) Error() string {
	return "an Ingredient named " + e.Ingredient.Name + " already exists"
}
func (e *NameTakenError) Is(target error) bool { return target == ErrIngredientNameTaken }

// ErrBaseUnitInUse: the Yield's unit would change the Base recipe Ingredient's Base Unit while it has Stock,
// Products or lines (409 base_unit_in_use).
var ErrBaseUnitInUse = errors.New("the Base Unit of this Base recipe is in use")

// ToBaseInput is the body of the kind change to a Base recipe (§3.6).
type ToBaseInput struct {
	Yield     float64
	YieldUnit string
	TakeOver  *bool // §3.2, like Input.TakeOver
}

// PlannedMealRef is a Planned Meal a kind change removes.
type PlannedMealRef struct {
	ID           int64
	Date         string // YYYY-MM-DD
	MealSlotName string
	CourseName   string
	Pinned       bool
	Bought       bool
}

// SlotRuleRef is a Slot Rule by Recipe a kind change removes.
type SlotRuleRef struct {
	ID           int64
	MealSlotName string
	CourseName   string
}

// ToBasePlan is the dry run of ToBase (§3.6): what the confirm names. PlannedMeals are the unresolved ones from
// today on, Pinned and Bought included; Cooked and Not cooked ones and past ones stay. Leftovers (kept) and
// Preferences (Favourites and Dislikes removed, Exclusions moved to the Ingredient) are counts.
type ToBasePlan struct {
	PlannedMeals []PlannedMealRef
	SlotRules    []SlotRuleRef
	Leftovers    int
	Preferences  int
}

// ToPlannableInput is the body of the kind change back to a plannable Recipe.
type ToPlannableInput struct {
	Yield     float64 // portions
	CourseIDs []int64
}

// NewBase asks LinkLine to create a Base recipe from the line (§3.7): named from the line's Ingredient, with no
// lines, and the Yield given.
type NewBase struct {
	Name      string
	Yield     float64
	YieldUnit string
}

// LinkRequest is the body of the link route: exactly one of BaseRecipeID, Create or ConvertRecipeID.
// ConvertRecipeID runs ToBase on that plannable Recipe first, in the same transaction, with Yield and YieldUnit.
type LinkRequest struct {
	BaseRecipeID    int64
	Create          *NewBase
	ConvertRecipeID int64
	Yield           float64
	YieldUnit       string
	TakeOver        *bool
}

// LinkCandidate is a plain line on another Recipe that has the Base recipe's name (§3.8). Linkable false carries
// Reason (baserecipe.ReasonUnitUnconvertible or baserecipe.ReasonCycle).
type LinkCandidate struct {
	LineID         int64
	RecipeID       int64
	RecipeName     string
	Archived       bool
	IngredientID   int64
	IngredientName string
	Quantity       float64
	Unit           string
	Linkable       bool
	Reason         string
}

// MergeOffer is a plain Ingredient a link left on no Recipe line: the merge into the Base recipe's is offered.
type MergeOffer struct {
	IngredientID int64
	Name         string
	StockLots    int
	Products     int
}

// LinkResult is the answer of the bulk link.
type LinkResult struct {
	Linked     []int64
	MergeOffer []MergeOffer
}
