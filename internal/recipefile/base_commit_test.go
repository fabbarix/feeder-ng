package recipefile_test

import (
	"encoding/json"
	"sort"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// BR-C commit half, the pure side (docs/dev/design/base-recipes.md §11.3): what BuildCommit carries for the answered
// tiles, the take-over ask of P7, batch lines, and the one name matcher shared with the picker. The writes
// themselves are tested against the database in recipefile/store/base_commit_test.go.

func planMap(t *testing.T, p recipefile.Plan) map[string]any {
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

// withTakeOvers adds the P7 answers by JSON (the shape of §11.3: "takeOvers": { "<path>": true | false }).
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

func fileAnswer(idx int) recipefile.BaseRecipeLineDecision {
	return recipefile.BaseRecipeLineDecision{Action: recipefile.BaseFile, RecipeIndex: &idx}
}

func answerAt(path string, d recipefile.BaseRecipeLineDecision) recipefile.Decisions {
	return recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{path: d}}
}

// ---- the two tests that waited for the commit half ----------------------------------------------------------------

func TestCommitWritesBaseRecipesBeforeTheRecipesThatCallForThemAndNoPlainIngredientForTheirLines(t *testing.T) {
	// Lasagne (0) calls Béchamel (1), which calls Roux (2): the file lists the callers first.
	bech := fileBechamel(true)
	bech.Ingredients = append(bech.Ingredients, recipefile.Line{Ingredient: "roux", Quantity: 160, Unit: "g"})
	roux := miniRecipe("Roux")
	roux.BaseRecipe, roux.Yield, roux.YieldUnit = ptr(true), 160, "g"
	roux.Ingredients = []recipefile.Line{{Ingredient: "milk", Quantity: 80, Unit: "ml"}}
	f := withMilk(lasagneWith(bechamelLine(), bech, roux))
	f.Ingredients = append(f.Ingredients, recipefile.Ingredient{Name: "roux", BaseUnit: "g"})
	rouxLine := "$.recipes[1].ingredients[1]"
	d := recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{lineB: fileAnswer(1), rouxLine: fileAnswer(2)}}
	c, err := recipefile.BuildCommit(f, recipefile.Existing{}, d, noImages)
	if err != nil {
		t.Fatal(err)
	}
	pos := map[int]int{}
	for i, rc := range c.Recipes {
		pos[rc.Index] = i
	}
	if !(pos[2] < pos[1] && pos[1] < pos[0]) {
		t.Errorf("write order = %v (Recipe index -> position), want Roux, then Béchamel, then Lasagne", pos)
	}
	for _, n := range c.NewIngredients {
		if n.Key == "béchamel" || n.Key == "roux" {
			t.Errorf("%q is a Base recipe's Ingredient: the store creates it with the Base recipe, the commit must not ask for a plain one", n.Key)
		}
	}
}

func TestSameNameIngredientsRoundTripAsTwoIngredients(t *testing.T) {
	// The export has one "béchamel" definition for Lasagne's Base recipe line and Moussaka's plain line. Import
	// preselects the Base recipe for both lines; answering Keep on Moussaka's gives the plain line back.
	f, _ := recipefile.Build(sameNameExportInput())
	raw, err := recipefile.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}
	parsed := mustParse(t, raw)
	mi, _ := recipeNamed(t, parsed, "Moussaka")
	mousLine := "$.recipes[" + itoa(mi) + "].ingredients[0]"

	p := plan(t, parsed, recipefile.Existing{}, recipefile.Decisions{})
	row := rowAt(t, p, mousLine)
	if !row.Resolved || row.Effective == nil || row.Effective.Action != recipefile.BaseFile {
		t.Fatalf("Moussaka's line is preselected on the Base recipe of the file, like any exact match: %+v", row)
	}
	p = plan(t, parsed, recipefile.Existing{}, answerAt(mousLine, recipefile.BaseRecipeLineDecision{Action: recipefile.BaseKeep}))
	if !p.Ready {
		t.Fatalf("not ready: %+v", p.Problems)
	}
	m := matchOf(t, p, "béchamel")
	if len(m.UsedBy) != 1 || m.UsedBy[0] != mousLine {
		t.Errorf("the plain béchamel row is used by Moussaka's line only, got %v", m.UsedBy)
	}
	c, err := recipefile.BuildCommit(parsed, recipefile.Existing{}, answerAt(mousLine, recipefile.BaseRecipeLineDecision{Action: recipefile.BaseKeep}), noImages)
	if err != nil {
		t.Fatal(err)
	}
	plain := 0
	for _, n := range c.NewIngredients {
		if n.Key == "béchamel" {
			plain++
		}
	}
	if plain != 1 {
		t.Errorf("one plain béchamel is created for the kept line, got %d", plain)
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	for ; n > 0; n /= 10 {
		s = string(rune('0'+n%10)) + s
	}
	return s
}

