package store_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// BR-B, linking an existing line to a Base recipe (§3.7) and the bulk link (§3.8). Nothing is ever linked silently.

// linkSetup: Lasagne has "500 ml béchamel" (optional, with a note) on the plain Ingredient 'béchamel'; Béchamel is
// a Base recipe with its own Ingredient (answered No at creation).
type linkSetup struct {
	jar     int64
	lasagne recipe.Recipe
	line    int64
	bech    recipe.Recipe
}

func (f *bf) linkSetup(t *testing.T) linkSetup {
	t.Helper()
	jar := f.ingredient(t, "béchamel", units.Millilitre, units.Conversion{Unit: "jar", ToBase: 400})
	l := ln(jar, 500, "ml")
	l.Optional, l.Note = true, "warm"
	lasagne := f.createPlain(t, plainIn("Lasagne", l))
	in := baseIn("Béchamel", 1, "l")
	in.TakeOver = no()
	bech := f.createBase(t, in)
	return linkSetup{jar: jar, lasagne: lasagne, line: lasagne.Lines[0].ID, bech: bech}
}

func TestLinkingALineRepointsItKeepsItsAmountAndRemembersTheOldIngredient(t *testing.T) {
	f := newBaseFixture(t)
	s := f.linkSetup(t)
	if s.line == 0 {
		t.Fatal("Get must return each line's id")
	}
	got, err := f.s.LinkLine(ctx, s.lasagne.ID, s.line, recipe.LinkRequest{BaseRecipeID: s.bech.ID})
	if err != nil {
		t.Fatalf("LinkLine: %v", err)
	}
	l := got.Lines[0]
	if l.IngredientID != s.bech.BaseIngredientID || l.Quantity != 500 || l.Unit != "ml" || !l.Optional || l.Note != "warm" {
		t.Errorf("line = %+v, want the Base recipe's Ingredient with 500 ml, optional and the note carried over", l)
	}
	if l.LinkedFromIngredientID != s.jar || l.Base == nil || l.Base.ID != s.bech.ID || l.NeededAtStep != nil {
		t.Errorf("line = %+v, want it to remember the plain Ingredient %d, call for Béchamel, with Needed at at the default", l, s.jar)
	}
	if f.nameKey(t, s.jar) != "béchamel" {
		t.Error("the old plain Ingredient is kept as it is")
	}
}

func TestLinkingALineWhoseUnitDoesNotConvertAsksForTheUnitConversionOnTheBaseRecipesIngredient(t *testing.T) {
	f := newBaseFixture(t)
	s := f.linkSetup(t)
	jarLine := f.createPlain(t, plainIn("Cannelloni", ln(s.jar, 2, "jar")))
	_, err := f.s.LinkLine(ctx, jarLine.ID, jarLine.Lines[0].ID, recipe.LinkRequest{BaseRecipeID: s.bech.ID})
	var ue *recipe.UnknownUnitError
	if !errors.As(err, &ue) || ue.IngredientID != s.bech.BaseIngredientID || ue.Unit != "jar" || ue.Field != "lines[0].unit" {
		t.Fatalf("err = %v, want the UnknownUnitError shape on the Base recipe's Ingredient", err)
	}
	if id, _ := f.lineIngredient(t, jarLine.Lines[0].ID); id != s.jar {
		t.Error("a refused link leaves the line")
	}
}

func TestLinkingALineThatWouldMakeACycleIsRefused(t *testing.T) {
	f := newBaseFixture(t)
	s := f.linkSetup(t)
	roux := f.createBase(t, baseIn("Roux", 1, "kg", ln(s.jar, 100, "ml"))) // a plain béchamel line on Roux
	if _, err := f.s.Update(ctx, s.bech.ID, baseIn("Béchamel", 1, "l", callFor(roux, 100, "g"))); err != nil {
		t.Fatal(err)
	}
	_, err := f.s.LinkLine(ctx, roux.ID, mustLineID(t, f, roux.ID), recipe.LinkRequest{BaseRecipeID: s.bech.ID})
	var ce *recipe.CycleError
	if !errors.As(err, &ce) || !reflect.DeepEqual(ce.Path, []string{"Roux", "Béchamel", "Roux"}) {
		t.Errorf("err = %v, want *CycleError [Roux Béchamel Roux] (422 base_recipe_cycle)", err)
	}
}

