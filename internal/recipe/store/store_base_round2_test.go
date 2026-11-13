package store_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// BR-B round 2 (review of 9f4eb444): cycles on the kind-change paths, take-over merges that disagree, the API
// additions the web needs, and nits. Red until implemented.

// cycleSetup: Base recipe Sauce has a line on the PLAIN Ingredient "pesto"; the plannable Pesto calls for Sauce. Taking
// "pesto" over for Pesto would make Sauce call Pesto, which calls Sauce.
type cycleSetup struct {
	pestoIng int64
	sauce    recipe.Recipe
	pesto    recipe.Recipe
	sauceLn  int64
	plan     pestoPlan
}

func (f *bf) cycleSetup(t *testing.T) cycleSetup {
	t.Helper()
	pestoIng := f.ingredient(t, "pesto", units.Gram)
	sauce := f.createBase(t, baseIn("Sauce", 100, "g", ln(pestoIng, 10, "g")))
	c := f.courses(t)
	pesto := f.createPlain(t, recipe.Input{Name: "Pesto", Yield: 4, CourseIDs: []int64{c.main}, Lines: []recipe.Line{callFor(sauce, 50, "g")}})
	slot := f.exec(t, `INSERT INTO meal_slots(weekday,name,time) VALUES (1,'Dinner','19:00')`)
	f.exec(t, `INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,state,pinned,created_at,updated_at) VALUES ('2026-11-10',?,?,?,1,4,'planned',0,'t','t')`, slot, c.main, pesto.ID)
	f.exec(t, `INSERT INTO slot_rules(meal_slot_id,course_id,recipe_id) VALUES (?,?,?)`, slot, c.main, pesto.ID)
	return cycleSetup{pestoIng: pestoIng, sauce: sauce, pesto: pesto, sauceLn: mustLineID(t, f, sauce.ID)}
}

func (f *bf) wantUntouched(t *testing.T, s cycleSetup) {
	t.Helper()
	if got, _ := f.s.Get(ctx, s.pesto.ID); got.IsBase() {
		t.Error("a refused change leaves Pesto plannable")
	}
	if f.count(t, "planned_meals") != 1 || f.count(t, "slot_rules") != 1 {
		t.Error("a refused change removes no Planned Meal or Slot Rule")
	}
	if f.nameKey(t, s.pestoIng) != "pesto" {
		t.Errorf("name_key = %q, want the plain key untouched", f.nameKey(t, s.pestoIng))
	}
	if id, _ := f.lineIngredient(t, s.sauceLn); id != s.pestoIng {
		t.Error("Sauce's line stays on the plain Ingredient")
	}
}

func TestToBaseWithATakeOverThatWouldMakeACycleIsRefusedAndWritesNothing(t *testing.T) {
	f := newBaseFixture(t)
	s := f.cycleSetup(t)
	in := recipe.ToBaseInput{Yield: 200, YieldUnit: "g"}

	_, err := f.s.ToBase(ctx, s.pesto.ID, in)
	var ask *recipe.TakeOverError
	if !errors.As(err, &ask) || ask.Ingredient.ID != s.pestoIng || len(ask.Recipes) != 1 || ask.Recipes[0].Name != "Sauce" {
		t.Fatalf("ToBase with no answer = %v (ask %+v), want the ask naming Sauce (409), with no cycle error yet", err, ask)
	}
	f.wantUntouched(t, s)

	in.TakeOver = yes()
	_, err = f.s.ToBase(ctx, s.pesto.ID, in)
	var ce *recipe.CycleError
	if !errors.Is(err, recipe.ErrBaseRecipeCycle) || !errors.As(err, &ce) || !reflect.DeepEqual(ce.Path, []string{"Pesto", "Sauce", "Pesto"}) {
		t.Fatalf("ToBase Yes = %v, want *CycleError [Pesto Sauce Pesto] (422 base_recipe_cycle)", err)
	}
	f.wantUntouched(t, s)

	in.TakeOver = no()
	got, err := f.s.ToBase(ctx, s.pesto.ID, in)
	if err != nil || !got.IsBase() || got.BaseIngredientID == s.pestoIng {
		t.Errorf("ToBase No = %+v, %v; want Pesto its own Ingredient, no cycle: Sauce's line stays plain", got.BaseIngredientID, err)
	}
}

