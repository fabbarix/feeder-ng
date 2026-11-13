package recipefile_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// BR-C commit half, round 6: two tiles answered "convert" to the same Recipe (Lasagne's "pesto" line and Gnocchi's).
// The Recipe is turned into a Base recipe once. Pinned:
//   - same Yield and unit on both answers: Ready; Commit.BaseRecipeLines holds exactly one convert entry for the Recipe;
//     both lines point at it (LineBases {Kind: BaseRefRecipe, ID});
//   - the take-over ask is one, on the first tile in document order; an answer at the second tile's path is ignored;
//   - a different Yield or unit: a base_recipe_answer_invalid Problem on the second tile (the answer does not fit what
//     the first tile already decided), and the plan is not Ready.

const (
	pestoTile1 = "$.recipes[0].ingredients[1]"
	pestoTile2 = "$.recipes[1].ingredients[1]"
)

func twoPestoFile() recipefile.File {
	lasagne := miniRecipe("Lasagne")
	lasagne.Ingredients = []recipefile.Line{{Ingredient: "lasagne sheets", Quantity: 250, Unit: "g"}, {Ingredient: "pesto", Quantity: 100, Unit: "g"}}
	gnocchi := miniRecipe("Gnocchi")
	gnocchi.Ingredients = []recipefile.Line{{Ingredient: "potato", Quantity: 500, Unit: "g"}, {Ingredient: "pesto", Quantity: 60, Unit: "g"}}
	f := fileOf(lasagne, gnocchi)
	f.Ingredients = []recipefile.Ingredient{{Name: "lasagne sheets", BaseUnit: "g"}, {Name: "potato", BaseUnit: "g"}, {Name: "pesto", BaseUnit: "g"}}
	return f
}

func convertTo(yield float64, unit string) recipefile.BaseRecipeLineDecision {
	return recipefile.BaseRecipeLineDecision{Action: recipefile.BaseConvert, RecipeID: 50, Yield: yield, YieldUnit: unit}
}

func pestoExisting(plain bool) recipefile.Existing {
	ex := recipefile.Existing{Recipes: []recipefile.RecipeRef{{ID: 50, Name: "Pesto"}}}
	if plain {
		ex.Ingredients = []ingredientT{ing(5, "pesto", "g")}
	}
	return ex
}

func twoConverts(a, b recipefile.BaseRecipeLineDecision) recipefile.Decisions {
	return recipefile.Decisions{BaseRecipeLines: map[string]recipefile.BaseRecipeLineDecision{pestoTile1: a, pestoTile2: b}}
}

func TestTwoConvertAnswersToOneRecipeWithTheSameYieldAreReadyAndConvertOnce(t *testing.T) {
	f := twoPestoFile()
	d := twoConverts(convertTo(200, "g"), convertTo(200, "g"))
	p := plan(t, f, pestoExisting(false), d)
	if !p.Ready {
		t.Fatalf("both tiles agree: ready; problems %+v", p.Problems)
	}
	c, err := recipefile.BuildCommit(f, pestoExisting(false), d, noImages)
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, bl := range c.BaseRecipeLines {
		if bl.Decision.Action == recipefile.BaseConvert && bl.Decision.RecipeID == 50 {
			n++
		}
	}
	if n != 1 {
		t.Errorf("convert entries for Pesto = %d, want exactly 1 (the store turns a Recipe into a Base recipe once)", n)
	}
	for _, rc := range c.Recipes {
		if rc.Index < 0 || len(rc.LineBases) < 2 {
			continue
		}
		if b := rc.LineBases[1]; b.Kind != recipefile.BaseRefRecipe || b.ID != 50 {
			t.Errorf("Recipe %d line 1 = %+v, want {Kind recipe, ID 50}", rc.Index, b)
		}
	}
}

func TestTwoConvertAnswersAskTheTakeOverOnceOnTheFirstTile(t *testing.T) {
	f := twoPestoFile()
	d := twoConverts(convertTo(200, "g"), convertTo(200, "g"))
	p := plan(t, f, pestoExisting(true), d)
	asks, _ := planMap(t, p)["takeOvers"].([]any)
	if len(asks) != 1 {
		t.Fatalf("takeOvers = %v, want one ask for Pesto", asks)
	}
	if path := asks[0].(map[string]any)["path"]; path != pestoTile1 {
		t.Errorf("ask path = %v, want the first tile %s", path, pestoTile1)
	}
	if p.Ready {
		t.Fatal("not ready until the ask is answered")
	}
	for _, yes := range []bool{true, false} {
		if !plan(t, f, pestoExisting(true), withTakeOvers(t, d, map[string]bool{pestoTile1: yes})).Ready {
			t.Errorf("answer %v on the first tile makes the plan ready", yes)
		}
	}
	c, err := recipefile.BuildCommit(f, pestoExisting(true), withTakeOvers(t, d, map[string]bool{pestoTile1: true}), noImages)
	if err != nil {
		t.Fatal(err)
	}
	for _, bl := range c.BaseRecipeLines {
		if bl.Decision.Action == recipefile.BaseConvert && (bl.TakeOver == nil || !*bl.TakeOver) {
			t.Errorf("the convert entry carries the take-over answer: %+v", bl)
		}
	}
}

func TestTwoConvertAnswersToOneRecipeWithDifferentYieldsAreAProblemOnTheSecondTile(t *testing.T) {
	for name, second := range map[string]recipefile.BaseRecipeLineDecision{
		"another amount": convertTo(300, "g"),
		"another unit":   convertTo(200, "ml"),
	} {
		t.Run(name, func(t *testing.T) {
			p := plan(t, twoPestoFile(), pestoExisting(false), twoConverts(convertTo(200, "g"), second))
			if p.Ready {
				t.Fatal("one Recipe cannot become a Base recipe with two Yields: not ready")
			}
			var found bool
			for _, pr := range p.Problems {
				if pr.Path == pestoTile2 && pr.Code == recipefile.ProblemBaseRecipeAnswer && strings.Contains(pr.Message, "Pesto") {
					found = true
				}
				if pr.Path == pestoTile1 {
					t.Errorf("the first tile is fine, the second is the Problem: %+v", pr)
				}
			}
			if !found {
				t.Errorf("want base_recipe_answer_invalid naming Pesto on %s: %+v", pestoTile2, p.Problems)
			}
			var notReady *recipefile.NotReadyError
			if _, err := recipefile.BuildCommit(twoPestoFile(), pestoExisting(false), twoConverts(convertTo(200, "g"), second), noImages); err == nil {
				t.Error("BuildCommit must refuse")
			} else if !errors.As(err, &notReady) {
				t.Errorf("BuildCommit = %v, want *NotReadyError", err)
			}
		})
	}
}
