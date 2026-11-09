package household

import "strings"

// QuietHours is a daily window of "HH:MM" clock times that may wrap midnight.
type QuietHours struct{ Start, End string }

// Contains reports whether the "HH:MM" time falls in the window: start
// inclusive, end exclusive, wrapping midnight.
func (q QuietHours) Contains(hhmm string) bool {
	s, e, t := minutesOf(q.Start), minutesOf(q.End), minutesOf(hhmm)
	if s < e {
		return t >= s && t < e
	}
	return t >= s || t < e
}

// Location is a city name or coordinates (never both).
type Location struct {
	City      string
	Latitude  *float64
	Longitude *float64
}

// Settings are the Household's settings (spec §3).
type Settings struct {
	TimeZone                 string
	TimeZoneConfigured       bool
	PlanningHorizonDays      int
	DefaultCooldownDays      int
	DefaultLeftoverUseByDays int
	QuietHours               QuietHours
	PlannerStyle             float64 // 0 = Use what we have, 0.5 = Variety, 1 = Favourites
	Location                 *Location
	Currency                 string
}

// DefaultSettings are the settings a new Household starts with, in the given zone.
func DefaultSettings(timeZone string) Settings {
	return Settings{
		TimeZone:                 timeZone,
		PlanningHorizonDays:      7,
		DefaultCooldownDays:      7,
		DefaultLeftoverUseByDays: 3,
		QuietHours:               QuietHours{Start: "22:00", End: "07:00"},
		PlannerStyle:             0.5,
		Currency:                 "USD",
	}
}

// Normalized trims the city and upper-cases and trims the currency. It returns a copy.
func (s Settings) Normalized() Settings {
	n := s
	n.TimeZone = strings.TrimSpace(s.TimeZone)
	n.Currency = strings.ToUpper(strings.TrimSpace(s.Currency))
	if s.Location != nil {
		n.Location = &Location{City: strings.TrimSpace(s.Location.City), Latitude: s.Location.Latitude, Longitude: s.Location.Longitude}
	}
	return n
}

// Validate checks every setting against its bounds. Callers normalise first.
func (s Settings) Validate() error {
	if s.PlanningHorizonDays < 1 || s.PlanningHorizonDays > 28 {
		return fieldError("planningHorizonDays", "must be between 1 and 28 days")
	}
	if s.DefaultCooldownDays < 0 || s.DefaultCooldownDays > 365 {
		return fieldError("defaultCooldownDays", "must be between 0 and 365 days")
	}
	if s.DefaultLeftoverUseByDays < 1 || s.DefaultLeftoverUseByDays > 14 {
		return fieldError("defaultLeftoverUseByDays", "must be between 1 and 14 days")
	}
	if s.PlannerStyle < 0 || s.PlannerStyle > 1 {
		return fieldError("plannerStyle", "must be between 0 and 1")
	}
	if !validZone(s.TimeZone) {
		return fieldError("timeZone", "must be a time zone name such as Europe/Rome")
	}
	if !validTimeOfDay(s.QuietHours.Start) || !validTimeOfDay(s.QuietHours.End) {
		return fieldError("quietHours", "start and end must be HH:MM times")
	}
	if s.QuietHours.Start == s.QuietHours.End {
		return fieldError("quietHours", "start and end must differ")
	}
	if !currencyISO.MatchString(s.Currency) {
		return fieldError("currency", "must be a three-letter code such as EUR")
	}
	return validateLocation(s.Location)
}

func validateLocation(l *Location) error {
	if l == nil {
		return nil
	}
	hasCity := strings.TrimSpace(l.City) != ""
	hasCoords := l.Latitude != nil || l.Longitude != nil
	switch {
	case hasCity && hasCoords:
		return fieldError("location", "give a city or coordinates, not both")
	case hasCity:
		return nil
	case l.Latitude == nil || l.Longitude == nil:
		return fieldError("location", "give a city, or both latitude and longitude")
	case *l.Latitude < -90 || *l.Latitude > 90:
		return fieldError("location", "latitude must be between -90 and 90")
	case *l.Longitude < -180 || *l.Longitude > 180:
		return fieldError("location", "longitude must be between -180 and 180")
	}
	return nil
}
