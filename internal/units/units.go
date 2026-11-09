// Package units holds the pure unit maths of Feeder: Base Units, global units,
// Ingredient-specific Unit Conversions and Ingredient name normalisation.
// It has no HTTP, SQL or clock dependencies.
package units

import (
	"errors"
	"fmt"
	"math"
	"strings"
)

// Base is a Base Unit: the single unit in which an Ingredient's Stock and
// shopping quantities are counted.
type Base string

// The three Base Units.
const (
	Gram       Base = "g"
	Millilitre Base = "ml"
	Piece      Base = "piece"
)

// ErrUnconvertibleUnit is matched (errors.Is) by every *UnconvertibleUnitError.
var ErrUnconvertibleUnit = errors.New("unconvertible unit")

// ErrInvalidQuantity is returned for negative, NaN or infinite quantities.
var ErrInvalidQuantity = errors.New("invalid quantity")

// Conversion is an Ingredient-specific Unit Conversion: 1 Unit = ToBase Base Units.
type Conversion struct {
	Unit   string
	ToBase float64
}

// ErrInvalidConversion is matched (errors.Is) by every *InvalidConversionError.
var ErrInvalidConversion = errors.New("invalid unit conversion")

// Reasons carried by InvalidConversionError.
const (
	ReasonEmptyUnit = "empty_unit"  // Unit is empty after trimming
	ReasonBaseUnit  = "base_unit"   // Unit equals the Ingredient's Base Unit
	ReasonBadToBase = "bad_to_base" // ToBase is NaN, Inf, zero or negative
)

// InvalidConversionError reports an Ingredient-specific Unit Conversion that
// ValidateConversion rejects.
type InvalidConversionError struct {
	Unit   string  // the unit as given
	ToBase float64 // the factor as given
	Base   Base
	Reason string // one of the Reason* constants
}

func (e *InvalidConversionError) Error() string {
	return fmt.Sprintf("invalid unit conversion %q = %v %s: %s", e.Unit, e.ToBase, e.Base, e.Reason)
}

// Is makes errors.Is(err, ErrInvalidConversion) true.
func (e *InvalidConversionError) Is(target error) bool {
	return target == ErrInvalidConversion
}

// ValidateConversion checks an Ingredient-specific Unit Conversion for an
// Ingredient with the given Base Unit. The unit must be non-empty (after
// NormalizeUnit) and must not equal the Base Unit (after NormalizeUnit); ToBase
// must be finite and > 0. It returns nil or an *InvalidConversionError; the
// checks run in that order, so the first failing one sets Reason.
// Global units other than the Base Unit (e.g. "cup") are allowed: they override.
func ValidateConversion(base Base, c Conversion) error {
	unit := NormalizeUnit(c.Unit)
	switch {
	case unit == "":
		return &InvalidConversionError{Unit: c.Unit, ToBase: c.ToBase, Base: base, Reason: ReasonEmptyUnit}
	case unit == string(base):
		return &InvalidConversionError{Unit: c.Unit, ToBase: c.ToBase, Base: base, Reason: ReasonBaseUnit}
	case math.IsNaN(c.ToBase) || math.IsInf(c.ToBase, 0) || c.ToBase <= 0:
		return &InvalidConversionError{Unit: c.Unit, ToBase: c.ToBase, Base: base, Reason: ReasonBadToBase}
	}
	return nil
}

// Imperial and US customary factors. They exist for Weight Barcode Rules and
// for imperial display only. They are NOT global units: oz and lb are not valid
// recipe units (recipe-file spec lists only kg, l, dl, cl, tsp, tbsp, cup), so
// GlobalFactor/Factor/ToBase never accept them.
const (
	GramsPerOunce              = 28.349523125
	GramsPerPound              = 453.59237
	MillilitresPerFluidOunce   = 29.5735295625
	MillilitresPerUSCup        = 236.5882365    // 8 US fl oz
	MillilitresPerUSTablespoon = 14.78676478125 // 1/2 US fl oz
	MillilitresPerUSTeaspoon   = 4.92892159375  // 1/6 US fl oz
)

// DisplayFactor returns how many Base Units one display-only unit is: for Gram
// "oz" and "lb"; for Millilitre "fl oz", "us cup", "us tbsp", "us tsp" (keys are
// matched after NormalizeUnit). Any other unit, or a Piece base, is not found.
// Recipe units are handled by GlobalFactor, never by this function.
func DisplayFactor(base Base, unit string) (float64, bool) {
	factors, ok := displayFactors[base]
	if !ok {
		return 0, false
	}
	f, ok := factors[NormalizeUnit(unit)]
	return f, ok
}

