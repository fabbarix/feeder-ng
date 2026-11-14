package httpapi

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
)

// B9-11 (PC-01, SAFE-03, SAFE-07): what a replanning write changed and its undo token, POST /api/plan/restore, and the
// Reopen routes that take Cooked and Not cooked back.

// actorCtx is the request's context with its User as the Actor of the writes made with it (the plan event names them).
func actorCtx(r *http.Request) context.Context {
	ctx := r.Context()
	if u, ok := auth.UserFrom(ctx); ok {
		ctx = runner.WithActor(ctx, runner.Actor{UserID: u.ID, Name: u.DisplayName})
	}
	return ctx
}

// cellStateOut is one side of a change.
type cellStateOut struct {
	RecipeID           int64  `json:"recipeId"`
	RecipeName         string `json:"recipeName"`
	ServedFromLeftover bool   `json:"servedFromLeftover"`
}

// changeOut is one cell a write changed beyond its target: what it held before and holds now (null when empty), and the
// why chips of the new meal.
type changeOut struct {
	Date       string        `json:"date"`
	MealSlotID int64         `json:"mealSlotId"`
	CourseID   int64         `json:"courseId"`
	Before     *cellStateOut `json:"before"`
	After      *cellStateOut `json:"after"`
	Why        []whyOut      `json:"why"`
}

// replanOut is what every replanning write adds to its answer: the cells it changed beyond its target (never null) and
// the token that undoes it (left out when it issued none).
type replanOut struct {
	Changes   []changeOut `json:"changes"`
	UndoToken string      `json:"undoToken,omitempty"`
}

func cellStateFor(c *plan.CellState) *cellStateOut {
	if c == nil {
		return nil
	}
	return &cellStateOut{RecipeID: c.RecipeID, RecipeName: c.RecipeName, ServedFromLeftover: c.ServedFromLeftover}
}

func changesFor(cs []plan.CellChange, t table) []changeOut {
	out := make([]changeOut, 0, len(cs))
	for _, c := range cs {
		out = append(out, changeOut{Date: c.Date, MealSlotID: c.MealSlotID, CourseID: c.CourseID,
			Before: cellStateFor(c.Before), After: cellStateFor(c.After), Why: whyFor(c.Why, t)})
	}
	return out
}

func replanFor(o *runner.Outcome, t table) replanOut {
	return replanOut{Changes: changesFor(o.Changes, t), UndoToken: o.UndoToken}
}

// mealReplanReply answers Pin and Unpin: the meal as it is now, with the write's changes and undo token.
func (a *api) mealReplanReply(w http.ResponseWriter, r *http.Request, m plan.Meal, o *runner.Outcome, err error) {
	if err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(r.Context(), &m)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		*mealOut
		replanOut
	}{mealFor(m, t), replanFor(o, t)})
}

