package notify_test

import (
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/notify"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

// A2 (B9-58): a meal that has to be started on an earlier day gets its Start cooking at that start, on the day before.
// Compute already places Start cooking at the slot time less the timeline total whatever day that is, so the first
// tests pin the behaviour that must stay; the wording test is the change. Slot: Tuesday 2026-11-10 07:00 Rome (06:00Z),
// a 10 h Recipe, so the start is Monday 21:00 Rome (20:00Z). The URL stays the meal's own date.

func stew(loc *time.Location) notify.MealFact {
	return notify.MealFact{
		Date: "2026-11-10", MealSlotID: 3, CourseID: 5, RecipeName: "Slow stew",
		SlotAt: time.Date(2026, 11, 10, 7, 0, 0, 0, loc), State: notify.MealPlanned,
		Steps: []schedule.Step{{Kind: schedule.Active, DurationMinutes: 600}},
	}
}

func TestStartCookingForAnOvernightMealFiresTheDayBeforeAtItsStart(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	c := only(t, compute(rome, stew(rome)), notify.StartCooking)
	if want := time.Date(2026, 11, 9, 21, 0, 0, 0, rome); !c.At.Equal(want) {
		t.Errorf("At = %s, want %s (the day before the meal)", c.At, want)
	}
	if c.URL != "/cook/meal/2026-11-10/3" {
		t.Errorf("URL = %q, want the meal's own date /cook/meal/2026-11-10/3", c.URL)
	}
	if want := "startCooking:2026-11-10/3@2026-11-09T20:00:00Z"; c.Key != want {
		t.Errorf("Key = %q, want %q (keyed by the meal, stamped with the start)", c.Key, want)
	}
}

func TestStartCookingForAnOvernightMealSaysTheMealIsTomorrow(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	c := only(t, compute(rome, stew(rome)), notify.StartCooking)
	if want := "Start cooking Slow stew now to eat tomorrow at 07:00"; c.Body != want {
		t.Errorf("Body = %q, want %q", c.Body, want)
	}
	// A meal the same day keeps today's wording.
	same := stew(rome)
	same.Steps = []schedule.Step{{Kind: schedule.Active, DurationMinutes: 30}}
	if got := only(t, compute(rome, same), notify.StartCooking).Body; got != "Start cooking Slow stew now to eat at 07:00" {
		t.Errorf("same-day Body = %q", got)
	}
}

func TestStartCookingForSeveralCoursesOfAnOvernightMealSaysTomorrowToo(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	side := stew(rome)
	side.CourseID, side.RecipeName = 6, "Rice"
	side.Steps = []schedule.Step{{Kind: schedule.Active, DurationMinutes: 20}}
	c := only(t, compute(rome, stew(rome), side), notify.StartCooking)
	if !strings.Contains(c.Body, "tomorrow") || !strings.Contains(c.Body, "07:00") {
		t.Errorf("Body = %q, want it to say tomorrow and 07:00", c.Body)
	}
}

func TestAnOvernightMealsStartCookingIsDueTheEveningBefore(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	cs := compute(rome, stew(rome))
	quiet := household.QuietHours{Start: "22:00", End: "07:00"}
	at := time.Date(2026, 11, 9, 21, 0, 30, 0, rome)
	var got []notify.Candidate
	for _, d := range notify.DueNow(cs, at, quiet, rome) {
		if d.Type == notify.StartCooking {
			got = append(got, d.Candidate)
		}
	}
	if len(got) != 1 {
		t.Errorf("due at Monday 21:00:30 = %+v, want the one Start cooking", got)
	}
}
