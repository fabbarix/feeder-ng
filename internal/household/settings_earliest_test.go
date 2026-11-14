package household_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// PC-14 (decision PC 5) and TB-06 (B9-12): the Household setting "Earliest start" (default 06:30, "" is Off) and the
// hidden first-run checklist.

func TestDefaultSettingsStartAtHalfPastSixAndShowTheChecklist(t *testing.T) {
	s := household.DefaultSettings("Europe/Rome")
	if s.EarliestStart != "06:30" || s.SetupHidden {
		t.Errorf("EarliestStart = %q, SetupHidden = %v; want 06:30 and false", s.EarliestStart, s.SetupHidden)
	}
	if err := s.Validate(); err != nil {
		t.Errorf("defaults invalid: %v", err)
	}
}

func TestEarliestStartIsATimeOfDayOrOff(t *testing.T) {
	for at, ok := range map[string]bool{"06:30": true, "00:00": true, "23:59": true, "": true, "6:30": false, "24:00": false, "06:60": false, "soon": false, "06:30:00": false} {
		s := household.DefaultSettings("Europe/Rome")
		s.EarliestStart, s.LatestStart = at, "" // Latest start Off: any Earliest start is allowed (A2, B9-58)
		err := s.Normalized().Validate()
		var ve *household.ValidationError
		switch {
		case ok && err != nil:
			t.Errorf("%q refused: %v", at, err)
		case !ok && (!errors.As(err, &ve) || ve.Field != "earliestStart"):
			t.Errorf("%q: err = %v, want a ValidationError on earliestStart", at, err)
		}
	}
}

func TestNormalizedTrimsTheEarliestStart(t *testing.T) {
	s := household.DefaultSettings("Europe/Rome")
	s.EarliestStart = " 07:00 "
	if got := s.Normalized().EarliestStart; got != "07:00" {
		t.Errorf("Normalized EarliestStart = %q, want 07:00", got)
	}
}
