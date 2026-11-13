package store_test

import (
	"errors"
	"math"
	"reflect"
	"testing"

	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// BR-B, the store as baserecipe.Catalog: NeedTree, composed Cook Steps, the cached total time, and the ports the
// Ingredient store uses (§3.2 guards, §4, §9, §16).

func active(text string, minutes int) recipe.Step {
	return recipe.Step{Text: text, Kind: schedule.Active, DurationMinutes: minutes}
}

func near(a, b float64) bool { return math.Abs(a-b) < 1e-6 }

func TestNeedTreeScalesByTheLinesAmountOverTheYieldAndNests(t *testing.T) {
	f := newBaseFixture(t)
	milk, butter, flour := f.basics(t)
	roux := f.createBase(t, baseIn("Roux", 300, "g", ln(butter, 150, "g"), ln(flour, 150, "g")))
	bech := f.createBase(t, baseIn("Béchamel", 1, "l", ln(milk, 1000, "ml"), callFor(roux, 100, "g")))
	lasagne := f.createPlain(t, plainIn("Lasagne", ln(flour, 200, "g"), callFor(bech, 500, "ml")))

	tree, err := f.s.NeedTree(ctx, lasagne.ID)
	if err != nil || len(tree) != 2 {
		t.Fatalf("NeedTree = %+v, %v", tree, err)
	}
	if tree[0].IngredientID != flour || tree[0].BaseRecipeID != 0 || !near(tree[0].Quantity, 200) {
		t.Errorf("plain need = %+v", tree[0])
	}
	b := tree[1]
	if b.IngredientID != bech.BaseIngredientID || b.BaseRecipeID != bech.ID || !near(b.Quantity, 500) || len(b.Made) != 2 {
		t.Fatalf("Béchamel node = %+v, want 500 ml made of two lines", b)
	}
	if b.Made[0].IngredientID != milk || !near(b.Made[0].Quantity, 500) {
		t.Errorf("milk = %+v, want 500 ml (500 of a 1000 ml Yield is x0.5)", b.Made[0])
	}
	r := b.Made[1]
	if r.BaseRecipeID != roux.ID || !near(r.Quantity, 50) || len(r.Made) != 2 || !near(r.Made[0].Quantity, 25) || !near(r.Made[1].Quantity, 25) {
		t.Errorf("Roux node = %+v, want 50 g (100 g x0.5, since Béchamel is scaled to 500 of 1000 ml) made of 25 g butter and 25 g flour (150 g x 50/300)", r)
	}
}

func TestNeedTreeOfARecipeWithoutBaseRecipesIsItsLinesAndAnEmptyBaseRecipeHasNoMade(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	soup := f.createPlain(t, plainIn("Soup", ln(milk, 200, "ml")))
	tree, err := f.s.NeedTree(ctx, soup.ID)
	if err != nil || len(tree) != 1 || tree[0].Made != nil {
		t.Errorf("NeedTree = %+v, %v", tree, err)
	}
	empty := f.createBase(t, baseIn("Pesto", 200, "g"))
	toast := f.createPlain(t, plainIn("Toast", callFor(empty, 50, "g")))
	tree, _ = f.s.NeedTree(ctx, toast.ID)
	if len(tree) != 1 || tree[0].BaseRecipeID != empty.ID || tree[0].Made != nil {
		t.Errorf("empty Base recipe node = %+v, want Made nil (§4.6)", tree)
	}
	if _, err := f.s.NeedTree(ctx, 99999); !errors.Is(err, baserecipe.ErrNotFound) {
		t.Errorf("unknown Recipe = %v, want baserecipe.ErrNotFound", err)
	}
}

func TestCookComposesTheBaseRecipesStepsIntoTheRecipesOwnWithLabels(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	in := baseIn("Béchamel", 1, "l", ln(milk, 1000, "ml"))
	in.Steps = []recipe.Step{active("Make the white sauce", 20)}
	bech := f.createBase(t, in)
	lin := plainIn("Lasagne", callFor(bech, 500, "ml"))
	lin.Steps = []recipe.Step{active("Layer the lasagne with béchamel", 10)}
	lasagne := f.createPlain(t, lin)

	got, err := f.s.Cook(ctx, lasagne.ID, nil)
	if err != nil {
		t.Fatalf("Cook: %v", err)
	}
	if len(got.Steps) != 2 || got.Steps[0].Text != "Make the white sauce" || got.Steps[1].Text != "Layer the lasagne with béchamel" {
		t.Fatalf("steps = %+v, want Béchamel's Step before the Step that needs it", got.Steps)
	}
	if o := got.Steps[0].Origin; o == nil || o.BaseRecipeID != bech.ID || !reflect.DeepEqual(o.Names, []string{"Béchamel"}) || got.Steps[1].Origin != nil {
		t.Errorf("origins = %+v / %+v, want the first labelled Béchamel and the Recipe's own unlabelled", got.Steps[0].Origin, got.Steps[1].Origin)
	}
	if got.TotalMinutes != 30 {
		t.Errorf("total = %d, want 30", got.TotalMinutes)
	}
	covered, _ := f.s.Cook(ctx, lasagne.ID, func(baserecipe.Path) float64 { return 0 })
	if !covered.Steps[0].Covered || covered.Steps[0].DurationMinutes != 0 {
		t.Errorf("with Stock covering it the block is %+v, want covered and zero-length (indexes unchanged)", covered.Steps[0])
	}
}

func TestTheCachedTotalTimeOfAUserIsRewrittenWhenABaseRecipeIsEdited(t *testing.T) {
	f := newBaseFixture(t)
	roux := baseIn("Roux", 300, "g")
	roux.Steps = []recipe.Step{active("Cook the roux", 5)}
	r := f.createBase(t, roux)
	bin := baseIn("Béchamel", 1, "l", callFor(r, 50, "g"))
	bin.Steps = []recipe.Step{active("Whisk in the milk", 20)}
	bech := f.createBase(t, bin)
	lin := plainIn("Lasagne", callFor(bech, 500, "ml"))
	lin.Steps = []recipe.Step{active("Layer the lasagne", 10)}
	lasagne := f.createPlain(t, lin)

	total := func(id int64) int {
		var n int
		if err := f.db.QueryRow(`SELECT total_minutes FROM recipes WHERE id = ?`, id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if total(lasagne.ID) != 35 || total(bech.ID) != 25 || total(r.ID) != 5 {
		t.Fatalf("cached totals lasagne %d béchamel %d roux %d, want 35, 25, 5 (a Recipe's total includes its Base recipes' Steps)", total(lasagne.ID), total(bech.ID), total(r.ID))
	}
	roux.Steps = []recipe.Step{active("Cook the roux", 15)}
	if _, err := f.s.Update(ctx, r.ID, roux); err != nil {
		t.Fatal(err)
	}
	if total(lasagne.ID) != 45 || total(bech.ID) != 35 {
		t.Errorf("after editing Roux: lasagne %d béchamel %d, want 45 and 35 (rewritten for every Recipe that uses it, nested too)", total(lasagne.ID), total(bech.ID))
	}
	got, _ := f.s.Get(ctx, lasagne.ID)
	if got.Timing.TotalMinutes != 45 {
		t.Errorf("Get timing total = %d, want the composed 45", got.Timing.TotalMinutes)
	}
}

// The ports the Ingredient store uses.

func TestTheBaseRecipePortSaysWhichBaseRecipeAnIngredientBelongsTo(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	if _, err := f.s.SetArchived(ctx, bech.ID, true); err != nil {
		t.Fatal(err)
	}
	port := newPort(f)
	ref, err := port.BaseRecipeOf(ctx, f.db, bech.BaseIngredientID)
	if err != nil || ref == nil || ref.ID != bech.ID || ref.Name != "Béchamel" || !ref.Archived {
		t.Errorf("BaseRecipeOf = %+v, %v; want Béchamel, archived", ref, err)
	}
	if ref, err := port.BaseRecipeOf(ctx, f.db, milk); err != nil || ref != nil {
		t.Errorf("BaseRecipeOf(milk) = %+v, %v; want nil", ref, err)
	}
}

func TestTheMergeCyclePortNamesTheCycleAMergeIntoABaseRecipesIngredientWouldMake(t *testing.T) {
	f := newBaseFixture(t)
	white := f.ingredient(t, "white sauce", units.Millilitre)
	roux := f.createBase(t, baseIn("Roux", 1, "kg", ln(white, 100, "ml")))       // Roux has a line on the plain 'white sauce'
	bech := f.createBase(t, baseIn("Béchamel", 1, "l", callFor(roux, 100, "g"))) // Béchamel calls for Roux
	port := newPort(f)
	path, err := port.MergeCycle(ctx, f.db, white, bech.BaseIngredientID)
	if err != nil || !reflect.DeepEqual(path, []string{"Roux", "Béchamel", "Roux"}) {
		t.Errorf("MergeCycle = %v, %v; merging 'white sauce' into Béchamel makes Roux call for Béchamel, which calls for Roux", path, err)
	}
	other := f.ingredient(t, "stock", units.Millilitre)
	if path, err := port.MergeCycle(ctx, f.db, other, bech.BaseIngredientID); err != nil || path != nil {
		t.Errorf("MergeCycle with no lines = %v, %v; want none", path, err)
	}
}

func TestTheIngredientStoreGuardsSeeTheRecipeTablesThroughThePort(t *testing.T) {
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	plain := f.ingredient(t, "white sauce", units.Millilitre)
	if err := f.ings.Delete(ctx, bech.BaseIngredientID); !errors.Is(err, ingstore.ErrInUse) {
		t.Errorf("Delete = %v, want ErrInUse while the Base recipe exists", err)
	}
	if _, err := f.ings.Merge(ctx, bech.BaseIngredientID, plain, ingredientResolution()); !errors.Is(err, ingstore.ErrBaseRecipeIngredient) {
		t.Errorf("Merge away = %v, want ErrBaseRecipeIngredient", err)
	}
	name := "Other name"
	if _, err := f.ings.Update(ctx, bech.BaseIngredientID, ingstore.Patch{Name: &name}); !errors.Is(err, ingstore.ErrBaseRecipeIngredient) {
		t.Errorf("rename = %v, want ErrBaseRecipeIngredient", err)
	}
}

func TestMergingAPlainIngredientIntoABaseRecipeIngredientRepointsItsLinesAndRewritesTheRememberedColumn(t *testing.T) {
	f := newBaseFixture(t)
	s := f.bulkSetup(t)
	extra := f.ingredient(t, "sauce blanche", units.Millilitre)
	other := f.createPlain(t, plainIn("Croque", ln(extra, 100, "ml")))
	if _, err := f.ings.Merge(ctx, extra, s.bech.BaseIngredientID, ingredientResolution()); err != nil {
		t.Fatalf("Merge into the Base recipe's Ingredient: %v", err)
	}
	got, _ := f.s.Get(ctx, other.ID)
	if got.Lines[0].Base == nil || got.Lines[0].Base.ID != s.bech.ID {
		t.Errorf("Croque's line = %+v, want it a Base recipe line now (a merge into it turns lines into Base recipe lines)", got.Lines[0])
	}
}

func TestTheMergeOfARememberedIngredientIsNotBlockedByTheLinkColumn(t *testing.T) {
	f := newBaseFixture(t)
	s := f.linkSetup(t)
	if _, err := f.s.LinkLine(ctx, s.lasagne.ID, s.line, recipe.LinkRequest{BaseRecipeID: s.bech.ID}); err != nil {
		t.Fatal(err)
	}
	// The plain Ingredient is on no Recipe line any more; linked_from_ingredient_id is no reference.
	if err := f.ings.Delete(ctx, s.jar); err != nil {
		t.Fatalf("Delete of a remembered Ingredient = %v, want it allowed (the column is set NULL)", err)
	}
	if _, from := f.lineIngredient(t, s.line); from.Valid {
		t.Error("the column must be NULL after the delete")
	}
}
