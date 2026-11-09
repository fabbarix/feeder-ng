// Package store is the SQLite repository for planning: Planned Meals, Leftovers,
// Slot Rules, Variety Rules, "couldn't plan" reasons and the generation counter
// (migration 0600_planning.sql). It holds no planning rules: internal/plan and
// internal/planner do. Every read and write can run inside the caller's
// transaction through InTx, so the runner persists a whole run atomically.
package store

import (
	"context"
	"database/sql"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/plan"
	rstore "github.com/fabbarix/feeder-ng/internal/recipe/store"
)

// Errors.
var (
	ErrNotFound      = errors.New("planning: not found")
	ErrInvalid       = errors.New("planning: invalid")                     // rule with both/neither Recipe and Tag, bad Variety Rule
	ErrDuplicateRule = errors.New("planning: rule already exists")         // same Slot Rule twice
	ErrUnknownRef    = errors.New("planning: unknown Meal Slot or Recipe") // foreign key not satisfied
	errTODO          = errors.New("planning/store: not implemented")
)

// DB is what a Store runs its statements on: *sql.DB or *sql.Tx.
type DB interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// Store is the planning repository.
type Store struct {
	db  *sql.DB
	q   DB
	clk clock.Clock
}

// New returns a Store over an open, migrated database.
func New(d *sql.DB, clk clock.Clock) *Store { return &Store{db: d, q: d, clk: clk} }

// InTx runs fn in one transaction: st is bound to it, tx is for callers that
// must pass the transaction on (stock.DeductForCookedTx). It commits when fn
// returns nil and rolls back otherwise. Nested InTx on the bound store joins the
// same transaction.
func (s *Store) InTx(ctx context.Context, fn func(tx *sql.Tx, st *Store) error) error {
	return errTODO
}

// Planned Meals.

// Meals returns the Planned Meals with from <= date <= to ("" = open bound), ordered by date then Meal Slot id.
func (s *Store) Meals(ctx context.Context, from, to string) ([]plan.Meal, error) { return nil, errTODO }

// Meal returns the Planned Meal at key; ErrNotFound if the slot is empty.
func (s *Store) Meal(ctx context.Context, key plan.Key) (plan.Meal, error) {
	return plan.Meal{}, errTODO
}

// UnresolvedBefore returns the Planned Meals in State planned dated before date (still to confirm), oldest first.
func (s *Store) UnresolvedBefore(ctx context.Context, date string) ([]plan.Meal, error) {
	return nil, errTODO
}

// SaveMeal inserts or replaces the Planned Meal at m.Key (the id is kept when it exists) and returns it.
// ErrUnknownRef for an unknown Meal Slot or Recipe.
func (s *Store) SaveMeal(ctx context.Context, m plan.Meal) (plan.Meal, error) {
	return plan.Meal{}, errTODO
}

// SetPinned changes only the Pinned flag; ErrNotFound if the slot is empty.
func (s *Store) SetPinned(ctx context.Context, key plan.Key, pinned bool) error { return errTODO }

// MarkResolved sets State (cooked or skipped) and the resolution instant (the clock's now).
func (s *Store) MarkResolved(ctx context.Context, key plan.Key, state plan.State) error {
	return errTODO
}

// DeleteMeal removes the Planned Meal at key; ErrNotFound if there is none.
func (s *Store) DeleteMeal(ctx context.Context, key plan.Key) error { return errTODO }

// Dependants returns the Planned Meals in State planned served from the Leftover of the fresh meal at source.
func (s *Store) Dependants(ctx context.Context, source plan.Key) ([]plan.Meal, error) {
	return nil, errTODO
}

// LinkLeftover points every dependant of source (State planned) at the actual Leftover.
func (s *Store) LinkLeftover(ctx context.Context, source plan.Key, leftoverID int64) error {
	return errTODO
}

// History returns, per Recipe, the latest date before `before` of a fresh meal (not served from a Leftover) in
// State planned or cooked. Skipped meals do not count.
func (s *Store) History(ctx context.Context, before string) ([]plan.HistoryEntry, error) {
	return nil, errTODO
}

