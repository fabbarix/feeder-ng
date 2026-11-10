package service_test

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/cook/cooktest"
	"github.com/fabbarix/feeder-ng/internal/cook/service"
	"github.com/fabbarix/feeder-ng/internal/cook/store"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/sun"
)

var ctx = context.Background()

// ---- fakes ----

type fakeRecipes map[int64]cook.RecipeSteps

func (f fakeRecipes) Steps(_ context.Context, id int64) (cook.RecipeSteps, error) {
	r, ok := f[id]
	if !ok {
		return cook.RecipeSteps{}, service.ErrNotFound
	}
	return r, nil
}

type fakeMeals struct{ meals []service.MealInfo }

func (f *fakeMeals) Meal(_ context.Context, date string, slot int64) (service.MealInfo, error) {
	for _, m := range f.meals {
		if m.Date == date && m.MealSlotID == slot {
			return m, nil
		}
	}
	return service.MealInfo{}, service.ErrNotFound
}

func (f *fakeMeals) Upcoming(_ context.Context, from string) ([]service.MealInfo, error) {
	var out []service.MealInfo
	for _, m := range f.meals {
		if m.State == "planned" && m.Date >= from {
			out = append(out, m)
		}
	}
	return out, nil
}

type fakeWaste struct{ last, first stock.Date }

func (f *fakeWaste) LastWaste(context.Context) (stock.Date, error)     { return f.last, nil }
func (f *fakeWaste) FirstActivity(context.Context) (stock.Date, error) { return f.first, nil }

type fakeHousehold struct {
	zone     *time.Location
	coords   *sun.Coords
	cityOnly bool
}

func (f *fakeHousehold) Zone(context.Context) (*time.Location, error) { return f.zone, nil }
func (f *fakeHousehold) Coords(context.Context) (*sun.Coords, bool, error) {
	return f.coords, f.cityOnly, nil
}

func stew() cook.RecipeSteps {
	return cook.RecipeSteps{RecipeID: 12, Name: "Chicken stew", Steps: []cook.Step{
		{Kind: schedule.Advance, Text: "Marinate the chicken", LeadTimeMinutes: 240},
		{Kind: schedule.Active, Text: "Chop the onions", DurationMinutes: 10, Uses: []schedule.Use{{Ingredient: "onion", Quantity: 2, Unit: "piece"}}},
		{Kind: schedule.Passive, Text: "Simmer the stew", DurationMinutes: 45},
		{Kind: schedule.Active, Text: "Plate up", DurationMinutes: 5},
	}}
}

type fixture struct {
	svc   *service.Service
	clk   *clock.Fake
	bus   *events.Bus
	meals *fakeMeals
	waste *fakeWaste
	hh    *fakeHousehold
	st    *store.Store
}

// Rome, 2026-11-09 12:00 UTC (13:00 local).
func setup(t *testing.T) *fixture {
	t.Helper()
	rome, _ := time.LoadLocation("Europe/Rome")
	f := &fixture{
		clk:   clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)),
		bus:   events.NewBus(),
		meals: &fakeMeals{},
		waste: &fakeWaste{},
		hh:    &fakeHousehold{zone: rome},
		st:    store.New(cooktest.NewDB(t)),
	}
	f.svc = service.New(service.Config{Store: f.st, Clock: f.clk, Bus: f.bus, Recipes: fakeRecipes{12: stew()}, Meals: f.meals, Waste: f.waste, Household: f.hh})
	return f
}

func intp(i int) *int { return &i }

func drain(ch <-chan events.Event) []service.TimerEvent {
	var out []service.TimerEvent
	for {
		select {
		case e := <-ch:
			var te service.TimerEvent
			_ = json.Unmarshal(e.Data, &te)
			out = append(out, te)
		default:
			return out
		}
	}
}

// ---- views ----

func TestRecipeViewScalesUsesAndRejectsBadBatches(t *testing.T) {
	f := setup(t)
	v, err := f.svc.RecipeView(ctx, 12, 3)
	if err != nil {
		t.Fatal(err)
	}
	if v.Scope != "recipe:12" || v.Meal != nil || v.Steps[0].Uses[0].Quantity != 6 {
		t.Errorf("view = %+v", v)
	}
	for _, b := range []float64{0, -2, math.NaN(), math.Inf(1)} {
		if _, err := f.svc.RecipeView(ctx, 12, b); !errors.Is(err, service.ErrInvalid) {
			t.Errorf("batches %v: %v", b, err)
		}
	}
	if _, err := f.svc.RecipeView(ctx, 99, 1); !errors.Is(err, service.ErrNotFound) {
		t.Errorf("unknown Recipe: %v", err)
	}
}

