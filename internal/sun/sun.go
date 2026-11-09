// Package sun computes sunrise and sunset (NOAA solar calculator) and the
// kitchen board's dark/light phase. Pure: no clock, no I/O.
package sun

import "time"

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

// Times returns the NOAA sunrise and sunset for the local solar day of the civil date.
func Times(year int, month time.Month, day int, c Coords) Day {
	panic("TODO")
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

// PhaseAt is dark from sunset to sunrise in the zone, computed from c; a nil c
// uses the fallback 19:00 (dark) to 07:00 (light) local time. A polar day is
// light and a polar night dark all day, with Next at the next local midnight.
func PhaseAt(now time.Time, zone *time.Location, c *Coords) Phase {
	panic("TODO")
}
