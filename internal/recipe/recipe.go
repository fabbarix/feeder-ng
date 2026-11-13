// Package recipe holds the pure domain rules for Recipes: validation of a
// Recipe's fields, ingredient lines and Steps, Tag normalisation, the timing
// summary and Member preference states. No net/http, no database/sql. Step
// scheduling itself lives in the schedule sub-package (team T4).
package recipe

import (
	"errors"
	"fmt"
	"math"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/tag"
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
	MaxFrozenUseByDays  = 365 // B5-LO: a Recipe's Frozen Use-by is 1 to 365 days
	MinReheatMinutes    = 1   // R12: per-Recipe reheat time, whole minutes
	MaxReheatMinutes    = 30  // the Reheat timer's own upper limit (30 minutes)
	MaxNoteRunes        = 200
	MaxStepTextRunes    = 2000
	MaxMinutes          = 10080 // one week, for durations and lead times
	MaxAttributionRunes = 200
)

// Validation error codes (ValidationError.Code). Codes from the schedule
// package (schedule.Code*) are passed through for Step timing problems.
const (
	CodeNameRequired       = "name_required"
	CodeNameTooLong        = "name_too_long"
	CodeDescTooLong        = "description_too_long"
	CodeYieldInvalid       = "yield_invalid"
	CodeTagInvalid         = "tag_invalid"
	CodeTooManyTags        = "too_many_tags"
	CodeCooldownInvalid    = "cooldown_invalid"
	CodeUseByInvalid       = "use_by_invalid"
	CodeFrozenUseByInvalid = "frozen_use_by_invalid" // B5-LO: field "frozenUseByDays", outside 1 to 365
	CodeReheatInvalid      = "reheat_invalid"
	CodeSourceInvalid      = "source_invalid"
	CodeLinesRequired      = "lines_required"
	CodeReadyMealLines     = "ready_meal_lines" // a Ready Meal has exactly one ingredient line
	CodeUnknownIngr        = "unknown_ingredient"
	CodeQuantityInvalid    = "quantity_invalid"
	CodeUnitRequired       = "unit_required"
	CodeNoteTooLong        = "note_too_long"
	CodeStepTextMissing    = "step_text_required"
	CodeStepTextLong       = "step_text_too_long"
	CodeMinutesInvalid     = "minutes_invalid"
	CodeCoursesEmpty       = "courses_empty"  // field "courses": a non-nil empty CourseIDs (spec §4)
	CodeCourseUnknown      = "course_unknown" // field "courses": an unknown or archived Course id (checked by the store)

	// Base recipes (ADR 0015, beta.6; docs/dev/design/base-recipes.md §3, §10).
	CodeBaseRecipeCycle     = "base_recipe_cycle"      // field of the line; Path names the cycle (CycleError)
	CodeBaseRecipeReadyMeal = "base_recipe_ready_meal" // a Ready Meal can never be a Base recipe (the flag clash only)
	CodeBaseRecipeNameTaken = "base_recipe_name_taken" // field "name": a Base recipe already holds the name
	CodeReadyMealNameTaken  = "ready_meal_name_taken"  // field "name": a Ready Meal's Ingredient holds the name
	CodeBaseRecipeField     = "base_recipe_field"      // a field a Base recipe does not have was set; Field names it
	CodeYieldUnitInvalid    = "yield_unit_invalid"     // field "yieldUnit"
	CodeNeededAtStepInvalid = "needed_at_step_invalid" // field "lines[i].neededAtStep"
	CodeLineNotPlain        = "line_not_plain"         // link: the line already calls for a Base recipe
	CodeLineNotBase         = "line_not_base"          // unlink: the line does not call for a Base recipe
	CodeTakeOverUnit        = "take_over_unit"         // field "takeOver": the Yield's unit does not convert to that Ingredient's Base Unit
	CodeBaseRecipeKind      = "base_recipe_kind"       // field "baseRecipe": a save cannot change the kind (ToBase / ToPlannable do); also ToBase of a Base recipe
	CodeBasePreference      = "base_recipe_preference" // field "state": a Base recipe has Exclusions only, no Favourite or Dislike (P2)
	CodeLinkInvalid         = "link_invalid"           // field "link": the link body names none or more than one of baseRecipeId, create, convertRecipeId
	CodeIngredientRequired  = "ingredient_required"    // field "ingredientId": Use as a plain Ingredient needs one (the remembered Ingredient is gone or none)
	CodeNotACandidate       = "not_a_candidate"        // field "lineIds": a line is not a link candidate of that Base recipe
)

