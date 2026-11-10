package service

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	recipestore "github.com/fabbarix/feeder-ng/internal/recipe/store"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/sun"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// DB is the SQL side of the ports: the recipe, ingredient and household
// stores, and the planned_meals and stock tables read directly.
type DB struct {
	db  *sql.DB
	clk clock.Clock
	rc  *recipestore.Store
	ing *ingredientstore.Store
	hh  *householdstore.Store
}

// NewDB returns the production adapters over d.
func NewDB(d *sql.DB, clk clock.Clock) *DB {
	ing := ingredientstore.New(d, clk)
	return &DB{db: d, clk: clk, ing: ing, rc: recipestore.New(d, clk, ingredientUnits{ing}), hh: householdstore.New(d, clk)}
}

// Recipes returns the Recipe port.
func (a *DB) Recipes() Recipes { return dbRecipes{a} }

// Meals returns the Planned Meal port.
func (a *DB) Meals() Meals { return dbMeals{a} }

// Waste returns the Stock dates port.
func (a *DB) Waste() Waste { return dbWaste{a} }

// Household returns the time zone and Location port.
func (a *DB) Household() Household { return dbHousehold{a} }

// ingredientUnits gives the recipe store the Ingredients' unit conversions.
type ingredientUnits struct{ st *ingredientstore.Store }

func (u ingredientUnits) Units(ctx context.Context, id int64) (units.Ingredient, bool, error) {
	ing, err := u.st.Get(ctx, id)
	if errors.Is(err, ingredientstore.ErrNotFound) {
		return units.Ingredient{}, false, nil
	}
	if err != nil {
		return units.Ingredient{}, false, err
	}
	return ing.Units(), true, nil
}

type dbRecipes struct{ a *DB }

// Steps implements Recipes: the Recipe's Steps with Ingredient names on their uses.
func (r dbRecipes) Steps(ctx context.Context, recipeID int64) (cook.RecipeSteps, error) {
	rec, err := r.a.rc.Get(ctx, recipeID)
	if errors.Is(err, recipestore.ErrNotFound) {
		return cook.RecipeSteps{}, ErrNotFound
	}
	if err != nil {
		return cook.RecipeSteps{}, err
	}
	names := map[int64]string{}
	out := cook.RecipeSteps{RecipeID: recipeID, Name: rec.Name}
	for _, st := range rec.Steps {
		step := cook.Step{
			Kind: st.Kind, Text: st.Text, DurationMinutes: st.DurationMinutes, LeadTimeMinutes: st.LeadTimeMinutes,
		}
		if st.Image != "" {
			step.ImageURL = "/api/images/" + st.Image
		}
		for _, u := range st.Uses {
			name, ok := names[u.IngredientID]
			if !ok {
				ing, err := r.a.ing.Get(ctx, u.IngredientID)
				if err != nil && !errors.Is(err, ingredientstore.ErrNotFound) {
					return cook.RecipeSteps{}, err
				}
				name = ing.Name
				names[u.IngredientID] = name
			}
			step.Uses = append(step.Uses, schedule.Use{IngredientID: u.IngredientID, Ingredient: name, Quantity: u.Quantity, Unit: u.Unit})
		}
		out.Steps = append(out.Steps, step)
	}
	return out, nil
}

type dbMeals struct{ a *DB }

const mealSelect = `SELECT pm.date, pm.meal_slot_id, ms.name, ms.time, pm.recipe_id, pm.batches, pm.state
	FROM planned_meals pm JOIN meal_slots ms ON ms.id = pm.meal_slot_id`

// Meal implements Meals.
func (m dbMeals) Meal(ctx context.Context, date string, mealSlotID int64) (MealInfo, error) {
	loc, err := m.a.zone(ctx)
	if err != nil {
		return MealInfo{}, err
	}
	row := m.a.db.QueryRowContext(ctx, mealSelect+` WHERE pm.date = ? AND pm.meal_slot_id = ?`, date, mealSlotID)
	info, err := scanMeal(row, loc)
	if errors.Is(err, sql.ErrNoRows) {
		return MealInfo{}, ErrNotFound
	}
	return info, err
}

