// Package store is the SQL repository for Ingredients, plus the registry through
// which other features' stores move their Ingredient references on merge.
package store

import (
	"context"
	"database/sql"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/units"
)

var (
	ErrNotFound  = errors.New("ingredient not found")
	ErrNameTaken = errors.New("an Ingredient with that name already exists")
	// ErrInUse: delete, Base Unit change, or removing a Unit Conversion that other features still reference.
	ErrInUse = errors.New("ingredient is in use")
	// ErrMergeSelf: merging an Ingredient into itself.
	ErrMergeSelf = errors.New("cannot merge an Ingredient into itself")
)

// Store reads and writes Ingredients. Methods return ingredient.ErrInvalid-matching
// *ingredient.ValidationError for bad input.
type Store struct{}

// Option configures New.
type Option func(*Store)

// WithMovers makes the Store use r instead of the default registry (tests).
func WithMovers(r *Movers) Option { panic("TODO") }

// New returns a Store over db. Timestamps come from clk (created_at, updated_at; RFC 3339 UTC).
func New(db *sql.DB, clk clock.Clock, opts ...Option) *Store { panic("TODO") }

// Patch is a partial update. nil = leave unchanged. ShelfLife: nil = unchanged,
// &nil = clear it, &&n = set it (see ShelfLifePatch).
type Patch struct {
	Name      *string
	Base      *units.Base
	ShelfLife *ShelfLifePatch
}

// ShelfLifePatch distinguishes "set to n" (Days != nil) from "clear" (Days == nil).
type ShelfLifePatch struct{ Days *int }

// Create validates in and inserts. ErrNameTaken when the normalised name exists.
func (s *Store) Create(ctx context.Context, in ingredient.Input) (ingredient.Ingredient, error) {
	panic("TODO")
}

// Get returns the Ingredient with its Conversions, or ErrNotFound.
func (s *Store) Get(ctx context.Context, id int64) (ingredient.Ingredient, error) { panic("TODO") }

// ByName finds by normalised name; ErrNotFound if none.
func (s *Store) ByName(ctx context.Context, name string) (ingredient.Ingredient, error) {
	panic("TODO")
}

// List returns all Ingredients ordered by normalised name, with Conversions.
func (s *Store) List(ctx context.Context) ([]ingredient.Ingredient, error) { panic("TODO") }

// Search runs ingredient.Search over every Ingredient and resolves the hits to full Ingredients.
func (s *Store) Search(ctx context.Context, query string, limit int) (SearchResult, error) {
	panic("TODO")
}

// SearchResult is ingredient.Result with the full Ingredients.
type SearchResult struct {
	Exact       *ingredient.Ingredient
	Suggestions []Suggested
}

// Suggested is a fuzzy hit.
type Suggested struct {
	Ingredient ingredient.Ingredient
	Score      float64
}

// Update applies p. Rename keeps the id (so all references stay). ErrNameTaken if the
// new name collides with another Ingredient; renaming to a different spelling of its
// own name (case, spacing) is fine. Changing the Base Unit while References > 0 is ErrInUse.
// Setting a Base Unit equal to an existing conversion's unit is invalid.
func (s *Store) Update(ctx context.Context, id int64, p Patch) (ingredient.Ingredient, error) {
	panic("TODO")
}

// SetConversion adds or replaces the Unit Conversion for unit (validated as in Input).
func (s *Store) SetConversion(ctx context.Context, id int64, c units.Conversion) (ingredient.Ingredient, error) {
	panic("TODO")
}

// RemoveConversion removes it (idempotent when absent). ErrInUse when any registered
// UnitGuard says the unit is still used by that Ingredient.
func (s *Store) RemoveConversion(ctx context.Context, id int64, unit string) (ingredient.Ingredient, error) {
	panic("TODO")
}

// Delete removes an unreferenced Ingredient (ErrInUse when References > 0).
func (s *Store) Delete(ctx context.Context, id int64) error { panic("TODO") }

// References returns per-mover reference counts (mover name -> count, only counts > 0).
func (s *Store) References(ctx context.Context, id int64) (map[string]int, error) { panic("TODO") }

// MergePreview compares source and target without changing anything.
// ErrNotFound if either is missing; ErrMergeSelf if the ids are equal.
func (s *Store) MergePreview(ctx context.Context, sourceID, targetID int64) (Preview, error) {
	panic("TODO")
}

// Preview is what the merge screen shows.
type Preview struct {
	Source, Target   ingredient.Ingredient
	Plan             ingredient.MergePlan
	SourceReferences map[string]int
	TargetReferences map[string]int
}

// Merge moves everything from source to target in ONE transaction: it applies the
// plan (ingredient.ErrBaseMismatch / *ingredient.UnresolvedError leave nothing changed),
// writes the combined Conversions and Shelf Life onto the target, calls every registered
// ReferenceMover.Move(from=source, to=target), then deletes the source. If any mover fails
// the whole merge is rolled back. The target keeps its name and id.
func (s *Store) Merge(ctx context.Context, sourceID, targetID int64, res ingredient.Resolution) (ingredient.Ingredient, error) {
	panic("TODO")
}
