// Package schedule computes a Recipe's cooking timeline from its Steps: when
// each Step starts and ends, the total time (critical path) and the Advance
// Steps, which sit outside the timeline. It also scales Step `uses` by
// Batches. Pure: no HTTP, SQL or clock.
package schedule

import "errors"

// Kind is a Step's kind.
type Kind string

// The three Step kinds of the Recipe File format.
const (
	Active  Kind = "active"
	Passive Kind = "passive"
	Advance Kind = "advance"
)

// Step is the scheduling-relevant part of a Recipe Step. Zero minutes means
// "not given": an Active Step without a duration is instantaneous, a Passive
// Step must have DurationMinutes > 0 and an Advance Step LeadTimeMinutes > 0.
type Step struct {
	Kind            Kind
	DurationMinutes int
	LeadTimeMinutes int   // Advance Steps only
	After           []int // 0-based indexes into the Recipe's steps
}

// Validation error codes.
const (
	CodeUnknownKind          = "unknown_kind"
	CodeNegativeMinutes      = "negative_minutes"
	CodePassiveNeedsDuration = "passive_needs_duration"
	CodeAdvanceNeedsLead     = "advance_needs_lead_time"
	CodeAfterNotEarlier      = "after_not_earlier"  // index >= own index or < 0
	CodeAfterAdvance         = "after_advance_step" // Advance Steps are outside the timeline
)

// ValidationError is one problem with one Step.
type ValidationError struct {
	Step    int // index into steps
	Code    string
	Message string
}

func (e ValidationError) Error() string {
	panic("TODO")
}

// ValidationErrors is returned by Compute for an invalid Step list.
type ValidationErrors []ValidationError

func (e ValidationErrors) Error() string {
	panic("TODO")
}

// Validate returns every problem found, ordered by step index (nil if valid).
func Validate(steps []Step) ValidationErrors {
	panic("TODO")
}

// Timed is one non-Advance Step placed on the timeline, in minutes from the
// moment cooking starts.
type Timed struct {
	Index int // index into the Recipe's steps
	Start int
	End   int
}

// AdvanceStep is an Advance Step, due LeadTimeMinutes before the slot time.
type AdvanceStep struct {
	Index           int
	LeadTimeMinutes int
}

// Schedule is the result of Compute.
type Schedule struct {
	Steps        []Timed       // non-Advance Steps, in step order
	Advance      []AdvanceStep // Advance Steps, in step order
	TotalMinutes int           // end of the critical path; 0 if no timeline Steps
}

// Compute schedules the Steps per the Recipe File rule: a non-Advance Step
// starts when the cook is free (the previous non-Advance Step has finished if
// Active, or merely started if Passive) and every Step in `after` has
// finished. TotalMinutes is the latest End. On invalid input it returns the
// zero Schedule and a ValidationErrors.
func Compute(steps []Step) (Schedule, error) {
	panic("TODO")
}

// Use is an Ingredient amount a Step needs (informational).
type Use struct {
	Ingredient string
	Quantity   float64
	Unit       string
}

// ErrInvalidBatches is returned by ScaleUses for Batches that are <= 0, NaN or Inf.
var ErrInvalidBatches = errors.New("invalid batches")

// ScaleUses returns a copy of uses with every Quantity multiplied by batches
// (fractional Batches allowed). The input is not modified.
func ScaleUses(uses []Use, batches float64) ([]Use, error) {
	panic("TODO")
}
