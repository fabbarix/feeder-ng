package recipe

import "testing"

// BR-B (ADR 0015, §3.2 "Reverse Ready Meal case"): ChooseReadyMealIngredient compares Base recipe names too.

func TestAReadyMealNamedLikeABaseRecipeIsRefusedAndCreatesNothing(t *testing.T) {
	got := ChooseReadyMealIngredient("Béchamel", []ReadyMealCandidate{{ID: 20, Name: "Béchamel", Base: "ml", BaseRecipe: true}})
	if !got.BaseRecipeTaken || got.ReuseID != 0 || got.Create != "" {
		t.Errorf("choice = %+v, want BaseRecipeTaken with no reuse and no new Ingredient", got)
	}
}

func TestABaseRecipeIngredientIsNeverReusedForAReadyMealEvenWhenPiece(t *testing.T) {
	got := ChooseReadyMealIngredient("Pesto jar", []ReadyMealCandidate{{ID: 20, Name: "pesto jar", Base: "piece", BaseRecipe: true}})
	if !got.BaseRecipeTaken || got.ReuseID != 0 {
		t.Errorf("choice = %+v, want the Base recipe's Ingredient refused, not reused", got)
	}
}

func TestAPlainIngredientBesideABaseRecipeOfThatNameIsStillReusedByAReadyMealOfAnotherName(t *testing.T) {
	// Only the Base recipe's own name is blocked; an unrelated plain Ingredient is reused as before.
	got := ChooseReadyMealIngredient("Lasagne pack", []ReadyMealCandidate{
		{ID: 1, Name: "Béchamel", Base: "ml", BaseRecipe: true}, {ID: 2, Name: "lasagne pack", Base: "piece"}})
	if got.BaseRecipeTaken || got.ReuseID != 2 {
		t.Errorf("choice = %+v, want reuse of 2", got)
	}
}

func TestAReadyMealWhosePlainSameNameIngredientCoexistsWithABaseRecipeIsRefused(t *testing.T) {
	// A plain Ingredient of the name may exist beside a Base recipe's (§3.2), but a Ready Meal of that name is
	// still refused: the Base recipe holds the name.
	got := ChooseReadyMealIngredient("Béchamel", []ReadyMealCandidate{
		{ID: 1, Name: "béchamel", Base: "piece"}, {ID: 2, Name: "Béchamel", Base: "ml", BaseRecipe: true}})
	if !got.BaseRecipeTaken || got.ReuseID != 0 || got.Create != "" {
		t.Errorf("choice = %+v, want BaseRecipeTaken", got)
	}
}
