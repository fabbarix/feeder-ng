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

// WithBaseRecipes wires the port. Without it no Ingredient belongs to a Base recipe and the guards below do nothing.
func WithBaseRecipes(b BaseRecipes) Option { return func(s *Store) { s.baseRecipes = b } }

// BaseRecipeKey is the name key of the Base recipe's Ingredient.
func BaseRecipeKey(recipeID int64) string { return fmt.Sprintf("base-recipe:%d", recipeID) }

var errNotImplemented = errors.New("BR-B: not implemented")

// CreateBaseRecipeTx creates the Ingredient of Base recipe recipeID in tx, keyed BaseRecipeKey(recipeID) whatever the
// name, even when a plain Ingredient has the name. The Input is validated as for Create (name, Base Unit, ...).
func (s *Store) CreateBaseRecipeTx(ctx context.Context, tx *sql.Tx, recipeID int64, in ingredient.Input) (ingredient.Ingredient, error) {
	return ingredient.Ingredient{}, errNotImplemented
}

// AdoptBaseRecipeTx makes the plain Ingredient the Base recipe's (the take-over, §3.2): it is re-keyed to
// BaseRecipeKey(recipeID); its name, Stock, Products, Exclusions, lines and Unit Conversions stay. ErrNotFound.
func (s *Store) AdoptBaseRecipeTx(ctx context.Context, tx *sql.Tx, ingredientID, recipeID int64) error {
	return errNotImplemented
}

// ReleaseBaseRecipeTx gives a Base recipe's Ingredient the plain key of its name again (to-plannable, §3.6).
// ErrNameTaken when a plain Ingredient holds the key.
func (s *Store) ReleaseBaseRecipeTx(ctx context.Context, tx *sql.Tx, ingredientID int64) error {
	return errNotImplemented
}

// RenameBaseRecipeTx renames a Base recipe's Ingredient (the Base recipe was renamed). The name key is untouched
// (it is the Base recipe's id), so there is no collision with a plain Ingredient of the new name.
func (s *Store) RenameBaseRecipeTx(ctx context.Context, tx *sql.Tx, ingredientID int64, name string) error {
	return errNotImplemented
}

// MergeTx is Merge inside the caller's transaction (nothing is committed here); the recipe store uses it for the
// rename take-over, after it re-pointed base_ingredient_id, so the 'cannot be merged away' guard does not apply.
// The target keeps its name and id; every ReferenceMover moves the source's references.
func (s *Store) MergeTx(ctx context.Context, tx *sql.Tx, sourceID, targetID int64, res ingredient.Resolution) error {
	return errNotImplemented
}
