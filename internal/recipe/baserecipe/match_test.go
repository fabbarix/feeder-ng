package baserecipe_test

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	br "github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/units"
)

func base(id int64, name string) br.RefCandidate {
	return br.RefCandidate{Kind: br.KindBase, RecipeID: id, Name: name}
}
func plannable(id int64, name string) br.RefCandidate {
	return br.RefCandidate{Kind: br.KindPlannable, RecipeID: id, Name: name}
}
func inFile(i int, name string) br.RefCandidate {
	return br.RefCandidate{Kind: br.KindFile, FileIndex: i, Name: name}
}

func suggestionNames(s []br.Suggestion) []string {
	out := make([]string, len(s))
	for i, x := range s {
		out[i] = x.Kind + ":" + x.Name
	}
	return out
}

func ref(name string) br.Reference { return br.Reference{Name: name, FileIndex: -1} }

// ---- MatchReference ----

func TestMatchReferenceExactKeys(t *testing.T) {
	cands := []br.RefCandidate{base(2, "Béchamel"), base(4, "Pasta frolla"), plannable(9, "Pesto")}
	for _, q := range []string{"Béchamel", "béchamel", "BÉCHAMEL", "bechamel", "  bechamel ", "béchamels", "Bechamels", "pasta   frolla"} {
		got := br.MatchReference(ref(q), cands)
		if len(got) == 0 || !got[0].Exact {
			t.Errorf("%q: not an exact first suggestion: %v", q, suggestionNames(got))
			continue
		}
		want := "Béchamel"
		if strings.HasPrefix(strings.ToLower(q), "pasta") {
			want = "Pasta frolla"
		}
		if got[0].Name != want || got[0].Kind != br.KindBase {
			t.Errorf("%q: first = %+v, want %s", q, got[0], want)
		}
		if got[0].Score != 1 {
			t.Errorf("%q: exact score = %v, want 1", q, got[0].Score)
		}
	}
}

func TestMatchReferenceCarriesTheCandidate(t *testing.T) {
	got := br.MatchReference(ref("pesto"), []br.RefCandidate{plannable(9, "Pesto"), inFile(3, "Salsa")})
	if len(got) != 1 || got[0].RecipeID != 9 || got[0].Kind != br.KindPlannable {
		t.Fatalf("got %+v", got)
	}
	got = br.MatchReference(ref("salsa"), []br.RefCandidate{inFile(3, "Salsa")})
	if len(got) != 1 || got[0].FileIndex != 3 || got[0].Kind != br.KindFile {
		t.Fatalf("got %+v", got)
	}
}

func TestMatchReferenceFuzzy(t *testing.T) {
	cands := []br.RefCandidate{base(2, "Béchamel sauce"), base(3, "Roux"), plannable(9, "Pesto")}
	got := br.MatchReference(ref("bechamel"), cands)
	if len(got) != 1 || got[0].Name != "Béchamel sauce" {
		t.Fatalf("got %v", suggestionNames(got))
	}
	if got[0].Exact {
		t.Error("a fuzzy match is not Exact")
	}
	if got[0].Score < ingredient.MinScore || got[0].Score >= 1 {
		t.Errorf("score = %v", got[0].Score)
	}
	if want := ingredient.Score("bechamel", "Béchamel sauce"); got[0].Score != want {
		t.Errorf("score = %v, want the shared ingredient.Score %v", got[0].Score, want)
	}
}

func TestMatchReferenceNoMatchAndBlank(t *testing.T) {
	cands := []br.RefCandidate{base(2, "Béchamel"), plannable(9, "Pesto")}
	if got := br.MatchReference(ref("chicken thighs"), cands); len(got) != 0 {
		t.Errorf("got %v", suggestionNames(got))
	}
	for _, q := range []string{"", "   "} {
		if got := br.MatchReference(ref(q), cands); len(got) != 0 {
			t.Errorf("%q: got %v", q, suggestionNames(got))
		}
	}
	if got := br.MatchReference(ref("béchamel"), nil); len(got) != 0 {
		t.Errorf("no candidates: %v", suggestionNames(got))
	}
}

