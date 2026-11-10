package recipeassistant_test

import (
	"testing"
	"time"

	ra "github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

// Check reports what Acquire would, without holding or counting (design §1.5).

func TestCheckAcceptsWhenNothingIsInTheWay(t *testing.T) {
	l := ra.NewLimiter(newClock().Now)
	for _, who := range []ra.Caller{alice, bob, root} {
		if err := l.Check(who); err != nil {
			t.Fatalf("%+v: %v", who, err)
		}
	}
}

func TestCheckReportsReadInProgressLikeAcquire(t *testing.T) {
	l := ra.NewLimiter(newClock().Now)
	release, err := l.Acquire(alice)
	if err != nil {
		t.Fatal(err)
	}
	e := mustErr(t, l.Check(alice))
	if e.Code != ra.CodeReadInProgress {
		t.Fatalf("Check: %v", e)
	}
	if ra.CodeOf(l.Check(bob)) != "" {
		t.Error("another User is not blocked")
	}
	_, acqErr := l.Acquire(alice)
	if ra.CodeOf(acqErr) != e.Code {
		t.Errorf("Acquire says %q, Check says %q", ra.CodeOf(acqErr), e.Code)
	}
	release()
	if err := l.Check(alice); err != nil {
		t.Fatalf("after release: %v", err)
	}
}

func TestCheckReportsAdminsInProgressToo(t *testing.T) {
	l := ra.NewLimiter(newClock().Now)
	release, _ := l.Acquire(root)
	defer release()
	if ra.CodeOf(l.Check(root)) != ra.CodeReadInProgress {
		t.Fatal("Admins have one running read as well")
	}
}

func TestCheckReportsTooManyReadsWithTheSameRetryAfterAsAcquire(t *testing.T) {
	clk := newClock()
	l := ra.NewLimiter(clk.Now)
	for i := 0; i < ra.HourlyReadLimit; i++ {
		if err := read(t, l, alice); err != nil {
			t.Fatal(err)
		}
		clk.Advance(90 * time.Second)
	}
	clk.Advance(500 * time.Millisecond) // a fractional wait must round up the same way
	chk := mustErr(t, l.Check(bob))     // the budget is the Household's
	acq := mustErr(t, func() error { _, err := l.Acquire(bob); return err }())
	if chk.Code != ra.CodeTooManyReads || chk.Code != acq.Code || chk.RetryAfterSeconds != acq.RetryAfterSeconds || chk.RetryAfterSeconds <= 0 {
		t.Fatalf("Check %+v vs Acquire %+v", chk, acq)
	}
}

func TestCheckExemptsAdminsFromTheHourlyLimit(t *testing.T) {
	clk := newClock()
	l := ra.NewLimiter(clk.Now)
	for i := 0; i < ra.HourlyReadLimit; i++ {
		if err := read(t, l, alice); err != nil {
			t.Fatal(err)
		}
	}
	if ra.CodeOf(l.Check(alice)) != ra.CodeTooManyReads {
		t.Fatal("a non-Admin is over the limit")
	}
	if err := l.Check(root); err != nil {
		t.Fatalf("an Admin is exempt from the hourly limit: %v", err)
	}
}

func TestCheckReportsInProgressBeforeTooManyReads(t *testing.T) {
	l := ra.NewLimiter(newClock().Now)
	for i := 0; i < ra.HourlyReadLimit-1; i++ {
		if err := read(t, l, alice); err != nil {
			t.Fatal(err)
		}
	}
	release, err := l.Acquire(alice) // the 30th, still running
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	if got := ra.CodeOf(l.Check(alice)); got != ra.CodeReadInProgress {
		t.Fatalf("got %q, want read_in_progress first", got)
	}
	if got := ra.CodeOf(l.Check(bob)); got != ra.CodeTooManyReads {
		t.Fatalf("bob has nothing running but the Household is at 30: got %q", got)
	}
}

func TestCheckHoldsNothingAndCountsNothing(t *testing.T) {
	l := ra.NewLimiter(newClock().Now)
	// Any number of Checks takes no slot and uses no budget.
	for i := 0; i < 5*ra.HourlyReadLimit; i++ {
		if err := l.Check(alice); err != nil {
			t.Fatalf("check %d: %v", i, err)
		}
	}
	for i := 0; i < ra.HourlyReadLimit; i++ {
		if err := l.Check(alice); err != nil {
			t.Fatalf("check before read %d: %v", i, err)
		}
		if err := read(t, l, alice); err != nil {
			t.Fatalf("read %d after Checks: %v (Check must not count)", i+1, err)
		}
	}
	if ra.CodeOf(read(t, l, alice)) != ra.CodeTooManyReads {
		t.Fatal("31st read")
	}
	// A refused Check changes nothing either: after the window the budget is back in full.
	for i := 0; i < 10; i++ {
		_ = l.Check(alice)
	}
	// A Check does not hold the running slot.
	l2 := ra.NewLimiter(newClock().Now)
	_ = l2.Check(alice)
	release, err := l2.Acquire(alice)
	if err != nil {
		t.Fatalf("Acquire after Check: %v", err)
	}
	release()
}

func TestCheckLeavesAcquireUnchangedAndFreesWithTheWindow(t *testing.T) {
	clk := newClock()
	l := ra.NewLimiter(clk.Now)
	for i := 0; i < ra.HourlyReadLimit; i++ {
		_ = read(t, l, alice)
	}
	if ra.CodeOf(l.Check(alice)) != ra.CodeTooManyReads {
		t.Fatal("at the limit")
	}
	clk.Advance(time.Hour)
	if err := l.Check(alice); err != nil {
		t.Fatalf("a read leaves the window one hour after it was accepted: %v", err)
	}
	if err := read(t, l, alice); err != nil {
		t.Fatal(err)
	}
}

func TestCheckIsSafeForConcurrentUse(t *testing.T) {
	l := ra.NewLimiter(newClock().Now)
	done := make(chan struct{})
	for i := 0; i < 8; i++ {
		go func(i int) {
			defer func() { done <- struct{}{} }()
			c := ra.Caller{UserID: int64(i), HouseholdID: 1}
			for j := 0; j < 200; j++ {
				_ = l.Check(c)
				if release, err := l.Acquire(c); err == nil {
					release()
				}
			}
		}(i)
	}
	for i := 0; i < 8; i++ {
		<-done
	}
}
