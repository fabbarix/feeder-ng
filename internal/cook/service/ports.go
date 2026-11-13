// Package service orchestrates Cook Mode: the cook store, the pure cook rules,
// the events bus and small ports onto Recipes, Planned Meals, Stock waste and
// the household settings (so it is unit-tested with fakes).
package service

import (
	"context"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/sun"
)

// Errors the HTTP layer maps to status codes.
var (
	ErrNotFound       = errors.New("not found")                            // 404 not_found
	ErrNotCookable    = errors.New("the Planned Meal is already resolved") // 409 not_cookable
	ErrNotRunning     = errors.New("timer is not running")                 // 409 not_running
	ErrNotPaused      = errors.New("timer is not paused")                  // 409 not_paused
	ErrNotAdvanceStep = errors.New("that Step is not an Advance Step")     // 422 not_advance_step
	ErrNotPassiveStep = errors.New("that Step is not a Passive Step")      // 422 not_passive_step
	ErrInvalid        = errors.New("invalid")                              // 422 validation_failed (wrapped with a message)
)

// Recipes gives the Steps of a Recipe. Unknown id -> ErrNotFound.
type Recipes interface {
	Steps(ctx context.Context, recipeID int64) (cook.RecipeSteps, error)
}

// MealRecipes is the optional part of Recipes that gives the Steps of a Planned Meal's Recipe with the meal's Batches,
// with the Stock on hand covering its Base recipes (BR-G). The service asks for them wherever it holds a Planned Meal,
// and for Steps everywhere else (a Recipe opened on its own assumes everything is made).
type MealRecipes interface {
	MealSteps(ctx context.Context, recipeID int64, batches float64) (cook.RecipeSteps, error)
}

// MealInfo is a Planned Meal as Cook Mode needs it.
type MealInfo struct {
	Date       string
	MealSlotID int64
	SlotName   string
	RecipeID   int64
	Batches    float64 // 0 when served from a Leftover
	State      string  // planned | cooked | skipped
	At         time.Time
	// The Course the Planned Meal fills (crs-c2): its real id, its name, whether it is the main Course (its scope
	// keeps the two-part form until C3), its place in the slot's Course order and the portions the slot needed.
	CourseID   int64
	CourseName string
	Main       bool
	Position   int
	Portions   float64
}

// Meals reads Planned Meals (T11's tables, behind an adapter).
type Meals interface {
	// Meal returns the Planned Meal of a Course on a date and Meal Slot; courseID 0 is the main Course. ErrNotFound
	// when there is none.
	Meal(ctx context.Context, date string, mealSlotID, courseID int64) (MealInfo, error)
	// Slot lists the Planned Meals of a Meal Slot on a date in the slot's Course order (empty when there are none).
	Slot(ctx context.Context, date string, mealSlotID int64) ([]MealInfo, error)
	// Upcoming lists the Planned Meals in state planned from date (inclusive) on, in slot order.
	Upcoming(ctx context.Context, fromDate string) ([]MealInfo, error)
}

// Waste gives what the zero-waste streak needs (Today is left for the caller to set).
type Waste interface {
	StreakInput(ctx context.Context) (cook.StreakInput, error)
}

// Household gives the time zone and Location.
type Household interface {
	Zone(ctx context.Context) (*time.Location, error)
	// Coords returns the Location's coordinates, or nil. cityOnly reports a
	// Location given as a city name only (no geocoding offline).
	Coords(ctx context.Context) (c *sun.Coords, cityOnly bool, err error)
}
