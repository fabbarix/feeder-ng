// Package httpapi exposes Cook Mode and the kitchen board under /api/cook and
// /api/board. Handlers are thin: parse, call the cook service, respond. It
// registers itself in init() and, at Mount, starts the one-second sweep that
// finishes due timers (stopped by Deps.Context). See docs/dev/design/t14-cook-board.md.
package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/cook/service"
	"github.com/fabbarix/feeder-ng/internal/cook/store"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	planhttp "github.com/fabbarix/feeder-ng/internal/plan/httpapi"
)

func init() { app.Register(app.Module{Name: "cook", Mount: mount}) }

// sweepEvery is how often due timers are finished, so the finish is announced
// even when nobody reads the timers.
const sweepEvery = time.Second

// mount registers the routes (all r.User) and wires the service.
func mount(r *app.Router, d app.Deps) {
	db := service.NewDB(d.DB, d.Clock)
	svc := service.New(service.Config{
		Store: store.New(d.DB), Clock: d.Clock, Bus: d.Events,
		Recipes: db.Recipes(), Meals: db.Meals(), Waste: db.Waste(), Household: db.Household(),
	})
	a := &api{svc: svc, clk: d.Clock, boardSlots: planhttp.BoardSlots(d)}
	r.User("GET /api/cook/meals/{date}/{slotId}", a.mealView)
	// Team C2 (docs/dev/design/crs-c2.md §5): the cooking timeline of a slot and the single-Course view.
	r.User("GET /api/cook/meals/{date}/{slotId}/all", a.timeline)
	r.User("GET /api/cook/meals/{date}/{slotId}/{courseId}", a.courseView)
	r.User("GET /api/cook/recipes/{id}", a.recipeView)
	r.User("PUT /api/cook/marks", a.mark)
	r.User("GET /api/cook/timers", a.timers)
	r.User("POST /api/cook/timers", a.startTimer)
	r.User("POST /api/cook/timers/{id}/pause", a.pause)
	r.User("POST /api/cook/timers/{id}/resume", a.resume)
	r.User("DELETE /api/cook/timers/{id}", a.cancel)
	r.User("GET /api/board", a.board)
	if d.Context != nil {
		d.Go(func() { sweep(d.Context, svc, d.Logger) })
	}
}

// sweep finishes due timers every second until ctx ends.
func sweep(ctx context.Context, svc *service.Service, logger *slog.Logger) {
	t := time.NewTicker(sweepEvery)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if _, err := svc.Sweep(ctx); err != nil && ctx.Err() == nil && logger != nil {
				logger.Error("cook sweep failed", "err", err)
			}
		}
	}
}

type api struct {
	svc *service.Service
	clk clock.Clock
	// boardSlots is the plan's slots from..to in the plan's JSON (the board's tonight and tomorrow, crs-c2 §5.4).
	boardSlots func(ctx context.Context, from, to string) (any, error)
}

func (a *api) mealView(w http.ResponseWriter, r *http.Request) {
	date := r.PathValue("date")
	if _, err := time.Parse("2006-01-02", date); err != nil {
		httpx.WriteError(w, http.StatusNotFound, "not_found", notFoundMsg)
		return
	}
	slot, ok := positiveInt(r.PathValue("slotId"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", notFoundMsg)
		return
	}
	v, err := a.svc.MealView(r.Context(), date, slot)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, viewOf(v))
}

// courseView is Cook Mode for one Course's Planned Meal of a slot (a Course id that is not a number is not found).
func (a *api) courseView(w http.ResponseWriter, r *http.Request) {
	date, slot, ok := mealPath(r)
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", notFoundMsg)
		return
	}
	course, ok := positiveInt(r.PathValue("courseId"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", notFoundMsg)
		return
	}
	v, err := a.svc.CourseView(r.Context(), date, slot, course)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, viewOf(v))
}

// mealPath reads {date} and {slotId}; false when either is not valid.
func mealPath(r *http.Request) (string, int64, bool) {
	date := r.PathValue("date")
	if _, err := time.Parse("2006-01-02", date); err != nil {
		return "", 0, false
	}
	slot, ok := positiveInt(r.PathValue("slotId"))
	return date, slot, ok
}

// timeline is the cooking timeline of a slot (GET .../all): the Courses, the items, the Advance Steps.
func (a *api) timeline(w http.ResponseWriter, r *http.Request) {
	date, slot, ok := mealPath(r)
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", notFoundMsg)
		return
	}
	t, err := a.svc.SlotTimeline(r.Context(), date, slot)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, timelineOf(t))
}

