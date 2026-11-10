package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/cook/store"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/sun"
)

// purgeAfter is how long marks and finished timers are kept.
const purgeAfter = 48 * time.Hour

// Timer kinds in a `timers` event.
const (
	kindStarted   = "started"
	kindPaused    = "paused"
	kindResumed   = "resumed"
	kindCancelled = "cancelled"
	kindFinished  = "finished"
)

// Event topics.
const (
	TopicTimers = "timers" // TimerEvent
	TopicCook   = "cook"   // MarksEvent
)

// TimerEvent is the data of a `timers` event. Kind is started, paused,
// resumed, cancelled or finished.
type TimerEvent struct {
	Changed string `json:"changed"` // "timer", or "finished" for the finished event
	Kind    string `json:"kind"`
	TimerID int64  `json:"timerId"`
	Scope   string `json:"scope"`
	Label   string `json:"label"`
	// RecipeName is set on the finished event only: the Recipe the timer's scope
	// cooks, "" for a free timer or when the Recipe is gone.
	RecipeName string `json:"recipeName"`
	// EndsAt is the instant this run of the timer ended. Set on the finished
	// event only; consumers use it to tell a later run of a reused id apart.
	EndsAt time.Time `json:"endsAt,omitempty"`
}

// MarksEvent is the data of a `cook` event.
type MarksEvent struct {
	Changed string `json:"changed"` // always "marks"
	Scope   string `json:"scope"`
}

// Config wires a Service.
type Config struct {
	Store     *store.Store
	Clock     clock.Clock
	Bus       *events.Bus
	Recipes   Recipes
	Meals     Meals
	Waste     Waste
	Household Household
}

// Service is Cook Mode and the kitchen board.
type Service struct{ cfg Config }

// New returns a Service.
func New(cfg Config) *Service { return &Service{cfg: cfg} }

func (s *Service) now() time.Time { return s.cfg.Clock.Now().UTC() }

// CookView is a cook.View with its meal and the scope's timers.
type CookView struct {
	cook.View
	Meal   *MealInfo // nil for a Recipe scope
	Timers []cook.Timer
	Now    time.Time
	// Today is the household date (zone of the Household), so the client knows whether a Planned Meal may be marked Cooked.
	Today string
}

// today is the household date of now (the Household's zone, UTC when unset).
func (s *Service) today(ctx context.Context, now time.Time) (string, error) {
	zone, err := s.cfg.Household.Zone(ctx)
	if err != nil {
		return "", err
	}
	if zone == nil {
		zone = time.UTC
	}
	return now.In(zone).Format("2006-01-02"), nil
}

// MealView is Cook Mode for a Planned Meal (ErrNotFound; ErrNotCookable unless state is planned).
// A Planned Meal served from a Leftover (Batches 0) has nothing to cook and is not cookable either.
func (s *Service) MealView(ctx context.Context, date string, mealSlotID int64) (CookView, error) {
	meal, err := s.cfg.Meals.Meal(ctx, date, mealSlotID)
	if err != nil {
		return CookView{}, err
	}
	if meal.State != "planned" || meal.Batches <= 0 {
		return CookView{}, ErrNotCookable
	}
	rs, err := s.cfg.Recipes.Steps(ctx, meal.RecipeID)
	if err != nil {
		return CookView{}, err
	}
	scope := cook.MealScope(date, mealSlotID)
	marks, err := s.cfg.Store.Marks(ctx, scope)
	if err != nil {
		return CookView{}, err
	}
	view, err := cook.BuildView(scope, rs, meal.Batches, marks)
	if err != nil {
		return CookView{}, fmt.Errorf("%w: batches", ErrInvalid)
	}
	now, timers, err := s.Timers(ctx, scope)
	if err != nil {
		return CookView{}, err
	}
	today, err := s.today(ctx, now)
	if err != nil {
		return CookView{}, err
	}
	return CookView{View: view, Meal: &meal, Timers: timers, Now: now, Today: today}, nil
}

