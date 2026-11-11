// Package ingredient holds the pure domain rules for Ingredients: validation,
// fuzzy name search and merge planning. No net/http, no database/sql.
package ingredient

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/fabbarix/feeder-ng/internal/units"
)

// Limits.
const (
	MaxNameLen       = 100
	MaxUnitLen       = 30
	MaxShelfLifeDays = 3650
)

// ErrInvalid is matched (errors.Is) by every *ValidationError.
var ErrInvalid = errors.New("invalid ingredient")

// ValidationError names the offending field ("name", "baseUnit", "shelfLifeDays",
// "conversions", "conversions.<unit>") and says what is wrong, for the UI.
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string        { return e.Field + ": " + e.Message }
func (e *ValidationError) Is(target error) bool { return target == ErrInvalid }

// Ingredient is a stored Ingredient. Name is the display name (trimmed, inner
// whitespace collapsed, case kept); its identity is Key().
type Ingredient struct {
	ID            int64
	Name          string
	Base          units.Base
	ShelfLifeDays *int               // nil = does not spoil / unknown
	Conversions   []units.Conversion // sorted by Unit
	Image         string             // IM2: image id (internal/imaging), "" = no picture
}

// Key is the matching key: units.NormalizeName(Name).
func (i Ingredient) Key() string { return units.NormalizeName(i.Name) }

// Units adapts the Ingredient for the unit maths in internal/units.
func (i Ingredient) Units() units.Ingredient {
	return units.Ingredient{Name: i.Name, Base: i.Base, Conversions: i.Conversions}
}

// Input is what a User supplies to create or fully describe an Ingredient.
type Input struct {
	Name          string
	Base          units.Base
	ShelfLifeDays *int
	Conversions   []units.Conversion
	Image         string // IM2: image id, "" = none; Validate trims it and refuses anything but "" or a well-formed id (imaging.ValidID)
}

// Validate returns the cleaned Input or a *ValidationError.
//   - Name: display form (trimmed, whitespace collapsed); 1..MaxNameLen runes after that.
//   - Base: must be g, ml or piece.
//   - ShelfLifeDays: nil, or 1..MaxShelfLifeDays.
//   - Conversions: Unit normalised with units.NormalizeUnit (1..MaxUnitLen runes), must differ
//     from the Base Unit, ToBase finite and > 0, no duplicate Unit after normalising.
//     Result sorted by Unit. A conversion may share a name with a global unit (it wins).
func (in Input) Validate() (Input, error) {
	name := DisplayName(in.Name)
	switch n := utf8.RuneCountInString(name); {
	case n == 0:
		return Input{}, &ValidationError{Field: "name", Message: "The name is required"}
	case n > MaxNameLen:
		return Input{}, &ValidationError{Field: "name", Message: fmt.Sprintf("The name must be at most %d characters", MaxNameLen)}
	}
	if _, ok := units.ParseBase(string(in.Base)); !ok {
		return Input{}, &ValidationError{Field: "baseUnit", Message: "The Base Unit must be g, ml or piece"}
	}
	if d := in.ShelfLifeDays; d != nil && (*d < 1 || *d > MaxShelfLifeDays) {
		return Input{}, &ValidationError{Field: "shelfLifeDays", Message: fmt.Sprintf("The Shelf Life must be between 1 and %d days", MaxShelfLifeDays)}
	}

	seen := map[string]bool{}
	var cs []units.Conversion
	for _, c := range in.Conversions {
		unit := units.NormalizeUnit(c.Unit)
		if err := units.ValidateConversion(in.Base, units.Conversion{Unit: unit, ToBase: c.ToBase}); err != nil {
			return Input{}, &ValidationError{Field: "conversions", Message: conversionMessage(err, unit, in.Base)}
		}
		if utf8.RuneCountInString(unit) > MaxUnitLen {
			return Input{}, &ValidationError{Field: "conversions", Message: fmt.Sprintf("The unit %q is longer than %d characters", unit, MaxUnitLen)}
		}
		if seen[unit] {
			return Input{}, &ValidationError{Field: "conversions", Message: fmt.Sprintf("The unit %q is given more than once", unit)}
		}
		seen[unit] = true
		cs = append(cs, units.Conversion{Unit: unit, ToBase: c.ToBase})
	}
	sort.Slice(cs, func(i, j int) bool { return cs[i].Unit < cs[j].Unit })

	return Input{Name: name, Base: in.Base, ShelfLifeDays: in.ShelfLifeDays, Conversions: cs}, nil
}

// conversionMessage explains a rejected Unit Conversion for the UI.
func conversionMessage(err error, unit string, base units.Base) string {
	var ce *units.InvalidConversionError
	if !errors.As(err, &ce) {
		return err.Error()
	}
	switch ce.Reason {
	case units.ReasonEmptyUnit:
		return "A unit conversion needs a unit"
	case units.ReasonBaseUnit:
		return fmt.Sprintf("%q is the Base Unit (%s) and needs no conversion", unit, base)
	default:
		return fmt.Sprintf("The amount for %q must be a positive number of %s", unit, base)
	}
}

// DisplayName returns the name as stored for display: trimmed, inner whitespace collapsed, case kept.
func DisplayName(name string) string { return strings.Join(strings.Fields(name), " ") }

func newErr(s string) error { return errors.New(s) }
