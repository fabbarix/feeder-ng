package plan_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/plan"
)

func TestKeyCourse(t *testing.T) {
	a := plan.Key{Date: "2026-11-09", MealSlotID: 1}
	b := plan.Key{Date: "2026-11-09", MealSlotID: 1, CourseID: 2}
	if a.CourseID != 0 {
		t.Errorf("zero Course = %d", a.CourseID)
	}
	if a == b {
		t.Error("Keys of different Courses must differ")
	}
	m := map[plan.Key]int{a: 1, b: 2}
	if m[a] != 1 || m[b] != 2 || len(m) != 2 {
		t.Errorf("map by Key = %v", m)
	}
}

func TestSlotRuleCourse(t *testing.T) {
	r := plan.SlotRule{MealSlotID: 1, CourseID: 3, RecipeID: 4}
	if r.CourseID != 3 {
		t.Errorf("SlotRule.CourseID = %d", r.CourseID)
	}
}
