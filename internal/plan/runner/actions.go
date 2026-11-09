package runner

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

// SlotView is one Meal Slot occurrence in the plan, with its meal or its "couldn't plan" reason.
type SlotView struct {
	Key        plan.Key
	Name       string
	Time       string
	At         time.Time
	Portions   float64 // portions the Attendance needs
	Attendance []plan.Attendee
	Meal       *plan.Meal
	Unfilled   *plan.Unfilled
	// Rules are the Slot Rules of this Meal Slot.
	Rules []plan.SlotRule
}

// PlanView is the plan between two dates.
type PlanView struct {
	Today       string
	HorizonDays int
	Slots       []SlotView // chronological
}

// slotView builds the view of one occurrence (Attendance read from the Sources).
func (r *Runner) slotView(ctx context.Context, in info, def MealSlotDef, key plan.Key) (SlotView, error) {
	at, err := plan.SlotInstant(key.Date, def.Time, in.zone)
	if err != nil {
		return SlotView{}, err
	}
	att, err := r.d.Source.Attendance(ctx, def.ID, key.Date)
	if err != nil {
		return SlotView{}, err
	}
	return SlotView{Key: key, Name: def.Name, Time: def.Time, At: at, Portions: attendancePortions(att), Attendance: att}, nil
}

// View returns every Meal Slot occurrence from..to (inclusive; "" from = today, "" to = last day of the Planning
// Horizon) with its Planned Meal and "couldn't plan" reason. Unresolved earlier days are not added.
func (r *Runner) View(ctx context.Context, from, to string) (PlanView, error) {
	in, err := r.info(ctx)
	if err != nil {
		return PlanView{}, err
	}
	horizon := plan.HorizonDates(in.today, in.settings.HorizonDays)
	if from == "" {
		from = in.today
	}
	if to == "" {
		to = in.today
		if len(horizon) > 0 {
			to = horizon[len(horizon)-1]
		}
	}
	meals, err := r.d.Store.Meals(ctx, from, to)
	if err != nil {
		return PlanView{}, err
	}
	unfilled, err := r.d.Store.Unfilled(ctx, from, to)
	if err != nil {
		return PlanView{}, err
	}
	rules, err := r.d.Store.SlotRules(ctx)
	if err != nil {
		return PlanView{}, err
	}
	byKey := map[plan.Key]plan.Meal{}
	for _, m := range meals {
		byKey[m.Key] = m
	}
	uByKey := map[plan.Key]plan.Unfilled{}
	for _, u := range unfilled {
		uByKey[u.Key] = u
	}
	view := PlanView{Today: in.today, HorizonDays: in.settings.HorizonDays}
	for date := from; date <= to && len(date) == 10; date = nextDay(date) {
		for _, def := range in.defs {
			if def.Weekday != weekdayOf(date) {
				continue
			}
			key := plan.Key{Date: date, MealSlotID: def.ID}
			sv, err := r.slotView(ctx, in, def, key)
			if err != nil {
				return PlanView{}, err
			}
			if m, ok := byKey[key]; ok {
				sv.Meal = &m
			}
			if u, ok := uByKey[key]; ok {
				sv.Unfilled = &u
			}
			for _, rule := range rules {
				if rule.MealSlotID == def.ID {
					sv.Rules = append(sv.Rules, rule)
				}
			}
			view.Slots = append(view.Slots, sv)
		}
	}
	return view, nil
}

// nextDay is the date after a YYYY-MM-DD date ("" when malformed, which ends a walk).
func nextDay(date string) string {
	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		return ""
	}
	return d.AddDate(0, 0, 1).Format("2006-01-02")
}

