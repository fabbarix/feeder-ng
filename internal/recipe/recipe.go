// Package recipe holds the pure domain rules for Recipes: validation of a
// Recipe's fields, ingredient lines and Steps, Tag normalisation, the timing
// summary and Member preference states. No net/http, no database/sql. Step
// scheduling itself lives in the schedule sub-package (team T4).
package recipe

import (
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// Limits.
const (
	MaxNameRunes        = 100
	MaxDescriptionRunes = 4000
	MaxYield            = 100.0
	MaxTags             = 20
	MaxTagRunes         = 40
	MaxCooldownDays     = 365
	MaxUseByDays        = 30
	MaxNoteRunes        = 200
	MaxStepTextRunes    = 2000
	MaxMinutes          = 10080 // one week, for durations and lead times
	MaxAttributionRunes = 200
)

// Validation error codes (ValidationError.Code). Codes from the schedule
// package (schedule.Code*) are passed through for Step timing problems.
const (
	CodeNameRequired    = "name_required"
	CodeNameTooLong     = "name_too_long"
	CodeDescTooLong     = "description_too_long"
	CodeYieldInvalid    = "yield_invalid"
	CodeTagInvalid      = "tag_invalid"
	CodeTooManyTags     = "too_many_tags"
	CodeCooldownInvalid = "cooldown_invalid"
	CodeUseByInvalid    = "use_by_invalid"
	CodeSourceInvalid   = "source_invalid"
	CodeLinesRequired   = "lines_required"
	CodeReadyMealLines  = "ready_meal_lines" // a Ready Meal has exactly one ingredient line
	CodeUnknownIngr     = "unknown_ingredient"
	CodeQuantityInvalid = "quantity_invalid"
	CodeUnitRequired    = "unit_required"
	CodeNoteTooLong     = "note_too_long"
	CodeStepTextMissing = "step_text_required"
	CodeStepTextLong    = "step_text_too_long"
	CodeMinutesInvalid  = "minutes_invalid"
)

// ErrInvalid is matched (errors.Is) by every *ValidationError.
var ErrInvalid = errors.New("invalid recipe")

// ErrUnknownUnit is matched by *UnknownUnitError.
var ErrUnknownUnit = errors.New("unknown unit for ingredient")

// ValidationError names the offending JSON field path ("name", "yield",
// "tags[1]", "lines[0].quantity", "steps[2].after", "steps[1]" for a timing
// problem of a whole Step) and says what is wrong.
type ValidationError struct {
	Field   string
	Code    string
	Message string
}

func (e *ValidationError) Error() string        { panic("TODO") }
func (e *ValidationError) Is(target error) bool { return target == ErrInvalid }

// UnknownUnitError means a line (or a Step's `uses`) is written in a Unit the
// Ingredient cannot convert to its Base Unit. The editor answers it with an
// inline Unit Conversion prompt (Field tells which line), then resubmits.
type UnknownUnitError struct {
	Field        string // "lines[2].unit" or "steps[1].uses[0].unit"
	IngredientID int64
	Ingredient   string // display name
	Unit         string // as normalised by units.NormalizeUnit
	Base         units.Base
}

func (e *UnknownUnitError) Error() string        { panic("TODO") }
func (e *UnknownUnitError) Is(target error) bool { return target == ErrUnknownUnit }

// Source says where a Recipe came from.
type Source struct {
	URL         string // http(s) only, may be empty
	Attribution string
}

// Line is one ingredient line, for ONE Batch. Quantity is in Unit, not yet in
// Base Units. Ingredient (the display name) is output only.
type Line struct {
	IngredientID int64
	Ingredient   string
	Quantity     float64
	Unit         string
	Optional     bool
	Note         string
}

// Use is an Ingredient amount a Step needs (informational).
type Use struct {
	IngredientID int64
	Quantity     float64
	Unit         string
}

// Step is one Step. Image is an image id (see internal/imaging).
type Step struct {
	Text            string
	Kind            schedule.Kind
	DurationMinutes int
	LeadTimeMinutes int
	After           []int
	Uses            []Use
	Image           string
}

// Input is what a User supplies to create or fully replace a Recipe.
type Input struct {
	Name              string
	Description       string
	Yield             float64
	ReadyMeal         bool
	Tags              []string
	CooldownDays      *int // nil = household default
	LeftoverUseByDays *int // nil = household default; 0 = same day
	Source            Source
	Image             string // image id, "" = none
	Lines             []Line
	Steps             []Step
}

// IngredientLookup returns the Ingredient (with its Unit Conversions) for an id.
type IngredientLookup func(id int64) (units.Ingredient, bool)

// Validate returns the cleaned Input or the first problem found.
//
// Cleaning: Name/Tags trimmed with inner whitespace collapsed (case kept); Tags
// de-duplicated by TagKey (first spelling wins); Unit normalised with
// units.NormalizeUnit; Source.URL trimmed.
//
// Order of checks: name, description, yield, Tags, overrides, source, lines
// (count, then per line: ingredient, quantity, unit present, note), Ready Meal
// rule, Steps (text, minutes, then timing via schedule.Validate), and only
// then unit convertibility of every line and every Step `uses`, so a field
// error always beats an unknown unit. Returns *ValidationError or
// *UnknownUnitError.
func (in Input) Validate(lookup IngredientLookup) (Input, error) { panic("TODO") }

// TagKey is the matching key of a Tag: lower case, trimmed, whitespace collapsed.
func TagKey(name string) string { panic("TODO") }

// Timing is the schedule summary shown on Recipe tiles and detail.
type Timing struct {
	TotalMinutes   int              // critical path; 0 without timeline Steps
	Advance        []AdvanceItem    // Advance Steps in step order, shown separately ("+4 h marinate")
	AdvanceMinutes int              // longest lead time, 0 if none
	Timeline       []schedule.Timed // start/end of every non-Advance Step
}

// AdvanceItem is one Advance Step.
type AdvanceItem struct {
	Step            int
	LeadTimeMinutes int
}

// TimingOf schedules the Steps with schedule.Compute.
func TimingOf(steps []Step) (Timing, error) { panic("TODO") }

// Recipe is a stored Recipe.
type Recipe struct {
	ID int64
	Input
	Archived  bool
	Timing    Timing
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Summary is one row of the Recipes list.
type Summary struct {
	ID             int64
	Name           string
	Yield          float64
	ReadyMeal      bool
	Tags           []string
	Image          string
	Archived       bool
	TotalMinutes   int
	AdvanceMinutes int
}

// State is a Member's preference for a Recipe. A Member has exactly one state
// per Recipe, so a Favourite cannot also be a Dislike or an Exclusion.
type State string

// Preference states.
const (
	StateNone      State = "none"
	StateFavourite State = "favourite"
	StateDislike   State = "dislike"
	StateExclusion State = "exclusion"
)

// ParseState accepts "", "none", "favourite", "dislike", "exclusion"
// (case-insensitive, trimmed); "" means none.
func ParseState(s string) (State, bool) { panic("TODO") }
