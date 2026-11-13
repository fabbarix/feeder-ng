package httpapi

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
)

// B5-SD (ADR 0014, spec §18): the slot carries the effective time, the usual time, Not served and Guests; a Course of
// a Not served slot is unserved "not_served". Test-first.

func TestSlotCarriesTheDatesTimeTheUsualTimeNotServedAndGuests(t *testing.T) {
	sv := runner.SlotView{Key: plan.Key{Date: "2026-11-10", MealSlotID: 2}, Name: "Dinner", Time: "20:15", UsualTime: "19:30",
		At: dinnerAt(t), NotServed: true, Guests: 3, Portions: 5}
	out := slotFor(sv, fixture())
	if out.Time != "20:15" || out.UsualTime != "19:30" || !out.NotServed || out.Guests != 3 || out.Portions != 5 {
		t.Errorf("slot = %+v, want time 20:15, usually 19:30, Not served, 3 Guests, 5 portions", out)
	}
}

func TestACourseOfANotServedSlotIsUnservedNotServed(t *testing.T) {
	sv := runner.SlotView{Key: plan.Key{Date: "2026-11-10", MealSlotID: 2}, Name: "Dinner", Time: "19:30", UsualTime: "19:30", At: dinnerAt(t),
		NotServed: true, Courses: []runner.CourseView{{CourseID: 1, Main: true, Unserved: "not_served", OptOutMemberIDs: []int64{}}}}
	out := slotFor(sv, fixture())
	if len(out.Courses) != 1 || out.Courses[0].Unserved == nil || *out.Courses[0].Unserved != "not_served" {
		t.Errorf("courses = %+v, want unserved \"not_served\"", out.Courses)
	}
	if out.Courses[0].Meal != nil || out.Courses[0].Unfilled != nil {
		t.Errorf("a Not served Course has no meal and no reason: %+v", out.Courses[0])
	}
}
