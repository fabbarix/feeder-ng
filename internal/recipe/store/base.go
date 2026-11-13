package store

// Base recipes in the Recipe store (ADR 0015, docs/dev/design/base-recipes.md §3, §10, §12). BR-B stubs: every method
// below is a red-test target the developer fills in; none reads or writes anything yet.
//
// What Create, Update, Get, List, Delete, SetArchived, SetRecipeState and Preferences do for Base recipes is
// pinned by the tests; the methods here are the new entry points.

import (
	"context"
	"database/sql"
	"errors"

	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
)

var errNotImplemented = errors.New("BR-B: not implemented")

// WithIngredients wires the Ingredient store the Base recipe lifecycle uses (create, take over, rename, release,
// merge): the Store never writes `ingredients` itself. The ingredient store should have been built with
// ingstore.WithBaseRecipes(NewBaseRecipePort(db)), so its delete and merge guards see this Store's Base recipes.
func (s *Store) WithIngredients(is *ingstore.Store) *Store {
	s.ings = is
	return s
}

// NewBaseRecipePort is the ingredient store's port (ingstore.BaseRecipes) over the Recipe tables: which Base recipe an
// Ingredient belongs to, and the cycle a merge into a Base recipe's Ingredient would make (baserecipe.FindCycle).
func NewBaseRecipePort(d *sql.DB) ingstore.BaseRecipes { return basePort{d} }

type basePort struct{ db *sql.DB }

func (basePort) BaseRecipeOf(ctx context.Context, q ingstore.Querier, ingredientID int64) (*ingstore.BaseRecipeRef, error) {
	return nil, errNotImplemented
}

func (basePort) MergeCycle(ctx context.Context, q ingstore.Querier, sourceID, targetID int64) ([]string, error) {
	return nil, errNotImplemented
}

// ToBasePreview is the dry run of ToBase (§3.6): what the confirm names. Nothing changes. ErrNotFound;
// *recipe.ValidationError base_recipe_ready_meal for a Ready Meal and base_recipe_kind for a Base recipe.
func (s *Store) ToBasePreview(ctx context.Context, id int64) (recipe.ToBasePlan, error) {
	return recipe.ToBasePlan{}, errNotImplemented
}

// ToBase turns a plannable Recipe into a Base recipe in one transaction (§3.6): its unresolved Planned Meals from
// today on (Pinned and Bought included) and its Slot Rules go, Favourites and Dislikes on it go, Exclusions of it
// move to its Ingredient, Courses and the plannable-only fields are cleared, Cooked and Not cooked Planned Meals,
// past ones and Leftovers stay. Its Ingredient is created, or taken over after the ask of §3.2 (in.TakeOver; nil with
// a same-name plain Ingredient is a *recipe.TakeOverError). Errors: *recipe.ValidationError (yield, yieldUnit,
// base_recipe_ready_meal, base_recipe_kind, name rules), *recipe.CycleError never (a plannable Recipe has no
// Ingredient to be called for), ErrNotFound.
func (s *Store) ToBase(ctx context.Context, id int64, in recipe.ToBaseInput) (recipe.Recipe, error) {
	return recipe.Recipe{}, errNotImplemented
}

// ToPlannable turns a Base recipe back into a plannable Recipe (§3.6). *recipe.InUseError while any Recipe calls for
// it; its Ingredient stays as an ordinary Ingredient with its Stock and takes the plain key of its name again
// (*recipe.NameTakenError when a plain Ingredient holds it); Yield becomes portions; CourseIDs nil = the main Course.
func (s *Store) ToPlannable(ctx context.Context, id int64, in recipe.ToPlannableInput) (recipe.Recipe, error) {
	return recipe.Recipe{}, errNotImplemented
}

// LinkLine links a plain ingredient line to a Base recipe (§3.7): the line is re-pointed to the Base recipe's
// Ingredient (quantity, unit, optional and note carry over), the old Ingredient is remembered in the line's
// linked_from_ingredient_id, Needed at starts at the default. Exactly one of req.BaseRecipeID, req.Create or
// req.ConvertRecipeID (else CodeLinkInvalid). Errors: ErrNotFound (Recipe, line, Base recipe), CodeLineNotPlain,
// *recipe.CycleError, *recipe.UnknownUnitError on the Base recipe's Ingredient, the ToBase errors for ConvertRecipeID
// (all in one transaction: a failed link leaves the plannable Recipe plannable), and the take-over ask for Create.
func (s *Store) LinkLine(ctx context.Context, recipeID, lineID int64, req recipe.LinkRequest) (recipe.Recipe, error) {
	return recipe.Recipe{}, errNotImplemented
}

// UnlinkLine is Use as a plain Ingredient: the line is re-pointed to ingredientID, or to the remembered Ingredient when
// ingredientID is 0; quantity and unit carry over, Needed at and the memory are cleared. CodeLineNotBase;
// CodeIngredientRequired when ingredientID is 0 and nothing is remembered (take-over lines, or the Ingredient was
// deleted); ErrNotFound.
func (s *Store) UnlinkLine(ctx context.Context, recipeID, lineID, ingredientID int64) (recipe.Recipe, error) {
	return recipe.Recipe{}, errNotImplemented
}

// LinkCandidates lists the plain lines, on other Recipes (archived included), of an Ingredient whose name has the
// Base recipe's key (baserecipe.LinkCandidates), ordered by Recipe name then line position. Linkable false carries
// the Reason. ErrNotFound; CodeLineNotBase never; a plannable Recipe id is ErrNotFound.
func (s *Store) LinkCandidates(ctx context.Context, baseID int64) ([]recipe.LinkCandidate, error) {
	return nil, errNotImplemented
}

// Link re-points the ticked candidate lines to the Base recipe's Ingredient (§3.8), all or nothing in one
// transaction, cycle-checked as a whole. A line that is not a linkable candidate is a *recipe.ValidationError
// (field "lineIds", CodeNotACandidate) and nothing is linked. The result's MergeOffer lists the plain Ingredients the
// link left on no Recipe line (with their Stock Lots and Products).
func (s *Store) Link(ctx context.Context, baseID int64, lineIDs []int64) (recipe.LinkResult, error) {
	return recipe.LinkResult{}, errNotImplemented
}

// Unlink reverses a bulk link (the Toast's Undo): each line goes back to its remembered Ingredient, all or nothing
// (CodeLineNotBase for a line that does not call for this Base recipe).
func (s *Store) Unlink(ctx context.Context, baseID int64, lineIDs []int64) error {
	return errNotImplemented
}

// NeedTree is baserecipe.Expand over the stored Recipes: the need tree of one Batch of the Recipe, in Base Units.
// baserecipe.ErrNotFound; a cycle (data written before a check) is baserecipe.ErrCycle.
func (s *Store) NeedTree(ctx context.Context, id int64) ([]baserecipe.Need, error) {
	return nil, errNotImplemented
}

// Cook is baserecipe.ComposeSteps over the stored Recipes: the Recipe's Steps with its Base recipes' Steps in them,
// each carrying its Origin. made nil = nothing in Stock.
func (s *Store) Cook(ctx context.Context, id int64, made func(baserecipe.Path) float64) (baserecipe.Composed, error) {
	return baserecipe.Composed{}, errNotImplemented
}
