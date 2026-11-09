package units

import (
	"errors"
	"math"
	"testing"
)

func near(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

var (
	flour    = Ingredient{Name: "flour", Base: Gram}
	milk     = Ingredient{Name: "milk", Base: Millilitre}
	egg      = Ingredient{Name: "egg", Base: Piece}
	garam    = Ingredient{Name: "garam masala", Base: Gram, Conversions: []Conversion{{Unit: "tbsp", ToBase: 6}, {Unit: "tsp", ToBase: 2}}}
	garlic   = Ingredient{Name: "garlic", Base: Gram, Conversions: []Conversion{{Unit: "clove", ToBase: 5}}}
	rice     = Ingredient{Name: "basmati rice", Base: Gram, Conversions: []Conversion{{Unit: "cup", ToBase: 185}}}
	oliveOil = Ingredient{Name: "olive oil", Base: Millilitre, Conversions: []Conversion{{Unit: "tbsp", ToBase: 13.5}}}
)

func TestToBase(t *testing.T) {
	tests := []struct {
		name     string
		quantity float64
		unit     string
		ing      Ingredient
		want     float64
	}{
		{"base unit g is identity", 500, "g", flour, 500},
		{"base unit ml is identity", 250, "ml", milk, 250},
		{"base unit piece is identity", 3, "piece", egg, 3},
		{"kg to g", 2, "kg", flour, 2000},
		{"fractional kg", 0.25, "kg", flour, 250},
		{"l to ml", 1.5, "l", milk, 1500},
		{"dl to ml", 2.5, "dl", milk, 250},
		{"cl to ml", 3, "cl", milk, 30},
		{"tsp to ml is 5", 2, "tsp", milk, 10},
		{"tbsp to ml is 15", 2, "tbsp", milk, 30},
		{"cup to ml is 240", 1, "cup", milk, 240},
		{"zero is allowed", 0, "kg", flour, 0},
		{"g-based ingredient conversion tbsp", 2, "tbsp", garam, 12},
		{"g-based ingredient conversion tsp", 3, "tsp", garam, 6},
		{"clove conversion", 3, "clove", garlic, 15},
		{"cup conversion on a g ingredient", 1.5, "cup", rice, 277.5},
		{"ingredient conversion overrides global tbsp", 2, "tbsp", oliveOil, 27},
		{"unit is case-insensitive", 1, "KG", flour, 1000},
		{"unit is trimmed", 1, "  kg ", flour, 1000},
		{"kg still works on an ingredient that has other conversions", 1, "kg", garlic, 1000},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ToBase(tc.quantity, tc.unit, tc.ing)
			if err != nil {
				t.Fatalf("ToBase(%v, %q) unexpected error: %v", tc.quantity, tc.unit, err)
			}
			if !near(got, tc.want) {
				t.Fatalf("ToBase(%v, %q) = %v, want %v", tc.quantity, tc.unit, got, tc.want)
			}
		})
	}
}

func TestToBaseUnconvertible(t *testing.T) {
	tests := []struct {
		name string
		unit string
		ing  Ingredient
	}{
		{"spoon on a g ingredient needs a conversion", "tbsp", flour},
		{"tsp on a g ingredient", "tsp", flour},
		{"cup on a g ingredient", "cup", flour},
		{"l on a g ingredient", "l", flour},
		{"kg on an ml ingredient", "kg", milk},
		{"g on an ml ingredient", "g", milk},
		{"ml on a g ingredient", "ml", flour},
		{"no global units for piece", "kg", egg},
		{"tbsp on a piece ingredient", "tbsp", egg},
		{"unknown unit", "handful", flour},
		{"conversion of another ingredient does not apply", "clove", flour},
		{"empty unit", "", flour},
		{"conversion is for the named unit only", "cup", garlic},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ToBase(1, tc.unit, tc.ing)
			if err == nil {
				t.Fatal("expected an error")
			}
			if !errors.Is(err, ErrUnconvertibleUnit) {
				t.Fatalf("errors.Is(err, ErrUnconvertibleUnit) = false for %v", err)
			}
			var ue *UnconvertibleUnitError
			if !errors.As(err, &ue) {
				t.Fatalf("errors.As *UnconvertibleUnitError failed for %T", err)
			}
			if ue.Ingredient != tc.ing.Name || ue.Base != tc.ing.Base || ue.Unit != NormalizeUnit(tc.unit) {
				t.Fatalf("error fields = %+v, want ingredient %q base %q unit %q", *ue, tc.ing.Name, tc.ing.Base, NormalizeUnit(tc.unit))
			}
			if ue.Error() == "" {
				t.Fatal("empty error message")
			}
		})
	}
}

