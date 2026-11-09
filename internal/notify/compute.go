package notify

import (
	"time"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// Compute turns facts into the notifications they imply (spec §12), in the
// household time zone loc. Order is by At, then Key. Not implemented yet.
func Compute(f Facts, loc *time.Location) []Candidate {
	return nil
}

// DeferQuiet returns at when its household-local time is outside the quiet
// window, otherwise the end of the window that contains it (start inclusive, end
// exclusive, wrapping midnight). Not implemented yet.
func DeferQuiet(at time.Time, q household.QuietHours, loc *time.Location) time.Time {
	return at
}

// DueNow returns the candidates to send at now: their send time (deferred by
// quiet hours, except TimerFinished) has arrived and is less than Grace old.
// Sorted by SendAt, then Key. Not implemented yet.
func DueNow(cands []Candidate, now time.Time, q household.QuietHours, loc *time.Location) []Due {
	return nil
}
