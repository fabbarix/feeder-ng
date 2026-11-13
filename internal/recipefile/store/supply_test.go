package store_test

import (
	"database/sql"
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// H3 (ADR 0017, docs/dev/design/household-items.md §2 guard 7): Existing hands the review every Ingredient with its kind,
// so the review can tell a Supply; and an import never sets a Supply's Shelf Life, even if a Base recipe's Ingredient
// became one between the review and the write (the safety net, `AND kind='food'` on the shelf_life_days update).

func (f *fixture) supply(t *testing.T, name string) int64 {
	t.Helper()
	res, err := f.db.Exec(`INSERT INTO ingredients(name, name_key, base_unit, kind, created_at, updated_at)
	        VALUES (?, lower(?), 'g', 'supply', '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`, name, name)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func TestExistingCarriesTheKindOfEveryIngredient(t *testing.T) {
	f := newFixture(t)
	soap := f.supply(t, "dish soap")
	ex, err := f.s.Existing(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, i := range ex.Ingredients {
		if i.ID == soap {
			found = true
			if !i.IsSupply() || i.Kind != ingredient.KindSupply {
				t.Errorf("kind = %q, want supply", i.Kind)
			}
		}
	}
	if !found {
		t.Fatalf("Existing.Ingredients = %+v, want the Supply listed (the review needs its name to refuse it)", ex.Ingredients)
	}
}

func TestAnImportNamingASupplyIsNotReadyAndWritesNothing(t *testing.T) {
	f := newFixture(t)
	f.supply(t, "rice")
	ex, err := f.s.Existing(ctx)
	if err != nil {
		t.Fatal(err)
	}
	file := riceFile(riceRecipe("Pilaf"))
	if _, err := recipefile.BuildCommit(file, ex, recipefile.Decisions{}, recipefile.ImageSet{}); !errors.Is(err, recipefile.ErrNotReady) {
		t.Fatalf("BuildCommit = %v, want ErrNotReady: rice is one of the Supplies", err)
	}
	if f.count(t, "recipes") != 0 || f.count(t, "ingredients") != 1 {
		t.Error("nothing is written")
	}
}

func TestAnImportNeverSetsASupplysShelfLife(t *testing.T) {
	f := newSeeded(t)
	// Race the guards: the moment the Base recipe is linked to its Ingredient, that Ingredient becomes a Supply, as if
	// the User changed its kind between the review and the write.
	if _, err := f.db.Exec(`CREATE TRIGGER supply_race AFTER UPDATE OF base_ingredient_id ON recipes
	        BEGIN UPDATE ingredients SET kind = 'supply' WHERE id = NEW.base_ingredient_id; END`); err != nil {
		t.Fatal(err)
	}
	file := lasagneFile(bechamelLine(), fileBechamel(1, "l"))
	shelf := 4
	file.Ingredients[3].ShelfLifeDays = &shelf
	ex, err := f.s.Existing(ctx)
	if err != nil {
		t.Fatal(err)
	}
	c, err := recipefile.BuildCommit(file, ex, answers(map[string]recipefile.BaseRecipeLineDecision{lineB: fileAnswer(1)}), recipefile.ImageSet{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.Apply(ctx, c); err != nil {
		t.Fatalf("Apply: %v (the safety net skips the update, it does not fail the import)", err)
	}
	b := f.recipeNamed(t, "Béchamel")
	var kind string
	var days sql.NullInt64
	if err := f.db.QueryRow(`SELECT kind, shelf_life_days FROM ingredients WHERE id = ?`, b.baseIng.Int64).Scan(&kind, &days); err != nil {
		t.Fatal(err)
	}
	if kind != "supply" {
		t.Fatalf("kind = %q: the test did not make the Ingredient a Supply", kind)
	}
	if days.Valid {
		t.Errorf("shelf_life_days = %d, want NULL: a Supply never gets a Shelf Life from an import", days.Int64)
	}
}

func TestAnImportStillSetsAFoodIngredientsShelfLife(t *testing.T) {
	// The same file without the race: the guard must not stop food (TestAFileBaseRecipesIngredientTakesTheFilesShelfLifeAndPicture).
	f := newSeeded(t)
	file := lasagneFile(bechamelLine(), fileBechamel(1, "l"))
	shelf := 4
	file.Ingredients[3].ShelfLifeDays = &shelf
	ex, _ := f.s.Existing(ctx)
	c, err := recipefile.BuildCommit(file, ex, answers(map[string]recipefile.BaseRecipeLineDecision{lineB: fileAnswer(1)}), recipefile.ImageSet{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.Apply(ctx, c); err != nil {
		t.Fatal(err)
	}
	var days sql.NullInt64
	b := f.recipeNamed(t, "Béchamel")
	f.db.QueryRow(`SELECT shelf_life_days FROM ingredients WHERE id = ?`, b.baseIng.Int64).Scan(&days)
	if !days.Valid || days.Int64 != 4 {
		t.Errorf("shelf_life_days = %v, want 4", days)
	}
}
