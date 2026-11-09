package ingredient

import "github.com/fabbarix/feeder-ng/internal/units"

// ConflictKind says what two Ingredients disagree on.
type ConflictKind string

const (
	ConflictConversion ConflictKind = "conversion" // same Unit, different ToBase
	ConflictShelfLife  ConflictKind = "shelfLife"  // both set, different days
)

// Conflict is one disagreement. Unit is set for conversions. Source/Target hold
// the two values (ToBase, or days).
type Conflict struct {
	Kind   ConflictKind
	Unit   string
	Source float64
	Target float64
}

// MergePlan is what merging Source into Target would do before any choice is made.
type MergePlan struct {
	// BaseMismatch is true when the Base Units differ. This blocks the merge
	// (quantities cannot be converted between g, ml and piece); it is not resolvable
	// by a Resolution.
	BaseMismatch bool
	// Conversions holds every non-conflicting Unit Conversion: the Target's, plus the
	// Source's for Units the Target lacks, plus conflicting-free equal ones (once).
	Conversions []units.Conversion
	// ShelfLifeDays is the combined value when there is no shelf-life conflict
	// (the one that is set, or nil).
	ShelfLifeDays *int
	// Conflicts, ordered by Kind (conversion first), then Unit.
	Conflicts []Conflict
}

// PlanMerge compares source and target. Conversions are equal when their ToBase
// values agree within a relative 1e-9. Units are compared as stored (already normalised).
func PlanMerge(source, target Ingredient) MergePlan { panic("TODO") }

// Resolution is the User's explicit answer to the Conflicts.
type Resolution struct {
	// Conversions: chosen ToBase per conflicting Unit (key normalised with units.NormalizeUnit).
	Conversions map[string]float64
	// ShelfLifeSet is true when ShelfLifeDays is an answer (nil days = "no shelf life").
	ShelfLifeSet  bool
	ShelfLifeDays *int
}

// Merged is the Target's new definition after the merge.
type Merged struct {
	Conversions   []units.Conversion // sorted by Unit
	ShelfLifeDays *int
}

// ErrBaseMismatch is returned by Apply when the plan has BaseMismatch.
var ErrBaseMismatch = errMergeBase

// UnresolvedError lists the Conflicts the Resolution did not answer.
type UnresolvedError struct{ Conflicts []Conflict }

func (e *UnresolvedError) Error() string { panic("TODO") }

// Apply combines the plan with the Resolution. Every Conflict must be answered
// (ErrBaseMismatch, or *UnresolvedError otherwise). A Resolution entry for a Unit
// that is not in conflict is ignored. Chosen ToBase values must be finite and > 0
// (otherwise *ValidationError); ShelfLifeDays must satisfy the Validate range.
func (p MergePlan) Apply(res Resolution) (Merged, error) { panic("TODO") }

var errMergeBase = newErr("the Ingredients have different Base Units")