func TestMatchReferenceGroupsBaseThenFileThenPlannable(t *testing.T) {
	cands := []br.RefCandidate{plannable(9, "Béchamel"), inFile(1, "Béchamel"), base(2, "Béchamel")}
	got := br.MatchReference(ref("béchamel"), cands)
	want := []string{"base:Béchamel", "file:Béchamel", "plannable:Béchamel"}
	if !eqStrings(suggestionNames(got), want) {
		t.Fatalf("order = %v, want %v", suggestionNames(got), want)
	}
	for _, s := range got {
		if !s.Exact {
			t.Errorf("%+v should be Exact", s)
		}
	}
}

func TestMatchReferenceExactBeforeFuzzyAcrossGroups(t *testing.T) {
	cands := []br.RefCandidate{base(3, "Béchamel sauce"), plannable(9, "Béchamel")}
	got := br.MatchReference(ref("béchamel"), cands)
	want := []string{"plannable:Béchamel", "base:Béchamel sauce"}
	if !eqStrings(suggestionNames(got), want) {
		t.Fatalf("order = %v, want %v", suggestionNames(got), want)
	}
}

func TestMatchReferenceFuzzyOrderedByScoreThenName(t *testing.T) {
	cands := []br.RefCandidate{base(3, "Béchamel sauce with nutmeg"), base(4, "Béchamel sauce"), base(5, "Béchamel au gratin"), base(6, "Béchamel au gratin ")}
	got := br.MatchReference(ref("béchamel"), cands)
	if len(got) < 2 || got[0].Name != "Béchamel sauce" {
		t.Fatalf("closest first, got %v", suggestionNames(got))
	}
	for i := 1; i < len(got); i++ {
		if got[i].Score > got[i-1].Score {
			t.Errorf("not by score descending: %v", suggestionNames(got))
		}
	}
}

func TestMatchReferenceCuePreviousRecipe(t *testing.T) {
	cands := []br.RefCandidate{inFile(0, "Intro"), inFile(1, "Salsa verde"), inFile(2, "Fish"), inFile(3, "Dessert"), base(5, "Salsa verde")}
	for _, cue := range []string{"from the previous recipe", "the sauce above", "See ABOVE", "Previous Recipe"} {
		got := br.MatchReference(br.Reference{Name: "sauce", Cue: cue, FileIndex: 2}, cands)
		if len(got) == 0 || got[0].Kind != br.KindFile || got[0].FileIndex != 1 || !got[0].ByCue {
			t.Errorf("cue %q: got %v", cue, suggestionNames(got))
		}
	}
}

func TestMatchReferenceCueNextRecipe(t *testing.T) {
	cands := []br.RefCandidate{inFile(0, "Fish"), inFile(1, "Salsa verde")}
	got := br.MatchReference(br.Reference{Name: "green sauce", Cue: "see next recipe", FileIndex: 0}, cands)
	if len(got) != 1 || got[0].FileIndex != 1 || !got[0].ByCue {
		t.Fatalf("got %+v", got)
	}
}

func TestMatchReferenceCueWithNoNeighbour(t *testing.T) {
	cands := []br.RefCandidate{inFile(0, "Fish"), inFile(1, "Chips")}
	if got := br.MatchReference(br.Reference{Name: "sauce", Cue: "from the previous recipe", FileIndex: 0}, cands); len(got) != 0 {
		t.Errorf("no recipe before the first one: %v", suggestionNames(got))
	}
	if got := br.MatchReference(br.Reference{Name: "sauce", Cue: "next recipe", FileIndex: 1}, cands); len(got) != 0 {
		t.Errorf("no recipe after the last one: %v", suggestionNames(got))
	}
	if got := br.MatchReference(br.Reference{Name: "sauce", Cue: "previous recipe", FileIndex: -1}, cands); len(got) != 0 {
		t.Errorf("not an import: %v", suggestionNames(got))
	}
}

func TestMatchReferenceCueWinsButDoesNotDuplicate(t *testing.T) {
	cands := []br.RefCandidate{inFile(0, "Béchamel"), inFile(1, "Lasagne"), base(2, "Béchamel")}
	got := br.MatchReference(br.Reference{Name: "béchamel", Cue: "the previous recipe", FileIndex: 1}, cands)
	want := []string{"file:Béchamel", "base:Béchamel"}
	if !eqStrings(suggestionNames(got), want) {
		t.Fatalf("got %v, want %v", suggestionNames(got), want)
	}
	if !got[0].ByCue || !got[0].Exact {
		t.Errorf("the cue pick is also an exact name match: %+v", got[0])
	}
}

