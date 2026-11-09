package store

import (
	"context"
	"database/sql"

	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
)

// productMover tells the Ingredient module how many Products supply an Ingredient
// and moves them on a merge. Pack sizes are in the same Base Unit because the
// Ingredient merge refuses different Base Units.
type productMover struct{}

func (productMover) Name() string { return "products" }

func (productMover) Count(ctx context.Context, q ingredientstore.Querier, ingredientID int64) (int, error) {
	var n int
	err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM products WHERE ingredient_id = ?`, ingredientID).Scan(&n)
	return n, err
}

func (productMover) Move(ctx context.Context, tx *sql.Tx, from, to int64) error {
	_, err := tx.ExecContext(ctx, `UPDATE products SET ingredient_id = ? WHERE ingredient_id = ?`, to, from)
	return err
}

func init() { ingredientstore.RegisterMover(productMover{}) }
