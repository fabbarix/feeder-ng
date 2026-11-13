package store

// The Ingredient side of Base recipes (ADR 0015, docs/dev/design/base-recipes.md §3.2): a Base recipe's Ingredient is
// keyed by its Base recipe (`ingredients.name_key = base-recipe:<recipe id>`), never by its name, so a plain
// Ingredient of the same name may exist beside it. This store does not read Recipe tables: the guards ask a
// BaseRecipes port wired at mount (the ADR 0010 TagExists pattern).

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// ErrBaseRecipeIngredient: the Ingredient belongs to a Base recipe, so it cannot be renamed here, merged away or
// have its `batch` Unit Conversion edited (409 base_recipe_ingredient: "Rename the Base recipe instead").
var ErrBaseRecipeIngredient = errors.New("this Ingredient belongs to a Base recipe")

// ErrBaseRecipeCycle is matched (errors.Is) by *CycleError.
var ErrBaseRecipeCycle = errors.New("base recipe cycle")

// CycleError: merging another Ingredient into a Base recipe's Ingredient would make a Base recipe call for itself
// (422 base_recipe_cycle). Path holds the Recipe names, closed.
type CycleError struct{ Path []string }

func (e *CycleError) Error() string        { return "base recipe cycle: " + strings.Join(e.Path, " -> ") }
func (e *CycleError) Is(target error) bool { return target == ErrBaseRecipeCycle }

// BaseRecipeRef is the Base recipe an Ingredient belongs to.
type BaseRecipeRef struct {
	ID       int64
	Name     string
	Archived bool
}

// BaseRecipes is the port to the Recipe store.
type BaseRecipes interface {
	// BaseRecipeOf returns the Base recipe whose Ingredient this is; nil when it is not one's.
	BaseRecipeOf(ctx context.Context, q Querier, ingredientID int64) (*BaseRecipeRef, error)
	// MergeCycle returns the cycle (Recipe names, closed) that merging sourceID into targetID, a Base recipe's
	// Ingredient, would make (the source's lines become Base recipe lines); nil when there is none.
	MergeCycle(ctx context.Context, q Querier, sourceID, targetID int64) ([]string, error)
}

// mergeObserver is implemented by a BaseRecipes port that also refreshes what a merge changed (the recipe store
// rewrites the cached total time of the Recipes calling the target's Base recipe). Optional.
type mergeObserver interface {
	AfterMerge(ctx context.Context, tx *sql.Tx, targetID int64) error
}

// BaseRecipeRefName is the name of the ReferenceMover that counts the Recipes whose base_ingredient_id is an
// Ingredient (recipe/store). A Base recipe's own Ingredient is referenced by it, which does not stop its Yield from
// changing family (BaseUnitTx), only Stock, Products and lines do.
const BaseRecipeRefName = "base recipes"

// WithBaseRecipes wires the port. Without it no Ingredient belongs to a Base recipe and the guards below do nothing.
func WithBaseRecipes(b BaseRecipes) Option { return func(s *Store) { s.baseRecipes = b } }

// BaseRecipeKey is the name key of the Base recipe's Ingredient.
func BaseRecipeKey(recipeID int64) string { return fmt.Sprintf("base-recipe:%d", recipeID) }

// baseOf is the Base recipe the Ingredient belongs to, nil when none (or no port is wired).
func (s *Store) baseOf(ctx context.Context, q Querier, id int64) (*BaseRecipeRef, error) {
	if s.baseRecipes == nil {
		return nil, nil
	}
	return s.baseRecipes.BaseRecipeOf(ctx, q, id)
}

// BaseRecipeOf returns the Base recipe whose Ingredient id is, nil for a plain Ingredient.
func (s *Store) BaseRecipeOf(ctx context.Context, id int64) (*BaseRecipeRef, error) {
	return s.baseOf(ctx, s.db, id)
}

// isBatchUnit reports the Unit Conversions the Base recipe sets and the User may not edit (§3.2).
func isBatchUnit(unit string) bool {
	switch units.NormalizeUnit(unit) {
	case "batch", "portion":
		return true
	}
	return false
}