func TestMatchReferenceOrdinaryCueTextIsIgnored(t *testing.T) {
	cands := []br.RefCandidate{inFile(0, "Fish"), inFile(1, "Chips")}
	got := br.MatchReference(br.Reference{Name: "pasta frolla", Cue: "see page 42", FileIndex: 1}, cands)
	if len(got) != 0 {
		t.Errorf("got %v", suggestionNames(got))
	}
}

// ---- LinkCandidates ----

func lines() []br.CandidateLine {
	return []br.CandidateLine{
		{RecipeID: 1, RecipeName: "Lasagne", LineIndex: 0, IngredientName: "béchamel", Quantity: 500, Unit: "ml"},
		{RecipeID: 6, RecipeName: "Cannelloni", Archived: true, LineIndex: 2, IngredientName: "Bechamel", Quantity: 1, Unit: "jar"},
		{RecipeID: 7, RecipeName: "Moussaka", LineIndex: 4, IngredientName: "BÉCHAMELS", Quantity: 300, Unit: "g"},
		{RecipeID: 1, RecipeName: "Lasagne", LineIndex: 1, IngredientName: "milk", Quantity: 100, Unit: "ml"},
		{RecipeID: 8, RecipeName: "Pie", LineIndex: 0, IngredientName: "béchamel sauce", Quantity: 1, Unit: "ml"},
	}
}

func linkUnits() units.Ingredient {
	return ml("Béchamel", units.Conversion{Unit: "jar", ToBase: 300})
}

func byRecipe(c []br.LinkCandidate) map[int64]br.LinkCandidate {
	m := map[int64]br.LinkCandidate{}
	for _, x := range c {
		m[x.RecipeID] = x
	}
	return m
}

func TestLinkCandidatesSameKeyPlainLinesOnly(t *testing.T) {
	got := br.LinkCandidates("Béchamel", rBechamel, lines(), nil, linkUnits())
	m := byRecipe(got)
	if len(got) != 3 {
		t.Fatalf("got %d candidates: %+v", len(got), got)
	}
	for _, id := range []int64{1, 6, 7} {
		if _, ok := m[id]; !ok {
			t.Errorf("recipe %d missing (case, accents and plural must match the key)", id)
		}
	}
	if _, ok := m[8]; ok {
		t.Error("a different name (béchamel sauce) is not a candidate")
	}
	if m[1].LineIndex != 0 || m[1].Quantity != 500 {
		t.Errorf("line data lost: %+v", m[1])
	}
}

func TestLinkCandidatesOrderedByRecipeNameThenLine(t *testing.T) {
	ls := append(lines(), br.CandidateLine{RecipeID: 1, RecipeName: "Lasagne", LineIndex: 5, IngredientName: "béchamel", Quantity: 1, Unit: "ml"})
	got := br.LinkCandidates("Béchamel", rBechamel, ls, nil, linkUnits())
	var order []string
	for _, c := range got {
		order = append(order, c.RecipeName+"#"+strconv.Itoa(c.LineIndex))
	}
	want := []string{"Cannelloni#2", "Lasagne#0", "Lasagne#5", "Moussaka#4"}
	if !eqStrings(order, want) {
		t.Errorf("order = %v, want %v", order, want)
	}
}

func TestLinkCandidatesIncludeArchivedRecipes(t *testing.T) {
	m := byRecipe(br.LinkCandidates("Béchamel", rBechamel, lines(), nil, linkUnits()))
	if c, ok := m[6]; !ok || !c.Archived || !c.Linkable {
		t.Errorf("archived Cannelloni: %+v", c)
	}
}

func TestLinkCandidatesUnitReason(t *testing.T) {
	m := byRecipe(br.LinkCandidates("Béchamel", rBechamel, lines(), nil, linkUnits()))
	if c := m[7]; c.Linkable || c.Reason != br.ReasonUnitUnconvertible {
		t.Errorf("300 g for an ml Base recipe: %+v", c)
	}
	if c := m[1]; !c.Linkable || c.Reason != "" {
		t.Errorf("500 ml: %+v", c)
	}
	if c := m[6]; !c.Linkable { // jar is a custom conversion on the Base recipe Ingredient
		t.Errorf("1 jar converts: %+v", c)
	}
}

