// Package httpapi serves the two Today endpoints no other feature provides:
// Advance Steps due today and the zero-waste streak. Handlers are thin: they
// read the shared facts and the Stock dates, then respond.
package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/cook/service"
	coursestore "github.com/fabbarix/feeder-ng/internal/course/store"
	hstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/notify"
	notifyapi "github.com/fabbarix/feeder-ng/internal/notify/httpapi"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

func init() { app.Register(app.Module{Name: "today", Mount: mount}) }

type api struct {
	d app.Deps
}

func mount(r *app.Router, d app.Deps) {
	a := &api{d: d}
	r.User("GET /api/today/advance-steps", a.advanceSteps)
	r.User("GET /api/today/streak", a.streak)
}

type stepDTO struct {
	MealDate    string `json:"mealDate"`
	MealSlotID  int64  `json:"mealSlotId"`
	CourseID    int64  `json:"courseId"`
	CourseName  string `json:"courseName"`
	RecipeName  string `json:"recipeName"`
	Description string `json:"description"`
	DueAt       string `json:"dueAt"`
	DueTime     string `json:"dueTime"`
	SlotTime    string `json:"slotTime"`
	State       string `json:"state"`
}

// advanceSteps lists the Advance Steps of today's Planned Meals, soonest first.
// The facts come from the dispatcher, so Today and push agree.
func (a *api) advanceSteps(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	now := a.d.Clock.Now()
	loc, err := householdZone(ctx, a.d)
	if err != nil {
		a.fail(w, err)
		return
	}
	f, err := notifyapi.DispatcherFor(a.d.DB).Facts(ctx, now)
	if err != nil {
		a.fail(w, err)
		return
	}
	steps := notify.AdvanceStepsOn(f, plan.Today(now, loc), loc)
	courses, err := coursestore.New(a.d.DB, a.d.Clock).List(ctx, true)
	if err != nil {
		a.fail(w, err)
		return
	}
	courseName := map[int64]string{}
	for _, c := range courses {
		courseName[c.ID] = c.Name
	}
	out := make([]stepDTO, 0, len(steps))
	for _, s := range steps {
		state := "upcoming"
		if !now.Before(s.DueAt) {
			state = "due"
		}
		out = append(out, stepDTO{
			MealDate: s.MealDate, MealSlotID: s.MealSlotID, CourseID: s.CourseID, CourseName: courseName[s.CourseID],
			RecipeName: s.RecipeName, Description: s.Description,
			DueAt: s.DueAt.UTC().Format(time.RFC3339), DueTime: s.DueAt.Format("15:04"), SlotTime: s.SlotAt.Format("15:04"),
			State: state,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"steps": out})
}

// streak is the zero-waste streak in days: T14's rule, the same number the
// kitchen board shows.
func (a *api) streak(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	now := a.d.Clock.Now()
	loc, err := householdZone(ctx, a.d)
	if err != nil {
		a.fail(w, err)
		return
	}
	waste := service.NewDB(a.d.DB, a.d.Clock).Waste()
	in, err := waste.StreakInput(ctx)
	if err != nil {
		a.fail(w, err)
		return
	}
	in.Today = stock.Date(plan.Today(now, loc))
	days := cook.ZeroWasteStreak(in)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"days": days})
}

// householdZone is the household time zone, UTC when unset or unknown.
func householdZone(ctx context.Context, d app.Deps) (*time.Location, error) {
	s, err := hstore.New(d.DB, d.Clock).Settings(ctx)
	if err != nil {
		return nil, err
	}
	if loc, err := time.LoadLocation(s.TimeZone); err == nil {
		return loc, nil
	}
	return time.UTC, nil
}

func (a *api) fail(w http.ResponseWriter, err error) {
	slog.Default().Error("today request failed", "err", err)
	httpx.WriteError(w, http.StatusInternalServerError, "internal", "Something went wrong")
}
