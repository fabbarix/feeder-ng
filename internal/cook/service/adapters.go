package service

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/household"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/images"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
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

// Steps implements Recipes: the Recipe's Steps with its Base recipes' Steps composed in and Ingredient names on their
// uses, everything made (a Recipe opened on its own assumes nothing is in Stock; BR-G).
func (r dbRecipes) Steps(ctx context.Context, recipeID int64) (cook.RecipeSteps, error) {
	return r.compose(ctx, recipeID, nil)
}

// MealSteps implements MealRecipes: the Steps of a Planned Meal's Recipe with its Batches, the Base recipe Ingredients
// Stock holds taken first (baserecipe.MadeFractions over the Stock on hand): a block that Stock covers is left out of
// the view, not out of the indexes (BR-G, design section 9). A Recipe whose tree cannot be built (a cycle written before the
// check) is composed as if nothing were in Stock.
func (r dbRecipes) MealSteps(ctx context.Context, recipeID int64, batches float64) (cook.RecipeSteps, error) {
	tree, err := r.a.rc.NeedTree(ctx, recipeID)
	if errors.Is(err, baserecipe.ErrCycle) {
		return r.compose(ctx, recipeID, nil)
	}
	if err != nil {
		return cook.RecipeSteps{}, err
	}
	have, err := r.a.stockOnHand(ctx)
	if err != nil {
		return cook.RecipeSteps{}, err
	}
	made := baserecipe.MadeFractions(tree, batches, func(id int64) float64 { return have[id] })
	return r.compose(ctx, recipeID, made)
}

// compose is the Recipe's composed Steps (baserecipe.ComposeSteps through the store) as Cook Mode needs them. made is nil
// for everything made.
func (r dbRecipes) compose(ctx context.Context, recipeID int64, made func(baserecipe.Path) float64) (cook.RecipeSteps, error) {
	rec, err := r.a.rc.Get(ctx, recipeID)
	if errors.Is(err, recipestore.ErrNotFound) {
		return cook.RecipeSteps{}, ErrNotFound
	}
	if err != nil {
		return cook.RecipeSteps{}, err
	}
	comp, err := r.a.rc.Cook(ctx, recipeID, made)
	if errors.Is(err, baserecipe.ErrNotFound) {
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
	own := 0 // the Recipe's own Steps come in their order; the next one gives the image
	for _, cs := range comp.Steps {
		step := cook.Step{
			Kind: cs.Kind, Text: cs.Text, DurationMinutes: cs.DurationMinutes, LeadTimeMinutes: cs.LeadTimeMinutes,
			After: cs.After, Covered: cs.Covered,
		}
		if cs.Origin == nil {
			if own < len(rec.Steps) && rec.Steps[own].Text == cs.Text {
				if img := rec.Steps[own].Image; img != "" {
					step.ImageURL = images.URL(img)
				}
				own++
			}
		} else {
			step.BaseRecipe = &cook.BaseRecipe{ID: cs.Origin.BaseRecipeID, Name: cs.Origin.Names[len(cs.Origin.Names)-1],
				Path: append([]string(nil), cs.Origin.Names...)}
		}
		for _, u := range cs.Uses {
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

// stockOnHand is the quantity of Stock held per Ingredient (the Lots' quantities).
func (a *DB) stockOnHand(ctx context.Context) (map[int64]float64, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT ingredient_id, SUM(quantity) FROM stock_lots GROUP BY ingredient_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	have := map[int64]float64{}
	for rows.Next() {
		var id int64
		var q float64
		if err := rows.Scan(&id, &q); err != nil {
			return nil, err
		}
		have[id] = q
	}
	return have, rows.Err()
}

type dbMeals struct{ a *DB }

// mealSelect reads a Planned Meal with its Course (name, main flag, place in the slot's order). A Course missing
// from the slot's list sorts last.
//
// The instant is not read here: the date's own time (meal_slot_dates, "" when none) comes back as ownTime, and
// slotInstant applies household.EffectiveTime to it with the usual time (ADR 0014).
const mealSelect = `SELECT pm.date, pm.meal_slot_id, ms.name, COALESCE(msd.time, ''), pm.recipe_id, pm.batches, pm.state,
	pm.course_id, c.name, c.is_main, COALESCE(msc.position, 9999), pm.portions
	FROM planned_meals pm
	JOIN meal_slots ms ON ms.id = pm.meal_slot_id
	JOIN courses c ON c.id = pm.course_id
	LEFT JOIN meal_slot_courses msc ON msc.meal_slot_id = pm.meal_slot_id AND msc.course_id = pm.course_id
	LEFT JOIN meal_slot_dates msd ON msd.slot_id = pm.meal_slot_id AND msd.date = pm.date`

// Meal implements Meals. A Course id that is not above 0 names no Course.
func (m dbMeals) Meal(ctx context.Context, date string, mealSlotID, courseID int64) (MealInfo, error) {
	if courseID <= 0 {
		return MealInfo{}, ErrNotFound
	}
	loc, err := m.a.zone(ctx)
	if err != nil {
		return MealInfo{}, err
	}
	q := mealSelect + ` WHERE pm.date = ? AND pm.meal_slot_id = ? AND pm.course_id = ?`
	info, own, err := scanMeal(m.a.db.QueryRowContext(ctx, q, date, mealSlotID, courseID))
	if errors.Is(err, sql.ErrNoRows) {
		return MealInfo{}, ErrNotFound
	}
	if err != nil {
		return MealInfo{}, err
	}
	info.At, err = m.a.slotInstant(ctx, info.MealSlotID, info.Date, own, loc)
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
	var out []MealInfo
	var owns []string
	for rows.Next() {
		info, own, err := scanMeal(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, info)
		owns = append(owns, own)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// The instants are read after the rows are closed: each one may query the Meal Slot.
	for i := range out {
		at, err := m.a.slotInstant(ctx, out[i].MealSlotID, out[i].Date, owns[i], loc)
		if err != nil {
			return nil, err
		}
		out[i].At = at
	}
	return out, nil
}

// slotInstant is the instant of a Planned Meal's Meal Slot on its date, at the effective time: the date's own time
// when it has one (ownTime, "" when none), else the usual time (household.EffectiveTime; ADR 0014). loc is the
// household zone.
func (a *DB) slotInstant(ctx context.Context, mealSlotID int64, date, ownTime string, loc *time.Location) (time.Time, error) {
	slot, err := a.hh.Slot(ctx, mealSlotID)
	if err != nil {
		return time.Time{}, err
	}
	hhmm := household.EffectiveTime(slot.Time, household.SlotDate{SlotID: mealSlotID, Date: date, Time: ownTime})
	at, err := time.ParseInLocation("2006-01-02 15:04", date+" "+hhmm, loc)
	if err != nil {
		return time.Time{}, err
	}
	return at.UTC(), nil
}

type scanner interface {
	Scan(dest ...any) error
}

// scanMeal reads one row of mealSelect; the slot time is household time in loc.
// scanMeal reads one mealSelect row; ownTime is the date's own time ("" for the usual one). The instant is set by the
// caller (slotInstant).
func scanMeal(sc scanner) (MealInfo, string, error) {
	var (
		info    MealInfo
		ownTime string
		main    int64
	)
	if err := sc.Scan(&info.Date, &info.MealSlotID, &info.SlotName, &ownTime, &info.RecipeID, &info.Batches, &info.State,
		&info.CourseID, &info.CourseName, &main, &info.Position, &info.Portions); err != nil {
		return MealInfo{}, "", err
	}
	info.Main = main == 1
	return info, ownTime, nil
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
