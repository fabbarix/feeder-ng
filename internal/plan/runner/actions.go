package runner

import (
	"context"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
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

// View returns every Meal Slot occurrence from..to (inclusive; "" from = today, "" to = last day of the Planning
// Horizon) with its Planned Meal and "couldn't plan" reason. Unresolved earlier days are not added.
func (r *Runner) View(ctx context.Context, from, to string) (PlanView, error) {
	return PlanView{}, errNotImplemented
}

// ToConfirm returns the Planned Meals still in State planned that are at least plan.ConfirmAfter past their slot time.
func (r *Runner) ToConfirm(ctx context.Context) ([]SlotView, error) { return nil, errNotImplemented }

// CouldntPlan returns the slots in the horizon (not yet past) that stayed empty, with their reasons.
func (r *Runner) CouldntPlan(ctx context.Context) ([]SlotView, error) { return nil, errNotImplemented }

// Leftovers returns the available Leftovers, soonest Use-by first.
func (r *Runner) Leftovers(ctx context.Context) ([]plan.Leftover, error) {
	return nil, errNotImplemented
}

// SetMeal sets (or swaps to) a Recipe at the slot and Pins it, then replans the unpinned slots after it (spec §7.3).
// batches nil means ceil(portions / Yield) for the slot's Attendance (1 when nobody attends); an explicit value may be
// fractional. Pinned dependants of the meal that was there before are unpinned. Errors: ErrUnknownSlot (not a Meal Slot
// of that weekday), ErrInPast (before today), ErrAlreadyResolved (Cooked or skipped there), ErrUnknownRecipe,
// ErrArchivedRecipe, ErrInvalidBatches.
func (r *Runner) SetMeal(ctx context.Context, key plan.Key, recipeID int64, batches *float64) (plan.Meal, error) {
	return plan.Meal{}, errNotImplemented
}

// Confirm Pins the Planned Meal as it is and replans the unpinned slots after it. ErrNotFound, ErrAlreadyResolved.
func (r *Runner) Confirm(ctx context.Context, key plan.Key) (plan.Meal, error) {
	return plan.Meal{}, errNotImplemented
}

// Unpin clears the Pinned flag and runs Plan(ReasonUnpinned) (the meal stays as it is while it is valid; Regenerate may
// now replace it). ErrNotFound, ErrAlreadyResolved.
func (r *Runner) Unpin(ctx context.Context, key plan.Key) (plan.Meal, error) {
	return plan.Meal{}, errNotImplemented
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
	return nil, errNotImplemented
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
	return CookPreview{}, errNotImplemented
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
	return CookedResult{}, errNotImplemented
}

// NotCooked marks the meal skipped ("we had takeaway"): no Stock change, no Leftover; Pinned dependants are unpinned and
// the dependants replanned. ErrNotFound, ErrAlreadyResolved.
func (r *Runner) NotCooked(ctx context.Context, key plan.Key) (plan.Meal, error) {
	return plan.Meal{}, errNotImplemented
}
