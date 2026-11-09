// Package planner is the pure meal-planning engine (functional spec §7, §8).
//
// It imports only the standard library: no SQL, no HTTP, no time.Now. Every
// input, including "now" and the random seed, is passed in, so the output is a
// deterministic function of the Input. Phrasing of the "why chips" happens in
// the frontend; this package returns structured reason codes with parameters.
package planner

import (
	"errors"
	"time"
)

// Identifiers. All are server row ids.
type (
	RecipeID     int64
	IngredientID int64
	MemberID     int64
	ProductID    int64
	// Tag is a household-defined Recipe label (its name, e.g. "fish").
	Tag string
)

// Date is a household-local calendar day formatted YYYY-MM-DD. The empty Date
// means "none" (for example a Stock Lot that never goes off).
type Date string

// SlotKey identifies one Meal Slot on one date.
type SlotKey struct {
	Date       Date
	MealSlotID int64
}

// Attendee is one Member eating at a slot, with their effective Portion Factor.
type Attendee struct {
	MemberID      MemberID
	PortionFactor float64
}

// SlotRule is a Slot Rule: exactly one of RecipeID or Tag is set. A slot with
// several rules accepts a Recipe matching any of them.
type SlotRule struct {
	RecipeID RecipeID
	Tag      Tag
}

// MealState is the state of an existing Planned Meal.
type MealState int

const (
	// MealPlanned is an unpinned, uncooked Planned Meal. Plan keeps it (if
	// still valid); Regenerate replaces it.
	MealPlanned MealState = iota
	// MealPinned is never replaced; it still consumes projected Stock and
	// produces a pending Leftover.
	MealPinned
	// MealCooked is never replaced. Stock was already deducted (ADR 0003) and
	// its actual Leftover is in Input.Leftovers.
	MealCooked
	// MealSkipped ("we had takeaway") is never replaced and has no effect on
	// Stock, Leftovers, cool-down or Variety Rules.
	MealSkipped
)

// LeftoverSource names the Leftover a meal is served from. A non-zero
// LeftoverID is an actual recorded Leftover (Input.Leftovers); otherwise the
// Leftover is the extra portions of the fresh meal planned at FromSlot.
type LeftoverSource struct {
	LeftoverID int64
	FromSlot   SlotKey
}

// ExistingMeal is a Planned Meal already stored for a slot.
type ExistingMeal struct {
	State    MealState
	RecipeID RecipeID
	// Batches cooked (may be fractional for Pinned meals). Ignored when From is set.
	Batches float64
	// From is non-nil when the meal is served from a Leftover.
	From *LeftoverSource
}

// Slot is one Meal Slot occurrence in the Planning Horizon.
type Slot struct {
	Key SlotKey
	// At is the slot time instant (Key.Date plus the usual time, household zone).
	At         time.Time
	Attendance []Attendee
	Rules      []SlotRule
	Existing   *ExistingMeal
}

// Need is one ingredient line for ONE Batch, already in Base Units.
type Need struct {
	IngredientID IngredientID
	Quantity     float64
	Optional     bool
}

// AdvanceStep is an Advance Step; it must start Lead before the slot time.
type AdvanceStep struct{ Lead time.Duration }

// Recipe is the planner's view of a Recipe.
type Recipe struct {
	ID       RecipeID
	Yield    float64 // portions per Batch; Recipes with Yield <= 0 are ignored
	Tags     []Tag
	Archived bool
	// CooldownDays and UseByDays override the household defaults when non-nil.
	CooldownDays *int
	UseByDays    *int
	Needs        []Need
	AdvanceSteps []AdvanceStep
}

// Preferences are one Member's Favourites, Dislikes and Exclusions.
type Preferences struct {
	Favourites          []RecipeID
	Dislikes            []RecipeID
	ExcludedRecipes     []RecipeID
	ExcludedIngredients []IngredientID
}

