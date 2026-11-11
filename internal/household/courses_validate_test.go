package household_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

func validationOf(t *testing.T, err error) *household.ValidationError {
	t.Helper()
	var ve *household.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("want *ValidationError, got %v", err)
	}
	return ve
}

func TestValidateDateCourses(t *testing.T) {
	served := []household.CourseDay{{CourseID: 1}, {CourseID: 2}}
	members := []household.Member{{ID: 10}, {ID: 11}}

	t.Run("empty input is accepted", func(t *testing.T) {
		if err := household.ValidateDateCourses(served, members, nil); err != nil {
			t.Fatalf("nil input: %v", err)
		}
		if err := household.ValidateDateCourses(nil, nil, []household.DateCourse{}); err != nil {
			t.Fatalf("empty input: %v", err)
		}
	})

	t.Run("served courses and known members are accepted", func(t *testing.T) {
		in := []household.DateCourse{
			{CourseID: 1, OptOutMemberIDs: nil},
			{CourseID: 2, OptOutMemberIDs: []int64{10, 11}},
			{CourseID: 1, OptOutMemberIDs: []int64{}},
		}
		if err := household.ValidateDateCourses(served, members, in); err != nil {
			t.Fatalf("unexpected: %v", err)
		}
	})

	t.Run("a course not on the slot", func(t *testing.T) {
		in := []household.DateCourse{{CourseID: 1}, {CourseID: 99}}
		ve := validationOf(t, household.ValidateDateCourses(served, members, in))
		if ve.Field != "courses[1].courseId" || ve.Reason != household.ReasonCourseNotInSlot {
			t.Fatalf("got field %q reason %q", ve.Field, ve.Reason)
		}
	})

	t.Run("an unknown member", func(t *testing.T) {
		in := []household.DateCourse{{CourseID: 1}, {CourseID: 2, OptOutMemberIDs: []int64{10, 77}}}
		ve := validationOf(t, household.ValidateDateCourses(served, members, in))
		if ve.Field != "courses[1].optOutMemberIds" || ve.Reason != "member_unknown" {
			t.Fatalf("got field %q reason %q", ve.Field, ve.Reason)
		}
	})

	t.Run("the first failure wins", func(t *testing.T) {
		in := []household.DateCourse{
			{CourseID: 1, OptOutMemberIDs: []int64{77}}, // unknown member at index 0
			{CourseID: 99}, // course not in slot at index 1
		}
		ve := validationOf(t, household.ValidateDateCourses(served, members, in))
		if ve.Field != "courses[0].optOutMemberIds" || ve.Reason != "member_unknown" {
			t.Fatalf("got field %q reason %q", ve.Field, ve.Reason)
		}
		// within one entry the Course is checked before its opt-outs
		in = []household.DateCourse{{CourseID: 99, OptOutMemberIDs: []int64{77}}}
		ve = validationOf(t, household.ValidateDateCourses(served, members, in))
		if ve.Field != "courses[0].courseId" || ve.Reason != "course_not_in_slot" {
			t.Fatalf("got field %q reason %q", ve.Field, ve.Reason)
		}
	})
}
