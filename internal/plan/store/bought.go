package store

import (
	"context"
	"database/sql"
	"strings"
	"time"

	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/plan"
)

// B5-BO (docs/dev/design/b5-bo.md §4): the repository of planned_meal_bought (migration 1520).

// AddBought stores the records of one purchase. A record for the same Planned Meal, Ingredient and Lot replaces the
// earlier one (a retry is harmless). ErrUnknownRef for a Planned Meal or Ingredient that does not exist.
func (s *Store) AddBought(ctx context.Context, recs []plan.BoughtRecord) error {
	return s.InTx(ctx, func(_ *sql.Tx, st *Store) error {
		for _, r := range recs {
			if !(r.Quantity > 0) {
				return ErrInvalid
			}
			_, err := st.q.ExecContext(ctx, `INSERT INTO planned_meal_bought (planned_meal_id, ingredient_id, lot_id, quantity, bought_at)
				VALUES (?, ?, ?, ?, ?)
				ON CONFLICT (planned_meal_id, ingredient_id, lot_id) DO UPDATE SET quantity = excluded.quantity, bought_at = excluded.bought_at`,
				r.MealID, r.IngredientID, r.LotID, r.Quantity, r.At.UTC().Format(time.RFC3339))
			if err != nil {
				return mapErr(err)
			}
		}
		return nil
	})
}

// RemoveBoughtForLot removes every record of the Lot (Undo of the Scan, unticking, Lot Delete) and returns how many
// went. An unknown Lot is not an error.
func (s *Store) RemoveBoughtForLot(ctx context.Context, lotID int64) (int, error) {
	res, err := s.q.ExecContext(ctx, `DELETE FROM planned_meal_bought WHERE lot_id = ?`, lotID)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	return int(n), err
}

// BoughtRecords returns the records of one Planned Meal, ordered by Ingredient then Lot.
func (s *Store) BoughtRecords(ctx context.Context, mealID int64) ([]plan.BoughtRecord, error) {
	rows, err := s.q.QueryContext(ctx, `SELECT planned_meal_id, ingredient_id, lot_id, quantity, bought_at FROM planned_meal_bought
		WHERE planned_meal_id = ? ORDER BY ingredient_id, lot_id`, mealID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []plan.BoughtRecord
	for rows.Next() {
		var (
			r  plan.BoughtRecord
			at string
		)
		if err := rows.Scan(&r.MealID, &r.IngredientID, &r.LotID, &r.Quantity, &at); err != nil {
			return nil, err
		}
		if r.At, err = time.Parse(time.RFC3339, at); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// fillBought sets Meal.Bought (distinct Ingredient ids, ascending; nil when nothing was bought) on each meal.
func (s *Store) fillBought(ctx context.Context, meals []plan.Meal) error {
	if len(meals) == 0 {
		return nil
	}
	args := make([]any, 0, len(meals))
	marks := make([]string, 0, len(meals))
	index := make(map[int64][]int, len(meals))
	for i, m := range meals {
		args = append(args, m.ID)
		marks = append(marks, "?")
		index[m.ID] = append(index[m.ID], i)
	}
	rows, err := s.q.QueryContext(ctx, `SELECT DISTINCT planned_meal_id, ingredient_id FROM planned_meal_bought
		WHERE planned_meal_id IN (`+strings.Join(marks, ",")+`) ORDER BY planned_meal_id, ingredient_id`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var mealID, ingredientID int64
		if err := rows.Scan(&mealID, &ingredientID); err != nil {
			return err
		}
		for _, i := range index[mealID] {
			meals[i].Bought = append(meals[i].Bought, ingredientID)
		}
	}
	return rows.Err()
}

// Mover plugs planned_meal_bought into the Ingredient merge/delete protection.
type Mover struct{}

func init() { ingredientstore.RegisterMover(Mover{}) }

// Name is "bought Planned Meals".
func (Mover) Name() string { return "bought Planned Meals" }

// Count is the number of records that reference the Ingredient.
func (Mover) Count(ctx context.Context, q ingredientstore.Querier, ingredientID int64) (int, error) {
	var n int
	err := q.QueryRowContext(ctx, `SELECT COUNT(*) FROM planned_meal_bought WHERE ingredient_id = ?`, ingredientID).Scan(&n)
	return n, err
}

// Move re-points the records to the merged Ingredient; records of one Planned Meal and Lot that now share a key are
// summed into one.
func (Mover) Move(ctx context.Context, tx *sql.Tx, from, to int64) error {
	// 1. Sum the old Ingredient's record into the target's record of the same Planned Meal and Lot.
	if _, err := tx.ExecContext(ctx, `UPDATE planned_meal_bought SET quantity = quantity + (
			SELECT SUM(f.quantity) FROM planned_meal_bought f
			WHERE f.ingredient_id = ? AND f.planned_meal_id = planned_meal_bought.planned_meal_id AND f.lot_id = planned_meal_bought.lot_id)
		WHERE ingredient_id = ? AND EXISTS (
			SELECT 1 FROM planned_meal_bought f
			WHERE f.ingredient_id = ? AND f.planned_meal_id = planned_meal_bought.planned_meal_id AND f.lot_id = planned_meal_bought.lot_id)`,
		from, to, from); err != nil {
		return err
	}
	// 2. Drop the old Ingredient's records that the target now holds.
	if _, err := tx.ExecContext(ctx, `DELETE FROM planned_meal_bought WHERE ingredient_id = ? AND EXISTS (
			SELECT 1 FROM planned_meal_bought t
			WHERE t.ingredient_id = ? AND t.planned_meal_id = planned_meal_bought.planned_meal_id AND t.lot_id = planned_meal_bought.lot_id)`,
		from, to); err != nil {
		return err
	}
	// 3. Re-point the rest.
	_, err := tx.ExecContext(ctx, `UPDATE planned_meal_bought SET ingredient_id = ? WHERE ingredient_id = ?`, to, from)
	return err
}
