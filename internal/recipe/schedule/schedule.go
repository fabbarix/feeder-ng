// Package schedule computes a Recipe's cooking timeline from its Steps: when
// each Step starts and ends, the total time (critical path) and the Advance
// Steps, which sit outside the timeline. It also scales Step `uses` by
// Batches. Pure: no HTTP, SQL or clock.
package schedule

import (
	"errors"
	"fmt"
	"math"
	"strings"
)

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
	return fmt.Sprintf("step %d: %s", e.Step+1, e.Message)
}

// ValidationErrors is returned by Compute for an invalid Step list.
type ValidationErrors []ValidationError

func (e ValidationErrors) Error() string {
	msgs := make([]string, len(e))
	for i, v := range e {
		msgs[i] = v.Error()
	}
	return strings.Join(msgs, "; ")
}

// Validate returns every problem found, ordered by step index (nil if valid).
func Validate(steps []Step) ValidationErrors {
	var errs ValidationErrors
	add := func(i int, code, msg string) {
		errs = append(errs, ValidationError{Step: i, Code: code, Message: msg})
	}
	for i, s := range steps {
		switch s.Kind {
		case Active:
			if s.DurationMinutes < 0 {
				add(i, CodeNegativeMinutes, "duration must not be negative")
			}
		case Passive:
			if s.DurationMinutes < 0 {
				add(i, CodeNegativeMinutes, "duration must not be negative")
			} else if s.DurationMinutes == 0 {
				add(i, CodePassiveNeedsDuration, "passive step needs a duration")
			}
		case Advance:
			if s.LeadTimeMinutes < 0 {
				add(i, CodeNegativeMinutes, "lead time must not be negative")
			} else if s.LeadTimeMinutes == 0 {
				add(i, CodeAdvanceNeedsLead, "advance step needs a lead time")
			}
		default:
			add(i, CodeUnknownKind, fmt.Sprintf("unknown step kind %q", string(s.Kind)))
		}
		for _, j := range s.After {
			switch {
			case j < 0 || j >= i:
				add(i, CodeAfterNotEarlier, fmt.Sprintf("after %d must refer to an earlier step", j+1))
			case steps[j].Kind == Advance:
				add(i, CodeAfterAdvance, fmt.Sprintf("after %d is an advance step, which is outside the timeline", j+1))
			}
		}
	}
	return errs
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
	if errs := Validate(steps); len(errs) > 0 {
		return Schedule{}, errs
	}
	var out Schedule
	ends := make([]int, len(steps))
	cookFree := 0
	for i, s := range steps {
		if s.Kind == Advance {
			out.Advance = append(out.Advance, AdvanceStep{Index: i, LeadTimeMinutes: s.LeadTimeMinutes})
			continue
		}
		start := cookFree
		for _, j := range s.After {
			if ends[j] > start {
				start = ends[j]
			}
		}
		end := start + s.DurationMinutes
		ends[i] = end
		out.Steps = append(out.Steps, Timed{Index: i, Start: start, End: end})
		if s.Kind == Active {
			cookFree = end
		} else {
			cookFree = start
		}
		if end > out.TotalMinutes {
			out.TotalMinutes = end
		}
	}
	return out, nil
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
	if !(batches > 0) || math.IsInf(batches, 0) {
		return nil, ErrInvalidBatches
	}
	out := make([]Use, len(uses))
	for i, u := range uses {
		u.Quantity *= batches
		out[i] = u
	}
	return out, nil
}
