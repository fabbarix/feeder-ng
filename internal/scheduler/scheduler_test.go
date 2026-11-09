package scheduler_test

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/scheduler"
)

// rome is UTC+1 in November (CET) and UTC+2 in summer (CEST).
func rome(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("Europe/Rome")
	if err != nil {
		t.Fatal(err)
	}
	return loc
}

type harness struct {
	clk  *clock.Fake
	s    *scheduler.Scheduler
	runs *scheduler.MemRunStore
	log  []string // "name@day"
}

func newHarness(t *testing.T, start time.Time, zone *time.Location) *harness {
	t.Helper()
	h := &harness{clk: clock.NewFake(start), runs: scheduler.NewMemRunStore()}
	h.s = scheduler.New(h.clk, h.runs, nil)
	h.s.SetZone(func(context.Context) (*time.Location, error) { return zone, nil })
	return h
}

func (h *harness) job(name, at string, err error) {
	h.s.Daily(name, at, func(_ context.Context, day string) error {
		h.log = append(h.log, name+"@"+day)
		return err
	})
}

func (h *harness) runDue(t *testing.T) []string {
	t.Helper()
	ran, _ := h.s.RunDue(context.Background())
	return ran
}

func TestNothingRunsBeforeTheJobsTime(t *testing.T) {
	// 01:59 in Rome is 00:59 UTC.
	h := newHarness(t, time.Date(2026, 11, 10, 0, 59, 0, 0, time.UTC), rome(t))
	h.job("nightly", "03:00", nil)
	if ran := h.runDue(t); len(ran) != 0 || len(h.log) != 0 {
		t.Fatalf("ran %v (log %v) at 01:59 household time; want nothing", ran, h.log)
	}
}

func TestRunsOncePerHouseholdDayAtOrAfterTheTime(t *testing.T) {
	// 03:00 in Rome is 02:00 UTC.
	h := newHarness(t, time.Date(2026, 11, 10, 2, 0, 0, 0, time.UTC), rome(t))
	h.job("nightly", "03:00", nil)
	if ran := h.runDue(t); !reflect.DeepEqual(ran, []string{"nightly"}) {
		t.Fatalf("ran = %v at exactly 03:00; want [nightly]", ran)
	}
	h.clk.Advance(5 * time.Hour)
	if ran := h.runDue(t); len(ran) != 0 {
		t.Fatalf("second RunDue the same household day ran %v; want nothing", ran)
	}
	if want := []string{"nightly@2026-11-10"}; !reflect.DeepEqual(h.log, want) {
		t.Fatalf("log = %v, want %v", h.log, want)
	}
	h.clk.Advance(24 * time.Hour)
	h.runDue(t)
	if want := []string{"nightly@2026-11-10", "nightly@2026-11-11"}; !reflect.DeepEqual(h.log, want) {
		t.Fatalf("next day: log = %v, want %v", h.log, want)
	}
}

func TestTheDayBoundaryIsHouseholdMidnightNotUTC(t *testing.T) {
	// 23:30 UTC on 10 Nov is 00:30 on 11 Nov in Rome: a "00:10" job runs for the 11th.
	h := newHarness(t, time.Date(2026, 11, 10, 23, 30, 0, 0, time.UTC), rome(t))
	h.job("early", "00:10", nil)
	h.runDue(t)
	if want := []string{"early@2026-11-11"}; !reflect.DeepEqual(h.log, want) {
		t.Fatalf("log = %v, want %v", h.log, want)
	}
}

func TestDaylightSavingKeepsTheWallClockTime(t *testing.T) {
	// In summer Rome is UTC+2, so 03:00 is 01:00 UTC; 00:59 UTC is still 02:59.
	h := newHarness(t, time.Date(2026, 7, 15, 0, 59, 0, 0, time.UTC), rome(t))
	h.job("nightly", "03:00", nil)
	if ran := h.runDue(t); len(ran) != 0 {
		t.Fatalf("ran at 02:59 CEST: %v", ran)
	}
	h.clk.Advance(time.Minute)
	if ran := h.runDue(t); len(ran) != 1 {
		t.Fatalf("did not run at 03:00 CEST")
	}
}

func TestACatchUpRunsOnceAfterDowntime(t *testing.T) {
	// The process was down for three nights; one run, for today, no backlog.
	h := newHarness(t, time.Date(2026, 11, 7, 2, 0, 0, 0, time.UTC), rome(t))
	h.job("nightly", "03:00", nil)
	h.runDue(t)
	h.clk.Set(time.Date(2026, 11, 10, 9, 0, 0, 0, time.UTC))
	h.runDue(t)
	if want := []string{"nightly@2026-11-07", "nightly@2026-11-10"}; !reflect.DeepEqual(h.log, want) {
		t.Fatalf("log = %v, want %v", h.log, want)
	}
}

