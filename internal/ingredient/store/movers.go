package store

import (
	"context"
	"database/sql"
	"sort"
	"sync"
)

// Querier is satisfied by *sql.DB and *sql.Tx.
type Querier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

// ReferenceMover is implemented by any feature store that holds an Ingredient id
// (recipe lines, products, stock lots, shopping extras, exclusions, ...). It registers
// itself in init() with RegisterMover; the ingredient module never learns the tables.
type ReferenceMover interface {
	// Name is a stable label for the references ("recipe lines", "products"). Unique.
	Name() string
	// Count returns how many rows reference the Ingredient.
	Count(ctx context.Context, q Querier, ingredientID int64) (int, error)
	// Move re-points every reference from one Ingredient to another, inside tx. It must
	// cope with uniqueness collisions itself (e.g. add Stock Lots, drop a duplicate Exclusion).
	Move(ctx context.Context, tx *sql.Tx, from, to int64) error
}

// UnitGuard is an optional extra interface of a ReferenceMover: it vetoes removing a
// Unit Conversion that is still used (e.g. a recipe line written in "clove").
type UnitGuard interface {
	UnitInUse(ctx context.Context, q Querier, ingredientID int64, unit string) (bool, error)
}

// Movers is a set of ReferenceMovers.
type Movers struct {
	mu sync.Mutex
	by map[string]ReferenceMover
}

// NewMovers returns an empty set.
func NewMovers() *Movers { return &Movers{by: map[string]ReferenceMover{}} }

// Register adds m; panics on an empty or duplicate Name.
func (r *Movers) Register(m ReferenceMover) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if m.Name() == "" {
		panic("store: ReferenceMover with empty name")
	}
	if _, dup := r.by[m.Name()]; dup {
		panic("store: duplicate ReferenceMover " + m.Name())
	}
	r.by[m.Name()] = m
}

// All returns the movers sorted by Name.
func (r *Movers) All() []ReferenceMover {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]ReferenceMover, 0, len(r.by))
	for _, m := range r.by {
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name() < out[j].Name() })
	return out
}

// DefaultMovers is the process-wide set used by New unless WithMovers is given.
var DefaultMovers = NewMovers()

// RegisterMover adds m to DefaultMovers. Call it from your store package's init().
func RegisterMover(m ReferenceMover) { DefaultMovers.Register(m) }
