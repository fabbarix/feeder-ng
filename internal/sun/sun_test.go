package sun_test

import (
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/sun"
)

// Reference values: NOAA solar calculator / timeanddate.com, rounded to the minute.
const tol = 4 * time.Minute

func near(t *testing.T, name string, got time.Time, want string) {
	t.Helper()
	w, err := time.Parse(time.RFC3339, want)
	if err != nil {
		t.Fatal(err)
	}
	d := got.Sub(w)
	if d < 0 {
		d = -d
	}
	if d > tol {
		t.Errorf("%s = %s, want %s (+-%s)", name, got.UTC().Format(time.RFC3339), want, tol)
	}
}

func TestTimesKnownValues(t *testing.T) {
	cases := []struct {
		name            string
		y               int
		m               time.Month
		d               int
		c               sun.Coords
		sunrise, sunset string
	}{
		{"London summer solstice (BST 04:43 / 21:21)", 2026, time.June, 21, sun.Coords{Lat: 51.5074, Lon: -0.1278}, "2026-06-21T03:43:00Z", "2026-06-21T20:21:00Z"},
		{"New York summer solstice (EDT 05:25 / 20:31)", 2026, time.June, 21, sun.Coords{Lat: 40.7128, Lon: -74.0060}, "2026-06-21T09:25:00Z", "2026-06-22T00:31:00Z"},
		{"Rome winter solstice (CET 07:34 / 16:42)", 2026, time.December, 21, sun.Coords{Lat: 41.9028, Lon: 12.4964}, "2026-12-21T06:34:00Z", "2026-12-21T15:42:00Z"},
		{"Sydney summer solstice (AEDT 05:41 / 20:05) rises the previous UTC day", 2026, time.December, 21, sun.Coords{Lat: -33.8688, Lon: 151.2093}, "2026-12-20T18:41:00Z", "2026-12-21T09:05:00Z"},
		{"Quito at the March equinox is about 12 hours of day (06:18 / 18:24 local, UTC-5)", 2026, time.March, 20, sun.Coords{Lat: -0.1807, Lon: -78.4678}, "2026-03-20T11:18:00Z", "2026-03-20T23:24:00Z"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			day := sun.Times(tc.y, tc.m, tc.d, tc.c)
			if day.State != sun.Normal {
				t.Fatalf("State = %v, want Normal", day.State)
			}
			near(t, "sunrise", day.Sunrise, tc.sunrise)
			near(t, "sunset", day.Sunset, tc.sunset)
		})
	}
}

func TestTimesPolarDayAndNight(t *testing.T) {
	tromso := sun.Coords{Lat: 69.6492, Lon: 18.9553}
	if got := sun.Times(2026, time.June, 21, tromso).State; got != sun.PolarDay {
		t.Errorf("Tromso midsummer State = %v, want PolarDay", got)
	}
	if got := sun.Times(2026, time.December, 21, tromso).State; got != sun.PolarNight {
		t.Errorf("Tromso midwinter State = %v, want PolarNight", got)
	}
	day := sun.Times(2026, time.December, 21, tromso)
	if !day.Sunrise.IsZero() || !day.Sunset.IsZero() {
		t.Error("a polar night has no sunrise or sunset")
	}
}

func TestTimesSunriseBeforeSunsetAndDaylightGrowsInSummer(t *testing.T) {
	c := sun.Coords{Lat: 45.0, Lon: 9.0}
	june := sun.Times(2026, time.June, 21, c)
	dec := sun.Times(2026, time.December, 21, c)
	if !june.Sunrise.Before(june.Sunset) || !dec.Sunrise.Before(dec.Sunset) {
		t.Fatal("sunrise must be before sunset")
	}
	if june.Sunset.Sub(june.Sunrise) <= dec.Sunset.Sub(dec.Sunrise) {
		t.Error("a June day must be longer than a December day at 45N")
	}
}

var london = &sun.Coords{Lat: 51.5074, Lon: -0.1278}

func utc(s string) time.Time {
	v, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return v
}

func TestPhaseAtFromTheSun(t *testing.T) {
	zone, _ := time.LoadLocation("Europe/London")
	cases := []struct {
		name     string
		now      string
		dark     bool
		wantNext string // within tol
	}{
		{"midday is light, next change is sunset", "2026-06-21T12:00:00Z", false, "2026-06-21T20:21:00Z"},
		{"late evening is dark, next change is tomorrow's sunrise", "2026-06-21T22:00:00Z", true, "2026-06-22T03:43:00Z"},
		{"small hours are dark, next change is today's sunrise", "2026-06-21T02:00:00Z", true, "2026-06-21T03:43:00Z"},
		{"winter 16:30 is dark already (sunset about 15:53)", "2026-12-21T16:30:00Z", true, "2026-12-22T08:04:00Z"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			now := utc(tc.now)
			p := sun.PhaseAt(now, zone, london)
			if p.Dark != tc.dark {
				t.Errorf("Dark = %v, want %v", p.Dark, tc.dark)
			}
			if p.Source != sun.SourceSun {
				t.Errorf("Source = %q, want sun", p.Source)
			}
			if !p.Next.After(now) {
				t.Errorf("Next %s must be after now", p.Next)
			}
			near(t, "next", p.Next, tc.wantNext)
		})
	}
}

func TestPhaseAtFallbackIs19To07LocalTime(t *testing.T) {
	rome, _ := time.LoadLocation("Europe/Rome")
	cases := []struct {
		local    string
		dark     bool
		wantNext string
	}{
		{"2026-11-09T06:59:00", true, "2026-11-09T07:00:00"},
		{"2026-11-09T07:00:00", false, "2026-11-09T19:00:00"},
		{"2026-11-09T18:59:00", false, "2026-11-09T19:00:00"},
		{"2026-11-09T19:00:00", true, "2026-11-10T07:00:00"},
		{"2026-11-09T23:30:00", true, "2026-11-10T07:00:00"},
		{"2026-07-01T19:00:00", true, "2026-07-02T07:00:00"}, // summer time: still local clock time
	}
	for _, tc := range cases {
		now, err := time.ParseInLocation("2006-01-02T15:04:05", tc.local, rome)
		if err != nil {
			t.Fatal(err)
		}
		want, _ := time.ParseInLocation("2006-01-02T15:04:05", tc.wantNext, rome)
		p := sun.PhaseAt(now, rome, nil)
		if p.Dark != tc.dark || !p.Next.Equal(want) || p.Source != sun.SourceFallback {
			t.Errorf("%s: got dark=%v next=%s source=%s, want dark=%v next=%s source=fallback", tc.local, p.Dark, p.Next, p.Source, tc.dark, want)
		}
	}
}

func TestPhaseAtPolarDaysDoNotFlip(t *testing.T) {
	zone, _ := time.LoadLocation("Europe/Oslo")
	tromso := &sun.Coords{Lat: 69.6492, Lon: 18.9553}
	day := time.Date(2026, 6, 21, 23, 30, 0, 0, zone)
	p := sun.PhaseAt(day, zone, tromso)
	if p.Dark {
		t.Error("midnight sun must be light")
	}
	if want := time.Date(2026, 6, 22, 0, 0, 0, 0, zone); !p.Next.Equal(want) {
		t.Errorf("Next = %s, want the next local midnight %s", p.Next, want)
	}
	night := sun.PhaseAt(time.Date(2026, 12, 21, 12, 0, 0, 0, zone), zone, tromso)
	if !night.Dark {
		t.Error("polar night must be dark, even at noon")
	}
}
