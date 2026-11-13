package recipefile_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// BR-C commit half, round 5: what is and is not a cycle edge (docs/dev/design/base-recipes.md §3.4, §11.3).
//
// Only a line answered "file" is an edge: that Recipe calls for the other. A line answered "keep" is no edge: it goes on
// a new plain Ingredient keyed by its name, and a Base recipe's Ingredient is keyed base-recipe:<id>, so a kept line
// named after another Base recipe depends on nothing. The plan is Ready and Apply writes everything.

func fileBase(name string, yield float64, unit string, lines ...recipefile.Line) recipefile.Recipe {
	r := miniRecipe(name)
	r.BaseRecipe, r.Yield, r.YieldUnit = ptr(true), yield, unit
	r.Ingredients = lines
	return r
}

func cycleProblems(p recipefile.Plan) []recipefile.Problem {
	var out []recipefile.Problem
	for _, pr := range p.Problems {
		if pr.Code == recipefile.ProblemBaseRecipeCycle {
			out = append(out, pr)
		}
	}
	return out
}

func TestAKeptLineIsNoEdgeSoARagùThatKeepsBéchamelAndABéchamelThatCallsRagùIsReady(t *testing.T) {
	ragu := fileBase("Ragù", 1, "kg", recipefile.Line{Ingredient: "béchamel", Quantity: 100, Unit: "ml"})
	bech := fileBase("Béchamel", 1, "l", recipefile.Line{Ingredient: "ragù", Quantity: 50, Unit: "g"})
	f := fileOf(ragu, bech)
	f.Ingredients = []recipefile.Ingredient{{Name: "béchamel", BaseUnit: "ml"}, {Name: "ragù", BaseUnit: "g"}}
	d := recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{
		"$.recipes[0].ingredients[0]": {Action: recipefile.BaseKeep}, "$.recipes[1].ingredients[0]": fileAnswer(0),
	}}
	p := plan(t, f, recipefile.Existing{}, d)
	if !p.Ready || len(cycleProblems(p)) != 0 {
		t.Fatalf("Ragù keeps a plain béchamel line, Béchamel calls for Ragù: no cycle, ready; problems %+v", p.Problems)
	}
	c, err := recipefile.BuildCommit(f, recipefile.Existing{}, d, noImages)
	if err != nil {
		t.Fatalf("BuildCommit: %v", err)
	}
	pos := map[int]int{}
	for i, rc := range c.Recipes {
		pos[rc.Index] = i
	}
	if pos[0] > pos[1] {
		t.Errorf("write order = %v: Ragù comes before Béchamel, which calls for it", pos)
	}
}

func TestAThreeRecipeLoopClosedOnlyByAKeptLineIsReady(t *testing.T) {
	// Ragù keeps "béchamel"; Béchamel's "roux" is answered file -> Roux; Roux's "ragù" is answered file -> Ragù.
	ragu := fileBase("Ragù", 1, "kg", recipefile.Line{Ingredient: "béchamel", Quantity: 100, Unit: "ml"})
	bech := fileBase("Béchamel", 1, "l", recipefile.Line{Ingredient: "roux", Quantity: 80, Unit: "g"})
	roux := fileBase("Roux", 160, "g", recipefile.Line{Ingredient: "ragù", Quantity: 20, Unit: "g"})
	f := fileOf(ragu, bech, roux)
	f.Ingredients = []recipefile.Ingredient{{Name: "béchamel", BaseUnit: "ml"}, {Name: "roux", BaseUnit: "g"}, {Name: "ragù", BaseUnit: "g"}}
	d := recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{
		"$.recipes[0].ingredients[0]": {Action: recipefile.BaseKeep},
		"$.recipes[1].ingredients[0]": fileAnswer(2),
		"$.recipes[2].ingredients[0]": fileAnswer(0),
	}}
	p := plan(t, f, recipefile.Existing{}, d)
	if !p.Ready || len(cycleProblems(p)) != 0 {
		t.Fatalf("only the kept line would close the loop, and it is no edge: ready, no cycle; problems %+v", p.Problems)
	}
	if _, err := recipefile.BuildCommit(f, recipefile.Existing{}, d, noImages); err != nil {
		t.Fatalf("BuildCommit: %v", err)
	}
}

func TestAThreeRecipeCycleOfFileAnswersNamesItsPathLikeCycleMessageDoes(t *testing.T) {
	a := fileBase("Ragù", 1, "kg", recipefile.Line{Ingredient: "béchamel", Quantity: 100, Unit: "ml"})
	b := fileBase("Béchamel", 1, "l", recipefile.Line{Ingredient: "roux", Quantity: 80, Unit: "g"})
	c := fileBase("Roux", 160, "g", recipefile.Line{Ingredient: "ragù", Quantity: 20, Unit: "g"})
	f := fileOf(a, b, c)
	f.Ingredients = []recipefile.Ingredient{{Name: "béchamel", BaseUnit: "ml"}, {Name: "roux", BaseUnit: "g"}, {Name: "ragù", BaseUnit: "g"}}
	d := recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{
		"$.recipes[0].ingredients[0]": fileAnswer(1),
		"$.recipes[1].ingredients[0]": fileAnswer(2),
		"$.recipes[2].ingredients[0]": fileAnswer(0),
	}}
	p := plan(t, f, recipefile.Existing{}, d)
	if p.Ready {
		t.Fatal("Ragù, Béchamel and Roux call for each other in a ring: not ready")
	}
	probs := cycleProblems(p)
	if len(probs) == 0 {
		t.Fatalf("want a base_recipe_cycle Problem: %+v", p.Problems)
	}
	for _, pr := range probs {
		for _, name := range []string{"Ragù", "Béchamel", "Roux"} {
			if !strings.Contains(pr.Message, name) {
				t.Errorf("the message names the whole path, %s is missing: %q", name, pr.Message)
			}
		}
		if strings.Contains(pr.Message, "each keep") || strings.Count(pr.Message, "which calls for") != 2 {
			t.Errorf("want \"A calls for B, which calls for C, which calls for A\": %q", pr.Message)
		}
	}
}