// Upcoming implements Meals: Planned Meals in state planned from fromDate on.
func (m dbMeals) Upcoming(ctx context.Context, fromDate string) ([]MealInfo, error) {
	loc, err := m.a.zone(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := m.a.db.QueryContext(ctx, mealSelect+` WHERE pm.state = 'planned' AND pm.date >= ?
		ORDER BY pm.date, pm.meal_slot_id`, fromDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MealInfo
	for rows.Next() {
		info, err := scanMeal(rows, loc)
		if err != nil {
			return nil, err
		}
		out = append(out, info)
	}
	return out, rows.Err()
}

type scanner interface {
	Scan(dest ...any) error
}

// scanMeal reads one row of mealSelect; the slot time is household time in loc.
func scanMeal(sc scanner, loc *time.Location) (MealInfo, error) {
	var (
		info MealInfo
		hhmm string
	)
	if err := sc.Scan(&info.Date, &info.MealSlotID, &info.SlotName, &hhmm, &info.RecipeID, &info.Batches, &info.State); err != nil {
		return MealInfo{}, err
	}
	at, err := time.ParseInLocation("2006-01-02 15:04", info.Date+" "+hhmm, loc)
	if err != nil {
		return MealInfo{}, err
	}
	info.At = at.UTC()
	return info, nil
}

type dbWaste struct{ a *DB }

// LastWaste implements Waste: the newest waste date, stock.None when there is none.
func (w dbWaste) LastWaste(ctx context.Context) (stock.Date, error) {
	return w.a.maxDate(ctx, `SELECT MAX(wasted_on) FROM stock_waste`)
}

// FirstActivity implements Waste: the earliest Stock Lot purchase date.
func (w dbWaste) FirstActivity(ctx context.Context) (stock.Date, error) {
	return w.a.maxDate(ctx, `SELECT MIN(purchased) FROM stock_lots`)
}

func (a *DB) maxDate(ctx context.Context, query string) (stock.Date, error) {
	var d sql.NullString
	if err := a.db.QueryRowContext(ctx, query).Scan(&d); err != nil {
		return stock.None, err
	}
	if !d.Valid {
		return stock.None, nil
	}
	return stock.Date(d.String), nil
}

type dbHousehold struct{ a *DB }

// Zone implements Household: the household time zone, UTC when unset or unknown.
func (h dbHousehold) Zone(ctx context.Context) (*time.Location, error) {
	return h.a.zone(ctx)
}

// Coords implements Household. A Location given as a city name only is cityOnly.
func (h dbHousehold) Coords(ctx context.Context) (*sun.Coords, bool, error) {
	s, err := h.a.hh.Settings(ctx)
	if err != nil {
		return nil, false, err
	}
	if s.Location == nil {
		return nil, false, nil
	}
	if s.Location.Latitude != nil && s.Location.Longitude != nil {
		return &sun.Coords{Lat: *s.Location.Latitude, Lon: *s.Location.Longitude}, false, nil
	}
	return nil, s.Location.City != "", nil
}

// zone is the household time zone (UTC when unset or unknown).
func (a *DB) zone(ctx context.Context) (*time.Location, error) {
	s, err := a.hh.Settings(ctx)
	if err != nil {
		return nil, err
	}
	if s.TimeZone != "" {
		if loc, err := time.LoadLocation(s.TimeZone); err == nil {
			return loc, nil
		}
	}
	return time.UTC, nil
}

// StreakInput gathers what cook.ZeroWasteStreak needs (R11c): the Household's creation date in the
// household zone, the Lots not forgiven by Keep with their go-off dates, and the waste records.
// today is left for the caller to set.
// STUB (R11c test author): returns an empty input; the developer implements it.
func (a *DB) StreakInput(ctx context.Context) (cook.StreakInput, error) {
	return cook.StreakInput{}, nil
}
