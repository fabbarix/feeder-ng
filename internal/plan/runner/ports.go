package runner

import (
	"context"
	"database/sql"
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

// TxWaster is optionally implemented by a StockPort: the waste of a discarded Leftover is then recorded inside the
// discard transaction (so a failure keeps the Leftover available). Without it the waste is recorded after the commit.
type TxWaster interface {
	RecordLeftoverWasteTx(ctx context.Context, tx *sql.Tx, w LeftoverWaste) error
}