// ToConfirm returns the Planned Meals still in State planned that are at least plan.ConfirmAfter past their slot time.
func (r *Runner) ToConfirm(ctx context.Context) ([]SlotView, error) {
	in, err := r.info(ctx)
	if err != nil {
		return nil, err
	}
	meals, err := r.d.Store.UnresolvedBefore(ctx, "9999-12-31")
	if err != nil {
		return nil, err
	}
	var timed []plan.Timed
	for _, m := range meals {
		if at, ok := in.instant(m.Key); ok {
			timed = append(timed, plan.Timed{Meal: m, At: at})
		}
	}
	var out []SlotView
	for _, t := range plan.ToConfirm(timed, in.now) {
		def, _ := in.slotDef(t.Meal.Key)
		sv, err := r.slotView(ctx, in, def, t.Meal.Key)
		if err != nil {
			return nil, err
		}
		m := t.Meal
		sv.Meal = &m
		out = append(out, sv)
	}
	return out, nil
}

// CouldntPlan returns the slots in the horizon (not yet past) that stayed empty, with their reasons.
func (r *Runner) CouldntPlan(ctx context.Context) ([]SlotView, error) {
	in, err := r.info(ctx)
	if err != nil {
		return nil, err
	}
	view, err := r.View(ctx, in.today, "")
	if err != nil {
		return nil, err
	}
	var out []SlotView
	for _, s := range view.Slots {
		if s.Unfilled != nil && !s.At.Before(in.now) {
			out = append(out, s)
		}
	}
	return out, nil
}

// Leftovers returns the available Leftovers, soonest Use-by first.
func (r *Runner) Leftovers(ctx context.Context) ([]plan.Leftover, error) {
	return r.d.Store.Leftovers(ctx)
}

// meal re-reads the Planned Meal at key after a write.
func (r *Runner) meal(ctx context.Context, key plan.Key) (plan.Meal, error) {
	m, err := r.d.Store.Meal(ctx, key)
	return m, mapStoreErr(err)
}

// SetMeal sets (or swaps to) a Recipe at the slot and Pins it, then replans the unpinned slots after it (spec §7.3).
// batches nil means ceil(portions / Yield) for the slot's Attendance (1 when nobody attends); an explicit value may be
// fractional. Pinned dependants of the meal that was there before are unpinned. Errors: ErrUnknownSlot (not a Meal Slot
// of that weekday), ErrInPast (before today), ErrAlreadyResolved (Cooked or skipped there), ErrUnknownRecipe,
// ErrArchivedRecipe, ErrInvalidBatches.
func (r *Runner) SetMeal(ctx context.Context, key plan.Key, recipeID int64, batches *float64) (plan.Meal, error) {
	_, err := r.write(ctx, plan.ReasonPinned, runOpts{after: &key}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		in, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		if _, ok := in.slotDef(key); !ok {
			return nil, ErrUnknownSlot
		}
		if at, _ := in.instant(key); at.Before(in.now) {
			return nil, ErrInPast
		}
		recipes, err := r.d.Source.Recipes(ctx)
		if err != nil {
			return nil, err
		}
		rc, ok := recipeOf(recipes, recipeID)
		if !ok {
			return nil, ErrUnknownRecipe
		}
		if rc.Archived {
			return nil, ErrArchivedRecipe
		}
		if batches != nil && *batches <= 0 {
			return nil, ErrInvalidBatches
		}
		def, _ := in.slotDef(key)
		att, err := r.d.Source.Attendance(ctx, def.ID, key.Date)
		if err != nil {
			return nil, err
		}
		portions := attendancePortions(att)
		b := 1.0
		if batches != nil {
			b = *batches
		} else if n := planner.BatchesFor(portions, rc.Yield); n > 1 {
			b = float64(n)
		}

		old, err := st.Meal(ctx, key)
		switch {
		case errors.Is(err, store.ErrNotFound):
		case err != nil:
			return nil, err
		case old.State != plan.StatePlanned:
			return nil, ErrAlreadyResolved
		case old.Fresh():
			// The meal being replaced was the source of its Leftover dependants: they no longer have it.
			if err := r.unpinMisfits(ctx, st, old.Key, 0, in); err != nil {
				return nil, err
			}
		}
		if _, err := st.SaveMeal(ctx, plan.Meal{Key: key, RecipeID: recipeID, Batches: b, Portions: portions,
			State: plan.StatePlanned, Pinned: true}); err != nil {
			return nil, mapStoreErr(err)
		}
		return nil, nil
	})
	if err != nil {
		return plan.Meal{}, err
	}
	return r.meal(ctx, key)
}

