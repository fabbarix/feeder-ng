// Package facts is the production notify.FactSource: it reads Planned Meals,
// Leftovers and Stock Lots from Planning, Recipes, Stock and Household and
// hands plain facts to the pure notify package. Push and the Today screen share
// it, so both see the same plan.
package facts

import (
	"context"
	"database/sql"
	"errors"
	"time"

	accessstore "github.com/fabbarix/feeder-ng/internal/access/store"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
	coursestore "github.com/fabbarix/feeder-ng/internal/course/store"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/notify"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	planstore "github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	recipestore "github.com/fabbarix/feeder-ng/internal/recipe/store"
	"github.com/fabbarix/feeder-ng/internal/stock"
	stockstore "github.com/fabbarix/feeder-ng/internal/stock/store"
)

// Source implements notify.FactSource over the shared database.
type Source struct {
	clk     clock.Clock
	slots   *runner.DBSources
	plans   *planstore.Store
	recipes *recipestore.Store
	stock   *stockstore.Store
	ings    *ingredientstore.Store
	access  *accessstore.Store
	courses *coursestore.Store
}

// New returns the production fact source over d.
func New(d *sql.DB, clk clock.Clock) *Source {
	return &Source{
		clk:   clk,
		slots: runner.NewDBSources(d, clk, nil),
		plans: planstore.New(d, clk),
		// Get does not consult the ingredient source (only writes do), so none is needed here.
		recipes: recipestore.New(d, clk, nil),
		stock:   stockstore.New(d, clk),
		ings:    ingredientstore.New(d, clk),
		access:  accessstore.New(d),
		courses: coursestore.New(d, clk),
	}
}

var _ notify.FactSource = (*Source)(nil)

