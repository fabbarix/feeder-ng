package ingredient

import (
	"fmt"
	"math"
	"sort"

	"github.com/fabbarix/feeder-ng/internal/units"
)

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
	// Base is the Target's Base Unit; chosen conversions are validated against it.
	Base units.Base
	// KindMismatch is true when the two Ingredients are of different kinds (a Supply and food). It blocks the merge
	// (ErrKindDiffers) and takes priority over BaseMismatch in the preview.
	KindMismatch bool
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
func PlanMerge(source, target Ingredient) MergePlan {
	p := MergePlan{Base: target.Base, BaseMismatch: source.Base != target.Base, KindMismatch: normKind(source.Kind) != normKind(target.Kind)}

	src := byUnit(source.Conversions)
	tgt := byUnit(target.Conversions)
	all := map[string]bool{}
	for u := range src {
		all[u] = true
	}
	for u := range tgt {
		all[u] = true
	}
	order := make([]string, 0, len(all))
	for u := range all {
		order = append(order, u)
	}
	sort.Strings(order)

	for _, u := range order {
		s, inS := src[u]
		t, inT := tgt[u]
		switch {
		case inS && inT && !sameToBase(s.ToBase, t.ToBase):
			p.Conflicts = append(p.Conflicts, Conflict{Kind: ConflictConversion, Unit: u, Source: s.ToBase, Target: t.ToBase})
		case inT:
			p.Conversions = append(p.Conversions, t)
		case inS:
			p.Conversions = append(p.Conversions, s)
		}
	}

	switch s, t := source.ShelfLifeDays, target.ShelfLifeDays; {
	case s != nil && t != nil && *s != *t:
		p.Conflicts = append(p.Conflicts, Conflict{Kind: ConflictShelfLife, Source: float64(*s), Target: float64(*t)})
	case t != nil:
		d := *t
		p.ShelfLifeDays = &d
	case s != nil:
		d := *s
		p.ShelfLifeDays = &d
	}
	return p
}

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

func (e *UnresolvedError) Error() string {
	return fmt.Sprintf("%d merge conflicts are not resolved", len(e.Conflicts))
}

// Apply combines the plan with the Resolution. Every Conflict must be answered
// (ErrBaseMismatch, or *UnresolvedError otherwise). A Resolution entry for a Unit
// that is not in conflict is ignored. Chosen conversions must pass
// units.ValidateConversion for the Base Unit (otherwise *ValidationError); ShelfLifeDays must satisfy the Validate range.
func (p MergePlan) Apply(res Resolution) (Merged, error) {
	if p.KindMismatch {
		return Merged{}, ErrKindDiffers
	}
	if p.BaseMismatch {
		return Merged{}, ErrBaseMismatch
	}
	answers := make(map[string]float64, len(res.Conversions))
	for u, v := range res.Conversions {
		answers[units.NormalizeUnit(u)] = v
	}

	out := append([]units.Conversion(nil), p.Conversions...)
	merged := Merged{}
	if p.ShelfLifeDays != nil {
		d := *p.ShelfLifeDays
		merged.ShelfLifeDays = &d
	}
	var unresolved []Conflict
	for _, c := range p.Conflicts {
		switch c.Kind {
		case ConflictConversion:
			v, ok := answers[c.Unit]
			if !ok {
				unresolved = append(unresolved, c)
				continue
			}
			if err := units.ValidateConversion(p.Base, units.Conversion{Unit: c.Unit, ToBase: v}); err != nil {
				return Merged{}, &ValidationError{Field: "conversions." + c.Unit, Message: conversionMessage(err, c.Unit, p.Base)}
			}
			out = append(out, units.Conversion{Unit: c.Unit, ToBase: v})
		case ConflictShelfLife:
			if !res.ShelfLifeSet {
				unresolved = append(unresolved, c)
				continue
			}
			if d := res.ShelfLifeDays; d != nil {
				if *d < 1 || *d > MaxShelfLifeDays {
					return Merged{}, &ValidationError{Field: "shelfLifeDays", Message: fmt.Sprintf("The Shelf Life must be between 1 and %d days", MaxShelfLifeDays)}
				}
				v := *d
				merged.ShelfLifeDays = &v
			} else {
				merged.ShelfLifeDays = nil
			}
		}
	}
	if len(unresolved) > 0 {
		return Merged{}, &UnresolvedError{Conflicts: unresolved}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Unit < out[j].Unit })
	merged.Conversions = out
	return merged, nil
}

func byUnit(cs []units.Conversion) map[string]units.Conversion {
	m := make(map[string]units.Conversion, len(cs))
	for _, c := range cs {
		m[c.Unit] = c
	}
	return m
}

// sameToBase compares two factors within a relative tolerance of 1e-9.
func sameToBase(a, b float64) bool {
	return math.Abs(a-b) <= 1e-9*math.Max(math.Abs(a), math.Abs(b))
}

var errMergeBase = newErr("the Ingredients have different Base Units")
