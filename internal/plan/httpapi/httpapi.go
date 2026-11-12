// Package httpapi exposes the planning module (route table and JSON shapes in
// docs/dev/design/t11-planning.md). Handlers are thin: parse, call the runner or
// store, respond. The module also wires everything at Mount: the Runner (with the
// household, recipe, product and stock adapters), the invalidation subscription,
// the PlannedChecker and the nightly job on app.Deps.Scheduler.
package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/cook"
	cookservice "github.com/fabbarix/feeder-ng/internal/cook/service"
	cookstore "github.com/fabbarix/feeder-ng/internal/cook/store"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
)

func init() { app.Register(app.Module{Name: "planning", Mount: mount}) }

// mount registers the routes. Every route needs a signed-in User; none is Admin-only (spec §2 lists the Admin duties
// and Slot Rules, Variety Rules and the plan are not among them).
func mount(r *app.Router, d app.Deps) {
	src := runner.NewDBSources(d.DB, d.Clock, d.Logger)
	st := store.New(d.DB, d.Clock)
	// N4: resolving a meal cancels its Cook timers. The cook service also reads the cooking timeline (cookMinutes).
	timers := cookService(d)
	run := runner.New(runner.Deps{
		DB: d.DB, Clock: d.Clock, Store: st, Source: src,
		Stock:  runner.NewStockService(d.DB, d.Clock, d.Events),
		Events: d.Events, Logger: d.Logger,
		// R13: migration 1230 changed Attendance; replan once at startup so stale "couldn't plan" reasons are cleared.
		ReplanOnStart: d.Context != nil,
		OnResolved: func(ctx context.Context, key plan.Key) {
			if _, err := timers.CancelScope(ctx, cook.MealScope(key.Date, key.MealSlotID, key.CourseID)); err != nil && d.Logger != nil {
				d.Logger.Warn("cancelling the timers of a resolved meal", "date", key.Date, "slot", key.MealSlotID, "course", key.CourseID, "err", err)
			}
		},
	})
	if d.Context != nil {
		d.Go(func() { run.Subscribe(d.Context, d.Events) })
		d.Go(func() { run.Start(d.Context) })
		d.Idle(run.WaitIdle)
	}
	d.Scheduler.SetZone(func(ctx context.Context) (*time.Location, error) {
		_, loc, err := src.Settings(ctx)
		return loc, err
	})
	d.Scheduler.Daily("plan.nightly", "03:00", run.Nightly)

	a := &api{run: run, st: st, names: newNames(d), cook: timers}
	r.User("GET /api/plan", a.view)
	r.User("GET /api/plan/to-confirm", a.toConfirm)
	r.User("GET /api/plan/couldnt-plan", a.couldntPlan)
	// Team C-RX (docs/dev/design/crs-crx.md): a literal, so the mux prefers it to the {date}/{slotId} patterns.
	r.User("GET /api/plan/couldnt-plan/exclusions", a.couldntExclusions)
	r.User("GET /api/plan/leftovers", a.leftovers)
	r.User("POST /api/plan/regenerate", a.regenerate)
	r.User("PUT /api/plan/{date}/{slotId}", a.setMeal)
	r.User("POST /api/plan/{date}/{slotId}/confirm", a.confirm)
	r.User("POST /api/plan/{date}/{slotId}/unpin", a.unpin)
	r.User("GET /api/plan/{date}/{slotId}/alternatives", a.alternatives)
	r.User("GET /api/plan/{date}/{slotId}/cook", a.cookPreview)
	r.User("POST /api/plan/{date}/{slotId}/cooked", a.cooked)
	r.User("POST /api/plan/{date}/{slotId}/not-cooked", a.notCooked)
	// Team C2 (docs/dev/design/crs-c2.md §3): the Course routes. The course-less routes above are the main Course's
	// aliases until C3; the literal "all" segment beats {courseId} in the mux.
	r.User("PUT /api/plan/{date}/{slotId}/{courseId}", a.setMeal)
	r.User("POST /api/plan/{date}/{slotId}/{courseId}/confirm", a.confirm)
	r.User("POST /api/plan/{date}/{slotId}/{courseId}/unpin", a.unpin)
	r.User("GET /api/plan/{date}/{slotId}/{courseId}/alternatives", a.alternatives)
	r.User("GET /api/plan/{date}/{slotId}/{courseId}/cook", a.cookPreview)
	r.User("POST /api/plan/{date}/{slotId}/{courseId}/cooked", a.cooked)
	r.User("POST /api/plan/{date}/{slotId}/{courseId}/not-cooked", a.notCooked)
	r.User("POST /api/plan/{date}/{slotId}/all/cooked", a.allCooked)
	r.User("POST /api/plan/{date}/{slotId}/all/not-cooked", a.notCookedAll)
	r.User("GET /api/slot-rules", a.slotRules)
	r.User("POST /api/slot-rules", a.addSlotRule)
	r.User("DELETE /api/slot-rules/{id}", a.deleteSlotRule)
	r.User("GET /api/variety-rules", a.varietyRules)
	r.User("PUT /api/variety-rules/{tag}", a.setVarietyRule)
	r.User("DELETE /api/variety-rules/{tag}", a.deleteVarietyRule)
}

type api struct {
	run   *runner.Runner
	st    *store.Store
	names *names
	cook  *cookservice.Service
}

