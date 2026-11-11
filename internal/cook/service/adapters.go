package service

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/images"
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
	if rec.ReheatMinutes != nil {
		out.ReheatMinutes = *rec.ReheatMinutes
	}
	for _, st := range rec.Steps {
		step := cook.Step{
			Kind: st.Kind, Text: st.Text, DurationMinutes: st.DurationMinutes, LeadTimeMinutes: st.LeadTimeMinutes,
			After: st.After,
		}
		if st.Image != "" {
			step.ImageURL = images.URL(st.Image)
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

// mealSelect reads a Planned Meal with its Course (name, main flag, place in the slot's order) and its Recipe's
// reheat time. A Course missing from the slot's list sorts last.
const mealSelect = `SELECT pm.date, pm.meal_slot_id, ms.name, ms.time, pm.recipe_id, pm.batches, pm.state,
	pm.course_id, c.name, c.is_main, COALESCE(msc.position, 9999), pm.portions, COALESCE(r.reheat_minutes, 0)
	FROM planned_meals pm
	JOIN meal_slots ms ON ms.id = pm.meal_slot_id
	JOIN courses c ON c.id = pm.course_id
	LEFT JOIN meal_slot_courses msc ON msc.meal_slot_id = pm.meal_slot_id AND msc.course_id = pm.course_id
	LEFT JOIN recipes r ON r.id = pm.recipe_id`

// Meal implements Meals; courseID 0 is the main Course.
func (m dbMeals) Meal(ctx context.Context, date string, mealSlotID, courseID int64) (MealInfo, error) {
	loc, err := m.a.zone(ctx)
	if err != nil {
		return MealInfo{}, err
	}
	q := mealSelect + ` WHERE pm.date = ? AND pm.meal_slot_id = ? AND pm.course_id = `
	args := []any{date, mealSlotID}
	if courseID == 0 {
		q += `(SELECT id FROM courses WHERE is_main = 1)`
	} else {
		q += `?`
		args = append(args, courseID)
	}
	info, err := scanMeal(m.a.db.QueryRowContext(ctx, q, args...), loc)
	if errors.Is(err, sql.ErrNoRows) {
		return MealInfo{}, ErrNotFound
	}
	return info, err
}

// Slot implements Meals: the Planned Meals of a slot on a date in the slot's Course order.
func (m dbMeals) Slot(ctx context.Context, date string, mealSlotID int64) ([]MealInfo, error) {
	return m.query(ctx, mealSelect+` WHERE pm.date = ? AND pm.meal_slot_id = ? ORDER BY COALESCE(msc.position, 9999), pm.course_id`,
		date, mealSlotID)
}

// Upcoming implements Meals: Planned Meals in state planned from fromDate on.
func (m dbMeals) Upcoming(ctx context.Context, fromDate string) ([]MealInfo, error) {
	return m.query(ctx, mealSelect+` WHERE pm.state = 'planned' AND pm.date >= ?
		ORDER BY pm.date, pm.meal_slot_id, COALESCE(msc.position, 9999)`, fromDate)
}

func (m dbMeals) query(ctx context.Context, q string, args ...any) ([]MealInfo, error) {
	loc, err := m.a.zone(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := m.a.db.QueryContext(ctx, q, args...)
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
		main int64
	)
	if err := sc.Scan(&info.Date, &info.MealSlotID, &info.SlotName, &hhmm, &info.RecipeID, &info.Batches, &info.State,
		&info.CourseID, &info.CourseName, &main, &info.Position, &info.Portions, &info.ReheatMinutes); err != nil {
		return MealInfo{}, err
	}
	info.Main = main == 1
	at, err := time.ParseInLocation("2006-01-02 15:04", info.Date+" "+hhmm, loc)
	if err != nil {
		return MealInfo{}, err
	}
	info.At = at.UTC()
	return info, nil
}

type dbWaste struct{ a *DB }

// StreakInput implements Waste (see DB.StreakInput).
func (w dbWaste) StreakInput(ctx context.Context) (cook.StreakInput, error) {
	return w.a.StreakInput(ctx)
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
func (a *DB) StreakInput(ctx context.Context) (cook.StreakInput, error) {
	var in cook.StreakInput
	loc, err := a.zone(ctx)
	if err != nil {
		return in, err
	}
	created, err := a.hh.Created(ctx)
	if err != nil {
		return in, err
	}
	in.Created = stock.Date(created.In(loc).Format("2006-01-02"))
	lots, err := a.db.QueryContext(ctx, `SELECT id, goes_off, kept_on FROM stock_lots WHERE goes_off IS NOT NULL`)
	if err != nil {
		return in, err
	}
	defer lots.Close()
	for lots.Next() {
		var (
			l    cook.LotGoOff
			g, k sql.NullString
		)
		if err := lots.Scan(&l.ID, &g, &k); err != nil {
			return in, err
		}
		l.GoesOff, l.KeptOn = stock.Date(g.String), stock.Date(k.String)
		in.Lots = append(in.Lots, l)
	}
	if err := lots.Err(); err != nil {
		return in, err
	}
	waste, err := a.db.QueryContext(ctx, `SELECT lot_id, wasted_on, lot_goes_off FROM stock_waste`)
	if err != nil {
		return in, err
	}
	defer waste.Close()
	for waste.Next() {
		var (
			w  cook.WasteEvent
			id sql.NullInt64
			g  sql.NullString
			on string
		)
		if err := waste.Scan(&id, &on, &g); err != nil {
			return in, err
		}
		w.LotID, w.WastedOn, w.LotGoesOff = id.Int64, stock.Date(on), stock.Date(g.String)
		in.Waste = append(in.Waste, w)
	}
	if err := waste.Err(); err != nil {
		return in, err
	}
	offs, err := a.db.QueryContext(ctx, `SELECT lot_id, goes_off FROM stock_go_offs`)
	if err != nil {
		return in, err
	}
	defer offs.Close()
	for offs.Next() {
		var (
			g  cook.GoOffEvent
			on string
		)
		if err := offs.Scan(&g.LotID, &on); err != nil {
			return in, err
		}
		g.GoesOff = stock.Date(on)
		in.GoOffs = append(in.GoOffs, g)
	}
	return in, offs.Err()
}
