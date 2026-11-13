package store_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// BR-B (ADR 0015, docs/dev/design/base-recipes.md §3.2, §10, §16): the Ingredient side of Base recipes. The Base
// recipe port is a fake here; the recipe store implements it (recipe/store tests).

type fakeBase struct {
	of    map[int64]*store.BaseRecipeRef
	cycle []string
}

func (b *fakeBase) BaseRecipeOf(_ context.Context, _ store.Querier, id int64) (*store.BaseRecipeRef, error) {
	return b.of[id], nil
}
func (b *fakeBase) MergeCycle(_ context.Context, _ store.Querier, source, target int64) ([]string, error) {
	return b.cycle, nil
}

// baseFixture is a fixture whose Store has the Base recipe port.
func baseFixture(t *testing.T) (*fixture, *fakeBase) {
	t.Helper()
	f := newFixture(t)
	port := &fakeBase{of: map[int64]*store.BaseRecipeRef{}}
	movers := store.NewMovers()
	movers.Register(f.refs)
	f.store = store.New(f.db, clock.NewFake(f.clk.Now()), store.WithMovers(movers), store.WithBaseRecipes(port))
	return f, port
}

func (f *fixture) inTx(t *testing.T, fn func(tx *sql.Tx) error) error {
	t.Helper()
	tx, err := f.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

func (f *fixture) nameKey(t *testing.T, id int64) string {
	t.Helper()
	var k string
	if err := f.db.QueryRow(`SELECT name_key FROM ingredients WHERE id = ?`, id).Scan(&k); err != nil {
		t.Fatal(err)
	}
	return k
}

func (f *fixture) createBase(t *testing.T, recipeID int64, name string, base units.Base) ingredient.Ingredient {
	t.Helper()
	var got ingredient.Ingredient
	err := f.inTx(t, func(tx *sql.Tx) (err error) {
		got, err = f.store.CreateBaseRecipeTx(ctx, tx, recipeID, ingredient.Input{Name: name, Base: base})
		return err
	})
	if err != nil {
		t.Fatalf("CreateBaseRecipeTx: %v", err)
	}
	return got
}

func TestCreateBaseRecipeTxKeysTheIngredientByItsBaseRecipeNotItsName(t *testing.T) {
	f, _ := baseFixture(t)
	got := f.createBase(t, 5, "  Béchamel ", units.Millilitre)
	if got.Name != "Béchamel" || got.Base != units.Millilitre || got.ID == 0 {
		t.Errorf("created = %+v", got)
	}
	if k := f.nameKey(t, got.ID); k != "base-recipe:5" || k != store.BaseRecipeKey(5) {
		t.Errorf("name_key = %q, want base-recipe:5", k)
	}
}

func TestAPlainIngredientMayHaveTheNameOfABaseRecipesIngredient(t *testing.T) {
	f, _ := baseFixture(t)
	base := f.createBase(t, 5, "Béchamel", units.Millilitre)
	plain, err := f.store.Create(ctx, ingredient.Input{Name: "béchamel", Base: units.Millilitre})
	if err != nil {
		t.Fatalf("a plain Ingredient beside the Base recipe's of the same name: %v", err)
	}
	if plain.ID == base.ID || f.nameKey(t, plain.ID) != "béchamel" {
		t.Errorf("plain = %+v key %q", plain, f.nameKey(t, plain.ID))
	}
	// And the other way round: the Base recipe's Ingredient is created even when a plain one has the name.
	f.create(t, ingredient.Input{Name: "Roux", Base: units.Gram})
	roux := f.createBase(t, 6, "Roux", units.Gram)
	if f.nameKey(t, roux.ID) != "base-recipe:6" {
		t.Errorf("Roux's Ingredient key = %q", f.nameKey(t, roux.ID))
	}
}

func TestByNameAndSearchNeverReturnABaseRecipeIngredientThroughThePlainKey(t *testing.T) {
	f, _ := baseFixture(t)
	base := f.createBase(t, 5, "Béchamel", units.Millilitre)
	if _, err := f.store.ByName(ctx, "béchamel"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("ByName with only a Base recipe's Ingredient = %v, want ErrNotFound", err)
	}
	res, err := f.store.Search(ctx, "Béchamel", 5)
	if err != nil || res.Exact != nil {
		t.Fatalf("Search exact = %+v, %v; want none: the plain name key is not the Base recipe's", res.Exact, err)
	}
	found := false
	for _, s := range res.Suggestions {
		found = found || s.Ingredient.ID == base.ID
	}
	if !found {
		t.Errorf("the Base recipe's Ingredient must still be offered as a suggestion: %+v", res.Suggestions)
	}

	plain := f.create(t, ingredient.Input{Name: "béchamel", Base: units.Millilitre})
	got, err := f.store.ByName(ctx, "BÉCHAMEL")
	if err != nil || got.ID != plain.ID {
		t.Errorf("ByName = %+v, %v; want the plain Ingredient %d", got, err, plain.ID)
	}
	res, _ = f.store.Search(ctx, "béchamel", 5)
	if res.Exact == nil || res.Exact.ID != plain.ID {
		t.Errorf("Search exact = %+v, want the plain Ingredient %d", res.Exact, plain.ID)
	}
	listed := 0
	for _, s := range res.Suggestions {
		if s.Ingredient.ID == base.ID {
			listed++
		}
	}
	if listed != 1 {
		t.Errorf("the Base recipe's Ingredient is listed %d times beside the plain one, want once (the picker shows both)", listed)
	}
}

func TestAdoptBaseRecipeTxReKeysAndKeepsEverythingElse(t *testing.T) {
	f, _ := baseFixture(t)
	jar := f.create(t, ingredient.Input{Name: "Béchamel", Base: units.Millilitre, ShelfLifeDays: intp(5),
		Conversions: []units.Conversion{{Unit: "jar", ToBase: 400}}})
	f.ref(t, jar.ID, 2)
	if err := f.inTx(t, func(tx *sql.Tx) error { return f.store.AdoptBaseRecipeTx(ctx, tx, jar.ID, 9) }); err != nil {
		t.Fatalf("AdoptBaseRecipeTx: %v", err)
	}
	if k := f.nameKey(t, jar.ID); k != "base-recipe:9" {
		t.Errorf("name_key = %q, want base-recipe:9", k)
	}
	got, _ := f.store.Get(ctx, jar.ID)
	if got.Name != "Béchamel" || got.ShelfLifeDays == nil || *got.ShelfLifeDays != 5 || len(got.Conversions) != 1 || f.refCount(t, jar.ID) != 2 {
		t.Errorf("after the take-over %+v refs %d: name, Shelf Life, conversions and references must stay", got, f.refCount(t, jar.ID))
	}
	// After a Yes a plain Ingredient of that name may exist again (P7 follow-up).
	if _, err := f.store.Create(ctx, ingredient.Input{Name: "béchamel", Base: units.Millilitre}); err != nil {
		t.Errorf("a plain Ingredient named béchamel after the take-over: %v", err)
	}
	if err := f.inTx(t, func(tx *sql.Tx) error { return f.store.AdoptBaseRecipeTx(ctx, tx, 99999, 9) }); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Adopt of a missing Ingredient = %v, want ErrNotFound", err)
	}
}

