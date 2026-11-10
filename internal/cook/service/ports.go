// Package service orchestrates Cook Mode: the cook store, the pure cook rules,
// the events bus and small ports onto Recipes, Planned Meals, Stock waste and
// the household settings (so it is unit-tested with fakes).
package service

import (
	"context"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/stock"
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

// MealInfo is a Planned Meal as Cook Mode needs it.
type MealInfo struct {
	Date       string
	MealSlotID int64
	SlotName   string
	RecipeID   int64
	Batches    float64
	State      string // planned | cooked | skipped
	At         time.Time
}

// Meals reads Planned Meals (T11's tables, behind an adapter).
type Meals interface {
	// Meal returns one Planned Meal; ErrNotFound when the slot has none.
	Meal(ctx context.Context, date string, mealSlotID int64) (MealInfo, error)
	// Upcoming lists the Planned Meals in state planned from date (inclusive) on.
	Upcoming(ctx context.Context, fromDate string) ([]MealInfo, error)
}

// Waste gives the two dates the zero-waste streak needs (stock.None when unknown).
type Waste interface {
	LastWaste(ctx context.Context) (stock.Date, error)
	FirstActivity(ctx context.Context) (stock.Date, error)
}

// Household gives the time zone and Location.
type Household interface {
	Zone(ctx context.Context) (*time.Location, error)
	// Coords returns the Location's coordinates, or nil. cityOnly reports a
	// Location given as a city name only (no geocoding offline).
	Coords(ctx context.Context) (c *sun.Coords, cityOnly bool, err error)
}
