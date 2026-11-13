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
	mu         sync.Mutex
	settings   plan.Settings
	slots      []runner.MealSlotDef
	attendees  map[string][]plan.Attendee    // by "slotID|date" for overrides
	courses    map[string][]plan.SlotCourse  // by "slotID|date"; "slotID|" serves every date; none: the main Course alone (mainID)
	dates      map[string]runner.SlotDateDef // by "slotID|date": the Meal Slot on one date (default: usual time, served, no Guests)
	mainID     int64                         // the real id of the main Course that a Meal Slot serves by default (crs-c3)
	recipes    []planner.Recipe
	prefs      map[int64]planner.Preferences
	calls      int   // Settings calls = planning runs started
	recipesErr error // makes every planning run fail (see TestChangeRulesRollsTheRuleBackWhenTheReplanFails)
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
func (s *fakeSources) SlotCourses(_ context.Context, slotID int64, date string) ([]plan.SlotCourse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if c, ok := s.courses[attKey(slotID, date)]; ok {
		return append([]plan.SlotCourse(nil), c...), nil
	}
	if c, ok := s.courses[attKey(slotID, "")]; ok {
		return append([]plan.SlotCourse(nil), c...), nil
	}
	// The default: the main Course alone, with the slot's own Attendance (so an Attendance override reaches it).
	att, ok := s.attendees[attKey(slotID, date)]
	if !ok {
		att = []plan.Attendee{{MemberID: 1, Factor: 1}, {MemberID: 2, Factor: 1}}
	}
	return []plan.SlotCourse{{CourseID: s.mainID, Main: true, Attendance: att}}, nil
}
func (s *fakeSources) SlotDate(_ context.Context, slotID int64, date string) (runner.SlotDateDef, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if d, ok := s.dates[attKey(slotID, date)]; ok {
		if d.UsualTime == "" {
			d.UsualTime = s.usualTime(slotID)
		}
		if d.Time == "" {
			d.Time = d.UsualTime
		}
		return d, nil
	}
	return runner.SlotDateDef{Time: s.usualTime(slotID), UsualTime: s.usualTime(slotID)}, nil
}

func (s *fakeSources) usualTime(slotID int64) string {
	for _, d := range s.slots {
		if d.ID == slotID {
			return d.Time
		}
	}
	return ""
}

// setDate sets the Meal Slot's facts on one date.
func (s *fakeSources) setDate(slotID int64, date string, d runner.SlotDateDef) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.dates == nil {
		s.dates = map[string]runner.SlotDateDef{}
	}
	s.dates[attKey(slotID, date)] = d
}

func (s *fakeSources) Recipes(context.Context) ([]planner.Recipe, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.recipesErr != nil {
		return nil, s.recipesErr
	}
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

// txStock is a fakeStock that also records waste inside the caller's transaction (runner.TxWaster).
type txStock struct{ *fakeStock }

func (f txStock) RecordLeftoverWasteTx(_ context.Context, _ *sql.Tx, w runner.LeftoverWaste) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.wasteErr != nil {
		return f.wasteErr
	}
	f.waste = append(f.waste, w)
	return nil
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
	main    int64 // the real id of the main Course every Meal Slot serves (crs-c3: no Course 0)
}

// Recipe names: five yield-2 Recipes (a Batch is exactly one slot's portions, so no Leftover) and "chicken" (yield 4).
var simpleRecipes = []string{"pasta", "soup", "curry", "pizza", "stew"}

// newEnv starts on Monday 2026-11-09 12:00 UTC with a 3-day Planning Horizon (Mon 9, Tue 10, Wed 11).
func newEnv(t *testing.T) *env { return newEnvWith(t, nil) }

// newEnvWith is newEnv with a last chance to adjust the Runner's Deps.
func newEnvWith(t *testing.T, tweak func(*runner.Deps)) *env {
	t.Helper()
	d := plantest.NewDB(t)
	clk := newClock(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	e := &env{t: t, db: d, clk: clk, st: store.New(d, clk.Fake), slotIDs: map[int]int64{}, rec: map[string]int64{},
		stock: &fakeStock{}, bus: &fakeBus{}}
	e.main = plantest.CourseID(t, d, "Main")
	src := &fakeSources{settings: plan.Settings{HorizonDays: 3, DefaultCooldownDays: 7, DefaultUseByDays: 3, Style: 0.5}, mainID: e.main}
	for wd := 1; wd <= 7; wd++ {
		id := plantest.SeedMealSlot(t, d, wd, "Dinner", "19:00")
		e.slotIDs[wd] = id
		src.slots = append(src.slots, runner.MealSlotDef{ID: id, Weekday: wd, Name: "Dinner", Time: "19:00"})
		plantest.SetSlotCourses(t, d, id, plantest.SlotCourseSeed{CourseID: e.main})
	}
	for _, name := range simpleRecipes {
		id := plantest.SeedRecipe(t, d, name, 2)
		plantest.SetRecipeCourses(t, d, id, e.main)
		e.rec[name] = id
		src.recipes = append(src.recipes, planner.Recipe{ID: planner.RecipeID(id), Yield: 2, CourseIDs: []int64{e.main}})
	}
	chicken := plantest.SeedRecipe(t, d, "chicken", 4)
	plantest.SetRecipeCourses(t, d, chicken, e.main)
	e.rec["chicken"] = chicken
	src.recipes = append(src.recipes, planner.Recipe{ID: planner.RecipeID(chicken), Yield: 4, CourseIDs: []int64{e.main}, Needs: []planner.Need{
		{IngredientID: 11, Quantity: 400},                // chicken thighs
		{IngredientID: 12, Quantity: 10, Optional: true}, // parsley: optional lines are never deducted
		{IngredientID: 13, Quantity: 250},                // rice
	}})
	e.src = src
	deps := runner.Deps{DB: d, Clock: clk, Store: e.st, Source: src, Stock: e.stock, Events: e.bus}
	if tweak != nil {
		tweak(&deps)
	}
	e.r = runner.New(deps)
	return e
}

// key is the Dinner slot on a date of November 2026 (the 9th is a Monday).
func (e *env) key(day int) plan.Key {
	date := time.Date(2026, 11, day, 0, 0, 0, 0, time.UTC)
	wd := int(date.Weekday())
	if wd == 0 {
		wd = 7
	}
	return plan.Key{Date: date.Format("2006-01-02"), MealSlotID: e.slotIDs[wd], CourseID: e.main}
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