func TestReleaseBaseRecipeTxGivesBackThePlainKeyOrSaysTheNameIsTaken(t *testing.T) {
	f, _ := baseFixture(t)
	base := f.createBase(t, 5, "Béchamel", units.Millilitre)
	if err := f.inTx(t, func(tx *sql.Tx) error { return f.store.ReleaseBaseRecipeTx(ctx, tx, base.ID) }); err != nil {
		t.Fatalf("Release: %v", err)
	}
	if k := f.nameKey(t, base.ID); k != "béchamel" {
		t.Errorf("name_key after release = %q, want the plain key béchamel", k)
	}

	other := f.createBase(t, 6, "Roux", units.Gram)
	f.create(t, ingredient.Input{Name: "roux", Base: units.Gram})
	err := f.inTx(t, func(tx *sql.Tx) error { return f.store.ReleaseBaseRecipeTx(ctx, tx, other.ID) })
	if !errors.Is(err, store.ErrNameTaken) {
		t.Errorf("Release with a plain Ingredient of that name = %v, want ErrNameTaken (409 ingredient_name_taken)", err)
	}
	if k := f.nameKey(t, other.ID); k != "base-recipe:6" {
		t.Errorf("a failed release must leave the key alone, got %q", k)
	}
}

func TestRenameBaseRecipeTxChangesTheNameButNeverTheKey(t *testing.T) {
	f, _ := baseFixture(t)
	base := f.createBase(t, 5, "Béchamel", units.Millilitre)
	f.create(t, ingredient.Input{Name: "White sauce", Base: units.Millilitre})
	if err := f.inTx(t, func(tx *sql.Tx) error { return f.store.RenameBaseRecipeTx(ctx, tx, base.ID, "  White   sauce ") }); err != nil {
		t.Fatalf("a rename to the name of a plain Ingredient (answered No) must not collide: %v", err)
	}
	got, _ := f.store.Get(ctx, base.ID)
	if got.Name != "White sauce" || f.nameKey(t, base.ID) != "base-recipe:5" {
		t.Errorf("after rename name %q key %q, want 'White sauce' and base-recipe:5", got.Name, f.nameKey(t, base.ID))
	}
	var same int
	f.db.QueryRow(`SELECT count(*) FROM ingredients WHERE lower(name) = 'white sauce'`).Scan(&same)
	if same != 2 {
		t.Errorf("%d Ingredients named white sauce, want the plain one and the Base recipe's", same)
	}
}