// StockLot is one purchase's worth of an Ingredient in Stock.
type StockLot struct {
	ID           int64
	IngredientID IngredientID
	Quantity     float64 // Base Units
	Purchased    Date
	GoesOff      Date // "" = never; usable up to and including this date
}

// Pack is the pack size (Base Units) of the Product last bought for an Ingredient.
type Pack struct {
	ProductID ProductID
	Size      float64
}

// Leftover is an actual Leftover recorded when a Planned Meal was marked Cooked.
type Leftover struct {
	ID       int64
	RecipeID RecipeID
	Portions float64 // portions remaining
	CookedOn Date
	UseBy    Date // last date it may be served
}

// VarietyRule limits how often Recipes carrying Tag may be cooked.
type VarietyRule struct {
	Tag Tag
	// MaxPerWeek is the cap per ISO week (Monday to Sunday); 0 = no cap.
	MaxPerWeek int
	// NotConsecutiveDays forbids cooking the Tag on adjacent days.
	NotConsecutiveDays bool
}

// Config carries the household defaults and the two planner constants.
type Config struct {
	DefaultCooldownDays int // 7
	DefaultUseByDays    int // 3
	// RecencyDays: a Recipe last planned/cooked this many days ago (or more) has recentness 0. Default 28.
	RecencyDays int
	// PerishWindowDays: a Stock Lot is "at risk" if it goes off within this many days of the slot. Default 2.
	PerishWindowDays int
}

// DefaultConfig returns the spec defaults (7, 3) and the planner constants (28, 2).
func DefaultConfig() Config {
	return Config{DefaultCooldownDays: 7, DefaultUseByDays: 3, RecencyDays: 28, PerishWindowDays: 2}
}

// Weights are the score weights (§7.2 step 3). Signs are part of the value:
// Dislike, LeftoverWasted and Recency are negative in every preset.
type Weights struct {
	Favourite         float64 // per attending Member who has it as Favourite
	Dislike           float64 // per attending Member who dislikes it
	PerishableUse     float64 // x share in [0,1]
	IngredientOverlap float64 // x share in [0,1]
	StockCoverage     float64 // x share in [0,1]
	LeftoverFits      float64
	LeftoverWasted    float64
	Recency           float64 // x recentness in [0,1]
	Jitter            float64 // amplitude: the term is in [-Jitter, +Jitter]
}

// Input is everything one planning run needs.
type Input struct {
	Now   time.Time
	Seed  int64
	Style float64 // Planner Style position 0..1 (0 Use what we have, 0.5 Variety/default, 1 Favourites)
	// Weights, when non-nil, replaces WeightsFor(Style). Used by tests and diagnostics.
	Weights *Weights
	Config  Config

	Slots   []Slot
	Recipes []Recipe // include archived ones (existing meals may refer to them)
	// Members maps each Member to their preferences; absent = none.
	Members map[MemberID]Preferences

	Lots          []StockLot
	ShelfLifeDays map[IngredientID]int // for Stock Lots created by planned purchases
	Packs         map[IngredientID]Pack
	Leftovers     []Leftover
	// LastPlanned is the last planned or cooked (fresh) date per Recipe before the horizon.
	LastPlanned  map[RecipeID]Date
	VarietyRules []VarietyRule
}

// SourceKind says where a placement's food comes from.
type SourceKind int

const (
	SourceRecipe   SourceKind = iota // freshly cooked
	SourceLeftover                   // served from a Leftover
)

// NewLeftover is the Leftover a placement will create.
type NewLeftover struct {
	Portions float64
	UseBy    Date
}

// Purchase is a planned purchase, exact or rounded up to whole packs.
type Purchase struct {
	IngredientID IngredientID
	ProductID    ProductID // 0 when no Product has been bought yet
	Shortfall    float64   // exact amount missing, Base Units
	Packs        int       // 0 when no Product has been bought yet
	PackSize     float64
	Quantity     float64 // Packs*PackSize, or Shortfall when Packs == 0
}

// TermCode names a score term.
type TermCode string

