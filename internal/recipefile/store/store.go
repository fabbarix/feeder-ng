// Package store reads what Import Review matches against and writes a
// recipefile.Commit in ONE SQL transaction.
package store

import (
	"context"
	"database/sql"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// ErrStale: something the Commit relies on changed since the review (a Recipe
// to replace or an Ingredient to use is gone, a name was taken). Nothing was written.
var ErrStale = errors.New("the data changed since the review; review again")

// Store is the Import Review repository.
type Store struct{}

// New returns a Store.
func New(d *sql.DB, clk clock.Clock, images *imaging.Store) *Store { panic("not implemented") }

// Existing loads every Ingredient (with Unit Conversions) and every Recipe id
// and name (archived ones too).
func (s *Store) Existing(ctx context.Context) (recipefile.Existing, error) { panic("not implemented") }

// Exportable loads the Recipes (all, or those with the given ids) and the
// definitions of every Ingredient they use. An unknown id is ErrNotFound.
func (s *Store) Exportable(ctx context.Context, ids []int64) (recipefile.ExportInput, error) {
	panic("not implemented")
}

// ErrNotFound: an id asked for in Exportable does not exist.
var ErrNotFound = errors.New("recipe not found")

// Result says what Apply did.
type Result struct {
	Recipes            []AppliedRecipe
	IngredientsCreated int
	ConversionsAdded   int
}

// AppliedRecipe is one written Recipe.
type AppliedRecipe struct {
	Index  int
	ID     int64
	Name   string
	Action string // "created" or "replaced"
}

// Apply writes the Commit in one transaction: new Ingredients, added
// Conversions, then Recipes (create or replace, validated again through
// recipe.Input.Validate against the just-written Ingredients). Images are saved
// to the image store before the transaction commits; on any error the
// transaction is rolled back AND the files saved so far are deleted, so
// nothing is half-imported. ErrStale when a precondition no longer holds.
// Replaced Recipes keep their id, archive flag and Member preferences.
func (s *Store) Apply(ctx context.Context, c recipefile.Commit) (Result, error) {
	panic("not implemented")
}
