package httpapi

import (
	"net/http"
	"strconv"

	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/tag"
)

// list answers GET /api/tags: every Tag by name, with its counts.
func (a *api) list(w http.ResponseWriter, r *http.Request) {
	list, err := a.st.List(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, tagsOut(list))
}

// create answers POST /api/tags with the new Tag (201). An empty colour takes the next one.
func (a *api) create(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name   string `json:"name"`
		Colour string `json:"colour"`
	}
	if err := httpx.DecodeJSON(r, &in); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	t, err := a.st.Create(r.Context(), in.Name, in.Colour)
	if err != nil {
		a.fail(w, err)
		return
	}
	a.changed(false)
	l, err := a.listing(r.Context(), t.ID)
	if err != nil {
		a.fail(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, tagOut(l))
}

// patch answers PATCH /api/tags/{id}: a rename, a recolour, or both.
func (a *api) patch(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r)
	if !ok {
		a.fail(w, tag.ErrNotFound)
		return
	}
	var in struct {
		Name   *string `json:"name"`
		Colour *string `json:"colour"`
	}
	if err := httpx.DecodeJSON(r, &in); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	if in.Name == nil && in.Colour == nil {
		writeRefusal(w, http.StatusUnprocessableEntity, refusal{Code: "validation_failed", Field: "name",
			Reason: "nothing_to_change", Message: "Give a name or a colour to change"})
		return
	}
	res, err := a.st.Update(r.Context(), id, in.Name, in.Colour)
	if err != nil {
		a.fail(w, err)
		return
	}
	// A respell (same key) is still a rename here: the Recipes' Tags are republished.
	a.changed(in.Name != nil)
	a.invalidateIfRules(res.RulesChanged)
	l, err := a.listing(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, tagOut(l))
}

// impact answers GET /api/tags/{id}/impact, with bothRecipes when ?into= names another Tag.
func (a *api) impact(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r)
	if !ok {
		a.fail(w, tag.ErrNotFound)
		return
	}
	var into *int64
	if r.URL.Query().Has("into") {
		n, err := strconv.ParseInt(r.URL.Query().Get("into"), 10, 64)
		if err != nil {
			writeRefusal(w, http.StatusUnprocessableEntity, refusal{Code: "validation_failed", Field: "into",
				Message: "Choose another Tag to merge into"})
			return
		}
		into = &n
	}
	im, err := a.st.Impact(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	out := impactOut(im)
	if into != nil {
		both, err := a.st.BothRecipes(r.Context(), id, *into)
		if err != nil {
			a.fail(w, err)
			return
		}
		out.BothRecipes = &both
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// merge answers POST /api/tags/{id}/merge {into}: the source goes, its Recipes and rules move to the
// target. The answer is the target with its new counts.
func (a *api) merge(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r)
	if !ok {
		a.fail(w, tag.ErrNotFound)
		return
	}
	var in struct {
		Into int64 `json:"into"`
	}
	if err := httpx.DecodeJSON(r, &in); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	res, err := a.st.Merge(r.Context(), id, in.Into)
	if err != nil {
		a.fail(w, err)
		return
	}
	a.changed(true)
	a.invalidateIfRules(res.RulesChanged)
	l, err := a.listing(r.Context(), in.Into)
	if err != nil {
		a.fail(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, tagOut(l))
}

// remove answers DELETE /api/tags/{id} with 204. It is never refused.
func (a *api) remove(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r)
	if !ok {
		a.fail(w, tag.ErrNotFound)
		return
	}
	res, err := a.st.Delete(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	a.changed(true)
	a.invalidateIfRules(res.RulesChanged)
	w.WriteHeader(http.StatusNoContent)
}

// invalidateIfRules tells the planner that rules moved or went. It goes last among the events:
// the Runner keeps the last reason of the invalidations it coalesces (tg-plan §3.1a).
func (a *api) invalidateIfRules(rulesChanged bool) {
	if rulesChanged {
		plan.Invalidate(a.d.Events, plan.ReasonRulesChanged)
	}
}

// idParam reads the {id} path segment; a non-numeric id is not a Tag.
func idParam(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil
}
