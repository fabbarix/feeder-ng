package recipefile

import (
	"errors"

	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// Ingredient match statuses (IngredientMatch.Status).
const (
	StatusExact     = "exact"     // same normalised name as an existing Ingredient
	StatusSuggested = "suggested" // no exact match, but close existing names exist; default is to create
	StatusNew       = "new"       // no match; created from the file's definition
	StatusUndefined = "undefined" // no match and no definition in the file: needs a decision
	StatusConflict  = "conflict"  // exact match whose Base Unit differs from the definition: needs a decision
)

// Ingredient decision actions.
const (
	ActionUse    = "use"    // use the existing Ingredient IngredientID
	ActionCreate = "create" // create an Ingredient (Name overrides the file's name, BaseUnit fills a missing definition)
)

// Recipe decision actions.
const (
	ActionReplace  = "replace"   // overwrite the existing Recipe (same id)
	ActionKeepBoth = "keep_both" // import under "<name> (2)" (next free number)
	ActionSkip     = "skip"      // leave the file's Recipe out
)

// Recipe statuses (RecipeStatus.Status).
const (
	RecipeNew      = "new"
	RecipeConflict = "conflict" // an existing Recipe has the same normalised name
)

// Warning codes.
const (
	WarnImageFailed       = "image_failed"       // an image could not be fetched or decoded; dropped
	WarnConversionDiffers = "conversion_differs" // existing Unit Conversion kept over the file's different value
)

// Existing is the household's current data that planning matches against.
type Existing struct {
	Ingredients []ingredient.Ingredient
	Recipes     []RecipeRef
}

// RecipeRef is an existing Recipe (archived ones included).
type RecipeRef struct {
	ID   int64
	Name string
}

// IngredientDecision answers one Ingredient of the file, keyed by its
// normalised name (units.NormalizeName).
type IngredientDecision struct {
	Key          string `json:"key"`
	Action       string `json:"action"`
	IngredientID int64  `json:"ingredientId,omitempty"` // ActionUse
	Name         string `json:"name,omitempty"`         // ActionCreate: rename (needed to resolve a conflict by creating)
	BaseUnit     string `json:"baseUnit,omitempty"`     // ActionCreate: for an Ingredient the file does not define
}

// ConversionAnswer is a one-off Unit Conversion for an unconvertible unit.
type ConversionAnswer struct {
	Key    string  `json:"key"` // the Ingredient's normalised file name
	Unit   string  `json:"unit"`
	ToBase float64 `json:"toBase"`
}

// RecipeDecision answers a Recipe conflict, by index into File.Recipes.
type RecipeDecision struct {
	Index  int    `json:"index"`
	Action string `json:"action"`
}

// Decisions are everything the user has answered so far. Planning is a pure
// function of (file, existing, decisions, images).
type Decisions struct {
	Ingredients []IngredientDecision `json:"ingredients"`
	Conversions []ConversionAnswer   `json:"conversions"`
	Recipes     []RecipeDecision     `json:"recipes"`
}

// Suggestion is a close existing Ingredient name.
type Suggestion struct {
	ID       int64   `json:"id"`
	Name     string  `json:"name"`
	BaseUnit string  `json:"baseUnit"`
	Score    float64 `json:"score"`
}

// ExistingRef is the existing Ingredient a name matched.
type ExistingRef struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	BaseUnit string `json:"baseUnit"`
}

// BaseUnitConflict: the file defines the Ingredient with another Base Unit than the existing one.
type BaseUnitConflict struct {
	File     string `json:"file"`
	Existing string `json:"existing"`
}

// IngredientMatch is the Import Review row for one Ingredient name of the file.
// Effective is the decision in force (the user's, or the default for exact,
// suggested and new); Resolved is false for StatusConflict and StatusUndefined
// until a decision is given. UsedBy lists JSON paths of the lines using it.
type IngredientMatch struct {
	Name        string              `json:"name"` // display name, first spelling in the file
	Key         string              `json:"key"`
	Status      string              `json:"status"`
	Definition  *Ingredient         `json:"definition,omitempty"`
	Match       *ExistingRef        `json:"match,omitempty"`
	Suggestions []Suggestion        `json:"suggestions"`
	Conflict    *BaseUnitConflict   `json:"conflict,omitempty"`
	Effective   *IngredientDecision `json:"effective,omitempty"`
	Resolved    bool                `json:"resolved"`
	UsedBy      []string            `json:"usedBy"`
	// AddsImage is true when the Ingredient this row resolves to already exists, has NO picture, and the file's definition
	// carries a picture that resolved: the import will give it that picture (IM3). An existing picture is never replaced.
	AddsImage bool `json:"addsImage"`
}

// UnitPrompt asks for one Unit Conversion: Unit cannot be converted to Base
// for the resolved Ingredient. One prompt per (Ingredient, unit) however many
// lines use it. Answered is true once Decisions has a valid answer.
type UnitPrompt struct {
	Key        string   `json:"key"`
	Ingredient string   `json:"ingredient"`
	Unit       string   `json:"unit"` // units.NormalizeUnit
	Base       string   `json:"base"`
	UsedBy     []string `json:"usedBy"`
	Answered   bool     `json:"answered"`
	ToBase     *float64 `json:"toBase,omitempty"`
}

// RecipeStatus is the Import Review row for one Recipe of the file.
type RecipeStatus struct {
	Index      int    `json:"index"`
	Name       string `json:"name"`
	Status     string `json:"status"`
	ExistingID int64  `json:"existingId,omitempty"`
	Action     string `json:"action,omitempty"` // the user's answer; empty = unanswered
	Resolved   bool   `json:"resolved"`
	ImportedAs string `json:"importedAs,omitempty"` // final name ("X (2)" for keep_both)
}

