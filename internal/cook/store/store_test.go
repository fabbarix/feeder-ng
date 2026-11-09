package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/cook/cooktest"
	"github.com/fabbarix/feeder-ng/internal/cook/store"
)

var (
	ctx = context.Background()
	now = time.Date(2026, 11, 9, 18, 0, 0, 0, time.UTC)
)

func setup(t *testing.T) *store.Store {
	t.Helper()
	return store.New(cooktest.NewDB(t))
}

func stepTimer(t *testing.T, scope cook.Scope, step int, secs int) cook.Timer {
	t.Helper()
	tm, err := cook.StartTimer(now, scope, &step, "Step", secs)
	if err != nil {
		t.Fatal(err)
	}
	return tm
}

func TestTimerRoundTrip(t *testing.T) {
	st := setup(t)
	in := stepTimer(t, cook.MealScope("2026-11-09", 3), 2, 600)
	got, err := st.InsertTimer(ctx, in)
	if err != nil || got.ID == 0 {
		t.Fatalf("insert: %+v %v", got, err)
	}
	back, err := st.Timer(ctx, got.ID)
	if err != nil {
		t.Fatal(err)
	}
	if back.Scope != in.Scope || back.Step == nil || *back.Step != 2 || back.Label != "Step" || back.DurationSeconds != 600 ||
		back.State != cook.Running || !back.StartedAt.Equal(now) || !back.EndsAt.Equal(now.Add(10*time.Minute)) {
		t.Fatalf("round trip = %+v", back)
	}
}

func TestFreeTimerHasNoScopeOrStep(t *testing.T) {
	st := setup(t)
	tm, _ := cook.StartTimer(now, "", nil, "Eggs", 180)
	got, err := st.InsertTimer(ctx, tm)
	if err != nil {
		t.Fatal(err)
	}
	back, _ := st.Timer(ctx, got.ID)
	if back.Scope != "" || back.Step != nil {
		t.Errorf("free timer = %+v", back)
	}
	// Two free timers may coexist.
	if _, err := st.InsertTimer(ctx, tm); err != nil {
		t.Errorf("second free timer: %v", err)
	}
}

func TestOneTimerPerScopeAndStep(t *testing.T) {
	st := setup(t)
	a := stepTimer(t, cook.RecipeScope(5), 1, 60)
	if _, err := st.InsertTimer(ctx, a); err != nil {
		t.Fatal(err)
	}
	if _, err := st.InsertTimer(ctx, a); !errors.Is(err, store.ErrDuplicateStep) {
		t.Errorf("duplicate: %v", err)
	}
	if _, err := st.InsertTimer(ctx, stepTimer(t, cook.RecipeScope(5), 2, 60)); err != nil {
		t.Errorf("another Step: %v", err)
	}
	if _, err := st.InsertTimer(ctx, stepTimer(t, cook.RecipeScope(6), 1, 60)); err != nil {
		t.Errorf("another scope: %v", err)
	}
	found, ok, err := st.StepTimer(ctx, cook.RecipeScope(5), 1)
	if err != nil || !ok || found.Step == nil || *found.Step != 1 {
		t.Errorf("StepTimer = %+v %v %v", found, ok, err)
	}
	if _, ok, _ := st.StepTimer(ctx, cook.RecipeScope(5), 9); ok {
		t.Error("no timer for Step 9")
	}
}

func TestSavePausedAndFinishedStates(t *testing.T) {
	st := setup(t)
	tm, _ := st.InsertTimer(ctx, stepTimer(t, cook.RecipeScope(5), 1, 300))
	paused, _ := tm.Pause(now.Add(100 * time.Second))
	if err := st.SaveTimer(ctx, paused); err != nil {
		t.Fatal(err)
	}
	back, _ := st.Timer(ctx, tm.ID)
	if back.State != cook.Paused || back.RemainingMs != 200_000 {
		t.Errorf("paused = %+v", back)
	}
	resumed, _ := back.Resume(now.Add(500 * time.Second))
	finished, _ := resumed.Settle(now.Add(time.Hour))
	if err := st.SaveTimer(ctx, finished); err != nil {
		t.Fatal(err)
	}
	back, _ = st.Timer(ctx, tm.ID)
	if back.State != cook.Finished || !back.EndsAt.Equal(resumed.EndsAt) {
		t.Errorf("finished = %+v", back)
	}
	if err := st.SaveTimer(ctx, cook.Timer{ID: 999, State: cook.Paused}); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("save unknown: %v", err)
	}
}

