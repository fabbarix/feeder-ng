package recipefile_test

import (
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
