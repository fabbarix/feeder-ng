package plan_test

import (
	"errors"
	"math"
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
)

func TestProposedLeftover(t *testing.T) {
	cases := []struct{ batches, yield, need, want float64 }{
		{1, 4, 2.5, 1.5}, // one Batch of 4, 2.5 eaten
		{2, 4, 6.5, 1.5}, // two Batches
		{1, 4, 4, 0},     // exactly enough
		{1, 4, 5, 0},     // short: never negative
		{1.5, 4, 4, 2},   // a fractional Batch count
		{3, 0.1, 0.3, 0}, // rounding noise below 1e-9 is 0
		{1, 0.3, 0.1, 0.2},
	}
	for _, c := range cases {
		if got := plan.ProposedLeftover(c.batches, c.yield, c.need); math.Abs(got-c.want) > 1e-9 {
			t.Errorf("ProposedLeftover(%v, %v, %v) = %v, want %v", c.batches, c.yield, c.need, got, c.want)
		}
	}
}

func TestCheckLeftoverPortions(t *testing.T) {
	for _, ok := range []float64{0, 0.5, 1.5, 4} {
		if err := plan.CheckLeftoverPortions(ok, 4); err != nil {
			t.Errorf("CheckLeftoverPortions(%v, 4) = %v, want nil", ok, err)
		}
	}
	for _, bad := range []float64{-0.5, 4.5, math.NaN(), math.Inf(1)} {
		if err := plan.CheckLeftoverPortions(bad, 4); !errors.Is(err, plan.ErrInvalidLeftover) {
			t.Errorf("CheckLeftoverPortions(%v, 4) = %v, want ErrInvalidLeftover", bad, err)
		}
	}
}

func TestLeftoverUseBy(t *testing.T) {
	two, zero := 2, 0
	cases := []struct {
		cookedOn string
		recipe   *int
		def      int
		want     string
	}{
		{"2026-11-09", nil, 3, "2026-11-12"},   // Household default
		{"2026-11-09", &two, 3, "2026-11-11"},  // Recipe override
		{"2026-11-09", &zero, 3, "2026-11-09"}, // 0 means same day, not "unset"
		{"2026-11-29", nil, 3, "2026-12-02"},   // crosses a month
	}
	for _, c := range cases {
		if got := plan.LeftoverUseBy(c.cookedOn, c.recipe, c.def); got != c.want {
			t.Errorf("LeftoverUseBy(%s, %v, %d) = %s, want %s", c.cookedOn, c.recipe, c.def, got, c.want)
		}
	}
}

func dep(date string, slot int64, hour int, portions float64, pinned bool) plan.Dependant {
	return plan.Dependant{Key: k(date, slot), At: time.Date(2026, 11, 9, hour, 0, 0, 0, time.UTC).AddDate(0, 0, mustDay(date)), Portions: portions, Pinned: pinned}
}

// mustDay is the day offset of date from 2026-11-09.
func mustDay(date string) int {
	d, _ := time.Parse("2006-01-02", date)
	return int(d.Sub(time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC)).Hours() / 24)
}

