package facts_test

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/notify"
	"github.com/fabbarix/feeder-ng/internal/notify/facts"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/plantest"
	planstore "github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	recipestore "github.com/fabbarix/feeder-ng/internal/recipe/store"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/stocktest"
	stockstore "github.com/fabbarix/feeder-ng/internal/stock/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

var ctx = context.Background()

// ingredients reads Ingredients with plain SQL for the Recipe store's writes.
type ingredients struct{ db *sql.DB }

func (s ingredients) Units(ctx context.Context, id int64) (units.Ingredient, bool, error) {
	var ing units.Ingredient
	var base string
	err := s.db.QueryRowContext(ctx, `SELECT name, base_unit FROM ingredients WHERE id=?`, id).Scan(&ing.Name, &base)
	if errors.Is(err, sql.ErrNoRows) {
		return ing, false, nil
	}
	ing.Base = units.Base(base)
	return ing, err == nil, err
}

type world struct {
	db       *sql.DB
	src      *facts.Source
	dinner   int64
	lunch    int64
	recipes  *recipestore.Store
	plans    *planstore.Store
	stock    *stockstore.Store
	spinach  int64
	milk     int64
	salt     int64
	rice     int64
	eggs     int64
	butter   int64
	now      time.Time
	curry    int64
	porridge int64
	risotto  int64
	omelette int64
}

// key names the main Course of a Meal Slot by its real id (crs-c3: the store has no Course 0).
func (w *world) key(t *testing.T, date string, slot int64) plan.Key {
	return plan.Key{Date: date, MealSlotID: slot, CourseID: w.mainCourse(t)}
}

func (w *world) recipe(t *testing.T, name string, lines []int64, steps []recipe.Step) int64 {
	t.Helper()
	in := recipe.Input{Name: name, Yield: 4, Steps: steps}
	for _, ing := range lines {
		in.Lines = append(in.Lines, recipe.Line{IngredientID: ing, Quantity: 100, Unit: "g"})
	}
	r, err := w.recipes.Create(ctx, in)
	if err != nil {
		t.Fatalf("create recipe %s: %v", name, err)
	}
	return r.ID
}

func (w *world) meal(t *testing.T, date string, slot, recipeID int64, state plan.State, from *plan.Source) {
	t.Helper()
	m, err := w.plans.SaveMeal(ctx, plan.Meal{Key: w.key(t, date, slot), RecipeID: recipeID, Batches: 1, Portions: 4, State: plan.StatePlanned, From: from})
	if err != nil {
		t.Fatalf("save meal %s: %v", date, err)
	}
	if state != plan.StatePlanned {
		if err := w.plans.MarkResolved(ctx, m.Key, state); err != nil {
			t.Fatal(err)
		}
	}
}