// CreateBaseRecipeTx creates the Ingredient of Base recipe recipeID in tx, keyed BaseRecipeKey(recipeID) whatever the
// name, even when a plain Ingredient has the name. The Input is validated as for Create (name, Base Unit, ...).
func (s *Store) CreateBaseRecipeTx(ctx context.Context, tx *sql.Tx, recipeID int64, in ingredient.Input) (ingredient.Ingredient, error) {
	clean, err := in.Validate()
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	now := s.now()
	res, err := tx.ExecContext(ctx,
		`INSERT INTO ingredients (name, name_key, base_unit, shelf_life_days, frozen_shelf_life_days, image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		clean.Name, BaseRecipeKey(recipeID), string(clean.Base), nullDays(clean.ShelfLifeDays), nullDays(clean.FrozenShelfLifeDays), clean.Image, now, now)
	if err != nil {
		return ingredient.Ingredient{}, mapNameErr(err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	if err := insertConversions(ctx, tx, id, clean.Conversions); err != nil {
		return ingredient.Ingredient{}, err
	}
	return loadOne(ctx, tx, id)
}

// AdoptBaseRecipeTx makes the plain Ingredient the Base recipe's (the take-over, §3.2): it is re-keyed to
// BaseRecipeKey(recipeID); its name, Stock, Products, Exclusions, lines and Unit Conversions stay. ErrNotFound.
func (s *Store) AdoptBaseRecipeTx(ctx context.Context, tx *sql.Tx, ingredientID, recipeID int64) error {
	res, err := tx.ExecContext(ctx, `UPDATE ingredients SET name_key = ?, updated_at = ? WHERE id = ?`,
		BaseRecipeKey(recipeID), s.now(), ingredientID)
	if err != nil {
		return mapNameErr(err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ReleaseBaseRecipeTx gives a Base recipe's Ingredient the plain key of its name again (to-plannable, §3.6). ErrNameTaken
// when a plain Ingredient holds the key; the key is then left alone.
func (s *Store) ReleaseBaseRecipeTx(ctx context.Context, tx *sql.Tx, ingredientID int64) error {
	cur, err := loadOne(ctx, tx, ingredientID)
	if err != nil {
		return err
	}
	key := units.NormalizeName(cur.Name)
	if err := checkNameFree(ctx, tx, key, ingredientID); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE ingredients SET name_key = ?, updated_at = ? WHERE id = ?`, key, s.now(), ingredientID)
	return err
}

// RenameBaseRecipeTx renames a Base recipe's Ingredient (the Base recipe was renamed). The name key is untouched
// (it is the Base recipe's id), so there is no collision with a plain Ingredient of the new name.
func (s *Store) RenameBaseRecipeTx(ctx context.Context, tx *sql.Tx, ingredientID int64, name string) error {
	cur, err := loadOne(ctx, tx, ingredientID)
	if err != nil {
		return err
	}
	clean, err := ingredient.Input{Name: name, Base: cur.Base}.Validate()
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE ingredients SET name = ?, updated_at = ? WHERE id = ?`, clean.Name, s.now(), ingredientID)
	return err
}

// BaseUnitTx changes the Base Unit of an Ingredient inside tx (a Base recipe's Yield changed family, §3.2). It is refused
// with ErrInUse while the Ingredient has Stock, Products or lines; the Base recipe's own reference does not count.
func (s *Store) BaseUnitTx(ctx context.Context, tx *sql.Tx, id int64, base units.Base) error {
	cur, err := loadOne(ctx, tx, id)
	if err != nil {
		return err
	}
	if cur.Base == base {
		return nil
	}
	refs, err := s.refCounts(ctx, tx, id)
	if err != nil {
		return err
	}
	delete(refs, BaseRecipeRefName)
	// Stock and Products are counted here as well: their stores may not be registered as movers in every build.
	for _, q := range []string{`SELECT count(*) FROM stock_lots WHERE ingredient_id = ?`, `SELECT count(*) FROM products WHERE ingredient_id = ?`} {
		var n int
		if err := tx.QueryRowContext(ctx, q, id).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			return ErrInUse
		}
	}
	if total(refs) > 0 {
		return ErrInUse
	}
	_, err = tx.ExecContext(ctx, `UPDATE ingredients SET base_unit = ?, updated_at = ? WHERE id = ?`, string(base), s.now(), id)
	return err
}

// RemoveConversionTx removes the Unit Conversion for unit inside tx, without the guards of RemoveConversion (idempotent).
func (s *Store) RemoveConversionTx(ctx context.Context, tx *sql.Tx, id int64, unit string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM ingredient_conversions WHERE ingredient_id = ? AND unit = ?`, id, units.NormalizeUnit(unit)); err != nil {
		return err
	}
	return touch(ctx, tx, id, s.now())
}