// MaxBaseYield is the largest Yield of a Base recipe (1000 g must fit); a plannable Recipe keeps MaxYield.
const MaxBaseYield = 100000.0

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

func (e *ValidationError) Error() string {
	return e.Field + ": " + e.Message
}
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

func (e *UnknownUnitError) Error() string {
	return fmt.Sprintf("%s: unit %q cannot be converted to %s for %s", e.Field, e.Unit, e.Base, e.Ingredient)
}
func (e *UnknownUnitError) Is(target error) bool { return target == ErrUnknownUnit }

// Source says where a Recipe came from.
type Source struct {
	URL         string // http(s) only, may be empty
	Attribution string
}

// Line is one ingredient line, for ONE Batch. Quantity is in Unit, not yet in
// Base Units. Ingredient (the display name) is output only.
type Line struct {
	// ID is the stored line's id (output; lets the link routes name a line). 0 on input.
	ID           int64
	IngredientID int64
	Ingredient   string
	Quantity     float64
	Unit         string
	Optional     bool
	Note         string

	// BaseRecipeID (input only): call for this Base recipe; the store maps it to the Base recipe's Ingredient. Give
	// either IngredientID or BaseRecipeID.
	BaseRecipeID int64
	// NeededAtStep is the stored Needed at override: a 0-based index into the Recipe's own Steps; nil = the default
	// rule. Only a Base recipe line may have one (CodeNeededAtStepInvalid otherwise).
	NeededAtStep *int
	// LinkedFromIngredientID (output; kept by the store across saves) is the plain Ingredient the line had before it
	// was linked to a Base recipe (§3.7), 0 = none.
	LinkedFromIngredientID int64
	// Base (output) is set when IngredientID is a Base recipe's Ingredient; NeededAt (output) is the effective
	// Needed at Step (baserecipe.NeededAt) of such a line.
	Base     *BaseRef
	NeededAt int
	// NeededAtDefault (output, round 2) is the effective Needed at Step with the override cleared (the default rule),
	// so the editor can show "Default: Step 2" beside an override.
	NeededAtDefault int
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
	Name        string
	Description string
	Yield       float64
	ReadyMeal   bool
	// CourseIDs are the Recipe's Courses (ADR 0008). nil: absent (a create gets the main Course; an update keeps
	// the stored ones); a non-nil empty list is CodeCoursesEmpty. Validate drops repeated ids, keeping order.
	// A stored Recipe lists them in household order.
	CourseIDs []int64
	// WholeMeal: nil is absent (a create gets DefaultWholeMeal; an update keeps the stored value). A stored
	// Recipe always has it set.
	WholeMeal         *bool
	Tags              []string
	CooldownDays      *int // nil = household default
	LeftoverUseByDays *int // nil = household default; 0 = same day
	// FrozenUseByDays is how long a Leftover of this Recipe keeps in a Freezer: nil = the Household's default, else
	// 1..365 (B5-LO, ADR 0012).
	FrozenUseByDays *int
	ReheatMinutes   *int // nil = no reheat time (Reheat uses its formula); else 1..30 whole minutes (R12)
	Source          Source
	Image           string // image id, "" = none
	Lines           []Line
	Steps           []Step

	// BaseRecipe makes the Recipe a Base recipe (§3.1); YieldUnit is then the unit of its Yield (one of YieldUnits)
	// and must be empty otherwise. nil is absent: a create gets false, an update keeps the stored kind (like
	// WholeMeal); a stored Recipe always has it set. Asking an update for the other kind is CodeBaseRecipeKind: the
	// kind changes by ToBase and ToPlannable. Use IsBase to read it.
	BaseRecipe *bool
	YieldUnit  string
	// TakeOver is the User's answer to the take-over ask of §3.2 (create as a Base recipe, rename a Base recipe): true
	// takes the same-name plain Ingredient over, false keeps it apart, nil = not asked yet (the store answers with a
	// *TakeOverError when a plain Ingredient has the name).
	TakeOver *bool
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
func (in Input) Validate(lookup IngredientLookup) (Input, error) {
	var out Input

	name := collapse(in.Name)
	switch {
	case name == "":
		return Input{}, fieldErr("name", CodeNameRequired, "a Recipe needs a name")
	case runeLen(name) > MaxNameRunes:
		return Input{}, fieldErr("name", CodeNameTooLong, "the name is longer than 100 characters")
	}
	out.Name = name

	out.Description = strings.TrimSpace(in.Description)
	if runeLen(out.Description) > MaxDescriptionRunes {
		return Input{}, fieldErr("description", CodeDescTooLong, "the description is longer than 4000 characters")
	}

	isBase := in.IsBase()
	ready := in.ReadyMeal
	if isBase {
		// §3.1: a Base recipe is never a Ready Meal, has no Courses and none of the plannable-only fields, and
		// its Yield is an amount in a unit of its own (up to MaxBaseYield, so 1000 g fits).
		if ready {
			return Input{}, fieldErr("readyMeal", CodeBaseRecipeReadyMeal, "a Base recipe cannot be a Ready Meal")
		}
		if !finite(in.Yield) || in.Yield <= 0 || in.Yield > MaxBaseYield {
			return Input{}, fieldErr("yield", CodeYieldInvalid, "the yield must be more than 0 and at most 100000")
		}
		unit := units.NormalizeUnit(in.YieldUnit)
		if _, ok := YieldBase(unit); !ok {
			return Input{}, fieldErr("yieldUnit", CodeYieldUnitInvalid, "a Base recipe's yield needs a unit: g, kg, ml, l, dl, cl, tsp, tbsp, cup, piece or portion")
		}
		out.YieldUnit = unit
	} else {
		if !finite(in.Yield) || in.Yield <= 0 || in.Yield > MaxYield {
			return Input{}, fieldErr("yield", CodeYieldInvalid, "the yield must be more than 0 and at most 100")
		}
		if strings.TrimSpace(in.YieldUnit) != "" {
			return Input{}, fieldErr("yieldUnit", CodeYieldUnitInvalid, "only a Base recipe has a yield unit")
		}
	}
	out.Yield = in.Yield
	out.BaseRecipe = boolPtr(isBase)

	tags, err := cleanTags(in.Tags)
	if err != nil {
		return Input{}, err
	}
	out.Tags = tags

	if d := in.CooldownDays; d != nil {
		if *d < 0 || *d > MaxCooldownDays {
			return Input{}, fieldErr("cooldownDays", CodeCooldownInvalid, "the cool-down must be 0 to 365 days")
		}
		out.CooldownDays = intPtr(*d)
	}
	if d := in.LeftoverUseByDays; d != nil {
		if *d < 0 || *d > MaxUseByDays {
			return Input{}, fieldErr("leftoverUseByDays", CodeUseByInvalid, "the use-by must be 0 to 30 days")
		}
		out.LeftoverUseByDays = intPtr(*d)
	}
	if d := in.FrozenUseByDays; d != nil {
		if *d < 1 || *d > MaxFrozenUseByDays {
			return Input{}, fieldErr("frozenUseByDays", CodeFrozenUseByInvalid, "the frozen use-by must be 1 to 365 days")
		}
		out.FrozenUseByDays = intPtr(*d)
	}
	if d := in.ReheatMinutes; d != nil {
		if *d < MinReheatMinutes || *d > MaxReheatMinutes {
			return Input{}, fieldErr("reheatMinutes", CodeReheatInvalid, "the reheat time must be 1 to 30 minutes")
		}
		out.ReheatMinutes = intPtr(*d)
	}

	src := strings.TrimSpace(in.Source.URL)
	if src != "" {
		u, err := url.Parse(src)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return Input{}, fieldErr("source.url", CodeSourceInvalid, "the source must be an http or https address")
		}
	}
	attribution := collapse(in.Source.Attribution)
	if runeLen(attribution) > MaxAttributionRunes {
		return Input{}, fieldErr("source.attribution", CodeSourceInvalid, "the attribution is longer than 200 characters")
	}
	out.Source = Source{URL: src, Attribution: attribution}
	out.Image = strings.TrimSpace(in.Image)

	if len(in.Lines) == 0 && !isBase {
		return Input{}, fieldErr("lines", CodeLinesRequired, "a Recipe needs at least one ingredient line")
	}
	lines, err := cleanLines(in.Lines, lookup)
	if err != nil {
		return Input{}, err
	}
	if ready && len(lines) != 1 {
		return Input{}, fieldErr("lines", CodeReadyMealLines, "a Ready Meal has exactly one ingredient line")
	}
	out.ReadyMeal = ready
	out.Lines = lines

	if isBase {
		if err := baseOnlyEmpty(in); err != nil {
			return Input{}, err
		}
	} else {
		if in.CourseIDs != nil {
			if len(in.CourseIDs) == 0 {
				return Input{}, fieldErr("courses", CodeCoursesEmpty, "a Recipe needs at least one Course")
			}
			out.CourseIDs = dedupeIDs(in.CourseIDs)
		}
		if in.WholeMeal != nil {
			whole := *in.WholeMeal
			out.WholeMeal = &whole
		}
	}

	steps, err := cleanSteps(in.Steps, lookup)
	if err != nil {
		return Input{}, err
	}
	out.Steps = steps

	// Needed at (§3.3): an override names one of the Recipe's own Steps (the Base recipe check is the store's).
	for i := range out.Lines {
		if n := out.Lines[i].NeededAtStep; n != nil && (*n < 0 || *n >= len(steps) || steps[*n].Kind == schedule.Advance) {
			return Input{}, fieldErr(fmt.Sprintf("lines[%d].neededAtStep", i), CodeNeededAtStepInvalid, "Needed at must be one of this Recipe's Steps")
		}
	}

	// Unit convertibility comes last, so a typo in a field is reported first.
	for i, l := range lines {
		ing, _ := lookup(l.IngredientID)
		if !units.IsConvertible(l.Unit, ing) {
			return Input{}, unknownUnit(fmt.Sprintf("lines[%d].unit", i), l.IngredientID, ing, l.Unit)
		}
	}
	for i, s := range steps {
		for j, u := range s.Uses {
			ing, _ := lookup(u.IngredientID)
			if !units.IsConvertible(u.Unit, ing) {
				return Input{}, unknownUnit(fmt.Sprintf("steps[%d].uses[%d].unit", i, j), u.IngredientID, ing, u.Unit)
			}
		}
	}
	return out, nil
}