// Facts gathers the facts around now: Planned Meals from yesterday on (a
// Confirm Cooked reminder outlives its slot), available Leftovers and every
// Stock Lot with a go-off date. A Stock Lot is UsedByPlan when a fresh Planned
// Meal from today on uses its Ingredient on or before the go-off date.
func (s *Source) Facts(ctx context.Context, now time.Time) (notify.Facts, error) {
	_, loc, err := s.slots.Settings(ctx)
	if err != nil {
		return notify.Facts{}, err
	}
	today := plan.Today(now, loc)
	todayDate, err := time.ParseInLocation("2006-01-02", today, loc)
	if err != nil {
		return notify.Facts{}, err
	}
	slots, err := s.slots.MealSlots(ctx)
	if err != nil {
		return notify.Facts{}, err
	}
	slotTime := map[int64]string{}
	for _, sl := range slots {
		slotTime[sl.ID] = sl.Time
	}
	meals, err := s.plans.Meals(ctx, todayDate.AddDate(0, 0, -1).Format("2006-01-02"), "")
	if err != nil {
		return notify.Facts{}, err
	}
	var out notify.Facts
	recipes := map[int64]recipeEntry{} // each Recipe is read once per call
	planned := map[int64]string{}      // Ingredient -> earliest fresh Planned Meal use from today on
	for _, m := range meals {
		hhmm, ok := slotTime[m.Key.MealSlotID]
		if !ok {
			continue
		}
		at, err := plan.SlotInstant(m.Key.Date, hhmm, loc)
		if err != nil {
			continue
		}
		rec, err := s.recipe(ctx, m.RecipeID, recipes)
		if errors.Is(err, recipestore.ErrNotFound) {
			continue
		}
		if err != nil {
			return notify.Facts{}, err
		}
		mf := notify.MealFact{
			Date: m.Key.Date, MealSlotID: m.Key.MealSlotID, CourseID: m.Key.CourseID, RecipeName: rec.Name, SlotAt: at,
			State: string(m.State), FromLeftover: !m.Fresh(),
		}
		// The store lists a slot's meals in Course position order (plan store Meals), which Compute relies on.
		if mf.FromLeftover {
			reheat := 0
			if rec.ReheatMinutes != nil {
				reheat = *rec.ReheatMinutes
			}
			mf.ReheatSeconds = cook.DefaultReheatSeconds(m.Portions, reheat)
		} else {
			mf.Steps = scheduleSteps(rec.Steps)
		}
		for i, st := range rec.Steps {
			if st.Kind == schedule.Advance {
				mf.AdvanceSteps = append(mf.AdvanceSteps, notify.AdvanceStepFact{
					ID: int64(i), Description: st.Text, Lead: time.Duration(st.LeadTimeMinutes) * time.Minute,
				})
			}
		}
		out.Meals = append(out.Meals, mf)
		if m.State == plan.StatePlanned && m.Fresh() && m.Key.Date >= today {
			for _, line := range rec.Lines {
				if prev, ok := planned[line.IngredientID]; !ok || m.Key.Date < prev {
					planned[line.IngredientID] = m.Key.Date
				}
			}
		}
	}
	leftovers, err := s.plans.Leftovers(ctx)
	if err != nil {
		return notify.Facts{}, err
	}
	for _, l := range leftovers {
		rec, err := s.recipe(ctx, l.RecipeID, recipes)
		if errors.Is(err, recipestore.ErrNotFound) {
			continue
		}
		if err != nil {
			return notify.Facts{}, err
		}
		out.Leftovers = append(out.Leftovers, notify.LeftoverFact{ID: l.ID, RecipeName: rec.Name, Portions: l.Portions, UseBy: l.UseBy})
	}
	lots, err := s.stock.Lots(ctx, 0)
	if err != nil {
		return notify.Facts{}, err
	}
	names := map[int64]string{}
	for _, l := range lots {
		if l.GoesOff == stock.None {
			continue
		}
		name, err := s.name(ctx, l.IngredientID, names)
		if err != nil {
			return notify.Facts{}, err
		}
		usedBy, ok := planned[l.IngredientID]
		out.Lots = append(out.Lots, notify.LotFact{
			ID: l.ID, IngredientName: name, GoesOff: string(l.GoesOff),
			UsedByPlan: ok && usedBy <= string(l.GoesOff),
		})
	}
	pending, err := s.access.ListPending(ctx, now)
	if err != nil {
		return notify.Facts{}, err
	}
	for _, p := range pending {
		out.AccessRequests = append(out.AccessRequests, notify.AccessRequestFact{ID: p.ID, Name: p.Name, Email: p.Email, RequestedAt: p.RequestedAt})
	}
	return out, nil
}

// recipeEntry is one cached read of a Recipe (its error too: a missing Recipe is missing for every meal).
type recipeEntry struct {
	rec recipe.Recipe
	err error
}

func (s *Source) recipe(ctx context.Context, id int64, cache map[int64]recipeEntry) (recipe.Recipe, error) {
	if e, ok := cache[id]; ok {
		return e.rec, e.err
	}
	rec, err := s.recipes.Get(ctx, id)
	cache[id] = recipeEntry{rec: rec, err: err}
	return rec, err
}

func (s *Source) name(ctx context.Context, id int64, cache map[int64]string) (string, error) {
	if n, ok := cache[id]; ok {
		return n, nil
	}
	ing, err := s.ings.Get(ctx, id)
	if errors.Is(err, ingredientstore.ErrNotFound) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	cache[id] = ing.Name
	return ing.Name, nil
}

// scheduleSteps is a Recipe's Steps as the scheduling input (cook.Timeline), Advance Steps included.
func scheduleSteps(steps []recipe.Step) []schedule.Step {
	out := make([]schedule.Step, 0, len(steps))
	for _, st := range steps {
		out = append(out, schedule.Step{Kind: st.Kind, DurationMinutes: st.DurationMinutes, LeadTimeMinutes: st.LeadTimeMinutes, After: st.After})
	}
	return out
}
