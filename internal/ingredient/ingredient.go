// Package ingredient holds the pure domain rules for Ingredients: validation,
// fuzzy name search and merge planning. No net/http, no database/sql.
package ingredient

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/fabbarix/feeder-ng/internal/imaging"
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

// Kind is what an Ingredient is: food (the default, every Ingredient before Supplies) or a Supply, a non-food thing
// the Household buys and keeps in Stock (ADR 0017, docs/dev/design/household-items.md §3).
type Kind string

const (
	KindFood   Kind = "food"
	KindSupply Kind = "supply"
)

// ParseKind is strict: exactly "food" or "supply". Anything else (including "" and "Food") is not a kind.
func ParseKind(s string) (Kind, bool) {
	switch Kind(s) {
	case KindFood, KindSupply:
		return Kind(s), true
	}
	return "", false
}

// Reasons a *ValidationError gives beyond its field (422 validation_failed with a reason; the reason codes are the API's).
const (
	ReasonSupplyShelfLife = "supply_has_shelf_life" // a Supply has no Shelf Life or Frozen Shelf Life
	ReasonRestockOnFood   = "restock_level_on_food" // only a Supply has a Restock level (D3)
)

// ErrKindDiffers is returned by Apply when the two Ingredients are of different kinds: a Supply never merges into food
// or the other way round (409 kind_differs).
var ErrKindDiffers = errors.New("the Ingredients are of different kinds")

// ValidationError names the offending field ("name", "baseUnit", "kind", "shelfLifeDays", "frozenShelfLifeDays",
// "restockLevel", "conversions", "conversions.<unit>") and says what is wrong, for the UI. Reason, when set, names
// a rule that a Supply or a food Ingredient breaks; the API answers those with 422 instead of 400.
type ValidationError struct {
	Field   string
	Message string
	Reason  string
}

func (e *ValidationError) Error() string        { return e.Field + ": " + e.Message }
func (e *ValidationError) Is(target error) bool { return target == ErrInvalid }

// Ingredient is a stored Ingredient. Name is the display name (trimmed, inner
// whitespace collapsed, case kept); its identity is Key().
type Ingredient struct {
	ID            int64
	Name          string
	Base          units.Base
	Kind          Kind // "" reads as food (the zero Ingredient is food)
	ShelfLifeDays *int // nil = does not spoil / unknown
	// FrozenShelfLifeDays is how long it keeps in a Freezer (a Storage Place of kind freezer); nil = the Freezer
	// does not change its go-off date.
	FrozenShelfLifeDays *int
	// RestockLevel is the Stock (in Base Units) below which the Shopping List asks for a Supply; nil = none. Food never has one.
	RestockLevel *float64
	Conversions  []units.Conversion // sorted by Unit
	Image        string             // IM2: image id (internal/imaging), "" = no picture
}

// Key is the matching key: units.NormalizeName(Name).
func (i Ingredient) Key() string { return units.NormalizeName(i.Name) }

// IsSupply reports whether the Ingredient is a Supply (a non-food Ingredient, ADR 0017).
func (i Ingredient) IsSupply() bool { return i.Kind == KindSupply }

// normKind is the Kind with the zero value read as food.
func normKind(k Kind) Kind {
	if k == KindSupply {
		return KindSupply
	}
	return KindFood
}

// Units adapts the Ingredient for the unit maths in internal/units.
func (i Ingredient) Units() units.Ingredient {
	return units.Ingredient{Name: i.Name, Base: i.Base, Conversions: i.Conversions}
}

// Input is what a User supplies to create or fully describe an Ingredient.
type Input struct {
	Name                string
	Base                units.Base
	Kind                Kind // "" or food = food; supply = a Supply. Validate normalises it to food or supply
	ShelfLifeDays       *int
	FrozenShelfLifeDays *int     // nil or 1..MaxShelfLifeDays (field frozenShelfLifeDays)
	RestockLevel        *float64 // a Supply only: nil or a finite number > 0 in Base Units (field restockLevel)
	Conversions         []units.Conversion
	Image               string // IM2: image id, "" = none; Validate trims it and refuses anything but "" or a well-formed id (imaging.ValidID)
}

// Validate returns the cleaned Input or a *ValidationError.
//   - Name: display form (trimmed, whitespace collapsed); 1..MaxNameLen runes after that.
//   - Base: must be g, ml or piece.
//   - Kind: "" or food (food), or supply; anything else is a plain ValidationError on kind (400).
//   - ShelfLifeDays, FrozenShelfLifeDays: nil, or 1..MaxShelfLifeDays; a Supply has neither (422, ReasonSupplyShelfLife).
//   - RestockLevel: nil, or a finite number > 0 (400 on restockLevel); a food Ingredient has none (422, ReasonRestockOnFood).
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
	kind := normKind(in.Kind)
	if in.Kind != "" {
		if _, ok := ParseKind(string(in.Kind)); !ok {
			return Input{}, &ValidationError{Field: "kind", Message: "The kind must be food or supply"}
		}
	}
	if d := in.ShelfLifeDays; d != nil && (*d < 1 || *d > MaxShelfLifeDays) {
		return Input{}, &ValidationError{Field: "shelfLifeDays", Message: fmt.Sprintf("The Shelf Life must be between 1 and %d days", MaxShelfLifeDays)}
	}
	if d := in.FrozenShelfLifeDays; d != nil && (*d < 1 || *d > MaxShelfLifeDays) {
		return Input{}, &ValidationError{Field: "frozenShelfLifeDays", Message: fmt.Sprintf("The frozen Shelf Life must be between 1 and %d days", MaxShelfLifeDays)}
	}
	if kind == KindSupply {
		if in.ShelfLifeDays != nil {
			return Input{}, &ValidationError{Field: "shelfLifeDays", Reason: ReasonSupplyShelfLife, Message: "A Supply has no Shelf Life"}
		}
		if in.FrozenShelfLifeDays != nil {
			return Input{}, &ValidationError{Field: "frozenShelfLifeDays", Reason: ReasonSupplyShelfLife, Message: "A Supply has no Shelf Life"}
		}
	}
	if l := in.RestockLevel; l != nil {
		if math.IsNaN(*l) || math.IsInf(*l, 0) || *l <= 0 {
			return Input{}, &ValidationError{Field: "restockLevel", Message: "The Restock level must be a number above 0"}
		}
		if kind != KindSupply {
			return Input{}, &ValidationError{Field: "restockLevel", Reason: ReasonRestockOnFood, Message: "Only a Supply has a Restock level"}
		}
	}

	image := strings.TrimSpace(in.Image)
	if image != "" && !imaging.ValidID(image) {
		return Input{}, &ValidationError{Field: "image", Message: "The picture is not a valid uploaded image"}
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

	return Input{Name: name, Base: in.Base, Kind: kind, ShelfLifeDays: in.ShelfLifeDays, FrozenShelfLifeDays: in.FrozenShelfLifeDays,
		RestockLevel: in.RestockLevel, Conversions: cs, Image: image}, nil
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
