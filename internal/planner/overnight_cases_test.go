package planner

import (
	"testing"
	"time"
)

// B9-58 review: the start window on the cases a Household meets, in a zone west of UTC, east of UTC and UTC itself.
// Earliest start 06:30, Latest start 22:00 (the defaults); the meals are on Friday 2026-11-13 and Now is Monday
// 2026-11-09 08:00 in the same zone, so no start is past.

func zonedSlot(loc *time.Location, date string, id int64, h, m int) Slot {
	d, _ := time.ParseInLocation("2006-01-02", date, loc)
	return Slot{Key: SlotKey{Date: Date(date), MealSlotID: id}, At: time.Date(d.Year(), d.Month(), d.Day(), h, m, 0, 0, loc),
		Attendance: both()}
}

// allowedIn plans one cell with Recipe 1 of the given length against a Recipe 2 of unknown length and says whether
// Recipe 1 was allowed.
func allowedIn(t *testing.T, s Slot, minutes int, earliest, latest string) bool {
	t.Helper()
	in := withBoth(baseInput([]Slot{s}, rcp(1, 2, total(minutes)), rcp(2, 2)), earliest, latest)
	in.Now = time.Date(2026, 11, 9, 8, 0, 0, 0, s.At.Location())
	return placementAt(t, mustPlan(t, in), s.Key).RecipeID == 1
}

func TestTheStartWindowOnTheCasesAHouseholdMeets(t *testing.T) {
	const fri = "2026-11-13"
	cases := []struct {
		name     string
		h, m     int
		minutes  int
		want     bool // Latest start 22:00
		wantOff  bool // Latest start Off (the rule as B9-12 built it)
		wantLate bool // Latest start 23:30
	}{
		{"Dinner 19:30, 30 min: 19:00 the same day, as before", 19, 30, 30, true, true, true},
		{"Lunch 12:30, 8 h: 04:30, in the hours before the Earliest start", 12, 30, 8 * 60, false, false, false},
		{"Lunch 12:30, 15 h: Thursday 21:30", 12, 30, 15 * 60, true, false, true},
		{"Breakfast 07:00, 10 h: Thursday 21:00", 7, 0, 10 * 60, true, false, true},
		{"Breakfast 07:00, 9 h: Thursday 22:00, exactly the Latest start", 7, 0, 9 * 60, true, false, true},
		{"Breakfast 07:00, 8.5 h: Thursday 22:30, after the Latest start", 7, 0, 8*60 + 30, false, false, true},
		{"Supper 23:30, 30 min: 23:00 the same day, after the Latest start", 23, 30, 30, false, true, true},
		{"Breakfast 07:00, 25 h: Thursday 06:00, before the Earliest start", 7, 0, 25 * 60, false, false, false},
		{"Breakfast 07:00, 36 h: Wednesday 19:00", 7, 0, 36 * 60, true, false, true},
		{"Breakfast 07:00, 48 h: Wednesday 07:00", 7, 0, 48 * 60, true, false, true},
		{"Breakfast 07:00, 50 h: Wednesday 05:00", 7, 0, 50 * 60, false, false, false},
		{"Breakfast 07:00, unknown length", 7, 0, 0, true, true, true},
	}
	for _, zn := range []string{"America/Los_Angeles", "UTC", "Asia/Tokyo"} {
		loc, err := time.LoadLocation(zn)
		if err != nil {
			t.Fatal(err)
		}
		for _, c := range cases {
			s := zonedSlot(loc, fri, breakfastSlot, c.h, c.m)
			if got := allowedIn(t, s, c.minutes, "06:30", "22:00"); got != c.want {
				t.Errorf("%s, %s, Latest start 22:00: allowed = %v, want %v", zn, c.name, got, c.want)
			}
			if got := allowedIn(t, s, c.minutes, "06:30", ""); got != c.wantOff {
				t.Errorf("%s, %s, Latest start Off: allowed = %v, want %v", zn, c.name, got, c.wantOff)
			}
			if got := allowedIn(t, s, c.minutes, "06:30", "23:30"); got != c.wantLate {
				t.Errorf("%s, %s, Latest start 23:30: allowed = %v, want %v", zn, c.name, got, c.wantLate)
			}
		}
	}
}

// Regression guard for the upgrade: a start on the meal's own day up to the Latest start is judged exactly as the
// rule B9-12 built (Latest start Off), minute by minute, in three zones and across both DST changes. Only same-day
// starts after the Latest start (slots late in the evening) and starts on an earlier day differ.
func TestASameDayStartUpToTheLatestStartIsJudgedAsBefore(t *testing.T) {
	type day struct{ zone, date string }
	days := []day{
		{"Europe/Rome", "2026-11-13"}, {"Europe/Rome", "2026-10-25"}, {"Europe/Rome", "2026-03-29"},
		{"America/Los_Angeles", "2026-11-01"}, {"America/Los_Angeles", "2026-03-08"}, {"Asia/Tokyo", "2026-11-13"},
	}
	for _, d := range days {
		loc, err := time.LoadLocation(d.zone)
		if err != nil {
			t.Fatal(err)
		}
		for _, slot := range [][2]int{{7, 0}, {12, 30}, {19, 30}, {22, 0}, {23, 30}} {
			at := zonedSlot(loc, d.date, dinnerSlot, slot[0], slot[1]).At
			for minutes := 0; minutes <= 30*60; minutes++ {
				start, earlier := CookingStart(at, minutes)
				_, off := outsideStartWindow(at, minutes, "06:30", "")
				_, on := outsideStartWindow(at, minutes, "06:30", "22:00")
				h, m, _ := start.Clock()
				sameDayUpToLatest := !earlier && h*60+m <= 22*60
				if sameDayUpToLatest && off != on {
					t.Fatalf("%s %s %02d:%02d, %d min (start %s): Latest start 22:00 says outside=%v, Off says %v",
						d.zone, d.date, slot[0], slot[1], minutes, start, on, off)
				}
				if minutes > 0 && !earlier && h*60+m > 22*60 && !on {
					t.Fatalf("%s %s: same-day start %s after the Latest start is allowed", d.zone, d.date, start)
				}
			}
		}
	}
}
