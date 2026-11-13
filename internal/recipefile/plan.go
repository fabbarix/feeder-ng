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

// Course decision actions (Import Review, crs-e1). ActionUse and ActionSkip are shared with the other decisions:
// "use" maps the name to the Course CourseID, "skip" leaves the name out.
const (
	ActionAdd       = "add"       // Admin only: create a Course with the file's spelling of the name
	ActionUnarchive = "unarchive" // Admin only: bring the matching archived Course back
)

// Course match statuses (CourseMatch.Status).
const (
	CourseExact    = "exact"    // matches an active Course
	CourseArchived = "archived" // matches an archived Course
	CourseUnknown  = "unknown"  // matches no Course
)

// Problem codes of Courses.
const (
	ProblemCourseNameInvalid = "course_name_invalid" // a name with no characters once trimmed
	ProblemTooManyCourses    = "too_many_courses"    // adding the Courses would pass 20 active ones
)

// Warning codes.
const (
	WarnImageFailed        = "image_failed"         // an image could not be fetched or decoded; dropped
	WarnConversionDiffers  = "conversion_differs"   // existing Unit Conversion kept over the file's different value
	WarnSameNameIngredient = "same_name_ingredient" // export: a same-name plain Ingredient left out (base units differ)
)

// Existing is the household's current data that planning matches against.
type Existing struct {
	Ingredients []ingredient.Ingredient
	Recipes     []RecipeRef
	// Courses are every Course of the Household, archived ones included, in household order. Empty (a caller
	// that does not know Courses) leaves the imported Recipes' CourseIDs and WholeMeal as the file says.
	Courses []CourseRef
	// BaseRecipes (beta.6, BR-C) says which of Recipes are Base recipes and which Ingredient each owns. Recipes still
	// lists every Recipe, so name conflicts work as before. A Base recipe's Ingredient is also in Ingredients, but
	// plain-name matching never returns it.
	BaseRecipes []BaseRecipeRef
	// IngredientUses (beta.6, BR-C commit half) is what the take-over ask of P7 shows, by plain Ingredient id: the Recipes
	// it is on (archived included, lines and Step uses) and its count of Stock lots.
	IngredientUses map[int64]IngredientUse
}

// BaseRecipeRef marks an existing Recipe as a Base recipe.
type BaseRecipeRef struct {
	RecipeID     int64
	IngredientID int64
}

// IngredientUse says where a plain Ingredient is used and how much Stock it has.
type IngredientUse struct {
	Recipes   []NamedRef
	StockLots int
}

// NamedRef is a Recipe by id and name, as the take-over ask lists them.
type NamedRef struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

// CourseRef is an existing Course.
type CourseRef struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Main     bool   `json:"main"`
	Archived bool   `json:"archived"`
}

// RecipeRef is an existing Recipe (archived ones included).
type RecipeRef struct {
	ID   int64
	Name string
	// ReadyMeal (beta.6, BR-C round 2): a Ready Meal is never a Base recipe target. Filled by the store from the Recipe.
	ReadyMeal bool
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
	Courses     []CourseDecision     `json:"courses"`
	// BaseRecipeLines (beta.6, BR-C) answers the Base recipe tiles, by line path ("$.recipes[0].ingredients[1]").
	BaseRecipeLines map[string]BaseRecipeLineDecision `json:"baseRecipeLines,omitempty"`
	// TakeOvers (beta.6, BR-C, P7 = B) answers the take-over asks by path: true takes the same-name plain Ingredient over,
	// false keeps it apart. Nothing is preselected; an ask without an answer keeps the plan not Ready.
	TakeOvers map[string]bool `json:"takeOvers,omitempty"`
}

// Base recipe line actions (BaseRecipeLineDecision.Action).
const (
	BaseUse     = "use"     // an existing Base recipe (RecipeID)
	BaseFile    = "file"    // a Recipe of this file (RecipeIndex); Yield and YieldUnit when the file does not mark it as a Base recipe
	BaseCreate  = "create"  // a new, empty Base recipe named from the line
	BaseConvert = "convert" // an existing plannable Recipe (RecipeID) turned into a Base recipe, with Yield and YieldUnit
	BaseKeep    = "keep"    // the line stays a plain Ingredient line
)

// BaseRecipeLineDecision answers one Base recipe tile.
type BaseRecipeLineDecision struct {
	Action      string  `json:"action"`
	RecipeID    int64   `json:"recipeId,omitempty"`
	RecipeIndex *int    `json:"recipeIndex,omitempty"`
	Yield       float64 `json:"yield,omitempty"`
	YieldUnit   string  `json:"yieldUnit,omitempty"`
	ReadNext    bool    `json:"readNext,omitempty"` // BaseCreate: offer to read the recipe after Confirm
}

