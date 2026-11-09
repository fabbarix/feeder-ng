package recipefile

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
)

// Session limits.
const (
	SessionTTL     = time.Hour // idle time after which a Review is dropped
	MaxUserReviews = 5         // per User; opening another drops the oldest
)

// Review is one Import Review held in memory between requests: the parsed
// file and its resolved images, so images are fetched once per upload.
type Review struct {
	ID     string
	UserID int64
	File   File
	Images ImageSet
}

// entry is a Review with its idle clock.
type entry struct {
	review   Review
	lastSeen time.Time
}

// Sessions keeps Reviews in memory (a restart drops them; the user uploads
// again). Safe for concurrent use. Time comes from the injected clock.
type Sessions struct {
	clk clock.Clock
	mu  sync.Mutex
	// byUser holds each User's Reviews, oldest first.
	byUser map[int64][]*entry
}

// NewSessions returns an empty store.
func NewSessions(clk clock.Clock) *Sessions {
	return &Sessions{clk: clk, byUser: map[int64][]*entry{}}
}

// Open stores a Review for the User under a new unguessable id (>= 128 bits of
// randomness, hex) and returns it. The oldest of the User's Reviews is dropped
// past MaxUserReviews.
func (s *Sessions) Open(userID int64, f File, images ImageSet) Review {
	s.mu.Lock()
	defer s.mu.Unlock()
	rv := Review{ID: newReviewID(), UserID: userID, File: f, Images: images}
	list := append(s.live(userID), &entry{review: rv, lastSeen: s.clk.Now()})
	if over := len(list) - MaxUserReviews; over > 0 {
		list = list[over:]
	}
	s.byUser[userID] = list
	return rv
}

// Get returns the Review if it exists, belongs to the User and is not expired;
// a successful Get renews the idle timer.
func (s *Sessions) Get(userID int64, id string) (Review, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, e := range s.live(userID) {
		if e.review.ID == id {
			e.lastSeen = s.clk.Now()
			return e.review, true
		}
	}
	return Review{}, false
}

// Take atomically removes the User's Review and returns it: of any number of
// concurrent Takes of one id exactly one gets ok == true. Confirm takes the
// Review before it writes, so a double or parallel confirm imports once.
func (s *Sessions) Take(userID int64, id string) (Review, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	list := s.live(userID)
	for i, e := range list {
		if e.review.ID == id {
			s.byUser[userID] = append(list[:i:i], list[i+1:]...)
			return e.review, true
		}
	}
	return Review{}, false
}

// Restore puts a Review taken with Take back (same id and owner, idle timer
// renewed, counted against MaxUserReviews) after a failed Confirm, so the User
// can retry. The oldest Review is dropped past MaxUserReviews.
func (s *Sessions) Restore(rv Review) {
	s.mu.Lock()
	defer s.mu.Unlock()
	list := append(s.live(rv.UserID), &entry{review: rv, lastSeen: s.clk.Now()})
	if over := len(list) - MaxUserReviews; over > 0 {
		list = list[over:]
	}
	s.byUser[rv.UserID] = list
}

// Close drops a Review (Confirm and DELETE). Closing an unknown id is a no-op.
func (s *Sessions) Close(userID int64, id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	list := s.live(userID)
	for i, e := range list {
		if e.review.ID == id {
			s.byUser[userID] = append(list[:i:i], list[i+1:]...)
			return
		}
	}
	s.byUser[userID] = list
}

// live returns the User's unexpired entries, oldest first, and stores that list.
func (s *Sessions) live(userID int64) []*entry {
	now := s.clk.Now()
	var out []*entry
	for _, e := range s.byUser[userID] {
		if now.Sub(e.lastSeen) <= SessionTTL {
			out = append(out, e)
		}
	}
	if len(out) == 0 {
		delete(s.byUser, userID)
	} else {
		s.byUser[userID] = out
	}
	return out
}

func newReviewID() string {
	b := make([]byte, 16) // 128 bits
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand failed: " + err.Error())
	}
	return hex.EncodeToString(b)
}
