package plan

import (
	"errors"
	"math"
	"sort"
	"time"
)

// eps absorbs float noise in Base Unit and portion arithmetic.
const eps = 1e-9

// ProposedLeftover is the Leftover portions the Mark as Cooked sheet proposes:
// batches x yield - portions needed, never negative (and 0 for rounding noise below 1e-9).
func ProposedLeftover(batches, yield, portionsNeeded float64) float64 {
	v := batches*yield - portionsNeeded
	if v < eps {
		return 0
	}
	return v
}

// CheckLeftoverPortions validates the User's edited portions: finite, >= 0 and
// at most max (batches x yield). ErrInvalidLeftover otherwise.
func CheckLeftoverPortions(portions, max float64) error {
	if math.IsNaN(portions) || math.IsInf(portions, 0) || portions < 0 || portions > max+eps {
		return ErrInvalidLeftover
	}
	return nil
}

// LeftoverUseBy is cookedOn plus the Recipe's Use-by days (recipeDays, when set; 0 = same day) or the
// Household default.
func LeftoverUseBy(cookedOn string, recipeDays *int, defaultDays int) string {
	days := defaultDays
	if recipeDays != nil {
		days = *recipeDays
	}
	d, err := time.Parse(dateLayout, cookedOn)
	if err != nil {
		return cookedOn
	}
	return d.AddDate(0, 0, days).Format(dateLayout)
}

// Dependant is a Planned Meal served from a Leftover.
type Dependant struct {
	Key      Key
	At       time.Time
	Portions float64
	Pinned   bool
}

// DependantsToUnpin returns the Pinned dependants that no longer fit when only
// available portions remain (0 when the source was skipped or replaced). Dependants are served in order of At
// (then Meal Slot id); each takes its Portions if enough remain, otherwise it is a misfit and takes nothing, so a later,
// smaller one may still fit. Unpinned misfits are not listed: the planner replans them by itself.
func DependantsToUnpin(available float64, deps []Dependant) []Key {
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
		if d.Portions <= remaining+eps {
			remaining -= d.Portions
			continue
		}
		if d.Pinned {
			out = append(out, d.Key)
		}
	}
	return out
}

// ExpiredLeftovers are the available Leftovers with Portions > 0 whose Use-by is before today (spec §8: discarded
// automatically, counted as waste). A Leftover is still good on its Use-by date.
func ExpiredLeftovers(ls []Leftover, today string) []Leftover {
	var out []Leftover
	for _, l := range ls {
		if l.Status == LeftoverAvailable && l.Portions > 0 && l.UseBy < today {
			out = append(out, l)
		}
	}
	return out
}

// Timed is a Planned Meal with its slot instant.
type Timed struct {
	Meal Meal
	At   time.Time
}

// ToConfirm lists the Planned Meals still in State planned (Pinned or not) whose slot time is at least
// ConfirmAfter in the past, oldest first (ties by Meal Slot id). Cooked and skipped meals never appear.
func ToConfirm(items []Timed, now time.Time) []Timed {
	var out []Timed
	for _, it := range items {
		if it.Meal.State == StatePlanned && now.Sub(it.At) >= ConfirmAfter {
			out = append(out, it)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if !out[i].At.Equal(out[j].At) {
			return out[i].At.Before(out[j].At)
		}
		return out[i].Meal.Key.MealSlotID < out[j].Meal.Key.MealSlotID
	})
	return out
}

// ErrFutureMeal: a Planned Meal whose slot date is after today cannot be marked Cooked or Not cooked (409 future_meal).
var ErrFutureMeal = errors.New("plan: the Planned Meal is in the future")

// MayResolve reports whether a Planned Meal on date (YYYY-MM-DD) may be marked Cooked or Not cooked on today
// (household date): its date is today or earlier. Unparseable dates are false.
// STUB (red tests): the Developer implements it.
func MayResolve(date, today string) bool { return true }

// PruneStaleLeftoverChips returns copies of the meals whose stored "leftover_fits" chips are stale: a chip dated D is
// stale unless some meal on D is served from this meal (Meal.From.From == its Key) and is not skipped. Only changed
// meals are returned, with the stale chips removed and every other chip kept in order.
// STUB (red tests): the Developer implements it.
func PruneStaleLeftoverChips(meals []Meal) []Meal { return nil }

// LeftoverPlannedFor lists the Keys of the meals served from the Leftover made at src (Meal.From.From == src), not
// skipped, in date then Meal Slot id order: where the Leftover went (B13).
// STUB (red tests): the Developer implements it.
func LeftoverPlannedFor(src Key, meals []Meal) []Key { return nil }
