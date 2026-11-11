// Package plan is the pure side of planning (functional spec §7, §8): it adapts
// the household's stored state into a planner.Input, turns a planner.Result
// back into row changes, and holds the Cooked / Leftover rules. It has no SQL,
// HTTP or time.Now. The store, runner and HTTP layers live in sub-packages.
package plan

import (
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/planner"
)

// ConfirmAfter is how long after its slot time an unconfirmed Planned Meal
// appears in the "To confirm" list (spec §8).
const ConfirmAfter = 2 * time.Hour

// Key identifies one Meal Slot on one date (YYYY-MM-DD, household time).
type Key struct {
	Date       string
	MealSlotID int64
}

// State is the state of a Planned Meal. Pinned is a separate flag on a planned meal.
type State string

const (
	StatePlanned State = "planned" // not yet confirmed as prepared; Pinned or not
	StateCooked  State = "cooked"
	StateSkipped State = "skipped" // "Not cooked": we had takeaway
)

// Source says which Leftover a meal is served from: the extra portions of the
// fresh meal at From. LeftoverID is the actual Leftover once that meal is Cooked.
type Source struct {
	LeftoverID int64
	From       Key
}

// Meal is one Planned Meal.
type Meal struct {
	ID       int64
	Key      Key
	RecipeID int64
	Batches  float64 // 0 when served from a Leftover
	Portions float64 // what the slot needed when it was placed
	State    State
	Pinned   bool
	From     *Source // non-nil: served from a Leftover
	Why      []Why
}

// Fresh reports whether the meal is cooked from scratch (not served from a Leftover).
func (m Meal) Fresh() bool { return m.From == nil }

// Why is a structured why chip as stored and served; the SPA phrases it
// (web/src/features/plan/lib/phrase.ts). Codes are planner.ReasonCode strings.
type Why struct {
	Code         string  `json:"code"`
	Value        float64 `json:"value,omitempty"`
	MemberIDs    []int64 `json:"memberIds,omitempty"`
	IngredientID int64   `json:"ingredientId,omitempty"`
	RecipeID     int64   `json:"recipeId,omitempty"`
	Tag          string  `json:"tag,omitempty"`
	Date         string  `json:"date,omitempty"`
}

// LeftoverStatus is available or discarded (past Use-by, recorded as waste).
type LeftoverStatus string

const (
	LeftoverAvailable LeftoverStatus = "available"
	LeftoverDiscarded LeftoverStatus = "discarded"
)

// Leftover is an actual Leftover recorded when a fresh Planned Meal was marked Cooked.
type Leftover struct {
	ID       int64
	RecipeID int64
	From     Key     // slot of the Cooked meal
	Portions float64 // remaining
	CookedOn string
	UseBy    string // last date it may be served
	Status   LeftoverStatus
}

// SlotRule fixes a Meal Slot to a Recipe or a Tag: exactly one of RecipeID or Tag is set (Tag is a recipe.TagKey).
type SlotRule struct {
	ID         int64
	MealSlotID int64
	RecipeID   int64
	Tag        string
}

// VarietyRule limits a Tag (a recipe.TagKey): at most MaxPerWeek per ISO week (0 = no cap) and/or never on consecutive days.
type VarietyRule struct {
	Tag                string
	MaxPerWeek         int
	NotConsecutiveDays bool
}

// Eliminations mirrors planner.Eliminations for storage and JSON.
type Eliminations struct {
	Considered  int `json:"considered"`
	Exclusion   int `json:"exclusion"`
	CoolDown    int `json:"coolDown"`
	VarietyRule int `json:"varietyRule"`
	AdvanceStep int `json:"advanceStep"`
}

// Unfilled is a slot the planner could not fill ("Couldn't plan" reason).
type Unfilled struct {
	Key             Key
	Reason          string // planner.UnfilledReason: "no_attendance" | "no_candidates"
	SlotRuleClaimed bool
	Eliminated      Eliminations
}

// Reason says why a planning run happened.
type Reason string