func TestTimersFilterByScopeAndDelete(t *testing.T) {
	st := setup(t)
	a, _ := st.InsertTimer(ctx, stepTimer(t, cook.RecipeScope(5), 1, 60))
	b, _ := st.InsertTimer(ctx, stepTimer(t, cook.RecipeScope(6), 1, 60))
	all, _ := st.Timers(ctx, "")
	if len(all) != 2 || all[0].ID != a.ID || all[1].ID != b.ID {
		t.Errorf("all = %+v", all)
	}
	only, _ := st.Timers(ctx, cook.RecipeScope(6))
	if len(only) != 1 || only[0].ID != b.ID {
		t.Errorf("scope = %+v", only)
	}
	if err := st.DeleteTimer(ctx, a.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := st.Timer(ctx, a.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("deleted timer: %v", err)
	}
	if err := st.DeleteTimer(ctx, a.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("delete twice: %v", err)
	}
	// Deleting frees the (scope, step) slot.
	if _, err := st.InsertTimer(ctx, stepTimer(t, cook.RecipeScope(5), 1, 60)); err != nil {
		t.Errorf("re-insert after cancel: %v", err)
	}
}

func TestMarks(t *testing.T) {
	st := setup(t)
	scope := cook.MealScope("2026-11-09", 3)
	if m, _ := st.Marks(ctx, scope); len(m) != 0 {
		t.Fatalf("fresh scope has marks: %v", m)
	}
	first := now
	if err := st.SetMark(ctx, scope, 0, true, first); err != nil {
		t.Fatal(err)
	}
	if err := st.SetMark(ctx, scope, 0, true, first.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	_ = st.SetMark(ctx, scope, 3, true, first)
	_ = st.SetMark(ctx, cook.RecipeScope(5), 0, true, first)
	m, _ := st.Marks(ctx, scope)
	if len(m) != 2 || !m[0].Equal(first) || !m[3].Equal(first) {
		t.Errorf("marks = %v (marking twice keeps the first time, other scopes are separate)", m)
	}
	if err := st.SetMark(ctx, scope, 0, false, first); err != nil {
		t.Fatal(err)
	}
	m, _ = st.Marks(ctx, scope)
	if _, ok := m[0]; ok || len(m) != 1 {
		t.Errorf("after unmark = %v", m)
	}
	if err := st.SetMark(ctx, scope, 0, false, first); err != nil {
		t.Errorf("unmarking an unmarked Step is a no-op: %v", err)
	}
}

func TestPurgeOlderThanKeepsLiveTimers(t *testing.T) {
	st := setup(t)
	old := now.Add(-72 * time.Hour)
	_ = st.SetMark(ctx, cook.RecipeScope(5), 0, true, old)
	_ = st.SetMark(ctx, cook.RecipeScope(5), 1, true, now)
	live, _ := st.InsertTimer(ctx, stepTimer(t, cook.RecipeScope(5), 1, 60))
	oldTimer, _ := cook.StartTimer(old, "", nil, "old", 60)
	finished, _ := oldTimer.Settle(old.Add(time.Hour))
	ins, _ := st.InsertTimer(ctx, finished)
	_ = ins
	n, err := st.PurgeOlderThan(ctx, now.Add(-48*time.Hour))
	if err != nil || n != 2 {
		t.Fatalf("purged %d rows, %v; want 2 (one mark, one finished timer)", n, err)
	}
	m, _ := st.Marks(ctx, cook.RecipeScope(5))
	if len(m) != 1 {
		t.Errorf("marks left = %v", m)
	}
	if _, err := st.Timer(ctx, live.ID); err != nil {
		t.Errorf("a live timer survives: %v", err)
	}
}

func TestDataSurvivesReopeningTheStore(t *testing.T) {
	d := cooktest.NewDB(t)
	a := store.New(d)
	tm, _ := a.InsertTimer(ctx, stepTimer(t, cook.RecipeScope(5), 1, 60))
	b := store.New(d)
	if _, err := b.Timer(ctx, tm.ID); err != nil {
		t.Errorf("a second Store over the same DB sees the timer: %v", err)
	}
}
