// Package scheduler runs daily jobs at a household-local wall-clock time.
//
// It is reusable: planning registers its nightly run at 03:00; later teams add
// backups and notification sweeps. Time comes from an injected clock.Clock and
// the day boundary from the Household's time zone, so tests drive it with a
// fake clock and call RunDue instead of waiting.
package scheduler

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
)

// ZoneFunc returns the Household's time zone. It is read on every RunDue, so a
// changed setting takes effect immediately.
type ZoneFunc func(ctx context.Context) (*time.Location, error)

// JobFunc is one run of a job. day is the household date (YYYY-MM-DD) it is
// running for. A returned error leaves the job due: the next RunDue retries it.
type JobFunc func(ctx context.Context, day string) error

// RunStore remembers the last household date each job completed on.
type RunStore interface {
	LastRun(ctx context.Context, job string) (day string, err error) // "" = never
	MarkRun(ctx context.Context, job, day string) error
}

// Scheduler holds daily jobs.
type Scheduler struct {
	clk    clock.Clock
	runs   RunStore
	logger *slog.Logger

	mu   sync.Mutex
	zone ZoneFunc
	jobs []job
}

type job struct {
	name string
	at   string // HH:MM
	fn   JobFunc
}

// New returns a Scheduler. The zone defaults to UTC until SetZone is called.
// A nil logger means slog.Default().
func New(clk clock.Clock, runs RunStore, logger *slog.Logger) *Scheduler {
	if logger == nil {
		logger = slog.Default()
	}
	return &Scheduler{clk: clk, runs: runs, logger: logger,
		zone: func(context.Context) (*time.Location, error) { return time.UTC, nil }}
}

// SetZone replaces the zone provider (the household module or planning calls it
// once at mount).
func (s *Scheduler) SetZone(z ZoneFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.zone = z
}

// Daily registers a job that runs once per household day at or after at
// ("HH:MM", household time). It panics on a duplicate name or a malformed time,
// because those are programming errors.
func (s *Scheduler) Daily(name, at string, fn JobFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if name == "" {
		panic("scheduler: empty job name")
	}
	if fn == nil {
		panic("scheduler: nil job func for " + name)
	}
	if _, err := parseHHMM(at); err != nil {
		panic("scheduler: job " + name + ": " + err.Error())
	}
	for _, j := range s.jobs {
		if j.name == name {
			panic("scheduler: duplicate job " + name)
		}
	}
	s.jobs = append(s.jobs, job{name: name, at: at, fn: fn})
}

// parseHHMM returns the minutes after midnight of an "HH:MM" wall-clock time.
func parseHHMM(hhmm string) (int, error) {
	t, err := time.Parse("15:04", hhmm)
	if err != nil || len(hhmm) != 5 {
		return 0, fmt.Errorf("bad time %q: want HH:MM", hhmm)
	}
	return t.Hour()*60 + t.Minute(), nil
}

// RunDue runs, in registration order, every job whose time today (household
// time) has been reached and that has not completed today. A job that has not
// run for several days runs once (no backlog). Job errors are logged and
// returned joined; they do not stop the other jobs. It returns the names of the
// jobs that completed.
func (s *Scheduler) RunDue(ctx context.Context) (ran []string, err error) {
	s.mu.Lock()
	jobs := append([]job(nil), s.jobs...)
	zone := s.zone
	s.mu.Unlock()

	loc, err := zone(ctx)
	if err != nil {
		return nil, fmt.Errorf("scheduler: household zone: %w", err)
	}
	now := s.clk.Now().In(loc)
	day := now.Format("2006-01-02")
	nowMinutes := now.Hour()*60 + now.Minute()

	var errs []error
	for _, j := range jobs {
		at, _ := parseHHMM(j.at) // validated by Daily
		if nowMinutes < at {
			continue
		}
		last, err := s.runs.LastRun(ctx, j.name)
		if err != nil {
			errs = append(errs, fmt.Errorf("scheduler: %s: last run: %w", j.name, err))
			continue
		}
		// ">=": a job that already completed on a later household day (the zone moved west) is not run again.
		if last >= day {
			continue
		}
		if err := j.fn(ctx, day); err != nil {
			s.logger.Error("scheduled job failed", "job", j.name, "day", day, "err", err)
			errs = append(errs, fmt.Errorf("scheduler: %s: %w", j.name, err))
			continue
		}
		if err := s.runs.MarkRun(ctx, j.name, day); err != nil {
			errs = append(errs, fmt.Errorf("scheduler: %s: mark run: %w", j.name, err))
			continue
		}
		ran = append(ran, j.name)
	}
	return ran, errors.Join(errs...)
}

// Run calls RunDue every tick (default one minute when tick <= 0) until ctx is
// done. It also runs once immediately, so a restart after 03:00 catches up.
func (s *Scheduler) Run(ctx context.Context, tick time.Duration) {
	if tick <= 0 {
		tick = time.Minute
	}
	t := time.NewTicker(tick)
	defer t.Stop()
	for {
		if _, err := s.RunDue(ctx); err != nil && ctx.Err() == nil {
			s.logger.Error("scheduler tick", "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// SQLRunStore keeps the last-run dates in the scheduler_runs table (migration 0601).
type SQLRunStore struct{ db *sql.DB }

// NewSQLRunStore returns a RunStore over a migrated database.
func NewSQLRunStore(d *sql.DB) *SQLRunStore { return &SQLRunStore{db: d} }

// LastRun implements RunStore.
func (s *SQLRunStore) LastRun(ctx context.Context, job string) (string, error) {
	var day string
	err := s.db.QueryRowContext(ctx, `SELECT ran_on FROM scheduler_runs WHERE job = ?`, job).Scan(&day)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return day, err
}

// MarkRun implements RunStore.
func (s *SQLRunStore) MarkRun(ctx context.Context, job, day string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO scheduler_runs (job, ran_on) VALUES (?, ?)
		ON CONFLICT (job) DO UPDATE SET ran_on = excluded.ran_on`, job, day)
	return err
}

// MemRunStore is an in-memory RunStore for tests.
type MemRunStore struct {
	mu sync.Mutex
	m  map[string]string
}

// NewMemRunStore returns an empty MemRunStore.
func NewMemRunStore() *MemRunStore { return &MemRunStore{m: map[string]string{}} }

// LastRun implements RunStore.
func (s *MemRunStore) LastRun(_ context.Context, job string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.m[job], nil
}

// MarkRun implements RunStore.
func (s *MemRunStore) MarkRun(_ context.Context, job, day string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.m[job] = day
	return nil
}
