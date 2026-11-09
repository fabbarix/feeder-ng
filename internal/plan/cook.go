package plan

import "time"

// ProposedLeftover is the Leftover portions the Mark as Cooked sheet proposes:
// batches x yield - portions needed, never negative (and 0 for rounding noise below 1e-9).
func ProposedLeftover(batches, yield, portionsNeeded float64) float64 {
	return -1
}

// CheckLeftoverPortions validates the User's edited portions: finite, >= 0 and
// at most max (batches x yield). ErrInvalidLeftover otherwise.
func CheckLeftoverPortions(portions, max float64) error {
	return errNotImplemented
}

// LeftoverUseBy is cookedOn plus the Recipe's Use-by days (recipeDays, when set; 0 = same day) or the
// Household default.
func LeftoverUseBy(cookedOn string, recipeDays *int, defaultDays int) string {
	return ""
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
	return nil
}

// ExpiredLeftovers are the available Leftovers with Portions > 0 whose Use-by is before today (spec §8: discarded
// automatically, counted as waste). A Leftover is still good on its Use-by date.
func ExpiredLeftovers(ls []Leftover, today string) []Leftover {
	return nil
}

// Timed is a Planned Meal with its slot instant.
type Timed struct {
	Meal Meal
	At   time.Time
}

// ToConfirm lists the Planned Meals still in State planned (Pinned or not) whose slot time is at least
// ConfirmAfter in the past, oldest first (ties by Meal Slot id). Cooked and skipped meals never appear.
func ToConfirm(items []Timed, now time.Time) []Timed {
	return nil
}
