package httpapi_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B5-SD (ADR 0014, spec §18): the plan, the lists and the board carry the date's facts. The fixture is crsc2 (Monday
// Dinner 19:00, Main then Side, Anna and Sam; today Monday 2026-11-09 12:00). Test-first.

type sdSlot struct {
	Time      string  `json:"time"`
	UsualTime string  `json:"usualTime"`
	At        string  `json:"at"`
	NotServed bool    `json:"notServed"`
	Guests    int     `json:"guests"`
	Portions  float64 `json:"portions"`
	Courses   []struct {
		CourseID int64     `json:"courseId"`
		Meal     *mealBody `json:"meal"`
		Unfilled *struct {
			Reason string `json:"reason"`
		} `json:"unfilled"`
		Unserved *string `json:"unserved"`
	} `json:"courses"`
}

func sdWaitIdle(t *testing.T, w *crsc2.World) {
	t.Helper()
	time.Sleep(150 * time.Millisecond)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := w.Env.App.WaitIdle(ctx); err != nil {
		t.Fatalf("the planner did not settle: %v", err)
	}
}

func sdPlanSlot(t *testing.T, w *crsc2.World, date string) sdSlot {
	t.Helper()
	r := w.User.Get("/api/plan?from=" + date + "&to=" + date)
	var out struct {
		Slots []sdSlot `json:"slots"`
	}
	r.MustJSON(t, &out)
	if r.Status != 200 || len(out.Slots) != 1 {
		t.Fatalf("GET /api/plan = %d %s", r.Status, r.Body)
	}
	return out.Slots[0]
}

func TestThePlanSlotHasTheUsualTimeNoGuestsAndIsServed(t *testing.T) {
	w := crsc2.New(t)
	s := sdPlanSlot(t, w, crsc2.Today)
	if s.Time != "19:00" || s.UsualTime != "19:00" || s.NotServed || s.Guests != 0 {
		t.Errorf("slot = %+v, want 19:00 usually 19:00, served, no Guests", s)
	}
}

func TestThePlanFollowsTheDatesTime(t *testing.T) {
	w := crsc2.New(t)
	if r := w.User.Patch(path2("/api/meal-slots/%d/dates/%s", w.Slot, crsc2.Today), map[string]any{"time": "20:15"}); r.Status != 200 {
		t.Fatalf("PATCH = %d %s", r.Status, r.Body)
	}
	s := sdPlanSlot(t, w, crsc2.Today)
	if s.Time != "20:15" || s.UsualTime != "19:00" || !strings.Contains(s.At, "T20:15:00") {
		t.Errorf("slot = %+v, want time 20:15, usually 19:00, at 20:15", s)
	}
	if other := sdPlanSlot(t, w, "2026-11-16"); other.Time != "19:00" {
		t.Errorf("next Monday = %+v, want the usual 19:00", other)
	}
}

func TestGuestsRaiseThePortionsOfEveryPlannedCourse(t *testing.T) {
	w := crsc2.New(t)
	w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	if r := w.User.Put(path2("/api/meal-slots/%d/attendance?date=%s", w.Slot, crsc2.Today), map[string]any{"guests": 2}); r.Status != 200 {
		t.Fatalf("PUT = %d %s", r.Status, r.Body)
	}
	sdWaitIdle(t, w)
	s := sdPlanSlot(t, w, crsc2.Today)
	if s.Guests != 2 || s.Portions != 4 {
		t.Errorf("slot = %+v, want 2 Guests and 4 portions", s)
	}
	planned := 0
	for _, c := range s.Courses {
		if c.Meal != nil {
			planned++
			if c.Meal.Portions != 4 || c.Meal.Batches != 2 {
				t.Errorf("Course %d meal = %+v, want 4 portions in 2 Batches (yield 2)", c.CourseID, c.Meal)
			}
		}
	}
	if planned != 2 {
		t.Errorf("%d Courses planned, want Main and Side", planned)
	}
}

func TestANotServedSlotShowsNoMealNoReasonAndEveryCourseUnserved(t *testing.T) {
	w := crsc2.New(t)
	w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	if r := w.User.Patch(path2("/api/meal-slots/%d/dates/%s", w.Slot, crsc2.Today), map[string]any{"notServed": true}); r.Status != 200 {
		t.Fatalf("PATCH = %d %s", r.Status, r.Body)
	}
	sdWaitIdle(t, w)
	s := sdPlanSlot(t, w, crsc2.Today)
	if !s.NotServed || len(s.Courses) != 2 {
		t.Fatalf("slot = %+v, want Not served with its 2 Courses", s)
	}
	for _, c := range s.Courses {
		if c.Meal != nil || c.Unfilled != nil || c.Unserved == nil || *c.Unserved != "not_served" {
			t.Errorf("Course %d = %+v, want unserved \"not_served\" with no meal and no reason", c.CourseID, c)
		}
	}
	var couldnt struct {
		Entries []any `json:"entries"`
	}
	r := w.User.Get("/api/plan/couldnt-plan")
	r.MustJSON(t, &couldnt)
	if r.Status != 200 || strings.Contains(string(r.Body), `"no_attendance"`) {
		t.Errorf("couldnt-plan = %d %s, want nothing for a Not served date", r.Status, r.Body)
	}
	// Serving again plans the slot afresh.
	w.User.Patch(path2("/api/meal-slots/%d/dates/%s", w.Slot, crsc2.Today), map[string]any{"notServed": false})
	sdWaitIdle(t, w)
	s = sdPlanSlot(t, w, crsc2.Today)
	if s.NotServed {
		t.Fatalf("slot = %+v, want served again", s)
	}
	for _, c := range s.Courses {
		if c.Meal == nil {
			t.Errorf("Course %d has no meal after Plan Dinner again", c.CourseID)
		}
	}
}

func TestANotServedTonightIsOnTheBoard(t *testing.T) {
	w := crsc2.New(t)
	w.User.Patch(path2("/api/meal-slots/%d/dates/%s", w.Slot, crsc2.Today), map[string]any{"notServed": true})
	sdWaitIdle(t, w)
	r := w.User.Get("/api/board")
	if r.Status != 200 || !strings.Contains(string(r.Body), `"notServed":true`) {
		t.Errorf("board = %d %s, want tonight's slot with notServed true", r.Status, r.Body)
	}
}

func path2(format string, a ...any) string { return fmt.Sprintf(format, a...) }
