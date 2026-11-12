package httpapi_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// Team C3 (docs/dev/design/crs-c3.md §1): the course-less plan routes are gone. Every Planned Meal route names its
// Course by its real id, the main Course included. The old per-slot paths answer 404 for every method: they are
// registered explicitly, because otherwise Go's ServeMux answers 405 through PUT .../{slotId}/{courseId}.

// oldRoutes are the routes C3 removes, with the method they had.
func oldRoutes(w *crsc2.World, date string) []struct{ method, path, label string } {
	base := "/api/plan/" + date + "/" + itoa(w.Slot)
	return []struct{ method, path, label string }{
		{http.MethodPut, base, "set"},
		{http.MethodPost, base + "/confirm", "confirm"},
		{http.MethodPost, base + "/unpin", "unpin"},
		{http.MethodGet, base + "/alternatives", "alternatives"},
		{http.MethodGet, base + "/cook", "cook preview"},
		{http.MethodPost, base + "/cooked", "cooked"},
		{http.MethodPost, base + "/not-cooked", "not-cooked"},
	}
}

func TestTheCourselessPlanRoutesAnswer404(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	for _, rt := range oldRoutes(w, crsc2.Today) {
		r := w.User.Do(rt.method, rt.path, map[string]any{"recipeId": roast})
		if r.Status != http.StatusNotFound {
			t.Errorf("old %s %s = %d %s, want 404 (never 405, never the main Course)", rt.method, rt.path, r.Status, r.Body)
		}
	}
	// Whatever the method: a removed path is not a path with another method.
	for _, rt := range oldRoutes(w, crsc2.Today) {
		for _, m := range []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete} {
			if r := w.User.Do(m, rt.path, nil); r.Status != http.StatusNotFound && !(m == rt.method) {
				t.Errorf("%s %s = %d, want 404 for every method", m, rt.path, r.Status)
			}
		}
	}
}

// The old per-slot Cooked and Not cooked paths never act: an old SPA cached by the service worker cannot mark anything.
func TestTheOldPerSlotPathsChangeNothing(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)
	base := "/api/plan/" + crsc2.Today + "/" + itoa(w.Slot)
	w.User.Post(base+"/cooked", map[string]any{})
	w.User.Post(base+"/not-cooked", nil)
	w.User.Post(base+"/confirm", nil)
	w.User.Put(base, map[string]any{"recipeId": roast})
	for _, c := range []int64{w.Main, w.Side} {
		if st := w.MealState(crsc2.Today, w.Slot, c); st != "planned" {
			t.Errorf("Course %d is %q after the old calls, want planned", c, st)
		}
	}
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE pinned = 1`); n != 0 {
		t.Errorf("%d pinned meals after the old calls, want 0", n)
	}
}

// The routes that stay: the Course routes with the main Course's real id, the literal all routes, the lists.
func TestTheCourseRoutesAndTheAllRoutesStay(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)
	for _, c := range []struct {
		method, path string
	}{
		{http.MethodGet, path(w, crsc2.Today, w.Main, "/alternatives")},
		{http.MethodGet, path(w, crsc2.Today, w.Main, "/cook")},
		{http.MethodPost, path(w, crsc2.Today, w.Main, "/confirm")},
		{http.MethodPost, path(w, crsc2.Today, w.Main, "/unpin")},
	} {
		if r := w.User.Do(c.method, c.path, nil); r.Status != 200 {
			t.Errorf("%s %s = %d %s, want 200", c.method, c.path, r.Status, r.Body)
		}
	}
	// "all" is a literal, never a Course id.
	if r := w.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(w.Slot)+"/all/cooked", map[string]any{}); r.Status != 200 {
		t.Errorf("all/cooked = %d %s", r.Status, r.Body)
	}
	if r := w.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(w.Slot)+"/all/not-cooked", nil); r.Status != 200 && r.Status != 409 {
		t.Errorf("all/not-cooked = %d %s", r.Status, r.Body)
	}
	for _, p := range []string{"/api/plan/to-confirm", "/api/plan/couldnt-plan", "/api/plan/couldnt-plan/exclusions", "/api/plan/leftovers"} {
		if r := w.User.Get(p); r.Status != 200 {
			t.Errorf("GET %s = %d", p, r.Status)
		}
	}
}

// A Course id of 0 is not the main Course: it names nothing.
func TestCourseZeroInAPlanRouteIsNotTheMainCourse(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	if r := w.User.Post(path(w, crsc2.Today, 0, "/confirm"), nil); r.Status != http.StatusNotFound {
		t.Errorf("confirm on Course 0 = %d %s, want 404", r.Status, r.Body)
	}
	if r := w.User.Put(path(w, crsc2.Today, 0, ""), map[string]any{"recipeId": roast}); r.Status != http.StatusNotFound {
		t.Errorf("PUT on Course 0 = %d %s, want 404", r.Status, r.Body)
	}
}

// GET /api/plan: a slot loses meal and unfilled (spec §16); the Course rows carry them. The board's slots too.
func TestSlotsCarryNoMealOrUnfilledAlias(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	for _, p := range []string{"/api/plan?from=" + crsc2.Today + "&to=" + crsc2.Today, "/api/board"} {
		r := w.User.Get(p)
		if r.Status != 200 {
			t.Fatalf("GET %s = %d %s", p, r.Status, r.Body)
		}
		var raw map[string]json.RawMessage
		r.MustJSON(t, &raw)
		var slots []map[string]json.RawMessage
		for _, key := range []string{"slots", "tonight", "tomorrow"} {
			if v, ok := raw[key]; ok {
				var list []map[string]json.RawMessage
				if json.Unmarshal(v, &list) == nil {
					slots = append(slots, list...)
				}
			}
		}
		if p != "/api/board" && len(slots) == 0 {
			t.Fatalf("GET %s: no slots in %s", p, r.Body)
		}
		for _, s := range slots {
			for _, gone := range []string{"meal", "unfilled"} {
				if _, ok := s[gone]; ok {
					t.Errorf("GET %s: a slot still carries %q: %s", p, gone, r.Body)
				}
			}
			if _, ok := s["courses"]; !ok {
				t.Errorf("GET %s: a slot has no courses: %s", p, r.Body)
			}
		}
	}
}
