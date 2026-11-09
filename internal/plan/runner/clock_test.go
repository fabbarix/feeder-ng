package runner_test

import (
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
)

// Clock_ wraps clock.Fake so tests can move time by hours and name moments.
type Clock_ struct{ *clock.Fake }

func newClock(t time.Time) *Clock_ { return &Clock_{Fake: clock.NewFake(t)} }

func (c *Clock_) Now() time.Time { return c.Fake.Now() }
