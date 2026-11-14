package httpapi_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/db"
	domain "github.com/fabbarix/feeder-ng/internal/plan"
	planhttp "github.com/fabbarix/feeder-ng/internal/plan/httpapi"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-24: a module registers its undo participant with RegisterUndoFor at its own Mount, whatever the mount order. Modules
// mount in name order ("away" before "planning"), so a participant registered before the planning module mounts must be
// handed to the Replanner when it does; one registered after is registered at once.

// fakeUndo counts its captures and keeps what it restored.
type fakeUndo struct {
	mu       sync.Mutex
	captures int
	restored []string
}

func (f *fakeUndo) Capture(ctx context.Context, tx *sql.Tx) (json.RawMessage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.captures++
	return json.RawMessage(`"state"`), nil
}

func (f *fakeUndo) Restore(ctx context.Context, tx *sql.Tx, captured json.RawMessage) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.restored = append(f.restored, string(captured))
	return nil
}

func (f *fakeUndo) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.captures
}

// applyOnce runs one empty replanning write through the Replanner of d.
func applyOnce(t *testing.T, d *sql.DB) planhttp.Replan {
	t.Helper()
	p := planhttp.ReplannerFor(d)
	if p == nil {
		t.Fatal("ReplannerFor: nil, want the Runner the planning module mounted")
	}
	out, err := p.Apply(httptest.NewRequest("POST", "/", nil), domain.ReasonAttendanceChanged,
		func(ctx context.Context, tx *sql.Tx, st *store.Store) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestAnUndoParticipantRegisteredBeforeThePlanningModuleMountsIsCaptured(t *testing.T) {
	dir := t.TempDir()
	d, err := db.Open(filepath.Join(dir, "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	fake := &fakeUndo{}
	planhttp.RegisterUndoFor(d, "b9-24-test-before", fake) // nothing is mounted on d yet
	if planhttp.ReplannerFor(d) != nil {
		t.Fatal("a Replanner exists before the app is built")
	}
	a, err := app.New(config.Config{AdminEmail: testkit.AdminEmail, DataDir: dir}, d, clock.NewFake(testkit.StartTime),
		fstest.MapFS{"index.html": {Data: []byte("<!doctype html>")}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(a.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := a.WaitIdle(ctx); err != nil {
		t.Fatal(err)
	}
	out := applyOnce(t, d)
	if fake.count() != 1 || out.UndoToken == "" {
		t.Fatalf("captures = %d, token %q: the participant registered before mount was not handed to the Replanner", fake.count(), out.UndoToken)
	}
}

func TestAnUndoParticipantRegisteredAfterThePlanningModuleMountedIsCapturedAndRestored(t *testing.T) {
	env := testkit.Start(t)
	fake := &fakeUndo{}
	planhttp.RegisterUndoFor(env.DB, "b9-24-test-after", fake)
	out := applyOnce(t, env.DB)
	if fake.count() != 1 {
		t.Fatalf("captures = %d, want 1", fake.count())
	}
	if r := env.LoginUser(t).Post("/api/plan/restore", map[string]any{"undoToken": out.UndoToken}); r.Status != 200 {
		t.Fatalf("restore = %d %s", r.Status, r.Body)
	}
	if len(fake.restored) != 1 || fake.restored[0] != `"state"` {
		t.Errorf("restored = %v, want the captured state once", fake.restored)
	}
}
