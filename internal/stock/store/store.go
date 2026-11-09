// Package store is the SQL repository for Stock Lots and waste records. The
// rules (deduction order, Stock-take, spoiled) live in the pure stock package;
// the store only loads lots, hands them to a pure function and saves the result.
package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// Source says how a Stock Lot came into Stock.
type Source string

const (
	SourceScan      Source = "scan"
	SourceStockTake Source = "stock_take"
	SourceManual    Source = "manual"
)

// Reason says why waste was recorded.
type Reason string

const (
	ReasonSpoiled         Reason = "spoiled"
	ReasonLeftoverExpired Reason = "leftover_expired"
)

var (
	// ErrNotFound is returned for an unknown Stock Lot.
	ErrNotFound = errors.New("stock lot not found")
	// ErrDuplicateUUID is returned if a client UUID is reused for a different Ingredient.
	ErrDuplicateUUID = errors.New("client uuid already used for another Stock Lot")
)

// StoredLot is a Stock Lot as persisted.
type StoredLot struct {
	stock.Lot
	Source     Source
	ProductID  *int64
	ShopID     *int64
	ClientUUID string // "" when none
	CreatedAt  time.Time
}

// NewLot is a Stock Lot to insert. GoesOff is computed by the caller (stock.NewLot).
type NewLot struct {
	IngredientID int64
	Quantity     float64
	Purchased    stock.Date
	GoesOff      stock.Date
	Source       Source
	ProductID    *int64
	ShopID       *int64
	ClientUUID   string
}

// WasteRecord is one wasted quantity. IngredientID is nil only for discarded
// Leftovers that have no single Ingredient.
type WasteRecord struct {
	ID           int64
	IngredientID *int64
	Quantity     float64
	WastedOn     stock.Date
	Reason       Reason
	LotID        *int64
}

// Mutation is what Update persists: the Ingredient's resulting lots (same ID =
// update, ID missing = delete, ID 0 = insert with NewSource) and waste to record,
// all in one transaction.
type Mutation struct {
	Lots      []stock.Lot
	NewSource Source
	Waste     []WasteRecord
}

// Store is the Stock repository.
type Store struct {
	db  *sql.DB
	clk clock.Clock
}

// New returns a Store.
func New(db *sql.DB, clk clock.Clock) *Store { return &Store{db: db, clk: clk} }

// AddLot inserts a lot. If ClientUUID is set and a lot with it exists, that lot
// is returned with created=false and nothing is inserted (idempotent offline scans).
func (s *Store) AddLot(ctx context.Context, n NewLot) (lot StoredLot, created bool, err error) {
	panic("TODO")
}

// Lot returns one lot, or ErrNotFound.
func (s *Store) Lot(ctx context.Context, id int64) (StoredLot, error) { panic("TODO") }

// Lots lists lots of one Ingredient (0 = every Ingredient), ordered by go-off
// date (none last), then purchase date, then ID.
func (s *Store) Lots(ctx context.Context, ingredientID int64) ([]StoredLot, error) {
	panic("TODO")
}

// Update runs fn on the Ingredient's current lots inside one transaction and
// persists the Mutation it returns. If fn returns an error nothing changes and
// the error is returned as is. The saved lots are returned (new lots with IDs).
func (s *Store) Update(ctx context.Context, ingredientID int64, fn func([]stock.Lot) (Mutation, error)) ([]StoredLot, error) {
	panic("TODO")
}

// AddWaste records waste.
func (s *Store) AddWaste(ctx context.Context, w WasteRecord) (WasteRecord, error) {
	panic("TODO")
}

// Waste lists waste records with WastedOn in [from, to] (an empty bound is
// open), ordered by date then ID.
func (s *Store) Waste(ctx context.Context, from, to stock.Date) ([]WasteRecord, error) {
	panic("TODO")
}