func TestMealViewUsesTheMealsBatchesAndMarks(t *testing.T) {
	f := setup(t)
	f.meals.meals = []service.MealInfo{
		{Date: "2026-11-09", MealSlotID: 3, SlotName: "Dinner", RecipeID: 12, Batches: 2, State: "planned", At: time.Date(2026, 11, 9, 18, 30, 0, 0, time.UTC)},
		{Date: "2026-11-08", MealSlotID: 3, SlotName: "Dinner", RecipeID: 12, Batches: 1, State: "cooked"},
	}
	if _, err := f.svc.SetMark(ctx, "meal:2026-11-09/3", 0, true); err != nil {
		t.Fatal(err)
	}
	v, err := f.svc.MealView(ctx, "2026-11-09", 3)
	if err != nil {
		t.Fatal(err)
	}
	if v.Batches != 2 || v.Meal == nil || v.Meal.SlotName != "Dinner" || v.Steps[0].Uses[0].Quantity != 4 {
		t.Errorf("view = %+v", v)
	}
	if !v.Advance[0].Done || v.Advance[0].Warning {
		t.Errorf("Advance Step should be done: %+v", v.Advance[0])
	}
	if _, err := f.svc.MealView(ctx, "2026-11-08", 3); !errors.Is(err, service.ErrNotCookable) {
		t.Errorf("a cooked meal: %v", err)
	}
	if _, err := f.svc.MealView(ctx, "2026-11-12", 3); !errors.Is(err, service.ErrNotFound) {
		t.Errorf("no meal: %v", err)
	}
}

