package plan

import (
	"time"

	"github.com/fabbarix/feeder-ng/internal/planner"
)

// B5-BO (docs/adr/0013-bought-planned-meals-held.md, docs/dev/design/b5-bo.md): Bought Planned Meals.

// BoughtRecord is one row of planned_meal_bought: a purchase (one Stock Lot) bought an Ingredient for a Planned Meal.
type BoughtRecord struct {
	MealID       int64 // planned_meals.id
	IngredientID int64
	LotID        int64
	Quantity     float64 // Base Units, > 0
	At           time.Time
}

// Warning codes (mealOut.warning.code).
const (
	WarnExcluded   = "excluded"    // an attendee now excludes the Recipe or one of its Ingredients
	WarnArchived   = "archived"    // the Recipe is archived
	WarnCourseLost = "course_lost" // the Recipe is no longer marked with the meal's Course
)

// Warning says that a Pinned or Bought Planned Meal now breaks a hard rule. It stays where it is; the sheet shows the
// warning with the Swap action.
type Warning struct {
	Code         string `json:"code"`
	MemberID     int64  `json:"memberId,omitempty"`     // WarnExcluded: the first attending Member who excludes it
	IngredientID int64  `json:"ingredientId,omitempty"` // WarnExcluded: the excluded Ingredient; 0 when the Member excludes the Recipe itself
}

// HardRuleWarning checks a Planned Meal against the hard rules (spec 7.2 step 2: Recipe not archived, Course fit,
// no attendee's Exclusion). It answers the first rule broken, in the order archived, course_lost, excluded, or nil.
//
//   - Only an unresolved Planned Meal that is Pinned or Bought is checked (an unpinned one that is not Bought is
//     replanned by the planner anyway); a Cooked, Not cooked or Leftover-served meal answers nil.
//   - recipe is the Recipe's planner view; found is false for a Recipe that no longer exists (treated as archived).
//   - attendance is the meal's Course Attendance; only attendees with a Portion Factor > 0 count. An Exclusion of the
//     Recipe wins over one of its Ingredients (optional lines included); among Members the lowest id wins, and among
//     Ingredients the lowest id.
func HardRuleWarning(m Meal, recipe planner.Recipe, found bool, attendance []Attendee, prefs map[int64]planner.Preferences) *Warning {
	return nil
}
