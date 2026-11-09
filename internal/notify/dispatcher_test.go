package notify_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/notify"
)

type fakeFacts struct {
	mu    sync.Mutex
	facts notify.Facts
	err   error
	calls int
}

func (f *fakeFacts) Facts(context.Context, time.Time) (notify.Facts, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	return f.facts, f.err
}

type fakeSettings struct {
	q   household.QuietHours
	loc *time.Location
}

func (s fakeSettings) Quiet(context.Context) (household.QuietHours, *time.Location, error) {
	return s.q, s.loc, nil
}

type fakeSubs struct {
	byType  map[notify.Type][]notify.Target
	removed []int64
}

func (s *fakeSubs) Targets(_ context.Context, t notify.Type) ([]notify.Target, error) {
	return s.byType[t], nil
}
func (s *fakeSubs) Remove(_ context.Context, id int64) error {
	s.removed = append(s.removed, id)
	return nil
}

type fakeSent struct{ claimed map[string]bool }

func (s *fakeSent) Claim(_ context.Context, id int64, key string) (bool, error) {
	k := string(rune(id)) + "|" + key
	if s.claimed[k] {
		return false, nil
	}
	s.claimed[k] = true
	return true, nil
}
func (s *fakeSent) Release(_ context.Context, id int64, key string) error {
	delete(s.claimed, string(rune(id))+"|"+key)
	return nil
}

type push struct {
	to notify.Target
	p  notify.Payload
}

type fakeSender struct {
	sent []push
	errs map[int64]error // by target id
}

func (s *fakeSender) Send(_ context.Context, to notify.Target, p notify.Payload) error {
	if err := s.errs[to.ID]; err != nil {
		return err
	}
	s.sent = append(s.sent, push{to, p})
	return nil
}

type rig struct {
	d      *notify.Dispatcher
	clk    *clock.Fake
	facts  *fakeFacts
	subs   *fakeSubs
	sender *fakeSender
}

func newRig(t *testing.T, now time.Time) *rig {
	t.Helper()
	rome := zone(t, "Europe/Rome")
	r := &rig{
		clk:    clock.NewFake(now),
		facts:  &fakeFacts{facts: notify.Facts{Meals: []notify.MealFact{curry(rome)}}},
		subs:   &fakeSubs{byType: map[notify.Type][]notify.Target{}},
		sender: &fakeSender{errs: map[int64]error{}},
	}
	r.d = notify.NewDispatcher(notify.Config{
		Clock: r.clk, Facts: r.facts, Settings: fakeSettings{night, rome},
		Subs: r.subs, Sent: &fakeSent{claimed: map[string]bool{}}, Sender: r.sender,
	})
	return r
}

var (
	phone  = notify.Target{ID: 1, UserID: 10, Endpoint: "https://push.example/a"}
	tablet = notify.Target{ID: 2, UserID: 11, Endpoint: "https://push.example/b"}
)

func TestTickSendsAnAdvanceStepOnlyToDevicesOptedInToIt(t *testing.T) {
	r := newRig(t, utc(2026, 11, 9, 14, 30, 0)) // 15:30 Rome: Marinate is due
	r.subs.byType[notify.AdvanceStep] = []notify.Target{phone}
	r.subs.byType[notify.LeftoverUseBy] = []notify.Target{tablet}
	n, err := r.d.Tick(context.Background())
	if err != nil || n != 1 {
		t.Fatalf("Tick = %d, %v", n, err)
	}
	if len(r.sender.sent) != 1 || r.sender.sent[0].to.ID != phone.ID {
		t.Fatalf("sent %+v", r.sender.sent)
	}
	p := r.sender.sent[0].p
	if p.Type != notify.AdvanceStep || p.Body != "Marinate the chicken now for 19:30" || p.Tag == "" {
		t.Errorf("payload %+v", p)
	}
}

func TestEachNotificationIsSentOncePerDevice(t *testing.T) {
	r := newRig(t, utc(2026, 11, 9, 14, 30, 0))
	r.subs.byType[notify.AdvanceStep] = []notify.Target{phone, tablet}
	if n, _ := r.d.Tick(context.Background()); n != 2 {
		t.Fatalf("first tick sent %d, want 2 (one per device)", n)
	}
	r.clk.Advance(time.Minute)
	if n, _ := r.d.Tick(context.Background()); n != 0 {
		t.Fatalf("second tick sent %d, want 0", n)
	}
	if len(r.sender.sent) != 2 {
		t.Errorf("sent %d in total, want 2", len(r.sender.sent))
	}
}