// cookService is the cook service the planning module uses: the timers it cancels and the timelines it reads.
func cookService(d app.Deps) *cookservice.Service {
	db := cookservice.NewDB(d.DB, d.Clock)
	return cookservice.New(cookservice.Config{Store: cookstore.New(d.DB), Clock: d.Clock, Bus: d.Events,
		Recipes: db.Recipes(), Meals: db.Meals(), Household: db.Household()})
}

// BoardSlots is the plan of from..to in the plan's JSON, with courses and cookMinutes: the board's tonight and
// tomorrow tiles (crs-c2 §5.4). cook httpapi mounts it on GET /api/board. It reads only; it starts no worker.
func BoardSlots(d app.Deps) func(ctx context.Context, from, to string) (any, error) {
	src := runner.NewDBSources(d.DB, d.Clock, d.Logger)
	run := runner.New(runner.Deps{
		DB: d.DB, Clock: d.Clock, Store: store.New(d.DB, d.Clock), Source: src,
		Stock: runner.NewStockService(d.DB, d.Clock, d.Events), Events: d.Events, Logger: d.Logger,
	})
	a := &api{run: run, st: store.New(d.DB, d.Clock), names: newNames(d), cook: cookService(d)}
	return func(ctx context.Context, from, to string) (any, error) {
		v, err := run.View(ctx, from, to)
		if err != nil {
			return nil, err
		}
		if err := a.fillCookMinutes(ctx, v.Slots); err != nil {
			return nil, err
		}
		t, err := a.names.load(ctx, viewMeals(v.Slots)...)
		if err != nil {
			return nil, err
		}
		return slots(v.Slots, t), nil
	}
}

// writeErr maps the runner's and store's errors to the API's error codes.
func writeErr(w http.ResponseWriter, err error) {
	writeFieldErr(w, err, "")
}

func writeFieldErr(w http.ResponseWriter, err error, field string) {
	var status int
	var code string
	switch {
	case errors.Is(err, runner.ErrNotFound), errors.Is(err, store.ErrNotFound):
		status, code = http.StatusNotFound, "not_found"
	case errors.Is(err, runner.ErrUnknownSlot):
		status, code = http.StatusNotFound, "unknown_slot"
	case errors.Is(err, runner.ErrInPast):
		status, code = http.StatusUnprocessableEntity, "in_past"
	case errors.Is(err, runner.ErrAlreadyResolved):
		status, code = http.StatusConflict, "already_resolved"
	case errors.Is(err, runner.ErrNotSwappable):
		status, code = http.StatusConflict, "not_swappable"
	case errors.Is(err, plan.ErrFutureMeal):
		status, code = http.StatusConflict, "future_meal"
	case errors.Is(err, runner.ErrUnknownRecipe):
		status, code = http.StatusUnprocessableEntity, "unknown_recipe"
	case errors.Is(err, runner.ErrArchivedRecipe):
		status, code = http.StatusUnprocessableEntity, "recipe_archived"
	case errors.Is(err, runner.ErrInvalidBatches):
		status, code, field = http.StatusUnprocessableEntity, "validation_failed", "batches"
	case errors.Is(err, plan.ErrInvalidLeftover):
		status, code, field = http.StatusUnprocessableEntity, "validation_failed", "leftoverPortions"
	case errors.Is(err, runner.ErrCourseNotInSlot):
		status, code = http.StatusUnprocessableEntity, "course_not_in_slot"
	case errors.Is(err, runner.ErrRecipeNotInCourse):
		status, code = http.StatusUnprocessableEntity, "recipe_not_in_course"
	case errors.Is(err, runner.ErrRecipeInSlot):
		status, code = http.StatusConflict, "recipe_in_slot"
	case errors.Is(err, store.ErrDuplicateRule):
		status, code = http.StatusConflict, "duplicate_rule"
	case errors.Is(err, store.ErrUnknownRef):
		status, code = http.StatusUnprocessableEntity, "unknown_reference"
	case errors.Is(err, store.ErrInvalid):
		status, code = http.StatusUnprocessableEntity, "validation_failed"
	default:
		slog.Default().Error("planning request failed", "err", err)
		httpx.WriteError(w, http.StatusInternalServerError, "internal", "Something went wrong")
		return
	}
	body := map[string]any{"code": code, "message": messageFor(code)}
	if field != "" && code == "validation_failed" {
		body["field"] = field
	}
	httpx.WriteJSON(w, status, map[string]any{"error": body})
}

func messageFor(code string) string {
	switch code {
	case "not_found":
		return "There is no such Planned Meal or Rule"
	case "unknown_slot":
		return "No such Meal Slot on that date"
	case "in_past":
		return "That day is already over"
	case "already_resolved":
		return "The Planned Meal is already Cooked or skipped"
	case "not_swappable":
		return "A Cooked or skipped Planned Meal cannot be swapped"
	case "future_meal":
		return "This Planned Meal is not due yet"
	case "unknown_recipe":
		return "No such Recipe"
	case "recipe_archived":
		return "That Recipe is archived"
	case "duplicate_rule":
		return "That Slot Rule already exists"
	case "course_not_in_slot":
		return "The Meal Slot does not serve that Course"
	case "recipe_not_in_course":
		return "That Recipe is not marked with that Course"
	case "recipe_in_slot":
		return "That Recipe is already in another Course of that Meal Slot on that day"
	case "unknown_reference":
		return "The Meal Slot or Recipe does not exist"
	case "validation_failed":
		return "The request is not valid"
	}
	return "Something went wrong"
}
