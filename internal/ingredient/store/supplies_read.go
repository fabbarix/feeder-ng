package store

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
)

// RestockSupplies returns the Supplies that have a Restock level (H4, ADR 0017 decision 6), ordered by name. The
// Conversions are not loaded: the Shopping List needs only the name, the Base Unit and the level.
func (s *Store) RestockSupplies(ctx context.Context) ([]ingredient.Ingredient, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+ingredientColumns+` FROM ingredients
		WHERE kind = 'supply' AND restock_level IS NOT NULL ORDER BY name_key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ingredient.Ingredient
	for rows.Next() {
		i, err := scanIngredient(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

// KindOf is the kind of the Ingredient id (food when the row says nothing), or ErrNotFound.
func KindOf(ctx context.Context, q Querier, id int64) (ingredient.Kind, error) {
	ing, err := loadOne(ctx, q, id)
	if err != nil {
		return "", err
	}
	return ing.Kind, nil
}

// Kinds maps every Ingredient id to its kind (food or supply).
func Kinds(ctx context.Context, q Querier) (map[int64]ingredient.Kind, error) {
	rows, err := q.QueryContext(ctx, `SELECT id, kind FROM ingredients`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]ingredient.Kind{}
	for rows.Next() {
		var id int64
		var k string
		if err := rows.Scan(&id, &k); err != nil {
			return nil, err
		}
		out[id] = normKind(ingredient.Kind(k))
	}
	return out, rows.Err()
}