// ---- the real Yield, no Courses -------------------------------------------------------------------------------------

func TestABaseRecipeCommitsWithItsRealYieldItsUnitAndNoCourses(t *testing.T) {
	b := fileBechamel(true)
	b.Yield, b.YieldUnit = 1500, "ml" // far beyond the 100 portions of a plannable Recipe
	f := withMilk(lasagneWith(bechamelLine(), b))
	ex := recipefile.Existing{Courses: []recipefile.CourseRef{{ID: 1, Name: "Main", Main: true}}}
	c, err := recipefile.BuildCommit(f, ex, answerAt(lineB, fileAnswer(1)), noImages)
	if err != nil {
		t.Fatal(err)
	}
	var base, plain *recipefile.RecipeCommit
	for i := range c.Recipes {
		switch c.Recipes[i].Index {
		case 1:
			base = &c.Recipes[i]
		case 0:
			plain = &c.Recipes[i]
		}
	}
	if base == nil || plain == nil {
		t.Fatalf("recipes = %+v", c.Recipes)
	}
	in := base.Input
	if in.BaseRecipe == nil || !*in.BaseRecipe || in.Yield != 1500 || in.YieldUnit != "ml" {
		t.Errorf("input = base %v yield %v %q, want a Base recipe of 1500 ml (the Yield is stored as it is, no stub)", in.BaseRecipe, in.Yield, in.YieldUnit)
	}
	if len(in.CourseIDs) != 0 || len(base.NewCourseKeys) != 0 {
		t.Errorf("a Base recipe is never given the default main Course: %v %v", in.CourseIDs, base.NewCourseKeys)
	}
	if len(plain.Input.CourseIDs) != 1 {
		t.Errorf("a plannable Recipe still gets the main Course: %v", plain.Input.CourseIDs)
	}
}

func TestABaseRecipeYieldBeyondTheBaseLimitIsStillAProblem(t *testing.T) {
	b := fileBechamel(true)
	b.Yield = 100001
	p := plan(t, withMilk(lasagneWith(bechamelLine(), b)), recipefile.Existing{}, answerAt(lineB, fileAnswer(1)))
	if p.Ready || !hasProblem(p, "$.recipes[1].yield", "yield_invalid") {
		t.Errorf("want a yield problem at $.recipes[1].yield: %+v", p.Problems)
	}
}

// ---- batch lines --------------------------------------------------------------------------------------------------------

func TestBatchLinesOfAFileBaseRecipeNeedNoUnitPromptBecauseTheYieldSetsBatch(t *testing.T) {
	for name, tc := range map[string]struct {
		yield float64
		unit  string
		base  string
	}{"litres": {1, "l", "ml"}, "grams": {750, "g", "g"}, "portions": {4, "portion", "piece"}} {
		t.Run(name, func(t *testing.T) {
			b := fileBechamel(true)
			b.Yield, b.YieldUnit = tc.yield, tc.unit
			line := recipefile.Line{Ingredient: "béchamel", Quantity: 2, Unit: "batch"}
			f := withMilk(lasagneWith(line, b))
			f.Ingredients[1].BaseUnit = tc.base
			p := plan(t, f, recipefile.Existing{}, answerAt(lineB, fileAnswer(1)))
			if len(p.UnitPrompts) != 0 {
				t.Errorf("unit prompts = %+v, want none: the Yield sets batch", p.UnitPrompts)
			}
			if !p.Ready {
				t.Errorf("not ready: %+v %+v", p.Problems, p.BaseRecipeLines)
			}
		})
	}
}

func TestBatchLinesOfACreatedBaseRecipeNeedNoUnitPromptEither(t *testing.T) {
	line := recipefile.Line{Ingredient: "béchamel", Quantity: 1, Unit: "batch"}
	p := plan(t, lasagneWith(line), recipefile.Existing{}, answerAt(lineB, recipefile.BaseRecipeLineDecision{Action: recipefile.BaseCreate}))
	if len(p.UnitPrompts) != 0 || !p.Ready {
		t.Errorf("a created Base recipe has Yield 1 portion, so 1 batch converts: prompts %+v ready %v %+v", p.UnitPrompts, p.Ready, p.Problems)
	}
}

