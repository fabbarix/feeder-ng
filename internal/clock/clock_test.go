package clock_test

import (
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
)

func TestSystemNowIsUTCAndCurrent(t *testing.T) {
	before := time.Now()
	got := clock.System{}.Now()
	after := time.Now()
	if got.Location() != time.UTC {
		t.Fatalf("System.Now location = %v, want UTC", got.Location())
	}
	if got.Before(before.Add(-time.Second)) || got.After(after.Add(time.Second)) {
		t.Fatalf("System.Now = %v, not within [%v, %v]", got, before, after)
	}
}

func TestFakeStaysFixedUntilMoved(t *testing.T) {
	start := time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	f := clock.NewFake(start)
	if !f.Now().Equal(start) {
		t.Fatalf("Now = %v, want %v", f.Now(), start)
	}
	if !f.Now().Equal(start) {
		t.Fatal("Fake clock must not tick by itself")
	}
	f.Advance(36 * time.Hour)
	if want := start.Add(36 * time.Hour); !f.Now().Equal(want) {
		t.Fatalf("after Advance Now = %v, want %v", f.Now(), want)
	}
	other := time.Date(2030, 1, 2, 3, 4, 5, 0, time.UTC)
	f.Set(other)
	if !f.Now().Equal(other) {
		t.Fatalf("after Set Now = %v, want %v", f.Now(), other)
	}
}

func TestFakeIsSafeForConcurrentUse(t *testing.T) {
	f := clock.NewFake(time.Unix(0, 0).UTC())
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(2)
		go func() { defer wg.Done(); f.Advance(time.Second) }()
		go func() { defer wg.Done(); _ = f.Now() }()
	}
	wg.Wait()
	if want := time.Unix(20, 0).UTC(); !f.Now().Equal(want) {
		t.Fatalf("Now = %v, want %v", f.Now(), want)
	}
}

var _ clock.Clock = clock.System{}
var _ clock.Clock = (*clock.Fake)(nil)

func TestShiftedStartsAtItsInstantAndTicks(t *testing.T) {
	at := time.Date(2026, 11, 18, 15, 0, 0, 0, time.FixedZone("x", 3600))
	s := clock.NewShifted(at)
	got := s.Now()
	if got.Location() != time.UTC {
		t.Fatalf("Shifted.Now location = %v, want UTC", got.Location())
	}
	if d := got.Sub(at); d < 0 || d > time.Second {
		t.Fatalf("Shifted.Now = %v, want %v plus a moment", got, at)
	}
	time.Sleep(20 * time.Millisecond)
	if d := s.Now().Sub(got); d < 15*time.Millisecond || d > time.Second {
		t.Fatalf("Shifted clock must tick with the real one (moved %v in 20 ms)", d)
	}
}