func TestQuietHoursDeferTheConfirmCookedReminderToSevenInTheMorning(t *testing.T) {
	r := newRig(t, utc(2026, 11, 9, 22, 45, 0))
	// A late supper at 21:30 Rome: Confirm Cooked falls due at 23:30 Rome, inside quiet hours.
	r.facts.facts.Meals[0].SlotAt = time.Date(2026, 11, 9, 21, 30, 0, 0, zone(t, "Europe/Rome"))
	r.subs.byType[notify.ConfirmCooked] = []notify.Target{phone}
	// now is 23:45 Rome: past the due time, inside quiet hours.
	if n, _ := r.d.Tick(context.Background()); n != 0 {
		t.Fatalf("sent %d during quiet hours", n)
	}
	r.clk.Set(utc(2026, 11, 10, 6, 0, 0)) // 07:00 Rome
	if n, _ := r.d.Tick(context.Background()); n != 1 {
		t.Fatalf("sent %d at the end of quiet hours, want 1", n)
	}
}

func TestAGoneDeviceIsRemovedAndDoesNotFailTheTick(t *testing.T) {
	r := newRig(t, utc(2026, 11, 9, 14, 30, 0))
	r.subs.byType[notify.AdvanceStep] = []notify.Target{phone, tablet}
	r.sender.errs[phone.ID] = notify.ErrGone
	n, err := r.d.Tick(context.Background())
	if err != nil || n != 1 {
		t.Fatalf("Tick = %d, %v; want 1 sent and no error", n, err)
	}
	if len(r.subs.removed) != 1 || r.subs.removed[0] != phone.ID {
		t.Errorf("removed %v", r.subs.removed)
	}
}

func TestATransientErrorIsReportedAndRetriedOnTheNextTick(t *testing.T) {
	r := newRig(t, utc(2026, 11, 9, 14, 30, 0))
	r.subs.byType[notify.AdvanceStep] = []notify.Target{phone}
	r.sender.errs[phone.ID] = errors.New("push service unavailable")
	n, err := r.d.Tick(context.Background())
	if err == nil || n != 0 {
		t.Fatalf("Tick = %d, %v; want an error and 0 sent", n, err)
	}
	delete(r.sender.errs, phone.ID)
	r.clk.Advance(time.Minute)
	if n, err := r.d.Tick(context.Background()); err != nil || n != 1 {
		t.Fatalf("retry = %d, %v; want 1", n, err)
	}
}

func TestAFactsFailureSendsNothing(t *testing.T) {
	r := newRig(t, utc(2026, 11, 9, 14, 30, 0))
	r.subs.byType[notify.AdvanceStep] = []notify.Target{phone}
	r.facts.err = errors.New("db locked")
	if n, err := r.d.Tick(context.Background()); err == nil || n != 0 {
		t.Fatalf("Tick = %d, %v", n, err)
	}
}

func TestTimerFinishedIsImmediateIgnoresQuietHoursAndIsSentOnce(t *testing.T) {
	r := newRig(t, utc(2026, 11, 9, 22, 0, 0)) // 23:00 Rome, quiet
	r.subs.byType[notify.TimerFinished] = []notify.Target{phone}
	r.subs.byType[notify.AdvanceStep] = []notify.Target{tablet}
	ev := notify.TimerEvent{TimerID: 7, Label: "Pasta", RecipeName: "Carbonara"}
	n, err := r.d.TimerFinished(context.Background(), ev)
	if err != nil || n != 1 {
		t.Fatalf("TimerFinished = %d, %v", n, err)
	}
	got := r.sender.sent[0]
	if got.to.ID != phone.ID || got.p.Type != notify.TimerFinished || got.p.Title != "Timer finished" || got.p.Body != "Pasta (Carbonara)" {
		t.Errorf("sent %+v", got)
	}
	if n, _ := r.d.TimerFinished(context.Background(), ev); n != 0 {
		t.Errorf("the same timer was pushed twice")
	}
	if n, _ := r.d.TimerFinished(context.Background(), notify.TimerEvent{TimerID: 8, Label: "Rice"}); n != 1 {
		t.Errorf("a different timer should push")
	}
	if last := r.sender.sent[len(r.sender.sent)-1].p.Body; last != "Rice" {
		t.Errorf("a timer with no Recipe reads %q, want %q", last, "Rice")
	}
}

func TestRunTicksUntilTheContextEnds(t *testing.T) {
	r := newRig(t, utc(2026, 11, 9, 14, 30, 0))
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { r.d.Run(ctx, 5*time.Millisecond); close(done) }()
	deadline := time.After(2 * time.Second)
	for {
		r.facts.mu.Lock()
		calls := r.facts.calls
		r.facts.mu.Unlock()
		if calls >= 2 {
			break
		}
		select {
		case <-deadline:
			t.Fatal("Run did not tick")
		case <-time.After(5 * time.Millisecond):
		}
	}
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not stop")
	}
}
