package ingredient_test

import (
	"errors"
	"math"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/units"
)

func intp(n int) *int { return &n }

func TestDisplayName(t *testing.T) {
	tests := []struct{ in, want string }{
		{"onion", "onion"},
		{"  Chicken   Thighs ", "Chicken Thighs"},
		{"olive\toil", "olive oil"},
	}
	for _, tc := range tests {
		if got := ingredient.DisplayName(tc.in); got != tc.want {
			t.Errorf("DisplayName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestKeyIgnoresCaseAndWhitespace(t *testing.T) {
	a := ingredient.Ingredient{Name: "Chicken  Thighs"}
	b := ingredient.Ingredient{Name: " chicken thighs "}
	if a.Key() != b.Key() || a.Key() != "chicken thighs" {
		t.Errorf("keys %q and %q, want both %q", a.Key(), b.Key(), "chicken thighs")
	}
}

func TestUnitsAdapter(t *testing.T) {
	i := ingredient.Ingredient{Name: "garlic", Base: units.Gram, Conversions: []units.Conversion{{Unit: "clove", ToBase: 5}}}
	got, err := units.ToBase(3, "clove", i.Units())
	if err != nil || got != 15 {
		t.Errorf("3 clove = %v, %v; want 15", got, err)
	}
}

func TestValidate(t *testing.T) {
	valid := ingredient.Input{Name: "  Garlic ", Base: units.Gram, ShelfLifeDays: intp(30),
		Conversions: []units.Conversion{{Unit: " Clove ", ToBase: 5}, {Unit: "bulb", ToBase: 50}}}
	got, err := valid.Validate()
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if got.Name != "Garlic" {
		t.Errorf("Name = %q, want %q", got.Name, "Garlic")
	}
	if len(got.Conversions) != 2 || got.Conversions[0].Unit != "bulb" || got.Conversions[1].Unit != "clove" {
		t.Errorf("Conversions = %+v, want sorted [bulb clove] with normalised units", got.Conversions)
	}

	bad := []struct {
		name  string
		in    ingredient.Input
		field string
	}{
		{"empty name", ingredient.Input{Name: "  ", Base: units.Gram}, "name"},
		{"name too long", ingredient.Input{Name: strings.Repeat("x", ingredient.MaxNameLen+1), Base: units.Gram}, "name"},
		{"unknown base", ingredient.Input{Name: "x", Base: "kg"}, "baseUnit"},
		{"empty base", ingredient.Input{Name: "x"}, "baseUnit"},
		{"zero shelf life", ingredient.Input{Name: "x", Base: units.Gram, ShelfLifeDays: intp(0)}, "shelfLifeDays"},
		{"negative shelf life", ingredient.Input{Name: "x", Base: units.Gram, ShelfLifeDays: intp(-3)}, "shelfLifeDays"},
		{"huge shelf life", ingredient.Input{Name: "x", Base: units.Gram, ShelfLifeDays: intp(ingredient.MaxShelfLifeDays + 1)}, "shelfLifeDays"},
		{"conversion to base unit itself", ingredient.Input{Name: "x", Base: units.Gram, Conversions: []units.Conversion{{Unit: "G", ToBase: 1}}}, "conversions"},
		{"empty conversion unit", ingredient.Input{Name: "x", Base: units.Gram, Conversions: []units.Conversion{{Unit: " ", ToBase: 1}}}, "conversions"},
		{"zero toBase", ingredient.Input{Name: "x", Base: units.Gram, Conversions: []units.Conversion{{Unit: "clove", ToBase: 0}}}, "conversions"},
		{"negative toBase", ingredient.Input{Name: "x", Base: units.Gram, Conversions: []units.Conversion{{Unit: "clove", ToBase: -1}}}, "conversions"},
		{"NaN toBase", ingredient.Input{Name: "x", Base: units.Gram, Conversions: []units.Conversion{{Unit: "clove", ToBase: math.NaN()}}}, "conversions"},
		{"Inf toBase", ingredient.Input{Name: "x", Base: units.Gram, Conversions: []units.Conversion{{Unit: "clove", ToBase: math.Inf(1)}}}, "conversions"},
		{"duplicate unit after normalising", ingredient.Input{Name: "x", Base: units.Gram, Conversions: []units.Conversion{{Unit: "clove", ToBase: 5}, {Unit: " CLOVE", ToBase: 6}}}, "conversions"},
	}
	for _, tc := range bad {
		t.Run(tc.name, func(t *testing.T) {
			_, err := tc.in.Validate()
			if !errors.Is(err, ingredient.ErrInvalid) {
				t.Fatalf("err = %v, want ErrInvalid", err)
			}
			var ve *ingredient.ValidationError
			if !errors.As(err, &ve) || !strings.HasPrefix(ve.Field, tc.field) {
				t.Errorf("field = %+v, want prefix %q", ve, tc.field)
			}
		})
	}
}

func TestValidateAllowsShelfLifeBoundsAndGlobalUnitNames(t *testing.T) {
	for _, d := range []int{1, ingredient.MaxShelfLifeDays} {
		if _, err := (ingredient.Input{Name: "x", Base: units.Piece, ShelfLifeDays: intp(d)}).Validate(); err != nil {
			t.Errorf("shelf life %d: %v", d, err)
		}
	}
	// "cup" is a global ml unit; a per-Ingredient conversion with that name is allowed (it wins).
	in := ingredient.Input{Name: "flour", Base: units.Gram, Conversions: []units.Conversion{{Unit: "cup", ToBase: 120}}}
	if _, err := in.Validate(); err != nil {
		t.Errorf("cup conversion on a g Ingredient: %v", err)
	}
}