func TestRenamingABaseRecipeIngredientThroughUpdateIsRefused(t *testing.T) {
	f, port := baseFixture(t)
	base := f.createBase(t, 5, "Béchamel", units.Millilitre)
	port.of[base.ID] = &store.BaseRecipeRef{ID: 5, Name: "Béchamel"}
	name := "White sauce"
	if _, err := f.store.Update(ctx, base.ID, store.Patch{Name: &name}); !errors.Is(err, store.ErrBaseRecipeIngredient) {
		t.Errorf("rename = %v, want ErrBaseRecipeIngredient (Rename the Base recipe instead)", err)
	}
	// Spelling it the same is not a rename; Shelf Life and Picture stay editable as usual.
	same := "béchamel"
	if _, err := f.store.Update(ctx, base.ID, store.Patch{Name: &same, ShelfLife: &store.ShelfLifePatch{Days: intp(4)}}); err != nil {
		t.Errorf("same name with a Shelf Life = %v, want it accepted", err)
	}
	if got, _ := f.store.Update(ctx, base.ID, store.Patch{FrozenShelfLife: &store.ShelfLifePatch{Days: intp(90)}}); got.FrozenShelfLifeDays == nil {
		t.Error("Frozen Shelf Life must stay editable on a Base recipe's Ingredient")
	}
}

func TestABaseRecipeIngredientCannotBeDeletedWhileItsBaseRecipeExists(t *testing.T) {
	f, port := baseFixture(t)
	base := f.createBase(t, 5, "Béchamel", units.Millilitre)
	port.of[base.ID] = &store.BaseRecipeRef{ID: 5, Name: "Béchamel"}
	if err := f.store.Delete(ctx, base.ID); !errors.Is(err, store.ErrInUse) {
		t.Errorf("Delete = %v, want ErrInUse (409 in_use)", err)
	}
	delete(port.of, base.ID)
	if err := f.store.Delete(ctx, base.ID); err != nil {
		t.Errorf("once the Base recipe is gone the Ingredient can be deleted: %v", err)
	}
}

func TestABaseRecipeIngredientCannotBeMergedAway(t *testing.T) {
	f, port := baseFixture(t)
	base := f.createBase(t, 5, "Béchamel", units.Millilitre)
	port.of[base.ID] = &store.BaseRecipeRef{ID: 5, Name: "Béchamel"}
	plain := f.create(t, ingredient.Input{Name: "white sauce", Base: units.Millilitre})
	if _, err := f.store.Merge(ctx, base.ID, plain.ID, ingredient.Resolution{}); !errors.Is(err, store.ErrBaseRecipeIngredient) {
		t.Errorf("Merge of a Base recipe's Ingredient into another = %v, want ErrBaseRecipeIngredient (409 base_recipe_ingredient)", err)
	}
	if _, err := f.store.MergePreview(ctx, base.ID, plain.ID); !errors.Is(err, store.ErrBaseRecipeIngredient) {
		t.Errorf("MergePreview = %v, want the same refusal", err)
	}
	if _, err := f.store.Get(ctx, base.ID); err != nil {
		t.Errorf("the refused merge must leave the Ingredient: %v", err)
	}
}

