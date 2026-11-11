package notify_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/notify"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

// Reminders for Courses (spec §12, docs/dev/design/crs-g1.md): Advance Step per Course with the Course in its
// key; Start cooking and Confirm Cooked once per slot. curry (course 5, slot 3, 45 min Active + a 4 h Advance
// Step with id 11) comes from compute_test.go. The slot is 2026-11-09 19:30 Rome (18:30Z).

func soup(loc *time.Location) notify.MealFact {
	return notify.MealFact{
		Date: "2026-11-09", MealSlotID: 3, CourseID: 6, RecipeName: "Tomato soup",
		SlotAt: slot1930(loc), State: notify.MealPlanned,
		Steps: []schedule.Step{{Kind: schedule.Active, DurationMinutes: 10}},
	}
}

func beans(loc *time.Location) notify.MealFact {
	m := soup(loc)
	m.CourseID, m.RecipeName = 7, "Green beans"
	m.Steps = []schedule.Step{{Kind: schedule.Active, DurationMinutes: 5}}
	return m
}

func compute(rome *time.Location, meals ...notify.MealFact) []notify.Candidate {
	return notify.Compute(notify.Facts{Meals: meals}, rome)
}

func TestKeysOfAOneCourseSlotAreTheStoredFormats(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	cs := compute(rome, curry(rome))
	want := map[notify.Type]string{
		// Advance Step gains the Course; the other two stay keyed by slot (migration 1410 only rewrites Advance Step keys).
		notify.AdvanceStep:   "advanceStep:2026-11-09/3/5/11@2026-11-09T14:30:00Z",
		notify.StartCooking:  "startCooking:2026-11-09/3@2026-11-09T17:45:00Z",
		notify.ConfirmCooked: "confirmCooked:2026-11-09/3@2026-11-09T20:30:00Z",
	}
	for typ, key := range want {
		if got := only(t, cs, typ).Key; got != key {
			t.Errorf("%s key = %q, want %q", typ, got, key)
		}
	}
}

func TestEachCourseHasItsOwnAdvanceStepReminder(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	roast := soup(rome)
	roast.RecipeName = "Roast"
	roast.Steps = []schedule.Step{{Kind: schedule.Advance, LeadTimeMinutes: 240}, {Kind: schedule.Active, DurationMinutes: 10}}
	// Both Recipes carry an Advance Step whose index is 0: only the Course tells the two reminders apart.
	roast.AdvanceSteps = []notify.AdvanceStepFact{{ID: 0, Description: "Brine the roast", Lead: 4 * time.Hour}}
	other := curry(rome)
	other.AdvanceSteps = []notify.AdvanceStepFact{{ID: 0, Description: "Marinate the chicken", Lead: 4 * time.Hour}}
	got := byType(compute(rome, other, roast), notify.AdvanceStep)
	if len(got) != 2 {
		t.Fatalf("want one Advance Step reminder per Course, got %+v", got)
	}
	keys := map[string]bool{}
	for _, c := range got {
		keys[c.Key] = true
	}
	for _, k := range []string{"advanceStep:2026-11-09/3/5/0@2026-11-09T14:30:00Z", "advanceStep:2026-11-09/3/6/0@2026-11-09T14:30:00Z"} {
		if !keys[k] {
			t.Errorf("missing key %q in %v", k, keys)
		}
	}
}

func TestAPlannedMealAlreadyRemindedBeforeThe1410UpgradeIsNotRemindedAgain(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	// Migration 1410 turns the stored 'advanceStep:2026-11-09/3/11@...' into the key below (Course 5 is the
	// main Course). The new code must compute exactly that key, so the sent-set still matches.
	migrated := "advanceStep:2026-11-09/3/5/11@2026-11-09T14:30:00Z"
	sent := &fakeSent{claimed: map[string]bool{string(rune(phone.ID)) + "|" + migrated: true}}
	subs := &fakeSubs{byType: map[notify.Type][]notify.Target{notify.AdvanceStep: {phone}}}
	sender := &fakeSender{errs: map[int64]error{}}
	d := notify.NewDispatcher(notify.Config{
		Clock: clock.NewFake(utc(2026, 11, 9, 14, 40, 0)), Facts: &fakeFacts{facts: notify.Facts{Meals: []notify.MealFact{curry(rome)}}},
		Settings: fakeSettings{night, rome}, Subs: subs, Sent: sent, Sender: sender,
	})
	if n, err := d.Tick(context.Background()); err != nil || n != 0 {
		t.Fatalf("Tick = %d, %v; want nothing sent again", n, err)
	}
}

func TestASlotWithSeveralFreshCoursesHasOneStartCookingAtTheStartOfItsTimeline(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	// Active work cannot overlap: 45 min of curry then 10 min of soup before it = a 55 min timeline, soup first.
	cs := compute(rome, curry(rome), soup(rome))
	c := only(t, cs, notify.StartCooking)
	if want := time.Date(2026, 11, 9, 18, 35, 0, 0, rome); !c.At.Equal(want) {
		t.Errorf("At = %s, want %s (slot time minus the 55 min timeline)", c.At, want)
	}
	if c.Body != "Start cooking now for 19:30: Tomato soup first" {
		t.Errorf("Body = %q", c.Body)
	}
	if c.Key != "startCooking:2026-11-09/3@2026-11-09T17:35:00Z" {
		t.Errorf("Key = %q", c.Key)
	}
}