const (
	TermFavourite         TermCode = "favourite"
	TermDislike           TermCode = "dislike"
	TermPerishableUse     TermCode = "perishable_use"
	TermIngredientOverlap TermCode = "ingredient_overlap"
	TermStockCoverage     TermCode = "stock_coverage"
	TermLeftoverFits      TermCode = "leftover_fits"
	TermLeftoverWasted    TermCode = "leftover_wasted"
	TermRecency           TermCode = "recency"
	TermJitter            TermCode = "jitter"
)

// ScoreTerm is one non-zero contribution to a score (already multiplied by its weight).
type ScoreTerm struct {
	Term  TermCode
	Value float64
}

// ReasonCode is a why-chip kind. The frontend phrases it.
type ReasonCode string

const (
	ReasonSlotRule          ReasonCode = "slot_rule"          // Tag or RecipeID
	ReasonLeftover          ReasonCode = "leftover"           // Date = day the Leftover was cooked, RecipeID
	ReasonFavourite         ReasonCode = "favourite"          // MemberIDs
	ReasonPerishableUse     ReasonCode = "perishable_use"     // IngredientID, Date = go-off date
	ReasonIngredientOverlap ReasonCode = "ingredient_overlap" // IngredientID, Date = day the pack was planned for purchase
	ReasonStockCoverage     ReasonCode = "stock_coverage"
	ReasonLeftoverFits      ReasonCode = "leftover_fits" // Date = day the extra portions will be served
	ReasonBestAvailable     ReasonCode = "best_available"
)

// Why is a structured why chip: a reason code with its parameters. Unused
// parameters are zero.
type Why struct {
	Code         ReasonCode
	Value        float64 // score contribution; 0 for slot_rule and leftover
	MemberIDs    []MemberID
	IngredientID IngredientID
	RecipeID     RecipeID
	Tag          Tag
	Date         Date
}

// Placement is a slot the planner filled.
type Placement struct {
	Key         SlotKey
	Source      SourceKind
	RecipeID    RecipeID
	Batches     int     // 0 for a Leftover
	Portions    float64 // portions the slot needs
	From        *LeftoverSource
	NewLeftover *NewLeftover // nil when Batches x Yield == Portions
	// Purchases are the planned purchases this placement caused.
	Purchases []Purchase
	Score     float64 // sum of Terms (0 for a Leftover)
	Terms     []ScoreTerm
	Why       []Why // 1 to 3 chips
}

// UnfilledReason says why a slot stays empty.
type UnfilledReason string

const (
	UnfilledNoAttendance UnfilledReason = "no_attendance"
	UnfilledNoCandidates UnfilledReason = "no_candidates"
)

// Eliminations counts candidates removed by each filter, each candidate
// counted once, by the first filter that removed it (Exclusion, Cool-down,
// Variety Rule, Advance Step, in that order).
type Eliminations struct {
	Considered  int // non-archived Recipes left after the Slot Rule narrowing
	Exclusion   int
	CoolDown    int
	VarietyRule int
	AdvanceStep int
}

// Unfilled is a slot the planner could not fill.
type Unfilled struct {
	Key             SlotKey
	Reason          UnfilledReason
	SlotRuleClaimed bool
	Eliminated      Eliminations
}

// Result is the output of Plan and Regenerate. Placements and Unfilled are in
// chronological order and cover every slot that was not fixed.
type Result struct {
	Placements []Placement
	Unfilled   []Unfilled
	// Kept are unpinned Planned Meals that Plan left unchanged.
	Kept []SlotKey
	// Purchases are the planned purchases of the whole walk (fixed and new
	// uncooked meals), one entry per Ingredient, ordered by IngredientID.
	Purchases []Purchase
}

var (
	ErrDuplicateSlot    = errors.New("planner: duplicate slot key")
	ErrUnknownSlot      = errors.New("planner: unknown slot")
	ErrSlotNotSwappable = errors.New("planner: slot is Cooked or skipped")
)