const (
	ReasonNightly           Reason = "nightly"
	ReasonRegenerate        Reason = "regenerate"
	ReasonRecipeChanged     Reason = "recipe_changed"     // a Recipe edited or archived
	ReasonAttendanceChanged Reason = "attendance_changed" // usual or per-date Attendance changed
	ReasonUnpinned          Reason = "unpinned"
	ReasonLeftoversChanged  Reason = "leftovers_changed" // a Cooked confirmation changed the Leftover count
	ReasonStockTake         Reason = "stock_take"
	ReasonRulesChanged      Reason = "rules_changed" // Slot or Variety Rules edited
	ReasonPinned            Reason = "pinned"        // set, swapped or confirmed
	ReasonNotCooked         Reason = "not_cooked"
	ReasonStartup           Reason = "startup" // the planner replans once when the app starts
)

// Errors.
var (
	ErrNoZone          = errors.New("plan: snapshot has no time zone")
	ErrBadTime         = errors.New("plan: slot time is not HH:MM")
	ErrInvalidLeftover = errors.New("plan: Leftover portions out of range")
)

// Settings are the Household settings planning needs.
type Settings struct {
	HorizonDays         int
	DefaultCooldownDays int
	DefaultUseByDays    int
	Style               float64 // Planner Style 0..1
}

// Attendee is one Member at a slot with the effective Portion Factor already resolved.
type Attendee struct {
	MemberID int64
	Factor   float64
}

// SlotInfo is one Meal Slot occurrence (a Meal Slot on a date) with its resolved Attendance.
type SlotInfo struct {
	Key        Key
	Name       string
	Time       string // HH:MM, household time
	Attendance []Attendee
}

// HistoryEntry is a fresh cook (planned or Cooked) before the first slot of the snapshot, for Cool-down and recency.
type HistoryEntry struct {
	RecipeID int64
	Date     string
}

// Snapshot is the stored state one planning run reads. Everything is already in
// Base Units and household terms; BuildInput only maps it to the planner's types.
type Snapshot struct {
	Now      time.Time
	Zone     *time.Location
	Seed     int64
	Settings Settings

	// Slots are all occurrences to consider: the Planning Horizon plus the dates
	// of unresolved past meals. Empty slots in the past are dropped by BuildInput.
	Slots []SlotInfo
	// Meals are the existing Planned Meals (any state).
	Meals []Meal
	// Clear lists slots whose unpinned, uncooked Planned Meal must be treated as
	// empty: the downstream of a Swap, set or Cooked confirmation (spec §7.3, §8).
	Clear []Key

	SlotRules    []SlotRule
	VarietyRules []VarietyRule

	Recipes     []planner.Recipe // all, including archived; Tags are names, normalised by BuildInput
	Preferences map[int64]planner.Preferences
	Lots        []planner.StockLot
	ShelfLife   map[planner.IngredientID]int
	Packs       map[planner.IngredientID]planner.Pack
	Leftovers   []Leftover
	History     []HistoryEntry
}

// Changes are the row changes that bring the stored plan in line with a planner.Result.
type Changes struct {
	// Upserts are the new or changed Planned Meals (State planned, not Pinned), by Key.
	Upserts []Meal
	// Deletes are unpinned Planned Meals the planner dropped and did not replace.
	Deletes []Key
	// Unfilled are the "Couldn't plan" reasons to store.
	Unfilled []Unfilled
	// ClearUnfilled are slots that have no reason any more (everything considered and not Unfilled).
	ClearUnfilled []Key
}

// InvalidateTopic is the events topic modules publish on to say "the plan may be stale". Data is {"reason": Reason}.
// The Runner also maps the existing topics of other modules (recipes, household, stock) through ReasonForEvent, so
// those modules need no change; new modules call Invalidate.
const InvalidateTopic = "plan.invalidate"

// Publisher is the part of *events.Bus that planning publishes through.
type Publisher interface {
	Publish(topic string, data any)
}