// Confirm Pins the Planned Meal as it is and replans the unpinned slots after it. ErrNotFound, ErrAlreadyResolved.
func (r *Runner) Confirm(ctx context.Context, key plan.Key) (plan.Meal, error) {
	_, err := r.write(ctx, plan.ReasonPinned, runOpts{after: &key}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		m, err := st.Meal(ctx, key)
		if err != nil {
			return nil, mapStoreErr(err)
		}
		if m.State != plan.StatePlanned {
			return nil, ErrAlreadyResolved
		}
		return nil, mapStoreErr(st.SetPinned(ctx, key, true))
	})
	if err != nil {
		return plan.Meal{}, err
	}
	return r.meal(ctx, key)
}

// Unpin clears the Pinned flag and runs Plan(ReasonUnpinned) (the meal stays as it is while it is valid; Regenerate may
// now replace it). ErrNotFound, ErrAlreadyResolved.
func (r *Runner) Unpin(ctx context.Context, key plan.Key) (plan.Meal, error) {
	_, err := r.write(ctx, plan.ReasonUnpinned, runOpts{}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		m, err := st.Meal(ctx, key)
		if err != nil {
			return nil, mapStoreErr(err)
		}
		if m.State != plan.StatePlanned {
			return nil, ErrAlreadyResolved
		}
		return nil, mapStoreErr(st.SetPinned(ctx, key, false))
	})
	if err != nil {
		return plan.Meal{}, err
	}
	return r.meal(ctx, key)
}

// Alternative is one Swap candidate.
type Alternative struct {
	RecipeID            int64
	Batches             int
	NewLeftoverPortions float64
	NewLeftoverUseBy    string
	Score               float64
	Why                 []plan.Why
}

// Alternatives returns the top 3 alternatives for the slot under the same scoring (excluding the current Recipe), each
// with its why chips. Nothing is written. An empty slot ("couldn't plan") is fine. ErrUnknownSlot (not a Meal Slot of that
// weekday), ErrNotSwappable (Cooked or skipped).
func (r *Runner) Alternatives(ctx context.Context, key plan.Key) ([]Alternative, error) {
	in, err := r.info(ctx)
	if err != nil {
		return nil, err
	}
	if _, ok := in.slotDef(key); !ok {
		return nil, ErrUnknownSlot
	}
	snap, err := r.snapshot(ctx, r.d.Store, runOpts{})
	if err != nil {
		return nil, err
	}
	pin, err := plan.BuildInput(snap)
	if err != nil {
		return nil, err
	}
	placements, err := planner.Swap(pin, planner.SlotKey{Date: planner.Date(key.Date), MealSlotID: key.MealSlotID})
	switch {
	case errors.Is(err, planner.ErrSlotNotSwappable):
		return nil, ErrNotSwappable
	case errors.Is(err, planner.ErrUnknownSlot):
		return nil, ErrUnknownSlot
	case err != nil:
		return nil, err
	}
	out := make([]Alternative, 0, len(placements))
	for _, p := range placements {
		a := Alternative{RecipeID: int64(p.RecipeID), Batches: p.Batches, Score: p.Score, Why: plan.WhyAll(p.Why)}
		if p.NewLeftover != nil {
			a.NewLeftoverPortions = p.NewLeftover.Portions
			a.NewLeftoverUseBy = string(p.NewLeftover.UseBy)
		}
		out = append(out, a)
	}
	return out, nil
}

// CookPreview is what the Mark as Cooked sheet shows.
type CookPreview struct {
	Meal           plan.Meal
	Fresh          bool // false: served from a Leftover (nothing to deduct, no new Leftover)
	Yield          float64
	PortionsNeeded float64 // the slot's Attendance now
	Proposed       float64 // plan.ProposedLeftover(Batches, Yield, PortionsNeeded); 0 when Fresh is false
	Max            float64 // Batches x Yield: the most the stepper may reach
	UseBy          string  // the Use-by the Leftover would get
	Needs          []Need  // what Stock would be asked to deduct
}

