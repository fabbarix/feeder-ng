package notify

import (
	"context"
	"errors"
	"fmt"
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
func NewDispatcher(cfg Config) *Dispatcher {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	return &Dispatcher{cfg: cfg}
}

// SetSender swaps the delivery port (tests use a recording fake).
func (d *Dispatcher) SetSender(s Sender) { d.mu.Lock(); d.cfg.Sender = s; d.mu.Unlock() }

// SetFacts swaps the fact source (tests use fixed facts).
func (d *Dispatcher) SetFacts(f FactSource) { d.mu.Lock(); d.cfg.Facts = f; d.mu.Unlock() }

func (d *Dispatcher) config() Config {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.cfg
}

// Tick computes what is due now and sends it to every opted-in device that has
// not received it, returning the number of pushes delivered. A device that
// answers ErrGone is removed; a transient error releases the claim, the other
// devices are still tried, and the errors are returned joined.
func (d *Dispatcher) Tick(ctx context.Context) (int, error) {
	cfg := d.config()
	now := cfg.Clock.Now()
	facts, err := cfg.Facts.Facts(ctx, now)
	if err != nil {
		return 0, fmt.Errorf("notify: facts: %w", err)
	}
	quiet, loc, err := cfg.Settings.Quiet(ctx)
	if err != nil {
		return 0, fmt.Errorf("notify: household settings: %w", err)
	}
	var sent int
	var errs []error
	for _, due := range DueNow(Compute(facts, loc), now, quiet, loc) {
		n, err := d.deliver(ctx, cfg, due.Candidate)
		sent += n
		errs = append(errs, err...)
	}
	return sent, errors.Join(errs...)
}

// boardURL is where a Timer finished notification leads: the kitchen board shows every running timer.
const boardURL = "/board"

// TimerFinished pushes a "Timer finished" to every device opted in to
// TimerFinished, immediately and ignoring quiet hours. A timer is pushed once.
func (d *Dispatcher) TimerFinished(ctx context.Context, ev TimerEvent) (int, error) {
	body := ev.Label
	if ev.RecipeName != "" {
		body = fmt.Sprintf("%s (%s)", ev.Label, ev.RecipeName)
	}
	c := Candidate{
		// The end instant is part of the key: SQLite reuses the id of a deleted timer.
		Key:   fmt.Sprintf("%s:%d@%s", TimerFinished, ev.TimerID, ev.EndedAt.UTC().Format(time.RFC3339Nano)),
		Type:  TimerFinished,
		Title: "Timer finished",
		Body:  body,
		URL:   boardURL,
	}
	n, err := d.deliver(ctx, d.config(), c)
	return n, errors.Join(err...)
}

// deliver sends c to each device opted in to its type that has not got it.
func (d *Dispatcher) deliver(ctx context.Context, cfg Config, c Candidate) (int, []error) {
	targets, err := cfg.Subs.Targets(ctx, c.Type)
	if err != nil {
		return 0, []error{fmt.Errorf("notify: devices for %s: %w", c.Type, err)}
	}
	var sent int
	var errs []error
	for _, t := range targets {
		first, err := cfg.Sent.Claim(ctx, t.ID, c.Key)
		if err != nil {
			errs = append(errs, fmt.Errorf("notify: claim %s: %w", c.Key, err))
			continue
		}
		if !first {
			continue
		}
		p := Payload{Type: c.Type, Title: c.Title, Body: c.Body, URL: c.URL, Tag: c.Key}
		switch err := cfg.Sender.Send(ctx, t, p); {
		case err == nil:
			sent++
		case errors.Is(err, ErrGone):
			cfg.Logger.Info("push device gone, removing it", "device", t.ID)
			if rmErr := cfg.Subs.Remove(ctx, t.ID); rmErr != nil {
				errs = append(errs, fmt.Errorf("notify: remove device %d: %w", t.ID, rmErr))
			}
		default:
			if relErr := cfg.Sent.Release(ctx, t.ID, c.Key); relErr != nil {
				errs = append(errs, fmt.Errorf("notify: release %s: %w", c.Key, relErr))
			}
			errs = append(errs, fmt.Errorf("notify: push to device %d: %w", t.ID, err))
		}
	}
	return sent, errs
}

// Run calls Tick every interval until ctx ends. A failed tick is logged and the
// next one tries again.
func (d *Dispatcher) Run(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if _, err := d.Tick(ctx); err != nil && ctx.Err() == nil {
				d.config().Logger.Error("notification check failed", "err", err)
			}
		}
	}
}

// Facts returns the current facts (the Today screen lists Advance Steps from
// the same source that drives push).
func (d *Dispatcher) Facts(ctx context.Context, now time.Time) (Facts, error) {
	return d.config().Facts.Facts(ctx, now)
}
