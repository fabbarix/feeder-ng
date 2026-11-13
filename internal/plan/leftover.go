package plan

import (
	"errors"
	"math"
	"sort"
	"time"
)

// Leftovers by hand (ADR 0012, docs/dev/design/b5-lo.md): the pure rules.

// LeftoverAnswer is what a User answers about a Leftover that is past its Use-by: Had it, Threw it out or Wasn't there.
type LeftoverAnswer string

// The three answers (the API's words).
const (
	AnswerHadIt      LeftoverAnswer = "had_it"
	AnswerThrewOut   LeftoverAnswer = "threw_out"
	AnswerWasntThere LeftoverAnswer = "wasnt_there"
)

// Valid says whether a is one of the three answers.
func (a LeftoverAnswer) Valid() bool {
	switch a {
	case AnswerHadIt, AnswerThrewOut, AnswerWasntThere:
		return true
	}
	return false
}

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
func (l Leftover) Frozen() bool { return l.FrozenOn != "" }

// FreezeUseBy is the Use-by of a Leftover frozen on today: today plus the Recipe's Frozen Use-by days (recipeDays, when
// set) or the Household's (householdDays).
func FreezeUseBy(today string, recipeDays *int, householdDays int) string {
	days := householdDays
	if recipeDays != nil {
		days = *recipeDays
	}
	return addDays(today, days)
}

// TakeOutUseBy is the Use-by of a Leftover taken out of the Freezer on today: today plus the Recipe's Use-by days
// (recipeDays, when set; 0 is the same day) or the Household's default (defaultDays). It is LeftoverUseBy from today.
func TakeOutUseBy(today string, recipeDays *int, defaultDays int) string {
	return LeftoverUseBy(today, recipeDays, defaultDays)
}

// IsToAnswer says whether the Leftover is past its Use-by with portions left, so Feeder asks what happened to it:
// available, Portions > 0 and UseBy before today. Frozen or not. A Leftover is still good on its Use-by date.
func IsToAnswer(l Leftover, today string) bool {
	return l.Status == LeftoverAvailable && l.Portions > 0 && l.UseBy < today
}

// Plannable says whether the planner may serve the Leftover on its own (Leftover first): available, portions left, not
// frozen and not to answer. A frozen Leftover is used only when a User picks it.
func Plannable(l Leftover, today string) bool {
	return l.Status == LeftoverAvailable && l.Portions > 0 && !l.Frozen() && !IsToAnswer(l, today)
}

// ThrownOutOn dates a Leftover thrown out and says whether it is waste. Had it and Wasn't there are never waste (the
// date is ""). Threw it out is waste dated today, except for a Leftover already past its Use-by (UseBy before today),
// which counts on the day after its Use-by, like a Lot going off (spec 6.1). An unanswered Leftover has no record at all.
func ThrownOutOn(answer LeftoverAnswer, useBy, today string) (on string, waste bool) {
	if answer != AnswerThrewOut {
		return "", false
	}
	if useBy < today {
		return addDays(useBy, 1), true
	}
	return today, true
}

// CheckPortions validates the portions of Had it, Threw it out or Freeze it: finite, above zero and at most left.
// ErrPortionsInvalid otherwise.
func CheckPortions(portions, left float64) error {
	if !finitePortions(portions) || portions <= 0 || portions > left+leftoverEps {
		return ErrPortionsInvalid
	}
	return nil
}

// SplitForFreeze splits a Leftover of left portions for Freeze it. take nil freezes all of it. It returns the frozen
// part and the part that stays (0 when all is frozen). ErrPortionsInvalid when take is not above zero or is more than left.
func SplitForFreeze(left float64, take *float64) (frozen, stays float64, err error) {
	if take == nil {
		return left, 0, nil
	}
	if err := CheckPortions(*take, left); err != nil {
		return 0, 0, err
	}
	stays = left - *take
	if stays < leftoverEps {
		stays = 0
	}
	return *take, stays, nil
}

// PlannedClaims is the portions the Planned Meals served from a Leftover are planned to use: the sum of their Portions.
func PlannedClaims(deps []Dependant) float64 {
	var sum float64
	for _, d := range deps {
		sum += d.Portions
	}
	return sum
}

// MisfitDependants lists the dependants, Pinned or not, that no longer get their portions when only available remain.
// They are served in order of At (then Meal Slot id), each taking its Portions if enough remain, as DependantsToUnpin.
func MisfitDependants(available float64, deps []Dependant) []Key {
	sorted := append([]Dependant(nil), deps...)
	sort.SliceStable(sorted, func(i, j int) bool {
		if !sorted[i].At.Equal(sorted[j].At) {
			return sorted[i].At.Before(sorted[j].At)
		}
		return sorted[i].Key.MealSlotID < sorted[j].Key.MealSlotID
	})
	var out []Key
	remaining := available
	for _, d := range sorted {
		if d.Portions <= remaining+leftoverEps {
			remaining -= d.Portions
			continue
		}
		out = append(out, d.Key)
	}
	return out
}

// AfterUseBy lists the Planned Meals served from a Leftover (served, in the order they are served) that are dated after
// useBy. Take out shortens a Leftover's Use-by, so these meals can no longer have it: they are unpinned and planned
// again (ADR 0012). A meal dated on the Use-by itself is still good.
func AfterUseBy(useBy string, served []Meal) []Key {
	var out []Key
	for _, m := range served {
		if m.Key.Date > useBy {
			out = append(out, m.Key)
		}
	}
	return out
}

// leftoverEps absorbs float noise in portion arithmetic (as eps in cook.go).
const leftoverEps = 1e-9

func finitePortions(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

// addDays is the household date d (YYYY-MM-DD) plus n days; d itself when it does not parse.
func addDays(d string, n int) string {
	t, err := time.Parse(dateLayout, d)
	if err != nil {
		return d
	}
	return t.AddDate(0, 0, n).Format(dateLayout)
}
