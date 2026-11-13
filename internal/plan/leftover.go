package plan

import "errors"

// Leftovers by hand (ADR 0012, docs/dev/design/b5-lo.md): the pure rules. STUBS for the test commit: the Developer
// implements every function below; the tests in leftover_test.go are red until then.

// LeftoverAnswer is what a User answers about a Leftover that is past its Use-by: Had it, Threw it out or Wasn't there.
type LeftoverAnswer string

// The three answers (the API's words).
const (
	AnswerHadIt      LeftoverAnswer = "had_it"
	AnswerThrewOut   LeftoverAnswer = "threw_out"
	AnswerWasntThere LeftoverAnswer = "wasnt_there"
)

// Valid says whether a is one of the three answers.
func (a LeftoverAnswer) Valid() bool { return false }

// LeftoverEventKind is a row of leftover_events.
type LeftoverEventKind string

// The kinds of leftover_events.kind.
const (
	EventHadIt      LeftoverEventKind = "had_it"
	EventThrewOut   LeftoverEventKind = "threw_out"
	EventFroze      LeftoverEventKind = "froze"
	EventTookOut    LeftoverEventKind = "took_out"
	EventWasntThere LeftoverEventKind = "wasnt_there"
)

// LeftoverEvent is one hand action on a Leftover, kept after the Leftover is gone.
type LeftoverEvent struct {
	ID             int64
	LeftoverID     int64
	RecipeID       int64
	Kind           LeftoverEventKind
	Portions       float64
	On             string // household date
	StoragePlaceID int64  // 0: none
	UserID         int64  // 0: none (a system action)
}

// StoragePlace is the part of a Storage Place the plan needs: its kind decides Freeze it and Take out.
type StoragePlace struct {
	ID   int64
	Name string
	Kind string // pantry, fridge or freezer
}

// ErrPortionsInvalid: portions are not a number above zero and at most what is left.
var ErrPortionsInvalid = errors.New("plan: portions must be above zero and at most what is left")

// Frozen says whether the Leftover is in a Freezer (FrozenOn set), whatever its Storage Place is now.
func (l Leftover) Frozen() bool { return false }

// FreezeUseBy is the Use-by of a Leftover frozen on today: today plus the Recipe's Frozen Use-by days (recipeDays, when
// set) or the Household's (householdDays).
func FreezeUseBy(today string, recipeDays *int, householdDays int) string { return "" }

// TakeOutUseBy is the Use-by of a Leftover taken out of the Freezer on today: today plus the Recipe's Use-by days
// (recipeDays, when set; 0 is the same day) or the Household's default (defaultDays). It is LeftoverUseBy from today.
func TakeOutUseBy(today string, recipeDays *int, defaultDays int) string { return "" }

// IsToAnswer says whether the Leftover is past its Use-by with portions left, so Feeder asks what happened to it:
// available, Portions > 0 and UseBy before today. Frozen or not. A Leftover is still good on its Use-by date.
func IsToAnswer(l Leftover, today string) bool { return false }

// Plannable says whether the planner may serve the Leftover on its own (Leftover first): available, portions left, not
// frozen and not to answer. A frozen Leftover is used only when a User picks it.
func Plannable(l Leftover, today string) bool { return false }

// ThrownOutOn dates a Leftover thrown out and says whether it is waste. Had it and Wasn't there are never waste (the
// date is ""). Threw it out is waste dated today, except for a Leftover already past its Use-by (UseBy before today),
// which counts on the day after its Use-by, like a Lot going off (spec 6.1). An unanswered Leftover has no record at all.
func ThrownOutOn(answer LeftoverAnswer, useBy, today string) (on string, waste bool) {
	return "", false
}

// CheckPortions validates the portions of Had it, Threw it out or Freeze it: finite, above zero and at most left.
// ErrPortionsInvalid otherwise.
func CheckPortions(portions, left float64) error { return nil }

// SplitForFreeze splits a Leftover of left portions for Freeze it. take nil freezes all of it. It returns the frozen
// part and the part that stays (0 when all is frozen). ErrPortionsInvalid when take is not above zero or is more than left.
func SplitForFreeze(left float64, take *float64) (frozen, stays float64, err error) { return 0, 0, nil }

// PlannedClaims is the portions the Planned Meals served from a Leftover are planned to use: the sum of their Portions.
func PlannedClaims(deps []Dependant) float64 { return 0 }

// MisfitDependants lists the dependants, Pinned or not, that no longer get their portions when only available remain.
// They are served in order of At (then Meal Slot id), each taking its Portions if enough remain, as DependantsToUnpin.
func MisfitDependants(available float64, deps []Dependant) []Key { return nil }
