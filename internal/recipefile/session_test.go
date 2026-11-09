package recipefile_test

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

func TestSessionsAreOwnedByTheUserAndExpireWhenIdle(t *testing.T) {
	clk := clock.NewFake(now)
	s := recipefile.NewSessions(clk)
	f := exampleFile(t)
	rv := s.Open(1, f, recipefile.ImageSet{})
	if len(rv.ID) < 32 || rv.UserID != 1 {
		t.Fatalf("review = %+v", rv)
	}
	if other := s.Open(1, f, recipefile.ImageSet{}); other.ID == rv.ID {
		t.Fatal("ids must be unique")
	}
	if _, ok := s.Get(2, rv.ID); ok {
		t.Fatal("another User must not read the Review")
	}
	if got, ok := s.Get(1, rv.ID); !ok || len(got.File.Recipes) != 2 {
		t.Fatal("owner reads it")
	}
	clk.Advance(recipefile.SessionTTL - time.Minute)
	if _, ok := s.Get(1, rv.ID); !ok {
		t.Fatal("still alive just before the TTL")
	}
	clk.Advance(recipefile.SessionTTL - time.Minute) // renewed by the Get above
	if _, ok := s.Get(1, rv.ID); !ok {
		t.Fatal("a Get renews the idle timer")
	}
	clk.Advance(recipefile.SessionTTL + time.Second)
	if _, ok := s.Get(1, rv.ID); ok {
		t.Fatal("expired")
	}
}

func TestSessionsDropTheOldestPastTheLimitAndCloseIsIdempotent(t *testing.T) {
	clk := clock.NewFake(now)
	s := recipefile.NewSessions(clk)
	var ids []string
	for i := 0; i < recipefile.MaxUserReviews+1; i++ {
		clk.Advance(time.Second)
		ids = append(ids, s.Open(1, exampleFile(t), recipefile.ImageSet{}).ID)
	}
	if _, ok := s.Get(1, ids[0]); ok {
		t.Fatal("the oldest Review is dropped")
	}
	if _, ok := s.Get(1, ids[len(ids)-1]); !ok {
		t.Fatal("the newest stays")
	}
	s.Close(1, ids[1])
	s.Close(1, ids[1])
	s.Close(2, ids[2]) // not the owner: no effect
	if _, ok := s.Get(1, ids[1]); ok {
		t.Fatal("closed")
	}
	if _, ok := s.Get(1, ids[2]); !ok {
		t.Fatal("another User cannot close it")
	}
}

func TestTakeRemovesTheReviewAtomicallyAndOnlyForItsOwner(t *testing.T) {
	s := recipefile.NewSessions(clock.NewFake(now))
	rv := s.Open(1, exampleFile(t), recipefile.ImageSet{})
	if _, ok := s.Take(2, rv.ID); ok {
		t.Fatal("another User must not take the Review")
	}
	if _, ok := s.Get(1, rv.ID); !ok {
		t.Fatal("a refused Take leaves the Review alone")
	}
	got, ok := s.Take(1, rv.ID)
	if !ok || got.ID != rv.ID || len(got.File.Recipes) != 2 {
		t.Fatalf("Take = %+v, %v", got, ok)
	}
	if _, ok := s.Get(1, rv.ID); ok {
		t.Fatal("a taken Review is gone from the store")
	}
	if _, ok := s.Take(1, rv.ID); ok {
		t.Fatal("a Review can be taken once")
	}
}

func TestParallelTakesOfOneReviewHaveExactlyOneWinner(t *testing.T) {
	s := recipefile.NewSessions(clock.NewFake(now))
	rv := s.Open(1, exampleFile(t), recipefile.ImageSet{})
	var wins atomic.Int64
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, ok := s.Take(1, rv.ID); ok {
				wins.Add(1)
			}
		}()
	}
	wg.Wait()
	if wins.Load() != 1 {
		t.Fatalf("%d goroutines took the Review, want exactly 1", wins.Load())
	}
}

func TestRestoreReturnsATakenReviewSoAFailedConfirmCanBeRetried(t *testing.T) {
	clk := clock.NewFake(now)
	s := recipefile.NewSessions(clk)
	rv := s.Open(1, exampleFile(t), recipefile.ImageSet{})
	taken, _ := s.Take(1, rv.ID)
	s.Restore(taken)
	got, ok := s.Get(1, rv.ID)
	if !ok || got.ID != rv.ID || got.UserID != 1 || len(got.File.Recipes) != 2 {
		t.Fatalf("restored Review = %+v, %v", got, ok)
	}
	if _, ok := s.Take(2, rv.ID); ok {
		t.Fatal("a restored Review still belongs to its User")
	}
	// The idle timer starts again at Restore.
	s.Take(1, rv.ID)
	clk.Advance(recipefile.SessionTTL - time.Minute)
	s.Restore(taken)
	clk.Advance(recipefile.SessionTTL - time.Minute)
	if _, ok := s.Get(1, rv.ID); !ok {
		t.Fatal("Restore renews the idle timer")
	}
}

func TestRestoreCountsAgainstTheUsersLimit(t *testing.T) {
	clk := clock.NewFake(now)
	s := recipefile.NewSessions(clk)
	first := s.Open(1, exampleFile(t), recipefile.ImageSet{})
	taken, _ := s.Take(1, first.ID)
	var ids []string
	for i := 0; i < recipefile.MaxUserReviews; i++ {
		clk.Advance(time.Second)
		ids = append(ids, s.Open(1, exampleFile(t), recipefile.ImageSet{}).ID)
	}
	clk.Advance(time.Second)
	s.Restore(taken) // now MaxUserReviews+1 Reviews: the oldest goes
	if _, ok := s.Get(1, first.ID); !ok {
		t.Fatal("the restored Review has a renewed clock and is not the oldest")
	}
	if _, ok := s.Get(1, ids[0]); ok {
		t.Fatal("the oldest Review is dropped to stay within the limit")
	}
	for _, id := range ids[1:] {
		if _, ok := s.Get(1, id); !ok {
			t.Fatalf("Review %s must stay", id)
		}
	}
}
