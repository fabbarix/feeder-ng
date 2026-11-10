package recipe

import (
	"errors"
	"testing"
)

// R12: the optional per-Recipe reheat time (whole minutes, 1 to 30; nil = Reheat uses its formula).
func TestValidateReheatMinutes(t *testing.T) {
	tests := []struct {
		name string
		v    *int
		ok   bool
	}{
		{"absent is fine", nil, true},
		{"1 minute is the shortest", intp(1), true},
		{"4 minutes", intp(4), true},
		{"30 minutes is the longest", intp(30), true},
		{"0 is not a reheat time (leave it blank instead)", intp(0), false},
		{"negative", intp(-2), false},
		{"above 30", intp(31), false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			in := valid()
			in.ReheatMinutes = tc.v
			got, err := in.Validate(lookup)
			if tc.ok {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				switch {
				case tc.v == nil && got.ReheatMinutes != nil:
					t.Fatalf("ReheatMinutes = %d, want nil", *got.ReheatMinutes)
				case tc.v != nil && (got.ReheatMinutes == nil || *got.ReheatMinutes != *tc.v):
					t.Fatalf("ReheatMinutes = %v, want %d", got.ReheatMinutes, *tc.v)
				}
				return
			}
			var ve *ValidationError
			if !errors.As(err, &ve) {
				t.Fatalf("err = %v, want *ValidationError", err)
			}
			if ve.Field != "reheatMinutes" || ve.Code != CodeReheatInvalid || ve.Message == "" {
				t.Errorf("got field %q code %q message %q", ve.Field, ve.Code, ve.Message)
			}
		})
	}
}

func TestValidateReheatMinutesIsCopiedNotAliased(t *testing.T) {
	in := valid()
	in.ReheatMinutes = intp(5)
	got, err := in.Validate(lookup)
	if err != nil {
		t.Fatal(err)
	}
	*in.ReheatMinutes = 9
	if got.ReheatMinutes == nil || *got.ReheatMinutes != 5 {
		t.Fatalf("the cleaned Input must own its value, got %v", got.ReheatMinutes)
	}
}