// Suggestion kinds of a Base recipe tile.
const (
	SuggestBase      = "base"      // an existing Base recipe
	SuggestPlannable = "plannable" // an existing plannable Recipe
	SuggestFile      = "file"      // a Recipe of the same file
)

// Problem codes of Base recipe lines.
const (
	ProblemBaseRecipeAnswer = "base_recipe_answer_invalid" // the answer does not fit the row (unknown Recipe, no Yield, ...)
	ProblemBaseRecipeCycle  = "base_recipe_cycle"          // the file's own answers make Recipes call for each other
)

// TakeOverAsk is the P7 question of Import Review: a Base recipe the import creates has the name of a plain Ingredient
// that exists. Path is the line path (create, convert) or "$.recipes[i]" (a Recipe of the file). Convertible is false
// when the Base Unit differs; then only "keep apart" applies and Resolved is already true (with a same_name_ingredient
// warning). Answer is the User's, when given.
type TakeOverAsk struct {
	Path        string      `json:"path"`
	Name        string      `json:"name"`
	Ingredient  ExistingRef `json:"ingredient"`
	Recipes     []NamedRef  `json:"recipes"`
	StockLots   int         `json:"stockLots"`
	Convertible bool        `json:"convertible"`
	Answer      *bool       `json:"answer,omitempty"`
	Resolved    bool        `json:"resolved"`
}

// BaseRecipeSuggestion is one Recipe a line may be.
type BaseRecipeSuggestion struct {
	Kind        string `json:"kind"`
	RecipeID    int64  `json:"recipeId,omitempty"`
	RecipeIndex *int   `json:"recipeIndex,omitempty"`
	Name        string `json:"name"`
	Exact       bool   `json:"exact"`
}

// BaseRecipeLine is the Import Review tile for one line that the model marked or that matches a Recipe by name.
// Effective is the answer in force: the User's, or the preselected one (only an exact name match to an existing Base
// recipe or to a Base recipe of this file); Resolved is false until there is one. KeepIngredient is the plain Ingredient of
// the same name, when one exists (the "Keep it as an Ingredient" answer shows it).
type BaseRecipeLine struct {
	Path           string                  `json:"path"`
	Name           string                  `json:"name"` // the line's Ingredient as read
	Reference      string                  `json:"reference,omitempty"`
	Cue            string                  `json:"cue,omitempty"`
	Quantity       float64                 `json:"quantity"`
	Unit           string                  `json:"unit"`
	Suggestions    []BaseRecipeSuggestion  `json:"suggestions"`
	KeepIngredient *ExistingRef            `json:"keepIngredient,omitempty"`
	Effective      *BaseRecipeLineDecision `json:"effective,omitempty"`
	Resolved       bool                    `json:"resolved"`
}

// CourseDecision answers one Course name of the file, keyed by course.NameKey of the name.
type CourseDecision struct {
	Key      string `json:"key"`
	Action   string `json:"action"`             // ActionUse, ActionSkip, ActionAdd or ActionUnarchive
	CourseID int64  `json:"courseId,omitempty"` // ActionUse: an active Course
}

