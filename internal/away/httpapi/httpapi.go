// Package httpapi exposes Away (beta.9, B9-24, PC-08, ADR 0025). Handlers are thin: parse, read what the domain needs,
// call package away, write through the planning Replanner (one replan, "changes" and "undoToken"), respond.
//
//	GET    /api/members/{id}/away              -> [Away]: the running and coming ones, soonest first
//	POST   /api/members/{id}/away[?dryRun=1]   -> 201 Away + changes + undoToken; a dry run answers the preview
//	PATCH  /api/away/{id}[?dryRun=1]           -> Away + changes + undoToken; a dry run answers the preview
//	POST   /api/away/{id}/end                  -> Away + changes + undoToken (409 away_not_started, away_over)
//	DELETE /api/away/{id}                      -> {id} + changes + undoToken (409 away_started)
//
// Every User. Each write publishes household {changed:"away"} for open screens; the replan is Apply's.
package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/away"
	"github.com/fabbarix/feeder-ng/internal/away/store"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/plan"
	planhttp "github.com/fabbarix/feeder-ng/internal/plan/httpapi"
	planstore "github.com/fabbarix/feeder-ng/internal/plan/store"
)

func init() { app.Register(app.Module{Name: "away", Mount: mount}) }

// undoName is the Away participant's name in the undo tokens; it stays the same across releases.
const undoName = "away"

type api struct {
	d  app.Deps
	hh *householdstore.Store
}

func mount(r *app.Router, d app.Deps) {
	planhttp.RegisterUndoFor(d.DB, undoName, store.Undo{})
	a := &api{d: d, hh: householdstore.New(d.DB, d.Clock)}
	r.User("GET /api/members/{id}/away", a.list)
	r.User("POST /api/members/{id}/away", a.create)
	r.User("PATCH /api/away/{id}", a.change)
	r.User("POST /api/away/{id}/end", a.end)
	r.User("DELETE /api/away/{id}", a.remove)
}

// scene is what the domain needs to decide on an Away: the household clock and date, and every Meal Slot.
type scene struct {
	loc   *time.Location
	now   time.Time // in loc
	today string
	slots []away.Slot
}

func (a *api) scene(ctx context.Context) (scene, error) {
	loc, err := store.Zone(ctx, a.d.DB)
	if err != nil {
		return scene{}, err
	}
	hs, err := a.hh.Slots(ctx)
	if err != nil {
		return scene{}, err
	}
	slots := store.SlotsOf(hs)
	now := a.d.Clock.Now().In(loc)
	return scene{loc: loc, now: now, today: now.Format("2006-01-02"), slots: slots}, nil
}

func pathID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil
}

func notFound(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusNotFound, "not_found", "There is no such Away.")
}

// writeErr answers a refused Away (422 with field and reason), an unknown one (404), or anything else (500).
func writeErr(w http.ResponseWriter, err error, memberName string) {
	var e *away.Error
	switch {
	case errors.As(err, &e):
		httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]any{
			"code": "validation_failed", "message": away.Message(e, memberName), "field": e.Field, "reason": e.Reason}})
	case errors.Is(err, store.ErrNotFound):
		notFound(w)
	case errors.Is(err, away.ErrNotStarted):
		httpx.WriteError(w, http.StatusConflict, "away_not_started", "This Away has not started: delete it instead.")
	case errors.Is(err, away.ErrOver):
		httpx.WriteError(w, http.StatusConflict, "away_over", "This Away is over already.")
	default:
		httpx.WriteAPIError(w, err)
	}
}

