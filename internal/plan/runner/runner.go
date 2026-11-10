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
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/planner"
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
type Runner struct {
	d Deps

	writeMu sync.Mutex // serialises every write (runs and actions)

	stateMu sync.Mutex // guards the invalidation state below
	pending bool
	running bool
	reason  plan.Reason
	wake    chan struct{}
}

// New returns a Runner.
func New(d Deps) *Runner {
	if d.Logger == nil {
		d.Logger = slog.Default()
	}
	return &Runner{d: d, wake: make(chan struct{}, 1)}
}

// runOpts selects what one planning run clears before it plans.
type runOpts struct {
	clearAll   bool      // Slot or Variety Rules changed: unpinned meals are treated as empty
	after      *plan.Key // Swap, set, confirm: unpinned meals after this slot are treated as empty
	regenerate bool      // bump the generation and redo every unpinned meal (planner.Regenerate)
	skipPlan   bool      // the write does not plan (DiscardExpired)
	// afterPlan runs inside the transaction once the replan is written (not after the commit).
	afterPlan func(ctx context.Context, st *store.Store) error
}

// txKey carries the transaction of a write through the context, so the Stock
// adapter can read the projection inside it.
type txKey struct{}

func withTx(ctx context.Context, tx *sql.Tx) context.Context {
	return context.WithValue(ctx, txKey{}, tx)
}

func txFrom(ctx context.Context) *sql.Tx {
	tx, _ := ctx.Value(txKey{}).(*sql.Tx)
	return tx
}

// write runs mutate (if any) and one planning run in ONE transaction, then, after
// the commit, runs the mutation's after func and publishes "plan". Writes are
// serialised by writeMu. A failure anywhere rolls everything back and publishes nothing.
func (r *Runner) write(ctx context.Context, reason plan.Reason, o runOpts,
	mutate func(tx *sql.Tx, st *store.Store) (after func(), err error)) (Summary, error) {
	r.writeMu.Lock()
	defer r.writeMu.Unlock()
	var sum Summary
	var after func()
	err := r.d.Store.InTx(ctx, func(tx *sql.Tx, st *store.Store) error {
		var err error
		if mutate != nil {
			if after, err = mutate(tx, st); err != nil {
				return err
			}
		}
		if !o.skipPlan {
			if sum, err = r.planIn(withTx(ctx, tx), st, reason, o); err != nil {
				return err
			}
			if o.afterPlan != nil {
				if err := o.afterPlan(withTx(ctx, tx), st); err != nil {
					return err
				}
			}
		}
		return r.pruneStaleChips(ctx, st)
	})
	if err != nil {
		return Summary{}, err
	}
	if after != nil {
		after()
	}
	if r.d.Events != nil {
		r.d.Events.Publish("plan", map[string]any{"changed": "plan", "reason": reason})
	}
	return sum, nil
}

// pruneStaleChips drops the "leftovers for <day>" chips that no longer name a meal served from their source (B8) and
// saves the changed meals. It runs at the end of every write, inside its transaction.
func (r *Runner) pruneStaleChips(ctx context.Context, st *store.Store) error {
	meals, err := st.Meals(ctx, "", "")
	if err != nil {
		return err
	}
	for _, m := range plan.PruneStaleLeftoverChips(meals) {
		if err := st.SetWhy(ctx, m.Key, m.Why); err != nil {
			return err
		}
	}
	return nil
}

// planIn runs the planner over the snapshot and writes its output with st (bound to the write's transaction).
func (r *Runner) planIn(ctx context.Context, st *store.Store, reason plan.Reason, o runOpts) (Summary, error) {
	if o.regenerate {
		if _, err := st.BumpGeneration(ctx); err != nil {
			return Summary{}, err
		}
	}
	snap, err := r.snapshot(ctx, st, o)
	if err != nil {
		return Summary{}, err
	}
	in, err := plan.BuildInput(snap)
	if err != nil {
		return Summary{}, err
	}
	var res planner.Result
	if o.regenerate {
		res, err = planner.Regenerate(in)
	} else {
		res, err = planner.Plan(in)
	}
	if err != nil {
		return Summary{}, err
	}
	if err := st.Apply(ctx, plan.Reconcile(snap, res)); err != nil {
		return Summary{}, err
	}
	return Summary{Reason: reason, Placed: len(res.Placements), Kept: len(res.Kept), Unfilled: len(res.Unfilled)}, nil
}

// Plan fills the Planning Horizon: empty slots are filled, unpinned Planned Meals
// that are still valid are kept, invalid ones (archived Recipe, new Exclusion,
// too few portions, vanished Leftover source) are replanned. Pinned, Cooked and
// skipped meals never change. Empty slots whose time has passed are not planned.
// With reason plan.ReasonRulesChanged the unpinned Planned meals are first cleared
// (a Slot or Variety Rule changes what is valid), still with the same generation
// and seed, so only the slots a rule affects (and what depends on them) change.
// One transaction; publishes topic "plan" afterwards.
func (r *Runner) Plan(ctx context.Context, reason plan.Reason) (Summary, error) {
	return r.write(ctx, reason, runOpts{clearAll: reason == plan.ReasonRulesChanged}, nil)
}

// Regenerate bumps the plan generation (a new seed, so a genuinely different plan)
// and redoes every unpinned, uncooked Planned Meal in the horizon (spec §7.1).
func (r *Runner) Regenerate(ctx context.Context) (Summary, error) {
	return r.write(ctx, plan.ReasonRegenerate, runOpts{regenerate: true}, nil)
}

