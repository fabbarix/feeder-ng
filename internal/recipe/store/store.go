// Package store is the SQL repository for Recipes, Tags and Member
// preferences. Quantities are stored as typed (quantity + unit); validation uses
// internal/recipe with Ingredients supplied by an IngredientSource.
package store

import (
	"context"
	"database/sql"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// Errors.
var (
	ErrNotFound       = errors.New("recipe not found")
	ErrAlreadyPlanned = errors.New("recipe was planned; archive it instead")
	ErrNoMember       = errors.New("user has no linked member") // MemberForUser
	ErrUnknownMember  = errors.New("member not found")
)

// IngredientSource gives the store the Ingredients (with Unit Conversions) a
// Recipe refers to. The httpapi module adapts the ingredient store (T2).
type IngredientSource interface {
	// Units returns the Ingredient; ok=false when there is none with that id.
	Units(ctx context.Context, id int64) (ing units.Ingredient, ok bool, err error)
}

// Store is the Recipe repository.
type Store struct{}

// New returns a Store. images may be nil in tests that never touch images.
func New(d *sql.DB, clk clock.Clock, src IngredientSource) *Store { panic("TODO") }

// Create validates (recipe.Input.Validate, with the Ingredients of the lines and
// Step uses looked up via the IngredientSource) and stores a new Recipe with
// its Tags (created on use). Returns the stored Recipe with Timing filled in.
// Errors: *recipe.ValidationError, *recipe.UnknownUnitError.
func (s *Store) Create(ctx context.Context, in recipe.Input) (recipe.Recipe, error) {
	panic("TODO")
}

// Get returns the Recipe; ErrNotFound.
func (s *Store) Get(ctx context.Context, id int64) (recipe.Recipe, error) { panic("TODO") }

// Update replaces every field, line and Step (PUT semantics), keeping id,
// archived flag and created_at. Same errors as Create, plus ErrNotFound.
func (s *Store) Update(ctx context.Context, id int64, in recipe.Input) (recipe.Recipe, error) {
	panic("TODO")
}

// ListFilter selects Recipes. Archived: "" or "no" = active only, "yes" = archived only, "all".
type ListFilter struct {
	Archived string
	Tag      string // TagKey match; "" = any
	Query    string // case-insensitive substring of the name; "" = any
}

// List returns Summaries ordered by name (case-insensitive), then id.
func (s *Store) List(ctx context.Context, f ListFilter) ([]recipe.Summary, error) {
	panic("TODO")
}

// SetArchived archives or restores a Recipe (idempotent). Archived Recipes keep
// their history and preferences.
func (s *Store) SetArchived(ctx context.Context, id int64, archived bool) (recipe.Recipe, error) {
	panic("TODO")
}

// Delete hard-deletes a Recipe, its lines, Steps and preferences. It asks every
// registered PlannedChecker first and returns ErrAlreadyPlanned if any says the
// Recipe was ever planned. ErrNotFound.
func (s *Store) Delete(ctx context.Context, id int64) error { panic("TODO") }

// TagCount is a Tag and the number of (active and archived) Recipes using it.
type TagCount struct {
	Name    string
	Recipes int
}

// Tags returns every Tag ordered by name; Tags stay when no Recipe uses them.
func (s *Store) Tags(ctx context.Context) ([]TagCount, error) { panic("TODO") }

// Preferences are one Member's Favourites, Dislikes and Exclusions.
type Preferences struct {
	Recipes             map[int64]recipe.State // only non-none
	ExcludedIngredients []int64                // ascending
}

// SetRecipeState sets the Member's single state for the Recipe; StateNone clears.
// ErrNotFound (recipe), ErrUnknownMember.
func (s *Store) SetRecipeState(ctx context.Context, memberID, recipeID int64, st recipe.State) error {
	panic("TODO")
}

// SetIngredientExclusion adds or removes the Member's Exclusion of an Ingredient
// (idempotent). ErrUnknownMember; an unknown Ingredient is ErrNotFound.
func (s *Store) SetIngredientExclusion(ctx context.Context, memberID, ingredientID int64, excluded bool) error {
	panic("TODO")
}

// Preferences returns the Member's preferences; ErrUnknownMember.
func (s *Store) Preferences(ctx context.Context, memberID int64) (Preferences, error) {
	panic("TODO")
}

// MemberForUser returns the id of the Member linked to the User (members.user_id);
// ErrNoMember when none is linked.
func (s *Store) MemberForUser(ctx context.Context, userID int64) (int64, error) { panic("TODO") }
