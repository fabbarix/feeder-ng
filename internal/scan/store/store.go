// Package store is the scan ledger over `scan_events` (migration 0800): idempotency by client UUID, Undo state
// and the totals behind the "Shopping list complete" celebration. Stubs until implemented.
package store

import (
	"context"
	"database/sql"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

var (
	// ErrDuplicate is returned by Insert for a client UUID that is already recorded.
	ErrDuplicate = errors.New("scan store: duplicate client uuid")
	// ErrNotFound is returned for an unknown client UUID.
	ErrNotFound = errors.New("scan store: not found")
	errTodo     = errors.New("not implemented")
)

// Event is one applied operation. Seq and AppliedAt are set by Insert.
type Event struct {
	ClientUUID     string
	Kind           string
	ScannedAt      string
	AppliedAt      string
	Seq            int64
	ShopID         *int64
	ProductID      *int64
	IngredientID   *int64
	Quantity       float64
	PriceCents     *int
	RangeTo        stock.Date
	OnList         bool
	Ticked         bool
	LotID          *int64
	PurchaseID     *int64
	SoldAtAdded    bool
	PriceID        *int64
	PrevPriceJSON  string // the same-day Price this event replaced, "" if none
	ProductCreated bool
	MergedInto     *int64
	ResultJSON     string
	UndoneAt       string // "" while not undone
}

// Store is the ledger.
type Store struct {
	db  *sql.DB
	clk clock.Clock
}

// New returns a Store.
func New(db *sql.DB, clk clock.Clock) *Store { return &Store{db: db, clk: clk} }

// Insert records an applied operation (ErrDuplicate when the client UUID exists). It sets AppliedAt (now) and Seq (1, 2, ... in insert order).
func (s *Store) Insert(ctx context.Context, e Event) (Event, error) { return Event{}, errTodo }

// Get returns an event by client UUID.
func (s *Store) Get(ctx context.Context, clientUUID string) (Event, bool, error) {
	return Event{}, false, errTodo
}

// MarkUndone sets UndoneAt (now) and reports whether it changed (false when it was already undone; ErrNotFound if unknown).
func (s *Store) MarkUndone(ctx context.Context, clientUUID string) (bool, error) {
	return false, errTodo
}

// UpdatePrice sets the event's price (and the Price row it refers to).
func (s *Store) UpdatePrice(ctx context.Context, clientUUID string, cents int, priceID *int64) error {
	return errTodo
}

// Totals sums the range's Shop-mode events that are not undone: price_cents and the number of Stock Lots added.
func (s *Store) Totals(ctx context.Context, rangeTo stock.Date) (spentCents, lots int, err error) {
	return 0, 0, errTodo
}
