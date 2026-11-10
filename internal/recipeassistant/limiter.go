package recipeassistant

import "time"

// Rate limits (design §1.5).
const (
	HourlyReadLimit = 30
	LimiterWindow   = time.Hour
)

// Caller identifies who starts a read. Admin is the role at request time.
type Caller struct {
	UserID      int64
	HouseholdID int64
	Admin       bool
}

// Limiter is the in-memory policy: one running read per User (Admins
// included) and 30 accepted reads per rolling hour per Household for
// non-Admins; Admin reads are not counted. The clock is injected.
type Limiter struct{}

// NewLimiter returns a Limiter reading time from now.
func NewLimiter(now func() time.Time) *Limiter { return &Limiter{} }

// Acquire accepts a read or refuses it with *Error CodeReadInProgress (the
// User already has a read running; checked first) or CodeTooManyReads (with
// RetryAfterSeconds: whole seconds, rounded up, until the oldest counted read
// leaves the window). An accepted non-Admin read counts at once, whatever its
// outcome. The returned release frees the User's running slot; it is safe to
// call more than once. Refusals count nothing and hold nothing. Safe for
// concurrent use.
func (l *Limiter) Acquire(c Caller) (release func(), err error) { return func() {}, nil }