func TestToBaseInvalidQuantity(t *testing.T) {
	for _, q := range []float64{-1, -0.001, math.NaN(), math.Inf(1)} {
		if _, err := ToBase(q, "g", flour); !errors.Is(err, ErrInvalidQuantity) {
			t.Errorf("ToBase(%v) err = %v, want ErrInvalidQuantity", q, err)
		}
	}
}

func TestIsConvertible(t *testing.T) {
	tests := []struct {
		unit string
		ing  Ingredient
		want bool
	}{
		{"g", flour, true},
		{"kg", flour, true},
		{"tbsp", flour, false},
		{"tbsp", garam, true},
		{"clove", garlic, true},
		{"clove", flour, false},
		{"piece", egg, true},
		{"cup", milk, true},
	}
	for _, tc := range tests {
		if got := IsConvertible(tc.unit, tc.ing); got != tc.want {
			t.Errorf("IsConvertible(%q, %s) = %v, want %v", tc.unit, tc.ing.Name, got, tc.want)
		}
	}
}

func TestGlobalFactor(t *testing.T) {
	tests := []struct {
		base Base
		unit string
		want float64
		ok   bool
	}{
		{Gram, "g", 1, true},
		{Gram, "kg", 1000, true},
		{Gram, "tbsp", 0, false},
		{Gram, "cup", 0, false},
		{Millilitre, "ml", 1, true},
		{Millilitre, "l", 1000, true},
		{Millilitre, "dl", 100, true},
		{Millilitre, "cl", 10, true},
		{Millilitre, "tsp", 5, true},
		{Millilitre, "tbsp", 15, true},
		{Millilitre, "cup", 240, true},
		{Millilitre, "kg", 0, false},
		{Piece, "piece", 1, true},
		{Piece, "kg", 0, false},
		{Piece, "ml", 0, false},
	}
	for _, tc := range tests {
		got, ok := GlobalFactor(tc.base, tc.unit)
		if ok != tc.ok || (ok && !near(got, tc.want)) {
			t.Errorf("GlobalFactor(%q, %q) = (%v, %v), want (%v, %v)", tc.base, tc.unit, got, ok, tc.want, tc.ok)
		}
	}
}

func TestParseBase(t *testing.T) {
	for _, s := range []string{"g", "ml", "piece"} {
		b, ok := ParseBase(s)
		if !ok || string(b) != s {
			t.Errorf("ParseBase(%q) = (%q, %v)", s, b, ok)
		}
	}
	for _, s := range []string{"", "kg", "G", "pieces", "l"} {
		if _, ok := ParseBase(s); ok {
			t.Errorf("ParseBase(%q) should fail", s)
		}
	}
}

func TestNormalizeName(t *testing.T) {
	tests := []struct{ in, want string }{
		{"onion", "onion"},
		{"Onion", "onion"},
		{"  Chicken   Thighs ", "chicken thighs"},
		{"chicken\tthighs\n", "chicken thighs"},
		{"GREEK  YOGURT", "greek yogurt"},
		{"Éclair", "éclair"},
		{"", ""},
		{"   ", ""},
	}
	for _, tc := range tests {
		if got := NormalizeName(tc.in); got != tc.want {
			t.Errorf("NormalizeName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
	if NormalizeName("Red  Pepper") != NormalizeName(" red pepper") {
		t.Error("equivalent names must normalise equal")
	}
}

func TestNormalizeUnit(t *testing.T) {
	tests := []struct{ in, want string }{{"KG", "kg"}, {" Tbsp ", "tbsp"}, {"clove", "clove"}, {"", ""}}
	for _, tc := range tests {
		if got := NormalizeUnit(tc.in); got != tc.want {
			t.Errorf("NormalizeUnit(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
