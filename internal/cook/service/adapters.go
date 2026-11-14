package service

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/household"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/images"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
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
// Stock holds taken first (baserecipe.MadeFractions over the Stock that has not gone off by the meal's date): a block that
// Stock covers is left out of the view, not out of the indexes (BR-G, design section 9). A Recipe whose tree cannot be built
// (a cycle written before the check) is composed as if nothing were in Stock.
func (r dbRecipes) MealSteps(ctx context.Context, recipeID int64, batches float64, date string) (cook.RecipeSteps, error) {
	tree, err := r.a.rc.NeedTree(ctx, recipeID)
	if errors.Is(err, baserecipe.ErrCycle) {
		return r.compose(ctx, recipeID, nil)
	}
	if errors.Is(err, baserecipe.ErrNotFound) {
		return cook.RecipeSteps{}, ErrNotFound
	}
	if err != nil {
		return cook.RecipeSteps{}, err
	}
	have, err := r.a.stockUsable(ctx, date)
	if err != nil {
		return cook.RecipeSteps{}, err
	}
	tree = baserecipe.RequiredOnly(tree)
	made := baserecipe.MadeFractions(tree, batches, func(id int64) float64 { return have[id] })
	return r.compose(ctx, recipeID, made)
}

// SlotSteps implements SlotRecipes: the Steps of the slot's meals in order, sharing one Stock on hand: meal i sees what
// meals 0..i-1 leave (baserecipe.Resolve takes from the availability, as Cooked does; BR-G round 2). The meals of a slot share
// a date, so the first meal's date judges the Stock.
func (r dbRecipes) SlotSteps(ctx context.Context, meals []SlotMeal) ([]cook.RecipeSteps, error) {
	date := ""
	if len(meals) > 0 {
		date = meals[0].Date
	}
	have, err := r.a.stockUsable(ctx, date)
	if err != nil {
		return nil, err
	}
	pool := func(id int64) float64 { return have[id] }
	take := func(id int64, q float64) { have[id] -= q }
	out := make([]cook.RecipeSteps, 0, len(meals))
	for _, m := range meals {
		var made func(baserecipe.Path) float64
		tree, err := r.a.rc.NeedTree(ctx, m.RecipeID)
		switch {
		case errors.Is(err, baserecipe.ErrCycle): // composed as everything made, below
		case errors.Is(err, baserecipe.ErrNotFound):
			return nil, ErrNotFound
		case err != nil:
			return nil, err
		case m.Batches > 0:
			tree = baserecipe.RequiredOnly(tree)
			made = baserecipe.MadeFractions(tree, m.Batches, pool)
			baserecipe.Resolve(tree, m.Batches, pool, take)
		}
		rs, err := r.compose(ctx, m.RecipeID, made)
		if err != nil {
			return nil, err
		}
		out = append(out, rs)
	}
	return out, nil
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
	switch {
	case errors.Is(err, baserecipe.ErrCycle):
		// A cycle written before the check: the Recipe's own Steps, as before Base recipes, and a warning.
		slog.Default().Warn("recipe with a Base recipe cycle: its own Steps only", "recipe", recipeID, "err", err)
		comp = ownComposed(rec.Steps)
	case errors.Is(err, baserecipe.ErrNotFound):
		return cook.RecipeSteps{}, ErrNotFound
	case err != nil:
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

// ownComposed is a Recipe's own Steps in the composed form, with no Base recipe Steps in them.
func ownComposed(steps []recipe.Step) baserecipe.Composed {
	out := baserecipe.Composed{Steps: make([]baserecipe.ComposedStep, 0, len(steps))}
	for _, st := range steps {
		cs := baserecipe.ComposedStep{Step: baserecipe.Step{Text: st.Text, Kind: st.Kind, DurationMinutes: st.DurationMinutes,
			LeadTimeMinutes: st.LeadTimeMinutes, After: st.After}}
		for _, u := range st.Uses {
			cs.Uses = append(cs.Uses, schedule.Use{IngredientID: u.IngredientID, Quantity: u.Quantity, Unit: u.Unit})
		}
		out.Steps = append(out.Steps, cs)
	}
	return out
}

// stockUsable is the quantity of Stock per Ingredient that can cover a meal on mealDate (beta.8): stock.UsableOn over the Lots
// at the later of the meal's date and the household's today, as the Shopping List judges Stock. A meal of an earlier date is
// judged by today: nothing that has gone off since covers it.
func (a *DB) stockUsable(ctx context.Context, mealDate string) (map[int64]float64, error) {
	zone, err := a.zone(ctx)
	if err != nil {
		return nil, err
	}
	date := stock.Date(a.clk.Now().In(zone).Format("2006-01-02"))
	if md := stock.Date(mealDate); md > date {
		date = md
	}
	rows, err := a.db.QueryContext(ctx, `SELECT ingredient_id, quantity, goes_off FROM stock_lots`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var lots []stock.Lot
	for rows.Next() {
		var l stock.Lot
		var off sql.NullString
		if err := rows.Scan(&l.IngredientID, &l.Quantity, &off); err != nil {
			return nil, err
		}
		if off.Valid {
			l.GoesOff = stock.Date(off.String)
		}
		lots = append(lots, l)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return stock.UsableOn(lots, date), nil
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
