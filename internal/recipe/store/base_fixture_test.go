package store_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// BR-B (ADR 0015, docs/dev/design/base-recipes.md §16): the fixture of the Base recipe store tests. The Store is
// wired as the app wires it: the Ingredient store has the Base recipe port over the Recipe tables, the Recipe store
// has the Ingredient store and the Ready Meal adapter. Today is 2026-11-09.

type bf struct {
	*fixture
	ings *ingstore.Store
}

// readyAdapter is the Ready Meal port over the ingredient store (the httpapi adapter's shape).
type readyAdapter struct{ s *ingstore.Store }

func (r readyAdapter) Candidates(ctx context.Context) ([]recipe.ReadyMealCandidate, error) {
	list, err := r.s.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]recipe.ReadyMealCandidate, 0, len(list))
	for _, i := range list {
		out = append(out, recipe.ReadyMealCandidate{ID: i.ID, Name: i.Name, Base: i.Base})
	}
	return out, nil
}

func (r readyAdapter) CreatePieceTx(ctx context.Context, tx *sql.Tx, name string) (int64, error) {
	i, err := r.s.CreateTx(ctx, tx, ingredient.Input{Name: name, Base: units.Piece})
	if err != nil {
		return 0, err
	}
	return i.ID, nil
}

func newBaseFixture(t *testing.T) *bf {
	t.Helper()
	f := newFixture(t)
	ings := ingstore.New(f.db, f.clk, ingstore.WithBaseRecipes(store.NewBaseRecipePort(f.db)))
	f.s = store.New(f.db, f.clk, ingredients{f.db}).WithIngredients(ings).WithReadyMeal(readyAdapter{ings})
	return &bf{fixture: f, ings: ings}
}

func yes() *bool { b := true; return &b }
func no() *bool  { b := false; return &b }

// fixed Ingredients: milk (ml), butter, flour (g).
func (f *bf) basics(t *testing.T) (milk, butter, flour int64) {
	t.Helper()
	return f.ingredient(t, "milk", units.Millilitre), f.ingredient(t, "butter", units.Gram), f.ingredient(t, "flour", units.Gram)
}

func ln(ing int64, q float64, unit string) recipe.Line {
	return recipe.Line{IngredientID: ing, Quantity: q, Unit: unit}
}

func callFor(base recipe.Recipe, q float64, unit string) recipe.Line {
	return recipe.Line{BaseRecipeID: base.ID, Quantity: q, Unit: unit}
}

// baseIn is the Input of a Base recipe.
func baseIn(name string, yield float64, unit string, lines ...recipe.Line) recipe.Input {
	return recipe.Input{Name: name, Yield: yield, YieldUnit: unit, BaseRecipe: yes(), Lines: lines}
}

func plainIn(name string, lines ...recipe.Line) recipe.Input {
	return recipe.Input{Name: name, Yield: 4, Lines: lines}
}

func (f *bf) createBase(t *testing.T, in recipe.Input) recipe.Recipe {
	t.Helper()
	r, err := f.s.Create(ctx, in)
	if err != nil {
		t.Fatalf("Create base recipe %q: %v", in.Name, err)
	}
	if !r.IsBase() || r.BaseIngredientID == 0 {
		t.Fatalf("Create %q = base %v ingredient %d, want a Base recipe with its Ingredient", in.Name, r.IsBase(), r.BaseIngredientID)
	}
	return r
}

func (f *bf) createPlain(t *testing.T, in recipe.Input) recipe.Recipe {
	t.Helper()
	r, err := f.s.Create(ctx, in)
	if err != nil {
		t.Fatalf("Create %q: %v", in.Name, err)
	}
	return r
}

func (f *bf) nameKey(t *testing.T, id int64) string {
	t.Helper()
	var k string
	if err := f.db.QueryRow(`SELECT name_key FROM ingredients WHERE id = ?`, id).Scan(&k); err != nil {
		t.Fatal(err)
	}
	return k
}

func (f *bf) conversion(t *testing.T, id int64, unit string) (float64, bool) {
	t.Helper()
	var v float64
	err := f.db.QueryRow(`SELECT to_base FROM ingredient_conversions WHERE ingredient_id = ? AND unit = ?`, id, unit).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false
	}
	if err != nil {
		t.Fatal(err)
	}
	return v, true
}

func (f *bf) lot(t *testing.T, ingredientID int64, qty float64) int64 {
	t.Helper()
	return f.exec(t, `INSERT INTO stock_lots(ingredient_id, quantity, purchased, source, created_at) VALUES (?,?,?,?,?)`,
		ingredientID, qty, "2026-11-01", "manual", "2026-11-01T00:00:00Z")
}

func (f *bf) lotsOf(t *testing.T, ingredientID int64) int {
	t.Helper()
	var n int
	if err := f.db.QueryRow(`SELECT count(*) FROM stock_lots WHERE ingredient_id = ?`, ingredientID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func (f *bf) lineIngredient(t *testing.T, lineID int64) (ing int64, linkedFrom sql.NullInt64) {
	t.Helper()
	if err := f.db.QueryRow(`SELECT ingredient_id, linked_from_ingredient_id FROM recipe_lines WHERE id = ?`, lineID).Scan(&ing, &linkedFrom); err != nil {
		t.Fatal(err)
	}
	return ing, linkedFrom
}

func (f *bf) recipeCount(t *testing.T) int { return f.count(t, "recipes") }

func wantValidation(t *testing.T, err error, field, code string) {
	t.Helper()
	var ve *recipe.ValidationError
	if !errors.As(err, &ve) || ve.Field != field || ve.Code != code {
		t.Fatalf("err = %v, want a ValidationError on %q with code %q", err, field, code)
	}
}

func refNames(refs []recipe.Ref) []string {
	out := []string{}
	for _, r := range refs {
		out = append(out, r.Name)
	}
	return out
}

func joinPath(p []string) string {
	out := ""
	for i, s := range p {
		if i > 0 {
			out += " > "
		}
		out += s
	}
	return out
}

func containsID(ids []int64, id int64) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

func ingInput(name string, base units.Base) ingredient.Input {
	return ingredient.Input{Name: name, Base: base}
}

func store_ListFilter(kind, archived string) store.ListFilter {
	return store.ListFilter{Kind: kind, Archived: archived}
}

var storeErrNotFound = store.ErrNotFound

func newPort(f *bf) ingstore.BaseRecipes { return store.NewBaseRecipePort(f.db) }

func ingredientResolution() ingredient.Resolution { return ingredient.Resolution{} }

func store_ListFilterFor(kind string, forID int64) store.ListFilter {
	return store.ListFilter{Kind: kind, For: forID}
}
