package service_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/cook/service"
)

// Team C3 (docs/dev/design/crs-c3.md §2): no two-part scope and no "course 0 is the main Course" in the cook service.

// MealView was the two-part route's view of the main Course. It goes with the route.
func TestTheMainCourseTwoPartViewIsGone(t *testing.T) {
	f := setup(t)
	if reflect.ValueOf(f.svc).MethodByName("MealView").IsValid() {
		t.Error("Service.MealView is still there: the two-part view of the main Course is removed, CourseView names its Course")
	}
}

func TestCourseViewOfCourseZeroIsNotTheMainCourse(t *testing.T) {
	f := setup(t)
	f.meals.meals = []service.MealInfo{
		{Date: "2026-11-09", MealSlotID: 3, CourseID: 0, RecipeID: 12, Batches: 1, State: "planned", Main: true},
		{Date: "2026-11-09", MealSlotID: 3, CourseID: 5, RecipeID: 12, Batches: 1, State: "planned", Main: true},
	}
	if _, err := f.svc.CourseView(ctx, "2026-11-09", 3, 0); !errors.Is(err, service.ErrNotFound) {
		t.Errorf("CourseView(course 0) = %v, want ErrNotFound (0 names no Course)", err)
	}
}

// The main Course's scope is three-part like every other Course's, so the view, its marks and its timers share it.
func TestTheMainCoursesViewHasAThreePartScope(t *testing.T) {
	f := setup(t)
	f.meals.meals = []service.MealInfo{{Date: "2026-11-09", MealSlotID: 3, CourseID: 5, RecipeID: 12, Batches: 1, State: "planned", Main: true}}
	want := cook.MealScope("2026-11-09", 3, 5)
	if want != "meal:2026-11-09/3/5" {
		t.Fatalf("MealScope = %q", want)
	}
	v, err := f.svc.CourseView(ctx, "2026-11-09", 3, 5)
	if err != nil {
		t.Fatal(err)
	}
	if v.View.Scope != want {
		t.Errorf("view scope = %q, want %q (never the two-part form)", v.View.Scope, want)
	}
	if _, err := f.svc.SetMark(ctx, want, 0, true); err != nil {
		t.Fatal(err)
	}
	v, _ = f.svc.CourseView(ctx, "2026-11-09", 3, 5)
	if !v.Advance[0].Done {
		t.Error("the mark written under the three-part scope is not in the Course's view")
	}
}

// A two-part scope names no Course any more: marks, timers and lookups refuse it.
func TestATwoPartScopeIsRefused(t *testing.T) {
	f := setup(t)
	f.meals.meals = []service.MealInfo{{Date: "2026-11-09", MealSlotID: 3, CourseID: 5, RecipeID: 12, Batches: 1, State: "planned", Main: true}}
	if _, err := f.svc.SetMark(ctx, "meal:2026-11-09/3", 0, true); !errors.Is(err, service.ErrInvalid) {
		t.Errorf("SetMark(two-part) = %v, want ErrInvalid", err)
	}
	if _, _, err := f.svc.StartTimer(ctx, service.StartInput{Scope: "meal:2026-11-09/3", Label: "Rest", DurationSeconds: 60}); !errors.Is(err, service.ErrInvalid) {
		t.Errorf("StartTimer(two-part) = %v, want ErrInvalid", err)
	}
}