// list is GET /api/members/{id}/away: the Member's running and coming Aways, soonest first.
func (a *api) list(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, ok := pathID(r)
	if !ok {
		notFound(w)
		return
	}
	name, err := store.MemberName(ctx, a.d.DB, id)
	if err != nil {
		writeErr(w, err, "")
		return
	}
	sc, err := a.scene(ctx)
	if err != nil {
		writeErr(w, err, name)
		return
	}
	all, err := store.OfMember(ctx, a.d.DB, sc.loc, id)
	if err != nil {
		writeErr(w, err, name)
		return
	}
	out := []store.Wire{}
	for _, x := range all {
		if !away.Over(x, sc.now, sc.slots) {
			out = append(out, store.WireOf(x, name, away.Started(x, sc.now, sc.slots)))
		}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// written is the answer of a write: the Away beside "changes" and "undoToken".
type written struct {
	store.Wire
	planhttp.Replan
}

// apply writes through the planning Replanner (one replan and an undo token) and tells open screens.
func (a *api) apply(r *http.Request, mutate func(ctx context.Context, q store.Querier) error) (planhttp.Replan, error) {
	p := planhttp.ReplannerFor(a.d.DB)
	if p == nil {
		return planhttp.Replan{}, errors.New("away: the planning module is not mounted")
	}
	out, err := p.Apply(r, plan.ReasonAttendanceChanged, func(ctx context.Context, tx *sql.Tx, _ *planstore.Store) error {
		return mutate(ctx, tx)
	})
	if err != nil {
		return planhttp.Replan{}, err
	}
	a.d.Events.Publish("household", map[string]string{"changed": "away"})
	return out, nil
}

func dryRun(r *http.Request) bool { return r.URL.Query().Get("dryRun") == "1" }

// create is POST /api/members/{id}/away.
func (a *api) create(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, ok := pathID(r)
	if !ok {
		notFound(w)
		return
	}
	name, err := store.MemberName(ctx, a.d.DB, id)
	if err != nil {
		writeErr(w, err, "")
		return
	}
	var in awayIn
	if err := httpx.DecodeJSON(r, &in); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	sc, err := a.scene(ctx)
	if err != nil {
		writeErr(w, err, name)
		return
	}
	others, err := store.OfMember(ctx, a.d.DB, sc.loc, id)
	if err != nil {
		writeErr(w, err, name)
		return
	}
	x, err := in.create(id, sc.now)
	if err == nil {
		err = away.Validate(x, sc.today, nil, others, sc.slots)
	}
	if err != nil {
		writeErr(w, err, name)
		return
	}
	if dryRun(r) {
		a.preview(w, r, sc, x, nil)
		return
	}
	out, err := a.apply(r, func(ctx context.Context, q store.Querier) error {
		id, ierr := store.Insert(ctx, q, x)
		x.ID = id
		return ierr
	})
	if err != nil {
		writeErr(w, err, name)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, written{store.WireOf(x, name, away.Started(x, sc.now, sc.slots)), out})
}

// stored reads the Away of the {id} path segment with its Member's name.
func (a *api) stored(r *http.Request, sc scene) (away.Away, string, error) {
	id, ok := pathID(r)
	if !ok {
		return away.Away{}, "", store.ErrNotFound
	}
	x, err := store.Get(r.Context(), a.d.DB, sc.loc, id)
	if err != nil {
		return away.Away{}, "", err
	}
	name, err := store.MemberName(r.Context(), a.d.DB, x.MemberID)
	return x, name, err
}

// change is PATCH /api/away/{id}: the fields sent change, the others stay.
func (a *api) change(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sc, err := a.scene(ctx)
	if err != nil {
		writeErr(w, err, "")
		return
	}
	before, name, err := a.stored(r, sc)
	if err != nil {
		writeErr(w, err, "")
		return
	}
	var in awayPatch
	if err := httpx.DecodeJSON(r, &in); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	others, err := store.OfMember(ctx, a.d.DB, sc.loc, before.MemberID)
	if err != nil {
		writeErr(w, err, name)
		return
	}
	x, err := in.apply(before, sc.now)
	if err == nil {
		err = away.CheckStart(x, before, sc.now, sc.slots)
	}
	if err == nil {
		err = away.Validate(x, sc.today, &before, others, sc.slots)
	}
	if err != nil {
		writeErr(w, err, name)
		return
	}
	if dryRun(r) {
		a.preview(w, r, sc, x, &before)
		return
	}
	out, err := a.apply(r, func(ctx context.Context, q store.Querier) error { return store.Update(ctx, q, x) })
	if err != nil {
		writeErr(w, err, name)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, written{store.WireOf(x, name, away.Started(x, sc.now, sc.slots)), out})
}

// end is POST /api/away/{id}/end: the Member is back from the next Meal Slot.
func (a *api) end(w http.ResponseWriter, r *http.Request) {
	sc, err := a.scene(r.Context())
	if err != nil {
		writeErr(w, err, "")
		return
	}
	before, name, err := a.stored(r, sc)
	if err != nil {
		writeErr(w, err, "")
		return
	}
	x, err := away.End(before, sc.now, sc.slots)
	if err != nil {
		writeErr(w, err, name)
		return
	}
	out, err := a.apply(r, func(ctx context.Context, q store.Querier) error { return store.Update(ctx, q, x) })
	if err != nil {
		writeErr(w, err, name)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, written{store.WireOf(x, name, true), out})
}

// remove is DELETE /api/away/{id}: only an Away that has not started (a started one is ended).
func (a *api) remove(w http.ResponseWriter, r *http.Request) {
	sc, err := a.scene(r.Context())
	if err != nil {
		writeErr(w, err, "")
		return
	}
	x, name, err := a.stored(r, sc)
	if err != nil {
		writeErr(w, err, "")
		return
	}
	if away.Started(x, sc.now, sc.slots) {
		httpx.WriteError(w, http.StatusConflict, "away_started", "This Away has started: end it instead.")
		return
	}
	out, err := a.apply(r, func(ctx context.Context, q store.Querier) error { return store.Delete(ctx, q, x.ID) })
	if err != nil {
		writeErr(w, err, name)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		ID int64 `json:"id"`
		planhttp.Replan
	}{x.ID, out})
}