// cleanTags collapses, validates and de-duplicates Tags by TagKey.
func cleanTags(in []string) ([]string, error) {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for i, t := range in {
		name := collapse(t)
		if name == "" || runeLen(name) > MaxTagRunes {
			return nil, fieldErr(fmt.Sprintf("tags[%d]", i), CodeTagInvalid, "a Tag needs 1 to 40 characters")
		}
		k := TagKey(name)
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, name)
	}
	if len(out) > MaxTags {
		return nil, fieldErr("tags", CodeTooManyTags, "a Recipe has at most 20 Tags")
	}
	return out, nil
}

// cleanLines validates the lines' own fields (not their units).
func cleanLines(in []Line, lookup IngredientLookup) ([]Line, error) {
	out := make([]Line, 0, len(in))
	for i, l := range in {
		ing, ok := lookup(l.IngredientID)
		if !ok {
			return nil, fieldErr(fmt.Sprintf("lines[%d].ingredientId", i), CodeUnknownIngr, "that Ingredient does not exist")
		}
		if !finite(l.Quantity) || l.Quantity <= 0 {
			return nil, fieldErr(fmt.Sprintf("lines[%d].quantity", i), CodeQuantityInvalid, "the quantity must be more than 0")
		}
		unit := units.NormalizeUnit(l.Unit)
		if unit == "" {
			return nil, fieldErr(fmt.Sprintf("lines[%d].unit", i), CodeUnitRequired, "every line needs a unit")
		}
		note := strings.TrimSpace(l.Note)
		if runeLen(note) > MaxNoteRunes {
			return nil, fieldErr(fmt.Sprintf("lines[%d].note", i), CodeNoteTooLong, "the note is longer than 200 characters")
		}
		out = append(out, Line{
			ID:           l.ID,
			IngredientID: l.IngredientID,
			Ingredient:   ing.Name,
			Quantity:     l.Quantity,
			Unit:         unit,
			Optional:     l.Optional,
			Note:         note,
			NeededAtStep: copyIntPtr(l.NeededAtStep),
			// The memory of a Base recipe line is kept by the store (§3.7); Validate carries it through.
			LinkedFromIngredientID: l.LinkedFromIngredientID,
		})
	}
	return out, nil
}