// CookPreview computes the sheet. ErrNotFound, ErrAlreadyResolved.
func (r *Runner) CookPreview(ctx context.Context, key plan.Key) (CookPreview, error) {
	in, err := r.info(ctx)
	if err != nil {
		return CookPreview{}, err
	}
	m, err := r.d.Store.Meal(ctx, key)
	if err != nil {
		return CookPreview{}, mapStoreErr(err)
	}
	if m.State != plan.StatePlanned {
		return CookPreview{}, ErrAlreadyResolved
	}
	p := CookPreview{Meal: m}
	def, ok := in.slotDef(key)
	if !ok {
		return CookPreview{}, ErrUnknownSlot
	}
	att, err := r.d.Source.Attendance(ctx, def.ID, key.Date)
	if err != nil {
		return CookPreview{}, err
	}
	p.PortionsNeeded = attendancePortions(att)
	if !m.Fresh() {
		return p, nil
	}
	recipes, err := r.d.Source.Recipes(ctx)
	if err != nil {
		return CookPreview{}, err
	}
	rc, ok := recipeOf(recipes, m.RecipeID)
	if !ok {
		return CookPreview{}, ErrUnknownRecipe
	}
	p.Fresh, p.Yield = true, rc.Yield
	p.Proposed = plan.ProposedLeftover(m.Batches, rc.Yield, p.PortionsNeeded)
	p.Max = m.Batches * rc.Yield
	p.UseBy = plan.LeftoverUseBy(key.Date, rc.UseByDays, in.settings.DefaultUseByDays)
	p.Needs = needsFor(rc, m.Batches)
	return p, nil
}

// CookedResult is the outcome of Mark as Cooked.
type CookedResult struct {
	Meal     plan.Meal
	Leftover *plan.Leftover // the actual Leftover recorded; nil when none
	Warnings []Warning      // Stock shortfalls; never an error
}

