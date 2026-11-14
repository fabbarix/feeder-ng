package notify_test

import (
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/notify"
	"github.com/fabbarix/feeder-ng/internal/planner"
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

// Ruling 3 (B9-58): Start cooking is never deferred by the notification quiet hours; other kinds keep theirs.
func TestStartCookingIsNeverDeferredByTheQuietHours(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	quiet := household.QuietHours{Start: "21:00", End: "07:00"} // Monday 21:00 is inside the window
	cs := compute(rome, stew(rome))
	at := time.Date(2026, 11, 9, 21, 0, 30, 0, rome)
	var start []notify.Due
	for _, d := range notify.DueNow(cs, at, quiet, rome) {
		if d.Type == notify.StartCooking {
			start = append(start, d)
		}
	}
	if len(start) != 1 || !start[0].SendAt.Equal(time.Date(2026, 11, 9, 21, 0, 0, 0, rome)) {
		t.Errorf("due at Monday 21:00:30 inside quiet hours = %+v, want Start cooking sent at 21:00", start)
	}
	// Another kind at the same instant is still deferred to the end of the quiet hours.
	adv := notify.Candidate{Key: "advanceStep:x", Type: notify.AdvanceStep, At: time.Date(2026, 11, 9, 21, 0, 0, 0, rome)}
	if got := notify.DueNow([]notify.Candidate{adv}, at, quiet, rome); len(got) != 0 {
		t.Errorf("an Advance Step inside quiet hours = %+v, want it deferred", got)
	}
	if got := notify.DueNow([]notify.Candidate{adv}, time.Date(2026, 11, 10, 7, 0, 30, 0, rome), quiet, rome); len(got) != 1 {
		t.Errorf("the Advance Step at 07:00:30 = %+v, want it sent at the end of the quiet hours", got)
	}
}

func TestStartCookingForSeveralCoursesOfAnOvernightMealSaysForTomorrowAt(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	side := stew(rome)
	side.CourseID, side.RecipeName = 6, "Rice"
	side.Steps = []schedule.Step{{Kind: schedule.Active, DurationMinutes: 20}}
	c := only(t, compute(rome, stew(rome), side), notify.StartCooking)
	if want := "Start cooking now for tomorrow at 07:00: Rice first"; c.Body != want {
		t.Errorf("Body = %q, want %q", c.Body, want)
	}
}

func TestStartCookingTwoOrMoreDaysAheadNamesTheWeekday(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	long := stew(rome)
	long.Steps = []schedule.Step{{Kind: schedule.Active, DurationMinutes: 36 * 60}} // Sunday 19:00 for Tuesday 07:00
	c := only(t, compute(rome, long), notify.StartCooking)
	if want := time.Date(2026, 11, 8, 19, 0, 0, 0, rome); !c.At.Equal(want) {
		t.Errorf("At = %s, want %s", c.At, want)
	}
	if want := "Start cooking Slow stew now to eat on Tuesday at 07:00"; c.Body != want {
		t.Errorf("Body = %q, want %q", c.Body, want)
	}
	side := stew(rome)
	side.CourseID, side.RecipeName = 6, "Rice"
	side.Steps = []schedule.Step{{Kind: schedule.Active, DurationMinutes: 20}}
	if got := only(t, compute(rome, long, side), notify.StartCooking).Body; got != "Start cooking now for Tuesday at 07:00: Rice first" {
		t.Errorf("several Courses Body = %q", got)
	}
}

// One source of truth for "when does cooking start" (B9-58 review): the planner's start window and the Plan's
// meal.startsAt read the Recipe's total time (schedule.Compute of its Steps, stored as total_minutes) through
// planner.CookingStart; Start cooking reads cook.Timeline of the same Steps. For a slot with one fresh Course the two
// are the same instant, so the notification fires at the start the chip shows, whatever the day, zone or DST change.
// (With several Courses the timeline may start earlier than any one Course: the notification is per slot.)
func TestStartCookingOfOneCourseFiresAtThePlannersCookingStart(t *testing.T) {
	steps := map[string][]schedule.Step{
		"one Active Step, same day":          {{Kind: schedule.Active, DurationMinutes: 30}},
		"slow cooker: long Passive Step":     {{Kind: schedule.Active, DurationMinutes: 20}, {Kind: schedule.Passive, DurationMinutes: 600}, {Kind: schedule.Active, DurationMinutes: 10}},
		"Passive Step shorter than the next": {{Kind: schedule.Passive, DurationMinutes: 900}, {Kind: schedule.Active, DurationMinutes: 960}},
		"over two days":                      {{Kind: schedule.Passive, DurationMinutes: 48 * 60}},
	}
	slots := map[string]func(*time.Location) time.Time{
		"Tuesday 07:00":                 func(l *time.Location) time.Time { return time.Date(2026, 11, 10, 7, 0, 0, 0, l) },
		"end of DST, Sunday 07:00":      func(l *time.Location) time.Time { return time.Date(2026, 10, 25, 7, 0, 0, 0, l) },
		"start of DST, Sunday 08:00":    func(l *time.Location) time.Time { return time.Date(2026, 3, 29, 8, 0, 0, 0, l) },
		"US end of DST, Sunday 12:30":   func(l *time.Location) time.Time { return time.Date(2026, 11, 1, 12, 30, 0, 0, l) },
		"US start of DST, Sunday 12:30": func(l *time.Location) time.Time { return time.Date(2026, 3, 8, 12, 30, 0, 0, l) },
	}
	for _, zn := range []string{"Europe/Rome", "America/Los_Angeles", "Asia/Tokyo"} {
		loc := zone(t, zn)
		for sn, slot := range slots {
			for name, st := range steps {
				sc, err := schedule.Compute(st)
				if err != nil {
					t.Fatal(err)
				}
				m := stew(loc)
				m.SlotAt, m.Steps = slot(loc), st
				m.Date = m.SlotAt.Format("2006-01-02")
				c := only(t, compute(loc, m), notify.StartCooking)
				want, _ := planner.CookingStart(m.SlotAt, sc.TotalMinutes)
				if !c.At.Equal(want) {
					t.Errorf("%s, %s, %s: Start cooking at %s, the planner's start %s", zn, sn, name, c.At.In(loc), want.In(loc))
				}
			}
		}
	}
}