// cleanSteps validates each Step's fields and uses, then its timing.
func cleanSteps(in []Step, lookup IngredientLookup) ([]Step, error) {
	out := make([]Step, 0, len(in))
	for i, s := range in {
		f := func(suffix string) string { return fmt.Sprintf("steps[%d]%s", i, suffix) }
		text := strings.TrimSpace(s.Text)
		switch {
		case text == "":
			return nil, fieldErr(f(".text"), CodeStepTextMissing, "every Step needs its text")
		case runeLen(text) > MaxStepTextRunes:
			return nil, fieldErr(f(".text"), CodeStepTextLong, "the Step text is longer than 2000 characters")
		}
		if s.DurationMinutes < 0 || s.DurationMinutes > MaxMinutes {
			return nil, fieldErr(f(".durationMinutes"), CodeMinutesInvalid, "a duration must be 0 to 10080 minutes")
		}
		if s.LeadTimeMinutes < 0 || s.LeadTimeMinutes > MaxMinutes {
			return nil, fieldErr(f(".leadTimeMinutes"), CodeMinutesInvalid, "a lead time must be 0 to 10080 minutes")
		}
		uses := make([]Use, 0, len(s.Uses))
		for j, u := range s.Uses {
			if _, ok := lookup(u.IngredientID); !ok {
				return nil, fieldErr(f(fmt.Sprintf(".uses[%d].ingredientId", j)), CodeUnknownIngr, "that Ingredient does not exist")
			}
			if !finite(u.Quantity) || u.Quantity <= 0 {
				return nil, fieldErr(f(fmt.Sprintf(".uses[%d].quantity", j)), CodeQuantityInvalid, "the quantity must be more than 0")
			}
			unit := units.NormalizeUnit(u.Unit)
			if unit == "" {
				return nil, fieldErr(f(fmt.Sprintf(".uses[%d].unit", j)), CodeUnitRequired, "every use needs a unit")
			}
			uses = append(uses, Use{IngredientID: u.IngredientID, Quantity: u.Quantity, Unit: unit})
		}
		out = append(out, Step{
			Text:            text,
			Kind:            s.Kind,
			DurationMinutes: s.DurationMinutes,
			LeadTimeMinutes: s.LeadTimeMinutes,
			After:           append([]int(nil), s.After...),
			Uses:            uses,
			Image:           strings.TrimSpace(s.Image),
		})
	}
	sched := make([]schedule.Step, len(out))
	for i, s := range out {
		sched[i] = schedule.Step{Kind: s.Kind, DurationMinutes: s.DurationMinutes, LeadTimeMinutes: s.LeadTimeMinutes, After: s.After}
	}
	if errs := schedule.Validate(sched); len(errs) > 0 {
		e := errs[0]
		return nil, fieldErr(fmt.Sprintf("steps[%d]", e.Step), e.Code, e.Message)
	}
	return out, nil
}

