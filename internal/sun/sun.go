// Package sun computes sunrise and sunset (NOAA solar calculator) and the
// kitchen board's dark/light phase. Pure: no clock, no I/O.
package sun

import (
	"math"
	"sort"
	"time"
)

// Coords is a place on Earth in decimal degrees (north and east positive).
type Coords struct{ Lat, Lon float64 }

// DayState says whether the sun rises and sets on a day.
type DayState int

// The three kinds of day.
const (
	Normal     DayState = iota // the sun rises and sets
	PolarDay                   // the sun stays up all day
	PolarNight                 // the sun stays down all day
)

// Day is the sunrise and sunset of one civil date at a place, as UTC instants.
// Sunrise and Sunset are zero unless State is Normal.
type Day struct {
	Sunrise, Sunset time.Time
	State           DayState
}

// zenith is the solar zenith of sunrise and sunset: 90 degrees plus the
// refraction at the horizon and the radius of the solar disc.
const zenith = 90.833

// Times returns the NOAA sunrise and sunset for the local solar day of the civil date.
func Times(year int, month time.Month, day int, c Coords) Day {
	midnight := time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
	// Julian day at 00:00 UT of the civil date.
	jd0 := float64(midnight.Unix())/86400 + 2440587.5
	// First guess of solar noon in minutes after UT midnight, then refine it
	// once with the equation of time at that moment.
	noon := 720 - 4*c.Lon
	var decl, eqt, cosH float64
	for i := 0; i < 2; i++ {
		decl, eqt = solar(jd0 + noon/1440)
		cosH = math.Cos(rad(zenith))/(math.Cos(rad(c.Lat))*math.Cos(rad(decl))) - math.Tan(rad(c.Lat))*math.Tan(rad(decl))
		noon = 720 - 4*c.Lon - eqt
	}
	switch {
	case cosH > 1:
		return Day{State: PolarNight}
	case cosH < -1:
		return Day{State: PolarDay}
	}
	ha := deg(math.Acos(cosH))
	rise := 720 - 4*(c.Lon+ha) - eqt
	set := 720 - 4*(c.Lon-ha) - eqt
	return Day{
		Sunrise: at(midnight, rise),
		Sunset:  at(midnight, set),
		State:   Normal,
	}
}

// solar returns the sun's declination (degrees) and the equation of time
// (minutes) at a Julian day.
func solar(jd float64) (decl, eqt float64) {
	t := (jd - 2451545.0) / 36525.0
	l0 := norm360(280.46646 + t*(36000.76983+t*0.0003032))
	m := 357.52911 + t*(35999.05029-0.0001537*t)
	e := 0.016708634 - t*(0.000042037+0.0000001267*t)
	mr := rad(m)
	c := math.Sin(mr)*(1.914602-t*(0.004817+0.000014*t)) + math.Sin(2*mr)*(0.019993-0.000101*t) + math.Sin(3*mr)*0.000289
	trueLon := l0 + c
	omega := 125.04 - 1934.136*t
	lambda := trueLon - 0.00569 - 0.00478*math.Sin(rad(omega))
	eps0 := 23 + (26+(21.448-t*(46.815+t*(0.00059-t*0.001813)))/60)/60
	eps := eps0 + 0.00256*math.Cos(rad(omega))
	decl = deg(math.Asin(math.Sin(rad(eps)) * math.Sin(rad(lambda))))
	y := math.Pow(math.Tan(rad(eps)/2), 2)
	l0r := rad(l0)
	eqt = 4 * deg(y*math.Sin(2*l0r)-2*e*math.Sin(mr)+4*e*y*math.Sin(mr)*math.Cos(2*l0r)-
		0.5*y*y*math.Sin(4*l0r)-1.25*e*e*math.Sin(2*mr))
	return decl, eqt
}

// at is the instant the given number of minutes after UT midnight.
func at(midnight time.Time, minutes float64) time.Time {
	return midnight.Add(time.Duration(math.Round(minutes * float64(time.Minute))))
}

func rad(d float64) float64 { return d * math.Pi / 180 }
func deg(r float64) float64 { return r * 180 / math.Pi }

func norm360(d float64) float64 {
	d = math.Mod(d, 360)
	if d < 0 {
		d += 360
	}
	return d
}

// Source says where a Phase came from.
type Source string

// Sources of a Phase.
const (
	SourceSun      Source = "sun"
	SourceFallback Source = "fallback" // 19:00-07:00 local
)

// Phase is whether the board is dark now and when that next changes.
type Phase struct {
	Dark   bool
	Next   time.Time // strictly after the instant asked about
	Source Source
}

// Fallback hours: dark from 19:00 to 07:00 local time.
const (
	fallbackDarkHour  = 19
	fallbackLightHour = 7
)

// PhaseAt is dark from sunset to sunrise in the zone, computed from c; a nil c
// uses the fallback 19:00 (dark) to 07:00 (light) local time. A polar day is
// light and a polar night dark all day, with Next at the next local midnight.
func PhaseAt(now time.Time, zone *time.Location, c *Coords) Phase {
	if zone == nil {
		zone = time.UTC
	}
	local := now.In(zone)
	if c == nil {
		return fallbackPhase(local, zone)
	}
	y, m, d := local.Date()
	today := Times(y, m, d, *c)
	midnight := time.Date(y, m, d+1, 0, 0, 0, 0, zone)
	if today.State != Normal {
		return Phase{Dark: today.State == PolarNight, Next: midnight, Source: SourceSun}
	}
	// Sunrises and sunsets of the civil days around now, in time order.
	type event struct {
		at    time.Time
		light bool // sunrise
	}
	var events []event
	for k := -2; k <= 2; k++ {
		yy, mm, dd := time.Date(y, m, d+k, 0, 0, 0, 0, time.UTC).Date()
		day := Times(yy, mm, dd, *c)
		if day.State != Normal {
			continue
		}
		events = append(events, event{day.Sunrise, true}, event{day.Sunset, false})
	}
	sort.Slice(events, func(i, j int) bool { return events[i].at.Before(events[j].at) })

	var last *event
	var next *event
	for i := range events {
		if events[i].at.After(now) {
			next = &events[i]
			break
		}
		last = &events[i]
	}
	var p Phase
	p.Source = SourceSun
	switch {
	case last != nil:
		p.Dark = !last.light
	case next != nil:
		p.Dark = next.light // the next change is a sunrise, so it is dark now
	}
	if next != nil {
		p.Next = next.at
	} else {
		p.Next = midnight
	}
	return p
}

// fallbackPhase is 19:00 to 07:00 local clock time.
func fallbackPhase(local time.Time, zone *time.Location) Phase {
	y, m, d := local.Date()
	h := local.Hour()
	p := Phase{Source: SourceFallback}
	switch {
	case h >= fallbackDarkHour:
		p.Dark = true
		p.Next = time.Date(y, m, d+1, fallbackLightHour, 0, 0, 0, zone)
	case h < fallbackLightHour:
		p.Dark = true
		p.Next = time.Date(y, m, d, fallbackLightHour, 0, 0, 0, zone)
	default:
		p.Next = time.Date(y, m, d, fallbackDarkHour, 0, 0, 0, zone)
	}
	return p
}