func TestViewIncludesTheScopesTimers(t *testing.T) {
	f := setup(t)
	if _, _, err := f.svc.StartTimer(ctx, service.StartInput{Scope: "recipe:12", Step: intp(2)}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := f.svc.StartTimer(ctx, service.StartInput{Label: "Eggs", DurationSeconds: 60}); err != nil {
		t.Fatal(err)
	}
	v, _ := f.svc.RecipeView(ctx, 12, 1)
	if len(v.Timers) != 1 || v.Timers[0].Label != "Step 2: Simmer the stew" {
		t.Errorf("timers = %+v (only the scope's own)", v.Timers)
	}
	if !v.Now.Equal(f.clk.Now()) {
		t.Errorf("Now = %s", v.Now)
	}
}

// ---- marks ----

func TestSetMarkRules(t *testing.T) {
	f := setup(t)
	f.meals.meals = []service.MealInfo{{Date: "2026-11-09", MealSlotID: 3, RecipeID: 12, Batches: 1, State: "planned"}}
	m, err := f.svc.SetMark(ctx, "recipe:12", 0, true)
	if err != nil || !m.Done || m.DoneAt == nil || !m.DoneAt.Equal(f.clk.Now()) {
		t.Fatalf("mark = %+v %v", m, err)
	}
	f.clk.Advance(time.Hour)
	again, _ := f.svc.SetMark(ctx, "recipe:12", 0, true)
	if !again.DoneAt.Equal(m.DoneAt.UTC()) && !again.DoneAt.Equal(*m.DoneAt) {
		t.Error("marking twice keeps the first time")
	}
	un, err := f.svc.SetMark(ctx, "recipe:12", 0, false)
	if err != nil || un.Done || un.DoneAt != nil {
		t.Errorf("unmark = %+v %v", un, err)
	}
	for _, step := range []int{1, 2, 3, 4, -1, 99} {
		if _, err := f.svc.SetMark(ctx, "recipe:12", step, true); !errors.Is(err, service.ErrNotAdvanceStep) {
			t.Errorf("step %d: %v, want ErrNotAdvanceStep", step, err)
		}
	}
	if _, err := f.svc.SetMark(ctx, "nonsense", 0, true); !errors.Is(err, cook.ErrInvalidScope) {
		t.Errorf("bad scope: %v", err)
	}
	if _, err := f.svc.SetMark(ctx, "recipe:99", 0, true); !errors.Is(err, service.ErrNotFound) {
		t.Errorf("unknown Recipe: %v", err)
	}
	if _, err := f.svc.SetMark(ctx, "meal:2026-11-20/1", 0, true); !errors.Is(err, service.ErrNotFound) {
		t.Errorf("unknown meal: %v", err)
	}
}

func TestSetMarkPublishesACookEventOnlyWhenSomethingChanged(t *testing.T) {
	f := setup(t)
	ch, cancel := f.bus.Subscribe(service.TopicCook)
	defer cancel()
	_, _ = f.svc.SetMark(ctx, "recipe:12", 0, true)
	_, _ = f.svc.SetMark(ctx, "recipe:12", 0, true) // no change
	got := 0
	for len(ch) > 0 {
		e := <-ch
		var m service.MarksEvent
		_ = json.Unmarshal(e.Data, &m)
		if m.Changed != "marks" || m.Scope != "recipe:12" {
			t.Errorf("event = %s", e.Data)
		}
		got++
	}
	if got != 1 {
		t.Errorf("%d cook events, want 1", got)
	}
}

// ---- timers ----

func TestStartTimerDefaultsFromThePassiveStep(t *testing.T) {
	f := setup(t)
	tm, created, err := f.svc.StartTimer(ctx, service.StartInput{Scope: "recipe:12", Step: intp(2)})
	if err != nil || !created {
		t.Fatal(err, created)
	}
	if tm.DurationSeconds != 2700 || tm.Label != "Step 2: Simmer the stew" || tm.State != cook.Running || !tm.EndsAt.Equal(f.clk.Now().Add(45*time.Minute)) {
		t.Errorf("timer = %+v", tm)
	}
}

func TestStartTimerRules(t *testing.T) {
	f := setup(t)
	if _, _, err := f.svc.StartTimer(ctx, service.StartInput{Scope: "recipe:12", Step: intp(1)}); !errors.Is(err, service.ErrNotPassiveStep) {
		t.Errorf("active Step: %v", err)
	}
	if _, _, err := f.svc.StartTimer(ctx, service.StartInput{Scope: "recipe:12", Step: intp(0)}); !errors.Is(err, service.ErrNotPassiveStep) {
		t.Errorf("advance Step: %v", err)
	}
	if _, _, err := f.svc.StartTimer(ctx, service.StartInput{Scope: "recipe:12", Step: intp(9)}); !errors.Is(err, service.ErrNotPassiveStep) {
		t.Errorf("Step out of range: %v", err)
	}
	if _, _, err := f.svc.StartTimer(ctx, service.StartInput{Step: intp(2)}); !errors.Is(err, service.ErrInvalid) {
		t.Errorf("Step without scope: %v", err)
	}
	if _, _, err := f.svc.StartTimer(ctx, service.StartInput{Scope: "recipe:99", Step: intp(2)}); !errors.Is(err, service.ErrNotFound) {
		t.Errorf("unknown Recipe: %v", err)
	}
	for _, in := range []service.StartInput{{Label: "", DurationSeconds: 60}, {Label: "Eggs"}, {Label: "Eggs", DurationSeconds: 90000}, {Label: "Eggs", DurationSeconds: -1}} {
		if _, _, err := f.svc.StartTimer(ctx, in); !errors.Is(err, service.ErrInvalid) {
			t.Errorf("%+v: %v, want ErrInvalid", in, err)
		}
	}
}

func TestReachingAStepTwiceStartsOneTimer(t *testing.T) {
	f := setup(t)
	a, c1, _ := f.svc.StartTimer(ctx, service.StartInput{Scope: "recipe:12", Step: intp(2)})
	f.clk.Advance(10 * time.Second)
	b, c2, _ := f.svc.StartTimer(ctx, service.StartInput{Scope: "recipe:12", Step: intp(2)})
	if !c1 || c2 || a.ID != b.ID || !a.EndsAt.Equal(b.EndsAt) {
		t.Errorf("first %+v created=%v, second %+v created=%v", a, c1, b, c2)
	}
	_, all, _ := f.svc.Timers(ctx, "")
	if len(all) != 1 {
		t.Errorf("%d timers, want 1", len(all))
	}
}

func TestPauseResumeCancelAndTheirEvents(t *testing.T) {
	f := setup(t)
	ch, cancel := f.bus.Subscribe(service.TopicTimers)
	defer cancel()
	tm, _, _ := f.svc.StartTimer(ctx, service.StartInput{Label: "Eggs", DurationSeconds: 300})
	f.clk.Advance(100 * time.Second)
	p, err := f.svc.Pause(ctx, tm.ID)
	if err != nil || p.State != cook.Paused || p.RemainingMs != 200_000 {
		t.Fatalf("pause = %+v %v", p, err)
	}
	if _, err := f.svc.Pause(ctx, tm.ID); !errors.Is(err, service.ErrNotRunning) {
		t.Errorf("pause twice: %v", err)
	}
	f.clk.Advance(time.Hour)
	r, err := f.svc.Resume(ctx, tm.ID)
	if err != nil || r.State != cook.Running || !r.EndsAt.Equal(f.clk.Now().Add(200*time.Second)) {
		t.Fatalf("resume = %+v %v", r, err)
	}
	if _, err := f.svc.Resume(ctx, tm.ID); !errors.Is(err, service.ErrNotPaused) {
		t.Errorf("resume twice: %v", err)
	}
	if err := f.svc.Cancel(ctx, tm.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.Cancel(ctx, tm.ID); !errors.Is(err, service.ErrNotFound) {
		t.Errorf("cancel twice: %v", err)
	}
	if _, err := f.svc.Pause(ctx, 4242); !errors.Is(err, service.ErrNotFound) {
		t.Errorf("unknown: %v", err)
	}
	var kinds []string
	for _, e := range drain(ch) {
		if e.Changed != "timer" || e.TimerID != tm.ID || e.Label != "Eggs" {
			t.Errorf("event %+v", e)
		}
		kinds = append(kinds, e.Kind)
	}
	want := []string{"started", "paused", "resumed", "cancelled"}
	if len(kinds) != len(want) {
		t.Fatalf("kinds = %v, want %v", kinds, want)
	}
	for i := range want {
		if kinds[i] != want[i] {
			t.Errorf("kinds = %v, want %v", kinds, want)
		}
	}
}

func TestSweepFinishesDueTimersAndPublishesOnce(t *testing.T) {
	f := setup(t)
	short, _, _ := f.svc.StartTimer(ctx, service.StartInput{Label: "Eggs", DurationSeconds: 60})
	_, _, _ = f.svc.StartTimer(ctx, service.StartInput{Label: "Rice", DurationSeconds: 600})
	ch, cancel := f.bus.Subscribe(service.TopicTimers)
	defer cancel()

	f.clk.Advance(59 * time.Second)
	if done, err := f.svc.Sweep(ctx); err != nil || len(done) != 0 {
		t.Fatalf("early sweep = %v %v", done, err)
	}
	f.clk.Advance(time.Second)
	done, err := f.svc.Sweep(ctx)
	if err != nil || len(done) != 1 || done[0].ID != short.ID || done[0].State != cook.Finished {
		t.Fatalf("sweep = %+v %v", done, err)
	}
	if again, _ := f.svc.Sweep(ctx); len(again) != 0 {
		t.Error("a finished timer is reported once")
	}
	evs := drain(ch)
	if len(evs) != 1 || evs[0].Changed != "finished" || evs[0].TimerID != short.ID || evs[0].Label != "Eggs" || evs[0].RecipeName != "" {
		t.Errorf("events = %+v", evs)
	}
}

func TestReadingTimersSettlesThemToo(t *testing.T) {
	f := setup(t)
	tm, _, _ := f.svc.StartTimer(ctx, service.StartInput{Label: "Eggs", DurationSeconds: 60})
	ch, cancel := f.bus.Subscribe(service.TopicTimers)
	defer cancel()
	f.clk.Advance(2 * time.Minute) // nobody swept: the next read still gets it right
	now, list, err := f.svc.Timers(ctx, "")
	if err != nil || len(list) != 1 || list[0].ID != tm.ID || list[0].State != cook.Finished || !now.Equal(f.clk.Now()) {
		t.Fatalf("list = %+v %v", list, err)
	}
	if evs := drain(ch); len(evs) != 1 || evs[0].Changed != "finished" {
		t.Errorf("events = %+v", evs)
	}
	_, _, _ = f.svc.Timers(ctx, "")
	if evs := drain(ch); len(evs) != 0 {
		t.Errorf("second read published again: %+v", evs)
	}
}

func TestTimersAreOrderedRunningPausedFinished(t *testing.T) {
	f := setup(t)
	slow, _, _ := f.svc.StartTimer(ctx, service.StartInput{Label: "slow", DurationSeconds: 900})
	fast, _, _ := f.svc.StartTimer(ctx, service.StartInput{Label: "fast", DurationSeconds: 120})
	paused, _, _ := f.svc.StartTimer(ctx, service.StartInput{Label: "paused", DurationSeconds: 30})
	_, _ = f.svc.Pause(ctx, paused.ID)
	done, _, _ := f.svc.StartTimer(ctx, service.StartInput{Label: "done", DurationSeconds: 1})
	f.clk.Advance(5 * time.Second)
	_, list, _ := f.svc.Timers(ctx, "")
	var ids []int64
	for _, tm := range list {
		ids = append(ids, tm.ID)
	}
	want := []int64{fast.ID, slow.ID, paused.ID, done.ID}
	if len(ids) != 4 || ids[0] != want[0] || ids[1] != want[1] || ids[2] != want[2] || ids[3] != want[3] {
		t.Errorf("order = %v, want %v", ids, want)
	}
}

func TestSweepPurgesOldMarksAndFinishedTimers(t *testing.T) {
	f := setup(t)
	_, _ = f.svc.SetMark(ctx, "recipe:12", 0, true)
	f.clk.Advance(49 * time.Hour)
	if _, err := f.svc.Sweep(ctx); err != nil {
		t.Fatal(err)
	}
	if m, _ := f.st.Marks(ctx, "recipe:12"); len(m) != 0 {
		t.Errorf("old mark survived: %v", m)
	}
}

func TestSubscribeFinishedYieldsOnlyFinishedTimers(t *testing.T) {
	f := setup(t)
	ch, cancel := service.SubscribeFinished(f.bus)
	defer cancel()
	tm, _, _ := f.svc.StartTimer(ctx, service.StartInput{Label: "Eggs", DurationSeconds: 60})
	f.clk.Advance(time.Minute)
	_, _ = f.svc.Sweep(ctx)
	select {
	case e := <-ch:
		if e.TimerID != tm.ID || e.Label != "Eggs" {
			t.Errorf("event = %+v", e)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no finished event")
	}
	select {
	case e := <-ch:
		t.Errorf("unexpected %+v (the started event must not come through)", e)
	case <-time.After(50 * time.Millisecond):
	}
}

// ---- board ----

func TestBoardFallsBackWithoutALocation(t *testing.T) {
	f := setup(t) // 13:00 Rome
	b, err := f.svc.Board(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if b.Phase.Dark || b.Phase.Source != sun.SourceFallback || b.ThemeReason != "no_location" || b.Today != "2026-11-09" || !b.Now.Equal(f.clk.Now()) {
		t.Errorf("board = %+v", b)
	}
	rome := f.hh.zone
	if want := time.Date(2026, 11, 9, 19, 0, 0, 0, rome); !b.Phase.Next.Equal(want) {
		t.Errorf("Next = %s, want %s", b.Phase.Next, want)
	}
	f.clk.Set(time.Date(2026, 11, 9, 18, 30, 0, 0, time.UTC)) // 19:30 local
	b, _ = f.svc.Board(ctx)
	if !b.Phase.Dark {
		t.Error("19:30 local is dark in the fallback")
	}
}

func TestBoardCityOnlyLocationUsesTheFallbackAndSaysWhy(t *testing.T) {
	f := setup(t)
	f.hh.cityOnly = true
	b, _ := f.svc.Board(ctx)
	if b.Phase.Source != sun.SourceFallback || b.ThemeReason != "city_only" {
		t.Errorf("board = %+v", b)
	}
}

func TestBoardWithCoordinatesFollowsTheSun(t *testing.T) {
	f := setup(t)
	f.hh.coords = &sun.Coords{Lat: 41.9028, Lon: 12.4964}     // Rome, sunset 15:55 UTC (16:55 local) on 9 Nov
	f.clk.Set(time.Date(2026, 11, 9, 16, 10, 0, 0, time.UTC)) // 17:10 local: after sunset, before 19:00
	b, _ := f.svc.Board(ctx)
	if !b.Phase.Dark || b.Phase.Source != sun.SourceSun || b.ThemeReason != "" {
		t.Errorf("board = %+v (dark at 17:10 although the fallback would say light)", b)
	}
}

func TestBoardStreakFromWasteDates(t *testing.T) {
	f := setup(t)
	f.waste.first = "2026-11-01"
	b, _ := f.svc.Board(ctx)
	if b.StreakDays != 8 {
		t.Errorf("no waste: streak = %d, want 8", b.StreakDays)
	}
	f.waste.last = "2026-11-07"
	b, _ = f.svc.Board(ctx)
	if b.StreakDays != 2 {
		t.Errorf("waste on the 7th: streak = %d, want 2", b.StreakDays)
	}
	f.waste.last = "2026-11-09"
	b, _ = f.svc.Board(ctx)
	if b.StreakDays != 0 {
		t.Errorf("waste today: streak = %d, want 0", b.StreakDays)
	}
}

func TestBoardNextAdvanceStepOverPlannedMeals(t *testing.T) {
	f := setup(t)
	f.meals.meals = []service.MealInfo{
		{Date: "2026-11-09", MealSlotID: 3, SlotName: "Dinner", RecipeID: 12, Batches: 1, State: "planned", At: time.Date(2026, 11, 9, 18, 0, 0, 0, time.UTC)},
		{Date: "2026-11-10", MealSlotID: 3, SlotName: "Dinner", RecipeID: 12, Batches: 1, State: "planned", At: time.Date(2026, 11, 10, 18, 0, 0, 0, time.UTC)},
	}
	b, err := f.svc.Board(ctx)
	if err != nil || b.NextAdvance == nil {
		t.Fatalf("board = %+v %v", b, err)
	}
	n := b.NextAdvance
	if n.Scope != "meal:2026-11-09/3" || n.Step != 0 || n.Text != "Marinate the chicken" || n.RecipeName != "Chicken stew" ||
		!n.DueAt.Equal(time.Date(2026, 11, 9, 14, 0, 0, 0, time.UTC)) || n.Overdue || n.SlotName != "Dinner" {
		t.Errorf("next advance = %+v", n)
	}
	// Marking tonight's marinade done moves on to tomorrow's.
	_, _ = f.svc.SetMark(ctx, "meal:2026-11-09/3", 0, true)
	b, _ = f.svc.Board(ctx)
	if b.NextAdvance == nil || b.NextAdvance.Scope != "meal:2026-11-10/3" {
		t.Errorf("after marking: %+v", b.NextAdvance)
	}
	// Once the due time has passed it is flagged overdue.
	f.clk.Set(time.Date(2026, 11, 10, 15, 0, 0, 0, time.UTC))
	b, _ = f.svc.Board(ctx)
	if b.NextAdvance == nil || !b.NextAdvance.Overdue {
		t.Errorf("overdue: %+v", b.NextAdvance)
	}
	_, _ = f.svc.SetMark(ctx, "meal:2026-11-10/3", 0, true)
	if b, _ = f.svc.Board(ctx); b.NextAdvance != nil {
		t.Errorf("nothing left: %+v", b.NextAdvance)
	}
}

// ---- a timer finishes exactly once ----

// second returns another Service over the same store, bus and clock: two server instances.
func (f *fixture) second() *service.Service {
	return service.New(service.Config{Store: f.st, Clock: f.clk, Bus: f.bus, Recipes: fakeRecipes{12: stew()}, Meals: f.meals, Waste: f.waste, Household: f.hh})
}

func TestTheFinishedEventShapeCarriesTheRecipeName(t *testing.T) {
	f := setup(t)
	sub, cancelSub := f.bus.Subscribe(service.TopicTimers)
	defer cancelSub()
	tm, _, err := f.svc.StartTimer(ctx, service.StartInput{Scope: "recipe:12", Step: intp(2)})
	if err != nil {
		t.Fatal(err)
	}
	drain(sub) // the started event
	f.clk.Advance(46 * time.Minute)
	if _, err := f.svc.Sweep(ctx); err != nil {
		t.Fatal(err)
	}
	var raw events.Event
	select {
	case raw = <-sub:
	default:
		t.Fatal("no event")
	}
	var got map[string]any
	if err := json.Unmarshal(raw.Data, &got); err != nil {
		t.Fatal(err)
	}
	if got["changed"] != "finished" || got["timerId"] != float64(tm.ID) || got["label"] != "Step 2: Simmer the stew" || got["recipeName"] != "Chicken stew" {
		t.Errorf("event = %v", got)
	}
}

func TestTheFinishedEventForAMealScopeNamesItsRecipeAndAFreeTimerHasNone(t *testing.T) {
	f := setup(t)
	f.meals.meals = []service.MealInfo{{Date: "2026-11-09", MealSlotID: 3, SlotName: "Dinner", RecipeID: 12, Batches: 2, State: "planned"}}
	ch, cancel := service.SubscribeFinished(f.bus)
	defer cancel()
	meal, _, err := f.svc.StartTimer(ctx, service.StartInput{Scope: "meal:2026-11-09/3", Step: intp(2)})
	if err != nil {
		t.Fatal(err)
	}
	free, _, _ := f.svc.StartTimer(ctx, service.StartInput{Label: "Eggs", DurationSeconds: 60})
	f.clk.Advance(time.Hour)
	_, _ = f.svc.Sweep(ctx)
	got := map[int64]service.FinishedEvent{}
	for i := 0; i < 2; i++ {
		select {
		case e := <-ch:
			got[e.TimerID] = e
		case <-time.After(2 * time.Second):
			t.Fatalf("only %d finished events", i)
		}
	}
	if got[meal.ID].RecipeName != "Chicken stew" || got[meal.ID].Scope != "meal:2026-11-09/3" {
		t.Errorf("meal timer = %+v", got[meal.ID])
	}
	if got[free.ID].RecipeName != "" || got[free.ID].Label != "Eggs" {
		t.Errorf("free timer = %+v", got[free.ID])
	}
}

func TestTwoInstancesSharingOneStoreFinishEachTimerOnce(t *testing.T) {
	f := setup(t)
	other := f.second()
	const n = 6
	ids := map[int64]bool{}
	for i := 0; i < n; i++ {
		tm, _, _ := f.svc.StartTimer(ctx, service.StartInput{Label: "t", DurationSeconds: 60})
		ids[tm.ID] = true
	}
	ch, cancel := f.bus.Subscribe(service.TopicTimers)
	defer cancel()
	f.clk.Advance(2 * time.Minute)

	var wg sync.WaitGroup
	var mu sync.Mutex
	reported := 0
	run := func(fn func()) {
		wg.Add(1)
		go func() { defer wg.Done(); fn() }()
	}
	for _, s := range []*service.Service{f.svc, other, f.svc, other} {
		s := s
		run(func() {
			done, err := s.Sweep(ctx)
			if err != nil {
				t.Errorf("sweep: %v", err)
			}
			mu.Lock()
			reported += len(done)
			mu.Unlock()
		})
		run(func() {
			if _, _, err := s.Timers(ctx, ""); err != nil {
				t.Errorf("timers: %v", err)
			}
		}) // a request racing the sweeps
	}
	wg.Wait()

	// A request may settle a timer before a sweep gets to it, so the sweeps report at most n.
	if reported > n {
		t.Errorf("sweeps reported %d finished timers for %d timers: some were finished twice", reported, n)
	}
	seen := map[int64]int{}
	for _, e := range drain(ch) {
		if e.Changed == "finished" {
			seen[e.TimerID]++
		}
	}
	for id := range ids {
		if seen[id] != 1 {
			t.Errorf("timer %d: %d finished events, want 1", id, seen[id])
		}
	}
	if len(seen) != n {
		t.Errorf("finished events for %d timers, want %d", len(seen), n)
	}
}

func TestACancelRacingASweepPublishesFinishedAtMostOnce(t *testing.T) {
	f := setup(t)
	other := f.second()
	tm, _, _ := f.svc.StartTimer(ctx, service.StartInput{Label: "Eggs", DurationSeconds: 60})
	ch, cancel := f.bus.Subscribe(service.TopicTimers)
	defer cancel()
	f.clk.Advance(2 * time.Minute)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); _, _ = f.svc.Sweep(ctx) }()
	go func() { defer wg.Done(); _ = other.Cancel(ctx, tm.ID) }()
	wg.Wait()
	finished := 0
	for _, e := range drain(ch) {
		if e.Changed == "finished" {
			finished++
		}
	}
	if finished != 1 {
		t.Errorf("%d finished events, want exactly 1", finished)
	}
}

func TestAPauseThatLandedBeforeTheFinishIsNotOverwrittenByTheSweep(t *testing.T) {
	f := setup(t)
	tm, _, _ := f.svc.StartTimer(ctx, service.StartInput{Label: "Eggs", DurationSeconds: 300})
	ch, cancel := f.bus.Subscribe(service.TopicTimers)
	defer cancel()
	f.clk.Advance(100 * time.Second)
	if _, err := f.second().Pause(ctx, tm.ID); err != nil {
		t.Fatal(err)
	}
	f.clk.Advance(10 * time.Minute) // far past the original end
	if done, _ := f.svc.Sweep(ctx); len(done) != 0 {
		t.Errorf("sweep finished a paused timer: %+v", done)
	}
	_, list, _ := f.svc.Timers(ctx, "")
	if len(list) != 1 || list[0].State != cook.Paused || list[0].RemainingMs != 200_000 {
		t.Errorf("timer = %+v, want paused with 200 s left", list)
	}
	for _, e := range drain(ch) {
		if e.Changed == "finished" {
			t.Errorf("a paused timer was announced as finished: %+v", e)
		}
	}
}

// R4 B10: the view carries the household date so the client can hide Mark as Cooked on a future meal.
func TestMealViewCarriesTheHouseholdDate(t *testing.T) {
	f := setup(t)
	f.meals.meals = []service.MealInfo{{Date: "2026-11-10", MealSlotID: 3, SlotName: "Dinner", RecipeID: 12, Batches: 1, State: "planned"}}
	v, err := f.svc.MealView(ctx, "2026-11-10", 3)
	if err != nil || v.Today != "2026-11-09" {
		t.Errorf("Today = %q, %v; want 2026-11-09 (Rome, 13:00 local)", v.Today, err)
	}
	f.clk.Set(time.Date(2026, 11, 9, 23, 30, 0, 0, time.UTC)) // 00:30 on the 10th in Rome
	if v, _ = f.svc.MealView(ctx, "2026-11-10", 3); v.Today != "2026-11-10" {
		t.Errorf("Today = %q after local midnight, want 2026-11-10 (household zone, not UTC)", v.Today)
	}
}

// N4: marking a Planned Meal Cooked or Not cooked cancels that meal's timers, whatever their state, and only that meal's.
func TestCancelScopeRemovesOnlyThatScopesTimersAndPublishesCancelled(t *testing.T) {
	f := setup(t)
	f.meals.meals = []service.MealInfo{
		{Date: "2026-11-09", MealSlotID: 3, RecipeID: 12, State: "planned"},
		{Date: "2026-11-10", MealSlotID: 3, RecipeID: 12, State: "planned"},
	}
	meal := cook.MealScope("2026-11-09", 3)
	running, _, err := f.svc.StartTimer(ctx, service.StartInput{Scope: meal, Label: "Simmer", DurationSeconds: 600})
	if err != nil {
		t.Fatal(err)
	}
	paused, _, err := f.svc.StartTimer(ctx, service.StartInput{Scope: meal, Label: "Rest", DurationSeconds: 600})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.Pause(ctx, paused.ID); err != nil {
		t.Fatal(err)
	}
	other, _, _ := f.svc.StartTimer(ctx, service.StartInput{Scope: cook.MealScope("2026-11-10", 3), Label: "Other", DurationSeconds: 600})
	free, _, _ := f.svc.StartTimer(ctx, service.StartInput{Label: "Eggs", DurationSeconds: 300})
	ch, cancel := f.bus.Subscribe(service.TopicTimers)
	defer cancel()

	n, err := f.svc.CancelScope(ctx, meal)
	if err != nil || n != 2 {
		t.Fatalf("CancelScope = %d, %v; want 2, nil", n, err)
	}
	_, left, _ := f.svc.Timers(ctx, "")
	if len(left) != 2 {
		t.Fatalf("%d timers left, want the other meal's and the free one: %+v", len(left), left)
	}
	for _, tm := range left {
		if tm.ID == running.ID || tm.ID == paused.ID {
			t.Errorf("timer %d of the cancelled scope survived", tm.ID)
		}
		if tm.ID != other.ID && tm.ID != free.ID {
			t.Errorf("unexpected timer %d", tm.ID)
		}
	}
	cancelled := 0
	for _, e := range drain(ch) {
		if e.Kind == "cancelled" {
			cancelled++
		}
	}
	if cancelled != 2 {
		t.Errorf("%d cancelled events, want 2", cancelled)
	}
	if n, err := f.svc.CancelScope(ctx, meal); err != nil || n != 0 {
		t.Errorf("second CancelScope = %d, %v; want 0, nil", n, err)
	}
}

func TestScopeRecipeNameResolvesMealAndRecipeScopes(t *testing.T) {
	f := setup(t)
	f.meals.meals = []service.MealInfo{{Date: "2026-11-09", MealSlotID: 3, RecipeID: 12, State: "planned"}}
	for scope, want := range map[cook.Scope]string{
		cook.MealScope("2026-11-09", 3): "Chicken stew",
		cook.RecipeScope(12):            "Chicken stew",
		cook.MealScope("2026-11-20", 1): "",
		cook.RecipeScope(99):            "",
		"":                              "",
	} {
		if got := f.svc.ScopeRecipeName(ctx, scope); got != want {
			t.Errorf("ScopeRecipeName(%q) = %q, want %q", scope, got, want)
		}
	}
}