func unknownUnit(field string, id int64, ing units.Ingredient, unit string) *UnknownUnitError {
	return &UnknownUnitError{
		Field:        field,
		IngredientID: id,
		Ingredient:   ing.Name,
		Unit:         units.NormalizeUnit(unit),
		Base:         ing.Base,
	}
}

func fieldErr(field, code, message string) *ValidationError {
	return &ValidationError{Field: field, Code: code, Message: message}
}

func collapse(s string) string { return strings.Join(strings.Fields(s), " ") }

func runeLen(s string) int { return utf8.RuneCountInString(s) }

func finite(f float64) bool { return !math.IsNaN(f) && !math.IsInf(f, 0) }

func intPtr(n int) *int { return &n }

func boolPtr(b bool) *bool { return &b }

func copyIntPtr(p *int) *int {
	if p == nil {
		return nil
	}
	n := *p
	return &n
}

// baseOnlyEmpty refuses a field a Base recipe does not have (§3.1, CodeBaseRecipeField). The empty values the
// editor sends back (no Courses, Whole meal false) are not fields that were set.
func baseOnlyEmpty(in Input) error {
	switch {
	case len(in.CourseIDs) > 0:
		return fieldErr("courses", CodeBaseRecipeField, "a Base recipe has no Courses: it is never planned")
	case in.WholeMeal != nil && *in.WholeMeal:
		return fieldErr("wholeMeal", CodeBaseRecipeField, "a Base recipe is not a whole meal")
	case in.CooldownDays != nil:
		return fieldErr("cooldownDays", CodeBaseRecipeField, "a Base recipe has no cool-down")
	case in.LeftoverUseByDays != nil:
		return fieldErr("leftoverUseByDays", CodeBaseRecipeField, "a Base recipe has no Use-by")
	case in.FrozenUseByDays != nil:
		return fieldErr("frozenUseByDays", CodeBaseRecipeField, "a Base recipe has no Frozen Use-by")
	case in.ReheatMinutes != nil:
		return fieldErr("reheatMinutes", CodeBaseRecipeField, "a Base recipe has no reheat time")
	}
	return nil
}

