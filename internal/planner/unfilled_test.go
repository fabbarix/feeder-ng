package planner

import (
	"testing"
	"time"
)

func TestUnfilledSlots(t *testing.T) {
	t.Run("every option excluded", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2))
		in = prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{1, 2}})
		u := unfilledAt(t, mustPlan(t, in), key(0))
		if u.Reason != UnfilledNoCandidates || u.SlotRuleClaimed {
			t.Errorf("got %+v", u)
		}
		if want := (Eliminations{Considered: 2, Exclusion: 2}); u.Eliminated != want {
			t.Errorf("eliminations = %+v, want %+v", u.Eliminated, want)
		}
	})
	t.Run("a mix of filters, each candidate counted once by the first filter that removed it", func(t *testing.T) {
		pinned := withExisting(dinner(1), ExistingMeal{State: MealPinned, RecipeID: 6, Batches: 1})
		in := baseInput([]Slot{dinner(0), pinned},
			rcp(1, 2),                            // Exclusion (and also in cool-down: counted as Exclusion)
			rcp(2, 2),                            // cool-down
			rcp(3, 2, tags("fish")),              // Variety Rule
			rcp(4, 2, lead(48*time.Hour)),        // Advance Step
			rcp(5, 2, archived()),                // archived: not considered at all
			rcp(6, 2, tags("fish"), cooldown(0))) // Variety Rule (pinned fish meal on day 1)
		in = prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{1}})
		in.LastPlanned = map[RecipeID]Date{1: day(-1), 2: day(-1)}
		in.VarietyRules = []VarietyRule{{Tag: "fish", MaxPerWeek: 1}}
		u := unfilledAt(t, mustPlan(t, in), key(0))
		want := Eliminations{Considered: 5, Exclusion: 1, CoolDown: 1, VarietyRule: 2, AdvanceStep: 1}
		if u.Eliminated != want {
			t.Errorf("eliminations = %+v, want %+v", u.Eliminated, want)
		}
	})
	t.Run("no Recipes at all", func(t *testing.T) {
		u := unfilledAt(t, mustPlan(t, baseInput([]Slot{dinner(0)})), key(0))
		if u.Reason != UnfilledNoCandidates || u.Eliminated != (Eliminations{}) {
			t.Errorf("got %+v", u)
		}
	})
	t.Run("only archived Recipes", func(t *testing.T) {
		u := unfilledAt(t, mustPlan(t, baseInput([]Slot{dinner(0)}, rcp(1, 2, archived()))), key(0))
		if u.Reason != UnfilledNoCandidates || u.Eliminated.Considered != 0 {
			t.Errorf("got %+v", u)
		}
	})
	t.Run("a Slot Rule that names nothing plannable", func(t *testing.T) {
		in := baseInput([]Slot{withRules(dinner(0), SlotRule{Tag: "sushi"})}, rcp(1, 2))
		u := unfilledAt(t, mustPlan(t, in), key(0))
		if !u.SlotRuleClaimed || u.Eliminated.Considered != 0 {
			t.Errorf("got %+v", u)
		}
	})
	t.Run("no one attends", func(t *testing.T) {
		s := dinner(0)
		s.Attendance = []Attendee{}
		in := baseInput([]Slot{s}, rcp(1, 2))
		in.Leftovers = []Leftover{leftoverOf(7, 1, 2, day(3))}
		u := unfilledAt(t, mustPlan(t, in), key(0))
		if u.Reason != UnfilledNoAttendance {
			t.Errorf("got %+v", u)
		}
	})
	t.Run("zero Portion Factors need nothing either", func(t *testing.T) {
		s := dinner(0, Attendee{anna, 0})
		u := unfilledAt(t, mustPlan(t, baseInput([]Slot{s}, rcp(1, 2))), key(0))
		if u.Reason != UnfilledNoAttendance {
			t.Errorf("got %+v", u)
		}
	})
	t.Run("an unfilled slot does not stop later slots", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0), dinner(1)}, rcp(1, 2, lead(48*time.Hour)), rcp(2, 2, lead(30*time.Hour)))
		r := mustPlan(t, in)
		// Day 0: both lead times have passed. Day 1: 30 h before 19:30 is day 0 13:30, still ahead of now (08:00).
		unfilledAt(t, r, key(0))
		if p := placementAt(t, r, key(1)); p.RecipeID != 2 {
			t.Errorf("day 1 = %+v", p)
		}
	})
}
