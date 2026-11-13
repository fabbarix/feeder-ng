package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
)

// Leftovers by hand (ADR 0012, docs/dev/design/b5-lo.md §4): the five routes. Handlers are thin: they parse, call the
// runner and answer. ?dryRun=1 on the portion actions and on Freeze it runs every check and names the Planned Meals that
// would be replanned, and writes nothing.

func (a *api) leftoverRoutes(r *app.Router) {
	r.User("POST /api/plan/leftovers/{id}/had-it", a.hadIt)
	r.User("POST /api/plan/leftovers/{id}/threw-out", a.threwOut)
	r.User("POST /api/plan/leftovers/{id}/freeze", a.freezeLeftover)
	r.User("POST /api/plan/leftovers/{id}/take-out", a.takeOut)
	r.User("POST /api/plan/leftovers/{id}/answer", a.answer)
}

// leftoverID reads {id} of a Leftover route; ok is false for anything but a positive integer.
func leftoverID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil && id > 0
}

// dryRun says whether the request asks for a preview (?dryRun=1).
func dryRun(r *http.Request) bool { return r.URL.Query().Get("dryRun") == "1" }

// previewCtx is the context of an action: a preview when the request asks for one.
func previewCtx(r *http.Request) context.Context {
	if dryRun(r) {
		return runner.Dry(r.Context())
	}
	return r.Context()
}

// actingUser is the User who acts (0 when there is none).
func actingUser(r *http.Request) int64 {
	u, _ := auth.UserFrom(r.Context())
	return u.ID
}

// replannedOut names the Planned Meals that lost their portions: the Leftover's Recipe is what they were going to have.
func (a *api) replannedOut(ctx context.Context, keys []plan.Key, recipeID int64) ([]plannedForOut, error) {
	t, err := a.names.load(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]plannedForOut, 0, len(keys))
	for _, k := range keys {
		out = append(out, plannedForOut{Date: k.Date, MealSlotID: k.MealSlotID, MealSlotName: t.slots[k.MealSlotID],
			RecipeName: t.recipes[recipeID], CourseID: k.CourseID})
	}
	return out, nil
}

// preview answers a dry run: the Planned Meals the action would replan, and nothing written.
func (a *api) preview(w http.ResponseWriter, r *http.Request, err error, keys []plan.Key, recipeID int64) {
	if err != nil && !errors.Is(err, runner.ErrDryRun) {
		writeErr(w, err)
		return
	}
	out, lerr := a.replannedOut(r.Context(), keys, recipeID)
	if lerr != nil {
		writeErr(w, lerr)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"replanned": out})
}

// leftoverNow reads the Leftover id as it is after an action, in the list's shape.
func (a *api) leftoverNow(ctx context.Context, id int64) (leftoverOut, error) {
	v, err := a.run.LeftoverView(ctx, id)
	if err != nil {
		return leftoverOut{}, err
	}
	t, err := a.names.load(ctx)
	if err != nil {
		return leftoverOut{}, err
	}
	return leftoverViewFor(v, t), nil
}

// replyLeftover answers an action with the Leftover after it and the meals replanned.
func (a *api) replyLeftover(w http.ResponseWriter, r *http.Request, id int64, keys []plan.Key, recipeID int64) {
	l, err := a.leftoverNow(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	out, err := a.replannedOut(r.Context(), keys, recipeID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"leftover": l, "replanned": out})
}

func (a *api) hadIt(w http.ResponseWriter, r *http.Request) {
	id, ok := leftoverID(r)
	if !ok {
		writeErr(w, runner.ErrNotFound)
		return
	}
	var body struct {
		Portions float64 `json:"portions"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	res, err := a.run.HadIt(previewCtx(r), id, body.Portions, actingUser(r))
	if dryRun(r) {
		a.preview(w, r, err, res.Replanned, res.Leftover.RecipeID)
		return
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	a.replyLeftover(w, r, id, res.Replanned, res.Leftover.RecipeID)
}

func (a *api) threwOut(w http.ResponseWriter, r *http.Request) {
	id, ok := leftoverID(r)
	if !ok {
		writeErr(w, runner.ErrNotFound)
		return
	}
	var body struct {
		Portions float64 `json:"portions"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	res, err := a.run.ThrewOut(previewCtx(r), id, body.Portions, actingUser(r))
	if dryRun(r) {
		a.preview(w, r, err, res.Replanned, res.Leftover.RecipeID)
		return
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	a.replyLeftover(w, r, id, res.Replanned, res.Leftover.RecipeID)
}

func (a *api) freezeLeftover(w http.ResponseWriter, r *http.Request) {
	id, ok := leftoverID(r)
	if !ok {
		writeErr(w, runner.ErrNotFound)
		return
	}
	var body struct {
		StoragePlaceID int64    `json:"storagePlaceId"`
		Portions       *float64 `json:"portions"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	res, err := a.run.Freeze(previewCtx(r), id, body.StoragePlaceID, body.Portions, actingUser(r))
	if dryRun(r) {
		a.preview(w, r, err, res.Replanned, res.Frozen.RecipeID)
		return
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	ctx := r.Context()
	frozen, err := a.leftoverNow(ctx, res.Frozen.ID)
	if err != nil {
		writeErr(w, err)
		return
	}
	var left *leftoverOut
	if res.Left != nil {
		l, err := a.leftoverNow(ctx, res.Left.ID)
		if err != nil {
			writeErr(w, err)
			return
		}
		left = &l
	}
	out, err := a.replannedOut(ctx, res.Replanned, res.Frozen.RecipeID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"frozen": frozen, "left": left, "replanned": out})
}

func (a *api) takeOut(w http.ResponseWriter, r *http.Request) {
	id, ok := leftoverID(r)
	if !ok {
		writeErr(w, runner.ErrNotFound)
		return
	}
	var body struct {
		StoragePlaceID *int64 `json:"storagePlaceId"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	var place int64
	if body.StoragePlaceID != nil {
		place = *body.StoragePlaceID
	}
	res, err := a.run.TakeOut(previewCtx(r), id, place, actingUser(r))
	if dryRun(r) {
		a.preview(w, r, err, res.Replanned, res.Leftover.RecipeID)
		return
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	l, err := a.leftoverNow(r.Context(), res.Leftover.ID)
	if err != nil {
		writeErr(w, err)
		return
	}
	out, err := a.replannedOut(r.Context(), res.Replanned, res.Leftover.RecipeID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, takeOutOut{Leftover: l, Replanned: out})
}

// takeOutOut answers Take out: the Leftover after it, and the Planned Meals that were unpinned to be planned again (ADR 0012).
type takeOutOut struct {
	Leftover  leftoverOut     `json:"leftover"`
	Replanned []plannedForOut `json:"replanned"`
}

func (a *api) answer(w http.ResponseWriter, r *http.Request) {
	id, ok := leftoverID(r)
	if !ok {
		writeErr(w, runner.ErrNotFound)
		return
	}
	var body struct {
		Answer string `json:"answer"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	if err := a.run.Answer(r.Context(), id, plan.LeftoverAnswer(body.Answer), actingUser(r)); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
