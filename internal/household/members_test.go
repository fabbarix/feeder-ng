package household_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

func fieldOf(err error) string {
	var ve *household.ValidationError
	if errors.As(err, &ve) {
		return ve.Field
	}
	return ""
}

func TestMemberInputValidate(t *testing.T) {
	ok := household.MemberInput{Name: "Sam", Colour: "#e07a5f", Avatar: "🦊", PortionFactor: 0.5}
	if err := ok.Validate(); err != nil {
		t.Fatalf("valid member rejected: %v", err)
	}
	tests := []struct {
		name  string
		edit  func(*household.MemberInput)
		field string
	}{
		{"empty name", func(m *household.MemberInput) { m.Name = "  " }, "name"},
		{"long name", func(m *household.MemberInput) { m.Name = strings.Repeat("x", 51) }, "name"},
		{"colour without hash", func(m *household.MemberInput) { m.Colour = "e07a5f" }, "colour"},
		{"colour short form", func(m *household.MemberInput) { m.Colour = "#fff" }, "colour"},
		{"colour not hex", func(m *household.MemberInput) { m.Colour = "#gggggg" }, "colour"},
		{"avatar too long", func(m *household.MemberInput) { m.Avatar = "abcde" }, "avatar"},
		{"factor off the step", func(m *household.MemberInput) { m.PortionFactor = 0.3 }, "portionFactor"},
		{"factor too big", func(m *household.MemberInput) { m.PortionFactor = 3.25 }, "portionFactor"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m := ok
			tc.edit(&m)
			if got := fieldOf(m.Validate()); got != tc.field {
				t.Fatalf("field = %q, want %q", got, tc.field)
			}
		})
	}
	noAvatar := ok
	noAvatar.Avatar = ""
	if err := noAvatar.Validate(); err != nil {
		t.Errorf("avatar is optional: %v", err)
	}
}

func TestMealSlotInputValidate(t *testing.T) {
	ok := household.MealSlotInput{Weekday: 2, Name: "Dinner", Time: "19:30", Attendance: []household.Attendee{{MemberID: 1}, {MemberID: 2, PortionFactorOverride: f(0.75)}}}
	if err := ok.Validate(); err != nil {
		t.Fatalf("valid slot rejected: %v", err)
	}
	tests := []struct {
		name  string
		edit  func(*household.MealSlotInput)
		field string
		sent  error
	}{
		{"weekday 0", func(m *household.MealSlotInput) { m.Weekday = 0 }, "weekday", nil},
		{"weekday 8", func(m *household.MealSlotInput) { m.Weekday = 8 }, "weekday", nil},
		{"empty name", func(m *household.MealSlotInput) { m.Name = "" }, "name", nil},
		{"time 24:00", func(m *household.MealSlotInput) { m.Time = "24:00" }, "time", nil},
		{"time not padded", func(m *household.MealSlotInput) { m.Time = "9:00" }, "time", nil},
		{"time with seconds", func(m *household.MealSlotInput) { m.Time = "19:30:00" }, "time", nil},
		{"bad override", func(m *household.MealSlotInput) {
			m.Attendance = []household.Attendee{{MemberID: 1, PortionFactorOverride: f(0.1)}}
		}, "portionFactorOverride", nil},
		{"duplicate attendee", func(m *household.MealSlotInput) { m.Attendance = []household.Attendee{{MemberID: 1}, {MemberID: 1}} }, "", household.ErrDuplicateAttendee},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m := ok
			tc.edit(&m)
			err := m.Validate()
			if tc.sent != nil {
				if !errors.Is(err, tc.sent) {
					t.Fatalf("err = %v, want %v", err, tc.sent)
				}
				return
			}
			if got := fieldOf(err); got != tc.field {
				t.Fatalf("field = %q (err %v), want %q", got, err, tc.field)
			}
		})
	}
	nobody := ok
	nobody.Attendance = nil
	if err := nobody.Validate(); err != nil {
		t.Errorf("a slot with no usual Attendance is valid: %v", err)
	}
}

func TestWeekdayOfIsISO(t *testing.T) {
	for date, want := range map[string]int{"2026-11-09": 1, "2026-11-12": 4, "2026-11-15": 7, "2028-02-29": 2} {
		got, err := household.WeekdayOf(date)
		if err != nil || got != want {
			t.Errorf("WeekdayOf(%s) = %d, %v; want %d", date, got, err, want)
		}
	}
	for _, bad := range []string{"", "2026-13-01", "2026-02-30", "12/11/2026", "2026-11-9"} {
		if _, err := household.WeekdayOf(bad); err == nil {
			t.Errorf("WeekdayOf(%q) accepted", bad)
		}
	}
}

func TestValidateAttendanceDate(t *testing.T) {
	if err := household.ValidateAttendanceDate(4, "2026-11-12"); err != nil {
		t.Errorf("Thursday on a Thursday slot: %v", err)
	}
	if err := household.ValidateAttendanceDate(3, "2026-11-12"); !errors.Is(err, household.ErrWeekdayMismatch) {
		t.Errorf("Thursday on a Wednesday slot: %v", err)
	}
	if got := fieldOf(household.ValidateAttendanceDate(4, "nope")); got != "date" {
		t.Errorf("bad date field = %q", got)
	}
}

func TestPreferences(t *testing.T) {
	d := household.DefaultPreferences()
	if d.Scheme != "system" || d.Accent != "#3f7d58" || d.Secondary != nil || d.Units != "metric" {
		t.Fatalf("defaults = %+v", d)
	}
	if err := d.Validate(); err != nil {
		t.Fatal(err)
	}
	sec := "#ffb4a2"
	good := household.Preferences{Scheme: "dark", Accent: "#3366cc", Secondary: &sec, Units: "imperial"}
	if err := good.Validate(); err != nil {
		t.Fatalf("good rejected: %v", err)
	}
	badSec := "red"
	tests := map[string]household.Preferences{
		"scheme":    {Scheme: "sepia", Accent: "#3366cc", Units: "metric"},
		"accent":    {Scheme: "dark", Accent: "blue", Units: "metric"},
		"secondary": {Scheme: "dark", Accent: "#3366cc", Secondary: &badSec, Units: "metric"},
		"units":     {Scheme: "dark", Accent: "#3366cc", Units: "furlongs"},
	}
	for field, p := range tests {
		if got := fieldOf(p.Validate()); got != field {
			t.Errorf("%s: field = %q", field, got)
		}
	}
}
