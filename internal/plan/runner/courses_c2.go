package runner

import (
	"context"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/plan"
)

// Team C2 (docs/dev/design/crs-c2.md): the plan, cook, Today and board API per Course. This file holds the
// stubs for the runner side; the Developer replaces the bodies and changes View, ToConfirm and CouldntPlan
// to the per-Course shapes of design note §3.

// ErrNotImplemented is what the C2 stubs return until the Developer fills them in.
var ErrNotImplemented = errors.New("planning: not implemented yet (crs-c2)")

// Errors of the Course routes; the HTTP layer maps them (design note §2).
var (
	ErrCourseNotInSlot   = errors.New("planning: the Meal Slot does not serve that Course")
	ErrRecipeNotInCourse = errors.New("planning: the Recipe is not marked with that Course")
	ErrRecipeInSlot      = errors.New("planning: the Recipe is already in another Course of that slot and date")
)

// CoveredBy names the main Course's Whole meal that covers a Course (spec §16 `coveredBy`).
type CoveredBy struct {
	CourseID int64
	RecipeID int64
}

// CourseView is one Course row of a slot occurrence. CourseID is always the real Course id: the plan store's
// "0 is the main Course" shim never leaves the runner.
type CourseView struct {
	CourseID        int64
	Name            string
	Main            bool
	Optional        bool
	OptOutMemberIDs []int64 // effective on that date
	Attendance      []plan.Attendee
	Portions        float64
	Meal            *plan.Meal
	Unfilled        *plan.Unfilled
	CoveredBy       *CoveredBy
	Unserved        string // "", "optional" or "no_course_attendance"
	History         bool   // a Course the slot no longer serves, shown for its Cooked or Not cooked meal
}

// MainCourseID is the real id of the main Course (the Course with the main flag).
func (r *Runner) MainCourseID(ctx context.Context) (int64, error) {
	return 0, ErrNotImplemented
}

// NotCookedAll marks every unresolved Course of the slot Not cooked, in one transaction. It returns the meals it
// changed, in the slot's Course order. ErrNotFound when the slot has no Planned Meal, ErrAlreadyResolved when
// none is left unresolved, plan.ErrFutureMeal before the day.
func (r *Runner) NotCookedAll(ctx context.Context, date string, mealSlotID int64) ([]plan.Meal, error) {
	return nil, ErrNotImplemented
}

// CourseLeftover is one entry of CookedAll: the Leftover portions chosen for a Course (nil: the proposal).
type CourseLeftover struct {
	CourseID         int64
	LeftoverPortions *float64
}

// CookedAll marks every unresolved Course of the slot Cooked, all or nothing, in one transaction, with one Stock
// deduction and one `plan` event. Courses not listed use their proposed Leftover. ErrCourseNotInSlot for a
// listed Course the slot does not serve, ErrAlreadyResolved for a listed Course that is resolved or when nothing is
// left, plan.ErrInvalidLeftover (wrapped with the Course) for a bad portion count.
func (r *Runner) CookedAll(ctx context.Context, date string, mealSlotID int64, courses []CourseLeftover) ([]CookedResult, error) {
	return nil, ErrNotImplemented
}
