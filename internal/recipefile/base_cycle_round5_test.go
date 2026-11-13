package recipefile_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// BR-C commit half, round 5: a cycle that mixes both kinds of edge (docs/dev/design/base-recipes.md §3.4, §11.3).
//
// Two kinds of edge make a Base recipe of the file wait for another one:
//   - a file answer: a line answered "file" points at that Recipe of the file (the line calls for it);
//   - a kept line: a line answered "keep" whose plain Ingredient is named like a Base recipe of the file needs that
//     Base recipe's Ingredient to exist first (the store creates it with the Base recipe, never from ingredients[]).
//
// checkBaseCycles sees only the first kind and checkHolderCycles only the second, so a cycle made of both slipped
// through: the plan said Ready, then Apply failed with ErrStale. The review must see the cycle on a tile.

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

func TestACycleMixingAFileAnswerAndAKeptLineIsAProblemOnATileNotAFailedApply(t *testing.T) {
	// Ragù keeps "béchamel" as a plain line; Béchamel's "ragù" line is answered file -> Ragù.
	ragu := fileBase("Ragù", 1, "kg", recipefile.Line{Ingredient: "béchamel", Quantity: 100, Unit: "ml"})
	bech := fileBase("Béchamel", 1, "l", recipefile.Line{Ingredient: "ragù", Quantity: 50, Unit: "g"})
	f := fileOf(ragu, bech)
	f.Ingredients = []recipefile.Ingredient{{Name: "béchamel", BaseUnit: "ml"}, {Name: "ragù", BaseUnit: "g"}}
	kept, answered := "$.recipes[0].ingredients[0]", "$.recipes[1].ingredients[0]"
	d := recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{
		kept: {Action: recipefile.BaseKeep}, answered: fileAnswer(0),
	}}

	p := plan(t, f, recipefile.Existing{}, d)
	if p.Ready {
		t.Fatal("Ragù needs Béchamel's Ingredient (a kept line) and Béchamel needs Ragù (a file answer): no write order exists, so the review cannot say Ready")
	}
	probs := cycleProblems(p)
	if len(probs) == 0 {
		t.Fatalf("want a base_recipe_cycle Problem: %+v", p.Problems)
	}
	for _, pr := range probs {
		if pr.Path != kept && pr.Path != answered {
			t.Errorf("the Problem belongs on a tile of the cycle (%s or %s), got %q", kept, answered, pr.Path)
		}
		if !strings.Contains(pr.Message, "Ragù") || !strings.Contains(pr.Message, "Béchamel") {
			t.Errorf("the message names the Recipes of the cycle: %q", pr.Message)
		}
		if strings.Contains(pr.Message, "each keep a line named after the other") {
			t.Errorf("only one of the two keeps a line, so \"each keep a line\" is wrong: %q", pr.Message)
		}
	}
	// BuildCommit refuses what the review refuses.
	var notReady *recipefile.NotReadyError
	if _, err := recipefile.BuildCommit(f, recipefile.Existing{}, d, noImages); !errors.As(err, &notReady) {
		t.Errorf("BuildCommit = %v, want *NotReadyError", err)
	}
}

func TestAThreeRecipeCycleMixingBothKindsNamesItsPathLikeCycleMessageDoes(t *testing.T) {
	// Ragù keeps "béchamel"; Béchamel's "roux" line is answered file -> Roux; Roux's "ragù" line is answered file -> Ragù.
	ragu := fileBase("Ragù", 1, "kg", recipefile.Line{Ingredient: "béchamel", Quantity: 100, Unit: "ml"})
	bech := fileBase("Béchamel", 1, "l", recipefile.Line{Ingredient: "roux", Quantity: 80, Unit: "g"})
	roux := fileBase("Roux", 160, "g", recipefile.Line{Ingredient: "ragù", Quantity: 20, Unit: "g"})
	f := fileOf(ragu, bech, roux)
	f.Ingredients = []recipefile.Ingredient{{Name: "béchamel", BaseUnit: "ml"}, {Name: "roux", BaseUnit: "g"}, {Name: "ragù", BaseUnit: "g"}}
	kept, toRoux, toRagu := "$.recipes[0].ingredients[0]", "$.recipes[1].ingredients[0]", "$.recipes[2].ingredients[0]"
	d := recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{
		kept: {Action: recipefile.BaseKeep}, toRoux: fileAnswer(2), toRagu: fileAnswer(0),
	}}

	p := plan(t, f, recipefile.Existing{}, d)
	if p.Ready {
		t.Fatal("Ragù -> Béchamel (kept line) -> Roux -> Ragù is a cycle: the review cannot say Ready")
	}
	probs := cycleProblems(p)
	if len(probs) == 0 {
		t.Fatalf("want a base_recipe_cycle Problem: %+v", p.Problems)
	}
	for _, pr := range probs {
		if pr.Path != kept && pr.Path != toRoux && pr.Path != toRagu {
			t.Errorf("the Problem belongs on a tile of the cycle, got %q", pr.Path)
		}
		for _, name := range []string{"Ragù", "Béchamel", "Roux"} {
			if !strings.Contains(pr.Message, name) {
				t.Errorf("the message names the whole path, %s is missing: %q", name, pr.Message)
			}
		}
		if strings.Contains(pr.Message, "each keep a line named after the other") {
			t.Errorf("\"each keep a line named after the other\" is wrong for three Recipes: %q", pr.Message)
		}
		// cycleMessage's shape: "A calls for B, which calls for C, which calls for A".
		if strings.Count(pr.Message, "which calls for") != 2 {
			t.Errorf("want the shape \"A calls for B, which calls for C, which calls for A\": %q", pr.Message)
		}
	}
}
