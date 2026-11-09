//go:build t2merged

// Remove the build tag above (and in mover_test.go) once team T2 is merged.

package store

import (
	"context"
	"database/sql"

	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
)

// Mover plugs Stock into the Ingredient merge/delete protection (T2's ReferenceMover).
type Mover struct{}

func init() { ingredientstore.RegisterMover(Mover{}) }

// Name is "stock lots".
func (Mover) Name() string { return "stock lots" }

// Count is the number of Stock Lots plus waste records that reference the Ingredient.
func (Mover) Count(ctx context.Context, q ingredientstore.Querier, ingredientID int64) (int, error) {
	panic("TODO")
}

// Move re-points Stock Lots and waste records from one Ingredient to another.
func (Mover) Move(ctx context.Context, tx *sql.Tx, from, to int64) error { panic("TODO") }
