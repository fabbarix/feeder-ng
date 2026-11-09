// Package runner adapts the stored household state into a planner.Input, runs the
// planner and persists the output, transactionally (spec §7, §8). It owns the
// triggers (nightly job, invalidation hook, on-demand Regenerate) and the User
// actions on the plan (set, confirm, unpin, Swap, Mark as Cooked, Not cooked).
//
// Everything it reads from other features comes through the small interfaces in
// ports.go, so the runner is unit-tested with fakes; sources.go adapts the real
// household, recipe, product and stock services to them.
package runner

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
)

// Errors returned by the actions; the HTTP layer maps them.
var (
	ErrNotFound        = errors.New("planning: no Planned Meal there")
	ErrUnknownSlot     = errors.New("planning: no such Meal Slot on that date")
	ErrInPast          = errors.New("planning: that day is already over")
	ErrAlreadyResolved = errors.New("planning: the Planned Meal is already Cooked or skipped")
	ErrNotSwappable    = errors.New("planning: a Cooked or skipped Planned Meal cannot be swapped")
	ErrUnknownRecipe   = errors.New("planning: unknown Recipe")
	ErrArchivedRecipe  = errors.New("planning: the Recipe is archived")
	ErrInvalidBatches  = errors.New("planning: Batches must be greater than zero")
	errNotImplemented  = errors.New("runner: not implemented")
)

// Deps are the collaborators of a Runner.
type Deps struct {
	DB     *sql.DB
	Clock  clock.Clock
	Store  *store.Store
	Source Sources
	Stock  StockPort
	Events plan.Publisher // receives topic "plan" {"changed":"plan","reason":...}
	Logger *slog.Logger
}

// Summary describes one planning run.
type Summary struct {
	Reason    plan.Reason
	Placed    int // slots the planner filled this run
	Kept      int // unpinned meals it left alone
	Unfilled  int // slots it could not fill
	Discarded int // Leftovers past Use-by discarded first (Nightly only)
}

// Runner plans and acts on the plan. Safe for concurrent use: runs and actions
// are serialised, because each reads then rewrites the whole horizon.
type Runner struct{ d Deps }

// New returns a Runner.
func New(d Deps) *Runner { return &Runner{d: d} }

// Plan fills the Planning Horizon: empty slots are filled, unpinned Planned Meals
// that are still valid are kept, invalid ones (archived Recipe, new Exclusion,
// too few portions, vanished Leftover source) are replanned. Pinned, Cooked and
// skipped meals never change. Empty slots whose time has passed are not planned.
// With reason plan.ReasonRulesChanged the unpinned Planned meals are first cleared
// (a Slot or Variety Rule changes what is valid), still with the same generation
// and seed, so only the slots a rule affects (and what depends on them) change.
// One transaction; publishes topic "plan" afterwards.
func (r *Runner) Plan(ctx context.Context, reason plan.Reason) (Summary, error) {
	return Summary{}, errNotImplemented
}

// Regenerate bumps the plan generation (a new seed, so a genuinely different plan)
// and redoes every unpinned, uncooked Planned Meal in the horizon (spec §7.1).
func (r *Runner) Regenerate(ctx context.Context) (Summary, error) {
	return Summary{}, errNotImplemented
}

// DiscardExpired discards the Leftovers whose Use-by is before today (household
// date) and records each as waste (reason leftover_discarded) once, after the
// database change is committed. Pinned dependants of a discarded Leftover are
// unpinned so the next run can replan them. It returns how many were discarded.
func (r *Runner) DiscardExpired(ctx context.Context) (int, error) { return 0, errNotImplemented }

// Nightly is the 03:00 job: DiscardExpired, then Plan(ReasonNightly). day is the
// household date the scheduler is running for. Register it with
// scheduler.Daily("plan.nightly", "03:00", runner.Nightly).
func (r *Runner) Nightly(ctx context.Context, day string) error { return errNotImplemented }

// Invalidate asks for a Plan run soon. It never blocks and never runs inline:
// calls made while a run is pending or running coalesce into one more run.
func (r *Runner) Invalidate(reason plan.Reason) {}

// Start runs the worker that turns invalidations into Plan runs, until ctx is done.
func (r *Runner) Start(ctx context.Context) {}

// Subscribe feeds the worker from the bus: every event is passed to
// plan.ReasonForEvent and, when it invalidates the plan, to Invalidate. It
// returns when ctx is done.
func (r *Runner) Subscribe(ctx context.Context, bus *events.Bus) {}

// Updating reports whether an invalidation is pending or a run is in progress (GET /api/plan shows it as "updating").
func (r *Runner) Updating() bool { return false }

// WaitIdle blocks until no invalidation is pending and no run is in progress, or ctx ends (tests, BDD).
func (r *Runner) WaitIdle(ctx context.Context) error { return errNotImplemented }
