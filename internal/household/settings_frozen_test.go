package household_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// B5-LO (ADR 0012, spec §3): the Household's default Frozen Use-by, 90 days, 1 to 365.

func TestDefaultSettingsFreezeLeftoversForNinetyDays(t *testing.T) {
	s := household.DefaultSettings("Europe/Rome")
	if s.FrozenUseByDays != 90 {
		t.Errorf("FrozenUseByDays = %d, want 90", s.FrozenUseByDays)
	}
	if err := s.Validate(); err != nil {
		t.Errorf("defaults invalid: %v", err)
	}
}

func TestFrozenUseByDaysIsOneToThreeHundredSixtyFive(t *testing.T) {
	for days, ok := range map[int]bool{1: true, 90: true, 365: true, 0: false, -1: false, 366: false} {
		s := household.DefaultSettings("Europe/Rome")
		s.FrozenUseByDays = days
		err := s.Normalized().Validate()
		var ve *household.ValidationError
		switch {
		case ok && err != nil:
			t.Errorf("%d days refused: %v", days, err)
		case !ok && (!errors.As(err, &ve) || ve.Field != "frozenUseByDays"):
			t.Errorf("%d days: err = %v, want a ValidationError on frozenUseByDays", days, err)
		}
	}
}