func mustLineID(t *testing.T, f *bf, recipeID int64) int64 {
	t.Helper()
	var id int64
	if err := f.db.QueryRow(`SELECT id FROM recipe_lines WHERE recipe_id = ? ORDER BY position LIMIT 1`, recipeID).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func TestLinkingNeedsExactlyOneWayAndALineOfThatRecipe(t *testing.T) {
	f := newBaseFixture(t)
	s := f.linkSetup(t)
	_, err := f.s.LinkLine(ctx, s.lasagne.ID, s.line, recipe.LinkRequest{})
	wantValidation(t, err, "link", recipe.CodeLinkInvalid)
	_, err = f.s.LinkLine(ctx, s.lasagne.ID, s.line, recipe.LinkRequest{BaseRecipeID: s.bech.ID, ConvertRecipeID: 7})
	wantValidation(t, err, "link", recipe.CodeLinkInvalid)
	if _, err := f.s.LinkLine(ctx, s.lasagne.ID, 99999, recipe.LinkRequest{BaseRecipeID: s.bech.ID}); !errors.Is(err, storeErrNotFound) {
		t.Errorf("unknown line = %v, want ErrNotFound", err)
	}
	other := f.createPlain(t, plainIn("Other", ln(s.jar, 1, "ml")))
	if _, err := f.s.LinkLine(ctx, other.ID, s.line, recipe.LinkRequest{BaseRecipeID: s.bech.ID}); !errors.Is(err, storeErrNotFound) {
		t.Errorf("a line of another Recipe = %v, want ErrNotFound", err)
	}
	if _, err := f.s.LinkLine(ctx, s.lasagne.ID, s.line, recipe.LinkRequest{BaseRecipeID: 99999}); !errors.Is(err, storeErrNotFound) {
		t.Errorf("unknown Base recipe = %v, want ErrNotFound", err)
	}
	if _, err := f.s.LinkLine(ctx, s.lasagne.ID, s.line, recipe.LinkRequest{BaseRecipeID: s.lasagne.ID}); err == nil {
		t.Error("a plannable Recipe is not a Base recipe to link to (it needs ConvertRecipeID)")
	}
	if _, err := f.s.LinkLine(ctx, s.lasagne.ID, s.line, recipe.LinkRequest{BaseRecipeID: s.bech.ID}); err != nil {
		t.Fatal(err)
	}
	_, err = f.s.LinkLine(ctx, s.lasagne.ID, s.line, recipe.LinkRequest{BaseRecipeID: s.bech.ID})
	wantValidation(t, err, "lineId", recipe.CodeLineNotPlain)
}

func TestLinkWithCreateAddsANewEmptyBaseRecipeNamedFromTheLinesIngredientAfterTheTakeOverAsk(t *testing.T) {
	f := newBaseFixture(t)
	jar := f.ingredient(t, "Roux", units.Gram)
	lasagne := f.createPlain(t, plainIn("Lasagne", ln(jar, 80, "g")))
	line := lasagne.Lines[0].ID
	req := recipe.LinkRequest{Create: &recipe.NewBase{Name: "Roux", Yield: 80, YieldUnit: "g"}}

	_, err := f.s.LinkLine(ctx, lasagne.ID, line, req)
	var ask *recipe.TakeOverError
	if !errors.As(err, &ask) || ask.Ingredient.ID != jar {
		t.Fatalf("LinkLine create = %v, want the take-over ask: the line's own Ingredient has the name (§3.2)", err)
	}
	if f.recipeCount(t) != 1 {
		t.Error("asking creates nothing")
	}

	req.TakeOver = no()
	got, err := f.s.LinkLine(ctx, lasagne.ID, line, req)
	if err != nil {
		t.Fatalf("LinkLine create with No: %v", err)
	}
	l := got.Lines[0]
	if l.Base == nil || !l.Base.Empty || l.Base.Name != "Roux" || l.IngredientID == jar || l.LinkedFromIngredientID != jar || l.Quantity != 80 {
		t.Errorf("line = %+v, want a line of the new empty Base recipe Roux, remembering the plain Ingredient", l)
	}
	base, _ := f.s.Get(ctx, l.Base.ID)
	if !base.IsBase() || base.Yield != 80 || base.YieldUnit != "g" || len(base.Lines) != 0 {
		t.Errorf("new Base recipe = %+v, want Yield 80 g and no lines (§4.6)", base)
	}

	// Yes: the line's own Ingredient is taken over, so there is nothing to remember.
	jar2 := f.ingredient(t, "Stock cube", units.Gram)
	l2 := f.createPlain(t, plainIn("Soup", ln(jar2, 10, "g")))
	got, err = f.s.LinkLine(ctx, l2.ID, l2.Lines[0].ID, recipe.LinkRequest{Create: &recipe.NewBase{Name: "Stock cube", Yield: 10, YieldUnit: "g"}, TakeOver: yes()})
	if err != nil || got.Lines[0].IngredientID != jar2 || got.Lines[0].Base == nil {
		t.Errorf("create with Yes = %+v, %v; want the line's Ingredient taken over and now a Base recipe's", got.Lines, err)
	}
}

func TestLinkWithConvertRunsToBaseFirstInTheSameTransaction(t *testing.T) {
	f := newBaseFixture(t)
	p := f.seedPesto(t)
	jar := f.ingredient(t, "pesto jar", units.Gram, units.Conversion{Unit: "jar", ToBase: 190})
	pasta := f.createPlain(t, plainIn("Pasta", ln(jar, 1, "jar")))
	// Unit does not convert for Pesto's Ingredient (no jar conversion): the whole thing rolls back.
	_, err := f.s.LinkLine(ctx, pasta.ID, pasta.Lines[0].ID, recipe.LinkRequest{ConvertRecipeID: p.pesto.ID, Yield: 200, YieldUnit: "g"})
	var ue *recipe.UnknownUnitError
	if !errors.As(err, &ue) {
		t.Fatalf("err = %v, want an UnknownUnitError", err)
	}
	if got, _ := f.s.Get(ctx, p.pesto.ID); got.IsBase() || f.count(t, "planned_meals") != 6 || f.count(t, "slot_rules") != 2 {
		t.Error("a failed link leaves Pesto plannable with its plan and rules: one transaction")
	}

	ok := f.createPlain(t, plainIn("Bruschetta", ln(jar, 50, "g")))
	got, err := f.s.LinkLine(ctx, ok.ID, ok.Lines[0].ID, recipe.LinkRequest{ConvertRecipeID: p.pesto.ID, Yield: 200, YieldUnit: "g"})
	if err != nil {
		t.Fatalf("LinkLine convert: %v", err)
	}
	if got.Lines[0].Base == nil || got.Lines[0].Base.ID != p.pesto.ID {
		t.Errorf("line = %+v, want it calling for Pesto", got.Lines[0])
	}
	if pesto, _ := f.s.Get(ctx, p.pesto.ID); !pesto.IsBase() || f.exists(t, "planned_meals", p.tomorrow) {
		t.Error("Pesto became a Base recipe with the to-base effects (Planned Meals from today removed)")
	}
}

func TestUseAsAPlainIngredientRestoresTheOldOneKeepsTheAmountAndClearsNeededAt(t *testing.T) {
	f := newBaseFixture(t)
	s := f.linkSetup(t)
	in := plainIn("Lasagne", ln(s.jar, 500, "ml"))
	in.Steps = []recipe.Step{{Text: "Cook", Kind: "active", DurationMinutes: 5}}
	lasagne, err := f.s.Update(ctx, s.lasagne.ID, in)
	if err != nil {
		t.Fatal(err)
	}
	line := lasagne.Lines[0].ID
	linked, err := f.s.LinkLine(ctx, lasagne.ID, line, recipe.LinkRequest{BaseRecipeID: s.bech.ID})
	if err != nil {
		t.Fatal(err)
	}
	// Set an override through the editor's PUT: the line (by id) keeps what the server remembers.
	put := plainIn("Lasagne", recipe.Line{ID: linked.Lines[0].ID, IngredientID: linked.Lines[0].IngredientID, Quantity: 500, Unit: "ml", NeededAtStep: intp(0)})
	put.Steps = in.Steps
	linked, err = f.s.Update(ctx, lasagne.ID, put)
	if err != nil || linked.Lines[0].LinkedFromIngredientID != s.jar || linked.Lines[0].NeededAtStep == nil {
		t.Fatalf("PUT of the same Base recipe line = %+v, %v; want linked_from kept (matched by line id) and Needed at 0", linked.Lines, err)
	}

	back, err := f.s.UnlinkLine(ctx, lasagne.ID, linked.Lines[0].ID, 0)
	if err != nil {
		t.Fatalf("UnlinkLine: %v", err)
	}
	l := back.Lines[0]
	if l.IngredientID != s.jar || l.Quantity != 500 || l.Unit != "ml" || l.NeededAtStep != nil || l.LinkedFromIngredientID != 0 || l.Base != nil {
		t.Errorf("line = %+v, want the plain Ingredient back with 500 ml, no Needed at and nothing remembered", l)
	}
	_, err = f.s.UnlinkLine(ctx, lasagne.ID, l.ID, 0)
	wantValidation(t, err, "lineId", recipe.CodeLineNotBase)
}

func TestTheEditorsPutLinksALineByBaseRecipeIdAndTheServerKeepsTheOldIngredient(t *testing.T) {
	f := newBaseFixture(t)
	s := f.linkSetup(t)
	put := plainIn("Lasagne", recipe.Line{ID: s.line, BaseRecipeID: s.bech.ID, Quantity: 500, Unit: "ml"})
	got, err := f.s.Update(ctx, s.lasagne.ID, put)
	if err != nil {
		t.Fatalf("PUT: %v", err)
	}
	if l := got.Lines[0]; l.Base == nil || l.LinkedFromIngredientID != s.jar {
		t.Errorf("line = %+v, want a Base recipe line remembering the plain Ingredient (linkedFromIngredientId kept by the server)", l)
	}
}

func TestUseAsAPlainIngredientNeedsAnIngredientWhenNothingIsRememberedOrItIsGone(t *testing.T) {
	f := newBaseFixture(t)
	milk, _, _ := f.basics(t)
	// A line made a Base recipe line by a take-over remembers nothing.
	jar := f.ingredient(t, "gravy", units.Millilitre)
	l := f.createPlain(t, plainIn("Roast", ln(jar, 200, "ml")))
	in := baseIn("Gravy", 1, "l")
	in.TakeOver = yes()
	f.createBase(t, in)
	line := mustLineID(t, f, l.ID)
	_, err := f.s.UnlinkLine(ctx, l.ID, line, 0)
	wantValidation(t, err, "ingredientId", recipe.CodeIngredientRequired)
	back, err := f.s.UnlinkLine(ctx, l.ID, line, milk)
	if err != nil || back.Lines[0].IngredientID != milk || back.Lines[0].Base != nil {
		t.Errorf("Unlink with an Ingredient = %+v, %v", back.Lines, err)
	}

	// The remembered Ingredient was deleted: the column is NULL, so one must be named.
	s := f.linkSetup(t)
	linked, _ := f.s.LinkLine(ctx, s.lasagne.ID, s.line, recipe.LinkRequest{BaseRecipeID: s.bech.ID})
	f.exec(t, `UPDATE recipe_lines SET linked_from_ingredient_id = NULL WHERE id = ?`, s.line)
	_, err = f.s.UnlinkLine(ctx, s.lasagne.ID, linked.Lines[0].ID, 0)
	wantValidation(t, err, "ingredientId", recipe.CodeIngredientRequired)
}

func TestTheRememberedIngredientFollowsAMergeAndItsDeletionNullsIt(t *testing.T) {
	f := newBaseFixture(t)
	s := f.linkSetup(t)
	if _, err := f.s.LinkLine(ctx, s.lasagne.ID, s.line, recipe.LinkRequest{BaseRecipeID: s.bech.ID}); err != nil {
		t.Fatal(err)
	}
	// The remembered plain Ingredient is merged into another: the column is rewritten to the merge target.
	target := f.ingredient(t, "white sauce", units.Millilitre, units.Conversion{Unit: "jar", ToBase: 400})
	if _, err := f.ings.Merge(ctx, s.jar, target, ingredient.Resolution{}); err != nil {
		t.Fatalf("Merge: %v", err)
	}
	if _, from := f.lineIngredient(t, s.line); !from.Valid || from.Int64 != target {
		t.Errorf("linked_from_ingredient_id = %v, want %d (a merge rewrites the column)", from, target)
	}
	back, err := f.s.UnlinkLine(ctx, s.lasagne.ID, s.line, 0)
	if err != nil || back.Lines[0].IngredientID != target {
		t.Errorf("Unlink = %+v, %v; want the merge target", back.Lines, err)
	}
}

// Bulk link.

// bulkSetup: Béchamel is a Base recipe made with No; three Recipes use a plain béchamel line.
type bulkSetup struct {
	jar                     int64
	bech                    recipe.Recipe
	lasagne, moussaka, cann recipe.Recipe // moussaka is archived; cann's line is in jars
}

func (f *bf) bulkSetup(t *testing.T) bulkSetup {
	t.Helper()
	jar := f.ingredient(t, "béchamel", units.Millilitre, units.Conversion{Unit: "jar", ToBase: 400})
	s := bulkSetup{jar: jar}
	s.lasagne = f.createPlain(t, plainIn("Lasagne", ln(jar, 500, "ml")))
	s.moussaka = f.createPlain(t, plainIn("Moussaka", ln(jar, 300, "ml")))
	if _, err := f.s.SetArchived(ctx, s.moussaka.ID, true); err != nil {
		t.Fatal(err)
	}
	s.cann = f.createPlain(t, plainIn("Cannelloni", ln(jar, 2, "jar")))
	in := baseIn("Béchamel", 1, "l")
	in.TakeOver = no()
	s.bech = f.createBase(t, in)
	return s
}

func TestNothingIsLinkedByCreatingABaseRecipe(t *testing.T) {
	f := newBaseFixture(t)
	s := f.bulkSetup(t)
	for _, r := range []recipe.Recipe{s.lasagne, s.moussaka, s.cann} {
		if id, from := f.lineIngredient(t, mustLineID(t, f, r.ID)); id != s.jar || from.Valid {
			t.Errorf("%s: line on %d (linked from %v), want it still plain", r.Name, id, from)
		}
	}
}

func TestLinkCandidatesListThePlainSameNameLinesOnOtherRecipesWithTheirReasons(t *testing.T) {
	f := newBaseFixture(t)
	s := f.bulkSetup(t)
	milk, _, _ := f.basics(t)
	f.createPlain(t, plainIn("Soup", ln(milk, 200, "ml")))                                // another Ingredient: not a candidate
	f.createPlain(t, plainIn("Béchamels on toast", ln(s.bech.BaseIngredientID, 1, "ml"))) // a Base recipe line: not plain
	got, err := f.s.LinkCandidates(ctx, s.bech.ID)
	if err != nil {
		t.Fatalf("LinkCandidates: %v", err)
	}
	type row struct {
		recipe   string
		archived bool
		linkable bool
		reason   string
	}
	var rows []row
	for _, c := range got {
		rows = append(rows, row{c.RecipeName, c.Archived, c.Linkable, c.Reason})
	}
	want := []row{{"Cannelloni", false, false, "unit_unconvertible"}, {"Lasagne", false, true, ""}, {"Moussaka", true, true, ""}}
	if !reflect.DeepEqual(rows, want) {
		t.Fatalf("candidates = %+v, want %+v (ordered by Recipe name, archived Recipes included, jars unconvertible)", rows, want)
	}
	if c := got[1]; c.LineID == 0 || c.IngredientID != s.jar || c.IngredientName != "béchamel" || c.Quantity != 500 || c.Unit != "ml" || c.RecipeID != s.lasagne.ID {
		t.Errorf("candidate = %+v, want the line's id, Ingredient, amount and Recipe", c)
	}
}

func TestLinkCandidatesNeverOfferTheBaseRecipesOwnLinesAndMarkCyclesDisabled(t *testing.T) {
	f := newBaseFixture(t)
	s := f.bulkSetup(t)
	// Béchamel calls for Roux, and Roux has a plain béchamel line: linking it would make a cycle.
	roux := f.createBase(t, baseIn("Roux", 1, "kg", ln(s.jar, 10, "ml")))
	if _, err := f.s.Update(ctx, s.bech.ID, baseIn("Béchamel", 1, "l", callFor(roux, 50, "g"), ln(s.jar, 1, "ml"))); err != nil {
		t.Fatal(err)
	}
	got, _ := f.s.LinkCandidates(ctx, s.bech.ID)
	cyc := false
	for _, c := range got {
		if c.RecipeName == "Béchamel" {
			t.Errorf("the Base recipe's own line is offered: %+v", c)
		}
		if c.RecipeName == "Roux" {
			cyc = !c.Linkable && c.Reason == "cycle"
		}
	}
	if !cyc {
		t.Errorf("candidates = %+v, want Roux's line listed disabled with reason cycle", got)
	}
	if _, err := f.s.LinkCandidates(ctx, s.lasagne.ID); !errors.Is(err, storeErrNotFound) {
		t.Errorf("LinkCandidates of a plannable Recipe = %v, want ErrNotFound", err)
	}
}

func TestBulkLinkIsAllOrNothingAndRefusesALineThatIsNotACandidate(t *testing.T) {
	f := newBaseFixture(t)
	s := f.bulkSetup(t)
	lasagneLine, canLine := mustLineID(t, f, s.lasagne.ID), mustLineID(t, f, s.cann.ID)
	_, err := f.s.Link(ctx, s.bech.ID, []int64{lasagneLine, canLine}) // cannelloni's jars do not convert
	wantValidation(t, err, "lineIds", recipe.CodeNotACandidate)
	if id, _ := f.lineIngredient(t, lasagneLine); id != s.jar {
		t.Error("all or nothing: the valid line must not be linked when another is refused")
	}
	milk, _, _ := f.basics(t)
	soup := f.createPlain(t, plainIn("Soup", ln(milk, 200, "ml")))
	_, err = f.s.Link(ctx, s.bech.ID, []int64{lasagneLine, mustLineID(t, f, soup.ID)})
	wantValidation(t, err, "lineIds", recipe.CodeNotACandidate)
	_, err = f.s.Link(ctx, s.bech.ID, nil)
	wantValidation(t, err, "lineIds", recipe.CodeNotACandidate)
}

func TestBulkLinkRepointsTheTickedLinesAndOffersTheMergeOnlyWhenNoLineUsesTheOldIngredient(t *testing.T) {
	f := newBaseFixture(t)
	s := f.bulkSetup(t)
	f.lot(t, s.jar, 400)
	f.exec(t, `INSERT INTO products(name, ingredient_id, pack_size, created_at, updated_at) VALUES ('Jar of béchamel', ?, 400, 't', 't')`, s.jar)
	lasagneLine, moussakaLine, canLine := mustLineID(t, f, s.lasagne.ID), mustLineID(t, f, s.moussaka.ID), mustLineID(t, f, s.cann.ID)

	res, err := f.s.Link(ctx, s.bech.ID, []int64{lasagneLine, moussakaLine})
	if err != nil {
		t.Fatalf("Link: %v", err)
	}
	if !reflect.DeepEqual(res.Linked, []int64{lasagneLine, moussakaLine}) {
		t.Errorf("linked = %v", res.Linked)
	}
	for _, id := range []int64{lasagneLine, moussakaLine} {
		if ing, from := f.lineIngredient(t, id); ing != s.bech.BaseIngredientID || !from.Valid || from.Int64 != s.jar {
			t.Errorf("line %d on %d (linked from %v), want the Base recipe's Ingredient remembering the plain one", id, ing, from)
		}
	}
	if len(res.MergeOffer) != 0 {
		t.Errorf("mergeOffer = %+v, want none: Cannelloni's jar line still uses the plain Ingredient (never merged while any line uses it)", res.MergeOffer)
	}

	// Cannelloni's unit is made convertible; linking the last candidate leaves the plain Ingredient on no line.
	if _, err := f.ings.SetConversion(ctx, s.bech.BaseIngredientID, units.Conversion{Unit: "jar", ToBase: 400}); err != nil {
		t.Fatal(err)
	}
	res, err = f.s.Link(ctx, s.bech.ID, []int64{canLine})
	if err != nil {
		t.Fatal(err)
	}
	want := []recipe.MergeOffer{{IngredientID: s.jar, Name: "béchamel", StockLots: 1, Products: 1}}
	if !reflect.DeepEqual(res.MergeOffer, want) {
		t.Errorf("mergeOffer = %+v, want %+v (what moves: its Stock Lots and Products)", res.MergeOffer, want)
	}
	if left, _ := f.s.LinkCandidates(ctx, s.bech.ID); len(left) != 0 {
		t.Errorf("candidates left = %+v, want none", left)
	}
	if f.nameKey(t, s.jar) != "béchamel" {
		t.Error("the plain Ingredient is kept: it is never merged silently")
	}
}

func TestUnlinkReversesABulkLinkAllOrNothing(t *testing.T) {
	f := newBaseFixture(t)
	s := f.bulkSetup(t)
	lasagneLine, moussakaLine := mustLineID(t, f, s.lasagne.ID), mustLineID(t, f, s.moussaka.ID)
	if _, err := f.s.Link(ctx, s.bech.ID, []int64{lasagneLine, moussakaLine}); err != nil {
		t.Fatal(err)
	}
	canLine := mustLineID(t, f, s.cann.ID)
	_, err := f.s.Unlink(ctx, s.bech.ID, []int64{lasagneLine, canLine}) // Cannelloni's line is not a Base recipe line
	wantValidation(t, err, "lineIds", recipe.CodeLineNotBase)
	if id, _ := f.lineIngredient(t, lasagneLine); id != s.bech.BaseIngredientID {
		t.Error("all or nothing: Lasagne stays linked when another line is refused")
	}
	if _, err := f.s.Unlink(ctx, s.bech.ID, []int64{lasagneLine, moussakaLine}); err != nil {
		t.Fatalf("Unlink: %v", err)
	}
	for _, id := range []int64{lasagneLine, moussakaLine} {
		if ing, from := f.lineIngredient(t, id); ing != s.jar || from.Valid {
			t.Errorf("line %d on %d (linked from %v), want the plain Ingredient back and nothing remembered", id, ing, from)
		}
	}
}