// displayFactors lists the display-only units per Base Unit, keyed by normalised unit.
var displayFactors = map[Base]map[string]float64{
	Gram: {
		"oz": GramsPerOunce,
		"lb": GramsPerPound,
	},
	Millilitre: {
		"fl oz":   MillilitresPerFluidOunce,
		"us cup":  MillilitresPerUSCup,
		"us tbsp": MillilitresPerUSTablespoon,
		"us tsp":  MillilitresPerUSTeaspoon,
	},
}

// Ingredient is the part of an Ingredient the unit maths needs.
type Ingredient struct {
	Name        string
	Base        Base
	Conversions []Conversion
}

// UnconvertibleUnitError reports a unit that is neither the Ingredient's Base
// Unit, a global unit for that Base Unit, nor one of its Unit Conversions.
type UnconvertibleUnitError struct {
	Ingredient string // the Ingredient's name as given
	Unit       string // the offending unit, normalised (trimmed, lower case)
	Base       Base
}

func (e *UnconvertibleUnitError) Error() string {
	return fmt.Sprintf("cannot convert unit %q to %s for ingredient %q", e.Unit, e.Base, e.Ingredient)
}

// Is makes errors.Is(err, ErrUnconvertibleUnit) true.
func (e *UnconvertibleUnitError) Is(target error) bool {
	return target == ErrUnconvertibleUnit
}

// ParseBase returns the Base for "g", "ml" or "piece" (exact, lower case).
func ParseBase(s string) (Base, bool) {
	switch s {
	case string(Gram):
		return Gram, true
	case string(Millilitre):
		return Millilitre, true
	case string(Piece):
		return Piece, true
	}
	return "", false
}

// NormalizeName returns the matching key for an Ingredient name: lower case,
// trimmed, with every run of whitespace collapsed to one space.
func NormalizeName(name string) string {
	return strings.ToLower(strings.Join(strings.Fields(name), " "))
}

// NormalizeUnit returns the matching key for a unit: trimmed and lower case.
func NormalizeUnit(unit string) string {
	return strings.ToLower(strings.TrimSpace(unit))
}

// globalFactors lists the global units per Base Unit, keyed by normalised unit.
var globalFactors = map[Base]map[string]float64{
	Gram: {
		"g":  1,
		"kg": 1000,
	},
	Millilitre: {
		"ml":   1,
		"l":    1000,
		"dl":   100,
		"cl":   10,
		"tsp":  5,
		"tbsp": 15,
		"cup":  240,
	},
	Piece: {
		"piece": 1,
	},
}

// GlobalFactor returns how many Base Units one global unit is, for the given
// Base Unit. The Base Unit itself is always a global unit with factor 1.
// kg is global only for g; l, dl, cl, tsp, tbsp, cup only for ml; piece has none.
func GlobalFactor(base Base, unit string) (float64, bool) {
	factors, ok := globalFactors[base]
	if !ok {
		return 0, false
	}
	f, ok := factors[NormalizeUnit(unit)]
	return f, ok
}

// Factor returns how many Base Units one `unit` of the Ingredient is. An
// Ingredient-specific Unit Conversion wins over a global unit of the same name.
// An invalid Unit Conversion is never used: its unit is not found, with no
// fall-back to a global unit.
func Factor(unit string, ing Ingredient) (float64, bool) {
	u := NormalizeUnit(unit)
	if c, ok := findConversion(u, ing); ok {
		if ValidateConversion(ing.Base, c) != nil {
			return 0, false
		}
		return c.ToBase, true
	}
	return GlobalFactor(ing.Base, u)
}

// findConversion returns the first Unit Conversion whose unit matches the
// normalised unit u.
func findConversion(u string, ing Ingredient) (Conversion, bool) {
	for _, c := range ing.Conversions {
		if NormalizeUnit(c.Unit) == u {
			return c, true
		}
	}
	return Conversion{}, false
}

// IsConvertible reports whether unit can be converted to the Ingredient's Base Unit.
func IsConvertible(unit string, ing Ingredient) bool {
	_, ok := Factor(unit, ing)
	return ok
}

// ToBase converts quantity of unit into the Ingredient's Base Unit.
// It returns ErrInvalidQuantity for negative/NaN/Inf quantities (zero is fine)
// and *UnconvertibleUnitError for a unit that cannot be converted. A unit whose
// Unit Conversion is invalid returns that *InvalidConversionError.
func ToBase(quantity float64, unit string, ing Ingredient) (float64, error) {
	if math.IsNaN(quantity) || math.IsInf(quantity, 0) || quantity < 0 {
		return 0, ErrInvalidQuantity
	}
	if c, ok := findConversion(NormalizeUnit(unit), ing); ok {
		if err := ValidateConversion(ing.Base, c); err != nil {
			return 0, err
		}
	}
	f, ok := Factor(unit, ing)
	if !ok {
		return 0, &UnconvertibleUnitError{
			Ingredient: ing.Name,
			Unit:       NormalizeUnit(unit),
			Base:       ing.Base,
		}
	}
	return quantity * f, nil
}
