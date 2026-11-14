package httpapi_test

import (
	"context"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// ctxWait waits for the planner to finish what a write started.
func ctxWait(t *testing.T, env *testkit.Env) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := env.App.WaitIdle(ctx); err != nil {
		t.Fatalf("the planner did not settle: %v", err)
	}
}