// Problem blocks the import: Path is a JSON path into the file.
type Problem struct {
	Path    string `json:"path"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Warning does not block the import (a dropped image, a kept conversion).
type Warning struct {
	Path    string `json:"path"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Plan is the whole Import Review state. Ready is true only when there are
// no Problems, every Ingredient and Recipe row is Resolved and every
// UnitPrompt is Answered.
type Plan struct {
	Ingredients []IngredientMatch `json:"ingredients"`
	UnitPrompts []UnitPrompt      `json:"unitPrompts"`
	Recipes     []RecipeStatus    `json:"recipes"`
	Problems    []Problem         `json:"problems"`
	Warnings    []Warning         `json:"warnings"`
	Ready       bool              `json:"ready"`
}

// BuildPlan computes the Import Review state (rules in the design note):
//   - Ingredients: matched by units.NormalizeName; exact -> use (conflict if the
//     definition's Base Unit differs); otherwise suggestions via
//     ingredient.Search (default create); an Ingredient used by no kept Recipe
//     is not listed. A decision for a key not in the file is ignored.
//   - Unit check against the resolved Ingredient (existing Unit Conversions plus
//     the file's missing ones, or the created definition plus answers).
//     Invalid answers (units.ValidateConversion) become Problems and leave the
//     prompt unanswered.
//   - A file conversion whose unit exists with another toBase on the matched
//     Ingredient keeps the existing one and adds WarnConversionDiffers.
//   - Recipes: same normalised name as an existing Recipe -> conflict, which
//     needs an explicit decision; two Recipes of the file with the same name
//     are a Problem at "$.recipes[i].name".
//   - Each kept Recipe is checked with recipe.Input.Validate against the
//     resolved Ingredients; the first problem becomes a Problem whose path is
//     "$.recipes[i]." + the field ("yield", "tags[1]"), "...ingredients[j]..." for lines.
//     Recipes with decision skip are not checked.
//   - Warnings carry the image warnings in images.Warnings.
func BuildPlan(f File, ex Existing, d Decisions, images ImageSet) Plan {
	return newReview(f, ex, d, images).plan()
}

// NotReadyError is returned by BuildCommit when the Plan still has open answers.
type NotReadyError struct{ Plan Plan }

func (e *NotReadyError) Error() string        { return "import review is not finished" }
func (e *NotReadyError) Is(target error) bool { return target == ErrNotReady }

// ErrStale: an answer refers to something that no longer exists (a Recipe to
// replace is no longer a conflict, an Ingredient to use is gone). The review
// must be made again.
var ErrStale = errors.New("the data changed since the review; review again")

// ErrNotReady is matched by *NotReadyError.
var ErrNotReady = errors.New("import review is not finished")

// NewIngredient is an Ingredient to create. Key is the file's normalised name
// that Recipe lines refer to.
type NewIngredient struct {
	Key   string
	Input ingredient.Input
	// ImagePath ("$.ingredients[0].image") keys into Commit.Images when the file's picture for this NEW Ingredient resolved (IM2).
	// Input.Image stays empty: the store fills it after saving the image.
	ImagePath string
}

// AddedConversion is a Unit Conversion to add to an existing Ingredient (the
// file's missing ones and the user's answers).
type AddedConversion struct {
	IngredientID int64
	Conversion   units.Conversion
}

// AddedImage gives an EXISTING Ingredient that has no picture the file's one (IM3). ImagePath keys into Commit.Images.
// The store applies it only if the Ingredient still has no picture when the import is written.
type AddedImage struct {
	IngredientID int64
	ImagePath    string
}

// ResolvedIngredient says what a file name stands for: an existing id, or (ID
// 0) one of Commit.NewIngredients by Key.
type ResolvedIngredient struct{ ID int64 }

// RecipeCommit is one Recipe to write. Input.Lines[i].IngredientID and
// Input.Steps[s].Uses[u].IngredientID are 0 and are filled from
// Commit.Resolved using LineKeys[i] / UseKeys[s][u]. Input.Image and the Step
// images are empty; ImagePath ("$.recipes[0].image") and StepImagePaths[s]
// ("$.recipes[0].steps[2].image") key into Commit.Images.
type RecipeCommit struct {
	Index          int
	Action         string // ActionReplace or "create" (new, or keep_both)
	ReplaceID      int64  // for ActionReplace
	Input          recipe.Input
	LineKeys       []string
	UseKeys        [][]string
	ImagePath      string
	StepImagePaths []string
}

// Commit is everything Confirm writes in one transaction.
type Commit struct {
	NewIngredients   []NewIngredient
	AddedConversions []AddedConversion
	AddedImages      []AddedImage // IM3: one per existing Ingredient without a picture
	Resolved         map[string]ResolvedIngredient
	Recipes          []RecipeCommit
	Images           map[string]imaging.Result // by image path; only images that were resolved
	Warnings         []Warning
}

// BuildCommit builds the write set, or *NotReadyError when BuildPlan is not
// Ready. Minutes are rounded up to whole minutes. Only Ingredients used by a
// kept Recipe are created. Tags, Source and the cool-down / use-by overrides
// are carried over; 0 days stays 0.
func BuildCommit(f File, ex Existing, d Decisions, images ImageSet) (Commit, error) {
	r := newReview(f, ex, d, images)
	if r.stale {
		return Commit{}, ErrStale
	}
	p := r.plan()
	if !p.Ready {
		return Commit{}, &NotReadyError{Plan: p}
	}
	return r.commit(), nil
}
