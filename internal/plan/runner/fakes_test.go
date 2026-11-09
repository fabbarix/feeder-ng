package runner_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/plantest"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

var ctx = context.Background()

// fakeSources serves a fixed household: one Dinner Meal Slot on every weekday at 19:00,
// two Members of Portion Factor 1 (so a slot needs 2 portions), UTC.
type fakeSources struct {
	mu        sync.Mutex
	settings  plan.Settings
	slots     []runner.MealSlotDef
	attendees map[string][]plan.Attendee // by "slotID|date" for overrides
	recipes   []planner.Recipe
	prefs     map[int64]planner.Preferences
	calls     int // Settings calls = planning runs started
}

func (s *fakeSources) Settings(context.Context) (plan.Settings, *time.Location, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	return s.settings, time.UTC, nil
}
func (s *fakeSources) MealSlots(context.Context) ([]runner.MealSlotDef, error) { return s.slots, nil }
func (s *fakeSources) Attendance(_ context.Context, slotID int64, date string) ([]plan.Attendee, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if a, ok := s.attendees[attKey(slotID, date)]; ok {
		return a, nil
	}
	return []plan.Attendee{{MemberID: 1, Factor: 1}, {MemberID: 2, Factor: 1}}, nil
}
func (s *fakeSources) Recipes(context.Context) ([]planner.Recipe, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]planner.Recipe(nil), s.recipes...), nil
}
func (s *fakeSources) Preferences(context.Context) (map[int64]planner.Preferences, error) {
	return s.prefs, nil
}
func (s *fakeSources) Packs(context.Context, []planner.IngredientID) (map[planner.IngredientID]planner.Pack, error) {
	return nil, nil
}

func attKey(slotID int64, date string) string { return fmt.Sprintf("%d|%s", slotID, date) }

func (s *fakeSources) setAttendance(slotID int64, date string, a []plan.Attendee) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.attendees == nil {
		s.attendees = map[string][]plan.Attendee{}
	}
	s.attendees[attKey(slotID, date)] = a
}

func (s *fakeSources) clearAttendance() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.attendees = nil
}

func (s *fakeSources) archive(id int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.recipes {
		if int64(s.recipes[i].ID) == id {
			s.recipes[i].Archived = true
		}
	}
}

// fakeStock records what the runner asks of Stock.
type fakeStock struct {
	mu         sync.Mutex
	deductions [][]runner.Need
	inTx       []bool
	published  []runner.Deduction
	waste      []runner.LeftoverWaste
	warnings   []runner.Warning
	deductErr  error
	wasteErr   error
	events     *[]string // shared log of "deduct", "commit-visible" ordering checks (optional)
}

func (f *fakeStock) Lots(context.Context) ([]planner.StockLot, map[planner.IngredientID]int, error) {
	return nil, nil, nil
}
func (f *fakeStock) DeductCookedTx(_ context.Context, tx *sql.Tx, needs []runner.Need) (runner.Deduction, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.deductErr != nil {
		return runner.Deduction{}, f.deductErr
	}
	f.deductions = append(f.deductions, append([]runner.Need(nil), needs...))
	f.inTx = append(f.inTx, tx != nil)
	return runner.Deduction{Warnings: f.warnings, Handle: len(f.deductions)}, nil
}
func (f *fakeStock) PublishDeduction(d runner.Deduction) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.published = append(f.published, d)
}
func (f *fakeStock) RecordLeftoverWaste(_ context.Context, w runner.LeftoverWaste) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.wasteErr != nil {
		return f.wasteErr
	}
	f.waste = append(f.waste, w)
	return nil
}

type fakeBus struct {
	mu     sync.Mutex
	topics []string
}

func (b *fakeBus) Publish(topic string, _ any) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.topics = append(b.topics, topic)
}
func (b *fakeBus) count(topic string) int {
	b.mu.Lock()
	defer b.mu.Unlock()
	n := 0
	for _, t := range b.topics {
		if t == topic {
			n++
		}
	}
	return n
}

