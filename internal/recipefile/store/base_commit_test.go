package store_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strconv"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	recipestore "github.com/fabbarix/feeder-ng/internal/recipe/store"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/recipefile/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// BR-C commit half (docs/dev/design/base-recipes.md §11.3, ADR 0015): every answer of the Base recipe tiles is written
// inside the one import transaction. The recipefile store under test (f.s) must wire the Base recipe lifecycle itself:
// these tests only seed through the Recipe store and read the tables back.
//
// File layout used below: recipes[0] Lasagne (plannable; line 0 "lasagne sheets", line 1 the line under test),
// recipes[1] the other Recipe of the file.

const (
	lineB   = "$.recipes[0].ingredients[1]"
	otherAt = "$.recipes[1]"
)

// ---- seeding, through the Recipe store -------------------------------------------------------------------------------

type ingSource struct{ s *ingstore.Store }

func (g ingSource) Units(ctx context.Context, id int64) (units.Ingredient, bool, error) {
	i, err := g.s.Get(ctx, id)
	if errors.Is(err, ingstore.ErrNotFound) {
		return units.Ingredient{}, false, nil
	}
	if err != nil {
		return units.Ingredient{}, false, err
	}
	return i.Units(), true, nil
}

type seeded struct {
	*fixture
	ings *ingstore.Store
	rs   *recipestore.Store
}

func newSeeded(t *testing.T) *seeded {
	t.Helper()
	f := newFixture(t)
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	ings := ingstore.New(f.db, clk, ingstore.WithBaseRecipes(recipestore.NewBaseRecipePort(f.db)))
	return &seeded{fixture: f, ings: ings, rs: recipestore.New(f.db, clk, ingSource{ings}).WithIngredients(ings)}
}

func (f *seeded) ingredient(t *testing.T, name string, base units.Base) int64 {
	t.Helper()
	i, err := f.ings.Create(ctx, ingredient.Input{Name: name, Base: base})
	if err != nil {
		t.Fatal(err)
	}
	return i.ID
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }

func yes() *bool { b := true; return &b }

func (f *seeded) baseRecipe(t *testing.T, name string, yield float64, unit string, lines ...recipe.Line) recipe.Recipe {
	t.Helper()
	r, err := f.rs.Create(ctx, recipe.Input{Name: name, Yield: yield, YieldUnit: unit, BaseRecipe: yes(), Lines: lines})
	if err != nil {
		t.Fatalf("Create base recipe %q: %v", name, err)
	}
	return r
}

func (f *seeded) plannable(t *testing.T, name string, lines ...recipe.Line) recipe.Recipe {
	t.Helper()
	r, err := f.rs.Create(ctx, recipe.Input{Name: name, Yield: 4, Lines: lines})
	if err != nil {
		t.Fatalf("Create %q: %v", name, err)
	}
	return r
}

func (f *seeded) exec(t *testing.T, q string, args ...any) int64 {
	t.Helper()
	res, err := f.db.Exec(q, args...)
	if err != nil {
		t.Fatalf("%s: %v", q, err)
	}
	id, _ := res.LastInsertId()
	return id
}

// ---- reading the tables ------------------------------------------------------------------------------------------------

type recipeRow struct {
	id        int64
	baseIng   sql.NullInt64
	yield     float64
	yieldUnit sql.NullString
}

func (f *fixture) recipeNamed(t *testing.T, name string) recipeRow {
	t.Helper()
	var r recipeRow
	err := f.db.QueryRow(`SELECT id, base_ingredient_id, yield, yield_unit FROM recipes WHERE name = ?`, name).Scan(&r.id, &r.baseIng, &r.yield, &r.yieldUnit)
	if err != nil {
		t.Fatalf("recipe %q: %v", name, err)
	}
	return r
}

func (f *fixture) lineIngredients(t *testing.T, recipeID int64) []int64 {
	t.Helper()
	rows, err := f.db.Query(`SELECT ingredient_id FROM recipe_lines WHERE recipe_id = ? ORDER BY position`, recipeID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		out = append(out, id)
	}
	return out
}

func (f *fixture) lineAt(t *testing.T, recipeID int64, pos int) (ing int64, qty float64, unit string) {
	t.Helper()
	err := f.db.QueryRow(`SELECT ingredient_id, quantity, unit FROM recipe_lines WHERE recipe_id = ? AND position = ?`, recipeID, pos).Scan(&ing, &qty, &unit)
	if err != nil {
		t.Fatalf("line %d of recipe %d: %v", pos, recipeID, err)
	}
	return ing, qty, unit
}

func (f *fixture) nameKeyOf(t *testing.T, ingredientID int64) string {
	t.Helper()
	var k string
	if err := f.db.QueryRow(`SELECT name_key FROM ingredients WHERE id = ?`, ingredientID).Scan(&k); err != nil {
		t.Fatal(err)
	}
	return k
}

func (f *fixture) ingredientIDByKey(t *testing.T, key string) (int64, bool) {
	t.Helper()
	var id int64
	err := f.db.QueryRow(`SELECT id FROM ingredients WHERE name_key = ?`, key).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false
	}
	if err != nil {
		t.Fatal(err)
	}
	return id, true
}

