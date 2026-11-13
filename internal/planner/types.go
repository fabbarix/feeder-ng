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

// SlotKey identifies one cell: one Course of one Meal Slot on one date, the key
// of a Planned Meal (ADR 0008). CourseID 0 is a cell with no Course, which skips
// Course fit and the Whole meal rules; the plan package only produces it for a
// slot without Courses, which the store never holds (crs-c3).
type SlotKey struct {
	Date       Date
	MealSlotID int64
	CourseID   int64
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
	// Relaxed is true when the stored Planned Meal is a relaxed pick (ADR 0009).
	Relaxed bool
	// PlacedPortions is what the cell needed when the meal was placed (the stored planned_meals.portions); 0 = unknown.
	// Batches follow portions only when the portions CHANGE: a fresh meal, unpinned or Pinned, is raised only when the
	// cell's current portions are greater than PlacedPortions, so a Pinned 0.5 Batch whose portions did not change stays.
	PlacedPortions float64
}

// Slot is one cell in the Planning Horizon: one Course of one Meal Slot on one
// date. The name stays for compatibility; see crs-b.md for the cell rules.
type Slot struct {
	Key SlotKey
	// At is the slot time instant (Key.Date plus the usual time, household zone).
	// Every cell of one Meal Slot on one date shares it.
	At time.Time
	// Attendance is the cell's Course Attendance: the Meal Slot's Attendance on
	// that date less the opt-outs of this Course. It gives the cell's portions,
	// Exclusions, Dislikes and Favourites.
	Attendance []Attendee
	Rules      []SlotRule // the Slot Rules of this cell's Course
	Existing   *ExistingMeal

	// Main marks the Meal Slot's main Course: it is walked first and a Whole
	// meal planned in it covers the slot's other Courses.
	Main bool
	// Optional marks an optional Course of the Meal Slot (never relaxed, walked
	// after the required Courses, left empty with no reason when nothing fits).
	Optional bool
	// Position is the Course's place in the Meal Slot's own order (0-based); it
	// orders the required Courses and the optional Courses among themselves.
	Position int
	// AllOptedOut is true when the Meal Slot has attendees on this date but every
	// one of them opts out of this Course (so Attendance is empty): the cell is
	// not served. A Meal Slot nobody attends leaves it false. It is ignored when
	// Guests > 0: Guests eat every Course the slot serves (ADR 0014, U3).
	AllOptedOut bool
	// Guests is the number of Guests of the Meal Slot on that date (0 to 20). Each is one standard portion of every
	// Course: the cell's portions are the Attendance's Portion Factors plus Guests. They add portions, Batches and
	// Leftover maths, never preferences or Exclusions (those come from the Attendance, Members only). A cell with no
	// Attendance and Guests > 0 is planned, with no preferences (U3). Use Portions() for the sum.
	Guests int
	// NotServed is true when the Meal Slot is Not served on this date (ADR 0014): the cell is left empty with
	// NotServedDate and no reason, its unresolved Planned Meal (Pinned too, if the caller passes one) is neither kept
	// nor replanned, and it takes no part in Stock, Leftovers, Cool-down, recency or a Whole meal's covering.
	NotServed bool
}

// Portions is the cell's portions: the Portion Factors of its Attendance plus one per Guest.
func (s Slot) Portions() float64 {
	return PortionsNeeded(s.Attendance) + float64(s.Guests)
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
	Name     string  // for display only; the planner never reads it
	Yield    float64 // portions per Batch; Recipes with Yield <= 0 are ignored
	Tags     []Tag
	Archived bool
	// CooldownDays and UseByDays override the household defaults when non-nil.
	CooldownDays *int
	UseByDays    *int
	Needs        []Need
	AdvanceSteps []AdvanceStep
	// CourseIDs are the Courses the Recipe is marked with (Course fit). A cell
	// with CourseID 0 skips Course fit.
	CourseIDs []int64
	// WholeMeal: planned in a slot's main Course it covers the slot's other Courses.
	WholeMeal bool
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
	ID int64
	// FromSlot is the slot of the Cooked meal that produced it. Dependants
	// that were planned against that meal (LeftoverSource.FromSlot) are matched
	// to this Leftover. The zero SlotKey means "not recorded".
	FromSlot SlotKey
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
	// The two relaxed chips (ADR 0009, spec 7.2 step 5). Only a relaxed pick carries one, last in Why.
	ReasonCooldownRelaxed ReasonCode = "cooldown_relaxed" // Date = the nearest fresh cook of the Recipe, RecipeID
	ReasonVarietyRelaxed  ReasonCode = "variety_relaxed"  // Tag, and Value = the count this week or Date = the adjacent day
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
	// Why holds up to 3 score chips, then the relaxed chip of a relaxed pick; empty when there is nothing to say.
	Why []Why
	// Relaxed is true for a relaxed pick (ADR 0009, spec 7.2 step 2b).
	Relaxed bool
}

