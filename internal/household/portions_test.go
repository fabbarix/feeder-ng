package household_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

func f(v float64) *float64 { return &v }

var family = []household.Member{
	{ID: 1, Name: "Anna", PortionFactor: 1},
	{ID: 2, Name: "Marco", PortionFactor: 1},
	{ID: 3, Name: "Sam", PortionFactor: 0.5},
	{ID: 4, Name: "Nonna", PortionFactor: 0.75},
}

func TestPortionsNeededIsSumOfPortionFactors(t *testing.T) {
	tests := []struct {
		name string
		att  []household.Attendee
		want float64
	}{
		{"nobody attends", nil, 0},
		{"two adults", []household.Attendee{{MemberID: 1}, {MemberID: 2}}, 2},
		{"two adults and a child", []household.Attendee{{MemberID: 1}, {MemberID: 2}, {MemberID: 3}}, 2.5},
		{"everyone", []household.Attendee{{MemberID: 1}, {MemberID: 2}, {MemberID: 3}, {MemberID: 4}}, 3.25},
		{"override replaces the default", []household.Attendee{{MemberID: 3, PortionFactorOverride: f(1)}, {MemberID: 1}}, 2},
		{"override can go below the default", []household.Attendee{{MemberID: 1, PortionFactorOverride: f(0.25)}}, 0.25},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := household.PortionsNeeded(family, tc.att)
			if err != nil || got != tc.want {
				t.Fatalf("PortionsNeeded = %v, %v; want %v", got, err, tc.want)
			}
		})
	}
}

func TestPortionsNeededRejectsUnknownMember(t *testing.T) {
	_, err := household.PortionsNeeded(family, []household.Attendee{{MemberID: 99}})
	if !errors.Is(err, household.ErrUnknownMember) {
		t.Fatalf("err = %v, want ErrUnknownMember", err)
	}
}

func TestEffectiveFactor(t *testing.T) {
	if got := household.EffectiveFactor(family[2], household.Attendee{MemberID: 3}); got != 0.5 {
		t.Errorf("default = %v, want 0.5", got)
	}
	if got := household.EffectiveFactor(family[2], household.Attendee{MemberID: 3, PortionFactorOverride: f(1.5)}); got != 1.5 {
		t.Errorf("override = %v, want 1.5", got)
	}
}

func TestResolveAttendanceUsesOverrideEvenWhenEmpty(t *testing.T) {
	usual := []household.Attendee{{MemberID: 1}, {MemberID: 2}}
	away := []household.Attendee{{MemberID: 1}}
	if got := household.ResolveAttendance(usual, away, true); len(got) != 1 || got[0].MemberID != 1 {
		t.Errorf("with override = %+v", got)
	}
	if got := household.ResolveAttendance(usual, nil, true); len(got) != 0 {
		t.Errorf("empty override must mean nobody attends, got %+v", got)
	}
	if got := household.ResolveAttendance(usual, nil, false); len(got) != 2 {
		t.Errorf("no override = %+v, want usual", got)
	}
}

func TestSamAwayThursdayChangesThatDateOnly(t *testing.T) {
	usual := []household.Attendee{{MemberID: 1}, {MemberID: 2}, {MemberID: 3}}
	thursday := []household.Attendee{{MemberID: 1}, {MemberID: 2}} // Sam is away
	away, _ := household.PortionsNeeded(family, household.ResolveAttendance(usual, thursday, true))
	normal, _ := household.PortionsNeeded(family, household.ResolveAttendance(usual, nil, false))
	if away != 2 || normal != 2.5 {
		t.Fatalf("away = %v, normal = %v; want 2 and 2.5", away, normal)
	}
}

func TestValidatePortionFactor(t *testing.T) {
	for _, ok := range []float64{0.25, 0.5, 0.75, 1, 1.25, 2.5, 3} {
		if err := household.ValidatePortionFactor(ok); err != nil {
			t.Errorf("%v rejected: %v", ok, err)
		}
	}
	for _, bad := range []float64{0, -1, 0.2, 0.3, 0.26, 3.25, 4, 1.1} {
		var ve *household.ValidationError
		if err := household.ValidatePortionFactor(bad); !errors.As(err, &ve) || ve.Field != "portionFactor" {
			t.Errorf("%v accepted or wrong error: %v", bad, err)
		}
	}
}