func TestLinkCandidatesLeaveOutTheBaseRecipeItself(t *testing.T) {
	ls := append(lines(), br.CandidateLine{RecipeID: rBechamel, RecipeName: "Béchamel", LineIndex: 3, IngredientName: "béchamel", Quantity: 1, Unit: "ml"})
	m := byRecipe(br.LinkCandidates("Béchamel", rBechamel, ls, nil, linkUnits()))
	if _, ok := m[rBechamel]; ok {
		t.Error("the Base recipe's own line was offered")
	}
}

func TestLinkCandidatesCycleReasonForRecipesInTheBaseRecipesTree(t *testing.T) {
	// Béchamel calls for Roux, which calls for Pasta frolla: linking a line on either would close a cycle.
	graph := map[int64][]int64{rBechamel: {rRoux}, rRoux: {rFrolla}}
	ls := []br.CandidateLine{
		{RecipeID: rRoux, RecipeName: "Roux", LineIndex: 0, IngredientName: "béchamel", Quantity: 10, Unit: "ml"},
		{RecipeID: rFrolla, RecipeName: "Pasta frolla", LineIndex: 0, IngredientName: "béchamel", Quantity: 10, Unit: "g"},
		{RecipeID: rLasagne, RecipeName: "Lasagne", LineIndex: 0, IngredientName: "béchamel", Quantity: 10, Unit: "ml"},
	}
	m := byRecipe(br.LinkCandidates("Béchamel", rBechamel, ls, graph, linkUnits()))
	if c := m[rRoux]; c.Linkable || c.Reason != br.ReasonCycle {
		t.Errorf("Roux: %+v", c)
	}
	if c := m[rFrolla]; c.Linkable || c.Reason != br.ReasonCycle {
		t.Errorf("Pasta frolla (cycle wins over the unit): %+v", c)
	}
	if c := m[rLasagne]; !c.Linkable {
		t.Errorf("Lasagne: %+v", c)
	}
}

func TestLinkCandidatesNoneAndEmptyName(t *testing.T) {
	if got := br.LinkCandidates("Béchamel", rBechamel, nil, nil, linkUnits()); len(got) != 0 {
		t.Errorf("got %+v", got)
	}
	if got := br.LinkCandidates("  ", rBechamel, lines(), nil, linkUnits()); len(got) != 0 {
		t.Errorf("blank name matched %+v", got)
	}
}

func TestLinkCandidatesDoNotMutateTheInput(t *testing.T) {
	ls := lines()
	br.LinkCandidates("Béchamel", rBechamel, ls, nil, linkUnits())
	if ls[0].RecipeName != "Lasagne" || ls[1].RecipeName != "Cannelloni" || len(ls) != 5 {
		t.Errorf("input reordered: %+v", ls)
	}
}

// ---- PickerOrder ----

func pickerRecipes() []br.PickerRecipe {
	return []br.PickerRecipe{
		{ID: 3, Name: "Roux", Base: true},
		{ID: 4, Name: "Pasta frolla", Base: true},
		{ID: 7, Name: "Béchamel sauce", Base: true},
		{ID: 2, Name: "Béchamel", Base: true},
		{ID: 8, Name: "Old béchamel", Base: true, Archived: true},
		{ID: 1, Name: "Lasagne"},
		{ID: 9, Name: "Pesto"},
		{ID: 10, Name: "Béchamel pie"},
		{ID: 11, Name: "Old pie", Archived: true},
	}
}

func rowNames(rows []br.PickerRow) []string {
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = r.Group + ":" + r.Name
	}
	return out
}

func TestPickerOrderNameMatchesFirstThenGroups(t *testing.T) {
	rows := br.PickerOrder("béchamel", rLasagne, pickerRecipes(), nil)
	want := []string{"base:Béchamel", "base:Béchamel sauce", "base:Pasta frolla", "base:Roux", "plannable:Béchamel pie", "plannable:Pesto"}
	if !eqStrings(rowNames(rows), want) {
		t.Fatalf("rows = %v, want %v", rowNames(rows), want)
	}
	if !rows[0].Exact || rows[1].Exact {
		t.Errorf("Exact flags: %v %v", rows[0].Exact, rows[1].Exact)
	}
}

