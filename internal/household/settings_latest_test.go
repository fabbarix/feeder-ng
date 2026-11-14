package household_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// A2 (B9-58): the Household setting "Latest start" ("" is Off), default 22:00, beside Earliest start. When both are
// set, Latest start must be later than Earliest start; the error names latestStart.

func TestDefaultSettingsHaveALatestStartOfTenInTheEvening(t *testing.T) {
	s := household.DefaultSettings("Europe/Rome")
	if s.LatestStart != "22:00" {
		t.Errorf("LatestStart = %q, want 22:00", s.LatestStart)
	}
	if err := s.Validate(); err != nil {
		t.Errorf("defaults invalid: %v", err)
	}
}

func latestErr(t *testing.T, earliest, latest string) *household.ValidationError {
	t.Helper()
	s := household.DefaultSettings("Europe/Rome")
	s.EarliestStart, s.LatestStart = earliest, latest
	err := s.Normalized().Validate()
	if err == nil {
		return nil
	}
	var ve *household.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("%q/%q: err = %v, want a ValidationError", earliest, latest, err)
	}
	return ve
}

func TestLatestStartIsATimeOfDayOrOff(t *testing.T) {
	for at, ok := range map[string]bool{"22:00": true, "23:59": true, "": true, "06:31": true, "6:30": false, "24:00": false, "22:60": false, "late": false, "22:00:00": false} {
		ve := latestErr(t, "06:30", at)
		switch {
		case ok && ve != nil:
			t.Errorf("%q refused: %v", at, ve)
		case !ok && (ve == nil || ve.Field != "latestStart"):
			t.Errorf("%q: err = %v, want a ValidationError on latestStart", at, ve)
		}
	}
}

func TestLatestStartMustBeLaterThanEarliestStartWhenBothAreSet(t *testing.T) {
	for _, c := range []struct {
		earliest, latest string
		ok               bool
	}{
		{"06:30", "06:31", true},
		{"06:30", "06:30", false}, // equal
		{"06:30", "06:29", false}, // earlier
		{"06:30", "00:00", false},
		{"22:00", "22:00", false},
		{"23:00", "22:00", false},
		{"00:00", "00:01", true},
		{"", "05:00", true}, // Earliest start Off: any Latest start
		{"", "00:00", true},
		{"23:00", "", true}, // Latest start Off: any Earliest start
		{"", "", true},
	} {
		ve := latestErr(t, c.earliest, c.latest)
		switch {
		case c.ok && ve != nil:
			t.Errorf("earliest %q latest %q refused: %v", c.earliest, c.latest, ve)
		case !c.ok && (ve == nil || ve.Field != "latestStart"):
			t.Errorf("earliest %q latest %q: err = %v, want a ValidationError on latestStart", c.earliest, c.latest, ve)
		}
	}
}

func TestNormalizedTrimsTheLatestStart(t *testing.T) {
	s := household.DefaultSettings("Europe/Rome")
	s.LatestStart = " 21:30 "
	if got := s.Normalized().LatestStart; got != "21:30" {
		t.Errorf("Normalized LatestStart = %q, want 21:30", got)
	}
}
