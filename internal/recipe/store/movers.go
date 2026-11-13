package store

import (
	"context"
	"database/sql"

	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// The Recipe tables hold Ingredient ids, so they register with the ingredient
// store: deleting or merging an Ingredient re-points or vetoes these rows.
func init() {
	ingstore.RegisterMover(recipeLinesMover{})
	ingstore.RegisterMover(ingredientExclusionsMover{})
	ingstore.RegisterMover(baseRecipesMover{})
}

// recipeLinesMover covers ingredient lines and Step uses. It is also a
// UnitGuard: a unit written on a line or a use keeps its Unit Conversion.
type recipeLinesMover struct{}

func (recipeLinesMover) Name() string { return "recipe lines" }

func (recipeLinesMover) Count(ctx context.Context, q ingstore.Querier, ingredientID int64) (int, error) {
	var n int
	err := q.QueryRowContext(ctx, `SELECT (SELECT count(*) FROM recipe_lines WHERE ingredient_id = ?)
	        + (SELECT count(*) FROM recipe_step_uses WHERE ingredient_id = ?)`, ingredientID, ingredientID).Scan(&n)
	return n, err
}

func (recipeLinesMover) Move(ctx context.Context, tx *sql.Tx, from, to int64) error {
	// A remembered plain Ingredient (linked_from_ingredient_id, §3.7) is rewritten too, not counted as a reference.
	for _, q := range []string{
		`UPDATE recipe_lines SET ingredient_id = ? WHERE ingredient_id = ?`,
		`UPDATE recipe_step_uses SET ingredient_id = ? WHERE ingredient_id = ?`,
		`UPDATE recipe_lines SET linked_from_ingredient_id = ? WHERE linked_from_ingredient_id = ?`,
	} {
		if _, err := tx.ExecContext(ctx, q, to, from); err != nil {
			return err
		}
	}
	return nil
}

func (recipeLinesMover) UnitInUse(ctx context.Context, q ingstore.Querier, ingredientID int64, unit string) (bool, error) {
	u := units.NormalizeUnit(unit)
	var used bool
	err := q.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM recipe_lines WHERE ingredient_id = ? AND unit = ?)
	        OR EXISTS (SELECT 1 FROM recipe_step_uses WHERE ingredient_id = ? AND unit = ?)`,
		ingredientID, u, ingredientID, u).Scan(&used)
	return used, err
}

// ingredientExclusionsMover re-points Members' Ingredient Exclusions; a Member
// who already excludes the target keeps one row.
type ingredientExclusionsMover struct{}

func (ingredientExclusionsMover) Name() string { return "ingredient exclusions" }

func (ingredientExclusionsMover) Count(ctx context.Context, q ingstore.Querier, ingredientID int64) (int, error) {
	var n int
	err := q.QueryRowContext(ctx, `SELECT count(*) FROM member_ingredient_exclusions WHERE ingredient_id = ?`, ingredientID).Scan(&n)
	return n, err
}

func (ingredientExclusionsMover) Move(ctx context.Context, tx *sql.Tx, from, to int64) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM member_ingredient_exclusions WHERE ingredient_id = ?
	        AND member_id IN (SELECT member_id FROM member_ingredient_exclusions WHERE ingredient_id = ?)`, from, to); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `UPDATE member_ingredient_exclusions SET ingredient_id = ? WHERE ingredient_id = ?`, to, from)
	return err
}

// baseRecipesMover counts the Recipes whose Base recipe Ingredient this is (recipes.base_ingredient_id, ADR 0015).
// The ingredient store's Base Unit guard does not count it (ingstore.BaseRecipeRefName); the delete guard and the
// port do.
type baseRecipesMover struct{}

func (baseRecipesMover) Name() string { return ingstore.BaseRecipeRefName }

func (baseRecipesMover) Count(ctx context.Context, q ingstore.Querier, ingredientID int64) (int, error) {
	var n int
	err := q.QueryRowContext(ctx, `SELECT count(*) FROM recipes WHERE base_ingredient_id = ?`, ingredientID).Scan(&n)
	return n, err
}

func (baseRecipesMover) Move(ctx context.Context, tx *sql.Tx, from, to int64) error {
	_, err := tx.ExecContext(ctx, `UPDATE recipes SET base_ingredient_id = ? WHERE base_ingredient_id = ?`, to, from)
	return err
}
