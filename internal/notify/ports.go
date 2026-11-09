package notify

import (
	"context"
	"time"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// FactSource gathers the facts around now (meals from a day back to two days
// ahead, available Leftovers, Stock Lots with a go-off date).
type FactSource interface {
	Facts(ctx context.Context, now time.Time) (Facts, error)
}

// SettingsSource returns the household quiet hours and time zone.
type SettingsSource interface {
	Quiet(ctx context.Context) (household.QuietHours, *time.Location, error)
}

// Subscriptions lists and removes push devices.
type Subscriptions interface {
	// Targets returns every device that opted in to t.
	Targets(ctx context.Context, t Type) ([]Target, error)
	// Remove deletes a device (it is gone).
	Remove(ctx context.Context, id int64) error
}

// SentLog remembers what each device already received.
type SentLog interface {
	// Claim records key for the device and reports true only the first time.
	Claim(ctx context.Context, subscriptionID int64, key string) (bool, error)
	// Release forgets a claim so a failed send is retried on the next tick.
	Release(ctx context.Context, subscriptionID int64, key string) error
}

// Sender delivers one payload to one device. It returns ErrGone when the
// subscription no longer exists.
type Sender interface {
	Send(ctx context.Context, to Target, p Payload) error
}
