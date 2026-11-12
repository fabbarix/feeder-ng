package store

import (
	"context"
	"database/sql"

	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
)

// Mover plugs the Shopping List into the Ingredient merge/delete protection (T2's ReferenceMover).
type Mover struct{}

func init() { ingredientstore.RegisterMover(Mover{}) }

// Name is "shopping list".
func (Mover) Name() string { return "shopping list" }

// Count is the number of extras, ticks and Not needed marks that reference the Ingredient.
func (Mover) Count(ctx context.Context, q ingredientstore.Querier, ingredientID int64) (int, error) {
	total := 0
	for _, table := range []string{"shopping_extras", "shopping_ticks", "shopping_not_needed"} {
		var n int
		if err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+table+` WHERE ingredient_id = ?`, ingredientID).Scan(&n); err != nil {
			return 0, err
		}
		total += n
	}
	return total, nil
}

// Move re-points extras, ticks and Not needed marks to the merged Ingredient; a range already ticked or marked
// Not needed for the target keeps its own.
func (Mover) Move(ctx context.Context, tx *sql.Tx, from, to int64) error {
	if _, err := tx.ExecContext(ctx, `UPDATE shopping_extras SET ingredient_id = ? WHERE ingredient_id = ?`, to, from); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE OR IGNORE shopping_ticks SET ingredient_id = ? WHERE ingredient_id = ?`, to, from); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM shopping_ticks WHERE ingredient_id = ?`, from); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE OR IGNORE shopping_not_needed SET ingredient_id = ? WHERE ingredient_id = ?`, to, from); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `DELETE FROM shopping_not_needed WHERE ingredient_id = ?`, from)
	return err
}
