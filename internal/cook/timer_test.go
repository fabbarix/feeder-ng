package cook_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
)

var t0 = time.Date(2026, 11, 9, 18, 0, 0, 0, time.UTC)

func start(t *testing.T, clk *clock.Fake, seconds int) cook.Timer {
	t.Helper()
	tm, err := cook.StartTimer(clk.Now(), cook.RecipeScope(7), nil, "Pasta", seconds)
	if err != nil {
		t.Fatalf("StartTimer: %v", err)
	}
	return tm
}

func TestStartTimerRunsForItsDuration(t *testing.T) {
	clk := clock.NewFake(t0)
	step := 2
	tm, err := cook.StartTimer(clk.Now(), cook.MealScope("2026-11-09", 3, 7), &step, "Step 3", 600)
	if err != nil {
		t.Fatal(err)
	}
	if tm.State != cook.Running || tm.DurationSeconds != 600 || tm.Label != "Step 3" || tm.Scope != "meal:2026-11-09/3/7" || tm.Step == nil || *tm.Step != 2 {
		t.Fatalf("unexpected timer %+v", tm)
	}
	if !tm.StartedAt.Equal(t0) || !tm.EndsAt.Equal(t0.Add(10*time.Minute)) {
		t.Errorf("StartedAt/EndsAt = %s / %s", tm.StartedAt, tm.EndsAt)
	}
	if got := tm.Remaining(t0); got != 10*time.Minute {
		t.Errorf("Remaining at start = %s", got)
	}
}

func TestStartTimerRejectsBadDurations(t *testing.T) {
	for _, secs := range []int{0, -5, cook.MaxTimerSeconds + 1} {
		if _, err := cook.StartTimer(t0, "", nil, "x", secs); !errors.Is(err, cook.ErrInvalidDuration) {
			t.Errorf("duration %d: err = %v, want ErrInvalidDuration", secs, err)
		}
	}
	if _, err := cook.StartTimer(t0, "", nil, "x", cook.MaxTimerSeconds); err != nil {
		t.Errorf("24 h is allowed: %v", err)
	}
}

func TestRemainingCountsDownWithTheClockAndRoundsUp(t *testing.T) {
	clk := clock.NewFake(t0)
	tm := start(t, clk, 90)
	clk.Advance(30 * time.Second)
	if got := tm.RemainingSeconds(clk.Now()); got != 60 {
		t.Errorf("after 30 s: %d, want 60", got)
	}
	clk.Advance(59*time.Second + 400*time.Millisecond)
	if got := tm.RemainingSeconds(clk.Now()); got != 1 {
		t.Errorf("0.6 s left shows 1 s, got %d", got)
	}
	clk.Advance(time.Hour)
	if got := tm.Remaining(clk.Now()); got != 0 {
		t.Errorf("past the end Remaining = %s, want 0", got)
	}
}

func TestPauseFreezesAndResumeContinues(t *testing.T) {
	clk := clock.NewFake(t0)
	tm := start(t, clk, 300)
	clk.Advance(100 * time.Second)
	paused, err := tm.Pause(clk.Now())
	if err != nil {
		t.Fatal(err)
	}
	if paused.State != cook.Paused || paused.RemainingMs != 200_000 {
		t.Fatalf("paused = %+v, want 200000 ms left", paused)
	}
	clk.Advance(10 * time.Minute)
	if got := paused.RemainingSeconds(clk.Now()); got != 200 {
		t.Errorf("a paused timer does not count down: %d", got)
	}
	resumed, err := paused.Resume(clk.Now())
	if err != nil {
		t.Fatal(err)
	}
	if resumed.State != cook.Running || !resumed.EndsAt.Equal(clk.Now().Add(200*time.Second)) {
		t.Fatalf("resumed = %+v", resumed)
	}
	clk.Advance(200 * time.Second)
	settled, changed := resumed.Settle(clk.Now())
	if !changed || settled.State != cook.Finished {
		t.Errorf("Settle at the end = %+v changed=%v", settled, changed)
	}
}

func TestPauseAndResumeNeedTheRightState(t *testing.T) {
	clk := clock.NewFake(t0)
	tm := start(t, clk, 60)
	if _, err := tm.Resume(clk.Now()); !errors.Is(err, cook.ErrNotPaused) {
		t.Errorf("resume a running timer: %v", err)
	}
	p, _ := tm.Pause(clk.Now())
	if _, err := p.Pause(clk.Now()); !errors.Is(err, cook.ErrNotRunning) {
		t.Errorf("pause a paused timer: %v", err)
	}
	clk.Advance(2 * time.Minute)
	if _, err := tm.Pause(clk.Now()); !errors.Is(err, cook.ErrNotRunning) {
		t.Errorf("pausing a timer whose end has passed must fail: %v", err)
	}
	fin, _ := tm.Settle(clk.Now())
	if _, err := fin.Pause(clk.Now()); !errors.Is(err, cook.ErrNotRunning) {
		t.Errorf("pause a finished timer: %v", err)
	}
	if _, err := fin.Resume(clk.Now()); !errors.Is(err, cook.ErrNotPaused) {
		t.Errorf("resume a finished timer: %v", err)
	}
}

func TestSettleOnlyFinishesARunningTimerAtItsEnd(t *testing.T) {
	clk := clock.NewFake(t0)
	tm := start(t, clk, 60)
	if got, changed := tm.Settle(clk.Now().Add(59 * time.Second)); changed || got.State != cook.Running {
		t.Error("not finished one second early")
	}
	got, changed := tm.Settle(clk.Now().Add(60 * time.Second))
	if !changed || got.State != cook.Finished || !got.EndsAt.Equal(tm.EndsAt) {
		t.Errorf("finished exactly at the end: %+v", got)
	}
	again, changed := got.Settle(clk.Now().Add(time.Hour))
	if changed || again.State != cook.Finished {
		t.Error("settling a finished timer changes nothing")
	}
	p, _ := tm.Pause(clk.Now())
	if _, changed := p.Settle(clk.Now().Add(time.Hour)); changed {
		t.Error("a paused timer never finishes")
	}
}

func TestTimerLabel(t *testing.T) {
	if got := cook.TimerLabel(3, "Simmer"); got != "Step 3: Simmer" {
		t.Errorf("got %q", got)
	}
	long := strings.Repeat("é", 40)
	got := cook.TimerLabel(1, long)
	if want := "Step 1: " + strings.Repeat("é", 30) + "…"; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
	if got := cook.TimerLabel(2, ""); got != "Step 2" {
		t.Errorf("empty text: %q", got)
	}
}