// env is a runner over a real temp database and the fakes above.
type env struct {
	t       *testing.T
	db      *sql.DB
	clk     *Clock_
	st      *store.Store
	src     *fakeSources
	stock   *fakeStock
	bus     *fakeBus
	r       *runner.Runner
	slotIDs map[int]int64 // weekday -> Meal Slot id
	rec     map[string]int64
}

// Recipe names: five yield-2 Recipes (a Batch is exactly one slot's portions, so no Leftover) and "chicken" (yield 4).
var simpleRecipes = []string{"pasta", "soup", "curry", "pizza", "stew"}

// newEnv starts on Monday 2026-11-09 12:00 UTC with a 3-day Planning Horizon (Mon 9, Tue 10, Wed 11).
func newEnv(t *testing.T) *env {
	t.Helper()
	d := plantest.NewDB(t)
	clk := newClock(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	e := &env{t: t, db: d, clk: clk, st: store.New(d, clk.Fake), slotIDs: map[int]int64{}, rec: map[string]int64{},
		stock: &fakeStock{}, bus: &fakeBus{}}
	src := &fakeSources{settings: plan.Settings{HorizonDays: 3, DefaultCooldownDays: 7, DefaultUseByDays: 3, Style: 0.5}}
	for wd := 1; wd <= 7; wd++ {
		id := plantest.SeedMealSlot(t, d, wd, "Dinner", "19:00")
		e.slotIDs[wd] = id
		src.slots = append(src.slots, runner.MealSlotDef{ID: id, Weekday: wd, Name: "Dinner", Time: "19:00"})
	}
	for _, name := range simpleRecipes {
		id := plantest.SeedRecipe(t, d, name, 2)
		e.rec[name] = id
		src.recipes = append(src.recipes, planner.Recipe{ID: planner.RecipeID(id), Yield: 2})
	}
	chicken := plantest.SeedRecipe(t, d, "chicken", 4)
	e.rec["chicken"] = chicken
	src.recipes = append(src.recipes, planner.Recipe{ID: planner.RecipeID(chicken), Yield: 4, Needs: []planner.Need{
		{IngredientID: 11, Quantity: 400},                // chicken thighs
		{IngredientID: 12, Quantity: 10, Optional: true}, // parsley: optional lines are never deducted
		{IngredientID: 13, Quantity: 250},                // rice
	}})
	e.src = src
	e.r = runner.New(runner.Deps{DB: d, Clock: clk, Store: e.st, Source: src, Stock: e.stock, Events: e.bus})
	return e
}

// key is the Dinner slot on a date of November 2026 (the 9th is a Monday).
func (e *env) key(day int) plan.Key {
	date := time.Date(2026, 11, day, 0, 0, 0, 0, time.UTC)
	wd := int(date.Weekday())
	if wd == 0 {
		wd = 7
	}
	return plan.Key{Date: date.Format("2006-01-02"), MealSlotID: e.slotIDs[wd]}
}

func (e *env) meal(day int) plan.Meal {
	e.t.Helper()
	m, err := e.st.Meal(ctx, e.key(day))
	if err != nil {
		e.t.Fatalf("no Planned Meal on 2026-11-%02d: %v", day, err)
	}
	return m
}

func (e *env) mustPlan() {
	e.t.Helper()
	if _, err := e.r.Plan(ctx, plan.ReasonNightly); err != nil {
		e.t.Fatalf("Plan: %v", err)
	}
}

func (e *env) planMeals() []plan.Meal {
	e.t.Helper()
	ms, err := e.st.Meals(ctx, "", "")
	if err != nil {
		e.t.Fatal(err)
	}
	return ms
}

var errBoom = errors.New("boom")

func context_WithCancel() (context.Context, context.CancelFunc) {
	return context.WithCancel(context.Background())
}