// RecipeView is Cook Mode for a Recipe with a chosen Batch count (ErrNotFound;
// ErrInvalid when batches is not a finite number > 0).
func (s *Service) RecipeView(ctx context.Context, recipeID int64, batches float64) (CookView, error) {
	rs, err := s.cfg.Recipes.Steps(ctx, recipeID)
	if err != nil {
		return CookView{}, err
	}
	scope := cook.RecipeScope(recipeID)
	marks, err := s.cfg.Store.Marks(ctx, scope)
	if err != nil {
		return CookView{}, err
	}
	view, err := cook.BuildView(scope, rs, batches, marks)
	if err != nil {
		return CookView{}, fmt.Errorf("%w: batches", ErrInvalid)
	}
	now, timers, err := s.Timers(ctx, scope)
	if err != nil {
		return CookView{}, err
	}
	today, err := s.today(ctx, now)
	if err != nil {
		return CookView{}, err
	}
	return CookView{View: view, Timers: timers, Now: now, Today: today}, nil
}

// Mark is the result of SetMark.
type Mark struct {
	Scope  cook.Scope
	Step   int
	Done   bool
	DoneAt *time.Time
}

// SetMark marks or unmarks an Advance Step of a scope. cook.ErrInvalidScope for
// a bad scope, ErrNotFound for an unknown Recipe or Planned Meal, ErrNotAdvanceStep
// when the Step index is out of range or not an Advance Step. Publishes a
// `cook` event when something changed.
func (s *Service) SetMark(ctx context.Context, scope cook.Scope, step int, done bool) (Mark, error) {
	rs, err := s.scopeSteps(ctx, scope)
	if err != nil {
		return Mark{}, err
	}
	if step < 0 || step >= len(rs.Steps) || rs.Steps[step].Kind != schedule.Advance {
		return Mark{}, ErrNotAdvanceStep
	}
	before, err := s.cfg.Store.Marks(ctx, scope)
	if err != nil {
		return Mark{}, err
	}
	_, wasDone := before[step]
	if err := s.cfg.Store.SetMark(ctx, scope, step, done, s.now()); err != nil {
		return Mark{}, err
	}
	after, err := s.cfg.Store.Marks(ctx, scope)
	if err != nil {
		return Mark{}, err
	}
	m := Mark{Scope: scope, Step: step}
	if at, ok := after[step]; ok {
		m.Done = true
		m.DoneAt = &at
	}
	if wasDone != done {
		s.publish(TopicCook, MarksEvent{Changed: "marks", Scope: string(scope)})
	}
	return m, nil
}

// scopeSteps returns the Steps of the Recipe a scope cooks (ErrInvalidScope,
// ErrNotFound for an unknown Recipe or Planned Meal).
func (s *Service) scopeSteps(ctx context.Context, scope cook.Scope) (cook.RecipeSteps, error) {
	parts, err := cook.ParseScope(string(scope))
	if err != nil {
		return cook.RecipeSteps{}, err
	}
	recipeID := parts.RecipeID
	if parts.IsMeal {
		meal, err := s.cfg.Meals.Meal(ctx, parts.Date, parts.MealSlotID)
		if err != nil {
			return cook.RecipeSteps{}, err
		}
		recipeID = meal.RecipeID
	}
	return s.cfg.Recipes.Steps(ctx, recipeID)
}

// ScopeRecipeName is the name of the Recipe a scope cooks, "" for an empty or unknown scope (the timers list shows it
// instead of "Tue Planned Meal").
func (s *Service) ScopeRecipeName(ctx context.Context, scope cook.Scope) string {
	if scope == "" {
		return ""
	}
	rs, err := s.scopeSteps(ctx, scope)
	if err != nil {
		return ""
	}
	return rs.Name
}

