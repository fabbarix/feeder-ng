package httpapi

import (
	"context"
	"net/http"
	"strconv"

	"github.com/fabbarix/feeder-ng/internal/course"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

// list answers GET /api/courses: the active Courses in household order, plus the archived ones with ?archived=1.
func (a *api) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("archived")
	list, err := a.st.List(r.Context(), q == "1" || q == "true")
	if err != nil {
		a.fail(w, r, err, "")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"courses": coursesOut(list)})
}

// add answers POST /api/courses with the new Course, last in the order.
func (a *api) add(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name string `json:"name"`
	}
	if err := httpx.DecodeJSON(r, &in); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	c, err := a.st.Create(r.Context(), in.Name)
	if err != nil {
		a.fail(w, r, err, in.Name)
		return
	}
	a.changed("courses")
	l, err := a.listing(r.Context(), c.ID)
	if err != nil {
		a.fail(w, r, err, "")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, courseOut(l))
}

// patch answers PATCH /api/courses/{id}: a rename, Make main (main: true), or both, in that order.
func (a *api) patch(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r)
	if !ok {
		a.fail(w, r, course.ErrNotFound, "")
		return
	}
	var in struct {
		Name *string `json:"name"`
		Main *bool   `json:"main"`
	}
	if err := httpx.DecodeJSON(r, &in); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	if in.Name == nil && in.Main == nil {
		writeRefusal(w, http.StatusUnprocessableEntity, refusal{Code: "validation_failed", Field: "name",
			Reason: "nothing_to_change", Message: "Give a name or main to change"})
		return
	}
	if in.Main != nil && !*in.Main {
		writeRefusal(w, http.StatusUnprocessableEntity, refusal{Code: "validation_failed", Field: "main",
			Message: "Make another Course main instead"})
		return
	}
	c, err := a.st.Get(r.Context(), id)
	if err != nil {
		a.fail(w, r, err, "")
		return
	}
	// Refuse first, so a request that would fail on the flag does not rename the Course on the way.
	makeMain := in.Main != nil && !c.Main
	if makeMain && c.Archived {
		a.fail(w, r, course.ErrArchived, "")
		return
	}
	name := ""
	if in.Name != nil {
		name = *in.Name
		if _, err := a.st.Rename(r.Context(), id, name); err != nil {
			a.fail(w, r, err, name)
			return
		}
		a.changed("courses")
	}
	if makeMain {
		if _, err := a.st.MakeMain(r.Context(), id); err != nil {
			a.fail(w, r, err, "")
			return
		}
		// The walk order of the planner changes, so the Meal Slots replan too.
		a.changed("courses")
		a.changed("mealSlots")
	}
	l, err := a.listing(r.Context(), id)
	if err != nil {
		a.fail(w, r, err, "")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, courseOut(l))
}

// reorder answers PUT /api/courses/order with the active Courses in their new order.
func (a *api) reorder(w http.ResponseWriter, r *http.Request) {
	var in struct {
		IDs []int64 `json:"ids"`
	}
	if err := httpx.DecodeJSON(r, &in); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	if err := a.st.Reorder(r.Context(), in.IDs); err != nil {
		a.fail(w, r, err, "")
		return
	}
	a.changed("courses")
	list, err := a.st.List(r.Context(), false)
	if err != nil {
		a.fail(w, r, err, "")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"courses": coursesOut(list)})
}

// impact answers GET /api/courses/{id}/impact.
func (a *api) impact(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r)
	if !ok {
		a.fail(w, r, course.ErrNotFound, "")
		return
	}
	im, err := a.st.Impact(r.Context(), id)
	if err != nil {
		a.fail(w, r, err, "")
		return
	}
	names, err := a.recipeNames(r.Context())
	if err != nil {
		a.fail(w, r, err, "")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, impactOut(im, names))
}

// remove answers DELETE /api/courses/{id}?replacement=n. A Course that was never planned goes for good.
func (a *api) remove(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r)
	if !ok {
		a.fail(w, r, course.ErrNotFound, "")
		return
	}
	replacement, ok := replacementParam(r.URL.Query().Get("replacement"))
	if !ok {
		a.fail(w, r, course.ErrReplacement, "")
		return
	}
	if _, err := a.st.Delete(r.Context(), id, replacement); err != nil {
		a.fail(w, r, err, "")
		return
	}
	a.removed()
	w.WriteHeader(http.StatusNoContent)
}

// archive answers POST /api/courses/{id}/archive with the archived Course; the body may give replacementId.
func (a *api) archive(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r)
	if !ok {
		a.fail(w, r, course.ErrNotFound, "")
		return
	}
	var in struct {
		ReplacementID int64 `json:"replacementId"`
	}
	if r.ContentLength != 0 {
		if err := httpx.DecodeJSON(r, &in); err != nil {
			httpx.WriteAPIError(w, err)
			return
		}
	}
	if _, _, err := a.st.Archive(r.Context(), id, in.ReplacementID); err != nil {
		a.fail(w, r, err, "")
		return
	}
	if err := a.archivedLast(r.Context()); err != nil {
		a.fail(w, r, err, "")
		return
	}
	a.removed()
	l, err := a.listing(r.Context(), id)
	if err != nil {
		a.fail(w, r, err, "")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, courseOut(l))
}

// archivedLast puts the archived Courses after the active ones (the store's Archive keeps the position). It
// re-sends the active Courses in their current order through the store's Reorder, which renumbers them and
// moves the archived ones after them.
func (a *api) archivedLast(ctx context.Context) error {
	list, err := a.st.List(ctx, false)
	if err != nil {
		return err
	}
	ids := make([]int64, 0, len(list))
	for _, l := range list {
		ids = append(ids, l.ID)
	}
	return a.st.Reorder(ctx, ids)
}

// unarchive answers POST /api/courses/{id}/unarchive: the Course goes back last, restoring nothing.
func (a *api) unarchive(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r)
	if !ok {
		a.fail(w, r, course.ErrNotFound, "")
		return
	}
	if _, err := a.st.Unarchive(r.Context(), id); err != nil {
		a.fail(w, r, err, "")
		return
	}
	a.changed("courses")
	l, err := a.listing(r.Context(), id)
	if err != nil {
		a.fail(w, r, err, "")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, courseOut(l))
}

// removed publishes what a Delete or Archive changes: the Courses, the Meal Slots and the plan, and the
// Recipes (their Courses and unresolved meals went).
func (a *api) removed() {
	a.changed("courses")
	a.changed("mealSlots")
	a.recipesChanged("courses")
}

// replacementParam reads the replacement query value: "" is none given (0); anything that is not a
// number is refused (ok false).
func replacementParam(s string) (int64, bool) {
	if s == "" {
		return 0, true
	}
	n, err := strconv.ParseInt(s, 10, 64)
	return n, err == nil
}
