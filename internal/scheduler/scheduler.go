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
	s.jobs = append(s.jobs, job{name: name, at: at, fn: fn})
}

// RunDue runs, in registration order, every job whose time today (household
// time) has been reached and that has not completed today. A job that has not
// run for several days runs once (no backlog). Job errors are logged and
// returned joined; they do not stop the other jobs. It returns the names of the
// jobs that completed.
func (s *Scheduler) RunDue(ctx context.Context) (ran []string, err error) {
	return nil, errors.New("scheduler: RunDue not implemented")
}

// Run calls RunDue every tick (default one minute when tick <= 0) until ctx is
// done. It also runs once immediately, so a restart after 03:00 catches up.
func (s *Scheduler) Run(ctx context.Context, tick time.Duration) {
	<-ctx.Done() // stub: the developer replaces this with the loop
}

// SQLRunStore keeps the last-run dates in the scheduler_runs table (migration 0601).
type SQLRunStore struct{ db *sql.DB }

// NewSQLRunStore returns a RunStore over a migrated database.
func NewSQLRunStore(d *sql.DB) *SQLRunStore { return &SQLRunStore{db: d} }

// LastRun implements RunStore.
func (s *SQLRunStore) LastRun(ctx context.Context, job string) (string, error) {
	return "", errors.New("scheduler: SQLRunStore not implemented")
}

// MarkRun implements RunStore.
func (s *SQLRunStore) MarkRun(ctx context.Context, job, day string) error {
	return errors.New("scheduler: SQLRunStore not implemented")
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
