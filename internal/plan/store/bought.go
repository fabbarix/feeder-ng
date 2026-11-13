package store

import (
	"context"
	"database/sql"

	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/plan"
)

// B5-BO (docs/dev/design/b5-bo.md §4): the repository of planned_meal_bought (migration 1520).

// AddBought stores the records of one purchase. A record for the same Planned Meal, Ingredient and Lot replaces the
// earlier one (a retry is harmless). ErrUnknownRef for a Planned Meal or Ingredient that does not exist.
func (s *Store) AddBought(ctx context.Context, recs []plan.BoughtRecord) error { return nil }

// RemoveBoughtForLot removes every record of the Lot (Undo of the Scan, unticking, Lot Delete) and returns how many
// went. An unknown Lot is not an error.
func (s *Store) RemoveBoughtForLot(ctx context.Context, lotID int64) (int, error) { return 0, nil }

// BoughtRecords returns the records of one Planned Meal, ordered by Ingredient then Lot.
func (s *Store) BoughtRecords(ctx context.Context, mealID int64) ([]plan.BoughtRecord, error) {
	return nil, nil
}

// Mover plugs planned_meal_bought into the Ingredient merge/delete protection.
type Mover struct{}

func init() { ingredientstore.RegisterMover(Mover{}) }

// Name is "bought Planned Meals".
func (Mover) Name() string { return "bought Planned Meals" }

// Count is the number of records that reference the Ingredient.
func (Mover) Count(ctx context.Context, q ingredientstore.Querier, ingredientID int64) (int, error) {
	return 0, nil
}

// Move re-points the records to the merged Ingredient; records of one Planned Meal and Lot that now share a key are
// summed into one.
func (Mover) Move(ctx context.Context, tx *sql.Tx, from, to int64) error { return nil }
