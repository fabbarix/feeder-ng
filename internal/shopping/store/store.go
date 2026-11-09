// Package store is the SQL repository for Shopping List extras and ticks (migration 0800). Stubs until implemented.
package store

import (
	"context"
	"database/sql"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

var (
	// ErrNotFound is returned for an unknown extra.
	ErrNotFound = errors.New("shopping store: not found")
	// ErrInvalid is returned for blank text or a quantity <= 0.
	ErrInvalid = errors.New("shopping store: invalid")
	errTodo    = errors.New("not implemented")
)

// Store keeps manual extras and the ticked state per range.
type Store struct {
	db  *sql.DB
	clk clock.Clock
}

// New returns a Store.
func New(db *sql.DB, clk clock.Clock) *Store { return &Store{db: db, clk: clk} }

// AddTextExtra adds a free-text extra (text trimmed and whitespace-collapsed; blank is ErrInvalid).
func (s *Store) AddTextExtra(ctx context.Context, text string) (shopping.Extra, error) {
	return shopping.Extra{}, errTodo
}

// AddIngredientExtra adds an Ingredient with a quantity in Base Units (> 0, else ErrInvalid).
func (s *Store) AddIngredientExtra(ctx context.Context, ingredientID int64, quantity float64) (shopping.Extra, error) {
	return shopping.Extra{}, errTodo
}

// Extras returns the open extras and those ticked on today, ordered by id.
func (s *Store) Extras(ctx context.Context, today stock.Date) ([]shopping.Extra, error) {
	return nil, errTodo
}

// DeleteExtra removes an extra (ErrNotFound).
func (s *Store) DeleteExtra(ctx context.Context, id int64) error { return errTodo }

// TickExtra marks an extra ticked on today (ErrNotFound).
func (s *Store) TickExtra(ctx context.Context, id int64, today stock.Date) error { return errTodo }

// UntickExtra clears the tick (ErrNotFound).
func (s *Store) UntickExtra(ctx context.Context, id int64) error { return errTodo }

// AddGot adds delta (may be negative, floor 0) to an Ingredient extra's `got` and returns the extra.
func (s *Store) AddGot(ctx context.Context, id int64, delta float64) (shopping.Extra, error) {
	return shopping.Extra{}, errTodo
}

// SetTick ticks an Ingredient for a range (upsert). lotID is the Stock Lot a tick by hand added, if any.
func (s *Store) SetTick(ctx context.Context, rangeTo stock.Date, t shopping.Tick, lotID *int64) error {
	return errTodo
}

// DeleteTick unticks an Ingredient for a range (no error when it was not ticked).
func (s *Store) DeleteTick(ctx context.Context, rangeTo stock.Date, ingredientID int64) error {
	return errTodo
}

// Ticks returns the ticks of one range by Ingredient.
func (s *Store) Ticks(ctx context.Context, rangeTo stock.Date) (map[int64]shopping.Tick, error) {
	return nil, errTodo
}

// PurgeBefore deletes ticks whose range ended before today.
func (s *Store) PurgeBefore(ctx context.Context, today stock.Date) error { return errTodo }

// LotsAdded counts the ticks of a range that added a Stock Lot.
func (s *Store) LotsAdded(ctx context.Context, rangeTo stock.Date) (int, error) { return 0, errTodo }