// ---- P7: the take-over ask during import ----------------------------------------------------------------------------

func TestPlanJSONAlwaysHasTakeOvers(t *testing.T) {
	m := planMap(t, plan(t, exampleFile(t), recipefile.Existing{}, recipefile.Decisions{}))
	asks, ok := m["takeOvers"].([]any)
	if !ok || len(asks) != 0 {
		t.Errorf(`takeOvers = %v, want [] (never null) when no Base recipe meets a plain Ingredient of its name`, m["takeOvers"])
	}
}

func plainBechamel(base string) recipefile.Existing {
	return recipefile.Existing{Ingredients: []ingredientT{ing(5, "béchamel", base)}}
}

func TestACreatedBaseRecipeMeetingAPlainIngredientOfItsNameAsksBeforeTakingItOver(t *testing.T) {
	f := withMilk(lasagneWith(bechamelLine(), fileBechamel(true)))
	d := answerAt(lineB, fileAnswer(1))
	p := plan(t, f, plainBechamel("ml"), d)
	if p.Ready {
		t.Fatal("Confirm stays disabled until the ask is answered: nothing is taken over silently (P7 = B)")
	}
	asks, _ := planMap(t, p)["takeOvers"].([]any)
	if len(asks) != 1 {
		t.Fatalf("takeOvers = %v", asks)
	}
	ask := asks[0].(map[string]any)
	ing, _ := ask["ingredient"].(map[string]any)
	if ask["path"] != "$.recipes[1]" || ask["name"] != "Béchamel" || ing["name"] != "béchamel" || ing["id"] != float64(5) ||
		ask["convertible"] != true || ask["resolved"] != false {
		t.Errorf("ask = %v: want the file Recipe's path, its name, the plain Ingredient (id 5), convertible, unresolved", ask)
	}
	if _, has := ask["answer"]; has {
		t.Errorf("no answer is preselected: %v", ask)
	}
	for _, yes := range []bool{true, false} {
		if !plan(t, f, plainBechamel("ml"), withTakeOvers(t, d, map[string]bool{"$.recipes[1]": yes})).Ready {
			t.Errorf("answer %v must make the plan ready", yes)
		}
	}
}

func TestACreateOrConvertAnswerAsksOnItsOwnLinePath(t *testing.T) {
	d := answerAt(lineB, recipefile.BaseRecipeLineDecision{Action: recipefile.BaseCreate})
	p := plan(t, lasagneWith(bechamelLine()), plainBechamel("ml"), d)
	asks, _ := planMap(t, p)["takeOvers"].([]any)
	if len(asks) != 1 || asks[0].(map[string]any)["path"] != lineB || p.Ready {
		t.Fatalf("takeOvers = %v ready %v: want one ask keyed by the line's path", asks, p.Ready)
	}
	if !plan(t, lasagneWith(bechamelLine()), plainBechamel("ml"), withTakeOvers(t, d, map[string]bool{lineB: false})).Ready {
		t.Error("answered, the plan is ready")
	}
}

func TestThePlainIngredientIsNotAskedAboutWhenTheLineStaysPlainOrUsesABaseRecipe(t *testing.T) {
	ex := existingBase()
	ex.Ingredients = append(ex.Ingredients, ing(5, "béchamel", "ml"))
	for name, d := range map[string]recipefile.Decisions{
		"keep": answerAt(lineB, recipefile.BaseRecipeLineDecision{Action: recipefile.BaseKeep}),
		"use":  answerAt(lineB, recipefile.BaseRecipeLineDecision{Action: recipefile.BaseUse, RecipeID: 40}),
	} {
		p := plan(t, lasagneWith(bechamelLine()), ex, d)
		if asks, _ := planMap(t, p)["takeOvers"].([]any); len(asks) != 0 {
			t.Errorf("%s: no Base recipe is created, so no ask: %v", name, asks)
		}
	}
}

