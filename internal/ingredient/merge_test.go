package ingredient_test

import (
	"errors"
	"math"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/units"
)

func ing(name string, base units.Base, days *int, cs ...units.Conversion) ingredient.Ingredient {
	return ingredient.Ingredient{Name: name, Base: base, ShelfLifeDays: days, Conversions: cs}
}

func TestPlanMergeCombinesWithoutConflicts(t *testing.T) {
	source := ing("spring onion", units.Gram, nil, units.Conversion{Unit: "bunch", ToBase: 80}, units.Conversion{Unit: "stalk", ToBase: 15})
	target := ing("scallion", units.Gram, intp(7), units.Conversion{Unit: "stalk", ToBase: 15}, units.Conversion{Unit: "cup", ToBase: 100})
	plan := ingredient.PlanMerge(source, target)
	if plan.BaseMismatch || len(plan.Conflicts) != 0 {
		t.Fatalf("plan = %+v, want no mismatch and no conflicts", plan)
	}
	want := []units.Conversion{{Unit: "bunch", ToBase: 80}, {Unit: "cup", ToBase: 100}, {Unit: "stalk", ToBase: 15}}
	if !reflect.DeepEqual(plan.Conversions, want) {
		t.Errorf("Conversions = %+v, want %+v (union, equal ones once, sorted)", plan.Conversions, want)
	}
	if plan.ShelfLifeDays == nil || *plan.ShelfLifeDays != 7 {
		t.Errorf("ShelfLifeDays = %v, want 7 (the one that is set)", plan.ShelfLifeDays)
	}
	merged, err := plan.Apply(ingredient.Resolution{})
	if err != nil || !reflect.DeepEqual(merged.Conversions, want) || *merged.ShelfLifeDays != 7 {
		t.Errorf("Apply = %+v, %v", merged, err)
	}
}

func TestPlanMergeEqualWithinTolerance(t *testing.T) {
	source := ing("a", units.Millilitre, intp(5), units.Conversion{Unit: "cup", ToBase: 240})
	target := ing("b", units.Millilitre, intp(5), units.Conversion{Unit: "cup", ToBase: 240.0000000001})
	if plan := ingredient.PlanMerge(source, target); len(plan.Conflicts) != 0 {
		t.Errorf("conflicts = %+v, want none", plan.Conflicts)
	}
}

func TestPlanMergeReportsConflicts(t *testing.T) {
	source := ing("passata", units.Millilitre, intp(5), units.Conversion{Unit: "jar", ToBase: 700}, units.Conversion{Unit: "can", ToBase: 400})
	target := ing("tomato puree", units.Millilitre, intp(9), units.Conversion{Unit: "jar", ToBase: 680}, units.Conversion{Unit: "can", ToBase: 400})
	plan := ingredient.PlanMerge(source, target)
	want := []ingredient.Conflict{
		{Kind: ingredient.ConflictConversion, Unit: "jar", Source: 700, Target: 680},
		{Kind: ingredient.ConflictShelfLife, Source: 5, Target: 9},
	}
	if !reflect.DeepEqual(plan.Conflicts, want) {
		t.Errorf("Conflicts = %+v, want %+v", plan.Conflicts, want)
	}
	for _, c := range plan.Conversions {
		if c.Unit == "jar" {
			t.Error("a conflicting conversion must not appear in the non-conflicting set")
		}
	}
}

func TestApplyRequiresEveryConflictAnswered(t *testing.T) {
	source := ing("a", units.Millilitre, intp(5), units.Conversion{Unit: "jar", ToBase: 700})
	target := ing("b", units.Millilitre, intp(9), units.Conversion{Unit: "jar", ToBase: 680})
	plan := ingredient.PlanMerge(source, target)

	_, err := plan.Apply(ingredient.Resolution{Conversions: map[string]float64{"jar": 690}})
	var ue *ingredient.UnresolvedError
	if !errors.As(err, &ue) || len(ue.Conflicts) != 1 || ue.Conflicts[0].Kind != ingredient.ConflictShelfLife {
		t.Fatalf("err = %v, want UnresolvedError listing only the shelf-life conflict", err)
	}

	merged, err := plan.Apply(ingredient.Resolution{
		Conversions:  map[string]float64{" JAR ": 690, "unrelated": 3},
		ShelfLifeSet: true, ShelfLifeDays: intp(7),
	})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if !reflect.DeepEqual(merged.Conversions, []units.Conversion{{Unit: "jar", ToBase: 690}}) {
		t.Errorf("Conversions = %+v, want only jar=690 (unrelated answer ignored)", merged.Conversions)
	}
	if merged.ShelfLifeDays == nil || *merged.ShelfLifeDays != 7 {
		t.Errorf("ShelfLifeDays = %v, want 7", merged.ShelfLifeDays)
	}
}

func TestApplyShelfLifeCanBeResolvedToNone(t *testing.T) {
	plan := ingredient.PlanMerge(ing("a", units.Gram, intp(5)), ing("b", units.Gram, intp(9)))
	merged, err := plan.Apply(ingredient.Resolution{ShelfLifeSet: true, ShelfLifeDays: nil})
	if err != nil || merged.ShelfLifeDays != nil {
		t.Errorf("Apply = %+v, %v; want no shelf life", merged, err)
	}
}

func TestApplyRejectsInvalidChoices(t *testing.T) {
	source := ing("a", units.Millilitre, intp(5), units.Conversion{Unit: "jar", ToBase: 700})
	target := ing("b", units.Millilitre, intp(9), units.Conversion{Unit: "jar", ToBase: 680})
	plan := ingredient.PlanMerge(source, target)
	for name, res := range map[string]ingredient.Resolution{
		"zero conversion":     {Conversions: map[string]float64{"jar": 0}, ShelfLifeSet: true, ShelfLifeDays: intp(5)},
		"negative conversion": {Conversions: map[string]float64{"jar": -1}, ShelfLifeSet: true, ShelfLifeDays: intp(5)},
		"zero shelf life":     {Conversions: map[string]float64{"jar": 690}, ShelfLifeSet: true, ShelfLifeDays: intp(0)},
		"NaN conversion":      {Conversions: map[string]float64{"jar": math.NaN()}, ShelfLifeSet: true, ShelfLifeDays: intp(5)},
		"infinite conversion": {Conversions: map[string]float64{"jar": math.Inf(1)}, ShelfLifeSet: true, ShelfLifeDays: intp(5)},
	} {
		if _, err := plan.Apply(res); !errors.Is(err, ingredient.ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
}

func TestBaseMismatchBlocksTheMerge(t *testing.T) {
	plan := ingredient.PlanMerge(ing("a", units.Gram, nil), ing("b", units.Millilitre, nil))
	if !plan.BaseMismatch {
		t.Fatal("BaseMismatch = false, want true")
	}
	if _, err := plan.Apply(ingredient.Resolution{}); !errors.Is(err, ingredient.ErrBaseMismatch) {
		t.Errorf("err = %v, want ErrBaseMismatch", err)
	}
}

func TestApplyRejectsAConversionToTheBaseUnit(t *testing.T) {
	// A conflicting Unit that is the Base Unit itself can never be a Unit Conversion.
	source := ing("a", units.Gram, nil, units.Conversion{Unit: "g", ToBase: 1})
	target := ing("b", units.Gram, nil, units.Conversion{Unit: "g", ToBase: 2})
	plan := ingredient.PlanMerge(source, target)
	_, err := plan.Apply(ingredient.Resolution{Conversions: map[string]float64{"g": 3}})
	if !errors.Is(err, ingredient.ErrInvalid) {
		t.Errorf("err = %v, want ErrInvalid", err)
	}
}
