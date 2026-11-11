package recipe

import (
	"errors"
	"reflect"
	"testing"
)

// Courses and Whole meal on a Recipe: the pure rules (spec §4, crs-plan §2.3, team A).

func boolp(b bool) *bool { return &b }

func TestValidateCourseIDs(t *testing.T) {
	tests := []struct {
		name string
		in   []int64
		want []int64 // nil: must stay nil (absent)
		bad  string  // CodeCoursesEmpty, or ""
	}{
		{"absent stays absent (create gets the main Course, update keeps the stored ones)", nil, nil, ""},
		{"one Course", []int64{3}, []int64{3}, ""},
		{"order is kept", []int64{4, 2, 3}, []int64{4, 2, 3}, ""},
		{"repeated ids are dropped, the first stays", []int64{2, 3, 2, 3, 5}, []int64{2, 3, 5}, ""},
		{"an empty list is refused", []int64{}, nil, CodeCoursesEmpty},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			in := valid()
			in.CourseIDs = tc.in
			got, err := in.Validate(lookup)
			if tc.bad != "" {
				var ve *ValidationError
				if !errors.As(err, &ve) || ve.Field != "courses" || ve.Code != tc.bad || ve.Message == "" {
					t.Fatalf("err = %v, want a ValidationError on field courses with code %s", err, tc.bad)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got.CourseIDs, tc.want) {
				t.Fatalf("CourseIDs = %v, want %v", got.CourseIDs, tc.want)
			}
		})
	}
}

func TestValidateCourseIDsAreCopiedNotAliased(t *testing.T) {
	in := valid()
	in.CourseIDs = []int64{2, 3}
	got, err := in.Validate(lookup)
	if err != nil {
		t.Fatal(err)
	}
	in.CourseIDs[0] = 99
	if len(got.CourseIDs) != 2 || got.CourseIDs[0] != 2 {
		t.Errorf("the cleaned Input must own its CourseIDs, got %v", got.CourseIDs)
	}
}

func TestValidateKeepsWholeMealAsSentAndAbsentAsNil(t *testing.T) {
	for name, v := range map[string]*bool{"absent": nil, "true": boolp(true), "false": boolp(false)} {
		in := valid()
		in.WholeMeal = v
		got, err := in.Validate(lookup)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		switch {
		case v == nil && got.WholeMeal != nil:
			t.Errorf("%s: WholeMeal = %v, want nil (the store decides: default on create, stored value on update)", name, *got.WholeMeal)
		case v != nil && (got.WholeMeal == nil || *got.WholeMeal != *v):
			t.Errorf("%s: WholeMeal = %v, want %v", name, got.WholeMeal, *v)
		}
		if v != nil && got.WholeMeal == v {
			t.Errorf("%s: the cleaned Input must own its WholeMeal pointer", name)
		}
	}
}

func TestDefaultWholeMeal(t *testing.T) {
	const main, side = 1, 2
	tests := []struct {
		name  string
		ready bool
		ids   []int64
		want  bool
	}{
		{"a Ready Meal in the main Course", true, []int64{main}, true},
		{"a Ready Meal in the main Course and a Side", true, []int64{side, main}, true},
		{"a Ready Meal without the main Course (a bought dessert or side)", true, []int64{side}, false},
		{"a normal Recipe in the main Course", false, []int64{main}, false},
		{"a normal Recipe, no Courses", false, nil, false},
		{"a Ready Meal with no Courses yet", true, nil, false},
	}
	for _, tc := range tests {
		if got := DefaultWholeMeal(tc.ready, tc.ids, main); got != tc.want {
			t.Errorf("%s: DefaultWholeMeal = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestLostCourses(t *testing.T) {
	tests := []struct {
		name          string
		before, after []int64
		want          []int64
	}{
		{"nothing lost", []int64{1, 2}, []int64{1, 2}, nil},
		{"a Course added is not a loss", []int64{1}, []int64{1, 2}, nil},
		{"Side taken off", []int64{1, 2}, []int64{1}, []int64{2}},
		{"two lost, in the order they had", []int64{1, 2, 3}, []int64{2}, []int64{1, 3}},
		{"replaced", []int64{1}, []int64{3}, []int64{1}},
		{"order alone changes nothing", []int64{1, 2}, []int64{2, 1}, nil},
		{"no Courses before", nil, []int64{1}, nil},
	}
	for _, tc := range tests {
		got := LostCourses(tc.before, tc.after)
		if len(got) == 0 && len(tc.want) == 0 {
			continue
		}
		if !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: LostCourses(%v, %v) = %v, want %v", tc.name, tc.before, tc.after, got, tc.want)
		}
	}
}