// StartInput describes a timer to start. With Step set, Scope is required, the
// Step must be a Passive Step of the scope's Recipe (ErrNotPassiveStep) and an
// empty Label / zero DurationSeconds default from the Step (cook.TimerLabel,
// minutes x 60). Without a Step, Label and DurationSeconds are required.
type StartInput struct {
	Scope           cook.Scope
	Step            *int
	Label           string
	DurationSeconds int
}

// StartTimer starts a timer and publishes `started`. For a (scope, Step) that
// already has a timer it returns that timer and created=false, publishing nothing.
func (s *Service) StartTimer(ctx context.Context, in StartInput) (t cook.Timer, created bool, err error) {
	if in.Step == nil {
		return s.startFree(ctx, in)
	}
	if in.Scope == "" {
		return cook.Timer{}, false, fmt.Errorf("%w: a Step timer needs its scope", ErrInvalid)
	}
	if _, err := cook.ParseScope(string(in.Scope)); err != nil {
		return cook.Timer{}, false, err
	}
	rs, err := s.scopeSteps(ctx, in.Scope)
	if err != nil {
		return cook.Timer{}, false, err
	}
	step := *in.Step
	if step < 0 || step >= len(rs.Steps) || rs.Steps[step].Kind != schedule.Passive {
		return cook.Timer{}, false, ErrNotPassiveStep
	}
	if existing, ok, err := s.cfg.Store.StepTimer(ctx, in.Scope, step); err != nil {
		return cook.Timer{}, false, err
	} else if ok {
		return existing, false, nil
	}
	// The Passive Step's own label and duration unless the caller gave some.
	view, err := cook.BuildView(in.Scope, rs, 1, nil)
	if err != nil {
		return cook.Timer{}, false, err
	}
	def := view.Steps[indexOfStep(view, step)].Timer
	label, secs := in.Label, in.DurationSeconds
	if label == "" {
		label = def.Label
	}
	if secs == 0 {
		secs = def.DurationSeconds
	}
	tm, err := cook.StartTimer(s.now(), in.Scope, &step, label, secs)
	if err != nil {
		return cook.Timer{}, false, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	saved, err := s.cfg.Store.InsertTimer(ctx, tm)
	if errors.Is(err, store.ErrDuplicateStep) {
		// Two devices reached the Step at once: the other one won.
		existing, _, err := s.cfg.Store.StepTimer(ctx, in.Scope, step)
		return existing, false, err
	}
	if err != nil {
		return cook.Timer{}, false, err
	}
	s.publishTimer(kindStarted, saved)
	return saved, true, nil
}

// indexOfStep finds the cooking Step with the given Recipe index.
func indexOfStep(v cook.View, index int) int {
	for i, cs := range v.Steps {
		if cs.Index == index {
			return i
		}
	}
	return 0
}

func (s *Service) startFree(ctx context.Context, in StartInput) (cook.Timer, bool, error) {
	if in.Label == "" {
		return cook.Timer{}, false, fmt.Errorf("%w: a timer needs a label", ErrInvalid)
	}
	if in.Scope != "" {
		if _, err := cook.ParseScope(string(in.Scope)); err != nil {
			return cook.Timer{}, false, err
		}
	}
	tm, err := cook.StartTimer(s.now(), in.Scope, nil, in.Label, in.DurationSeconds)
	if err != nil {
		return cook.Timer{}, false, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	saved, err := s.cfg.Store.InsertTimer(ctx, tm)
	if err != nil {
		return cook.Timer{}, false, err
	}
	s.publishTimer(kindStarted, saved)
	return saved, true, nil
}

// Pause pauses a running timer (ErrNotFound, ErrNotRunning) and publishes `paused`.
func (s *Service) Pause(ctx context.Context, id int64) (cook.Timer, error) {
	t, err := s.load(ctx, id)
	if err != nil {
		return cook.Timer{}, err
	}
	now := s.now()
	t = s.settleAndAnnounce(ctx, t, now)
	p, err := t.Pause(now)
	if errors.Is(err, cook.ErrNotRunning) {
		return cook.Timer{}, ErrNotRunning
	}
	if err != nil {
		return cook.Timer{}, err
	}
	if err := s.cfg.Store.SaveTimer(ctx, p); err != nil {
		return cook.Timer{}, err
	}
	s.publishTimer(kindPaused, p)
	return p, nil
}

// Resume resumes a paused timer (ErrNotFound, ErrNotPaused) and publishes `resumed`.
func (s *Service) Resume(ctx context.Context, id int64) (cook.Timer, error) {
	t, err := s.load(ctx, id)
	if err != nil {
		return cook.Timer{}, err
	}
	r, err := t.Resume(s.now())
	if errors.Is(err, cook.ErrNotPaused) {
		return cook.Timer{}, ErrNotPaused
	}
	if err != nil {
		return cook.Timer{}, err
	}
	if err := s.cfg.Store.SaveTimer(ctx, r); err != nil {
		return cook.Timer{}, err
	}
	s.publishTimer(kindResumed, r)
	return r, nil
}

// Cancel deletes a timer, finished or not (ErrNotFound), and publishes `cancelled`.
func (s *Service) Cancel(ctx context.Context, id int64) error {
	t, err := s.load(ctx, id)
	if err != nil {
		return err
	}
	t = s.settleAndAnnounce(ctx, t, s.now())
	if err := s.cfg.Store.DeleteTimer(ctx, id); err != nil {
		return mapStoreErr(err)
	}
	s.publishTimer(kindCancelled, t)
	return nil
}

// CancelScope deletes every timer of scope (running, paused or finished) and publishes `cancelled` for each; it
// returns how many it removed. Called when the scope's Planned Meal is marked Cooked or Not cooked (N4).
func (s *Service) CancelScope(ctx context.Context, scope cook.Scope) (int, error) {
	if scope == "" {
		return 0, nil // never "all timers"
	}
	all, err := s.cfg.Store.Timers(ctx, scope)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, t := range all {
		if err := s.cfg.Store.DeleteTimer(ctx, t.ID); err != nil {
			if errors.Is(err, store.ErrNotFound) {
				continue
			}
			return n, err
		}
		s.publishTimer(kindCancelled, t)
		n++
	}
	return n, nil
}

// Timers settles due timers (publishing `finished` once each) and lists the
// scope's timers ("" = all): running by soonest end, then paused, then finished.
func (s *Service) Timers(ctx context.Context, scope cook.Scope) (time.Time, []cook.Timer, error) {
	now := s.now()
	all, err := s.cfg.Store.Timers(ctx, scope)
	if err != nil {
		return time.Time{}, nil, err
	}
	for i := range all {
		all[i] = s.settleAndAnnounce(ctx, all[i], now)
	}
	sortTimers(all)
	return now, all, nil
}

// NamedTimer is a timer with the name of the Recipe its scope belongs to ("" for a free timer or an unknown scope).
type NamedTimer struct {
	cook.Timer
	RecipeName string
}

// TimersWithRecipeNames is Timers with each timer's Recipe name resolved, one lookup per distinct scope.
func (s *Service) TimersWithRecipeNames(ctx context.Context, scope cook.Scope) (time.Time, []NamedTimer, error) {
	now, list, err := s.Timers(ctx, scope)
	if err != nil {
		return time.Time{}, nil, err
	}
	names := map[cook.Scope]string{}
	out := make([]NamedTimer, len(list))
	for i, t := range list {
		out[i].Timer = t
		if t.Scope == "" {
			continue
		}
		name, ok := names[t.Scope]
		if !ok {
			name = s.ScopeRecipeName(ctx, t.Scope)
			names[t.Scope] = name
		}
		out[i].RecipeName = name
	}
	return now, out, nil
}

// sortTimers orders running timers by their end, then paused by what is left,
// then finished ones by when they ended.
func sortTimers(ts []cook.Timer) {
	rank := map[cook.TimerState]int{cook.Running: 0, cook.Paused: 1, cook.Finished: 2}
	sort.SliceStable(ts, func(i, j int) bool {
		a, b := ts[i], ts[j]
		if rank[a.State] != rank[b.State] {
			return rank[a.State] < rank[b.State]
		}
		if a.State == cook.Paused {
			return a.RemainingMs < b.RemainingMs
		}
		return a.EndsAt.Before(b.EndsAt)
	})
}

// Sweep settles every due running timer, publishes `finished` for each and
// purges marks and timers older than 2 days. It returns the timers that finished.
func (s *Service) Sweep(ctx context.Context) ([]cook.Timer, error) {
	now := s.now()
	running, err := s.cfg.Store.Timers(ctx, "")
	if err != nil {
		return nil, err
	}
	var done []cook.Timer
	for _, t := range running {
		if t.State != cook.Running {
			continue
		}
		settled, finished := s.settle(ctx, t, now)
		if finished {
			done = append(done, settled)
			s.announceFinished(ctx, settled)
		}
	}
	if _, err := s.cfg.Store.PurgeOlderThan(ctx, now.Add(-purgeAfter)); err != nil {
		return done, err
	}
	return done, nil
}

// settle finishes a running timer that has ended. The bool is true only for the
// caller whose conditional update won, so the finished event is published once
// however many readers and sweeps race. When another writer got there first
// (a Pause, a Cancel, another finish) the stored timer is returned as it is now.
func (s *Service) settle(ctx context.Context, t cook.Timer, now time.Time) (cook.Timer, bool) {
	settled, changed := t.Settle(now)
	if !changed {
		return t, false
	}
	won, err := s.cfg.Store.FinishTimer(ctx, t.ID)
	if err != nil {
		return t, false
	}
	if !won {
		if cur, err := s.cfg.Store.Timer(ctx, t.ID); err == nil {
			return cur, false
		}
		return t, false
	}
	return settled, true
}

// settleAndAnnounce settles a timer and publishes its finished event when this call finished it.
func (s *Service) settleAndAnnounce(ctx context.Context, t cook.Timer, now time.Time) cook.Timer {
	settled, finished := s.settle(ctx, t, now)
	if finished {
		s.announceFinished(ctx, settled)
	}
	return settled
}

// announceFinished publishes the finished event of a timer, with the name of
// the Recipe its scope cooks (empty for a free timer).
func (s *Service) announceFinished(ctx context.Context, t cook.Timer) {
	ev := TimerEvent{Changed: "finished", Kind: kindFinished, TimerID: t.ID, Scope: string(t.Scope), Label: t.Label, EndsAt: t.EndsAt}
	if t.Scope != "" {
		if rs, err := s.scopeSteps(ctx, t.Scope); err == nil {
			ev.RecipeName = rs.Name
		}
	}
	s.publish(TopicTimers, ev)
}

func (s *Service) load(ctx context.Context, id int64) (cook.Timer, error) {
	t, err := s.cfg.Store.Timer(ctx, id)
	if err != nil {
		return cook.Timer{}, mapStoreErr(err)
	}
	return t, nil
}

func mapStoreErr(err error) error {
	if errors.Is(err, store.ErrNotFound) {
		return ErrNotFound
	}
	return err
}

func (s *Service) publishTimer(kind string, t cook.Timer) {
	s.publish(TopicTimers, TimerEvent{Changed: "timer", Kind: kind, TimerID: t.ID, Scope: string(t.Scope), Label: t.Label})
}

func (s *Service) publish(topic string, data any) {
	if s.cfg.Bus != nil {
		s.cfg.Bus.Publish(topic, data)
	}
}

// Board is what GET /api/board returns.
type Board struct {
	Now         time.Time
	Today       string // household date
	Phase       sun.Phase
	ThemeReason string // "", "no_location" or "city_only"
	StreakDays  int
	NextAdvance *cook.AdvanceDue
}

// Board computes the dark/light phase, the zero-waste streak and the next
// Advance Step to do (over Planned Meals from today on).
func (s *Service) Board(ctx context.Context) (Board, error) {
	now := s.now()
	zone, err := s.cfg.Household.Zone(ctx)
	if err != nil {
		return Board{}, err
	}
	if zone == nil {
		zone = time.UTC
	}
	coords, cityOnly, err := s.cfg.Household.Coords(ctx)
	if err != nil {
		return Board{}, err
	}
	b := Board{Now: now, Today: now.In(zone).Format("2006-01-02"), Phase: sun.PhaseAt(now, zone, coords)}
	switch {
	case coords != nil:
	case cityOnly:
		b.ThemeReason = "city_only"
	default:
		b.ThemeReason = "no_location"
	}
	last, err := s.cfg.Waste.LastWaste(ctx)
	if err != nil {
		return Board{}, err
	}
	first, err := s.cfg.Waste.FirstActivity(ctx)
	if err != nil {
		return Board{}, err
	}
	b.StreakDays = cook.Streak(stock.Date(b.Today), last, first)
	b.NextAdvance, err = s.nextAdvance(ctx, b.Today, now)
	if err != nil {
		return Board{}, err
	}
	return b, nil
}

// nextAdvance is the Advance Step due first over the Planned Meals from today on that
// are cooked from a Batch (a Leftover serves nothing to prepare).
func (s *Service) nextAdvance(ctx context.Context, today string, now time.Time) (*cook.AdvanceDue, error) {
	meals, err := s.cfg.Meals.Upcoming(ctx, today)
	if err != nil {
		return nil, err
	}
	steps := map[int64]cook.RecipeSteps{}
	var cands []cook.AdvanceCandidate
	for _, m := range meals {
		if m.Batches <= 0 {
			continue
		}
		rs, ok := steps[m.RecipeID]
		if !ok {
			rs, err = s.cfg.Recipes.Steps(ctx, m.RecipeID)
			if err != nil {
				return nil, err
			}
			steps[m.RecipeID] = rs
		}
		scope := cook.MealScope(m.Date, m.MealSlotID)
		marks, err := s.cfg.Store.Marks(ctx, scope)
		if err != nil {
			return nil, err
		}
		for i, st := range rs.Steps {
			if st.Kind != schedule.Advance {
				continue
			}
			_, done := marks[i]
			cands = append(cands, cook.AdvanceCandidate{
				Scope: scope, MealDate: m.Date, MealSlotID: m.MealSlotID, SlotName: m.SlotName,
				RecipeName: rs.Name, MealAt: m.At, Step: i, Text: st.Text,
				LeadTimeMinutes: st.LeadTimeMinutes, Done: done,
			})
		}
	}
	return cook.NextAdvance(cands, now), nil
}

// FinishedEvent is a timer that has just finished.
type FinishedEvent struct {
	TimerID    int64
	Scope      string
	Label      string
	RecipeName string    // resolved from the scope; "" for a free timer
	EndsAt     time.Time // the instant this run ended
}

// SubscribeFinished yields one FinishedEvent per `timers` event of kind finished
// (for the push-notification team). cancel stops it and closes the channel.
func SubscribeFinished(bus *events.Bus) (<-chan FinishedEvent, func()) {
	src, cancelSub := bus.Subscribe(TopicTimers)
	out := make(chan FinishedEvent, 16)
	done := make(chan struct{})
	go func() {
		defer close(out)
		for ev := range src {
			var te TimerEvent
			if err := json.Unmarshal(ev.Data, &te); err != nil || te.Changed != "finished" {
				continue
			}
			select {
			case out <- FinishedEvent{TimerID: te.TimerID, Scope: te.Scope, Label: te.Label, RecipeName: te.RecipeName, EndsAt: te.EndsAt}:
			case <-done:
				return
			}
		}
	}()
	stop := func() {
		select {
		case <-done:
		default:
			close(done)
		}
		cancelSub()
	}
	return out, stop
}
