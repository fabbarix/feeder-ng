// Package clock provides an injectable time source. Domain and store code
// takes a Clock instead of calling time.Now.
package clock

import (
	"sync"
	"time"
)

// Clock reports the current time.
type Clock interface {
	Now() time.Time
}

// System is the wall clock, in UTC.
type System struct{}

// Now returns the current time in UTC.
func (System) Now() time.Time { return time.Now().UTC() }

// Fake is a manually moved clock, safe for concurrent use.
type Fake struct {
	mu  sync.Mutex
	now time.Time
}

// NewFake returns a Fake fixed at t.
func NewFake(t time.Time) *Fake { return &Fake{now: t} }

// Now returns the fake time.
func (f *Fake) Now() time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.now
}

// Set moves the clock to t.
func (f *Fake) Set(t time.Time) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.now = t
}

// Advance moves the clock forward by d.
func (f *Fake) Advance(d time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.now = f.now.Add(d)
}

// Shifted is a test clock that starts at a given instant and then ticks with the real one: Now() is the start instant plus the
// time elapsed since NewShifted. A server started with FEEDER_TEST_NOW (tests only; config refuses it without dev login) runs on
// it, so the page-layout guard sees the same Household time on every run, whatever the hour it runs at.
type Shifted struct {
	at   time.Time
	base time.Time
}

// NewShifted returns a clock that reads at now and ticks from there.
func NewShifted(at time.Time) *Shifted { return &Shifted{at: at.UTC(), base: time.Now()} }

// Now is the start instant plus the real time elapsed since the clock was made (monotonic), in UTC.
func (s *Shifted) Now() time.Time { return s.at.Add(time.Since(s.base)) }
