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
func Factor(unit string, ing Ingredient) (float64, bool) {
	u := NormalizeUnit(unit)
	for _, c := range ing.Conversions {
		if NormalizeUnit(c.Unit) == u {
			return c.ToBase, true
		}
	}
	return GlobalFactor(ing.Base, u)
}

// IsConvertible reports whether unit can be converted to the Ingredient's Base Unit.
func IsConvertible(unit string, ing Ingredient) bool {
	_, ok := Factor(unit, ing)
	return ok
}

// ToBase converts quantity of unit into the Ingredient's Base Unit.
// It returns ErrInvalidQuantity for negative/NaN/Inf quantities (zero is fine)
// and *UnconvertibleUnitError for a unit that cannot be converted.
func ToBase(quantity float64, unit string, ing Ingredient) (float64, error) {
	if math.IsNaN(quantity) || math.IsInf(quantity, 0) || quantity < 0 {
		return 0, ErrInvalidQuantity
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
