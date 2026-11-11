package household_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// household.CourseAttendance as a pure table test (crs-plan §2.3, team A).

func att(ids ...int64) []household.Attendee {
	out := make([]household.Attendee, 0, len(ids))
	for _, id := range ids {
		out = append(out, household.Attendee{MemberID: id})
	}
	return out
}

func ids(a []household.Attendee) []int64 {
	out := []int64{}
	for _, x := range a {
		out = append(out, x.MemberID)
	}
	return out
}

func list(v ...int64) *[]int64 {
	if v == nil {
		v = []int64{}
	}
	return &v
}

func TestCourseAttendance(t *testing.T) {
	tests := []struct {
		name  string
		slot  []household.Attendee
		usual []int64
		date  *[]int64
		want  []int64
	}{
		{"no opt-outs gives the slot's Attendance", att(1, 2, 3), nil, nil, []int64{1, 2, 3}},
		{"usual opt-outs subtract", att(1, 2, 3), []int64{2}, nil, []int64{1, 3}},
		{"a date override replaces the usual opt-outs", att(1, 2, 3), []int64{2}, list(3), []int64{1, 2}},
		{"an empty date override puts everyone back", att(1, 2, 3), []int64{2, 3}, list(), []int64{1, 2, 3}},
		{"an opt-out of a Member who is not attending changes nothing", att(1, 3), []int64{2}, nil, []int64{1, 3}},
		{"a date opt-out of a Member who is not attending changes nothing", att(1, 3), nil, list(2, 9), []int64{1, 3}},
		{"everyone attending opts out", att(1, 2), []int64{1, 2}, nil, []int64{}},
		{"everyone opts out on the date", att(1, 2), nil, list(1, 2), []int64{}},
		{"nobody attends the slot", nil, []int64{1}, nil, []int64{}},
		{"a repeated opt-out is harmless", att(1, 2, 3), []int64{2, 2}, nil, []int64{1, 3}},
		{"the slot's order is kept", att(3, 1, 2), []int64{1}, nil, []int64{3, 2}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ids(household.CourseAttendance(tc.slot, tc.usual, tc.date))
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("CourseAttendance = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestCourseAttendanceKeepsPortionFactorOverrides(t *testing.T) {
	half, quarter := 0.5, 0.25
	slot := []household.Attendee{{MemberID: 1, PortionFactorOverride: &half}, {MemberID: 2}, {MemberID: 3, PortionFactorOverride: &quarter}}
	got := household.CourseAttendance(slot, []int64{2}, nil)
	if len(got) != 2 || got[0].PortionFactorOverride == nil || *got[0].PortionFactorOverride != 0.5 ||
		got[1].MemberID != 3 || got[1].PortionFactorOverride == nil || *got[1].PortionFactorOverride != 0.25 {
		t.Fatalf("CourseAttendance = %+v, want Members 1 (0.5) and 3 (0.25)", got)
	}
}

func TestCourseAttendanceDoesNotModifyItsInputs(t *testing.T) {
	slot := att(1, 2, 3)
	usual := []int64{2}
	date := list(1)
	household.CourseAttendance(slot, usual, date)
	if !reflect.DeepEqual(ids(slot), []int64{1, 2, 3}) || !reflect.DeepEqual(usual, []int64{2}) || !reflect.DeepEqual(*date, []int64{1}) {
		t.Errorf("inputs changed: %v %v %v", slot, usual, *date)
	}
	// The result owns its slice: appending to it must not write into the slot's Attendance.
	got := household.CourseAttendance(slot, nil, nil)
	got = append(got[:0], household.Attendee{MemberID: 99})
	if slot[0].MemberID != 1 {
		t.Error("the result aliases the slot's backing array")
	}
	_ = got
}

// ---- Course lists on a Meal Slot: pure validation and normalisation ----

func reasonOf(t *testing.T, err error) (field, reason string) {
	t.Helper()
	var ve *household.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("err = %v, want a *ValidationError", err)
	}
	return ve.Field, ve.Reason
}

func slotInput(courses []household.SlotCourseInput) household.MealSlotInput {
	return household.MealSlotInput{Weekday: 2, Name: "Dinner", Time: "19:30", Courses: courses}
}

func TestMealSlotInputCoursesValidation(t *testing.T) {
	ok := map[string][]household.SlotCourseInput{
		"absent (nil)":        nil,
		"one required Course": {{CourseID: 1}},
		"two, one required":   {{CourseID: 1, Optional: true}, {CourseID: 2}},
		"the main Course may be optional when another is required": {{CourseID: 1, Optional: true}, {CourseID: 2, Optional: false}},
	}
	for name, c := range ok {
		if err := slotInput(c).Normalized().Validate(); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
	err := slotInput([]household.SlotCourseInput{}).Validate()
	if f, r := reasonOf(t, err); f != "courses" || r != household.ReasonCoursesEmpty {
		t.Errorf("empty list: field %q reason %q, want courses / courses_empty", f, r)
	}
	err = slotInput([]household.SlotCourseInput{{CourseID: 1, Optional: true}, {CourseID: 2, Optional: true}}).Validate()
	if f, r := reasonOf(t, err); f != "courses" || r != household.ReasonCoursesAllOptional {
		t.Errorf("all optional: field %q reason %q, want courses / courses_all_optional", f, r)
	}
	err = slotInput([]household.SlotCourseInput{{CourseID: 1, Optional: true}}).Validate()
	if _, r := reasonOf(t, err); r != household.ReasonCoursesAllOptional {
		t.Errorf("a single optional Course: reason %q, want courses_all_optional", r)
	}
}

func TestNormalizedDropsRepeatedCoursesAndRepeatedOptOutMembers(t *testing.T) {
	in := slotInput([]household.SlotCourseInput{
		{CourseID: 1, OptOutMemberIDs: []int64{5, 5, 3}},
		{CourseID: 2, Optional: true},
		{CourseID: 1, Optional: true, OptOutMemberIDs: []int64{9}}, // a repeat: the first wins
		{CourseID: 3, OptOutMemberIDs: []int64{}},
	})
	got := in.Normalized().Courses
	want := []household.SlotCourseInput{
		{CourseID: 1, OptOutMemberIDs: []int64{5, 3}},
		{CourseID: 2, Optional: true},
		{CourseID: 3, OptOutMemberIDs: []int64{}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Normalized Courses = %+v, want %+v", got, want)
	}
	if got[1].OptOutMemberIDs != nil {
		t.Error("a nil OptOutMemberIDs (keep the stored ones) must stay nil")
	}
	if got[2].OptOutMemberIDs == nil {
		t.Error("an empty OptOutMemberIDs (clear them) must stay non-nil")
	}
	if len(in.Courses) != 4 {
		t.Error("Normalized modified its receiver's list")
	}
	if slotInput(nil).Normalized().Courses != nil {
		t.Error("absent Courses must stay nil")
	}
}

func TestBatchEditMayChangeOnlyTheCourses(t *testing.T) {
	courses := []household.SlotCourseInput{{CourseID: 1}, {CourseID: 2, Optional: true}}
	ok := household.BatchInput{Match: "Dinner", Weekdays: []int{1, 2}, Change: household.SlotChange{Courses: &courses}}
	if err := ok.Normalized().Validate(); err != nil {
		t.Fatalf("a batch that only sets Courses: %v", err)
	}
	empty := []household.SlotCourseInput{}
	bad := household.BatchInput{Match: "Dinner", Weekdays: []int{1}, Change: household.SlotChange{Courses: &empty}}
	if f, r := reasonOf(t, bad.Normalized().Validate()); f != "courses" || r != household.ReasonCoursesEmpty {
		t.Errorf("empty Courses: field %q reason %q", f, r)
	}
	allOptional := []household.SlotCourseInput{{CourseID: 1, Optional: true}}
	bad = household.BatchInput{Match: "Dinner", Weekdays: []int{1}, Change: household.SlotChange{Courses: &allOptional}}
	if _, r := reasonOf(t, bad.Normalized().Validate()); r != household.ReasonCoursesAllOptional {
		t.Errorf("all optional: reason %q", r)
	}
	// Repeats are dropped by Normalized for the batch too.
	rep := []household.SlotCourseInput{{CourseID: 1}, {CourseID: 1}}
	n := household.BatchInput{Match: "Dinner", Weekdays: []int{1}, Change: household.SlotChange{Courses: &rep}}.Normalized()
	if len(*n.Change.Courses) != 1 {
		t.Errorf("batch Courses after Normalized = %+v, want the repeat dropped", *n.Change.Courses)
	}
}
