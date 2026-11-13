package recipe

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/units"
)

// H3 (ADR 0017, docs/dev/design/household-items.md §2 guard 3): a Ready Meal's Ingredient is a Recipe line, so a Supply
// can never be it. The store marks the Supplies among the candidates (ReadyMealCandidate.Supply); a Ready Meal named
// like one is refused (SupplyTaken, CodeSupplyNameTaken) and nothing is reused or created.

func TestAReadyMealNamedLikeASupplyIsRefusedNotReusedNorCreated(t *testing.T) {
	got := ChooseReadyMealIngredient("Lasagne  pack", []ReadyMealCandidate{
		{ID: 1, Name: "lasagne PACK", Base: units.Piece, Supply: true},
	})
	if !got.SupplyTaken {
		t.Fatalf("choice = %+v, want SupplyTaken", got)
	}
	if got.ReuseID != 0 || got.Create != "" || got.Conflict || got.BaseRecipeTaken || got.Line.IngredientID != 0 {
		t.Fatalf("choice = %+v: a refused name reuses nothing and creates nothing", got)
	}
}

func TestASupplyOfAnotherNameDoesNotGetInTheWay(t *testing.T) {
	got := ChooseReadyMealIngredient("Lasagne pack", []ReadyMealCandidate{
		{ID: 1, Name: "Toilet paper", Base: units.Piece, Supply: true},
		{ID: 2, Name: "lasagne pack", Base: units.Piece},
	})
	if got.SupplyTaken || got.ReuseID != 2 {
		t.Fatalf("choice = %+v, want the food Ingredient 2 reused", got)
	}
}

func TestASupplyOfThatNameWinsEvenWhenNotInPieces(t *testing.T) {
	got := ChooseReadyMealIngredient("Dish soap", []ReadyMealCandidate{{ID: 1, Name: "dish soap", Base: units.Millilitre, Supply: true}})
	if !got.SupplyTaken || got.Conflict {
		t.Fatalf("choice = %+v, want SupplyTaken and not the ready_meal_unit conflict", got)
	}
}

func TestSupplyCodesAreThePlansCodes(t *testing.T) {
	if CodeIngredientIsSupply != "ingredient_is_supply" || CodeSupplyNameTaken != "supply_name_taken" {
		t.Fatalf("codes = %q, %q", CodeIngredientIsSupply, CodeSupplyNameTaken)
	}
}
