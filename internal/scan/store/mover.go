package store

import (
	"context"
	"database/sql"

	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
)

// Mover plugs the scan ledger into the Ingredient merge/delete protection (T2's ReferenceMover): the history of
// scans keeps pointing at the merged Ingredient.
type Mover struct{}

func init() { ingredientstore.RegisterMover(Mover{}) }

// Name is "scan events".
func (Mover) Name() string { return "scan events" }

// Count is the number of scans that reference the Ingredient, undone ones included: an undone scan keeps protecting its
// Ingredient. The only rows let go are a failed receipt apply's own put-back scans (Store.ReleaseIngredient, b8-rxgo).
func (Mover) Count(ctx context.Context, q ingredientstore.Querier, ingredientID int64) (int, error) {
	var n int
	err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM scan_events WHERE ingredient_id = ?`, ingredientID).Scan(&n)
	return n, err
}

// Move re-points the scans to the merged Ingredient.
func (Mover) Move(ctx context.Context, tx *sql.Tx, from, to int64) error {
	_, err := tx.ExecContext(ctx, `UPDATE scan_events SET ingredient_id = ? WHERE ingredient_id = ?`, to, from)
	return err
}
