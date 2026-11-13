package recipe

import (
	"errors"
	"testing"
)

// B5-LO (ADR 0012, plan 2.3): a Recipe's optional Frozen Use-by, 1 to 365 days, nil = the Household's default.
func TestValidateFrozenUseByDays(t *testing.T) {
	cases := []struct {
		name string
		days *int
		bad  bool
	}{
		{"none uses the Household's", nil, false},
		{"1 day", intp(1), false},
		{"90 days", intp(90), false},
		{"365 days", intp(365), false},
		{"0 days", intp(0), true},
		{"negative", intp(-1), true},
		{"366 days", intp(366), true},
	}
	for _, tc := range cases {
		in := valid()
		in.FrozenUseByDays = tc.days
		out, err := in.Validate(lookup)
		if !tc.bad {
			if err != nil {
				t.Errorf("%s: unexpected error %v", tc.name, err)
				continue
			}
			if (tc.days == nil) != (out.FrozenUseByDays == nil) || (tc.days != nil && *out.FrozenUseByDays != *tc.days) {
				t.Errorf("%s: after Validate the value is kept = %v, want the same value kept", tc.name, out.FrozenUseByDays != nil)
			}
			continue
		}
		var ve *ValidationError
		if !errors.As(err, &ve) || ve.Field != "frozenUseByDays" || ve.Code != CodeFrozenUseByInvalid {
			t.Errorf("%s: err = %v, want a ValidationError on frozenUseByDays with code %s", tc.name, err, CodeFrozenUseByInvalid)
		}
	}
}

func TestFrozenUseByDaysIsNotTheLeftoverUseBy(t *testing.T) {
	// 31 days is fine as a Frozen Use-by (a Freezer keeps food for months) and not as a Use-by (0 to 30).
	in := valid()
	in.FrozenUseByDays = intp(31)
	if _, err := in.Validate(lookup); err != nil {
		t.Errorf("Frozen Use-by 31 refused: %v", err)
	}
	in = valid()
	in.LeftoverUseByDays = intp(31)
	if _, err := in.Validate(lookup); err == nil {
		t.Error("Use-by 31 must still be refused")
	}
}