// ChangeRules applies a Slot Rule or Variety Rule change and replans, in ONE
// transaction: when the replan fails the change is rolled back and nothing is
// published. change runs against the transaction's store. Publishes topic "plan"
// after the commit, like every write.
func (r *Runner) ChangeRules(ctx context.Context, change func(st *store.Store) error) error {
	_, err := r.write(ctx, plan.ReasonRulesChanged, runOpts{clearAll: true}, func(_ *sql.Tx, st *store.Store) (func(), error) {
		return nil, change(st)
	})
	return err
}

// DiscardExpired discards the Leftovers whose Use-by is before today (household
// date) and records each as waste (reason leftover_discarded). Pinned dependants
// of a discarded Leftover are unpinned so the next run can replan them. Waste is
// recorded in the same transaction when the Stock adapter supports it (TxWaster),
// and then the runner publishes the `stock` waste change after the commit;
// otherwise the waste is recorded after the commit by the adapter, and a failure
// there is logged and the Leftover stays discarded. It returns how many were discarded.
func (r *Runner) DiscardExpired(ctx context.Context) (int, error) {
	var discarded []plan.Leftover
	var on string
	_, err := r.write(ctx, "", runOpts{skipPlan: true}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		info, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		on = info.today
		ls, err := st.Leftovers(ctx)
		if err != nil {
			return nil, err
		}
		discarded = plan.ExpiredLeftovers(ls, on)
		var deferred []LeftoverWaste
		wastedInTx := false
		txWaster, inTx := r.d.Stock.(TxWaster)
		for _, l := range discarded {
			if err := st.DiscardLeftover(ctx, l.ID, on); err != nil {
				return nil, err
			}
			if err := r.unpinMisfits(ctx, st, l.From, 0, info); err != nil {
				return nil, err
			}
			w := LeftoverWaste{LeftoverID: l.ID, RecipeID: int64(l.RecipeID), Portions: l.Portions, On: on}
			if inTx {
				if err := txWaster.RecordLeftoverWasteTx(ctx, tx, w); err != nil {
					return nil, err
				}
				wastedInTx = true
				continue
			}
			deferred = append(deferred, w)
		}
		return func() {
			// The in-transaction waste publishes nothing itself (RecordWasteTx), so the runner announces it here.
			if wastedInTx && r.d.Events != nil {
				r.d.Events.Publish("stock", map[string]any{"changed": "waste"})
			}
			for _, w := range deferred {
				if err := r.d.Stock.RecordLeftoverWaste(ctx, w); err != nil {
					r.d.Logger.Error("recording Leftover waste failed", "leftover", w.LeftoverID, "err", err)
				}
			}
		}, nil
	})
	return len(discarded), err
}

// Nightly is the 03:00 job: DiscardExpired, then Plan(ReasonNightly). day is the
// household date the scheduler is running for. Register it with
// scheduler.Daily("plan.nightly", "03:00", runner.Nightly).
func (r *Runner) Nightly(ctx context.Context, day string) error {
	_, discardErr := r.DiscardExpired(ctx)
	if _, err := r.Plan(ctx, plan.ReasonNightly); err != nil {
		return errors.Join(discardErr, err)
	}
	if discardErr != nil {
		r.d.Logger.Error("nightly: discarding expired Leftovers failed", "day", day, "err", discardErr)
	}
	return nil
}

// Invalidate asks for a Plan run soon. It never blocks and never runs inline:
// calls made while a run is pending or running coalesce into one more run.
func (r *Runner) Invalidate(reason plan.Reason) {
	r.stateMu.Lock()
	r.pending = true
	r.reason = reason
	r.stateMu.Unlock()
	select {
	case r.wake <- struct{}{}:
	default:
	}
}

// Start runs the worker that turns invalidations into Plan runs, until ctx is done.
func (r *Runner) Start(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.wake:
		}
		r.stateMu.Lock()
		if !r.pending {
			r.stateMu.Unlock()
			continue
		}
		reason := r.reason
		r.pending, r.running = false, true
		r.stateMu.Unlock()

		if _, err := r.Plan(ctx, reason); err != nil && ctx.Err() == nil {
			r.d.Logger.Error("planning run failed", "reason", reason, "err", err)
		}

		r.stateMu.Lock()
		r.running = false
		r.stateMu.Unlock()
	}
}

// Subscribe feeds the worker from the bus: every event is passed to
// plan.ReasonForEvent and, when it invalidates the plan, to Invalidate. It
// returns when ctx is done.
func (r *Runner) Subscribe(ctx context.Context, bus *events.Bus) {
	ch, cancel := bus.Subscribe()
	defer cancel()
	for {
		select {
		case <-ctx.Done():
			return
		case ev := <-ch:
			if reason, ok := plan.ReasonForEvent(ev.Topic, ev.Data); ok {
				r.Invalidate(reason)
			}
		}
	}
}

// Updating reports whether an invalidation is pending or a run is in progress (GET /api/plan shows it as "updating").
func (r *Runner) Updating() bool {
	r.stateMu.Lock()
	defer r.stateMu.Unlock()
	return r.pending || r.running
}

// WaitIdle blocks until no invalidation is pending and no run is in progress, or ctx ends (tests, BDD).
func (r *Runner) WaitIdle(ctx context.Context) error {
	for r.Updating() {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Millisecond):
		}
	}
	return nil
}