func TestPickerOrderLeavesOutArchivedAndSelf(t *testing.T) {
	for _, r := range br.PickerOrder("béchamel", rLasagne, pickerRecipes(), nil) {
		if r.Archived || r.ID == rLasagne {
			t.Errorf("%+v should be left out", r)
		}
	}
}

func TestPickerOrderRestByName(t *testing.T) {
	rows := br.PickerOrder("zzz unrelated", rLasagne, pickerRecipes(), nil)
	want := []string{"base:Béchamel", "base:Béchamel sauce", "base:Pasta frolla", "base:Roux", "plannable:Béchamel pie", "plannable:Pesto"}
	if !eqStrings(rowNames(rows), want) {
		t.Fatalf("rows = %v, want %v", rowNames(rows), want)
	}
	for _, r := range rows {
		if r.Exact {
			t.Errorf("%+v is not Exact", r)
		}
	}
}

func TestPickerOrderAccentsAndPluralMakeAnExactMatch(t *testing.T) {
	rows := br.PickerOrder("Bechamels", rLasagne, pickerRecipes(), nil)
	if len(rows) == 0 || rows[0].Name != "Béchamel" || !rows[0].Exact {
		t.Fatalf("rows = %v", rowNames(rows))
	}
}

func TestPickerOrderDisablesRowsThatWouldMakeACycle(t *testing.T) {
	// Roux calls (through Stock) for Lasagne: picking Roux from a Lasagne line would be a cycle.
	graph := map[int64][]int64{3: {5}, 5: {1}}
	rows := br.PickerOrder("béchamel", rLasagne, pickerRecipes(), graph)
	for _, r := range rows {
		wantDisabled := r.ID == 3
		if r.Disabled != wantDisabled {
			t.Errorf("%s: Disabled = %v", r.Name, r.Disabled)
		}
		if r.Disabled && r.Reason != br.ReasonCycle {
			t.Errorf("%s: Reason = %q", r.Name, r.Reason)
		}
		if !r.Disabled && r.Reason != "" {
			t.Errorf("%s: Reason = %q on an enabled row", r.Name, r.Reason)
		}
	}
	// The row keeps its place.
	if rows[3].Name != "Roux" {
		t.Errorf("rows = %v", rowNames(rows))
	}
}

func TestPickerOrderCycleAlsoDisablesPlannableRows(t *testing.T) {
	graph := map[int64][]int64{9: {1}}
	for _, r := range br.PickerOrder("pesto", rLasagne, pickerRecipes(), graph) {
		if r.ID == 9 && (!r.Disabled || r.Reason != br.ReasonCycle) {
			t.Errorf("Pesto: %+v", r)
		}
	}
}

func TestPickerOrderEmpty(t *testing.T) {
	if rows := br.PickerOrder("x", rLasagne, nil, nil); len(rows) != 0 {
		t.Errorf("rows = %v", rows)
	}
}

// ---- package purity ----

func TestPackageImportsOnlyPureDependencies(t *testing.T) {
	allowedPrefix := []string{
		"github.com/fabbarix/feeder-ng/internal/units",
		"github.com/fabbarix/feeder-ng/internal/recipe/schedule",
		"github.com/fabbarix/feeder-ng/internal/ingredient",
	}
	files, err := filepath.Glob("*.go")
	if err != nil || len(files) == 0 {
		t.Fatalf("glob: %v %v", files, err)
	}
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		src, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		af, err := parser.ParseFile(token.NewFileSet(), f, src, parser.ImportsOnly)
		if err != nil {
			t.Fatal(err)
		}
		for _, imp := range af.Imports {
			p, _ := strconv.Unquote(imp.Path.Value)
			if !strings.Contains(p, ".") { // standard library
				switch p {
				case "database/sql", "net/http", "os", "io/ioutil", "net", "time":
					t.Errorf("%s imports %s: the package is pure (no SQL, HTTP, clock, files)", f, p)
				}
				continue
			}
			ok := false
			for _, a := range allowedPrefix {
				ok = ok || p == a
			}
			if !ok {
				t.Errorf("%s imports %s", f, p)
			}
		}
	}
}
