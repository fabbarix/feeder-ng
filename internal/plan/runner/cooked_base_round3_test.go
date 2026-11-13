package runner_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
)

// BR-G round 3 (regression): a required Base recipe line whose own lines are all optional is still a required line. It takes
// its jar and the jar is deducted; only the (optional) Ingredients inside it are never deducted.
func TestCookedTakesTheJarOfARequiredBaseRecipeWhoseOwnLinesAreAllOptional(t *testing.T) {
	b := newBrgEnv(t, lot(301, bechamelIng, 300))
	node := bechamelNode()
	for i := range node.Made {
		node.Made[i].Optional = true
	}
	b.ts.trees[b.rec["chicken"]] = []baserecipe.Need{{IngredientID: pasta, Quantity: 200, Path: "0"}, node}
	b.pinLasagne(1)
	if _, err := b.r.Cooked(ctx, b.key(9), nil); err != nil {
		t.Fatal(err)
	}
	// 500 g are called for and the jar holds 300: the jar is deducted; the 200 g to make are all optional, so nothing else.
	wantNeeds(t, "deduction", b.stock.deductions[0], []runner.Need{n(pasta, 200), n(bechamelIng, 300)})
}

func TestCookedTakesTheWholeJarOfARequiredBaseRecipeWhoseOwnLinesAreAllOptional(t *testing.T) {
	b := newBrgEnv(t, lot(301, bechamelIng, 600))
	node := bechamelNode()
	for i := range node.Made {
		node.Made[i].Optional = true
	}
	b.ts.trees[b.rec["chicken"]] = []baserecipe.Need{{IngredientID: pasta, Quantity: 200, Path: "0"}, node}
	b.pinLasagne(1)
	if _, err := b.r.Cooked(ctx, b.key(9), nil); err != nil {
		t.Fatal(err)
	}
	wantNeeds(t, "deduction", b.stock.deductions[0], []runner.Need{n(pasta, 200), n(bechamelIng, 500)})
}

// Within one Recipe an optional line takes nothing either: the required line after it gets the jar.
func TestCookedLetsARequiredBaseRecipeLineAfterAnOptionalOneTakeTheJar(t *testing.T) {
	b := newBrgEnv(t, lot(301, bechamelIng, 500))
	optional := bechamelNode()
	optional.Optional = true
	for i := range optional.Made {
		optional.Made[i].Optional = true
	}
	required := bechamelNode()
	required.Path = "2"
	b.ts.trees[b.rec["chicken"]] = []baserecipe.Need{{IngredientID: pasta, Quantity: 200, Path: "0"}, optional, required}
	b.pinLasagne(1)
	if _, err := b.r.Cooked(ctx, b.key(9), nil); err != nil {
		t.Fatal(err)
	}
	wantNeeds(t, "deduction", b.stock.deductions[0], []runner.Need{n(pasta, 200), n(bechamelIng, 500)})
}