// MergeTx is Merge inside the caller's transaction (nothing is committed here); the recipe store uses it for the
// rename take-over, after it re-pointed base_ingredient_id, so the 'cannot be merged away' guard does not apply.
// The target keeps its name and id; every ReferenceMover moves the source's references.
func (s *Store) MergeTx(ctx context.Context, tx *sql.Tx, sourceID, targetID int64, res ingredient.Resolution) error {
	_, err := s.mergeTx(ctx, tx, sourceID, targetID, res)
	return err
}

// mergeTx is MergeTx; it also returns the picture the caller must drop after the commit.
func (s *Store) mergeTx(ctx context.Context, tx *sql.Tx, sourceID, targetID int64, res ingredient.Resolution) (dropped string, err error) {
	if sourceID == targetID {
		return "", ErrMergeSelf
	}
	src, err := loadOne(ctx, tx, sourceID)
	if err != nil {
		return "", err
	}
	tgt, err := loadOne(ctx, tx, targetID)
	if err != nil {
		return "", err
	}
	if ref, err := s.baseOf(ctx, tx, sourceID); err != nil {
		return "", err
	} else if ref != nil {
		return "", ErrBaseRecipeIngredient
	}
	if ref, err := s.baseOf(ctx, tx, targetID); err != nil {
		return "", err
	} else if ref != nil && s.baseRecipes != nil {
		path, err := s.baseRecipes.MergeCycle(ctx, tx, sourceID, targetID)
		if err != nil {
			return "", err
		}
		if path != nil {
			return "", &CycleError{Path: path}
		}
	}
	merged, err := ingredient.PlanMerge(src, tgt).Apply(res)
	if err != nil {
		return "", err
	}
	// The target keeps its own picture; without one it adopts the source's.
	image, dropped := tgt.Image, src.Image
	if image == "" {
		image, dropped = src.Image, ""
	}
	// Likewise the frozen Shelf Life: the target's, or the source's when the target has none.
	frozen := tgt.FrozenShelfLifeDays
	if frozen == nil {
		frozen = src.FrozenShelfLifeDays
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE ingredients SET shelf_life_days = ?, frozen_shelf_life_days = ?, image = ?, updated_at = ? WHERE id = ?`,
		nullDays(merged.ShelfLifeDays), nullDays(frozen), image, s.now(), targetID); err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM ingredient_conversions WHERE ingredient_id = ?`, targetID); err != nil {
		return "", err
	}
	if err := insertConversions(ctx, tx, targetID, merged.Conversions); err != nil {
		return "", err
	}
	for _, m := range s.movers.All() {
		if err := m.Move(ctx, tx, sourceID, targetID); err != nil {
			return "", err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM ingredients WHERE id = ?`, sourceID); err != nil {
		return "", err
	}
	if o, ok := s.baseRecipes.(mergeObserver); ok {
		if err := o.AfterMerge(ctx, tx, targetID); err != nil {
			return "", err
		}
	}
	return dropped, nil
}

// deleteTx removes the Ingredient inside tx: ErrInUse while anything references it or a Base recipe owns it. It
// returns the picture the caller drops after the commit.
func (s *Store) deleteTx(ctx context.Context, tx *sql.Tx, id int64) (string, error) {
	cur, err := loadOne(ctx, tx, id)
	if err != nil {
		return "", err
	}
	if ref, err := s.baseOf(ctx, tx, id); err != nil {
		return "", err
	} else if ref != nil {
		return "", ErrInUse
	}
	refs, err := s.refCounts(ctx, tx, id)
	if err != nil {
		return "", err
	}
	if total(refs) > 0 {
		return "", ErrInUse
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM ingredients WHERE id = ?`, id); err != nil {
		return "", err
	}
	return cur.Image, nil
}

// keyOf is the stored name key of an Ingredient.
func keyOf(ctx context.Context, q Querier, id int64) (string, error) {
	var k string
	err := q.QueryRowContext(ctx, `SELECT name_key FROM ingredients WHERE id = ?`, id).Scan(&k)
	if err != nil {
		return "", err
	}
	return k, nil
}