func (w *world) mainCourse(t *testing.T) int64 {
	t.Helper()
	var id int64
	if err := w.db.QueryRow(`SELECT id FROM courses WHERE is_main = 1`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func (w *world) courseNamed(t *testing.T, name string) int64 {
	t.Helper()
	var id int64
	if err := w.db.QueryRow(`SELECT id FROM courses WHERE name = ?`, name).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func (w *world) lot(t *testing.T, ing int64, goesOff string) int64 {
	t.Helper()
	l, _, err := w.stock.AddLot(ctx, stockstore.NewLot{IngredientID: ing, Quantity: 500, Purchased: "2026-11-08", GoesOff: stock.Date(goesOff), Source: stockstore.SourceManual})
	if err != nil {
		t.Fatalf("add lot: %v", err)
	}
	return l.ID
}

// Now is Monday 2026-11-09 11:00 in Rome (UTC+1).
func newWorld(t *testing.T) *world {
	t.Helper()
	d := plantest.NewDB(t)
	if _, err := d.Exec(`UPDATE household_settings SET time_zone = 'Europe/Rome'`); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 11, 9, 10, 0, 0, 0, time.UTC)
	clk := clock.NewFake(now)
	w := &world{
		db: d, now: now, src: facts.New(d, clk),
		recipes: recipestore.New(d, clk, ingredients{d}),
		plans:   planstore.New(d, clk),
		stock:   stockstore.New(d, clk),
		dinner:  plantest.SeedMealSlot(t, d, 1, "Dinner", "19:30"),
		lunch:   plantest.SeedMealSlot(t, d, 1, "Lunch", "12:30"),
		spinach: stocktest.SeedIngredient(t, d, "spinach", "g", nil),
		milk:    stocktest.SeedIngredient(t, d, "milk", "g", nil),
		salt:    stocktest.SeedIngredient(t, d, "salt", "g", nil),
		rice:    stocktest.SeedIngredient(t, d, "rice", "g", nil),
		eggs:    stocktest.SeedIngredient(t, d, "eggs", "g", nil),
		butter:  stocktest.SeedIngredient(t, d, "butter", "g", nil),
	}
	w.curry = w.recipe(t, "Chicken curry", []int64{w.spinach}, []recipe.Step{
		{Text: "Marinate the chicken", Kind: schedule.Advance, LeadTimeMinutes: 240},
		{Text: "Simmer the curry", Kind: schedule.Active, DurationMinutes: 45},
	})
	w.porridge = w.recipe(t, "Porridge", []int64{w.milk, w.salt}, []recipe.Step{{Text: "Stir", Kind: schedule.Active, DurationMinutes: 10}})
	w.risotto = w.recipe(t, "Risotto", []int64{w.rice}, []recipe.Step{{Text: "Stir", Kind: schedule.Active, DurationMinutes: 25}})
	w.omelette = w.recipe(t, "Omelette", []int64{w.eggs}, []recipe.Step{{Text: "Fry", Kind: schedule.Active, DurationMinutes: 5}})
	return w
}

func find(fs notify.Facts, date string, slot int64) (notify.MealFact, bool) {
	for _, m := range fs.Meals {
		if m.Date == date && m.MealSlotID == slot {
			return m, true
		}
	}
	return notify.MealFact{}, false
}

func TestFactsCarryPlannedCookedAndSkippedMealsFromYesterdayOn(t *testing.T) {
	w := newWorld(t)
	w.meal(t, "2026-11-07", w.dinner, w.curry, plan.StatePlanned, nil) // too old: not a fact
	w.meal(t, "2026-11-08", w.dinner, w.curry, plan.StateCooked, nil)
	w.meal(t, "2026-11-08", w.lunch, w.porridge, plan.StateSkipped, nil)
	w.meal(t, "2026-11-09", w.dinner, w.curry, plan.StatePlanned, nil)

	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := find(f, "2026-11-07", w.dinner); ok {
		t.Errorf("a Planned Meal from before yesterday must not be a fact")
	}
	for _, c := range []struct {
		date  string
		slot  int64
		state string
	}{
		{"2026-11-08", w.dinner, "cooked"},
		{"2026-11-08", w.lunch, "skipped"},
		{"2026-11-09", w.dinner, notify.MealPlanned},
	} {
		m, ok := find(f, c.date, c.slot)
		if !ok {
			t.Errorf("%s slot %d is missing from the facts", c.date, c.slot)
			continue
		}
		if m.State != c.state {
			t.Errorf("%s slot %d State = %q, want %q", c.date, c.slot, m.State, c.state)
		}
	}
	if len(f.Meals) != 3 {
		t.Errorf("got %d meals, want 3: %+v", len(f.Meals), f.Meals)
	}
}

func TestFactsPutTheSlotInstantInTheHouseholdZoneAndCarryAdvanceStepLeads(t *testing.T) {
	w := newWorld(t)
	w.meal(t, "2026-11-09", w.dinner, w.curry, plan.StatePlanned, nil)
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	m, ok := find(f, "2026-11-09", w.dinner)
	if !ok {
		t.Fatal("meal missing")
	}
	if want := time.Date(2026, 11, 9, 18, 30, 0, 0, time.UTC); !m.SlotAt.Equal(want) { // 19:30 Rome = 18:30Z in November
		t.Errorf("SlotAt = %s, want %s", m.SlotAt.UTC(), want)
	}
	if m.RecipeName != "Chicken curry" || m.FromLeftover {
		t.Errorf("meal = %+v", m)
	}
	if main := w.mainCourse(t); m.CourseID != main {
		t.Errorf("CourseID = %d, want the main Course %d", m.CourseID, main)
	}
	if len(m.Steps) != 2 || m.Steps[1].Kind != schedule.Active || m.Steps[1].DurationMinutes != 45 {
		t.Errorf("Steps = %+v, want the Recipe's two Steps (Advance, then 45 min Active)", m.Steps)
	}
	if len(m.AdvanceSteps) != 1 || m.AdvanceSteps[0].Description != "Marinate the chicken" || m.AdvanceSteps[0].Lead != 4*time.Hour {
		t.Errorf("AdvanceSteps = %+v, want one 4h Advance Step", m.AdvanceSteps)
	}
}

func TestFactsMarkAMealServedFromALeftover(t *testing.T) {
	w := newWorld(t)
	w.meal(t, "2026-11-09", w.dinner, w.risotto, plan.StatePlanned, nil)
	w.meal(t, "2026-11-10", w.dinner, w.risotto, plan.StatePlanned, &plan.Source{From: w.key(t, "2026-11-09", w.dinner)})
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	fresh, _ := find(f, "2026-11-09", w.dinner)
	served, ok := find(f, "2026-11-10", w.dinner)
	if !ok || !served.FromLeftover || fresh.FromLeftover {
		t.Errorf("fresh.FromLeftover = %v, served = %+v (found %v); want only the second served from a Leftover", fresh.FromLeftover, served, ok)
	}
}

func TestFactsSkipAMealWhoseRecipeIsGone(t *testing.T) {
	w := newWorld(t)
	ghost := w.recipe(t, "Ghost stew", []int64{w.rice}, []recipe.Step{{Text: "Stir", Kind: schedule.Active, DurationMinutes: 5}})
	w.meal(t, "2026-11-09", w.lunch, ghost, plan.StatePlanned, nil)
	w.meal(t, "2026-11-09", w.dinner, w.curry, plan.StatePlanned, nil)
	if _, err := w.plans.AddLeftover(ctx, plan.Leftover{RecipeID: ghost, From: w.key(t, "2026-11-08", w.dinner), Portions: 2, CookedOn: "2026-11-08", UseBy: "2026-11-11"}); err != nil {
		t.Fatal(err)
	}
	// Delete the Recipe's row with foreign keys off on one connection.
	conn, err := w.db.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	for _, q := range []string{`PRAGMA foreign_keys = OFF`, `DELETE FROM recipes WHERE id = ` + strconv.FormatInt(ghost, 10), `PRAGMA foreign_keys = ON`} {
		if _, err := conn.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatalf("a missing Recipe must be skipped, not fail the tick: %v", err)
	}
	if _, ok := find(f, "2026-11-09", w.lunch); ok {
		t.Errorf("the meal with a missing Recipe was not skipped")
	}
	if _, ok := find(f, "2026-11-09", w.dinner); !ok {
		t.Errorf("the other meal is missing")
	}
	if len(f.Leftovers) != 0 {
		t.Errorf("a Leftover of a missing Recipe was not skipped: %+v", f.Leftovers)
	}
}

func TestFactsCarryAvailableLeftovers(t *testing.T) {
	w := newWorld(t)
	l, err := w.plans.AddLeftover(ctx, plan.Leftover{RecipeID: w.curry, From: w.key(t, "2026-11-08", w.dinner), Portions: 2, CookedOn: "2026-11-08", UseBy: "2026-11-11"})
	if err != nil {
		t.Fatal(err)
	}
	gone, _ := w.plans.AddLeftover(ctx, plan.Leftover{RecipeID: w.curry, From: w.key(t, "2026-11-07", w.dinner), Portions: 1, CookedOn: "2026-11-07", UseBy: "2026-11-10"})
	if err := w.plans.DiscardLeftover(ctx, gone.ID, "2026-11-09"); err != nil {
		t.Fatal(err)
	}
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	if len(f.Leftovers) != 1 || f.Leftovers[0] != (notify.LeftoverFact{ID: l.ID, RecipeName: "Chicken curry", Portions: 2, UseBy: "2026-11-11"}) {
		t.Errorf("Leftovers = %+v", f.Leftovers)
	}
}

func TestStockLotsAreUsedByPlanOnlyByAFreshPlannedMealOnOrBeforeTheGoOffDate(t *testing.T) {
	w := newWorld(t)
	// Fresh Planned Meals: Curry (spinach) today; Porridge (milk, salt) on 11-11.
	w.meal(t, "2026-11-09", w.dinner, w.curry, plan.StatePlanned, nil)
	w.meal(t, "2026-11-11", w.dinner, w.porridge, plan.StatePlanned, nil)
	// Risotto (rice) only as a Leftover-served meal on 11-10; Omelette (eggs) only Cooked.
	w.meal(t, "2026-11-10", w.dinner, w.risotto, plan.StatePlanned, &plan.Source{From: w.key(t, "2026-11-09", w.lunch)})
	w.meal(t, "2026-11-09", w.lunch, w.omelette, plan.StateCooked, nil)

	spinach := w.lot(t, w.spinach, "2026-11-12") // used on 11-09, before it goes off
	milk := w.lot(t, w.milk, "2026-11-10")       // used on 11-11, after it goes off
	salt := w.lot(t, w.salt, "2026-11-11")       // used on 11-11, the go-off date itself
	rice := w.lot(t, w.rice, "2026-11-12")       // only a Leftover-served meal
	eggs := w.lot(t, w.eggs, "2026-11-12")       // only a Cooked meal
	w.lot(t, w.butter, "")                       // no go-off date: skipped

	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	got := map[int64]notify.LotFact{}
	for _, l := range f.Lots {
		got[l.ID] = l
	}
	if len(got) != 5 {
		t.Errorf("got %d lots, want 5 (the lot with no go-off date is skipped): %+v", len(got), f.Lots)
	}
	for _, c := range []struct {
		name string
		id   int64
		used bool
		off  string
	}{
		{"spinach", spinach, true, "2026-11-12"},
		{"milk", milk, false, "2026-11-10"},
		{"salt (on the go-off date)", salt, true, "2026-11-11"},
		{"rice (Leftover-served meal)", rice, false, "2026-11-12"},
		{"eggs (Cooked meal)", eggs, false, "2026-11-12"},
	} {
		l, ok := got[c.id]
		if !ok {
			t.Errorf("%s: lot missing", c.name)
			continue
		}
		if l.UsedByPlan != c.used || l.GoesOff != c.off {
			t.Errorf("%s: UsedByPlan = %v, GoesOff = %s; want %v, %s", c.name, l.UsedByPlan, l.GoesOff, c.used, c.off)
		}
	}
	if got[spinach].IngredientName != "spinach" {
		t.Errorf("IngredientName = %q", got[spinach].IngredientName)
	}
}

// A slot with two Courses gives one MealFact per Course, in the slot's Course order (Starter before Main
// here, by the Courses' positions), each with its own CourseID and Steps: Compute hands them to cook.Timeline.
func TestFactsListTheCoursesOfASlotInCourseOrder(t *testing.T) {
	w := newWorld(t)
	starter, main := w.courseNamed(t, "Starter"), w.mainCourse(t)
	for _, c := range []struct{ course, recipe int64 }{{main, w.curry}, {starter, w.omelette}} {
		if _, err := w.plans.SaveMeal(ctx, plan.Meal{Key: plan.Key{Date: "2026-11-09", MealSlotID: w.dinner, CourseID: c.course},
			RecipeID: c.recipe, Batches: 1, Portions: 4, State: plan.StatePlanned}); err != nil {
			t.Fatal(err)
		}
	}
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	var got []notify.MealFact
	for _, m := range f.Meals {
		if m.Date == "2026-11-09" && m.MealSlotID == w.dinner {
			got = append(got, m)
		}
	}
	if len(got) != 2 || got[0].CourseID != main || got[1].CourseID != starter {
		t.Fatalf("want the main Course (position 0) then Starter, got %+v", got)
	}
	if got[1].RecipeName != "Omelette" || len(got[1].Steps) != 1 || got[1].Steps[0].DurationMinutes != 5 {
		t.Errorf("Starter fact = %+v, want Omelette with its one 5 min Step", got[1])
	}
}

// A Leftover-served Course carries the length of its Reheat, not Steps, so the timeline can place it.
func TestFactsGiveALeftoverCourseItsReheatLength(t *testing.T) {
	w := newWorld(t)
	mins := 7
	if _, err := w.db.Exec(`UPDATE recipes SET reheat_minutes = ? WHERE id = ?`, mins, w.risotto); err != nil {
		t.Fatal(err)
	}
	src := &plan.Source{From: plan.Key{Date: "2026-11-08", MealSlotID: w.dinner, CourseID: w.mainCourse(t)}}
	w.meal(t, "2026-11-09", w.dinner, w.risotto, plan.StatePlanned, src)
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	m, ok := find(f, "2026-11-09", w.dinner)
	if !ok || !m.FromLeftover {
		t.Fatalf("meal = %+v, ok = %v", m, ok)
	}
	if m.ReheatSeconds != 7*60 || len(m.Steps) != 0 {
		t.Errorf("ReheatSeconds = %d, Steps = %+v; want 420 and none", m.ReheatSeconds, m.Steps)
	}
}

// With no reheat_minutes on the Recipe, a Leftover-served Course reheats by the portions formula.
func TestFactsGiveALeftoverCourseWithoutReheatMinutesTheDefaultLength(t *testing.T) {
	w := newWorld(t)
	if _, err := w.db.Exec(`UPDATE recipes SET reheat_minutes = NULL WHERE id = ?`, w.risotto); err != nil {
		t.Fatal(err)
	}
	src := &plan.Source{From: plan.Key{Date: "2026-11-08", MealSlotID: w.dinner, CourseID: w.mainCourse(t)}}
	m3, err := w.plans.SaveMeal(ctx, plan.Meal{Key: w.key(t, "2026-11-09", w.dinner), RecipeID: w.risotto, Batches: 1, Portions: 3, State: plan.StatePlanned, From: src})
	if err != nil {
		t.Fatal(err)
	}
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	m, ok := find(f, m3.Key.Date, w.dinner)
	if !ok || !m.FromLeftover {
		t.Fatalf("meal = %+v, ok = %v", m, ok)
	}
	if m.ReheatSeconds != 240 {
		t.Errorf("ReheatSeconds = %d, want 240 (120 s + 60 s for each of 2 further portions)", m.ReheatSeconds)
	}
}
