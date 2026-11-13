package runner

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

// MealSlotDef is a Meal Slot as defined per weekday (1 Monday .. 7 Sunday).
type MealSlotDef struct {
	ID      int64
	Weekday int
	Name    string
	Time    string // HH:MM
	// Courses are the Course ids the slot serves, in its order, and MainCourse the id of its main Course (crs-c2).
	Courses    []int64
	MainCourse int64
}

// SlotDateDef is what is known about a Meal Slot on one date beyond its usual set-up (ADR 0014): resolved, so the
// runner holds no household rule. Time is the effective time (household.EffectiveTime); NotServed is
// household.IsNotServed (marked by hand, or an emptied date); Guests is 0 to 20.
type SlotDateDef struct {
	Time      string // HH:MM, effective
	UsualTime string // HH:MM
	NotServed bool
	Guests    int
}

// Sources are the reads the runner needs from the household, recipes and products
// features. sources.go (Developer) implements it over household/store, recipe/store,
// product/store and units; the runner tests use a fake.
type Sources interface {
	// Settings returns the Planning Horizon, Cool-down, Use-by days and Planner Style, and the time zone.
	Settings(ctx context.Context) (plan.Settings, *time.Location, error)
	MealSlots(ctx context.Context) ([]MealSlotDef, error)
	// Attendance is the Attendance of the slot on that date (a per-date override when there is one) with the
	// effective Portion Factors resolved.
	Attendance(ctx context.Context, mealSlotID int64, date string) ([]plan.Attendee, error)
	// SlotCourses are the Courses the Meal Slot serves on that date in the slot's order, each with its Course
	// Attendance (household.CourseAttendance with the effective Portion Factors). Empty: the slot has no Courses
	// and plans as one cell (pure planning only). (ADR 0008, docs/dev/design/crs-b.md §6.)
	SlotCourses(ctx context.Context, mealSlotID int64, date string) ([]plan.SlotCourse, error)
	// SlotDate is the Meal Slot on that date: its effective time, Not served and Guests (ADR 0014). A slot with no
	// per-date row answers its usual time, served, no Guests. household.ErrNotFound-like errors are the adapter's.
	SlotDate(ctx context.Context, mealSlotID int64, date string) (SlotDateDef, error)
	// Recipes returns every Recipe, archived ones included, with Needs per Batch in Base Units and the Advance Steps.
	Recipes(ctx context.Context) ([]planner.Recipe, error)
	// Preferences returns each Member's Favourites, Dislikes and Exclusions.
	Preferences(ctx context.Context) (map[int64]planner.Preferences, error)
	// Packs returns the pack size of the Product last bought for each Ingredient (absent = none bought).
	Packs(ctx context.Context, ingredients []planner.IngredientID) (map[planner.IngredientID]planner.Pack, error)
}

// Need is the quantity of an Ingredient (Base Units) a Cooked meal deducts.
type Need struct {
	IngredientID int64
	Quantity     float64
}

// Warning is a Stock shortfall found while deducting ("Stock shows only 300 g chicken thighs, the recipe uses 800 g").
type Warning struct {
	IngredientID int64
	Name         string
	BaseUnit     string
	Have         float64
	Need         float64
	Shortfall    float64
	Message      string
}

// Deduction is the result of deducting inside the caller's transaction. Handle is
// opaque: it is given back to PublishDeduction after the commit.
type Deduction struct {
	Warnings []Warning
	Handle   any
}

// LeftoverWaste is a Leftover discarded past its Use-by, recorded as waste.
type LeftoverWaste struct {
	LeftoverID int64
	RecipeID   int64
	Portions   float64
	On         string // household date
}

// StockPort is what the runner needs from Stock (T10). The real adapter wraps
// stock/service: Lots reads the projection (inside the write's transaction when the
// context carries one), DeductCookedTx -> DeductForCookedTx, PublishDeduction ->
// PublishDeduction, RecordLeftoverWaste -> RecordWaste with reason leftover_discarded
// (ingredient nil, quantity = portions); the adapter also implements TxWaster.
type StockPort interface {
	// Lots are the current Stock Lots in consumption order and the Shelf Life days per Ingredient.
	Lots(ctx context.Context) ([]planner.StockLot, map[planner.IngredientID]int, error)
	// DeductCookedTx deducts inside tx (never begins, commits or publishes). Short Stock is a warning, not an error.
	DeductCookedTx(ctx context.Context, tx *sql.Tx, needs []Need) (Deduction, error)
	// PublishDeduction is called once, after the caller's commit.
	PublishDeduction(d Deduction)
	// RecordLeftoverWaste is called after the commit that discarded the Leftover.
	RecordLeftoverWaste(ctx context.Context, w LeftoverWaste) error
}

// Pick is the quantity (Base Units) the User says a Cooked meal took from one Stock Lot (Used from, ADR 0011).
type Pick struct {
	LotID    int64
	Quantity float64
}

// UsedFrom is the picks for one Ingredient of one Planned Meal.
type UsedFrom struct {
	IngredientID int64
	Picks        []Pick
}

// CookedMeal is one Planned Meal being Cooked: its Needs and its Used from picks (nil: the default order).
type CookedMeal struct {
	Needs    []Need
	UsedFrom []UsedFrom
}

// ErrUsedFromInvalid is a Used from pick the Stock refuses (an unknown or another Ingredient's Lot, an Ingredient not in
// the meal, a quantity that is not positive, more than a Lot holds) or picks on a meal served from a Leftover. Nothing
// is written; the httpapi maps it to 422 used_from_invalid.
var ErrUsedFromInvalid = errors.New("used from invalid")

// PickedDeducter is optionally implemented by a StockPort: the picked deduction for one or several Cooked meals (one
// CookedMeal per Course, in Course order), inside tx. Without it a Cooked with picks is refused as a wiring error.
type PickedDeducter interface {
	DeductCookedPickedTx(ctx context.Context, tx *sql.Tx, meals []CookedMeal) (Deduction, error)
}

// CookPreviewer is optionally implemented by a StockPort: the Lots of each need, for the Mark as Cooked sheet.
type CookPreviewer interface {
	PreviewCooked(ctx context.Context, needs []Need) ([]NeedPreview, error)
}

// PreviewLot is a Stock Lot on the Mark as Cooked sheet. GoesOff is "" when the Lot does not go off; StoragePlaceName
// is "" when the Lot is not sorted.
type PreviewLot struct {
	ID               int64
	Quantity         float64
	Purchased        string
	GoesOff          string
	StoragePlaceName string
}

// NeedPreview is one need of the sheet with the Lots it can take from, in default (Deduction) order.
type NeedPreview struct {
	IngredientID int64
	BaseUnit     string
	Lots         []PreviewLot
}

// TxWaster is optionally implemented by a StockPort: the waste of a discarded Leftover is then recorded inside the
// discard transaction (so a failure keeps the Leftover available). Without it the waste is recorded after the commit.
type TxWaster interface {
	RecordLeftoverWasteTx(ctx context.Context, tx *sql.Tx, w LeftoverWaste) error
}
