package store

import (
	"context"
	"database/sql"
	"sync"
)

// Querier is satisfied by *sql.DB and *sql.Tx.
type Querier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

// PlannedChecker is implemented by the planning feature: it says whether a
// Recipe was ever planned (planned meals, leftovers, history). Until planning
// lands no checker is registered, so every Recipe counts as never planned.
type PlannedChecker interface {
	WasPlanned(ctx context.Context, q Querier, recipeID int64) (bool, error)
}

// PlannedCheckers is a set of PlannedCheckers keyed by name.
type PlannedCheckers struct {
	mu sync.Mutex
	by map[string]PlannedChecker
}

// NewPlannedCheckers returns an empty set.
func NewPlannedCheckers() *PlannedCheckers { return &PlannedCheckers{by: map[string]PlannedChecker{}} }

// Register adds a checker; panics on an empty name, nil checker or duplicate name.
func (p *PlannedCheckers) Register(name string, c PlannedChecker) {
	if name == "" || c == nil {
		panic("store: PlannedChecker needs a name and a checker")
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if _, dup := p.by[name]; dup {
		panic("store: duplicate PlannedChecker " + name)
	}
	p.by[name] = c
}

// Unregister removes a checker (tests).
func (p *PlannedCheckers) Unregister(name string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.by, name)
}

// WasPlanned is true if any registered checker says so (errors abort).
func (p *PlannedCheckers) WasPlanned(ctx context.Context, q Querier, recipeID int64) (bool, error) {
	p.mu.Lock()
	checkers := make([]PlannedChecker, 0, len(p.by))
	for _, c := range p.by {
		checkers = append(checkers, c)
	}
	p.mu.Unlock()
	for _, c := range checkers {
		planned, err := c.WasPlanned(ctx, q, recipeID)
		if err != nil {
			return false, err
		}
		if planned {
			return true, nil
		}
	}
	return false, nil
}

// DefaultPlannedCheckers is what New uses; feature stores register from init().
var DefaultPlannedCheckers = NewPlannedCheckers()

// RegisterPlannedChecker adds a checker to DefaultPlannedCheckers.
func RegisterPlannedChecker(name string, c PlannedChecker) { DefaultPlannedCheckers.Register(name, c) }
