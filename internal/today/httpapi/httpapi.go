// Package httpapi serves the two Today endpoints no other feature provides:
// Advance Steps due in the next 24 hours and the zero-waste streak. Handlers are
// thin: they read the cook service's marks-aware source and the Stock dates, then respond.
package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/cook/service"
	cookstore "github.com/fabbarix/feeder-ng/internal/cook/store"
	hstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

func init() { app.Register(app.Module{Name: "today", Mount: mount}) }

type api struct {
	d    app.Deps
	cook *service.Service
}

func mount(r *app.Router, d app.Deps) {
	db := service.NewDB(d.DB, d.Clock)
	a := &api{d: d, cook: service.New(service.Config{
		Store: cookstore.New(d.DB), Clock: d.Clock,
		Recipes: db.Recipes(), Meals: db.Meals(), Waste: db.Waste(), Household: db.Household(),
	})}
	r.User("GET /api/today/advance-steps", a.advanceSteps)
	r.User("GET /api/today/streak", a.streak)
}

type stepDTO struct {
	// Scope and Step are the key of PUT /api/cook/marks.
	Scope        string `json:"scope"`
	Step         int    `json:"step"`
	MealDate     string `json:"mealDate"`
	MealSlotID   int64  `json:"mealSlotId"`
	MealSlotName string `json:"mealSlotName"`
	CourseID     int64  `json:"courseId"`
	CourseName   string `json:"courseName"`
	RecipeName   string `json:"recipeName"`
	Description  string `json:"description"`
	DueAt        string `json:"dueAt"`
	DueTime      string `json:"dueTime"`
	SlotTime     string `json:"slotTime"`
	State        string `json:"state"` // "due" once DueAt has come, else "upcoming"
	Overdue      bool   `json:"overdue"`
}

// AdvanceWindow is how far ahead Today lists Advance Steps (TB-02).
const AdvanceWindow = 24 * time.Hour

// advanceSteps lists the Advance Steps not marked done that are due within the next 24 hours, and any overdue one of
// a meal not served yet, soonest first. They come from the board's marks-aware source (TB-02), so Today, the board
// and the push agree.
func (a *api) advanceSteps(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	now := a.d.Clock.Now()
	loc, err := householdZone(ctx, a.d)
	if err != nil {
		a.fail(w, err)
		return
	}
	steps, err := a.cook.AdvanceDue(ctx, AdvanceWindow)
	if err != nil {
		a.fail(w, err)
		return
	}
	out := make([]stepDTO, 0, len(steps))
	for _, s := range steps {
		state := "upcoming"
		if !now.Before(s.DueAt) {
			state = "due"
		}
		out = append(out, stepDTO{
			Scope: string(s.Scope), Step: s.Step,
			MealDate: s.MealDate, MealSlotID: s.MealSlotID, MealSlotName: s.SlotName, CourseID: s.CourseID,
			CourseName: s.CourseName, RecipeName: s.RecipeName, Description: s.Text,
			DueAt: s.DueAt.UTC().Format(time.RFC3339), DueTime: s.DueAt.In(loc).Format("15:04"),
			SlotTime: s.MealAt.In(loc).Format("15:04"), State: state, Overdue: s.Overdue,
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
