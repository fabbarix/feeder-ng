package service_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/service"
)

// H4 (household-items.md §4.1): the Op's new-Ingredient part gains an optional kind ("food" default, or "supply"), and
// the port is Ingredients.Ensure(ctx, name, baseUnit, kind ingredient.Kind). The service passes the Op's kind as it is;
// an empty kind is food. An unknown kind is a ValidationError on the field "ingredient". Whether an existing row keeps
// its own kind is the port's job (the adapter finds by name first), pinned by the API test in scan/httpapi.

func TestAnUnknownBarcodeSavedAsANewSupplyEnsuresTheIngredientWithKindSupply(t *testing.T) {
	e := newEnv(t)
	op := unknownPack("scan-0001", scan.ScopeGlobal)
	op.Ingredient = &scan.IngredientRef{Name: "Toilet paper", BaseUnit: "piece", Kind: "supply"}
	op.ProductName = "Lotus 9 rolls"
	if res := apply(t, e, op); res.Status != scan.StatusApplied {
		t.Fatalf("Result = %+v", res)
	}
	if len(e.ing.calls) != 1 || e.ing.kinds["Toilet paper"] != ingredient.KindSupply {
		t.Fatalf("Ensure calls %v with kinds %v, want Toilet paper as a Supply", e.ing.calls, e.ing.kinds)
	}
}

func TestANewIngredientWithNoKindIsFood(t *testing.T) {
	e := newEnv(t)
	apply(t, e, unknownPack("scan-0001", scan.ScopeGlobal))
	if e.ing.kinds["passata"] != ingredient.KindFood {
		t.Fatalf("kinds = %v, want passata as food", e.ing.kinds)
	}
}

func TestANewIngredientWithAnExplicitFoodKindIsFood(t *testing.T) {
	e := newEnv(t)
	op := unknownPack("scan-0001", scan.ScopeGlobal)
	op.Ingredient.Kind = "food"
	apply(t, e, op)
	if e.ing.kinds["passata"] != ingredient.KindFood {
		t.Fatalf("kinds = %v, want passata as food", e.ing.kinds)
	}
}

func TestAnUnknownKindIsAValidationError(t *testing.T) {
	op := unknownPack("scan-0001", scan.ScopeGlobal)
	op.Ingredient.Kind = "toy"
	err := op.Validate()
	var ve *scan.ValidationError
	if !errors.As(err, &ve) || ve.Field != "ingredient" {
		t.Fatalf("Validate = %v, want a ValidationError on the field ingredient", err)
	}
}

func TestAnExistingIngredientIsNotEnsuredWhateverTheKind(t *testing.T) {
	e := newEnv(t)
	op := unknownPack("scan-0001", scan.ScopeGlobal)
	op.Ingredient = &scan.IngredientRef{ID: passataIng, Kind: "supply"} // an id wins; the kind is for a new row only
	apply(t, e, op)
	if len(e.ing.calls) != 0 {
		t.Fatalf("Ensure calls = %v, want none for an existing Ingredient", e.ing.calls)
	}
}

var _ service.Ingredients = (*fakeIngredients)(nil)