func TestADifferentBaseUnitIsNotConvertibleWarnsAndNeedsNoAnswer(t *testing.T) {
	f := withMilk(lasagneWith(bechamelLine(), fileBechamel(true))) // yields 1 l, so ml
	p := plan(t, f, plainBechamel("g"), answerAt(lineB, fileAnswer(1)))
	asks, _ := planMap(t, p)["takeOvers"].([]any)
	if len(asks) != 1 || asks[0].(map[string]any)["convertible"] != false || asks[0].(map[string]any)["resolved"] != true {
		t.Fatalf("takeOvers = %v: the only answer is to keep apart, already in force", asks)
	}
	warned := false
	for _, w := range p.Warnings {
		warned = warned || (w.Code == recipefile.WarnSameNameIngredient && w.Path == "$.recipes[1]")
	}
	if !warned || !p.Ready {
		t.Errorf("want a same_name_ingredient warning at $.recipes[1] and a ready plan: ready %v warnings %+v problems %+v", p.Ready, p.Warnings, p.Problems)
	}
	// The plain Ingredient (grams) is not the file line's: the file's béchamel row does not conflict with it, because
	// the line is a Base recipe line and goes to the Base recipe's own Ingredient.
	for _, m := range p.Ingredients {
		if m.Key == "béchamel" {
			t.Errorf("no plain béchamel row while every béchamel line is a Base recipe line: %+v", m)
		}
	}
}

// ---- one matcher for review and picker ------------------------------------------------------------------------------

func TestImportReviewAndThePickerAgreeOnAccentsAndPlurals(t *testing.T) {
	for _, tc := range []struct{ line, candidate string }{
		{"béchamel", "Bechamel"},
		{"Béchamels", "bechamel"},
		{"bechamél", "Béchamel"}, // decomposed é
		{"crème pâtissière", "Creme Patissiere"},
		{"CRÈME PÂTISSIÈRE", "creme patissiere"},
		{"  béchamel   sauce ", "Béchamel Sauce"},
		{"béchamel", "béchamel sauce"},
		{"pass", "pas"}, // "ss" keeps its s
		{"gas", "ga"},   // too short to lose a plural s
		{"tomato sauces", "tomato sauce"},
	} {
		t.Run(tc.line+"/"+tc.candidate, func(t *testing.T) {
			want := baserecipe.MatchReference(baserecipe.Reference{Name: tc.line, FileIndex: 0},
				[]baserecipe.RefCandidate{{Kind: baserecipe.KindBase, RecipeID: 40, Name: tc.candidate}})
			wantTile := len(want) == 1 && want[0].Exact // an unmarked line is asked about on an exact match only
			ex := recipefile.Existing{
				Ingredients: []ingredientT{ing(7, tc.candidate, "ml")},
				Recipes:     []recipefile.RecipeRef{{ID: 40, Name: tc.candidate}},
				BaseRecipes: []recipefile.BaseRecipeRef{{RecipeID: 40, IngredientID: 7}},
			}
			f := lasagneWith(recipefile.Line{Ingredient: tc.line, Quantity: 500, Unit: "ml"})
			p := plan(t, f, ex, recipefile.Decisions{})
			gotTile := false
			for _, r := range p.BaseRecipeLines {
				gotTile = gotTile || r.Path == lineB
			}
			if gotTile != wantTile {
				t.Errorf("Import Review asks about %q against %q: %v, MatchReference says exact: %v", tc.line, tc.candidate, gotTile, wantTile)
			}
		})
	}
}

func TestImportReviewSuggestsWhatMatchReferenceRanksForAMarkedLine(t *testing.T) {
	line := recipefile.Line{Ingredient: "bechamel sauce", Quantity: 500, Unit: "ml", Recipe: &recipefile.LineRecipe{Name: "Béchamels"}}
	ex := recipefile.Existing{
		Recipes:     []recipefile.RecipeRef{{ID: 40, Name: "Bechamel"}, {ID: 41, Name: "Béchamel sauce"}, {ID: 42, Name: "Pesto"}, {ID: 43, Name: "Bechamel (white)"}},
		BaseRecipes: []recipefile.BaseRecipeRef{{RecipeID: 40, IngredientID: 7}},
	}
	f := lasagneWith(line)
	p := plan(t, f, ex, recipefile.Decisions{})
	row := rowAt(t, p, lineB)

	cands := []baserecipe.RefCandidate{
		{Kind: baserecipe.KindBase, RecipeID: 40, Name: "Bechamel"},
		{Kind: baserecipe.KindPlannable, RecipeID: 41, Name: "Béchamel sauce"},
		{Kind: baserecipe.KindPlannable, RecipeID: 42, Name: "Pesto"},
		{Kind: baserecipe.KindPlannable, RecipeID: 43, Name: "Bechamel (white)"},
	}
	want := map[string]bool{} // name -> exact
	var wantOrder []string
	for _, s := range baserecipe.MatchReference(baserecipe.Reference{Name: "Béchamels", FileIndex: 0}, cands) {
		want[s.Name] = s.Exact
		wantOrder = append(wantOrder, s.Name)
	}
	got := map[string]bool{}
	var gotNames []string
	for _, s := range row.Suggestions {
		got[s.Name] = s.Exact
		gotNames = append(gotNames, s.Name)
	}
	sort.Strings(wantOrder)
	sort.Strings(gotNames)
	if len(got) != len(want) {
		t.Fatalf("suggestions %v, MatchReference %v", gotNames, wantOrder)
	}
	for n, exact := range want {
		if e, ok := got[n]; !ok || e != exact {
			t.Errorf("%q: review exact=%v present=%v, MatchReference exact=%v", n, e, ok, exact)
		}
	}
	if len(row.Suggestions) > 0 && row.Suggestions[0].Name != "Bechamel" {
		t.Errorf("the exact Base recipe comes first, got %q", row.Suggestions[0].Name)
	}
}