// TagKey is the matching key of a Tag: lower case, trimmed, whitespace collapsed.
func TagKey(name string) string { return tag.NameKey(name) }

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
func TimingOf(steps []Step) (Timing, error) {
	ss := make([]schedule.Step, len(steps))
	for i, s := range steps {
		ss[i] = schedule.Step{Kind: s.Kind, DurationMinutes: s.DurationMinutes, LeadTimeMinutes: s.LeadTimeMinutes, After: s.After}
	}
	sched, err := schedule.Compute(ss)
	if err != nil {
		return Timing{}, err
	}
	t := Timing{TotalMinutes: sched.TotalMinutes, Timeline: sched.Steps}
	for _, a := range sched.Advance {
		t.Advance = append(t.Advance, AdvanceItem{Step: a.Index, LeadTimeMinutes: a.LeadTimeMinutes})
		if a.LeadTimeMinutes > t.AdvanceMinutes {
			t.AdvanceMinutes = a.LeadTimeMinutes
		}
	}
	return t, nil
}

// Recipe is a stored Recipe.
type Recipe struct {
	ID int64
	Input
	Courses   []CourseRef // CourseIDs with their names, in household order (read only)
	Archived  bool
	Timing    Timing
	CreatedAt time.Time
	UpdatedAt time.Time

	// Base recipe outputs (§10); zero for a plannable Recipe.
	BaseIngredientID int64    // the Base recipe's Ingredient
	UsedBy           []Ref    // Recipes (archived included) with a line calling for this Base recipe; never nil
	Within           []Within // the Ingredients inside, through the Base recipes this Recipe calls for; never nil
}

// CourseRef is a Course as a Recipe shows it.
type CourseRef struct {
	ID   int64
	Name string
}

// Summary is one row of the Recipes list.
type Summary struct {
	ID             int64
	Name           string
	Yield          float64
	ReadyMeal      bool
	CourseIDs      []int64 // household order; never nil
	WholeMeal      bool
	Tags           []string
	Image          string
	Archived       bool
	TotalMinutes   int
	AdvanceMinutes int
	ReheatMinutes  int // 0 = none (R12)

	BaseRecipe  bool   // §10: a Base recipe
	YieldUnit   string // its Yield's unit, "" for a plannable Recipe
	UsedByCount int    // Recipes that call for it (Base recipes only)

	// Round 2 (BR-B review): BaseIngredientID is the Base recipe's Ingredient (0 for a plannable Recipe; the web reads
	// Stock by it). WouldCycle is set only when the list was asked ListFilter.For a Recipe: a line of that Recipe
	// calling for this Base recipe would make a cycle.
	BaseIngredientID int64
	WouldCycle       bool
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
func ParseState(s string) (State, bool) {
	v := strings.ToLower(strings.TrimSpace(s))
	switch State(v) {
	case "", StateNone:
		return StateNone, true
	case StateFavourite, StateDislike, StateExclusion:
		return State(v), true
	}
	return "", false
}

// DefaultWholeMeal is the Whole meal value of a create that does not say: true for a Ready Meal whose
// Courses include the main Course, false otherwise (spec §4).
func DefaultWholeMeal(readyMeal bool, courseIDs []int64, mainID int64) bool {
	if !readyMeal {
		return false
	}
	for _, id := range courseIDs {
		if id == mainID {
			return true
		}
	}
	return false
}

// LostCourses returns the Course ids in before that are not in after, in before's order: the Courses a
// Recipe loses on save (spec §4, "A Recipe that loses a Course").
func LostCourses(before, after []int64) []int64 {
	kept := make(map[int64]bool, len(after))
	for _, id := range after {
		kept[id] = true
	}
	var lost []int64
	for _, id := range before {
		if !kept[id] {
			lost = append(lost, id)
		}
	}
	return lost
}

// dedupeIDs drops repeated ids, keeping the first of each and the order. It returns a new slice.
func dedupeIDs(ids []int64) []int64 {
	seen := make(map[int64]bool, len(ids))
	out := make([]int64, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}
