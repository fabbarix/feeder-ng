package notify_test

import (
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/notify"
)

var night = household.QuietHours{Start: "22:00", End: "07:00"}

func utc(y int, mo time.Month, d, h, mi, s int) time.Time {
	return time.Date(y, mo, d, h, mi, s, 0, time.UTC)
}

func TestDeferQuiet(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	tokyo := zone(t, "Asia/Tokyo")
	cases := []struct {
		name string
		at   time.Time
		q    household.QuietHours
		loc  *time.Location
		want time.Time
	}{
		{"afternoon is untouched", utc(2026, 11, 9, 14, 30, 0), night, rome, utc(2026, 11, 9, 14, 30, 0)},
		{"22:00 local is deferred to 07:00 next morning", utc(2026, 11, 9, 21, 0, 0), night, rome, utc(2026, 11, 10, 6, 0, 0)},
		{"after midnight is deferred to the same morning", utc(2026, 11, 9, 23, 30, 0), night, rome, utc(2026, 11, 10, 6, 0, 0)},
		{"end of window is not quiet", utc(2026, 11, 10, 6, 0, 0), night, rome, utc(2026, 11, 10, 6, 0, 0)},
		{"one minute before the end is quiet", utc(2026, 11, 10, 5, 59, 0), night, rome, utc(2026, 11, 10, 6, 0, 0)},
		{"last second before the window is not quiet", utc(2026, 11, 9, 20, 59, 59), night, rome, utc(2026, 11, 9, 20, 59, 59)},
		{"same instant is not quiet in UTC", utc(2026, 11, 9, 21, 30, 0), night, time.UTC, utc(2026, 11, 9, 21, 30, 0)},
		{"same instant is quiet in Rome", utc(2026, 11, 9, 21, 30, 0), night, rome, utc(2026, 11, 10, 6, 0, 0)},
		{"same instant is quiet in Tokyo (06:30 local)", utc(2026, 11, 9, 21, 30, 0), night, tokyo, utc(2026, 11, 9, 22, 0, 0)},
		{"window that does not wrap midnight", utc(2026, 11, 9, 13, 30, 0), household.QuietHours{Start: "13:00", End: "15:00"}, time.UTC, utc(2026, 11, 9, 15, 0, 0)},
		{"day before the clocks go back (CEST) defers to 07:00 CET", utc(2026, 10, 24, 21, 30, 0), night, rome, utc(2026, 10, 25, 6, 0, 0)},
		{"night the clocks go back", utc(2026, 10, 25, 21, 30, 0), night, rome, utc(2026, 10, 26, 6, 0, 0)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := notify.DeferQuiet(c.at, c.q, c.loc)
			if !got.Equal(c.want) {
				t.Errorf("DeferQuiet(%s) = %s, want %s", c.at, got.UTC(), c.want)
			}
		})
	}
}

func cand(typ notify.Type, at time.Time) notify.Candidate {
	return notify.Candidate{Key: string(typ) + ":x@" + at.Format(time.RFC3339), Type: typ, At: at}
}

func TestDueNow(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	afternoon := utc(2026, 11, 9, 14, 30, 0)

	t.Run("not yet due", func(t *testing.T) {
		if got := notify.DueNow([]notify.Candidate{cand(notify.AdvanceStep, afternoon)}, afternoon.Add(-time.Second), night, rome); len(got) != 0 {
			t.Errorf("got %+v", got)
		}
	})
	t.Run("due exactly now", func(t *testing.T) {
		got := notify.DueNow([]notify.Candidate{cand(notify.AdvanceStep, afternoon)}, afternoon, night, rome)
		if len(got) != 1 || !got[0].SendAt.Equal(afternoon) {
			t.Errorf("got %+v", got)
		}
	})
	t.Run("stale after the grace period", func(t *testing.T) {
		c := []notify.Candidate{cand(notify.AdvanceStep, afternoon)}
		if got := notify.DueNow(c, afternoon.Add(notify.Grace-time.Second), night, rome); len(got) != 1 {
			t.Errorf("just inside Grace: got %+v", got)
		}
		if got := notify.DueNow(c, afternoon.Add(notify.Grace), night, rome); len(got) != 0 {
			t.Errorf("at Grace: got %+v", got)
		}
	})
	t.Run("quiet hours hold it until the window ends", func(t *testing.T) {
		c := []notify.Candidate{cand(notify.ConfirmCooked, utc(2026, 11, 9, 21, 30, 0))} // 22:30 Rome
		if got := notify.DueNow(c, utc(2026, 11, 10, 5, 59, 0), night, rome); len(got) != 0 {
			t.Errorf("during quiet hours: %+v", got)
		}
		got := notify.DueNow(c, utc(2026, 11, 10, 6, 0, 0), night, rome)
		if len(got) != 1 || !got[0].SendAt.Equal(utc(2026, 11, 10, 6, 0, 0)) {
			t.Errorf("at 07:00 local: %+v", got)
		}
	})
	t.Run("grace counts from the deferred send time", func(t *testing.T) {
		c := []notify.Candidate{cand(notify.ConfirmCooked, utc(2026, 11, 9, 21, 30, 0))}
		if got := notify.DueNow(c, utc(2026, 11, 10, 11, 0, 0), night, rome); len(got) != 1 {
			t.Errorf("5 h after 07:00: %+v", got)
		}
		if got := notify.DueNow(c, utc(2026, 11, 10, 12, 1, 0), night, rome); len(got) != 0 {
			t.Errorf("6 h 1 min after 07:00: %+v", got)
		}
	})
	t.Run("timers ignore quiet hours", func(t *testing.T) {
		at := utc(2026, 11, 9, 22, 0, 0) // 23:00 Rome
		got := notify.DueNow([]notify.Candidate{cand(notify.TimerFinished, at)}, at, night, rome)
		if len(got) != 1 || !got[0].SendAt.Equal(at) {
			t.Errorf("got %+v", got)
		}
	})
	t.Run("sorted by send time", func(t *testing.T) {
		a, b := cand(notify.AdvanceStep, afternoon), cand(notify.StartCooking, afternoon.Add(-time.Hour))
		got := notify.DueNow([]notify.Candidate{a, b}, afternoon.Add(time.Minute), night, rome)
		if len(got) != 2 || got[0].Type != notify.StartCooking {
			t.Errorf("got %+v", got)
		}
	})
}

func TestParseTypeRoundTrips(t *testing.T) {
	if len(notify.AllTypes()) != 7 {
		t.Fatalf("want the seven spec types, got %v", notify.AllTypes())
	}
	for _, ty := range notify.AllTypes() {
		got, ok := notify.ParseType(string(ty))
		if !ok || got != ty {
			t.Errorf("ParseType(%q) = %q, %v", ty, got, ok)
		}
	}
	if _, ok := notify.ParseType("newsletter"); ok {
		t.Error("unknown type accepted")
	}
}