// ---- rowless decisions, names that are taken --------------------------------------------------------------------------

func creamLine() recipefile.Line {
	return recipefile.Line{Ingredient: "cream", Quantity: 100, Unit: "ml"}
}

func TestAKeepDecisionOnALineWithNoRowIsIgnored(t *testing.T) {
	f := lasagneWith(creamLine())
	base := plan(t, f, existingBase(), recipefile.Decisions{})
	p := plan(t, f, existingBase(), answerAt(lineB, recipefile.BaseRecipeLineDecision{Action: recipefile.BaseKeep}))
	if len(p.BaseRecipeLines) != 0 || len(p.Problems) != 0 || p.Ready != base.Ready || !p.Ready {
		t.Errorf("keep on a line nobody asks about changes nothing: rows %+v problems %+v ready %v", p.BaseRecipeLines, p.Problems, p.Ready)
	}
	c, err := recipefile.BuildCommit(f, existingBase(), answerAt(lineB, recipefile.BaseRecipeLineDecision{Action: recipefile.BaseKeep}), noImages)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.BaseRecipeLines) != 0 {
		t.Errorf("the commit carries no tile for it: %+v", c.BaseRecipeLines)
	}
}

func TestAnyOtherDecisionOnALineWithNoRowIsHonoured(t *testing.T) {
	f := lasagneWith(creamLine())
	for name, d := range map[string]recipefile.BaseRecipeLineDecision{
		"use":    {Action: recipefile.BaseUse, RecipeID: 40},
		"create": {Action: recipefile.BaseCreate},
	} {
		p := plan(t, f, existingBase(), answerAt(lineB, d))
		row := rowAt(t, p, lineB)
		if !row.Resolved || row.Effective == nil || row.Effective.Action != d.Action {
			t.Errorf("%s: the User chose it on a line of their own: %+v", name, row)
		}
		c, err := recipefile.BuildCommit(f, existingBase(), answerAt(lineB, d), noImages)
		if err != nil || len(c.BaseRecipeLines) != 1 || c.BaseRecipeLines[0].Decision.Action != d.Action {
			t.Errorf("%s: commit = %+v, %v", name, c.BaseRecipeLines, err)
		}
	}
}

func TestANameAnotherBaseRecipeHoldsIsAProblemOnTheTileBeforeConfirm(t *testing.T) {
	p := plan(t, lasagneWith(bechamelLine()), existingBase(), answerAt(lineB, recipefile.BaseRecipeLineDecision{Action: recipefile.BaseCreate}))
	if p.Ready || !hasProblem(p, lineB, "base_recipe_name_taken") {
		t.Errorf("want base_recipe_name_taken at %s: %+v", lineB, p.Problems)
	}
	if row := rowAt(t, p, lineB); row.Resolved {
		t.Errorf("the refused answer leaves the tile open: %+v", row)
	}
}

func TestANameAReadyMealHoldsIsAProblemOnTheTileBeforeConfirm(t *testing.T) {
	ex := recipefile.Existing{Recipes: []recipefile.RecipeRef{{ID: 60, Name: "Pizza", ReadyMeal: true}}}
	line := recipefile.Line{Ingredient: "pizza", Quantity: 1, Unit: "piece"}
	p := plan(t, lasagneWith(line), ex, answerAt(lineB, recipefile.BaseRecipeLineDecision{Action: recipefile.BaseCreate}))
	if p.Ready || !hasProblem(p, lineB, "ready_meal_name_taken") {
		t.Errorf("want ready_meal_name_taken at %s: %+v", lineB, p.Problems)
	}
}