func (a *api) recipeView(w http.ResponseWriter, r *http.Request) {
	id, ok := positiveInt(r.PathValue("id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", notFoundMsg)
		return
	}
	batches := 1.0
	if raw := r.URL.Query().Get("batches"); raw != "" {
		b, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			writeErr(w, service.ErrInvalid)
			return
		}
		batches = b
	}
	v, err := a.svc.RecipeView(r.Context(), id, batches)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, viewOf(v))
}

type markBody struct {
	Scope string `json:"scope"`
	Step  *int   `json:"step"`
	Done  *bool  `json:"done"`
}

func (a *api) mark(w http.ResponseWriter, r *http.Request) {
	var in markBody
	if err := httpx.DecodeJSON(r, &in); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	if in.Step == nil || in.Done == nil {
		writeErr(w, service.ErrInvalid)
		return
	}
	m, err := a.svc.SetMark(r.Context(), cook.Scope(in.Scope), *in.Step, *in.Done)
	if err != nil {
		writeErr(w, err)
		return
	}
	out := map[string]any{"scope": string(m.Scope), "step": m.Step, "done": m.Done, "doneAt": nil}
	if m.DoneAt != nil {
		out["doneAt"] = instant(*m.DoneAt)
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (a *api) timers(w http.ResponseWriter, r *http.Request) {
	scope := cook.Scope(r.URL.Query().Get("scope"))
	if scope != "" {
		if _, err := cook.ParseScope(string(scope)); err != nil {
			writeErr(w, cook.ErrInvalidScope)
			return
		}
	}
	now, list, err := a.svc.TimersWithRecipeNames(r.Context(), scope)
	if err != nil {
		writeErr(w, err)
		return
	}
	plain := make([]cook.Timer, len(list))
	for i, t := range list {
		plain[i] = t.Timer
	}
	out := timersOf(plain, now)
	for i, t := range list {
		out[i].RecipeName = t.RecipeName
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"now": instant(now), "timers": out})
}

type startBody struct {
	Scope           string `json:"scope"`
	Step            *int   `json:"step"`
	Label           string `json:"label"`
	DurationSeconds int    `json:"durationSeconds"`
}

func (a *api) startTimer(w http.ResponseWriter, r *http.Request) {
	var in startBody
	if err := httpx.DecodeJSON(r, &in); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	t, created, err := a.svc.StartTimer(r.Context(), service.StartInput{
		Scope: cook.Scope(in.Scope), Step: in.Step, Label: in.Label, DurationSeconds: in.DurationSeconds,
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	httpx.WriteJSON(w, status, timerOf(t, a.now()))
}

func (a *api) pause(w http.ResponseWriter, r *http.Request) {
	id, ok := positiveInt(r.PathValue("id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", notFoundMsg)
		return
	}
	t, err := a.svc.Pause(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, timerOf(t, a.now()))
}

func (a *api) resume(w http.ResponseWriter, r *http.Request) {
	id, ok := positiveInt(r.PathValue("id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", notFoundMsg)
		return
	}
	t, err := a.svc.Resume(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, timerOf(t, a.now()))
}

func (a *api) cancel(w http.ResponseWriter, r *http.Request) {
	id, ok := positiveInt(r.PathValue("id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", notFoundMsg)
		return
	}
	if err := a.svc.Cancel(r.Context(), id); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *api) board(w http.ResponseWriter, r *http.Request) {
	b, err := a.svc.Board(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	tomorrow, err := nextDay(b.Today)
	if err != nil {
		writeErr(w, err)
		return
	}
	slots, err := a.boardSlots(r.Context(), b.Today, tomorrow)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, boardOf(b, slots))
}

// nextDay is the date after a YYYY-MM-DD date.
func nextDay(date string) (string, error) {
	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		return "", err
	}
	return d.AddDate(0, 0, 1).Format("2006-01-02"), nil
}

func (a *api) now() time.Time { return a.clk.Now().UTC() }

const notFoundMsg = "There is no such Recipe, Planned Meal or timer"

func positiveInt(s string) (int64, bool) {
	n, err := strconv.ParseInt(s, 10, 64)
	return n, err == nil && n > 0
}

// writeErr maps the service's errors to the API's status codes and error codes.
func writeErr(w http.ResponseWriter, err error) {
	var status int
	var code, msg string
	switch {
	case errors.Is(err, service.ErrNotFound):
		status, code, msg = http.StatusNotFound, "not_found", notFoundMsg
	case errors.Is(err, service.ErrNotCookable):
		status, code, msg = http.StatusConflict, "not_cookable", "The Planned Meal is already Cooked, skipped or served from a Leftover"
	case errors.Is(err, service.ErrNotRunning):
		status, code, msg = http.StatusConflict, "not_running", "The timer is not running"
	case errors.Is(err, service.ErrNotPaused):
		status, code, msg = http.StatusConflict, "not_paused", "The timer is not paused"
	case errors.Is(err, service.ErrNotAdvanceStep):
		status, code, msg = http.StatusUnprocessableEntity, "not_advance_step", "Only an Advance Step can be marked done"
	case errors.Is(err, service.ErrNotPassiveStep):
		status, code, msg = http.StatusUnprocessableEntity, "not_passive_step", "Only a Passive Step starts a Step timer"
	case errors.Is(err, cook.ErrInvalidScope):
		status, code, msg = http.StatusUnprocessableEntity, "invalid_scope", "The scope must be a Planned Meal or a Recipe"
	case errors.Is(err, service.ErrInvalid):
		status, code, msg = http.StatusUnprocessableEntity, "validation_failed", "The request is not valid"
	default:
		slog.Default().Error("cook request failed", "err", err)
		httpx.WriteError(w, http.StatusInternalServerError, "internal", "Something went wrong")
		return
	}
	httpx.WriteError(w, status, code, msg)
}

// ---- JSON shapes ----

type timerDTO struct {
	ID               int64   `json:"id"`
	Scope            *string `json:"scope"`
	Step             *int    `json:"step"`
	Label            string  `json:"label"`
	DurationSeconds  int     `json:"durationSeconds"`
	State            string  `json:"state"`
	RemainingSeconds int     `json:"remainingSeconds"`
	EndsAt           *string `json:"endsAt"`
	StartedAt        string  `json:"startedAt"`
	// RecipeName is the Recipe the timer's scope cooks (GET /api/cook/timers only; omitted for a free timer).
	RecipeName string `json:"recipeName,omitempty"`
}

func timerOf(t cook.Timer, now time.Time) timerDTO {
	d := timerDTO{
		ID: t.ID, Label: t.Label, DurationSeconds: t.DurationSeconds, State: string(t.State),
		RemainingSeconds: t.RemainingSeconds(now), StartedAt: instant(t.StartedAt), Step: t.Step,
	}
	if t.Scope != "" {
		s := string(t.Scope)
		d.Scope = &s
	}
	if t.State != cook.Paused {
		e := instant(t.EndsAt)
		d.EndsAt = &e
	}
	return d
}

func timersOf(list []cook.Timer, now time.Time) []timerDTO {
	out := make([]timerDTO, 0, len(list))
	for _, t := range list {
		out = append(out, timerOf(t, now))
	}
	return out
}

type useDTO struct {
	IngredientID int64   `json:"ingredientId"`
	Ingredient   string  `json:"ingredient"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit"`
}

type stepTimerDTO struct {
	Label           string `json:"label"`
	DurationSeconds int    `json:"durationSeconds"`
}

type stepDTO struct {
	Index           int           `json:"index"`
	Number          int           `json:"number"`
	Of              int           `json:"of"`
	Kind            string        `json:"kind"`
	Text            string        `json:"text"`
	DurationMinutes int           `json:"durationMinutes"`
	ImageURL        string        `json:"imageUrl"`
	Uses            []useDTO      `json:"uses"`
	Timer           *stepTimerDTO `json:"timer"`
	// After lists the Recipe Step indexes this Step waits for; Cook Mode holds Next while their timers run.
	After []int `json:"after"`
}

type advanceDTO struct {
	Step            int     `json:"step"`
	Text            string  `json:"text"`
	LeadTimeMinutes int     `json:"leadTimeMinutes"`
	Done            bool    `json:"done"`
	DoneAt          *string `json:"doneAt"`
	Warning         bool    `json:"warning"`
}

type mealDTO struct {
	Date       string `json:"date"`
	MealSlotID int64  `json:"mealSlotId"`
	SlotName   string `json:"slotName"`
	At         string `json:"at"`
	CourseID   int64  `json:"courseId"`
	CourseName string `json:"courseName"`
}

type viewDTO struct {
	Scope      string       `json:"scope"`
	RecipeID   int64        `json:"recipeId"`
	RecipeName string       `json:"recipeName"`
	Batches    float64      `json:"batches"`
	Meal       *mealDTO     `json:"meal"`
	Advance    []advanceDTO `json:"advance"`
	Steps      []stepDTO    `json:"steps"`
	Timers     []timerDTO   `json:"timers"`
	Now        string       `json:"now"`
	Today      string       `json:"today"` // household date
}

func viewOf(v service.CookView) viewDTO {
	d := viewDTO{
		Scope: string(v.Scope), RecipeID: v.RecipeID, RecipeName: v.RecipeName, Batches: v.Batches,
		Advance: []advanceDTO{}, Steps: []stepDTO{}, Timers: timersOf(v.Timers, v.Now), Now: instant(v.Now),
		Today: v.Today,
	}
	if v.Meal != nil {
		d.Meal = &mealDTO{Date: v.Meal.Date, MealSlotID: v.Meal.MealSlotID, SlotName: v.Meal.SlotName, At: instant(v.Meal.At),
			CourseID: v.Meal.CourseID, CourseName: v.Meal.CourseName}
	}
	for _, a := range v.Advance {
		item := advanceDTO{Step: a.Step, Text: a.Text, LeadTimeMinutes: a.LeadTimeMinutes, Done: a.Done, Warning: a.Warning}
		if a.DoneAt != nil {
			s := instant(*a.DoneAt)
			item.DoneAt = &s
		}
		d.Advance = append(d.Advance, item)
	}
	for _, s := range v.Steps {
		step := stepDTO{
			Index: s.Index, Number: s.Number, Of: s.Of, Kind: string(s.Kind), Text: s.Text,
			DurationMinutes: s.DurationMinutes, ImageURL: s.ImageURL, Uses: []useDTO{}, After: append([]int{}, s.After...),
		}
		for _, u := range s.Uses {
			step.Uses = append(step.Uses, useDTO{IngredientID: u.IngredientID, Ingredient: u.Ingredient, Quantity: u.Quantity, Unit: u.Unit})
		}
		if s.Timer != nil {
			step.Timer = &stepTimerDTO{Label: s.Timer.Label, DurationSeconds: s.Timer.DurationSeconds}
		}
		d.Steps = append(d.Steps, step)
	}
	return d
}

type themeDTO struct {
	Dark         bool   `json:"dark"`
	NextChangeAt string `json:"nextChangeAt"`
	Source       string `json:"source"`
	Reason       string `json:"reason"`
}

type nextAdvanceDTO struct {
	Scope           string `json:"scope"`
	CourseID        int64  `json:"courseId"`
	CourseName      string `json:"courseName"`
	RecipeName      string `json:"recipeName"`
	Step            int    `json:"step"`
	Text            string `json:"text"`
	LeadTimeMinutes int    `json:"leadTimeMinutes"`
	DueAt           string `json:"dueAt"`
	Overdue         bool   `json:"overdue"`
	MealDate        string `json:"mealDate"`
	MealSlotID      int64  `json:"mealSlotId"`
	SlotName        string `json:"slotName"`
}

type boardDTO struct {
	Now    string   `json:"now"`
	Today  string   `json:"today"`
	Theme  themeDTO `json:"theme"`
	Streak struct {
		Days int `json:"days"`
	} `json:"streak"`
	NextAdvance *nextAdvanceDTO `json:"nextAdvance"`
	// Slots are today's and tomorrow's slots in the plan's shape (courses, cookMinutes), crs-c2 §5.4.
	Slots any `json:"slots"`
}

func boardOf(b service.Board, slots any) boardDTO {
	d := boardDTO{
		Now: instant(b.Now), Today: b.Today,
		Theme: themeDTO{Dark: b.Phase.Dark, NextChangeAt: instant(b.Phase.Next), Source: string(b.Phase.Source), Reason: b.ThemeReason},
	}
	d.Streak.Days = b.StreakDays
	d.Slots = slots
	if n := b.NextAdvance; n != nil {
		d.NextAdvance = &nextAdvanceDTO{
			Scope: string(n.Scope), CourseID: n.CourseID, CourseName: n.CourseName, RecipeName: n.RecipeName, Step: n.Step, Text: n.Text,
			LeadTimeMinutes: n.LeadTimeMinutes, DueAt: instant(n.DueAt), Overdue: n.Overdue,
			MealDate: n.MealDate, MealSlotID: n.MealSlotID, SlotName: n.SlotName,
		}
	}
	return d
}

func instant(t time.Time) string { return t.UTC().Format(time.RFC3339) }
