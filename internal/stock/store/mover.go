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
	var lots, waste int
	if err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM stock_lots WHERE ingredient_id = ?`, ingredientID).Scan(&lots); err != nil {
		return 0, err
	}
	if err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM stock_waste WHERE ingredient_id = ?`, ingredientID).Scan(&waste); err != nil {
		return 0, err
	}
	return lots + waste, nil
}

// Move re-points Stock Lots and waste records from one Ingredient to another.
func (Mover) Move(ctx context.Context, tx *sql.Tx, from, to int64) error {
	if _, err := tx.ExecContext(ctx, `UPDATE stock_lots SET ingredient_id = ? WHERE ingredient_id = ?`, to, from); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `UPDATE stock_waste SET ingredient_id = ? WHERE ingredient_id = ?`, to, from)
	return err
}