func TestToBaseAskThenYesOrNoDecidesWhenThereIsNoCycle(t *testing.T) {
	f := newBaseFixture(t)
	jar := f.ingredient(t, "pesto", units.Gram)
	f.createPlain(t, plainIn("Pasta al pesto", ln(jar, 80, "g")))
	p := f.createPlain(t, plainIn("Pesto", ln(f.ingredient(t, "basil", units.Gram), 50, "g")))
	_, err := f.s.ToBase(ctx, p.ID, recipe.ToBaseInput{Yield: 200, YieldUnit: "g"})
	if !errors.Is(err, recipe.ErrTakeOver) {
		t.Fatalf("ToBase = %v, want the 409 ask", err)
	}
	got, err := f.s.ToBase(ctx, p.ID, recipe.ToBaseInput{Yield: 200, YieldUnit: "g", TakeOver: yes()})
	if err != nil || got.BaseIngredientID != jar {
		t.Errorf("Yes = %d, %v; want the plain Ingredient %d taken over", got.BaseIngredientID, err, jar)
	}
}

func TestLinkWithConvertThatWouldMakeACycleIsRefusedAndWritesNothing(t *testing.T) {
	f := newBaseFixture(t)
	s := f.cycleSetup(t)
	_, err := f.s.LinkLine(ctx, s.sauce.ID, s.sauceLn, recipe.LinkRequest{ConvertRecipeID: s.pesto.ID, Yield: 200, YieldUnit: "g", TakeOver: no()})
	var ce *recipe.CycleError
	if !errors.As(err, &ce) || !reflect.DeepEqual(ce.Path, []string{"Sauce", "Pesto", "Sauce"}) || ce.Field != "lines[0]" {
		t.Fatalf("LinkLine convert = %v, want *CycleError [Sauce Pesto Sauce] on lines[0]", err)
	}
	f.wantUntouched(t, s)
}

// Take-overs whose two Ingredients disagree: the taken-over plain Ingredient's values win (it is the one in use, with
// Stock); the Base recipe's own batch conversion is kept.

func TestRenameYesMergesWhenShelfLifeAndUnitConversionsDisagreeAndThePlainIngredientWins(t *testing.T) {
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	f.exec(t, `UPDATE ingredients SET shelf_life_days = 3 WHERE id = ?`, bech.BaseIngredientID)
	f.exec(t, `INSERT INTO ingredient_conversions(ingredient_id, unit, to_base) VALUES (?, 'jar', 300), (?, 'tin', 250)`, bech.BaseIngredientID, bech.BaseIngredientID)
	white := f.ingredient(t, "white sauce", units.Millilitre, units.Conversion{Unit: "jar", ToBase: 400})
	f.exec(t, `UPDATE ingredients SET shelf_life_days = 5 WHERE id = ?`, white)
	f.lot(t, white, 200)

	in := baseIn("White sauce", 1, "l")
	in.TakeOver = yes()
	got, err := f.s.Update(ctx, bech.ID, in)
	if err != nil {
		t.Fatalf("rename with Yes and disagreeing Ingredients = %v, want it to succeed (no 500)", err)
	}
	if got.BaseIngredientID != white {
		t.Fatalf("Ingredient = %d, want the plain one %d", got.BaseIngredientID, white)
	}
	ing, _ := f.ings.Get(ctx, white)
	if ing.ShelfLifeDays == nil || *ing.ShelfLifeDays != 5 {
		t.Errorf("Shelf Life = %v, want the taken-over Ingredient's 5", ing.ShelfLifeDays)
	}
	if v, _ := f.conversion(t, white, "jar"); v != 400 {
		t.Errorf("jar = %v, want 400: the taken-over Ingredient's value wins", v)
	}
	if v, ok := f.conversion(t, white, "tin"); !ok || v != 250 {
		t.Errorf("tin = %v, %v; want the former Ingredient's non-conflicting conversion kept", v, ok)
	}
	if v, _ := f.conversion(t, white, "batch"); v != 1000 {
		t.Errorf("batch = %v, want the Base recipe's own 1000 kept", v)
	}
	if f.lotsOf(t, white) != 1 {
		t.Error("its Stock stays")
	}
}

