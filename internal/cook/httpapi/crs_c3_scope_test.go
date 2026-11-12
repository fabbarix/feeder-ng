package httpapi_test

import (
	"net/http"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// Team C3 (docs/dev/design/crs-c3.md §1, §2): the two-part Cook Mode route and the two-part scope are gone.

func TestTheTwoPartCookModeRouteAnswers404(t *testing.T) {
	w, _, _ := twoCourses(t)
	for _, m := range []string{http.MethodGet, http.MethodPost, http.MethodPut} {
		if r := w.User.Do(m, slotPath(w, ""), nil); r.Status != http.StatusNotFound {
			t.Errorf("%s %s = %d %s, want 404 (the main Course is opened by its own id)", m, slotPath(w, ""), r.Status, r.Body)
		}
	}
	// The routes that stay.
	if r := w.User.Get(slotPath(w, "/all")); r.Status != 200 {
		t.Errorf("timeline = %d %s", r.Status, r.Body)
	}
	if r := w.User.Get(slotPath(w, "/"+id(w.Main))); r.Status != 200 {
		t.Errorf("the Main by its own id = %d %s", r.Status, r.Body)
	}
	if r := w.User.Get(slotPath(w, "/0")); r.Status != http.StatusNotFound {
		t.Errorf("Course 0 = %d %s, want 404 (it names no Course)", r.Status, r.Body)
	}
}

func TestATwoPartScopeIsInvalid(t *testing.T) {
	w, _, _ := twoCourses(t)
	two := slotScope(w)
	// The code is 422 invalid_scope, as for every unparseable scope (the spec's "400" is corrected by H).
	wantErr(t, "a timer on a two-part scope", w.User.Post("/api/cook/timers", map[string]any{"scope": two, "step": 1, "label": "Rest", "durationSeconds": 60}), 422, "invalid_scope")
	wantErr(t, "a mark on a two-part scope", w.User.Put("/api/cook/marks", map[string]any{"scope": two, "step": 0, "done": true}), 422, "invalid_scope")
	// Course 0 spelled out is no better.
	wantErr(t, "a scope of Course 0", w.User.Post("/api/cook/timers", map[string]any{"scope": two + "/0", "step": 1}), 422, "invalid_scope")
}

// Marking the Main Cooked cancels the timers of its three-part scope, and only those (the plan's OnResolved hook
// used to rely on the store mapping the main Course to the two-part form).
func TestResolvingTheMainCancelsTheTimersOfItsThreePartScope(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{Steps: []crsc2.Step{
		{Text: "Prep", Kind: "active", Minutes: 5}, {Text: "Rest", Kind: "passive", Minutes: 10, After: []int{0}}}})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Steps: []crsc2.Step{
		{Text: "Prep", Kind: "active", Minutes: 5}, {Text: "Simmer", Kind: "passive", Minutes: 15, After: []int{0}}}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)
	if r := w.User.Post("/api/cook/timers", map[string]any{"scope": mainScope(w), "step": 1}); r.Status != 201 {
		t.Fatalf("start the Main's Rest = %d %s", r.Status, r.Body)
	}
	if r := w.User.Post("/api/cook/timers", map[string]any{"scope": sideScope(w), "step": 1}); r.Status != 201 {
		t.Fatalf("start the Side's Simmer = %d %s", r.Status, r.Body)
	}
	if r := w.User.Post("/api/plan/"+crsc2.Today+"/"+id(w.Slot)+"/"+id(w.Main)+"/cooked", map[string]any{}); r.Status != 200 {
		t.Fatalf("mark the Main Cooked = %d %s", r.Status, r.Body)
	}
	if n := w.Count(`SELECT count(*) FROM cook_timers WHERE scope = ?`, mainScope(w)); n != 0 {
		t.Errorf("%d timers of the Main left after it was Cooked", n)
	}
	if n := w.Count(`SELECT count(*) FROM cook_timers WHERE scope = ?`, sideScope(w)); n != 1 {
		t.Errorf("%d timers of the Side, want its one untouched", n)
	}
}
