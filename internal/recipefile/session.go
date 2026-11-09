package recipefile

import (
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

// Sessions keeps Reviews in memory (a restart drops them; the user uploads
// again). Safe for concurrent use. Time comes from the injected clock.
type Sessions struct{}

// NewSessions returns an empty store.
func NewSessions(clk clock.Clock) *Sessions { panic("not implemented") }

// Open stores a Review for the User under a new unguessable id (>= 128 bits of
// randomness, hex) and returns it. The oldest of the User's Reviews is dropped
// past MaxUserReviews.
func (s *Sessions) Open(userID int64, f File, images ImageSet) Review { panic("not implemented") }

// Get returns the Review if it exists, belongs to the User and is not expired;
// a successful Get renews the idle timer.
func (s *Sessions) Get(userID int64, id string) (Review, bool) { panic("not implemented") }

// Close drops a Review (Confirm and DELETE). Closing an unknown id is a no-op.
func (s *Sessions) Close(userID int64, id string) { panic("not implemented") }
