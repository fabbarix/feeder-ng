package recipeassistant_test

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	ra "github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

type clock struct {
	mu sync.Mutex
	t  time.Time
}

func newClock() *clock { return &clock{t: time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)} }
func (c *clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}
func (c *clock) Advance(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

var (
	alice = ra.Caller{UserID: 1, HouseholdID: 1}
	bob   = ra.Caller{UserID: 2, HouseholdID: 1}
	root  = ra.Caller{UserID: 3, HouseholdID: 1, Admin: true}
)

// read does one complete read: accepted and finished.
func read(t *testing.T, l *ra.Limiter, c ra.Caller) error {
	t.Helper()
	release, err := l.Acquire(c)
	if err == nil {
		release()
	}
	return err
}

func TestLimiterConstants(t *testing.T) {
	if ra.HourlyReadLimit != 30 || ra.LimiterWindow != time.Hour {
		t.Fatal("limits changed")
	}
}

func TestOneRunningReadPerUserAdminsIncluded(t *testing.T) {
	for _, c := range []ra.Caller{alice, root} {
		l := ra.NewLimiter(newClock().Now)
		release, err := l.Acquire(c)
		if err != nil {
			t.Fatal(err)
		}
		_, err = l.Acquire(c)
		if ra.CodeOf(err) != ra.CodeReadInProgress {
			t.Fatalf("admin=%v: second read: code %q, want read_in_progress", c.Admin, ra.CodeOf(err))
		}
		release()
		if err := read(t, l, c); err != nil {
			t.Fatalf("after release: %v", err)
		}
	}
}

func TestOtherUsersAreNotBlockedByARunningRead(t *testing.T) {
	l := ra.NewLimiter(newClock().Now)
	r1, err := l.Acquire(alice)
	if err != nil {
		t.Fatal(err)
	}
	defer r1()
	r2, err := l.Acquire(bob)
	if err != nil {
		t.Fatalf("a second User reads concurrently: %v", err)
	}
	r2()
}

func TestReleaseIsIdempotentAndCannotFreeANewerRead(t *testing.T) {
	l := ra.NewLimiter(newClock().Now)
	first, _ := l.Acquire(alice)
	first()
	second, err := l.Acquire(alice)
	if err != nil {
		t.Fatal(err)
	}
	first() // stale second call must not free the running read
	if _, err := l.Acquire(alice); ra.CodeOf(err) != ra.CodeReadInProgress {
		t.Fatalf("a stale release freed the slot: %v", err)
	}
	second()
	second()
}

func TestThirtyReadsPerRollingHourPerHousehold(t *testing.T) {
	clk := newClock()
	l := ra.NewLimiter(clk.Now)
	for i := 0; i < 30; i++ {
		who := alice
		if i%2 == 1 {
			who = bob // the budget is shared by the whole Household
		}
		if err := read(t, l, who); err != nil {
			t.Fatalf("read %d: %v", i+1, err)
		}
		clk.Advance(time.Minute)
	}
	// 30 minutes have passed; the first read was 30 minutes ago.
	err := read(t, l, alice)
	e, ok := err.(*ra.Error)
	if !ok || e.Code != ra.CodeTooManyReads {
		t.Fatalf("31st read: %v, want too_many_reads", err)
	}
	if e.RetryAfterSeconds != 30*60 {
		t.Fatalf("retryAfterSeconds = %d, want 1800 (the oldest read leaves the window in 30 min)", e.RetryAfterSeconds)
	}
	if err := read(t, l, bob); ra.CodeOf(err) != ra.CodeTooManyReads {
		t.Fatalf("bob shares the budget: %v", err)
	}
	clk.Advance(30*time.Minute - time.Second)
	e = mustErr(t, read(t, l, alice))
	if e.RetryAfterSeconds != 1 {
		t.Fatalf("retryAfterSeconds = %d, want 1", e.RetryAfterSeconds)
	}
	clk.Advance(time.Second) // exactly one hour after the first read: it has left the window
	if err := read(t, l, alice); err != nil {
		t.Fatalf("after the window: %v", err)
	}
	if err := read(t, l, alice); ra.CodeOf(err) != ra.CodeTooManyReads {
		t.Fatalf("only one slot freed, got %v", err)
	}
}

func TestRetryAfterRoundsUpToWholeSeconds(t *testing.T) {
	clk := newClock()
	l := ra.NewLimiter(clk.Now)
	for i := 0; i < 30; i++ {
		_ = read(t, l, alice)
	}
	clk.Advance(time.Hour - 1500*time.Millisecond)
	e := mustErr(t, read(t, l, alice))
	if e.RetryAfterSeconds != 2 {
		t.Fatalf("1.5 s left must report 2, got %d", e.RetryAfterSeconds)
	}
}

func TestAdminReadsAreExemptAndNotCounted(t *testing.T) {
	l := ra.NewLimiter(newClock().Now)
	for i := 0; i < 100; i++ {
		if err := read(t, l, root); err != nil {
			t.Fatalf("admin read %d: %v", i+1, err)
		}
	}
	for i := 0; i < 30; i++ {
		if err := read(t, l, alice); err != nil {
			t.Fatalf("the Admin's batch must not use the Users' budget; read %d: %v", i+1, err)
		}
	}
	if err := read(t, l, alice); ra.CodeOf(err) != ra.CodeTooManyReads {
		t.Fatalf("31st User read: %v", err)
	}
	if err := read(t, l, root); err != nil {
		t.Fatalf("an Admin can still read: %v", err)
	}
}

func TestRoleIsReadAtRequestTime(t *testing.T) {
	l := ra.NewLimiter(newClock().Now)
	for i := 0; i < 30; i++ {
		_ = read(t, l, alice)
	}
	promoted := alice
	promoted.Admin = true
	if err := read(t, l, promoted); err != nil {
		t.Fatalf("promoted to Admin mid-hour: %v", err)
	}
	if err := read(t, l, alice); ra.CodeOf(err) != ra.CodeTooManyReads {
		t.Fatalf("demoted again: the earlier 30 still count, got %v", err)
	}
	// Reads made while an Admin were not counted: a demoted Admin starts at zero.
	l2 := ra.NewLimiter(newClock().Now)
	for i := 0; i < 40; i++ {
		_ = read(t, l2, promoted)
	}
	demoted := promoted
	demoted.Admin = false
	for i := 0; i < 30; i++ {
		if err := read(t, l2, demoted); err != nil {
			t.Fatalf("read %d after demotion: %v", i+1, err)
		}
	}
}

func TestHouseholdsDoNotShareABudget(t *testing.T) {
	l := ra.NewLimiter(newClock().Now)
	for i := 0; i < 30; i++ {
		_ = read(t, l, alice)
	}
	other := ra.Caller{UserID: 9, HouseholdID: 2}
	if err := read(t, l, other); err != nil {
		t.Fatalf("another Household: %v", err)
	}
}

func TestRefusalsCountNothingAndHoldNothing(t *testing.T) {
	clk := newClock()
	l := ra.NewLimiter(clk.Now)
	run, _ := l.Acquire(alice)
	for i := 0; i < 50; i++ {
		if _, err := l.Acquire(alice); ra.CodeOf(err) != ra.CodeReadInProgress {
			t.Fatal(err)
		}
	}
	run()
	// 50 refused attempts did not use up the budget: 29 more reads fit (1 counted).
	for i := 0; i < 29; i++ {
		if err := read(t, l, alice); err != nil {
			t.Fatalf("read %d: %v", i+2, err)
		}
	}
	if err := read(t, l, alice); ra.CodeOf(err) != ra.CodeTooManyReads {
		t.Fatalf("31st: %v", err)
	}
	// A too_many_reads refusal holds no running slot.
	clk.Advance(2 * time.Hour)
	if err := read(t, l, alice); err != nil {
		t.Fatalf("after the window: %v", err)
	}
}

func TestInProgressIsReportedBeforeTooManyReads(t *testing.T) {
	l := ra.NewLimiter(newClock().Now)
	var releases []func()
	for i := 0; i < 30; i++ {
		r, err := l.Acquire(ra.Caller{UserID: int64(100 + i), HouseholdID: 1})
		if err != nil {
			t.Fatal(err)
		}
		releases = append(releases, r)
	}
	run, err := l.Acquire(ra.Caller{UserID: 100, HouseholdID: 1, Admin: true}) // Admin: running slot only
	if ra.CodeOf(err) != ra.CodeReadInProgress {
		t.Fatalf("user 100 is already running: %v", err)
	}
	_ = run
	_, err = l.Acquire(alice)
	if ra.CodeOf(err) != ra.CodeTooManyReads {
		t.Fatalf("budget used up by 30 accepted reads: %v", err)
	}
	for _, r := range releases {
		r()
	}
}

func TestLimiterIsSafeForConcurrentUse(t *testing.T) {
	l := ra.NewLimiter(newClock().Now)
	var ok atomic.Int64
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if _, err := l.Acquire(alice); err == nil {
				ok.Add(1) // never released: exactly one may win
			}
		}()
	}
	close(start)
	wg.Wait()
	if ok.Load() != 1 {
		t.Fatalf("%d concurrent reads accepted for one User, want 1", ok.Load())
	}

	l2 := ra.NewLimiter(newClock().Now)
	ok.Store(0)
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if release, err := l2.Acquire(ra.Caller{UserID: int64(1000 + i), HouseholdID: 5}); err == nil {
				ok.Add(1)
				release()
			}
		}(i)
	}
	wg.Wait()
	if ok.Load() != 30 {
		t.Fatalf("%d accepted for one Household, want exactly 30", ok.Load())
	}
}

// mustErr fails the test unless err is a *ra.Error.
func mustErr(t *testing.T, err error) *ra.Error {
	t.Helper()
	e, ok := err.(*ra.Error)
	if !ok {
		t.Fatalf("got %v (%T), want a *recipeassistant.Error", err, err)
	}
	return e
}
