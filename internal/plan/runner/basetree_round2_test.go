package runner_test

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/plan/runner"
)

// BR-F round 2 (Opus review): a cyclic tree, the catalog read once, and the skipped lines logged again.

// seedCycle makes Lasagne -> Sauce B -> Sauce A, then closes the loop with raw SQL (A calls for B), which the API refuses.
func (s *brSrc) seedCycle() (lasagne, soup int64) {
	a := s.base("Sauce A", 1, "l", nil, brLine(s.milk, 1000, "ml"))
	b := s.base("Sauce B", 1, "l", nil, brCall(a.ID, 500, "ml"))
	lasagne = s.plain("Lasagne", brLine(s.flour, 200, "g"), brCall(b.ID, 500, "ml")).ID
	soup = s.plain("Soup", brLine(s.milk, 200, "ml")).ID
	if _, err := s.env.DB.Exec(`INSERT INTO recipe_lines(recipe_id, position, ingredient_id, quantity, unit) VALUES (?, 5, ?, 500, 'ml')`, a.ID, b.BaseIngredientID); err != nil {
		s.t.Fatalf("close the cycle: %v", err)
	}
	return lasagne, soup
}

func loggedSources(s *brSrc) (*runner.DBSources, *bytes.Buffer) {
	var buf bytes.Buffer
	return runner.NewDBSources(s.env.DB, s.env.Clock, slog.New(slog.NewTextHandler(&buf, nil))), &buf
}

func TestACyclicRecipeIsLeftOutOfTheNeedTreesAndLoggedWithoutFailingTheOthers(t *testing.T) {
	s := newBRSrc(t)
	lasagne, soup := s.seedCycle()
	src, logs := loggedSources(s)
	trees, err := src.NeedTrees(ctx)
	if err != nil {
		t.Fatalf("NeedTrees = %v, want the cycle of one Recipe not to fail the others", err)
	}
	if _, ok := trees[lasagne]; ok {
		t.Errorf("trees hold the cyclic Lasagne: %+v", trees[lasagne])
	}
	if _, ok := trees[soup]; !ok {
		t.Errorf("no tree for Soup: one cyclic Recipe left the healthy ones out")
	}
	if !strings.Contains(logs.String(), "cycle") {
		t.Errorf("log = %q, want a warning that names the cycle", logs.String())
	}
}

func TestACyclicRecipeNeverReachesThePlannerAndDoesNotFailTheRun(t *testing.T) {
	s := newBRSrc(t)
	lasagne, _ := s.seedCycle()
	src, logs := loggedSources(s)
	all, err := src.Recipes(ctx)
	if err != nil {
		t.Fatalf("Recipes = %v, want the cycle of one Recipe not to fail the planner run (advanceSteps must treat ErrCycle like NeedTrees)", err)
	}
	var names []string
	for _, r := range all {
		names = append(names, r.Name)
		if int64(r.ID) == lasagne {
			t.Errorf("the planner was given the cyclic Lasagne with Needs %+v: with no Needs it would be planned past every Exclusion", r.Needs)
		}
	}
	if len(all) != 1 || names[0] != "Soup" {
		t.Errorf("Recipes for the planner = %v, want Soup only", names)
	}
	if !strings.Contains(logs.String(), "cycle") {
		t.Errorf("log = %q, want a warning that names the cycle", logs.String())
	}
}

func TestARecipeWithoutATreeNeverReachesThePlannerWhateverTheReason(t *testing.T) {
	s := newBRSrc(t)
	s.plain("Soup", brLine(s.milk, 200, "ml"))
	all, err := s.src.Recipes(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range all {
		if len(r.Needs) == 0 {
			t.Errorf("Recipe %q reaches the planner with no Needs", r.Name)
		}
	}
}

// ---- the catalog is loaded once per read (one Store.NeedTrees), not once per Recipe ----

// catalogLoad matches the one statement only the catalog load runs: every Unit Conversion, with no WHERE.
func catalogLoad(q string) bool {
	return strings.Contains(q, "FROM ingredient_conversions") && !strings.Contains(q, "WHERE")
}

func (s *brSrc) fewRecipes() {
	b := s.base("Béchamel", 1, "l", nil, brLine(s.milk, 1000, "ml"))
	s.plain("Lasagne", brLine(s.flour, 200, "g"), brCall(b.ID, 500, "ml"))
	s.plain("Cannelloni", brCall(b.ID, 300, "ml"))
	s.plain("Soup", brLine(s.milk, 200, "ml"))
	s.plain("Stew", brLine(s.flour, 100, "g"))
}

// These stay red until BR-B round 3 adds the batch Store.NeedTrees and the composed Timing.Advance on Get.
func TestAPlannerRunLoadsTheCatalogOnce(t *testing.T) {
	s := newBRSrc(t)
	s.fewRecipes()
	d, n := s.env.OpenCounting(t, catalogLoad)
	src := runner.NewDBSources(d, s.env.Clock, slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)))
	if _, err := src.Recipes(ctx); err != nil {
		t.Fatal(err)
	}
	if got := n.Count(); got != 1 {
		t.Errorf("Recipes loaded the catalog %d times for 4 Recipes, want once (one NeedTrees; advanceSteps no longer calls Cook per Recipe)", got)
	}
}

func TestNeedTreesLoadsTheCatalogOnce(t *testing.T) {
	s := newBRSrc(t)
	s.fewRecipes()
	d, n := s.env.OpenCounting(t, catalogLoad)
	src := runner.NewDBSources(d, s.env.Clock, slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)))
	if _, err := src.NeedTrees(ctx); err != nil {
		t.Fatal(err)
	}
	if got := n.Count(); got != 1 {
		t.Errorf("NeedTrees loaded the catalog %d times for 4 Recipes, want once", got)
	}
}

// ---- skipped lines are logged again ----

func TestALineWithAnUnconvertibleUnitIsSkippedAndLogged(t *testing.T) {
	s := newBRSrc(t)
	soup := s.plain("Soup", brLine(s.milk, 200, "ml"), brLine(s.flour, 100, "g"))
	// A unit flour (a weight Ingredient) cannot be measured in: the API refuses it, an old row can hold it.
	if _, err := s.env.DB.Exec(`UPDATE recipe_lines SET unit = 'cup' WHERE recipe_id = ? AND ingredient_id = ?`, soup.ID, s.flour); err != nil {
		t.Fatal(err)
	}
	src, logs := loggedSources(s)
	all, err := src.Recipes(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range all {
		if r.Name == "Soup" && len(r.Needs) != 1 {
			t.Errorf("Soup Needs = %+v, want the milk only (the cup of flour is left out)", r.Needs)
		}
	}
	out := logs.String()
	if !strings.Contains(out, "unconvertible") || !strings.Contains(out, "level=WARN") {
		t.Errorf("log = %q, want a warning that a line with an unconvertible unit was skipped", out)
	}
}
