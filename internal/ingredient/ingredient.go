// Package ingredient holds the pure domain rules for Ingredients: validation,
// fuzzy name search and merge planning. No net/http, no database/sql.
package ingredient

import (
	"errors"

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

func (e *ValidationError) Error() string        { panic("TODO") }
func (e *ValidationError) Is(target error) bool { return target == ErrInvalid }

// Ingredient is a stored Ingredient. Name is the display name (trimmed, inner
// whitespace collapsed, case kept); its identity is Key().
type Ingredient struct {
	ID            int64
	Name          string
	Base          units.Base
	ShelfLifeDays *int               // nil = does not spoil / unknown
	Conversions   []units.Conversion // sorted by Unit
}

// Key is the matching key: units.NormalizeName(Name).
func (i Ingredient) Key() string { panic("TODO") }

// Units adapts the Ingredient for the unit maths in internal/units.
func (i Ingredient) Units() units.Ingredient { panic("TODO") }

// Input is what a User supplies to create or fully describe an Ingredient.
type Input struct {
	Name          string
	Base          units.Base
	ShelfLifeDays *int
	Conversions   []units.Conversion
}

// Validate returns the cleaned Input or a *ValidationError.
//   - Name: display form (trimmed, whitespace collapsed); 1..MaxNameLen runes after that.
//   - Base: must be g, ml or piece.
//   - ShelfLifeDays: nil, or 1..MaxShelfLifeDays.
//   - Conversions: Unit normalised with units.NormalizeUnit (1..MaxUnitLen runes), must differ
//     from the Base Unit, ToBase finite and > 0, no duplicate Unit after normalising.
//     Result sorted by Unit. A conversion may share a name with a global unit (it wins).
func (in Input) Validate() (Input, error) { panic("TODO") }

// DisplayName returns the name as stored for display: trimmed, inner whitespace collapsed, case kept.
func DisplayName(name string) string { panic("TODO") }

func newErr(s string) error { return errors.New(s) }