func TestMergingAPlainIngredientIntoABaseRecipeIngredientIsAllowedAndMovesItsReferences(t *testing.T) {
	f, port := baseFixture(t)
	base := f.createBase(t, 5, "Béchamel", units.Millilitre)
	port.of[base.ID] = &store.BaseRecipeRef{ID: 5, Name: "Béchamel"}
	old := f.create(t, ingredient.Input{Name: "béchamel", Base: units.Millilitre})
	f.ref(t, old.ID, 3)
	got, err := f.store.Merge(ctx, old.ID, base.ID, ingredient.Resolution{})
	if err != nil {
		t.Fatalf("Merge into a Base recipe's Ingredient: %v", err)
	}
	if got.ID != base.ID || f.refCount(t, base.ID) != 3 || f.nameKey(t, base.ID) != "base-recipe:5" {
		t.Errorf("merged = %+v refs %d key %q, want the Base recipe's Ingredient with the 3 references and its key", got, f.refCount(t, base.ID), f.nameKey(t, base.ID))
	}
	if _, err := f.store.Get(ctx, old.ID); !errors.Is(err, store.ErrNotFound) {
		t.Error("the merged plain Ingredient must be gone")
	}
}

func TestMergingIntoABaseRecipeIngredientThatWouldMakeACycleIsRefusedWithThePath(t *testing.T) {
	f, port := baseFixture(t)
	base := f.createBase(t, 5, "Béchamel", units.Millilitre)
	port.of[base.ID] = &store.BaseRecipeRef{ID: 5, Name: "Béchamel"}
	port.cycle = []string{"Béchamel", "Roux", "Béchamel"}
	old := f.create(t, ingredient.Input{Name: "white sauce", Base: units.Millilitre})
	f.ref(t, old.ID, 1)
	_, err := f.store.Merge(ctx, old.ID, base.ID, ingredient.Resolution{})
	var ce *store.CycleError
	if !errors.Is(err, store.ErrBaseRecipeCycle) || !errors.As(err, &ce) || len(ce.Path) != 3 || ce.Path[1] != "Roux" {
		t.Fatalf("Merge = %v, want a *CycleError with the path (422 base_recipe_cycle)", err)
	}
	if f.refCount(t, old.ID) != 1 {
		t.Error("a refused merge must change nothing")
	}
}

func TestTheBatchConversionOfABaseRecipeIngredientIsEditedByTheBaseRecipeOnly(t *testing.T) {
	f, port := baseFixture(t)
	base := f.createBase(t, 5, "Béchamel", units.Millilitre)
	if err := f.inTx(t, func(tx *sql.Tx) error {
		_, err := f.store.SetConversionTx(ctx, tx, base.ID, units.Conversion{Unit: "batch", ToBase: 1000})
		return err
	}); err != nil {
		t.Fatal(err)
	}
	port.of[base.ID] = &store.BaseRecipeRef{ID: 5, Name: "Béchamel"}
	if _, err := f.store.SetConversion(ctx, base.ID, units.Conversion{Unit: "batch", ToBase: 500}); !errors.Is(err, store.ErrBaseRecipeIngredient) {
		t.Errorf("SetConversion batch = %v, want ErrBaseRecipeIngredient (Set by the Base recipe)", err)
	}
	if _, err := f.store.RemoveConversion(ctx, base.ID, "batch"); !errors.Is(err, store.ErrBaseRecipeIngredient) {
		t.Errorf("RemoveConversion batch = %v, want ErrBaseRecipeIngredient", err)
	}
	if _, err := f.store.SetConversion(ctx, base.ID, units.Conversion{Unit: "jar", ToBase: 400}); err != nil {
		t.Errorf("other Unit Conversions stay editable: %v", err)
	}
}

func TestMergeTxIsMergeInsideTheCallersTransaction(t *testing.T) {
	f, _ := baseFixture(t)
	a := f.create(t, ingredient.Input{Name: "white sauce", Base: units.Millilitre})
	b := f.create(t, ingredient.Input{Name: "Sauce blanche", Base: units.Millilitre})
	f.ref(t, a.ID, 2)
	tx, err := f.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	if err := f.store.MergeTx(ctx, tx, a.ID, b.ID, ingredient.Resolution{}); err != nil {
		tx.Rollback()
		t.Fatalf("MergeTx: %v", err)
	}
	tx.Rollback()
	if _, err := f.store.Get(ctx, a.ID); err != nil || f.refCount(t, a.ID) != 2 {
		t.Error("MergeTx commits nothing: a rolled-back transaction leaves both Ingredients and the references")
	}
}