func TestDependantsToUnpin(t *testing.T) {
	t.Run("a smaller actual Leftover unpins the Pinned dependants that no longer fit", func(t *testing.T) {
		deps := []plan.Dependant{dep("2026-11-10", 1, 19, 2, true), dep("2026-11-11", 1, 19, 2, true), dep("2026-11-12", 1, 19, 2, true)}
		if got, want := plan.DependantsToUnpin(4, deps), []plan.Key{k("2026-11-12", 1)}; !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v (4 portions feed the first two; the third is short)", got, want)
		}
	})
	t.Run("a skipped or replaced source leaves nothing", func(t *testing.T) {
		deps := []plan.Dependant{dep("2026-11-10", 1, 19, 2, true), dep("2026-11-11", 1, 19, 2, true)}
		if got, want := plan.DependantsToUnpin(0, deps), []plan.Key{k("2026-11-10", 1), k("2026-11-11", 1)}; !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
	t.Run("unpinned dependants are left to the planner", func(t *testing.T) {
		deps := []plan.Dependant{dep("2026-11-10", 1, 19, 2, false), dep("2026-11-11", 1, 19, 2, true)}
		if got := plan.DependantsToUnpin(2, deps); len(got) != 1 || got[0] != k("2026-11-11", 1) {
			t.Errorf("got %v, want only the Pinned misfit 2026-11-11", got)
		}
	})
	t.Run("a misfit takes nothing so a later smaller dependant can still fit", func(t *testing.T) {
		deps := []plan.Dependant{dep("2026-11-10", 1, 19, 3, true), dep("2026-11-11", 1, 19, 1, true)}
		if got, want := plan.DependantsToUnpin(2, deps), []plan.Key{k("2026-11-10", 1)}; !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
	t.Run("order is by time then Meal Slot id, whatever the input order", func(t *testing.T) {
		deps := []plan.Dependant{dep("2026-11-11", 1, 19, 2, true), dep("2026-11-10", 1, 19, 2, true)}
		if got, want := plan.DependantsToUnpin(2, deps), []plan.Key{k("2026-11-11", 1)}; !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v (the earlier dependant is served first)", got, want)
		}
	})
	t.Run("everything fits", func(t *testing.T) {
		if got := plan.DependantsToUnpin(10, []plan.Dependant{dep("2026-11-10", 1, 19, 2, true)}); len(got) != 0 {
			t.Errorf("got %v, want none", got)
		}
	})
}

func timed(date string, slot int64, h, m int, state plan.State, pinned bool) plan.Timed {
	return plan.Timed{
		Meal: plan.Meal{Key: k(date, slot), State: state, Pinned: pinned},
		At:   time.Date(2026, 11, 9, h, m, 0, 0, time.UTC),
	}
}

func TestToConfirmListsUnconfirmedMealsTwoHoursAfterTheSlotTime(t *testing.T) {
	now := time.Date(2026, 11, 9, 21, 0, 0, 0, time.UTC)
	items := []plan.Timed{
		timed("2026-11-09", 3, 19, 0, plan.StatePlanned, false), // exactly 2 h ago: listed
		timed("2026-11-09", 1, 12, 30, plan.StatePlanned, true), // pinned but not confirmed as prepared: listed, oldest first
		timed("2026-11-09", 4, 19, 1, plan.StatePlanned, false), // 1 h 59 min ago: not yet
		timed("2026-11-09", 5, 12, 0, plan.StateCooked, true),   // already Cooked
		timed("2026-11-09", 6, 12, 0, plan.StateSkipped, false), // already skipped
		timed("2026-11-09", 7, 22, 0, plan.StatePlanned, false), // in the future
	}
	got := plan.ToConfirm(items, now)
	var keys []plan.Key
	for _, g := range got {
		keys = append(keys, g.Meal.Key)
	}
	if want := []plan.Key{k("2026-11-09", 1), k("2026-11-09", 3)}; !reflect.DeepEqual(keys, want) {
		t.Errorf("ToConfirm = %v, want %v", keys, want)
	}
}

// ---- R4 (QA round 2) ----

func TestMayResolveIsTrueFromTheMealsDateOn(t *testing.T) {
	for _, tc := range []struct {
		date, today string
		want        bool
	}{
		{"2026-11-08", "2026-11-09", true},
		{"2026-11-09", "2026-11-09", true},
		{"2026-11-10", "2026-11-09", false},
		{"2027-01-01", "2026-12-31", false},
		{"bad", "2026-11-09", false},
	} {
		if got := plan.MayResolve(tc.date, tc.today); got != tc.want {
			t.Errorf("MayResolve(%q, %q) = %v, want %v", tc.date, tc.today, got, tc.want)
		}
	}
	if !errors.Is(plan.ErrFutureMeal, plan.ErrFutureMeal) || plan.ErrFutureMeal.Error() == "" {
		t.Error("ErrFutureMeal must be a real sentinel error")
	}
}

func mealOn(date string, slot int64, from *plan.Key, why ...plan.Why) plan.Meal {
	m := plan.Meal{Key: k(date, slot), State: plan.StatePlanned, Why: why}
	if from != nil {
		m.From = &plan.Source{From: *from}
	}
	return m
}

func TestPruneStaleLeftoverChipsDropsChipsWhoseDependantIsGone(t *testing.T) {
	src := k("2026-11-09", 1)
	fits := func(date string) plan.Why { return plan.Why{Code: "leftover_fits", Value: 1, Date: date} }
	other := plan.Why{Code: "favourite", MemberIDs: []int64{1}}
	t.Run("the dependant was replanned fresh", func(t *testing.T) {
		meals := []plan.Meal{mealOn("2026-11-09", 1, nil, fits("2026-11-10"), other), mealOn("2026-11-10", 1, nil)}
		got := plan.PruneStaleLeftoverChips(meals)
		if len(got) != 1 || got[0].Key != src || !reflect.DeepEqual(got[0].Why, []plan.Why{other}) {
			t.Errorf("got %+v; want only the source meal, keeping its other chips", got)
		}
	})
	t.Run("the dependant still exists", func(t *testing.T) {
		meals := []plan.Meal{mealOn("2026-11-09", 1, nil, fits("2026-11-10")), mealOn("2026-11-10", 1, &src)}
		if got := plan.PruneStaleLeftoverChips(meals); len(got) != 0 {
			t.Errorf("got %+v; nothing is stale", got)
		}
	})
	t.Run("the dependant was cooked, so the chip stays (it did serve them)", func(t *testing.T) {
		dep := mealOn("2026-11-10", 1, &src)
		dep.State = plan.StateCooked
		if got := plan.PruneStaleLeftoverChips([]plan.Meal{mealOn("2026-11-09", 1, nil, fits("2026-11-10")), dep}); len(got) != 0 {
			t.Errorf("got %+v", got)
		}
	})
	t.Run("no dependant row at all (the slot is empty)", func(t *testing.T) {
		got := plan.PruneStaleLeftoverChips([]plan.Meal{mealOn("2026-11-09", 1, nil, fits("2026-11-10"))})
		if len(got) != 1 || len(got[0].Why) != 0 {
			t.Errorf("got %+v; the chip must go", got)
		}
	})
	t.Run("a chip dated for a day served from another meal is stale too", func(t *testing.T) {
		elsewhere := k("2026-11-08", 1)
		meals := []plan.Meal{mealOn("2026-11-09", 1, nil, fits("2026-11-10")), mealOn("2026-11-10", 1, &elsewhere)}
		if got := plan.PruneStaleLeftoverChips(meals); len(got) != 1 {
			t.Errorf("got %+v; Tuesday is served from Sunday's meal, not Monday's", got)
		}
	})
}

func TestLeftoverPlannedForListsTheMealsServedFromItInDateOrder(t *testing.T) {
	src := k("2026-11-09", 1)
	other := k("2026-11-08", 1)
	meals := []plan.Meal{
		mealOn("2026-11-12", 1, &src), mealOn("2026-11-10", 1, &src), mealOn("2026-11-11", 1, &other),
		mealOn("2026-11-13", 1, &src),
	}
	meals[3].State = plan.StateSkipped
	got := plan.LeftoverPlannedFor(src, meals)
	if want := []plan.Key{k("2026-11-10", 1), k("2026-11-12", 1)}; !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v (skipped and other-source meals are not listed)", got, want)
	}
	if got := plan.LeftoverPlannedFor(k("2026-11-20", 1), meals); len(got) != 0 {
		t.Errorf("got %v, want none", got)
	}
}