func TestTheTimelineTotalIsNotTheSumWhenACourseIsPassive(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	stew := curry(rome)
	stew.Steps = []schedule.Step{{Kind: schedule.Passive, DurationMinutes: 60}}
	stew.AdvanceSteps = nil
	side := soup(rome)
	side.Steps = []schedule.Step{{Kind: schedule.Active, DurationMinutes: 20}}
	c := only(t, compute(rome, stew, side), notify.StartCooking)
	if want := time.Date(2026, 11, 9, 18, 30, 0, 0, rome); !c.At.Equal(want) {
		t.Errorf("At = %s, want %s (the 60 min simmer holds the 20 min of work)", c.At, want)
	}
	if c.Body != "Start cooking now for 19:30: Chicken curry first" {
		t.Errorf("Body = %q", c.Body)
	}
}

func TestACourseServedFromALeftoverReheatsOnTheTimeline(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	left := soup(rome)
	left.FromLeftover, left.Steps, left.ReheatSeconds = true, nil, 5*60
	c := only(t, compute(rome, curry(rome), left), notify.StartCooking)
	if want := time.Date(2026, 11, 9, 18, 45, 0, 0, rome); !c.At.Equal(want) {
		t.Errorf("At = %s, want %s (the passive Reheat fits inside the curry's 45 min)", c.At, want)
	}
	if c.Body != "Start cooking now for 19:30: Chicken curry first" {
		t.Errorf("Body = %q", c.Body)
	}
}

func TestASlotWithNothingFreshHasNoStartCooking(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	left := curry(rome)
	left.FromLeftover, left.Steps, left.ReheatSeconds = true, nil, 5*60
	other := soup(rome)
	other.FromLeftover, other.Steps, other.ReheatSeconds = true, nil, 0
	cs := compute(rome, left, other)
	if got := byType(cs, notify.StartCooking); len(got) != 0 {
		t.Errorf("want no Start cooking when every Course is a Leftover, got %+v", got)
	}
	only(t, cs, notify.ConfirmCooked) // still confirmed, once
}

func TestACookedCourseIsLeftOutOfTheTimelineAndTheReminders(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	done := soup(rome)
	done.State = "cooked"
	cs := compute(rome, curry(rome), done)
	c := only(t, cs, notify.StartCooking)
	if want := time.Date(2026, 11, 9, 18, 45, 0, 0, rome); !c.At.Equal(want) {
		t.Errorf("At = %s, want %s (only the curry is still to cook)", c.At, want)
	}
	if c.Body != "Start cooking Chicken curry now to eat at 19:30" {
		t.Errorf("Body = %q (a slot with one Course still to cook keeps the one-Course wording)", c.Body)
	}
	if body := only(t, cs, notify.ConfirmCooked).Body; body != "Did you cook Chicken curry?" {
		t.Errorf("Confirm Cooked Body = %q, want only the unconfirmed Recipe", body)
	}
}

func TestAnUnplaceableTimelineSkipsOnlyStartCooking(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	bad := soup(rome)
	bad.Steps = []schedule.Step{{Kind: schedule.Passive}} // a Passive Step needs a duration
	cs := compute(rome, curry(rome), bad)
	if got := byType(cs, notify.StartCooking); len(got) != 0 {
		t.Errorf("want no Start cooking for a slot cook.Timeline refuses, got %+v", got)
	}
	only(t, cs, notify.AdvanceStep)
	only(t, cs, notify.ConfirmCooked)
}

func TestSlotsAreRemindedIndependently(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	lunch := soup(rome)
	lunch.MealSlotID, lunch.SlotAt = 2, time.Date(2026, 11, 9, 12, 30, 0, 0, rome)
	cs := compute(rome, curry(rome), soup(rome), lunch)
	if got := byType(cs, notify.StartCooking); len(got) != 2 {
		t.Errorf("want a Start cooking for each of the two slots, got %+v", got)
	}
	if got := byType(cs, notify.ConfirmCooked); len(got) != 2 {
		t.Errorf("want a Confirm Cooked for each of the two slots, got %+v", got)
	}
}

func TestConfirmCookedIsOnePerSlotAndNamesTheRecipes(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	two := only(t, compute(rome, curry(rome), soup(rome)), notify.ConfirmCooked)
	if two.Body != "Did you cook Chicken curry and Tomato soup?" {
		t.Errorf("two Courses: Body = %q", two.Body)
	}
	if want := time.Date(2026, 11, 9, 21, 30, 0, 0, rome); !two.At.Equal(want) {
		t.Errorf("At = %s, want %s", two.At, want)
	}
	three := only(t, compute(rome, curry(rome), soup(rome), beans(rome)), notify.ConfirmCooked)
	if three.Body != "Did you cook Chicken curry, Tomato soup and Green beans?" {
		t.Errorf("three Courses: Body = %q", three.Body)
	}
	if !strings.HasPrefix(three.Key, "confirmCooked:2026-11-09/3@") {
		t.Errorf("Key = %q, want the slot key", three.Key)
	}
}

func TestConfirmCookedStopsWhenEveryCourseIsConfirmed(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	a, b := curry(rome), soup(rome)
	a.State, b.State = "cooked", "skipped"
	if cs := compute(rome, a, b); len(cs) != 0 {
		t.Errorf("want nothing for a resolved slot, got %+v", cs)
	}
}
