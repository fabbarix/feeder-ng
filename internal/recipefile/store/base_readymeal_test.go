package store_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// BR-C round 2: Existing tells Import Review which Recipes are Ready Meals.
func TestExistingFlagsReadyMeals(t *testing.T) {
	f := newFixture(t)
	ready := recipefile.Recipe{
		Name: "Fish fingers", Yield: 2, ReadyMeal: true,
		Ingredients: []recipefile.Line{{Ingredient: "fish fingers", Quantity: 1, Unit: "piece"}},
	}
	if _, err := f.s.Apply(ctx, f.commit(t, riceFile(riceRecipe("Pilaf"), ready), recipefile.Decisions{})); err != nil {
		t.Fatal(err)
	}
	ex, err := f.s.Existing(ctx)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, r := range ex.Recipes {
		got[r.Name] = r.ReadyMeal
	}
	if len(got) != 2 || got["Fish fingers"] != true || got["Pilaf"] != false {
		t.Fatalf("Ready Meal flags = %v", got)
	}
}