// Cooked marks the Planned Meal Cooked (spec §8), in ONE transaction:
//  1. fresh meal: deduct Stock for Batches x the non-optional lines (StockPort.DeductCookedTx); a meal served from a
//     Leftover deducts nothing and consumes its portions from that Leftover instead (floor 0);
//  2. State cooked (still Pinned);
//  3. fresh meal with leftoverPortions > 0 (nil = the proposal): record the actual Leftover (Use-by = the meal's date +
//     the Recipe's or default Use-by days) and point the dependants at it;
//  4. unpin the Pinned dependants that no longer fit (plan.DependantsToUnpin) and replan (Plan, ReasonLeftoversChanged):
//     a smaller Leftover replans the affected meals, a larger one leaves the extra pending.
//
// After the commit it calls StockPort.PublishDeduction and publishes "plan". Short Stock is returned in Warnings.
// Any error rolls everything back: Stock is untouched, the meal stays planned, nothing is published.
// Errors: ErrNotFound, ErrAlreadyResolved, plan.ErrInvalidLeftover.
func (r *Runner) Cooked(ctx context.Context, key plan.Key, leftoverPortions *float64) (CookedResult, error) {
	var warnings []Warning
	var leftover *plan.Leftover
	var publish func()
	_, err := r.write(ctx, plan.ReasonLeftoversChanged, runOpts{}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		in, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		m, err := st.Meal(ctx, key)
		if err != nil {
			return nil, mapStoreErr(err)
		}
		if m.State != plan.StatePlanned {
			return nil, ErrAlreadyResolved
		}
		def, ok := in.slotDef(key)
		if !ok {
			return nil, ErrUnknownSlot
		}
		att, err := r.d.Source.Attendance(ctx, def.ID, key.Date)
		if err != nil {
			return nil, err
		}
		need := attendancePortions(att)
		recipes, err := r.d.Source.Recipes(ctx)
		if err != nil {
			return nil, err
		}

		if !m.Fresh() {
			// Served from a Leftover: consume the portions it needed from that Leftover (floor 0).
			src, err := r.leftoverSource(ctx, st, m)
			if err != nil {
				return nil, err
			}
			if err := st.MarkResolved(ctx, key, plan.StateCooked); err != nil {
				return nil, mapStoreErr(err)
			}
			if src != nil {
				left := src.Portions - need
				if left < 0 {
					left = 0
				}
				if err := st.SetLeftoverPortions(ctx, src.ID, left); err != nil {
					return nil, err
				}
				if err := r.unpinMisfits(ctx, st, src.From, left, in); err != nil {
					return nil, err
				}
			}
			return nil, nil
		}

		rc, ok := recipeOf(recipes, m.RecipeID)
		if !ok {
			return nil, ErrUnknownRecipe
		}
		portions := plan.ProposedLeftover(m.Batches, rc.Yield, need)
		if leftoverPortions != nil {
			portions = *leftoverPortions
		}
		if err := plan.CheckLeftoverPortions(portions, m.Batches*rc.Yield); err != nil {
			return nil, err
		}
		d, err := r.d.Stock.DeductCookedTx(ctx, tx, needsFor(rc, m.Batches))
		if err != nil {
			return nil, err
		}
		warnings = d.Warnings
		publish = func() { r.d.Stock.PublishDeduction(d) }

		if err := st.MarkResolved(ctx, key, plan.StateCooked); err != nil {
			return nil, mapStoreErr(err)
		}
		if portions > eps {
			l, err := st.AddLeftover(ctx, plan.Leftover{RecipeID: m.RecipeID, From: key, Portions: portions,
				CookedOn: key.Date, UseBy: plan.LeftoverUseBy(key.Date, rc.UseByDays, in.settings.DefaultUseByDays)})
			if err != nil {
				return nil, err
			}
			if err := st.LinkLeftover(ctx, key, l.ID); err != nil {
				return nil, err
			}
			leftover = &l
		}
		if err := r.unpinMisfits(ctx, st, key, portions, in); err != nil {
			return nil, err
		}
		return nil, nil
	})
	if err != nil {
		return CookedResult{}, err
	}
	if publish != nil {
		publish()
	}
	m, err := r.meal(ctx, key)
	if err != nil {
		return CookedResult{}, err
	}
	return CookedResult{Meal: m, Leftover: leftover, Warnings: warnings}, nil
}

// eps absorbs float noise in portion arithmetic.
const eps = 1e-9

// leftoverSource is the available Leftover a meal is served from: by id once recorded, otherwise the one the fresh
// meal at its source produced. nil when there is none.
func (r *Runner) leftoverSource(ctx context.Context, st *store.Store, m plan.Meal) (*plan.Leftover, error) {
	if m.From == nil {
		return nil, nil
	}
	if m.From.LeftoverID != 0 {
		l, err := st.Leftover(ctx, m.From.LeftoverID)
		if errors.Is(err, store.ErrNotFound) {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		return &l, nil
	}
	l, ok, err := st.LeftoverFrom(ctx, m.From.From)
	if err != nil || !ok {
		return nil, err
	}
	return &l, nil
}

// NotCooked marks the meal skipped ("we had takeaway"): no Stock change, no Leftover; Pinned dependants are unpinned and
// the dependants replanned. ErrNotFound, ErrAlreadyResolved.
func (r *Runner) NotCooked(ctx context.Context, key plan.Key) (plan.Meal, error) {
	_, err := r.write(ctx, plan.ReasonNotCooked, runOpts{}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		in, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		m, err := st.Meal(ctx, key)
		if err != nil {
			return nil, mapStoreErr(err)
		}
		if m.State != plan.StatePlanned {
			return nil, ErrAlreadyResolved
		}
		if err := st.MarkResolved(ctx, key, plan.StateSkipped); err != nil {
			return nil, mapStoreErr(err)
		}
		return nil, r.unpinMisfits(ctx, st, key, 0, in)
	})
	if err != nil {
		return plan.Meal{}, err
	}
	return r.meal(ctx, key)
}
