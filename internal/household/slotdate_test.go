package household_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// A Meal Slot on one date (ADR 0014): the date's time, Not served, Guests. Team B5-SD, test-first.

func slotReasonOf(t *testing.T, err error) string {
	t.Helper()
	var ve *household.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("error = %v, want a *ValidationError", err)
	}
	return ve.Reason
}

func TestSlotDateIsDefaultOnlyWhenItSaysNothing(t *testing.T) {
	if !(household.SlotDate{SlotID: 1, Date: "2026-11-12"}).IsDefault() {
		t.Error("served, usual time, no Guests must be the default (the repository deletes such a row)")
	}
	for name, row := range map[string]household.SlotDate{
		"not served": {NotServed: true},
		"own time":   {Time: "20:15"},
		"guests":     {Guests: 2},
	} {
		if row.IsDefault() {
			t.Errorf("%s: a row that says something is not the default", name)
		}
	}
}

func TestEffectiveTimeIsTheDatesTimeWhenSet(t *testing.T) {
	if got := household.EffectiveTime("19:30", household.SlotDate{Time: "20:15"}); got != "20:15" {
		t.Errorf("EffectiveTime = %q, want the date's 20:15", got)
	}
	if got := household.EffectiveTime("19:30", household.SlotDate{}); got != "19:30" {
		t.Errorf("EffectiveTime = %q, want the usual 19:30", got)
	}
	if got := household.EffectiveTime("19:30", household.SlotDate{NotServed: true, Guests: 3}); got != "19:30" {
		t.Errorf("Not served and Guests do not move the time: %q", got)
	}
}

func TestIsNotServed(t *testing.T) {
	anna := household.Attendee{MemberID: 1}
	cases := []struct {
		name        string
		row         household.SlotDate
		override    []household.Attendee
		hasOverride bool
		want        bool
	}{
		{"marked by hand", household.SlotDate{NotServed: true}, nil, false, true},
		{"marked by hand, Guests kept", household.SlotDate{NotServed: true, Guests: 2}, []household.Attendee{anna}, true, true},
		{"emptied date: own Attendance with no Member and no Guest (U1)", household.SlotDate{}, []household.Attendee{}, true, true},
		{"emptied date, nil list is still an override", household.SlotDate{}, nil, true, true},
		{"no override: the usual Attendance decides, never Not served", household.SlotDate{}, nil, false, false},
		{"own Attendance with a Member", household.SlotDate{}, []household.Attendee{anna}, true, false},
		{"own Attendance with no Member but Guests is served (U3)", household.SlotDate{Guests: 2}, []household.Attendee{}, true, false},
		{"served, with a time", household.SlotDate{Time: "20:00"}, []household.Attendee{anna}, true, false},
	}
	for _, c := range cases {
		if got := household.IsNotServed(c.row, c.override, c.hasOverride); got != c.want {
			t.Errorf("%s: IsNotServed = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestEmptiesDateNeedsNoMemberAndNoGuest(t *testing.T) {
	anna := []household.Attendee{{MemberID: 1}}
	if !household.EmptiesDate(nil, 0) || !household.EmptiesDate([]household.Attendee{}, 0) {
		t.Error("no Member and no Guest empties the date")
	}
	if household.EmptiesDate(nil, 1) {
		t.Error("a Guest keeps the date served")
	}
	if household.EmptiesDate(anna, 0) {
		t.Error("a Member keeps the date served")
	}
}

func TestPortionsWithGuestsAddsOneStandardPortionEach(t *testing.T) {
	members := []household.Member{{ID: 1, PortionFactor: 1}, {ID: 2, PortionFactor: 0.5}}
	half := 2.0
	att := []household.Attendee{{MemberID: 1}, {MemberID: 2}}
	cases := []struct {
		name   string
		att    []household.Attendee
		guests int
		want   float64
	}{
		{"members only", att, 0, 1.5},
		{"two Guests", att, 2, 3.5},
		{"Guests only", nil, 4, 4},
		{"a Guest is 1 whatever the Members' factors", []household.Attendee{{MemberID: 2, PortionFactorOverride: &half}}, 1, 3},
	}
	for _, c := range cases {
		got, err := household.PortionsWithGuests(members, c.att, c.guests)
		if err != nil || got != c.want {
			t.Errorf("%s: PortionsWithGuests = %v, %v; want %v", c.name, got, err, c.want)
		}
	}
	if _, err := household.PortionsWithGuests(members, []household.Attendee{{MemberID: 9}}, 1); !errors.Is(err, household.ErrUnknownMember) {
		t.Errorf("an unknown Member = %v, want ErrUnknownMember", err)
	}
}

func TestValidateGuestsIsZeroToTwenty(t *testing.T) {
	for _, n := range []int{0, 1, 20} {
		if err := household.ValidateGuests(n); err != nil {
			t.Errorf("ValidateGuests(%d) = %v, want nil", n, err)
		}
	}
	for _, n := range []int{-1, 21, 100} {
		err := household.ValidateGuests(n)
		if err == nil {
			t.Errorf("ValidateGuests(%d) = nil, want guests_invalid", n)
			continue
		}
		if r := slotReasonOf(t, err); r != "guests_invalid" {
			t.Errorf("ValidateGuests(%d) reason = %q", n, r)
		}
	}
}

func TestValidateSlotTime(t *testing.T) {
	for _, s := range []string{"", "00:00", "19:30", "23:59"} {
		if err := household.ValidateSlotTime(s); err != nil {
			t.Errorf("ValidateSlotTime(%q) = %v, want nil", s, err)
		}
	}
	for _, s := range []string{"24:00", "7pm", "19:60", "1930", "9:30"} {
		err := household.ValidateSlotTime(s)
		if err == nil {
			t.Errorf("ValidateSlotTime(%q) = nil, want time_invalid", s)
			continue
		}
		if r := slotReasonOf(t, err); r != "time_invalid" {
			t.Errorf("ValidateSlotTime(%q) reason = %q", s, r)
		}
	}
}

func TestValidateNotServedChange(t *testing.T) {
	if err := household.ValidateNotServedChange("2026-11-12", "2026-11-12", false); err != nil {
		t.Errorf("today, nothing started = %v, want nil", err)
	}
	if err := household.ValidateNotServedChange("2026-11-14", "2026-11-12", false); err != nil {
		t.Errorf("a later date = %v, want nil", err)
	}
	err := household.ValidateNotServedChange("2026-11-11", "2026-11-12", false)
	if err == nil || slotReasonOf(t, err) != "date_past" {
		t.Errorf("a past date = %v, want date_past", err)
	}
	err = household.ValidateNotServedChange("2026-11-12", "2026-11-12", true)
	if err == nil || slotReasonOf(t, err) != "slot_started" {
		t.Errorf("a Course already Cooked or Not cooked = %v, want slot_started (U2)", err)
	}
}