func (f *fixture) conversionOf(t *testing.T, ingredientID int64, unit string) (float64, bool) {
	t.Helper()
	var v float64
	err := f.db.QueryRow(`SELECT to_base FROM ingredient_conversions WHERE ingredient_id = ? AND unit = ?`, ingredientID, unit).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false
	}
	if err != nil {
		t.Fatal(err)
	}
	return v, true
}

// ---- file builders -----------------------------------------------------------------------------------------------------

func ptrOf[T any](v T) *T { return &v }

// lasagneFile is Lasagne (plannable) with a plain line and the line under test, then the other Recipes. Every Ingredient
// it names is defined, so only the Base recipe tiles can keep the plan from being Ready.
func lasagneFile(line recipefile.Line, others ...recipefile.Recipe) recipefile.File {
	l := recipefile.Recipe{Name: "Lasagne", Yield: 4, Ingredients: []recipefile.Line{{Ingredient: "lasagne sheets", Quantity: 250, Unit: "g"}, line}}
	base := "ml"
	if line.Unit == "g" {
		base = "g"
	}
	return recipefile.File{
		Format: recipefile.Format, Version: recipefile.Version,
		Ingredients: []recipefile.Ingredient{
			{Name: "lasagne sheets", BaseUnit: "g"}, {Name: "milk", BaseUnit: "ml"}, {Name: "butter", BaseUnit: "g"},
			{Name: line.Ingredient, BaseUnit: base},
		},
		Recipes: append([]recipefile.Recipe{l}, others...),
	}
}

func bechamelLine() recipefile.Line {
	return recipefile.Line{Ingredient: "béchamel", Quantity: 500, Unit: "ml"}
}

// fileBechamel is Béchamel of the file: a Base recipe yielding yield in unit.
func fileBechamel(yield float64, unit string) recipefile.Recipe {
	return recipefile.Recipe{
		Name: "Béchamel", BaseRecipe: ptrOf(true), Yield: yield, YieldUnit: unit,
		Ingredients: []recipefile.Line{{Ingredient: "milk", Quantity: 1000, Unit: "ml"}, {Ingredient: "butter", Quantity: 80, Unit: "g"}},
	}
}

func answers(m map[string]recipefile.BaseRecipeLineDecision) recipefile.Decisions {
	return recipefile.Decisions{BaseRecipeLines: m}
}

func fileAnswer(idx int) recipefile.BaseRecipeLineDecision {
	return recipefile.BaseRecipeLineDecision{Action: recipefile.BaseFile, RecipeIndex: &idx}
}

// withTakeOvers adds the P7 answers by JSON, the shape pinned in docs/dev/design/base-recipes.md §11.3.
func withTakeOvers(t *testing.T, d recipefile.Decisions, m map[string]bool) recipefile.Decisions {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"takeOvers": m})
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &d); err != nil {
		t.Fatal(err)
	}
	return d
}

