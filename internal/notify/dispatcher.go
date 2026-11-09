package notify

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
)

// Config wires a Dispatcher.
type Config struct {
	Clock    clock.Clock
	Facts    FactSource
	Settings SettingsSource
	Subs     Subscriptions
	Sent     SentLog
	Sender   Sender
	Logger   *slog.Logger // nil = slog.Default()
}

// Dispatcher sends due notifications once per device.
type Dispatcher struct {
	mu  sync.Mutex
	cfg Config
}

// NewDispatcher returns a Dispatcher.
func NewDispatcher(cfg Config) *Dispatcher { return &Dispatcher{cfg: cfg} }

// SetSender swaps the delivery port (tests use a recording fake).
func (d *Dispatcher) SetSender(s Sender) { d.mu.Lock(); d.cfg.Sender = s; d.mu.Unlock() }

// SetFacts swaps the fact source (tests use fixed facts).
func (d *Dispatcher) SetFacts(f FactSource) { d.mu.Lock(); d.cfg.Facts = f; d.mu.Unlock() }

// Tick computes what is due now and sends it to every opted-in device that has
// not received it, returning the number of pushes delivered. A device that
// answers ErrGone is removed; a transient error releases the claim and is
// returned after the remaining devices were tried. Not implemented yet.
func (d *Dispatcher) Tick(ctx context.Context) (int, error) {
	return 0, errors.New("notify.Dispatcher.Tick: not implemented")
}

// TimerFinished pushes a "Timer finished" to every device opted in to
// TimerFinished, immediately and ignoring quiet hours. Not implemented yet.
func (d *Dispatcher) TimerFinished(ctx context.Context, ev TimerEvent) (int, error) {
	return 0, errors.New("notify.Dispatcher.TimerFinished: not implemented")
}

// Run calls Tick every interval until ctx ends. Not implemented yet.
func (d *Dispatcher) Run(ctx context.Context, every time.Duration) {
	<-ctx.Done()
}

// Facts returns the current facts (the Today screen lists Advance Steps from
// the same source that drives push).
func (d *Dispatcher) Facts(ctx context.Context, now time.Time) (Facts, error) {
	d.mu.Lock()
	src := d.cfg.Facts
	d.mu.Unlock()
	return src.Facts(ctx, now)
}