// Apply writes a run's Changes: upserts (State planned, not Pinned), deletes, the new "couldn't plan" reasons and the
// cleared ones. It never touches Pinned, Cooked or Skipped meals, and an error leaves nothing written when the Store
// is bound to a transaction (the runner always is).
func (s *Store) Apply(ctx context.Context, ch plan.Changes) error { return errTODO }

// Unfilled returns the stored "couldn't plan" reasons with from <= date <= to, ordered by date then Meal Slot id.
func (s *Store) Unfilled(ctx context.Context, from, to string) ([]plan.Unfilled, error) {
	return nil, errTODO
}

// Leftovers.

// AddLeftover records an actual Leftover (Status available) and returns it with its id.
func (s *Store) AddLeftover(ctx context.Context, l plan.Leftover) (plan.Leftover, error) {
	return plan.Leftover{}, errTODO
}

// Leftover returns one Leftover of any status; ErrNotFound otherwise.
func (s *Store) Leftover(ctx context.Context, id int64) (plan.Leftover, error) {
	return plan.Leftover{}, errTODO
}

// Leftovers returns the available Leftovers with Portions > 0, soonest Use-by first (then id).
func (s *Store) Leftovers(ctx context.Context) ([]plan.Leftover, error) { return nil, errTODO }

// LeftoverFrom returns the available Leftover produced by the Cooked meal at key, if any.
func (s *Store) LeftoverFrom(ctx context.Context, key plan.Key) (plan.Leftover, bool, error) {
	return plan.Leftover{}, false, errTODO
}

// SetLeftoverPortions sets the remaining portions (>= 0); ErrNotFound if unknown.
func (s *Store) SetLeftoverPortions(ctx context.Context, id int64, portions float64) error {
	return errTODO
}

// DiscardLeftover marks a Leftover discarded on the given date; ErrNotFound if unknown.
func (s *Store) DiscardLeftover(ctx context.Context, id int64, on string) error { return errTODO }

// Rules.

// SlotRules returns all Slot Rules ordered by Meal Slot id, then id.
func (s *Store) SlotRules(ctx context.Context) ([]plan.SlotRule, error) { return nil, errTODO }

// AddSlotRule stores a Slot Rule. ErrInvalid unless exactly one of RecipeID and Tag is set, ErrUnknownRef for an unknown
// Meal Slot or Recipe, ErrDuplicateRule for the same rule twice.
func (s *Store) AddSlotRule(ctx context.Context, r plan.SlotRule) (plan.SlotRule, error) {
	return plan.SlotRule{}, errTODO
}

// DeleteSlotRule removes a Slot Rule; ErrNotFound if unknown.
func (s *Store) DeleteSlotRule(ctx context.Context, id int64) error { return errTODO }

// VarietyRules returns all Variety Rules ordered by Tag.
func (s *Store) VarietyRules(ctx context.Context) ([]plan.VarietyRule, error) { return nil, errTODO }

// SetVarietyRule inserts or replaces the rule for r.Tag. ErrInvalid when it limits nothing (MaxPerWeek 0 and not
// NotConsecutiveDays), when MaxPerWeek is negative or above 21, or when the Tag is empty.
func (s *Store) SetVarietyRule(ctx context.Context, r plan.VarietyRule) error { return errTODO }

// DeleteVarietyRule removes the rule for tag; ErrNotFound if there is none.
func (s *Store) DeleteVarietyRule(ctx context.Context, tag string) error { return errTODO }

// Generation.

// Generation is the current plan generation (starts at 1).
func (s *Store) Generation(ctx context.Context) (int64, error) { return 0, errTODO }

// BumpGeneration increments the generation and returns the new value (Regenerate).
func (s *Store) BumpGeneration(ctx context.Context) (int64, error) { return 0, errTODO }

// Checker tells the Recipes feature whether a Recipe was ever planned (so it can only be archived, not deleted):
// it has a Planned Meal, a Leftover or a Slot Rule. It registers itself as "planning" in init().
type Checker struct{}

// WasPlanned implements recipe/store.PlannedChecker.
func (Checker) WasPlanned(ctx context.Context, q rstore.Querier, recipeID int64) (bool, error) {
	return false, nil // stub: "never planned" until the Developer implements it, so Recipe deletion keeps working
}

func init() { rstore.RegisterPlannedChecker("planning", Checker{}) }
