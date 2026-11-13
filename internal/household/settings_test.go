package household_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

func TestDefaultSettingsMatchSpec(t *testing.T) {
	s := household.DefaultSettings("Europe/Rome")
	want := household.Settings{
		TimeZone: "Europe/Rome", PlanningHorizonDays: 7, DefaultCooldownDays: 7, DefaultLeftoverUseByDays: 3, FrozenUseByDays: 90,
		QuietHours: household.QuietHours{Start: "22:00", End: "07:00"}, PlannerStyle: 0.5, Currency: "USD",
	}
	if s != want {
		t.Fatalf("defaults = %+v, want %+v", s, want)
	}
	if err := s.Validate(); err != nil {
		t.Fatalf("defaults invalid: %v", err)
	}
}

func TestSettingsValidate(t *testing.T) {
	lat, lon := 45.07, 7.69
	badLat := 91.0
	mod := func(f func(*household.Settings)) household.Settings {
		s := household.DefaultSettings("Europe/Rome")
		f(&s)
		return s
	}
	tests := []struct {
		name  string
		s     household.Settings
		field string // "" = valid
	}{
		{"horizon 1", mod(func(s *household.Settings) { s.PlanningHorizonDays = 1 }), ""},
		{"horizon 28", mod(func(s *household.Settings) { s.PlanningHorizonDays = 28 }), ""},
		{"horizon 0", mod(func(s *household.Settings) { s.PlanningHorizonDays = 0 }), "planningHorizonDays"},
		{"horizon 29", mod(func(s *household.Settings) { s.PlanningHorizonDays = 29 }), "planningHorizonDays"},
		{"cooldown 0", mod(func(s *household.Settings) { s.DefaultCooldownDays = 0 }), ""},
		{"cooldown negative", mod(func(s *household.Settings) { s.DefaultCooldownDays = -1 }), "defaultCooldownDays"},
		{"cooldown 366", mod(func(s *household.Settings) { s.DefaultCooldownDays = 366 }), "defaultCooldownDays"},
		{"use-by 0", mod(func(s *household.Settings) { s.DefaultLeftoverUseByDays = 0 }), "defaultLeftoverUseByDays"},
		{"use-by 15", mod(func(s *household.Settings) { s.DefaultLeftoverUseByDays = 15 }), "defaultLeftoverUseByDays"},
		{"style 0", mod(func(s *household.Settings) { s.PlannerStyle = 0 }), ""},
		{"style 1", mod(func(s *household.Settings) { s.PlannerStyle = 1 }), ""},
		{"style 0.3", mod(func(s *household.Settings) { s.PlannerStyle = 0.3 }), ""},
		{"style -0.1", mod(func(s *household.Settings) { s.PlannerStyle = -0.1 }), "plannerStyle"},
		{"style 1.1", mod(func(s *household.Settings) { s.PlannerStyle = 1.1 }), "plannerStyle"},
		{"zone unknown", mod(func(s *household.Settings) { s.TimeZone = "Mars/Olympus" }), "timeZone"},
		{"zone empty", mod(func(s *household.Settings) { s.TimeZone = "" }), "timeZone"},
		{"zone Local", mod(func(s *household.Settings) { s.TimeZone = "Local" }), "timeZone"},
		{"zone UTC", mod(func(s *household.Settings) { s.TimeZone = "UTC" }), ""},
		{"quiet hours bad time", mod(func(s *household.Settings) { s.QuietHours.Start = "25:00" }), "quietHours"},
		{"quiet hours not padded", mod(func(s *household.Settings) { s.QuietHours.End = "7:00" }), "quietHours"},
		{"quiet hours empty window", mod(func(s *household.Settings) { s.QuietHours = household.QuietHours{Start: "08:00", End: "08:00"} }), "quietHours"},
		{"quiet hours same day", mod(func(s *household.Settings) { s.QuietHours = household.QuietHours{Start: "13:00", End: "15:00"} }), ""},
		{"currency EUR", mod(func(s *household.Settings) { s.Currency = "EUR" }), ""},
		{"currency lower case is normalised", mod(func(s *household.Settings) { s.Currency = "eur" }), ""},
		{"currency too long", mod(func(s *household.Settings) { s.Currency = "EURO" }), "currency"},
		{"currency empty", mod(func(s *household.Settings) { s.Currency = "" }), "currency"},
		{"city", mod(func(s *household.Settings) { s.Location = &household.Location{City: "Turin"} }), ""},
		{"coordinates", mod(func(s *household.Settings) { s.Location = &household.Location{Latitude: &lat, Longitude: &lon} }), ""},
		{"blank city", mod(func(s *household.Settings) { s.Location = &household.Location{City: "  "} }), "location"},
		{"city and coordinates", mod(func(s *household.Settings) {
			s.Location = &household.Location{City: "Turin", Latitude: &lat, Longitude: &lon}
		}), "location"},
		{"latitude only", mod(func(s *household.Settings) { s.Location = &household.Location{Latitude: &lat} }), "location"},
		{"latitude out of range", mod(func(s *household.Settings) { s.Location = &household.Location{Latitude: &badLat, Longitude: &lon} }), "location"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.s.Normalized().Validate()
			if tc.field == "" {
				if err != nil {
					t.Fatalf("want valid, got %v", err)
				}
				return
			}
			var ve *household.ValidationError
			if !errors.As(err, &ve) || ve.Field != tc.field {
				t.Fatalf("err = %v, want ValidationError on %q", err, tc.field)
			}
		})
	}
}

func TestSettingsNormalized(t *testing.T) {
	s := household.DefaultSettings("UTC")
	s.Currency = " eur "
	s.Location = &household.Location{City: "  Turin "}
	n := s.Normalized()
	if n.Currency != "EUR" || n.Location.City != "Turin" {
		t.Fatalf("normalized = %q, %+v", n.Currency, n.Location)
	}
}

func TestQuietHoursContainsWrapsMidnight(t *testing.T) {
	q := household.QuietHours{Start: "22:00", End: "07:00"}
	for hhmm, want := range map[string]bool{
		"22:00": true, "23:59": true, "00:00": true, "06:59": true,
		"07:00": false, "12:00": false, "21:59": false,
	} {
		if got := q.Contains(hhmm); got != want {
			t.Errorf("Contains(%s) = %v, want %v", hhmm, got, want)
		}
	}
	day := household.QuietHours{Start: "13:00", End: "15:00"}
	if !day.Contains("14:00") || day.Contains("15:00") || day.Contains("02:00") {
		t.Error("same-day window wrong")
	}
}

func TestValidationErrorMessageNamesTheField(t *testing.T) {
	err := household.DefaultSettings("UTC")
	err.PlanningHorizonDays = 40
	if e := err.Validate(); e == nil || !strings.Contains(e.Error(), "planningHorizonDays") {
		t.Fatalf("error = %v", e)
	}
}
