package service

import (
	"context"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/cook/store"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/sun"
)

// Event topics.
const (
	TopicTimers = "timers" // TimerEvent
	TopicCook   = "cook"   // MarksEvent
)

// TimerEvent is the data of a `timers` event. Kind is started, paused,
// resumed, cancelled or finished.
type TimerEvent struct {
	Changed string `json:"changed"` // always "timer"
	Kind    string `json:"kind"`
	TimerID int64  `json:"timerId"`
	Scope   string `json:"scope"`
	Label   string `json:"label"`
}

// MarksEvent is the data of a `cook` event.
type MarksEvent struct {
	Changed string `json:"changed"` // always "marks"
	Scope   string `json:"scope"`
}

// Config wires a Service.
type Config struct {
	Store     *store.Store
	Clock     clock.Clock
	Bus       *events.Bus
	Recipes   Recipes
	Meals     Meals
	Waste     Waste
	Household Household
}

// Service is Cook Mode and the kitchen board.
type Service struct{ cfg Config }

// New returns a Service.
func New(cfg Config) *Service { return &Service{cfg: cfg} }

// CookView is a cook.View with its meal and the scope's timers.
type CookView struct {
	cook.View
	Meal   *MealInfo // nil for a Recipe scope
	Timers []cook.Timer
	Now    time.Time
}

// MealView is Cook Mode for a Planned Meal (ErrNotFound; ErrNotCookable unless state is planned).
func (s *Service) MealView(ctx context.Context, date string, mealSlotID int64) (CookView, error) {
	panic("TODO")
}

// RecipeView is Cook Mode for a Recipe with a chosen Batch count (ErrNotFound;
// ErrInvalid when batches is not a finite number > 0).
func (s *Service) RecipeView(ctx context.Context, recipeID int64, batches float64) (CookView, error) {
	panic("TODO")
}

// Mark is the result of SetMark.
type Mark struct {
	Scope  cook.Scope
	Step   int
	Done   bool
	DoneAt *time.Time
}

// SetMark marks or unmarks an Advance Step of a scope. cook.ErrInvalidScope for
// a bad scope, ErrNotFound for an unknown Recipe or Planned Meal, ErrNotAdvanceStep
// when the Step index is out of range or not an Advance Step. Publishes a
// `cook` event when something changed.
func (s *Service) SetMark(ctx context.Context, scope cook.Scope, step int, done bool) (Mark, error) {
	panic("TODO")
}

// StartInput describes a timer to start. With Step set, Scope is required, the
// Step must be a Passive Step of the scope's Recipe (ErrNotPassiveStep) and an
// empty Label / zero DurationSeconds default from the Step (cook.TimerLabel,
// minutes x 60). Without a Step, Label and DurationSeconds are required.
type StartInput struct {
	Scope           cook.Scope
	Step            *int
	Label           string
	DurationSeconds int
}

// StartTimer starts a timer and publishes `started`. For a (scope, Step) that
// already has a timer it returns that timer and created=false, publishing nothing.
func (s *Service) StartTimer(ctx context.Context, in StartInput) (t cook.Timer, created bool, err error) {
	panic("TODO")
}

// Pause pauses a running timer (ErrNotFound, ErrNotRunning) and publishes `paused`.
func (s *Service) Pause(ctx context.Context, id int64) (cook.Timer, error) { panic("TODO") }

// Resume resumes a paused timer (ErrNotFound, ErrNotPaused) and publishes `resumed`.
func (s *Service) Resume(ctx context.Context, id int64) (cook.Timer, error) { panic("TODO") }

// Cancel deletes a timer, finished or not (ErrNotFound), and publishes `cancelled`.
func (s *Service) Cancel(ctx context.Context, id int64) error { panic("TODO") }

// Timers settles due timers (publishing `finished` once each) and lists the
// scope's timers ("" = all): running by soonest end, then paused, then finished.
func (s *Service) Timers(ctx context.Context, scope cook.Scope) (time.Time, []cook.Timer, error) {
	panic("TODO")
}

// Sweep settles every due running timer, publishes `finished` for each and
// purges marks and timers older than 2 days. It returns the timers that finished.
func (s *Service) Sweep(ctx context.Context) ([]cook.Timer, error) { panic("TODO") }

// Board is what GET /api/board returns.
type Board struct {
	Now         time.Time
	Today       string // household date
	Phase       sun.Phase
	ThemeReason string // "", "no_location" or "city_only"
	StreakDays  int
	NextAdvance *cook.AdvanceDue
}

// Board computes the dark/light phase, the zero-waste streak and the next
// Advance Step to do (over Planned Meals from today on).
func (s *Service) Board(ctx context.Context) (Board, error) { panic("TODO") }

// FinishedEvent is a timer that has just finished.
type FinishedEvent struct {
	TimerID int64
	Scope   string
	Label   string
}

// SubscribeFinished yields one FinishedEvent per `timers` event of kind finished
// (for the push-notification team). cancel stops it and closes the channel.
func SubscribeFinished(bus *events.Bus) (<-chan FinishedEvent, func()) { panic("TODO") }