// CourseMatch is the Import Review row for one Course name of the file (one row per distinct key). Effective is
// the answer in force: the User's, or the default (use the main Course) for an archived or unknown name; so
// Resolved is true unless the User's answer is not valid.
type CourseMatch struct {
	Name      string          `json:"name"` // display name, first spelling in the file
	Key       string          `json:"key"`
	Status    string          `json:"status"`
	Match     *CourseRef      `json:"match,omitempty"` // the active or archived Course the name matched
	Effective *CourseDecision `json:"effective,omitempty"`
	Resolved  bool            `json:"resolved"`
	UsedBy    []string        `json:"usedBy"` // JSON paths like "$.recipes[0].courses[1]"
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
	Courses     []CourseMatch     `json:"courses"`
	// BaseRecipeLines (beta.6, BR-C): never null in JSON; Ready needs every row Resolved.
	BaseRecipeLines []BaseRecipeLine `json:"baseRecipeLines"`
	// TakeOvers (beta.6, BR-C): never null in JSON; every ask needs its answer for Ready.
	TakeOvers []TakeOverAsk `json:"takeOvers"`
	Problems  []Problem     `json:"problems"`
	Warnings  []Warning     `json:"warnings"`
	Ready     bool          `json:"ready"`
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

// Base recipe references of a Commit (beta.6, BR-C commit half).
const (
	BaseRefRecipe = "recipe" // ID: a stored Base recipe (use) or a plannable Recipe turned into one (convert)
	BaseRefFile   = "file"   // Index: a Recipe of the file that this Commit creates as a Base recipe
	BaseRefLine   = "line"   // Line: the path of a create answer; the Base recipe it names is written by this Commit
)

// BaseRef is the Base recipe a Base recipe line calls for. Kind "" is a plain line (its Ingredient comes from
// LineKeys / UseKeys).
type BaseRef struct {
	Kind  string
	ID    int64
	Index int
	Line  string
}

// RecipeCommit is one Recipe to write. Input.Lines[i].IngredientID and
// Input.Steps[s].Uses[u].IngredientID are 0 and are filled from
// Commit.Resolved using LineKeys[i] / UseKeys[s][u], or, for a Base recipe line (LineBases[i].Kind set,
// UseBases[s][u]), from the Base recipe's Ingredient. Input.Image and the Step
// images are empty; ImagePath ("$.recipes[0].image") and StepImagePaths[s]
// ("$.recipes[0].steps[2].image") key into Commit.Images.
type RecipeCommit struct {
	// Index is the Recipe of the file, -1 for a create answer (a Base recipe that has no file Recipe).
	Index int
	// NewCourseKeys are the NewCourses (by Key) this Recipe also gets, once created; Input.CourseIDs holds the
	// existing ones. The store writes the Recipe's Courses in household order.
	NewCourseKeys  []string
	Action         string // ActionReplace or "create" (new, or keep_both)
	ReplaceID      int64  // for ActionReplace
	Input          recipe.Input
	LineKeys       []string
	UseKeys        [][]string
	LineBases      []BaseRef
	UseBases       [][]BaseRef
	ImagePath      string
	StepImagePaths []string
	// Line is the path of the create answer that asked for this Recipe ("" otherwise).
	Line string
	// ReadNext is the create tile's "Read it next" answer: the screen offers to read the Base recipe after Confirm.
	ReadNext bool
	// TakeOver is the answer of the take-over ask for this Base recipe (nil: no same-name plain Ingredient to ask about).
	TakeOver *bool
	// BaseShelfLifeDays and BaseImage are the file's definition of the Ingredient this new Base recipe gets (the Shelf
	// Life and the picture of the file's Ingredient of its name). BaseImage keys into Commit.Images; "" = none.
	BaseShelfLifeDays *int
	BaseImage         string
}

// NewCourse is a Course to create (an Admin's "add" answer), added last in the household order.
type NewCourse struct {
	Key  string // course.NameKey of the name; RecipeCommit.NewCourseKeys refer to it
	Name string // course.CleanName of the first spelling in the file
}

// Commit is everything Confirm writes in one transaction.
type Commit struct {
	NewCourses       []NewCourse // created first, in file order
	UnarchiveCourses []int64     // archived Courses to bring back (an Admin's "unarchive" answer)
	NewIngredients   []NewIngredient
	AddedConversions []AddedConversion
	AddedImages      []AddedImage // IM3: one per existing Ingredient without a picture
	Resolved         map[string]ResolvedIngredient
	Recipes          []RecipeCommit
	Images           map[string]imaging.Result // by image path; only images that were resolved
	Warnings         []Warning
	// BaseConversions (beta.6, BR-C): the unit prompts answered for Base recipe Ingredients, saved on the Ingredient the
	// reference names once it exists.
	BaseConversions []BaseConversion
	// BaseRecipeLines (beta.6, BR-C): each answered tile. The Recipes (RecipeCommit.LineBases) carry where they point.
	BaseRecipeLines []BaseRecipeLineCommit
}

// BaseConversion is a unit conversion answered for a Base recipe's Ingredient.
type BaseConversion struct {
	Ref        BaseRef
	Conversion units.Conversion
}

// BaseRecipeLineCommit is one answered tile for the store: the Base recipes to create come before the Recipes that call for them.
type BaseRecipeLineCommit struct {
	RecipeIndex int // the Recipe of the file the line is in
	Line        int
	Path        string // the tile's line path ("$.recipes[0].ingredients[1]")
	Decision    BaseRecipeLineDecision
	// TakeOver is the answer of the take-over ask of this line's Base recipe (convert, create), nil when there is none.
	TakeOver *bool
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
	return r.commit()
}