// UnfilledReason says why a slot stays empty.
type UnfilledReason string

const (
	UnfilledNoAttendance UnfilledReason = "no_attendance"
	UnfilledNoCandidates UnfilledReason = "no_candidates"
	// UnfilledNoCourseRecipes: no non-archived Recipe is marked with the cell's Course.
	UnfilledNoCourseRecipes UnfilledReason = "no_course_recipes"
)

// Eliminations counts candidates removed by each filter, each candidate counted
// once, by the first filter that removed it: hard filters first (Exclusion, then
// Advance Step), then the soft ones (Cool-down, Variety Rule). A Recipe that
// passes every hard filter is a relaxed candidate, so a recorded Unfilled always
// has CoolDown and VarietyRule at 0 (ADR 0009); the fields stay for JSON compatibility.
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
	// Exclusions says which Exclusions ruled the cell's Recipes out (docs/dev/design/rx-pt.md 2). Nil unless Reason
	// is UnfilledNoCandidates and Eliminated.Exclusion > 0.
	Exclusions []ExclusionRecord
	// MoreExclusions counts the records left out by MaxExclusionRecords.
	MoreExclusions int
}

const (
	MaxExclusionRecords = 8 // records kept per cell
	MaxExclusionRecipes = 5 // Recipe ids kept per record
)

// ExclusionRecord is one (Member, Ingredient) pair, or one Member's direct Exclusions (IngredientID 0), and the
// Recipes of the cell it rules out.
type ExclusionRecord struct {
	MemberID     MemberID
	IngredientID IngredientID // 0: the Member excludes the Recipes themselves
	RecipeIDs    []RecipeID   // ascending, at most MaxExclusionRecipes
	RecipeCount  int          // every Recipe of the cell this record rules out
}

// NotServedCause says why a cell is left empty with no Couldn't plan reason.
type NotServedCause string

const (
	// NotServedCovered: a Whole meal in the main Course covers the cell (spec 7.2 step 0).
	NotServedCovered NotServedCause = "covered"
	// NotServedOptional: an optional Course with no Leftover and no strict candidate (step 0b).
	NotServedOptional NotServedCause = "optional"
	// NotServedNoCourseAttendance: every attendee opts out of the Course on that date (step 0b).
	NotServedNoCourseAttendance NotServedCause = "no_course_attendance"
	// NotServedDate: the whole Meal Slot is Not served on that date (Slot.NotServed; ADR 0014).
	NotServedDate NotServedCause = "not_served"
)

// NotServed is a cell the planner left empty on purpose; it has no reason row.
type NotServed struct {
	Key   SlotKey
	Cause NotServedCause
}

// BatchRaise is one raised cell: the Batches to write and the portions they now cover.
type BatchRaise struct {
	Key      SlotKey
	Batches  int
	Portions float64
}

// Recheck is the outcome of the keep check (spec 7.2, step 2b) for one kept fresh
// Planned Meal: the flag and the relaxed chip it must carry now. Relaxed is false
// and Why nil when it keeps every soft rule. The adapter replaces the old relaxed
// chip of the stored meal with Why.
type Recheck struct {
	Key     SlotKey
	Relaxed bool
	Why     *Why
}

// Result is the output of Plan and Regenerate. Placements and Unfilled are in
// chronological order and cover every slot that was not fixed.
type Result struct {
	Placements []Placement
	Unfilled   []Unfilled
	// Kept are unpinned Planned Meals that Plan left unchanged.
	Kept []SlotKey
	// KeptPortions are the Portions each kept meal is planned for: its cell's Course Attendance. Its Batches still cover
	// them (spec 7.2); Reconcile writes them when the stored meal has other Portions.
	KeptPortions map[SlotKey]float64
	// Rechecks has one entry per kept fresh Planned Meal (the keep check); empty for Regenerate.
	Rechecks []Recheck
	// NotServed are the cells left empty with no reason: covered, optional and nothing fits, or nobody eats the Course.
	// A Pinned, Cooked or Not cooked Planned Meal in such a cell stays and the cell is not listed.
	NotServed []NotServed
	// Raised are the cells whose existing fresh Planned Meal keeps its Recipe but needs more Batches to cover the cell's
	// portions (Guests, a new Member, a Portion Factor, an opt-out removed): unpinned (they are also in Kept) and
	// Pinned alike (ADR 0014, point 6). Batches = ceil(portions / Yield); fewer portions never lower Batches, so a meal
	// whose Batches still cover its portions is not listed. Cooked and Not cooked meals are never raised.
	Raised []BatchRaise
	// Purchases are the planned purchases of the whole walk (fixed and new
	// uncooked meals), one entry per Ingredient, ordered by IngredientID.
	Purchases []Purchase
}

var (
	ErrDuplicateSlot    = errors.New("planner: duplicate slot key")
	ErrUnknownSlot      = errors.New("planner: unknown slot")
	ErrSlotNotSwappable = errors.New("planner: slot is Cooked or skipped")
)
