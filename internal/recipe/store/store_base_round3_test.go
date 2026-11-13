package store_test

import (
	"errors"
	"reflect"
	"sort"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// BR-B round 3 (docs/dev/design/base-recipes.md sections 4.1, 5, 9 and 17): the batch read of need trees, the composed
// Timing.Advance on Get, skipped lines reported with where they sit, and the delete edge of section 17.
//
// The API these tests pin:
//
//	type store.TreeResult struct { Needs []baserecipe.Need; Skipped []baserecipe.Skipped; Err error }
//	func (*Store) NeedTrees(ctx) (map[int64]store.TreeResult, error)
//	func (*Store) Unlink(ctx, baseID, lineIDs) ([]int64, error)   // the Recipes whose lines changed, read in the transaction

// treeSetup: Béchamel (Base) used by Lasagne and by the archived Moussaka; Soup is plain; Pesto is a Base recipe.
type treeSetup struct {
	milk, flour             int64
	bech, pesto             recipe.Recipe
	lasagne, moussaka, soup recipe.Recipe
}

func (f *bf) treeSetup(t *testing.T) treeSetup {
	t.Helper()
	milk, _, flour := f.basics(t)
	s := treeSetup{milk: milk, flour: flour}
	s.bech = f.createBase(t, baseIn("Béchamel", 1, "l", ln(milk, 1000, "ml")))
	s.pesto = f.createBase(t, baseIn("Pesto", 200, "g", ln(flour, 100, "g")))
	s.lasagne = f.createPlain(t, plainIn("Lasagne", ln(flour, 200, "g"), callFor(s.bech, 500, "ml")))
	s.moussaka = f.createPlain(t, plainIn("Moussaka", callFor(s.bech, 250, "ml")))
	if _, err := f.s.SetArchived(ctx, s.moussaka.ID, true); err != nil {
		t.Fatal(err)
	}
	s.soup = f.createPlain(t, plainIn("Soup", ln(milk, 200, "ml")))
	return s
}

// ---- 1. NeedTrees ----

func TestNeedTreesHoldsOneResultPerPlannableRecipeArchivedIncludedAndNoBaseRecipe(t *testing.T) {
	f := newBaseFixture(t)
	s := f.treeSetup(t)
	trees, err := f.s.NeedTrees(ctx)
	if err != nil {
		t.Fatalf("NeedTrees: %v", err)
	}
	var ids []int64
	for id := range trees {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	want := []int64{s.lasagne.ID, s.moussaka.ID, s.soup.ID}
	if !reflect.DeepEqual(ids, want) {
		t.Fatalf("Recipes in the result = %v, want %v (Lasagne, archived Moussaka, Soup; never the Base recipes %d and %d)", ids, want, s.bech.ID, s.pesto.ID)
	}
	for _, id := range want {
		if trees[id].Err != nil || len(trees[id].Needs) == 0 {
			t.Errorf("Recipe %d = %+v, want a tree", id, trees[id])
		}
	}
}

func TestNeedTreesGivesTheSameTreeAsNeedTreeForEachRecipe(t *testing.T) {
	f := newBaseFixture(t)
	s := f.treeSetup(t)
	trees, err := f.s.NeedTrees(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range []recipe.Recipe{s.lasagne, s.moussaka, s.soup} {
		one, err := f.s.NeedTree(ctx, r.ID)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(trees[r.ID].Needs, one) {
			t.Errorf("%s: NeedTrees %+v != NeedTree %+v", r.Name, trees[r.ID].Needs, one)
		}
	}
	b := trees[s.lasagne.ID].Needs[1]
	if b.BaseRecipeID != s.bech.ID || !near(b.Quantity, 500) || len(b.Made) != 1 || !near(b.Made[0].Quantity, 500) {
		t.Errorf("Lasagne's Béchamel node = %+v, want 500 ml made of 500 ml of milk", b)
	}
}

func TestNeedTreesLoadsTheCatalogOnceWhateverTheNumberOfRecipes(t *testing.T) {
	f, n := newCountingBaseFixture(t, catalogLoad)
	s := f.treeSetup(t)
	for i := 0; i < 6; i++ { // more Recipes, same cost
		f.createPlain(t, plainIn("Soup "+string(rune('A'+i)), ln(s.milk, 100, "ml"), callFor(s.bech, 100, "ml")))
	}
	n.Reset()
	trees, err := f.s.NeedTrees(ctx)
	if err != nil || len(trees) != 9 {
		t.Fatalf("NeedTrees = %d Recipes, %v", len(trees), err)
	}
	if got := n.Count(); got != 1 {
		t.Errorf("NeedTrees loaded the catalog %d times for %d Recipes, want once", got, len(trees))
	}
}

func TestNeedTreesWithNoRecipesIsEmptyNotAnError(t *testing.T) {
	f := newBaseFixture(t)
	trees, err := f.s.NeedTrees(ctx)
	if err != nil || len(trees) != 0 {
		t.Errorf("NeedTrees = %v, %v", trees, err)
	}
}

// ---- 1 and 3. A cyclic Recipe is reported per Recipe, typed ----

// cyclic writes a cycle past the check, as a restore could: Béchamel calls Roux, and Roux is made to call Béchamel.
func (f *bf) cyclic(t *testing.T) (lasagne, soup recipe.Recipe) {
	t.Helper()
	milk, butter, _ := f.basics(t)
	roux := f.createBase(t, baseIn("Roux", 300, "g", ln(butter, 150, "g")))
	bech := f.createBase(t, baseIn("Béchamel", 1, "l", ln(milk, 1000, "ml"), callFor(roux, 100, "g")))
	lasagne = f.createPlain(t, plainIn("Lasagne", callFor(bech, 500, "ml")))
	soup = f.createPlain(t, plainIn("Soup", ln(milk, 200, "ml")))
	f.exec(t, `UPDATE recipe_lines SET ingredient_id = ?, unit = 'ml' WHERE recipe_id = ? AND ingredient_id = ?`, bech.BaseIngredientID, roux.ID, butter)
	return lasagne, soup
}

func TestNeedTreesReportsACyclicRecipeByItselfAndStillGivesTheOthers(t *testing.T) {
	f := newBaseFixture(t)
	lasagne, soup := f.cyclic(t)
	trees, err := f.s.NeedTrees(ctx)
	if err != nil {
		t.Fatalf("NeedTrees = %v, want the cycle of one Recipe not to fail the call", err)
	}
	var ce *baserecipe.CycleError
	got := trees[lasagne.ID]
	if !errors.Is(got.Err, baserecipe.ErrCycle) || !errors.As(got.Err, &ce) || len(ce.Path) < 3 || got.Needs != nil {
		t.Errorf("Lasagne = %+v, want Err a *baserecipe.CycleError with its path and no Needs", got)
	}
	if ok := trees[soup.ID]; ok.Err != nil || len(ok.Needs) != 1 {
		t.Errorf("Soup = %+v, want its tree", ok)
	}
}

func TestACycleStaysTypedOnTheSingleReadsToo(t *testing.T) {
	f := newBaseFixture(t)
	lasagne, _ := f.cyclic(t)
	if _, err := f.s.NeedTree(ctx, lasagne.ID); !errors.Is(err, baserecipe.ErrCycle) {
		t.Errorf("NeedTree = %v, want baserecipe.ErrCycle", err)
	}
	if _, err := f.s.Cook(ctx, lasagne.ID, nil); !errors.Is(err, baserecipe.ErrCycle) {
		t.Errorf("Cook = %v, want baserecipe.ErrCycle", err)
	}
	if _, err := f.s.Get(ctx, lasagne.ID); err != nil {
		t.Errorf("Get of a cyclic Recipe = %v, want it to degrade (the Recipe still opens)", err)
	}
}

// ---- 4. Skipped lines ----

func TestNeedTreesReportsTheLinesItSkippedAndWhereTheySit(t *testing.T) {
	f := newBaseFixture(t)
	milk, butter, flour := f.basics(t)
	roux := f.createBase(t, baseIn("Roux", 300, "g", ln(butter, 150, "g"), ln(flour, 150, "g")))
	bech := f.createBase(t, baseIn("Béchamel", 1, "l", ln(milk, 1000, "ml"), callFor(roux, 100, "g")))
	lasagne := f.createPlain(t, plainIn("Lasagne", ln(flour, 200, "g"), callFor(bech, 500, "ml")))
	soup := f.createPlain(t, plainIn("Soup", ln(milk, 200, "ml"), ln(flour, 10, "g")))
	// The API refuses these; an old row can hold them. Roux line 1 (flour) and Soup line 1 (flour) get a unit that does not convert.
	f.exec(t, `UPDATE recipe_lines SET unit = 'cup' WHERE recipe_id = ? AND ingredient_id = ?`, roux.ID, flour)
	f.exec(t, `UPDATE recipe_lines SET unit = 'cup' WHERE recipe_id = ? AND ingredient_id = ?`, soup.ID, flour)

	trees, err := f.s.NeedTrees(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := trees[lasagne.ID].Skipped; len(got) != 1 || got[0].RecipeID != roux.ID || got[0].RecipeName != "Roux" ||
		got[0].Line != 1 || got[0].IngredientID != flour || got[0].Unit != "cup" || got[0].Reason != baserecipe.SkipUnconvertibleUnit {
		t.Errorf("Lasagne skipped = %+v, want Roux's line 1 (cup of flour), named as in Roux, reached through Béchamel", got)
	}
	if got := trees[soup.ID].Skipped; len(got) != 1 || got[0].RecipeID != soup.ID || got[0].RecipeName != "Soup" || got[0].Line != 1 {
		t.Errorf("Soup skipped = %+v, want its own line 1", got)
	}
	if len(trees[lasagne.ID].Needs) != 2 || len(trees[soup.ID].Needs) != 1 {
		t.Errorf("a skipped line leaves the tree otherwise whole: Lasagne %+v Soup %+v", trees[lasagne.ID].Needs, trees[soup.ID].Needs)
	}
	clean := f.createPlain(t, plainIn("Toast", ln(milk, 1, "ml")))
	trees, _ = f.s.NeedTrees(ctx)
	if len(trees[clean.ID].Skipped) != 0 {
		t.Errorf("Toast skipped = %+v, want none", trees[clean.ID].Skipped)
	}
}

// ---- 2. Get fills a composed Timing.Advance ----

func (f *bf) advanceSetup(t *testing.T) (beans, chilli recipe.Recipe) {
	t.Helper()
	milk, _, _ := f.basics(t)
	bin := baseIn("Beans", 500, "g", ln(milk, 100, "ml"))
	bin.Steps = []recipe.Step{
		{Text: "Soak the beans overnight", Kind: schedule.Advance, LeadTimeMinutes: 480},
		active("Boil the beans", 30),
	}
	beans = f.createBase(t, bin)
	cin := plainIn("Chilli", callFor(beans, 250, "g"))
	cin.Steps = []recipe.Step{
		{Text: "Marinate the meat", Kind: schedule.Advance, LeadTimeMinutes: 120},
		active("Cook the chilli with the beans", 40),
	}
	chilli = f.createPlain(t, cin)
	return beans, chilli
}

func TestGetComposesTheAdvanceStepsOfTheBaseRecipesUsed(t *testing.T) {
	f := newBaseFixture(t)
	_, chilli := f.advanceSetup(t)
	got, err := f.s.Get(ctx, chilli.ID)
	if err != nil {
		t.Fatal(err)
	}
	composed, err := f.s.Cook(ctx, chilli.ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	var want []recipe.AdvanceItem
	for i, st := range composed.Steps {
		if st.Kind == schedule.Advance {
			want = append(want, recipe.AdvanceItem{Step: i, LeadTimeMinutes: st.LeadTimeMinutes})
		}
	}
	if len(want) != 2 {
		t.Fatalf("composed Advance Steps = %+v, want the Recipe's and the Beans'", want)
	}
	if !reflect.DeepEqual(got.Timing.Advance, want) {
		t.Errorf("Timing.Advance = %+v, want %+v (indexes into the composed list, in step order)", got.Timing.Advance, want)
	}
	if got.Timing.AdvanceMinutes != 480 {
		t.Errorf("AdvanceMinutes = %d, want 480 (the longest lead time, the Beans' soak)", got.Timing.AdvanceMinutes)
	}
	if got.Timing.TotalMinutes != composed.TotalMinutes {
		t.Errorf("TotalMinutes = %d, want the composed %d", got.Timing.TotalMinutes, composed.TotalMinutes)
	}
	if len(got.Steps) != 2 {
		t.Errorf("Steps = %d, want the Recipe's own 2: Get keeps them, only Timing is composed", len(got.Steps))
	}
}

func TestGetOfABaseRecipeCallingAnotherComposesItsAdvanceStepsToo(t *testing.T) {
	f := newBaseFixture(t)
	beans, _ := f.advanceSetup(t)
	in := baseIn("Bean stew", 1, "kg", callFor(beans, 500, "g"))
	in.Steps = []recipe.Step{active("Simmer", 20)}
	stew := f.createBase(t, in)
	got, err := f.s.Get(ctx, stew.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Timing.Advance) != 1 || got.Timing.Advance[0].LeadTimeMinutes != 480 || got.Timing.AdvanceMinutes != 480 {
		t.Errorf("Timing = %+v, want the Beans' soak as the one Advance Step", got.Timing)
	}
}

func TestGetOfARecipeWithoutBaseRecipesKeepsItsOwnTimingAndLoadsNoCatalog(t *testing.T) {
	f, n := newCountingBaseFixture(t, catalogLoad)
	milk, _, _ := f.basics(t)
	in := plainIn("Roast", ln(milk, 1, "ml"))
	in.Steps = []recipe.Step{{Text: "Marinate", Kind: schedule.Advance, LeadTimeMinutes: 240}, active("Roast", 60)}
	r := f.createPlain(t, in)
	n.Reset()
	got, err := f.s.Get(ctx, r.ID)
	if err != nil || len(got.Timing.Advance) != 1 || got.Timing.Advance[0].Step != 0 || got.Timing.AdvanceMinutes != 240 {
		t.Errorf("Timing = %+v, %v", got.Timing, err)
	}
	if n.Count() != 0 {
		t.Errorf("Get loaded the catalog %d times for a Recipe with no Base recipe, want 0", n.Count())
	}
}

func TestGetLoadsTheCatalogOnceForARecipeWithBaseRecipes(t *testing.T) {
	f, n := newCountingBaseFixture(t, catalogLoad)
	_, chilli := f.advanceSetup(t)
	n.Reset()
	if _, err := f.s.Get(ctx, chilli.ID); err != nil {
		t.Fatal(err)
	}
	if n.Count() != 1 {
		t.Errorf("Get loaded the catalog %d times, want once (Within, Needed at, total time and Advance Steps share it)", n.Count())
	}
}

// ---- 5. Reviewer nits ----

func TestAPlannableListForARecipeDoesNoCatalogLoad(t *testing.T) {
	f, n := newCountingBaseFixture(t, catalogLoad)
	s := f.treeSetup(t)
	n.Reset()
	for _, kind := range []string{"", "plannable"} {
		list, err := f.s.List(ctx, store_ListFilterFor(kind, s.lasagne.ID))
		if err != nil || len(list) == 0 {
			t.Fatalf("List kind %q = %d, %v", kind, len(list), err)
		}
		for _, sum := range list {
			if sum.WouldCycle {
				t.Errorf("kind %q: %s marked WouldCycle", kind, sum.Name)
			}
		}
	}
	if n.Count() != 0 {
		t.Errorf("the default and plannable lists loaded the catalog %d times, want 0: only a list that shows Base recipes marks WouldCycle", n.Count())
	}
	n.Reset()
	for _, kind := range []string{"base", "all"} {
		if _, err := f.s.List(ctx, store_ListFilterFor(kind, s.lasagne.ID)); err != nil {
			t.Fatal(err)
		}
	}
	if n.Count() != 2 {
		t.Errorf("kind base and all loaded the catalog %d times, want once each", n.Count())
	}
}

func TestUnlinkReturnsTheRecipesItChangedInLineOrderEachOnce(t *testing.T) {
	f := newBaseFixture(t)
	s := f.bulkSetup(t)
	lasagneLine, moussakaLine := mustLineID(t, f, s.lasagne.ID), mustLineID(t, f, s.moussaka.ID)
	if _, err := f.s.Link(ctx, s.bech.ID, []int64{lasagneLine, moussakaLine}); err != nil {
		t.Fatal(err)
	}
	// Moussaka's line first: the order follows the lines asked for.
	got, err := f.s.Unlink(ctx, s.bech.ID, []int64{moussakaLine, lasagneLine})
	if err != nil || !reflect.DeepEqual(got, []int64{s.moussaka.ID, s.lasagne.ID}) {
		t.Errorf("Unlink = %v, %v; want [%d %d]", got, err, s.moussaka.ID, s.lasagne.ID)
	}
	// A refused unlink changes nothing and names no Recipe.
	canLine := mustLineID(t, f, s.cann.ID)
	got, err = f.s.Unlink(ctx, s.bech.ID, []int64{lasagneLine, canLine})
	if err == nil || len(got) != 0 {
		t.Errorf("Unlink of a line that is not a Base recipe line = %v, %v; want an error and no Recipes", got, err)
	}
}

// ---- 6. Section 17: deleting a Base recipe whose Ingredient stays while a plain Ingredient holds the name ----

func TestDeletingABaseRecipeWhoseIngredientKeepsStockWhileAPlainIngredientHoldsTheNameIsAConflict(t *testing.T) {
	f := newBaseFixture(t)
	b := f.createBase(t, baseIn("Stock", 1, "l"))
	plain := f.ingredient(t, "stock", units.Millilitre)
	f.lot(t, b.BaseIngredientID, 500)
	err := f.s.Delete(ctx, b.ID)
	var taken *recipe.NameTakenError
	if !errors.Is(err, recipe.ErrIngredientNameTaken) || !errors.As(err, &taken) || taken.Ingredient.ID != plain {
		t.Fatalf("Delete = %v, want *NameTakenError naming the plain Ingredient (409 ingredient_name_taken; the dialog offers a merge)", err)
	}
	if got, gerr := f.s.Get(ctx, b.ID); gerr != nil || !got.IsBase() || got.BaseIngredientID != b.BaseIngredientID {
		t.Errorf("a refused delete leaves the Base recipe whole: %+v, %v", got, gerr)
	}
	if f.lotsOf(t, b.BaseIngredientID) != 1 || f.nameKey(t, b.BaseIngredientID) == "stock" {
		t.Error("a refused delete leaves the Stock and the Base recipe's own name key as they were")
	}
	for _, k := range []string{"batch"} {
		if _, ok := f.conversion(t, b.BaseIngredientID, k); !ok {
			t.Errorf("a refused delete keeps the %s conversion", k)
		}
	}
}

func TestDeletingABaseRecipeWhoseIngredientKeepsProductsIsAlsoAConflictWhenTheNameIsHeld(t *testing.T) {
	f := newBaseFixture(t)
	b := f.createBase(t, baseIn("Stock", 1, "l"))
	plain := f.ingredient(t, "stock", units.Millilitre)
	f.exec(t, `INSERT INTO products(name, ingredient_id, pack_size, created_at, updated_at) VALUES ('Stock cubes', ?, 10, 't', 't')`, b.BaseIngredientID)
	err := f.s.Delete(ctx, b.ID)
	var taken *recipe.NameTakenError
	if !errors.As(err, &taken) || taken.Ingredient.ID != plain {
		t.Fatalf("Delete = %v, want *NameTakenError naming the plain Ingredient", err)
	}
	if _, gerr := f.s.Get(ctx, b.ID); gerr != nil {
		t.Errorf("the Base recipe stays: %v", gerr)
	}
}

func TestDeletingABaseRecipeWhoseIngredientHoldsNothingSucceedsEvenWhenAPlainIngredientHoldsTheName(t *testing.T) {
	f := newBaseFixture(t)
	b := f.createBase(t, baseIn("Stock", 1, "l"))
	f.ingredient(t, "stock", units.Millilitre)
	if err := f.s.Delete(ctx, b.ID); err != nil {
		t.Fatalf("Delete = %v, want it to succeed: the Ingredient goes with the Base recipe, so the name is not in the way", err)
	}
	if _, err := f.ings.Get(ctx, b.BaseIngredientID); err == nil {
		t.Error("the Ingredient with nothing on it goes with the Base recipe")
	}
}

func TestDeletingAfterTheMergeSucceedsAndTheStockStaysOnTheOrdinaryIngredient(t *testing.T) {
	f := newBaseFixture(t)
	b := f.createBase(t, baseIn("Stock", 1, "l"))
	plain := f.ingredient(t, "stock", units.Millilitre)
	f.lot(t, b.BaseIngredientID, 500)
	if err := f.s.Delete(ctx, b.ID); err == nil {
		t.Fatal("Delete should be refused while the name is held")
	}
	// The merge the dialog offers: the plain Ingredient into the Base recipe's (the other way is refused, 409 base_recipe_ingredient).
	if _, err := f.ings.Merge(ctx, plain, b.BaseIngredientID, ingredientResolution()); err != nil {
		t.Fatalf("merge of the plain Ingredient into the Base recipe's: %v", err)
	}
	if err := f.s.Delete(ctx, b.ID); err != nil {
		t.Errorf("Delete after the merge = %v, want it to succeed (the plain Ingredient no longer holds the name)", err)
	}
}

// ---- 6. The cached advance_minutes is composed like total_minutes ----

func TestTheCachedAdvanceTimeOfARecipeIsComposedAtSaveAndAgreesWithTheListAndTheDetail(t *testing.T) {
	f := newBaseFixture(t)
	_, chilli := f.advanceSetup(t) // Chilli: own 120 min Advance Step; Beans: 480 min soak
	cached := func(id int64) (n int) {
		if err := f.db.QueryRow(`SELECT advance_minutes FROM recipes WHERE id = ?`, id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if cached(chilli.ID) != 480 {
		t.Errorf("cached advance_minutes of Chilli = %d, want the composed 480 (the Beans' soak is longer than its own 120)", cached(chilli.ID))
	}
	assertAgree(t, f, chilli.ID, 480)
}

func assertAgree(t *testing.T, f *bf, id int64, want int) {
	t.Helper()
	got, err := f.s.Get(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	list, err := f.s.List(ctx, store_ListFilterFor("all", 0))
	if err != nil {
		t.Fatal(err)
	}
	for _, sum := range list {
		if sum.ID == id {
			if sum.AdvanceMinutes != got.Timing.AdvanceMinutes || sum.AdvanceMinutes != want {
				t.Errorf("recipe %d: list advanceMinutes %d, detail %d, want both %d", id, sum.AdvanceMinutes, got.Timing.AdvanceMinutes, want)
			}
			return
		}
	}
	t.Fatalf("recipe %d not in the list", id)
}

func TestTheCachedAdvanceTimeOfEveryCallerIsRewrittenWhenABaseRecipeIsEdited(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	rin := baseIn("Beans", 500, "g", ln(milk, 100, "ml"))
	rin.Steps = []recipe.Step{{Text: "Soak", Kind: schedule.Advance, LeadTimeMinutes: 480}, active("Boil", 30)}
	beans := f.createBase(t, rin)
	sin := baseIn("Bean stew", 1, "kg", callFor(beans, 500, "g"))
	sin.Steps = []recipe.Step{active("Simmer", 20)}
	stew := f.createBase(t, sin) // a Base recipe calling a Base recipe
	cin := plainIn("Chilli", callFor(stew, 300, "g"))
	cin.Steps = []recipe.Step{active("Serve", 5)}
	chilli := f.createPlain(t, cin)
	for _, id := range []int64{stew.ID, chilli.ID} {
		assertAgree(t, f, id, 480)
	}

	rin.Steps = []recipe.Step{{Text: "Soak", Kind: schedule.Advance, LeadTimeMinutes: 720}, active("Boil", 30)}
	if _, err := f.s.Update(ctx, beans.ID, rin); err != nil {
		t.Fatal(err)
	}
	for _, id := range []int64{stew.ID, chilli.ID} {
		assertAgree(t, f, id, 720)
	}

	rin.Steps = []recipe.Step{active("Boil", 30)} // the soak goes
	if _, err := f.s.Update(ctx, beans.ID, rin); err != nil {
		t.Fatal(err)
	}
	for _, id := range []int64{stew.ID, chilli.ID} {
		assertAgree(t, f, id, 0)
	}
}