func TestCreateAndToBaseYesKeepTheTakenOverIngredientsShelfLifeAndConversions(t *testing.T) {
	f := newBaseFixture(t)
	jar := f.ingredient(t, "béchamel", units.Millilitre, units.Conversion{Unit: "jar", ToBase: 400}, units.Conversion{Unit: "batch", ToBase: 77})
	f.exec(t, `UPDATE ingredients SET shelf_life_days = 5 WHERE id = ?`, jar)
	in := baseIn("Béchamel", 1, "l")
	in.TakeOver = yes()
	r, err := f.s.Create(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	ing, _ := f.ings.Get(ctx, r.BaseIngredientID)
	if ing.ShelfLifeDays == nil || *ing.ShelfLifeDays != 5 {
		t.Errorf("Shelf Life = %v, want 5", ing.ShelfLifeDays)
	}
	if v, _ := f.conversion(t, jar, "jar"); v != 400 {
		t.Errorf("jar = %v", v)
	}
	if v, _ := f.conversion(t, jar, "batch"); v != 1000 {
		t.Errorf("batch = %v, want the Yield's 1000 replacing 77", v)
	}

	jar2 := f.ingredient(t, "pesto", units.Gram, units.Conversion{Unit: "jar", ToBase: 190})
	f.exec(t, `UPDATE ingredients SET shelf_life_days = 9 WHERE id = ?`, jar2)
	p := f.createPlain(t, plainIn("Pesto", ln(f.ingredient(t, "basil", units.Gram), 50, "g")))
	if _, err := f.s.ToBase(ctx, p.ID, recipe.ToBaseInput{Yield: 200, YieldUnit: "g", TakeOver: yes()}); err != nil {
		t.Fatal(err)
	}
	ing2, _ := f.ings.Get(ctx, jar2)
	if ing2.ShelfLifeDays == nil || *ing2.ShelfLifeDays != 9 {
		t.Errorf("to-base Yes: Shelf Life = %v, want 9", ing2.ShelfLifeDays)
	}
}

// API additions.

func TestSummariesCarryTheBaseIngredientId(t *testing.T) {
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	f.createPlain(t, plainIn("Lasagne", callFor(bech, 500, "ml")))
	base, _ := f.s.List(ctx, store_ListFilter("base", ""))
	plain, _ := f.s.List(ctx, store_ListFilter("", ""))
	if len(base) != 1 || base[0].BaseIngredientID != bech.BaseIngredientID || len(plain) != 1 || plain[0].BaseIngredientID != 0 {
		t.Errorf("base %+v plain %+v, want baseIngredientId on the Base recipe only", base, plain)
	}
}

func TestLinesCarryTheDefaultNeededAtBesideTheOverride(t *testing.T) {
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	in := plainIn("Lasagne", callFor(bech, 500, "ml"))
	in.Steps = []recipe.Step{active("Prep", 5), active("Layer the lasagne with béchamel", 10)}
	in.Lines[0].NeededAtStep = intp(0)
	got := f.createPlain(t, in)
	if l := got.Lines[0]; l.NeededAt != 0 || l.NeededAtDefault != 1 || l.NeededAtStep == nil {
		t.Errorf("line = %+v, want effective 0, default 1 and the stored override", l)
	}
	in.Lines[0].NeededAtStep = nil
	got, _ = f.s.Update(ctx, got.ID, in)
	if l := got.Lines[0]; l.NeededAt != 1 || l.NeededAtDefault != 1 {
		t.Errorf("no override: %+v, want both 1", l)
	}
}

func TestListForARecipeMarksTheBaseRecipesThatWouldMakeACycle(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	roux := f.createBase(t, baseIn("Roux", 1, "kg", ln(milk, 1, "l")))
	bech := f.createBase(t, baseIn("Béchamel", 1, "l", callFor(roux, 100, "g")))
	stock := f.createBase(t, baseIn("Stock", 1, "l", ln(milk, 1, "l")))
	lasagne := f.createPlain(t, plainIn("Lasagne", callFor(bech, 500, "ml")))

	would := func(forID int64) map[string]bool {
		list, err := f.s.List(ctx, store_ListFilterFor("base", forID))
		if err != nil {
			t.Fatal(err)
		}
		out := map[string]bool{}
		for _, s := range list {
			out[s.Name] = s.WouldCycle
		}
		return out
	}
	// A line of Roux calling for X cycles when X is Roux itself or reaches Roux (Béchamel calls Roux).
	if got := would(roux.ID); !reflect.DeepEqual(got, map[string]bool{"Roux": true, "Béchamel": true, "Stock": false}) {
		t.Errorf("for Roux = %v", got)
	}
	// A plannable Recipe can never be called for, so nothing cycles.
	if got := would(lasagne.ID); !reflect.DeepEqual(got, map[string]bool{"Roux": false, "Béchamel": false, "Stock": false}) {
		t.Errorf("for Lasagne = %v", got)
	}
	_ = stock
	if got := would(0); got["Roux"] || got["Béchamel"] {
		t.Errorf("without For nothing is marked: %v", got)
	}
}

func TestTheMergeOfferCountsTheExclusionsItMoves(t *testing.T) {
	f := newBaseFixture(t)
	s := f.bulkSetup(t)
	if _, err := f.ings.SetConversion(ctx, s.bech.BaseIngredientID, units.Conversion{Unit: "jar", ToBase: 400}); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Sam", "Kim"} {
		f.exec(t, `INSERT INTO member_ingredient_exclusions(member_id, ingredient_id) VALUES (?,?)`, f.member(t, name, 0), s.jar)
	}
	res, err := f.s.Link(ctx, s.bech.ID, []int64{mustLineID(t, f, s.lasagne.ID), mustLineID(t, f, s.moussaka.ID), mustLineID(t, f, s.cann.ID)})
	if err != nil || len(res.MergeOffer) != 1 || res.MergeOffer[0].Exclusions != 2 {
		t.Errorf("link = %+v, %v; want a merge offer with exclusions 2", res, err)
	}
}