func TestARestartDoesNotRepeatAJobThatAlreadyRanToday(t *testing.T) {
	h := newHarness(t, time.Date(2026, 11, 10, 4, 0, 0, 0, time.UTC), time.UTC)
	h.job("nightly", "03:00", nil)
	h.runDue(t)
	// A new Scheduler over the same RunStore (the process restarted).
	s2 := scheduler.New(h.clk, h.runs, nil)
	var again int
	s2.Daily("nightly", "03:00", func(context.Context, string) error { again++; return nil })
	if ran, _ := s2.RunDue(context.Background()); len(ran) != 0 || again != 0 {
		t.Fatalf("restart repeated the job: ran=%v again=%d", ran, again)
	}
}

func TestAFailingJobIsRetriedAndDoesNotBlockOthers(t *testing.T) {
	h := newHarness(t, time.Date(2026, 11, 10, 4, 0, 0, 0, time.UTC), time.UTC)
	boom := errors.New("boom")
	failures := 1
	h.s.Daily("flaky", "03:00", func(_ context.Context, day string) error {
		h.log = append(h.log, "flaky@"+day)
		if failures > 0 {
			failures--
			return boom
		}
		return nil
	})
	h.job("steady", "03:00", nil)
	ran, err := h.s.RunDue(context.Background())
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want it to wrap boom", err)
	}
	if !reflect.DeepEqual(ran, []string{"steady"}) {
		t.Fatalf("ran = %v, want only [steady]", ran)
	}
	ran, err = h.s.RunDue(context.Background())
	if err != nil || !reflect.DeepEqual(ran, []string{"flaky"}) {
		t.Fatalf("retry: ran=%v err=%v, want [flaky] and no error", ran, err)
	}
	if got := h.runDue(t); len(got) != 0 {
		t.Fatalf("a third RunDue ran %v", got)
	}
}

func TestJobsRunInRegistrationOrder(t *testing.T) {
	h := newHarness(t, time.Date(2026, 11, 10, 8, 0, 0, 0, time.UTC), time.UTC)
	h.job("b", "03:00", nil)
	h.job("a", "02:00", nil)
	h.job("late", "21:00", nil)
	if ran := h.runDue(t); !reflect.DeepEqual(ran, []string{"b", "a"}) {
		t.Fatalf("ran = %v, want [b a]", ran)
	}
}

func TestRegistrationProgrammingErrorsPanic(t *testing.T) {
	s := scheduler.New(clock.NewFake(time.Now()), scheduler.NewMemRunStore(), nil)
	noop := func(context.Context, string) error { return nil }
	s.Daily("x", "03:00", noop)
	for name, f := range map[string]func(){
		"duplicate name": func() { s.Daily("x", "04:00", noop) },
		"bad time":       func() { s.Daily("y", "25:00", noop) },
		"empty name":     func() { s.Daily("", "03:00", noop) },
		"nil func":       func() { s.Daily("z", "03:00", nil) },
	} {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("%s must panic", name)
				}
			}()
			f()
		}()
	}
}

func TestRunStoreMemory(t *testing.T) {
	m := scheduler.NewMemRunStore()
	if got, _ := m.LastRun(context.Background(), "j"); got != "" {
		t.Fatalf("LastRun on a new store = %q, want empty", got)
	}
	_ = m.MarkRun(context.Background(), "j", "2026-11-10")
	if got, _ := m.LastRun(context.Background(), "j"); got != "2026-11-10" {
		t.Fatalf("LastRun = %q", got)
	}
}

func TestAWestwardZoneChangeDoesNotRerunAJobThatRanOnALaterDay(t *testing.T) {
	// The job completed for the 11th while the household was east of here; now it is still the 10th
	// in the household zone. The job must not run again today.
	h := newHarness(t, time.Date(2026, 11, 10, 4, 0, 0, 0, time.UTC), time.UTC)
	h.job("nightly", "03:00", nil)
	if err := h.runs.MarkRun(context.Background(), "nightly", "2026-11-11"); err != nil {
		t.Fatal(err)
	}
	if ran := h.runDue(t); len(ran) != 0 || len(h.log) != 0 {
		t.Fatalf("ran %v (log %v) on the 10th after a run for the 11th; want nothing", ran, h.log)
	}
}