func planJSON(t *testing.T, p recipefile.Plan) map[string]any {
	t.Helper()
	raw, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func (f *seeded) apply(t *testing.T, file recipefile.File, d recipefile.Decisions) store.Result {
	t.Helper()
	res, err := f.s.Apply(ctx, f.commit(t, file, d))
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	return res
}

// ---- Existing --------------------------------------------------------------------------------------------------------

func TestExistingListsTheBaseRecipesAndTheirIngredients(t *testing.T) {
	f := newSeeded(t)
	milk := f.ingredient(t, "milk", units.Millilitre)
	b := f.baseRecipe(t, "Béchamel", 1, "l", recipe.Line{IngredientID: milk, Quantity: 1000, Unit: "ml"})
	f.plannable(t, "Soup", recipe.Line{IngredientID: milk, Quantity: 200, Unit: "ml"})
	ex, err := f.s.Existing(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(ex.BaseRecipes) != 1 || ex.BaseRecipes[0].RecipeID != b.ID || ex.BaseRecipes[0].IngredientID != b.BaseIngredientID {
		t.Fatalf("BaseRecipes = %+v, want only Béchamel (%d) with its Ingredient %d", ex.BaseRecipes, b.ID, b.BaseIngredientID)
	}
	// Recipes lists every Recipe, Base recipes included: name conflicts (replace) work on them too.
	names := map[string]bool{}
	for _, r := range ex.Recipes {
		names[r.Name] = true
	}
	if len(ex.Recipes) != 2 || !names["Béchamel"] || !names["Soup"] {
		t.Errorf("Recipes = %+v, want Béchamel and Soup", ex.Recipes)
	}
}

// ---- use ---------------------------------------------------------------------------------------------------------------

func TestUsePointsTheLineAtTheExistingBaseRecipeAndCreatesNoPlainIngredient(t *testing.T) {
	f := newSeeded(t)
	milk := f.ingredient(t, "milk", units.Millilitre)
	b := f.baseRecipe(t, "Béchamel", 1, "l", recipe.Line{IngredientID: milk, Quantity: 1000, Unit: "ml"})
	before := f.count(t, "ingredients")
	f.apply(t, lasagneFile(bechamelLine()), answers(map[string]recipefile.BaseRecipeLineDecision{lineB: {Action: recipefile.BaseUse, RecipeID: b.ID}}))

	lasagne := f.recipeNamed(t, "Lasagne")
	ing, qty, unit := f.lineAt(t, lasagne.id, 1)
	if ing != b.BaseIngredientID || qty != 500 || unit != "ml" {
		t.Errorf("line = ingredient %d %v %s, want the Base recipe's Ingredient %d, 500 ml", ing, qty, unit, b.BaseIngredientID)
	}
	if _, ok := f.ingredientIDByKey(t, "béchamel"); ok {
		t.Error("no plain Ingredient named béchamel may be created: the line is a Base recipe line")
	}
	if got := f.count(t, "ingredients"); got != before+1 { // lasagne sheets only
		t.Errorf("ingredients = %d, want %d (only lasagne sheets is new)", got, before+1)
	}
}

// ---- file --------------------------------------------------------------------------------------------------------------

func TestFileCreatesTheFileRecipeAsABaseRecipeKeepingItsYieldAndNoMainCourse(t *testing.T) {
	f := newSeeded(t)
	// 1500 ml is beyond the portion limit of 100: the real Yield must be stored, not a stub.
	file := lasagneFile(bechamelLine(), fileBechamel(1500, "ml"))
	f.apply(t, file, answers(map[string]recipefile.BaseRecipeLineDecision{lineB: fileAnswer(1)}))

	b := f.recipeNamed(t, "Béchamel")
	if !b.baseIng.Valid || b.yield != 1500 || b.yieldUnit.String != "ml" {
		t.Fatalf("Béchamel = base ingredient %v yield %v unit %q, want a Base recipe of 1500 ml", b.baseIng, b.yield, b.yieldUnit.String)
	}
	if got := f.recipeCourses(t, b.id); len(got) != 0 {
		t.Errorf("a Base recipe has no Courses, not even the default main one: %v", got)
	}
	lasagne := f.recipeNamed(t, "Lasagne")
	if got := f.recipeCourses(t, lasagne.id); len(got) != 1 || got[0] != "Main" {
		t.Errorf("Lasagne keeps the default Course: %v", got)
	}
	if ing, _, _ := f.lineAt(t, lasagne.id, 1); ing != b.baseIng.Int64 {
		t.Errorf("the line points at %d, want Béchamel's Ingredient %d", ing, b.baseIng.Int64)
	}
	if k := f.nameKeyOf(t, b.baseIng.Int64); k != "base-recipe:"+itoa(b.id) {
		t.Errorf("name_key = %q, want base-recipe:%d", k, b.id)
	}
	if v, ok := f.conversionOf(t, b.baseIng.Int64, "batch"); !ok || v != 1500 {
		t.Errorf("batch = %v, %v; want 1500 (the Yield, in ml)", v, ok)
	}
	if _, ok := f.ingredientIDByKey(t, "béchamel"); ok {
		t.Error("no plain Ingredient named béchamel may be created")
	}
	var lines int
	f.db.QueryRow(`SELECT count(*) FROM recipe_lines WHERE recipe_id = ?`, b.id).Scan(&lines)
	if lines != 2 {
		t.Errorf("Béchamel keeps its own two lines, got %d", lines)
	}
}

func TestFileBaseRecipesThatCallForEachOtherAreWrittenCallersLastWhateverTheirOrder(t *testing.T) {
	f := newSeeded(t)
	// Lasagne (0) calls Béchamel (1), which calls Roux (2); the file lists the callers first.
	bech := fileBechamel(1, "l")
	bech.Ingredients = append(bech.Ingredients, recipefile.Line{Ingredient: "roux", Quantity: 160, Unit: "g"})
	roux := recipefile.Recipe{Name: "Roux", BaseRecipe: ptrOf(true), Yield: 160, YieldUnit: "g",
		Ingredients: []recipefile.Line{{Ingredient: "butter", Quantity: 80, Unit: "g"}}}
	file := lasagneFile(bechamelLine(), bech, roux)
	file.Ingredients = append(file.Ingredients, recipefile.Ingredient{Name: "roux", BaseUnit: "g"})
	rouxLine := "$.recipes[1].ingredients[2]"
	f.apply(t, file, answers(map[string]recipefile.BaseRecipeLineDecision{lineB: fileAnswer(1), rouxLine: fileAnswer(2)}))

	l, b, r := f.recipeNamed(t, "Lasagne"), f.recipeNamed(t, "Béchamel"), f.recipeNamed(t, "Roux")
	if !b.baseIng.Valid || !r.baseIng.Valid || l.baseIng.Valid {
		t.Fatalf("kinds: Lasagne base %v, Béchamel base %v, Roux base %v", l.baseIng.Valid, b.baseIng.Valid, r.baseIng.Valid)
	}
	if ing, _, _ := f.lineAt(t, l.id, 1); ing != b.baseIng.Int64 {
		t.Errorf("Lasagne calls %d, want Béchamel's Ingredient %d", ing, b.baseIng.Int64)
	}
	if ing, _, _ := f.lineAt(t, b.id, 2); ing != r.baseIng.Int64 {
		t.Errorf("Béchamel calls %d, want Roux's Ingredient %d", ing, r.baseIng.Int64)
	}
}

// ---- create ------------------------------------------------------------------------------------------------------------

func TestCreateMakesAnEmptyBaseRecipeFromTheLineAndPointsTheLineAtIt(t *testing.T) {
	f := newSeeded(t)
	f.apply(t, lasagneFile(bechamelLine()), answers(map[string]recipefile.BaseRecipeLineDecision{lineB: {Action: recipefile.BaseCreate}}))

	b := f.recipeNamed(t, "Béchamel")
	if !b.baseIng.Valid || b.yield != 500 || b.yieldUnit.String != "ml" {
		t.Fatalf("Béchamel = base %v yield %v %q, want a Base recipe of 500 ml (the line's amount and unit)", b.baseIng, b.yield, b.yieldUnit.String)
	}
	if got := f.lineIngredients(t, b.id); len(got) != 0 {
		t.Errorf("a created Base recipe is empty, to fill in later: %v", got)
	}
	if got := f.recipeCourses(t, b.id); len(got) != 0 {
		t.Errorf("no Courses: %v", got)
	}
	lasagne := f.recipeNamed(t, "Lasagne")
	if ing, qty, unit := f.lineAt(t, lasagne.id, 1); ing != b.baseIng.Int64 || qty != 500 || unit != "ml" {
		t.Errorf("line = %d %v %s, want Béchamel's Ingredient, 500 ml", ing, qty, unit)
	}
	if _, ok := f.ingredientIDByKey(t, "béchamel"); ok {
		t.Error("no plain Ingredient named béchamel may be created")
	}
}

func TestCreateFromABatchLineGivesAYieldOfOnePortionAndNeedsNoUnitAnswer(t *testing.T) {
	f := newSeeded(t)
	line := recipefile.Line{Ingredient: "béchamel", Quantity: 1, Unit: "batch"}
	f.apply(t, lasagneFile(line), answers(map[string]recipefile.BaseRecipeLineDecision{lineB: {Action: recipefile.BaseCreate}}))

	b := f.recipeNamed(t, "Béchamel")
	if b.yield != 1 || b.yieldUnit.String != "portion" {
		t.Errorf("Yield = %v %q, want 1 portion", b.yield, b.yieldUnit.String)
	}
	lasagne := f.recipeNamed(t, "Lasagne")
	if ing, qty, unit := f.lineAt(t, lasagne.id, 1); ing != b.baseIng.Int64 || qty != 1 || unit != "batch" {
		t.Errorf("line = %d %v %s, want 1 batch of Béchamel", ing, qty, unit)
	}
}

// ---- convert -----------------------------------------------------------------------------------------------------------

type pestoRows struct {
	recipe        recipe.Recipe
	tomorrowMeal  int64
	earlyMeal     int64
	rule, slot    int64
	pestoLineIngr int64
}

// seedPesto is a plannable Pesto with a Planned Meal tomorrow and one before today (today is 2026-11-09), and a Slot Rule.
func (f *seeded) seedPesto(t *testing.T) pestoRows {
	t.Helper()
	basil := f.ingredient(t, "basil", units.Gram)
	p := pestoRows{recipe: f.plannable(t, "Pesto", recipe.Line{IngredientID: basil, Quantity: 100, Unit: "g"})}
	var main int64
	if err := f.db.QueryRow(`SELECT id FROM courses WHERE name_key = 'main'`).Scan(&main); err != nil {
		t.Fatal(err)
	}
	p.slot = f.exec(t, `INSERT INTO meal_slots(weekday,name,time) VALUES (1,'Dinner','19:00')`)
	meal := func(date string) int64 {
		return f.exec(t, `INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,state,pinned,created_at,updated_at)
			VALUES (?,?,?,?,1,4,'planned',0,'t','t')`, date, p.slot, main, p.recipe.ID)
	}
	p.tomorrowMeal, p.earlyMeal = meal("2026-11-10"), meal("2026-11-02")
	p.rule = f.exec(t, `INSERT INTO slot_rules(meal_slot_id,course_id,recipe_id) VALUES (?,?,?)`, p.slot, main, p.recipe.ID)
	return p
}

func (f *fixture) rowExists(t *testing.T, table string, id int64) bool {
	t.Helper()
	var n int
	if err := f.db.QueryRow(`SELECT count(*) FROM `+table+` WHERE id = ?`, id).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n == 1
}

func pestoLine() recipefile.Line {
	return recipefile.Line{Ingredient: "pesto", Quantity: 100, Unit: "g"}
}

func TestConvertTurnsAPlannableRecipeIntoABaseRecipeWithTheToBaseEffects(t *testing.T) {
	f := newSeeded(t)
	p := f.seedPesto(t)
	d := answers(map[string]recipefile.BaseRecipeLineDecision{lineB: {Action: recipefile.BaseConvert, RecipeID: p.recipe.ID, Yield: 200, YieldUnit: "g"}})
	f.apply(t, lasagneFile(pestoLine()), d)

	pesto := f.recipeNamed(t, "Pesto")
	if pesto.id != p.recipe.ID || !pesto.baseIng.Valid || pesto.yield != 200 || pesto.yieldUnit.String != "g" {
		t.Fatalf("Pesto = id %d base %v yield %v %q, want the same Recipe as a Base recipe of 200 g", pesto.id, pesto.baseIng, pesto.yield, pesto.yieldUnit.String)
	}
	if got := f.recipeCourses(t, pesto.id); len(got) != 0 {
		t.Errorf("Courses = %v, a Base recipe has none", got)
	}
	if f.rowExists(t, "planned_meals", p.tomorrowMeal) || f.rowExists(t, "slot_rules", p.rule) {
		t.Error("the unresolved Planned Meal from today on and the Slot Rule of Pesto go with the conversion")
	}
	if !f.rowExists(t, "planned_meals", p.earlyMeal) {
		t.Error("a past Planned Meal stays as history")
	}
	lasagne := f.recipeNamed(t, "Lasagne")
	if ing, qty, unit := f.lineAt(t, lasagne.id, 1); ing != pesto.baseIng.Int64 || qty != 100 || unit != "g" {
		t.Errorf("line = %d %v %s, want Pesto's Ingredient", ing, qty, unit)
	}
	if _, ok := f.ingredientIDByKey(t, "pesto"); ok {
		t.Error("no plain Ingredient named pesto may be created")
	}
}

func TestAFailedImportAlsoUndoesTheConversionOfThePlannableRecipe(t *testing.T) {
	f := newSeeded(t)
	p := f.seedPesto(t)
	file := lasagneFile(pestoLine(), recipefile.Recipe{Name: "Aioli", Yield: 2, Ingredients: []recipefile.Line{{Ingredient: "butter", Quantity: 10, Unit: "g"}}})
	c := f.commit(t, file, answers(map[string]recipefile.BaseRecipeLineDecision{lineB: {Action: recipefile.BaseConvert, RecipeID: p.recipe.ID, Yield: 200, YieldUnit: "g"}}))
	last := &c.Recipes[len(c.Recipes)-1]
	last.Action, last.ReplaceID = recipefile.ActionReplace, 4242 // stale: nothing to replace
	recipes, ings := f.count(t, "recipes"), f.count(t, "ingredients")
	if _, err := f.s.Apply(ctx, c); !errors.Is(err, store.ErrStale) {
		t.Fatalf("Apply = %v, want ErrStale", err)
	}
	if pesto := f.recipeNamed(t, "Pesto"); pesto.baseIng.Valid {
		t.Error("Pesto must still be plannable: the conversion is in the import's transaction")
	}
	if !f.rowExists(t, "planned_meals", p.tomorrowMeal) || !f.rowExists(t, "slot_rules", p.rule) {
		t.Error("the Planned Meal and the Slot Rule must still be there")
	}
	if f.count(t, "recipes") != recipes || f.count(t, "ingredients") != ings {
		t.Error("nothing else may be written")
	}
}

// ---- keep --------------------------------------------------------------------------------------------------------------

func TestKeepLeavesTheLineOnTheExistingPlainIngredient(t *testing.T) {
	f := newSeeded(t)
	milk := f.ingredient(t, "milk", units.Millilitre)
	b := f.baseRecipe(t, "Béchamel", 1, "l", recipe.Line{IngredientID: milk, Quantity: 1000, Unit: "ml"})
	plain := f.ingredient(t, "béchamel", units.Millilitre) // beside the Base recipe's own Ingredient (key base-recipe:<id>)
	f.apply(t, lasagneFile(bechamelLine()), answers(map[string]recipefile.BaseRecipeLineDecision{lineB: {Action: recipefile.BaseKeep}}))

	lasagne := f.recipeNamed(t, "Lasagne")
	ing, _, _ := f.lineAt(t, lasagne.id, 1)
	if ing != plain || ing == b.BaseIngredientID {
		t.Errorf("line ingredient = %d, want the plain béchamel %d, not the Base recipe's %d", ing, plain, b.BaseIngredientID)
	}
}

func TestKeepWithNoPlainIngredientCreatesOneAsAnyImportedIngredient(t *testing.T) {
	f := newSeeded(t)
	f.apply(t, lasagneFile(bechamelLine()), answers(map[string]recipefile.BaseRecipeLineDecision{lineB: {Action: recipefile.BaseKeep}}))
	plain, ok := f.ingredientIDByKey(t, "béchamel")
	if !ok {
		t.Fatal("a kept line is a plain Ingredient line: its Ingredient is created from the file's definition")
	}
	lasagne := f.recipeNamed(t, "Lasagne")
	if ing, _, _ := f.lineAt(t, lasagne.id, 1); ing != plain {
		t.Errorf("line ingredient = %d, want %d", ing, plain)
	}
	if f.recipeNamedCount(t, "Béchamel") != 0 {
		t.Error("keep creates no Base recipe")
	}
}

func (f *fixture) recipeNamedCount(t *testing.T, name string) int {
	t.Helper()
	var n int
	if err := f.db.QueryRow(`SELECT count(*) FROM recipes WHERE name = ?`, name).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// ---- the two Ingredients of one name, after a round trip -----------------------------------------------------------

func TestSameNameIngredientsComeBackAsTwoIngredientsAfterImport(t *testing.T) {
	f := newSeeded(t)
	// A Feeder export has one "béchamel" definition. Lasagne calls the Base recipe; Moussaka uses a plain béchamel.
	file := lasagneFile(bechamelLine(), fileBechamel(1, "l"),
		recipefile.Recipe{Name: "Moussaka", Yield: 4, Ingredients: []recipefile.Line{{Ingredient: "béchamel", Quantity: 300, Unit: "ml"}}})
	mousLine := "$.recipes[2].ingredients[0]"
	f.apply(t, file, answers(map[string]recipefile.BaseRecipeLineDecision{
		lineB:    fileAnswer(1),
		mousLine: {Action: recipefile.BaseKeep},
	}))

	b := f.recipeNamed(t, "Béchamel")
	plain, ok := f.ingredientIDByKey(t, "béchamel")
	if !ok || !b.baseIng.Valid || plain == b.baseIng.Int64 {
		t.Fatalf("want two Ingredients called béchamel: plain %d (%v) and the Base recipe's %v", plain, ok, b.baseIng)
	}
	if k := f.nameKeyOf(t, b.baseIng.Int64); k != "base-recipe:"+itoa(b.id) {
		t.Errorf("the Base recipe's Ingredient is keyed %q", k)
	}
	if ing, _, _ := f.lineAt(t, f.recipeNamed(t, "Lasagne").id, 1); ing != b.baseIng.Int64 {
		t.Errorf("Lasagne calls %d, want the Base recipe's %d", ing, b.baseIng.Int64)
	}
	if ing, _, _ := f.lineAt(t, f.recipeNamed(t, "Moussaka").id, 0); ing != plain {
		t.Errorf("Moussaka uses %d, want the plain béchamel %d", ing, plain)
	}
}

// ---- cycle at Confirm --------------------------------------------------------------------------------------------------

func TestACycleAgainstStoredRecipesIsRefusedAtConfirmAndNothingIsWritten(t *testing.T) {
	f := newSeeded(t)
	butter := f.ingredient(t, "butter", units.Gram)
	roux := f.baseRecipe(t, "Roux", 160, "g", recipe.Line{IngredientID: butter, Quantity: 80, Unit: "g"})
	bech := f.baseRecipe(t, "Béchamel", 1, "l", recipe.Line{BaseRecipeID: roux.ID, Quantity: 160, Unit: "g"})

	// The file replaces Roux with a version that calls for Béchamel, which already calls for Roux. The cycle runs
	// through stored Recipes only, so the review cannot see it: it is the store's check at Confirm.
	newRoux := recipefile.Recipe{Name: "Roux", BaseRecipe: ptrOf(true), Yield: 160, YieldUnit: "g",
		Ingredients: []recipefile.Line{{Ingredient: "butter", Quantity: 80, Unit: "g"}, {Ingredient: "béchamel", Quantity: 100, Unit: "ml"}}}
	aioli := recipefile.Recipe{Name: "Aioli", Yield: 2, Ingredients: []recipefile.Line{{Ingredient: "butter", Quantity: 10, Unit: "g"}}}
	file := recipefile.File{
		Format: recipefile.Format, Version: recipefile.Version,
		Ingredients: []recipefile.Ingredient{{Name: "butter", BaseUnit: "g"}, {Name: "béchamel", BaseUnit: "ml"}},
		Recipes:     []recipefile.Recipe{newRoux, aioli},
	}
	d := answers(map[string]recipefile.BaseRecipeLineDecision{"$.recipes[0].ingredients[1]": {Action: recipefile.BaseUse, RecipeID: bech.ID}})
	d.Recipes = []recipefile.RecipeDecision{{Index: 0, Action: recipefile.ActionReplace}}
	c := f.commit(t, file, d)

	recipes, ings, lines := f.count(t, "recipes"), f.count(t, "ingredients"), f.count(t, "recipe_lines")
	_, err := f.s.Apply(ctx, c)
	var cyc *recipe.CycleError
	if !errors.Is(err, recipe.ErrBaseRecipeCycle) || !errors.As(err, &cyc) {
		t.Fatalf("Apply = %v, want a *recipe.CycleError (base_recipe_cycle)", err)
	}
	if f.count(t, "recipes") != recipes || f.count(t, "ingredients") != ings || f.count(t, "recipe_lines") != lines {
		t.Error("nothing may be written: not Aioli, not the replaced Roux")
	}
	if got := f.lineIngredients(t, roux.ID); len(got) != 1 || got[0] != butter {
		t.Errorf("Roux keeps its stored lines: %v", got)
	}
}

// ---- replace -----------------------------------------------------------------------------------------------------------

func TestReplaceOfABaseRecipeKeepsItsIdItsIngredientAndTheLinesThatCallForIt(t *testing.T) {
	f := newSeeded(t)
	// Béchamel was created empty (Read it next), a Lasagne calls for it, and its Ingredient holds Stock.
	empty := f.baseRecipe(t, "Béchamel", 500, "ml")
	lasagne := f.plannable(t, "Lasagne", recipe.Line{BaseRecipeID: empty.ID, Quantity: 500, Unit: "ml"})
	f.exec(t, `INSERT INTO stock_lots(ingredient_id, quantity, purchased, source, created_at) VALUES (?,?,?,?,?)`,
		empty.BaseIngredientID, 300, "2026-11-01", "manual", "2026-11-01T00:00:00Z")

	file := recipefile.File{
		Format: recipefile.Format, Version: recipefile.Version,
		Ingredients: []recipefile.Ingredient{{Name: "milk", BaseUnit: "ml"}, {Name: "butter", BaseUnit: "g"}},
		Recipes:     []recipefile.Recipe{fileBechamel(2, "l")},
	}
	d := recipefile.Decisions{Recipes: []recipefile.RecipeDecision{{Index: 0, Action: recipefile.ActionReplace}}}
	f.apply(t, file, d)

	got := f.recipeNamed(t, "Béchamel")
	if got.id != empty.ID || got.baseIng.Int64 != empty.BaseIngredientID || got.yield != 2 || got.yieldUnit.String != "l" {
		t.Fatalf("Béchamel = id %d ingredient %d yield %v %q; want id %d, ingredient %d, 2 l", got.id, got.baseIng.Int64, got.yield, got.yieldUnit.String, empty.ID, empty.BaseIngredientID)
	}
	if n := len(f.lineIngredients(t, got.id)); n != 2 {
		t.Errorf("lines = %d, want the file's two", n)
	}
	if ing, _, _ := f.lineAt(t, lasagne.ID, 0); ing != empty.BaseIngredientID {
		t.Error("the line that calls for the Base recipe still points at its Ingredient")
	}
	var lots int
	f.db.QueryRow(`SELECT count(*) FROM stock_lots WHERE ingredient_id = ?`, empty.BaseIngredientID).Scan(&lots)
	if lots != 1 {
		t.Errorf("Stock lots on its Ingredient = %d, want 1", lots)
	}
	if v, ok := f.conversionOf(t, empty.BaseIngredientID, "batch"); !ok || v != 2000 {
		t.Errorf("batch = %v, %v; want 2000 ml (the new Yield)", v, ok)
	}
}

// ---- P7: take-over during import ---------------------------------------------------------------------------------------

// seedPlainBechamel is a plain Ingredient "béchamel" (ml) used by Moussaka, with one Stock lot.
func (f *seeded) seedPlainBechamel(t *testing.T, base units.Base) (plain int64, moussaka recipe.Recipe) {
	t.Helper()
	plain = f.ingredient(t, "béchamel", base)
	unit := "ml"
	if base == units.Gram {
		unit = "g"
	}
	moussaka = f.plannable(t, "Moussaka", recipe.Line{IngredientID: plain, Quantity: 300, Unit: unit})
	f.exec(t, `INSERT INTO stock_lots(ingredient_id, quantity, purchased, source, created_at) VALUES (?,?,?,?,?)`,
		plain, 250, "2026-11-01", "manual", "2026-11-01T00:00:00Z")
	return plain, moussaka
}

func TestThePlanAsksAboutTakingOverANamedPlainIngredientWithItsRecipesAndStock(t *testing.T) {
	f := newSeeded(t)
	plain, _ := f.seedPlainBechamel(t, units.Millilitre)
	file := lasagneFile(bechamelLine(), fileBechamel(1, "l"))
	ex, err := f.s.Existing(ctx)
	if err != nil {
		t.Fatal(err)
	}
	d := answers(map[string]recipefile.BaseRecipeLineDecision{lineB: fileAnswer(1)})
	p := recipefile.BuildPlan(file, ex, d, recipefile.ImageSet{})
	if p.Ready {
		t.Fatalf("a take-over is asked, never assumed: not ready until the User answers (P7 = B): %+v", p)
	}
	asks, _ := planJSON(t, p)["takeOvers"].([]any)
	if len(asks) != 1 {
		t.Fatalf("takeOvers = %v, want one ask, for Béchamel of the file", asks)
	}
	ask := asks[0].(map[string]any)
	ing, _ := ask["ingredient"].(map[string]any)
	recs, _ := ask["recipes"].([]any)
	if ask["path"] != otherAt || ask["name"] != "Béchamel" || int64(ing["id"].(float64)) != plain || ask["stockLots"] != float64(1) ||
		len(recs) != 1 || recs[0].(map[string]any)["name"] != "Moussaka" || ask["convertible"] != true || ask["resolved"] != false {
		t.Errorf("ask = %v, want path %s, Béchamel, ingredient %d, 1 Stock lot, Moussaka, convertible, unresolved", ask, otherAt, plain)
	}
	// Answering makes the plan ready.
	for _, answer := range []bool{true, false} {
		p = recipefile.BuildPlan(file, ex, withTakeOvers(t, d, map[string]bool{otherAt: answer}), recipefile.ImageSet{})
		if !p.Ready {
			t.Errorf("answer %v: plan not ready: %+v %+v", answer, p.Problems, planJSON(t, p)["takeOvers"])
		}
	}
}

func TestTakeOverYesMakesThePlainIngredientTheBaseRecipesAndItsLinesBaseRecipeLines(t *testing.T) {
	f := newSeeded(t)
	plain, moussaka := f.seedPlainBechamel(t, units.Millilitre)
	d := withTakeOvers(t, answers(map[string]recipefile.BaseRecipeLineDecision{lineB: fileAnswer(1)}), map[string]bool{otherAt: true})
	f.apply(t, lasagneFile(bechamelLine(), fileBechamel(1, "l")), d)

	b := f.recipeNamed(t, "Béchamel")
	if b.baseIng.Int64 != plain {
		t.Fatalf("the Base recipe's Ingredient = %d, want the taken-over %d", b.baseIng.Int64, plain)
	}
	if k := f.nameKeyOf(t, plain); k != "base-recipe:"+itoa(b.id) {
		t.Errorf("name_key = %q, want re-keyed to base-recipe:%d", k, b.id)
	}
	var lots int
	f.db.QueryRow(`SELECT count(*) FROM stock_lots WHERE ingredient_id = ?`, plain).Scan(&lots)
	if lots != 1 {
		t.Errorf("Stock stays on the Ingredient: %d lots", lots)
	}
	if ing, _, _ := f.lineAt(t, moussaka.ID, 0); ing != plain {
		t.Error("Moussaka's line is the taken-over Ingredient's: now a Base recipe line")
	}
	if ing, _, _ := f.lineAt(t, f.recipeNamed(t, "Lasagne").id, 1); ing != plain {
		t.Error("the file's line points at the taken-over Ingredient")
	}
}

func TestTakeOverNoKeepsThePlainIngredientApartAndGivesTheBaseRecipeItsOwn(t *testing.T) {
	f := newSeeded(t)
	plain, moussaka := f.seedPlainBechamel(t, units.Millilitre)
	d := withTakeOvers(t, answers(map[string]recipefile.BaseRecipeLineDecision{lineB: fileAnswer(1)}), map[string]bool{otherAt: false})
	f.apply(t, lasagneFile(bechamelLine(), fileBechamel(1, "l")), d)

	b := f.recipeNamed(t, "Béchamel")
	if !b.baseIng.Valid || b.baseIng.Int64 == plain {
		t.Fatalf("the Base recipe needs an Ingredient of its own, got %v (plain is %d)", b.baseIng, plain)
	}
	if k := f.nameKeyOf(t, b.baseIng.Int64); k != "base-recipe:"+itoa(b.id) {
		t.Errorf("own Ingredient keyed %q", k)
	}
	if k := f.nameKeyOf(t, plain); k != "béchamel" {
		t.Errorf("the plain Ingredient keeps its key, got %q", k)
	}
	if ing, _, _ := f.lineAt(t, moussaka.ID, 0); ing != plain {
		t.Error("Moussaka's line stays on the plain Ingredient")
	}
	if ing, _, _ := f.lineAt(t, f.recipeNamed(t, "Lasagne").id, 1); ing != b.baseIng.Int64 {
		t.Error("the file's line points at the Base recipe's own Ingredient")
	}
}

func TestADifferentBaseUnitWarnsAndOnlyOffersToKeepApart(t *testing.T) {
	f := newSeeded(t)
	plain, moussaka := f.seedPlainBechamel(t, units.Gram) // a jar by weight; the Base recipe yields litres
	file := lasagneFile(bechamelLine(), fileBechamel(1, "l"))
	ex, err := f.s.Existing(ctx)
	if err != nil {
		t.Fatal(err)
	}
	d := answers(map[string]recipefile.BaseRecipeLineDecision{lineB: fileAnswer(1)})
	p := recipefile.BuildPlan(file, ex, d, recipefile.ImageSet{})
	warned := false
	for _, w := range p.Warnings {
		warned = warned || (w.Code == recipefile.WarnSameNameIngredient && w.Path == otherAt)
	}
	if !warned {
		t.Errorf("want a %s warning at %s naming the plain Ingredient that stays apart: %+v", recipefile.WarnSameNameIngredient, otherAt, p.Warnings)
	}
	asks, _ := planJSON(t, p)["takeOvers"].([]any)
	if len(asks) != 1 || asks[0].(map[string]any)["convertible"] != false || asks[0].(map[string]any)["resolved"] != true {
		t.Fatalf("takeOvers = %v: not convertible, so the only answer is 'keep apart', already in force", asks)
	}
	if !p.Ready {
		t.Fatalf("with one possible answer nothing is left to ask: %+v", p.Problems)
	}

	f.apply(t, file, d)
	b := f.recipeNamed(t, "Béchamel")
	if b.baseIng.Int64 == plain {
		t.Fatal("the plain Ingredient (grams) cannot be taken over by a Base recipe in litres")
	}
	var base string
	f.db.QueryRow(`SELECT base_unit FROM ingredients WHERE id = ?`, b.baseIng.Int64).Scan(&base)
	if base != "ml" {
		t.Errorf("the Base recipe's own Ingredient is in ml, got %q", base)
	}
	if ing, _, _ := f.lineAt(t, f.recipeNamed(t, "Lasagne").id, 1); ing != b.baseIng.Int64 {
		t.Error("the file's line goes to the Base recipe's Ingredient")
	}
	if ing, _, _ := f.lineAt(t, moussaka.ID, 0); ing != plain {
		t.Error("Moussaka's line stays on the plain Ingredient")
	}
}