// Nits.

func TestMergingAPlainIngredientIntoABaseRecipesIngredientRefreshesTheUsersCachedTotalTime(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	bin := baseIn("Béchamel", 1, "l", ln(milk, 1000, "ml"))
	bin.Steps = []recipe.Step{active("Whisk", 20)}
	bech := f.createBase(t, bin)
	sauce := f.ingredient(t, "sauce blanche", units.Millilitre)
	cin := plainIn("Croque", ln(sauce, 100, "ml"))
	cin.Steps = []recipe.Step{active("Grill", 10)}
	croque := f.createPlain(t, cin)
	total := func(id int64) (n int) {
		f.db.QueryRow(`SELECT total_minutes FROM recipes WHERE id = ?`, id).Scan(&n)
		return
	}
	if total(croque.ID) != 10 {
		t.Fatalf("Croque total = %d before the merge, want 10", total(croque.ID))
	}
	if _, err := f.ings.Merge(ctx, sauce, bech.BaseIngredientID, ingredient.Resolution{}); err != nil {
		t.Fatalf("Merge: %v", err)
	}
	if total(croque.ID) != 30 {
		t.Errorf("Croque total = %d after the merge, want 30: its line is a Base recipe line now", total(croque.ID))
	}
}

func TestDeletingAnUnusedBaseRecipeWhoseIngredientStaysDropsTheBatchAndPortionConversions(t *testing.T) {
	f := newBaseFixture(t)
	b := f.createBase(t, baseIn("Stock", 4, "portion"))
	f.exec(t, `INSERT INTO ingredient_conversions(ingredient_id, unit, to_base) VALUES (?, 'jar', 2)`, b.BaseIngredientID)
	f.lot(t, b.BaseIngredientID, 2)
	if err := f.s.Delete(ctx, b.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	for _, u := range []string{"batch", "portion"} {
		if _, ok := f.conversion(t, b.BaseIngredientID, u); ok {
			t.Errorf("the %s conversion must go with the Base recipe", u)
		}
	}
	if _, ok := f.conversion(t, b.BaseIngredientID, "jar"); !ok {
		t.Error("the User's own conversions stay")
	}
	if f.nameKey(t, b.BaseIngredientID) != "stock" {
		t.Errorf("key = %q, want the plain name key", f.nameKey(t, b.BaseIngredientID))
	}
}

func TestDeletingAnUnusedBaseRecipeWhoseNameAPlainIngredientHoldsStillSucceeds(t *testing.T) {
	f := newBaseFixture(t)
	b := f.createBase(t, baseIn("Stock", 1, "l"))
	f.ingredient(t, "stock", units.Millilitre)
	f.lot(t, b.BaseIngredientID, 500)
	if err := f.s.Delete(ctx, b.ID); err != nil {
		t.Fatalf("Delete with a plain Ingredient holding the name = %v, want it to succeed", err)
	}
	if _, err := f.ings.Get(ctx, b.BaseIngredientID); err != nil {
		t.Errorf("the Ingredient with Stock stays: %v", err)
	}
	if k := f.nameKey(t, b.BaseIngredientID); k == "stock" {
		t.Error("it cannot take the plain key a plain Ingredient holds")
	}
}

func TestLinkAndUnlinkRefuseAnIdThatIsNotABaseRecipe(t *testing.T) {
	f := newBaseFixture(t)
	s := f.bulkSetup(t)
	line := mustLineID(t, f, s.lasagne.ID)
	if err := f.s.Unlink(ctx, s.lasagne.ID, []int64{line}); !errors.Is(err, storeErrNotFound) {
		t.Errorf("Unlink with a plannable id = %v, want ErrNotFound (404)", err)
	}
	if _, err := f.s.Link(ctx, s.lasagne.ID, []int64{line}); !errors.Is(err, storeErrNotFound) {
		t.Errorf("Link with a plannable id = %v, want ErrNotFound", err)
	}
	if err := f.s.Unlink(ctx, 99999, []int64{line}); !errors.Is(err, storeErrNotFound) {
		t.Errorf("Unlink with an unknown id = %v, want ErrNotFound", err)
	}
}

func TestNeededAtStepMustNameANonAdvanceStep(t *testing.T) {
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	in := plainIn("Lasagne", callFor(bech, 500, "ml"))
	in.Steps = []recipe.Step{{Text: "Marinate", Kind: schedule.Advance, LeadTimeMinutes: 60}, active("Layer", 10)}
	in.Lines[0].NeededAtStep = intp(0)
	_, err := f.s.Create(ctx, in)
	wantValidation(t, err, "lines[0].neededAtStep", recipe.CodeNeededAtStepInvalid)
	in.Lines[0].NeededAtStep = intp(1)
	if _, err := f.s.Create(ctx, in); err != nil {
		t.Errorf("an active Step: %v", err)
	}
}
