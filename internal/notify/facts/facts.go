// Package facts is the production notify.FactSource: it reads Planned Meals,
// Leftovers and Stock Lots from Planning, Recipes, Stock and Household and
// hands plain facts to the pure notify package. Push and the Today screen share
// it, so both see the same plan.
package facts

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"maps"
	"time"

	accessstore "github.com/fabbarix/feeder-ng/internal/access/store"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
	coursestore "github.com/fabbarix/feeder-ng/internal/course/store"
	"github.com/fabbarix/feeder-ng/internal/household"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/notify"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	planstore "github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
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
	meals, err := s.plans.Meals(ctx, todayDate.AddDate(0, 0, -1).Format("2006-01-02"), "")
	if err != nil {
		return notify.Facts{}, err
	}
	var out notify.Facts
	recipes := map[int64]recipeEntry{} // each Recipe is read once per call
	planned := map[int64]string{}      // Ingredient -> earliest fresh Planned Meal use from today on
	lots, err := s.stock.Lots(ctx, 0)
	if err != nil {
		return notify.Facts{}, err
	}
	have := stockOnHand(lots)                // what Cook Mode sees: a Base recipe's jar covers its block for the meal's Batches (BR-G)
	pools := map[slotKey]map[int64]float64{} // the Stock each slot's Courses share, in Course order, per date and Meal Slot
	for _, m := range meals {
		// The slot's effective time on the date: the date's own time when it has one (ADR 0014).
		// A Meal Slot that is gone is skipped; any other lookup error is returned (a missing reminder is not silent).
		day, err := s.slots.SlotDate(ctx, m.Key.MealSlotID, m.Key.Date)
		if errors.Is(err, household.ErrNotFound) {
			continue
		}
		if err != nil {
			return notify.Facts{}, err
		}
		at, err := plan.SlotInstant(m.Key.Date, day.Time, loc)
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
			key := slotKey{date: m.Key.Date, slot: m.Key.MealSlotID}
			pool, ok := pools[key]
			if !ok {
				pool = maps.Clone(have)
				pools[key] = pool
			}
			composed, err := s.composeMeal(ctx, m, rec, pool)
			if err != nil {
				return notify.Facts{}, err
			}
			mf.Steps = scheduleSteps(composed)
			// The ID of an Advance Step is its index in the composed Steps; a covered one is not asked for.
			for i, st := range composed {
				if st.Kind == schedule.Advance && !st.Covered {
					mf.AdvanceSteps = append(mf.AdvanceSteps, notify.AdvanceStepFact{
						ID: int64(i), Description: st.Text, Lead: time.Duration(st.LeadTimeMinutes) * time.Minute,
					})
				}
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
		// The 10:00 Use-by push is for an ordinary Leftover: a frozen one is due on its Frozen Use-by, and one to answer is
		// asked on Today, not pushed (ADR 0012).
		if l.Frozen() || plan.IsToAnswer(l, today) {
			continue
		}
		rec, err := s.recipe(ctx, l.RecipeID, recipes)
		if errors.Is(err, recipestore.ErrNotFound) {
			continue
		}
		if err != nil {
			return notify.Facts{}, err
		}
		out.Leftovers = append(out.Leftovers, notify.LeftoverFact{ID: l.ID, RecipeName: rec.Name, Portions: l.Portions, UseBy: l.UseBy})
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

// slotKey is one Meal Slot occurrence: the Courses of a slot share the Stock within it, never across days.
type slotKey struct {
	date string
	slot int64
}

// composeMeal is the Recipe's Steps for a fresh Planned Meal, as Cook Mode walks them (BR-G): its Base recipes composed in, and
// the Stock the Courses of its slot before it leave (pool, shared by the slot in Course order). A planned meal takes its
// blocks from the pool; another state only reads it. A cycle written before the check gives the Recipe's own Steps and a
// warning, so one Recipe never fails Facts.
func (s *Source) composeMeal(ctx context.Context, m plan.Meal, rec recipe.Recipe, pool map[int64]float64) ([]baserecipe.ComposedStep, error) {
	have := func(id int64) float64 { return pool[id] }
	tree, err := s.recipes.NeedTree(ctx, m.RecipeID)
	if errors.Is(err, baserecipe.ErrCycle) {
		return ownSteps(m.RecipeID, rec, err), nil
	}
	if err != nil {
		return nil, err
	}
	made := baserecipe.MadeFractions(tree, m.Batches, have)
	if m.State == plan.StatePlanned {
		baserecipe.Resolve(tree, m.Batches, have, func(id int64, q float64) { pool[id] -= q })
	}
	comp, err := s.recipes.Cook(ctx, m.RecipeID, made)
	if errors.Is(err, baserecipe.ErrCycle) {
		return ownSteps(m.RecipeID, rec, err), nil
	}
	if err != nil {
		return nil, err
	}
	return comp.Steps, nil
}

// ownSteps is a Recipe's own Steps in the composed form (no Base recipe Steps), with a warning for the cycle that cost them.
func ownSteps(recipeID int64, rec recipe.Recipe, cause error) []baserecipe.ComposedStep {
	slog.Default().Warn("recipe with a Base recipe cycle: its own Steps only", "recipe", recipeID, "err", cause)
	out := make([]baserecipe.ComposedStep, 0, len(rec.Steps))
	for _, st := range rec.Steps {
		out = append(out, baserecipe.ComposedStep{Step: baserecipe.Step{Text: st.Text, Kind: st.Kind,
			DurationMinutes: st.DurationMinutes, LeadTimeMinutes: st.LeadTimeMinutes, After: st.After}})
	}
	return out
}

// stockOnHand is the quantity of Stock held per Ingredient.
func stockOnHand(lots []stockstore.StoredLot) map[int64]float64 {
	have := make(map[int64]float64, len(lots))
	for _, l := range lots {
		have[l.IngredientID] += l.Quantity
	}
	return have
}

// scheduleSteps is a composed Recipe's Steps as the scheduling input (cook.Timeline), Advance Steps included. A covered
// Step is a zero-length Active Step, as in Cook Mode.
func scheduleSteps(steps []baserecipe.ComposedStep) []schedule.Step {
	out := make([]schedule.Step, 0, len(steps))
	for _, st := range steps {
		if st.Covered {
			out = append(out, schedule.Step{Kind: schedule.Active, After: st.After})
			continue
		}
		out = append(out, schedule.Step{Kind: st.Kind, DurationMinutes: st.DurationMinutes, LeadTimeMinutes: st.LeadTimeMinutes, After: st.After})
	}
	return out
}
