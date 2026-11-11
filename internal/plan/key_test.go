package plan_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/cook"
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

func TestMealScopeRoundTrip(t *testing.T) {
	cases := []struct {
		name     string
		courseID int64
		want     string
	}{
		{"course 0 two-part", 0, "meal:2026-11-09/1"},
		{"real course three-part", 3, "meal:2026-11-09/1/3"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			scope := cook.MealScope("2026-11-09", 1, c.courseID)
			if string(scope) != c.want {
				t.Fatalf("MealScope = %q, want %q", scope, c.want)
			}
			got, err := cook.ParseScope(string(scope))
			if err != nil {
				t.Fatalf("ParseScope(%q): %v", scope, err)
			}
			want := cook.ScopeParts{Date: "2026-11-09", MealSlotID: 1, CourseID: c.courseID, IsMeal: true}
			if got != want {
				t.Errorf("ParseScope(%q) = %+v, want %+v", scope, got, want)
			}
		})
	}
}
