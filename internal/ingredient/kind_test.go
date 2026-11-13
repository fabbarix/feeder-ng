package ingredient_test

import (
	"errors"
	"math"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// Supplies (ADR 0017, docs/dev/design/household-items.md §3, §5.3): the Kind and RestockLevel of an Ingredient, their
// validation, and merging across kinds. Red until internal/ingredient has Kind, RestockLevel and the Reason codes.

func fp(f float64) *float64 { return &f }

func TestKindValues(t *testing.T) {
	if ingredient.KindFood != "food" || ingredient.KindSupply != "supply" {
		t.Fatalf("KindFood = %q, KindSupply = %q; want food and supply", ingredient.KindFood, ingredient.KindSupply)
	}
	for in, want := range map[string]ingredient.Kind{"food": ingredient.KindFood, "supply": ingredient.KindSupply} {
		if got, ok := ingredient.ParseKind(in); !ok || got != want {
			t.Errorf("ParseKind(%q) = %q, %v; want %q, true", in, got, ok, want)
		}
	}
	for _, in := range []string{"", "Food", "item", "household", " supply"} {
		if got, ok := ingredient.ParseKind(in); ok {
			t.Errorf("ParseKind(%q) = %q, true; want false", in, got)
		}
	}
}

func TestValidateKindDefaultsToFood(t *testing.T) {
	got, err := ingredient.Input{Name: "milk", Base: units.Millilitre}.Validate()
	if err != nil || got.Kind != ingredient.KindFood || got.RestockLevel != nil {
		t.Fatalf("Validate = %+v, %v; want kind food (the zero Kind) and no Restock level", got, err)
	}
}

func TestValidateAcceptsASupply(t *testing.T) {
	got, err := ingredient.Input{Name: "  Toilet   paper ", Base: units.Piece, Kind: ingredient.KindSupply, RestockLevel: fp(9),
		Conversions: []units.Conversion{{Unit: "pack", ToBase: 9}}}.Validate()
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if got.Name != "Toilet paper" || got.Kind != ingredient.KindSupply || got.RestockLevel == nil || *got.RestockLevel != 9 {
		t.Errorf("got %+v", got)
	}
	// A Supply may have no Restock level at all.
	if _, err := (ingredient.Input{Name: "bin bags", Base: units.Piece, Kind: ingredient.KindSupply}).Validate(); err != nil {
		t.Errorf("a Supply without a Restock level: %v", err)
	}
	// And a fractional level (ml of dish soap).
	if _, err := (ingredient.Input{Name: "dish soap", Base: units.Millilitre, Kind: ingredient.KindSupply, RestockLevel: fp(750.5)}).Validate(); err != nil {
		t.Errorf("a fractional Restock level: %v", err)
	}
}

func TestValidateRejectsAnUnknownKind(t *testing.T) {
	_, err := ingredient.Input{Name: "x", Base: units.Gram, Kind: "item"}.Validate()
	var ve *ingredient.ValidationError
	if !errors.As(err, &ve) || ve.Field != "kind" || ve.Reason != "" {
		t.Fatalf("err = %v, want a plain ValidationError on field kind (400 invalid_ingredient)", err)
	}
	if !errors.Is(err, ingredient.ErrInvalid) {
		t.Error("the error must match ErrInvalid")
	}
}

func TestValidateRestockLevelMustBePositiveAndFinite(t *testing.T) {
	for name, level := range map[string]float64{"zero": 0, "negative": -1, "NaN": math.NaN(), "+Inf": math.Inf(1), "-Inf": math.Inf(-1)} {
		_, err := ingredient.Input{Name: "soap", Base: units.Piece, Kind: ingredient.KindSupply, RestockLevel: fp(level)}.Validate()
		var ve *ingredient.ValidationError
		if !errors.As(err, &ve) || ve.Field != "restockLevel" || ve.Reason != "" {
			t.Errorf("%s: err = %v, want a plain ValidationError on field restockLevel", name, err)
		}
	}
}

// D3: a food Ingredient has no Restock level. 422 validation_failed, reason restock_level_on_food.
func TestValidateRefusesARestockLevelOnFood(t *testing.T) {
	for _, kind := range []ingredient.Kind{"", ingredient.KindFood} {
		_, err := ingredient.Input{Name: "rice", Base: units.Gram, Kind: kind, RestockLevel: fp(500)}.Validate()
		var ve *ingredient.ValidationError
		if !errors.As(err, &ve) {
			t.Fatalf("kind %q: err = %v, want a ValidationError", kind, err)
		}
		if ve.Field != "restockLevel" || ve.Reason != ingredient.ReasonRestockOnFood || ingredient.ReasonRestockOnFood != "restock_level_on_food" {
			t.Errorf("kind %q: field %q reason %q, want restockLevel / restock_level_on_food", kind, ve.Field, ve.Reason)
		}
	}
}

// A Supply has neither Shelf Life nor Frozen Shelf Life. 422 validation_failed, reason supply_has_shelf_life.
func TestValidateRefusesAShelfLifeOnASupply(t *testing.T) {
	cases := map[string]ingredient.Input{
		"shelfLifeDays":       {Name: "soap", Base: units.Piece, Kind: ingredient.KindSupply, ShelfLifeDays: intp(30)},
		"frozenShelfLifeDays": {Name: "soap", Base: units.Piece, Kind: ingredient.KindSupply, FrozenShelfLifeDays: intp(30)},
	}
	for field, in := range cases {
		_, err := in.Validate()
		var ve *ingredient.ValidationError
		if !errors.As(err, &ve) {
			t.Fatalf("%s: err = %v, want a ValidationError", field, err)
		}
		if ve.Field != field || ve.Reason != ingredient.ReasonSupplyShelfLife || ingredient.ReasonSupplyShelfLife != "supply_has_shelf_life" {
			t.Errorf("%s: field %q reason %q, want that field / supply_has_shelf_life", field, ve.Field, ve.Reason)
		}
	}
	// Food keeps both, as before.
	if _, err := (ingredient.Input{Name: "milk", Base: units.Millilitre, ShelfLifeDays: intp(5), FrozenShelfLifeDays: intp(90)}).Validate(); err != nil {
		t.Errorf("food with Shelf Life: %v", err)
	}
}

func TestAnIngredientZeroKindIsFood(t *testing.T) {
	if (ingredient.Ingredient{}).IsSupply() {
		t.Error("the zero Ingredient must not be a Supply")
	}
	if !(ingredient.Ingredient{Kind: ingredient.KindSupply}).IsSupply() {
		t.Error("an Ingredient of kind supply must say IsSupply")
	}
}

func TestPlanMergeBlocksAcrossKinds(t *testing.T) {
	food := ing("vinegar", units.Millilitre, nil)
	supply := ing("descaler", units.Millilitre, nil)
	supply.Kind = ingredient.KindSupply

	for name, pair := range map[string][2]ingredient.Ingredient{"supply into food": {supply, food}, "food into supply": {food, supply}} {
		plan := ingredient.PlanMerge(pair[0], pair[1])
		if !plan.KindMismatch {
			t.Errorf("%s: KindMismatch = false, want true", name)
		}
		if _, err := plan.Apply(ingredient.Resolution{}); !errors.Is(err, ingredient.ErrKindDiffers) {
			t.Errorf("%s: Apply = %v, want ErrKindDiffers", name, err)
		}
	}
}

func TestPlanMergeOfTwoSuppliesIsAllowed(t *testing.T) {
	a := ing("loo roll", units.Piece, nil, units.Conversion{Unit: "pack", ToBase: 9})
	b := ing("toilet paper", units.Piece, nil, units.Conversion{Unit: "pack", ToBase: 9})
	a.Kind, b.Kind = ingredient.KindSupply, ingredient.KindSupply
	plan := ingredient.PlanMerge(a, b)
	if plan.KindMismatch || plan.BaseMismatch || len(plan.Conflicts) != 0 {
		t.Fatalf("plan = %+v, want no mismatch and no conflicts", plan)
	}
	if _, err := plan.Apply(ingredient.Resolution{}); err != nil {
		t.Errorf("Apply: %v", err)
	}
}

func TestPlanMergeOfTwoFoodsIsUnchangedByKind(t *testing.T) {
	plan := ingredient.PlanMerge(ing("a", units.Gram, nil), ing("b", units.Gram, nil))
	if plan.KindMismatch {
		t.Error("two food Ingredients must not be a kind mismatch (the zero Kind is food)")
	}
}
