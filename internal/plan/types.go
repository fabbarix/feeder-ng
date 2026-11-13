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

// Key identifies one Course of one Meal Slot on one date (YYYY-MM-DD, household
// time). CourseID is the real id of the Course, the main Course included (ADR 0008,
// crs-c3); 0 names no Course, and only a pure-planning fixture of a slot without Courses uses it.
type Key struct {
	Date       string
	MealSlotID int64
	CourseID   int64
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
	// Relaxed marks a relaxed pick: a Cool-down or Variety Rule gave way because too few Recipes fit
	// (ADR 0009). Stored in planned_meals.relaxed.
	Relaxed bool
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
	CourseID   int64 // the real id of the Course; 0 names none
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
	Reason          string // planner.UnfilledReason: "no_attendance" | "no_candidates" | "no_course_recipes"
	SlotRuleClaimed bool
	Eliminated      Eliminations
	// Exclusions and MoreExclusions are planner.Unfilled's, ids as int64 (docs/dev/design/crs-brx.md).
	Exclusions     []ExclusionRecord
	MoreExclusions int
}

// ExclusionRecord is planner.ExclusionRecord as stored: IngredientID 0 is a direct Recipe Exclusion.
type ExclusionRecord struct {
	MemberID     int64   `json:"memberId"`
	IngredientID int64   `json:"ingredientId"`
	RecipeIDs    []int64 `json:"recipeIds"`
	RecipeCount  int     `json:"recipeCount"`
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
	// ReasonSlotDateChanged: a Meal Slot on one date was marked Not served or served again, its time changed, or its
	// Guests changed (ADR 0014; household event {"changed":"slotDates"}).
	ReasonSlotDateChanged Reason = "slot_date_changed"
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

// SlotCourse is one Course a Meal Slot serves on a date.
type SlotCourse struct {
	CourseID   int64
	Main       bool
	Optional   bool
	Attendance []Attendee // the effective Course Attendance on that date (household.CourseAttendance)
}

// SlotInfo is one Meal Slot occurrence (a Meal Slot on a date) with its resolved Attendance.
type SlotInfo struct {
	Key  Key
	Name string
	// Time is the EFFECTIVE time, HH:MM in household time: the date's own time when it has one, else the usual time
	// (household.EffectiveTime). Every instant derives from it (the cell's At, the walk order, To confirm).
	Time string
	// UsualTime is the Meal Slot's usual HH:MM; it differs from Time only when the date has its own time.
	UsualTime string
	// Guests is the number of Guests of the Meal Slot on that date (0 to 20): one standard portion of every Course each.
	Guests int
	// NotServed is true when the Meal Slot is Not served on that date: marked by a User, or its date Attendance has no
	// Member and no Guest (household.IsNotServed). BuildInput ignores it once a Course of the slot is Cooked or Not
	// cooked (U2).
	NotServed  bool
	Attendance []Attendee
	// Courses are the slot's Courses in the slot's order (ADR 0008). Attendance above stays the slot's
	// own (for no_attendance and display); each Course's Attendance is the effective Course Attendance
	// on that date (household.CourseAttendance).
	Courses []SlotCourse
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
	// RaiseBatches are fresh Planned Meals, unpinned or Pinned, that keep their Recipe and get more Batches (ADR 0014
	// point 6). Apply writes batches and portions of the stored meal, whatever its Pinned flag; a Cooked or Not cooked
	// meal is never touched.
	RaiseBatches []BatchRaise
	// RemoveUnresolved are Planned Meals of a Not served Meal Slot that go even when Pinned (the User confirmed the list
	// first). Apply deletes them when they are still planned (State planned), Pinned or not; Cooked and Not cooked ones
	// stay as history.
	RemoveUnresolved []Key
}

// BatchRaise is a raised cell: the new Batches and the portions they cover.
type BatchRaise struct {
	Key      Key
	Batches  float64
	Portions float64
}

// InvalidateTopic is the events topic modules publish on to say "the plan may be stale". Data is {"reason": Reason}.
// The Runner also maps the existing topics of other modules (recipes, household, stock) through ReasonForEvent, so
// those modules need no change; new modules call Invalidate.
const InvalidateTopic = "plan.invalidate"

// Publisher is the part of *events.Bus that planning publishes through.
type Publisher interface {
	Publish(topic string, data any)
}