// restore is POST /api/plan/restore {undoToken}: the plan as it was before the write that issued the token, while
// nothing else has written since (409 plan_changed); an unknown token is 404 not_found.
func (a *api) restore(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UndoToken string `json:"undoToken"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	if strings.TrimSpace(body.UndoToken) == "" {
		httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]any{
			"code": "validation_failed", "message": messageFor("validation_failed"), "field": "undoToken"}})
		return
	}
	res, err := a.run.Restore(actorCtx(r), body.UndoToken)
	if err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"changes": changesFor(res.Changes, t)})
}

// reopen is POST .../{courseId}/reopen: Cooked or Not cooked taken back (every Course of a Mark all).
func (a *api) reopen(w http.ResponseWriter, r *http.Request) {
	k, ok := key(r)
	if !ok {
		unknownSlot(w)
		return
	}
	res, err := a.run.Reopen(actorCtx(r), k)
	a.reopenReply(w, r, res, err)
}

// reopenAll is POST .../all/reopen: every Course of the slot occurrence that was marked.
func (a *api) reopenAll(w http.ResponseWriter, r *http.Request) {
	k, ok := slotKey(r)
	if !ok {
		unknownSlot(w)
		return
	}
	res, err := a.run.ReopenAll(actorCtx(r), k.Date, k.MealSlotID)
	a.reopenReply(w, r, res, err)
}

// reopenReply answers {meals, stockGone}: the meals open again ([] when nothing was marked) and the Stock Lots that were
// gone, whose Stock was not put back.
func (a *api) reopenReply(w http.ResponseWriter, r *http.Request, res runner.ReopenResult, err error) {
	if err != nil {
		writeErr(w, err)
		return
	}
	metas := make([]*plan.Meal, 0, len(res.Meals))
	for i := range res.Meals {
		metas = append(metas, &res.Meals[i])
	}
	t, err := a.names.load(r.Context(), metas...)
	if err != nil {
		writeErr(w, err)
		return
	}
	meals := make([]*mealOut, 0, len(res.Meals))
	for _, m := range res.Meals {
		meals = append(meals, mealFor(m, t))
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"meals": meals, "stockGone": res.StockGone})
}

// resolutionOut is how a Cooked or Not cooked meal was marked, for its Planned Meal sheet: by whom and when, the
// Leftover portions Cooked kept, and whether it can still be undone (cannotUndo says why not).
type resolutionOut struct {
	Kind             string  `json:"kind"`
	MarkedOn         string  `json:"markedOn,omitempty"`
	MarkedAt         string  `json:"markedAt,omitempty"`
	MarkedBy         string  `json:"markedBy,omitempty"`
	LeftoverPortions float64 `json:"leftoverPortions"`
	CanUndo          bool    `json:"canUndo"`
	CannotUndo       string  `json:"cannotUndo,omitempty"`
}

func resolutionFor(res *runner.Resolution) *resolutionOut {
	if res == nil {
		return nil
	}
	out := &resolutionOut{Kind: res.Kind, MarkedOn: res.MarkedOn, MarkedBy: res.UserName,
		LeftoverPortions: res.LeftoverPortions, CanUndo: res.CanUndo, CannotUndo: res.CannotUndo}
	if !res.MarkedAt.IsZero() {
		out.MarkedAt = res.MarkedAt.UTC().Format(time.RFC3339)
	}
	return out
}

// Replanning writes another module owns (Who's eating, a Meal Slot's date, Away: B9-24, B9-26), through the Runner this
// module mounts. The recipe for a handler of another module:
//
//	p := planhttp.ReplannerFor(d.DB) // at request time: every module is mounted by then
//	out, err := p.Apply(r, plan.ReasonAttendanceChanged, func(ctx context.Context, tx *sql.Tx, st *store.Store) error {
//		return hstore.SetAttendanceTx(ctx, tx, ...) // the module's own change, inside the write's transaction
//	})
//	if err != nil { ... } // the mutation's error, as it returned it; nothing was written
//	httpx.WriteJSON(w, http.StatusOK, struct {
//		household.Thing
//		planhttp.Replan // "changes" (never null) and "undoToken"
//	}{thing, out})
//
// The handler does not also publish an event that invalidates the plan: Apply replans at once and publishes the plan
// event (with "by" and "changes") after the commit. State outside the plan rows that the Undo puts back too (Away's
// days, the slot date, Who's eating) is registered once, at mount, with RegisterUndoFor(d.DB, name, participant) under a
// name that stays the same across releases (it works whichever module mounts first); Restore (POST /api/plan/restore) then puts it back with the plan rows.

// Replan is what a replanning write adds to its answer: "changes" (the cells it changed beyond its target, never null)
// and "undoToken" (left out when it issued none). Embed it in the answer's struct.
type Replan = replanOut

// replanners holds the Replanner of each app by its *sql.DB, and the undo participants registered for an app whose
// planning module has not mounted yet (RegisterUndoFor): modules mount in name order, so "away" mounts before
// "planning". Store (called once, at the planning module's mount) hands those participants to the Replanner.
var replanners = &replannerMap{byDB: map[*sql.DB]*Replanner{}, pending: map[*sql.DB][]namedUndo{}}

type namedUndo struct {
	name string
	part runner.UndoParticipant
}

type replannerMap struct {
	mu      sync.Mutex
	byDB    map[*sql.DB]*Replanner
	pending map[*sql.DB][]namedUndo
}

// Store keeps p as the Replanner of db and registers with it every participant that was waiting for it.
func (m *replannerMap) Store(db *sql.DB, p *Replanner) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.byDB[db] = p
	for _, u := range m.pending[db] {
		p.RegisterUndo(u.name, u.part)
	}
	delete(m.pending, db)
}

// Load returns the Replanner of db.
func (m *replannerMap) Load(db *sql.DB) (*Replanner, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.byDB[db]
	return p, ok
}

// register registers the participant with db's Replanner, or keeps it until the planning module mounts on db.
func (m *replannerMap) register(db *sql.DB, name string, part runner.UndoParticipant) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if p, ok := m.byDB[db]; ok {
		p.RegisterUndo(name, part)
		return
	}
	m.pending[db] = append(m.pending[db], namedUndo{name, part})
}

// RegisterUndoFor registers an undo participant for the app that uses db, whatever the module mount order: at once
// when the planning module has mounted, else when it mounts. Call it from a module's Mount (Away: B9-24).
func RegisterUndoFor(db *sql.DB, name string, part runner.UndoParticipant) {
	replanners.register(db, name, part)
}

// Replanner runs another module's write and the replan it causes in one transaction of the planning Runner.
type Replanner struct {
	run   *runner.Runner
	names *names
}

// ReplannerFor returns the Replanner of the app that uses db; nil when the planning module is not mounted on it.
func ReplannerFor(db *sql.DB) *Replanner {
	p, _ := replanners.Load(db)
	return p
}

// RegisterUndo adds a participant whose state an undo token captures before each undoable write and Restore puts back.
func (p *Replanner) RegisterUndo(name string, part runner.UndoParticipant) {
	p.run.RegisterUndo(name, part)
}

// Apply runs mutate and one replan in ONE transaction as the request's User (runner.Apply), and returns what the answer
// carries: the cells the replan changed and the undo token.
func (p *Replanner) Apply(r *http.Request, reason plan.Reason, mutate func(ctx context.Context, tx *sql.Tx, st *store.Store) error) (Replan, error) {
	ctx, o := runner.WithOutcome(actorCtx(r))
	if _, err := p.run.Apply(ctx, reason, mutate); err != nil {
		return Replan{}, err
	}
	t, err := p.names.load(r.Context())
	if err != nil {
		return Replan{}, err
	}
	return replanFor(o, t), nil
}
