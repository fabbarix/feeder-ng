package recipeassistant

import (
	"math"
	"sync"
	"time"
)

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
type Limiter struct {
	now      func() time.Time
	mu       sync.Mutex
	running  map[int64]uint64 // by User; the value identifies the acquisition
	seq      uint64
	accepted map[int64][]time.Time
}

// NewLimiter returns a Limiter reading time from now.
func NewLimiter(now func() time.Time) *Limiter {
	return &Limiter{now: now, running: map[int64]uint64{}, accepted: map[int64][]time.Time{}}
}

// Check reports what Acquire would report (*Error CodeReadInProgress, checked
// first, or CodeTooManyReads with RetryAfterSeconds, Admins exempt from the
// hourly limit) without holding a slot or counting a read; nil when Acquire
// would accept now. The handler calls it before reading the request body
// (design §1.5).
func (l *Limiter) Check(c Caller) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.refusal(c)
}

// refusal is the shared policy; the caller holds l.mu. It prunes expired
// counts, which changes nothing observable.
func (l *Limiter) refusal(c Caller) error {
	if _, busy := l.running[c.UserID]; busy {
		return &Error{Code: CodeReadInProgress}
	}
	if c.Admin {
		return nil
	}
	now := l.now()
	kept := l.accepted[c.HouseholdID][:0]
	for _, t := range l.accepted[c.HouseholdID] {
		if now.Sub(t) < LimiterWindow {
			kept = append(kept, t)
		}
	}
	l.accepted[c.HouseholdID] = kept
	if len(kept) >= HourlyReadLimit {
		wait := kept[0].Add(LimiterWindow).Sub(now)
		return &Error{Code: CodeTooManyReads, RetryAfterSeconds: int(math.Ceil(wait.Seconds()))}
	}
	return nil
}

// Remaining reports how many more reads the Caller's Household may start in the rolling hour and, when some
// are counted, the whole seconds (rounded up) until the oldest leaves the window (0 when none are counted).
// Admins are exempt from the hourly limit, so callers do not show it for them.
func (l *Limiter) Remaining(c Caller) (remaining, resetsInSeconds int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	kept := l.accepted[c.HouseholdID][:0]
	for _, t := range l.accepted[c.HouseholdID] {
		if now.Sub(t) < LimiterWindow {
			kept = append(kept, t)
		}
	}
	l.accepted[c.HouseholdID] = kept
	remaining = HourlyReadLimit - len(kept)
	if len(kept) > 0 {
		resetsInSeconds = int(math.Ceil(kept[0].Add(LimiterWindow).Sub(now).Seconds()))
	}
	return remaining, resetsInSeconds
}

// Acquire accepts a read or refuses it with *Error CodeReadInProgress (the
// User already has a read running; checked first) or CodeTooManyReads (with
// RetryAfterSeconds: whole seconds, rounded up, until the oldest counted read
// leaves the window). An accepted non-Admin read counts at once, whatever its
// outcome. The returned release frees the User's running slot; it is safe to
// call more than once. Refusals count nothing and hold nothing. Safe for
// concurrent use.
func (l *Limiter) Acquire(c Caller) (release func(), err error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if err := l.refusal(c); err != nil {
		return nil, err
	}
	if !c.Admin {
		l.accepted[c.HouseholdID] = append(l.accepted[c.HouseholdID], l.now())
	}
	l.seq++
	token := l.seq
	l.running[c.UserID] = token
	return func() {
		l.mu.Lock()
		defer l.mu.Unlock()
		if l.running[c.UserID] == token {
			delete(l.running, c.UserID)
		}
	}, nil
}
