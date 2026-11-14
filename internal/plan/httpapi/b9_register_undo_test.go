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

// newApp builds an app on a fresh database and waits for its start-up replan; the caller closes it.
func newApp(t *testing.T) (*app.App, *sql.DB) {
	t.Helper()
	dir := t.TempDir()
	d, err := db.Open(filepath.Join(dir, "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	a, err := app.New(config.Config{AdminEmail: testkit.AdminEmail, DataDir: dir}, d, clock.NewFake(testkit.StartTime),
		fstest.MapFS{"index.html": {Data: []byte("<!doctype html>")}})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := a.WaitIdle(ctx); err != nil {
		t.Fatal(err)
	}
	return a, d
}

func TestAModuleThatRegistersTwiceUnderOneNameIsCapturedOnceByItsLastParticipant(t *testing.T) {
	env := testkit.Start(t)
	first, second := &fakeUndo{}, &fakeUndo{}
	planhttp.RegisterUndoFor(env.DB, "b9-24-test-twice", first)
	planhttp.RegisterUndoFor(env.DB, "b9-24-test-twice", second)
	applyOnce(t, env.DB)
	if first.count() != 0 || second.count() != 1 {
		t.Errorf("captures = %d and %d, want 0 and 1: the second registration replaces the first", first.count(), second.count())
	}
}

func TestAParticipantIsStillCapturedAfterTheAppIsRestartedOnTheSameDatabase(t *testing.T) {
	// testkit Restart builds the new app before it closes the old one: when "away" mounts again, the old Replanner is
	// still the database's, and the new one must get the participant too.
	env := testkit.Start(t)
	fake := &fakeUndo{}
	planhttp.RegisterUndoFor(env.DB, "b9-24-test-restart", fake)
	env.Restart(t)
	applyOnce(t, env.DB)
	if fake.count() != 1 {
		t.Errorf("captures after Restart = %d, want 1", fake.count())
	}
}

func TestTwoAppsInOneProcessKeepTheirOwnParticipantsAndAClosedAppIsForgotten(t *testing.T) {
	a1, d1 := newApp(t)
	a2, d2 := newApp(t)
	defer a2.Close()
	one, two := &fakeUndo{}, &fakeUndo{}
	planhttp.RegisterUndoFor(d1, "b9-24-test-apps", one)
	planhttp.RegisterUndoFor(d2, "b9-24-test-apps", two)
	applyOnce(t, d2)
	if one.count() != 0 || two.count() != 1 {
		t.Errorf("captures = %d (app 1) and %d (app 2), want 0 and 1", one.count(), two.count())
	}
	a1.Close()
	if planhttp.ReplannerFor(d1) != nil {
		t.Error("the Replanner of a closed app is still registered")
	}
	if planhttp.ReplannerFor(d2) == nil {
		t.Error("closing one app forgot the other's Replanner")
	}
}

func TestATokenWithAParticipantThatIsNotRegisteredIsRefusedAndChangesNothing(t *testing.T) {
	env := testkit.Start(t)
	out := applyOnce(t, env.DB)
	var rev int
	if err := env.DB.QueryRow(`SELECT revision FROM plan_state`).Scan(&rev); err != nil {
		t.Fatal(err)
	}
	if _, err := env.DB.Exec(`UPDATE plan_snapshots SET state_json = json_set(state_json, '$.participants', json('{"b9-24-nobody":"x"}'))
		WHERE token = ?`, out.UndoToken); err != nil {
		t.Fatal(err)
	}
	r := env.LoginUser(t).Post("/api/plan/restore", map[string]any{"undoToken": out.UndoToken})
	if r.Status == 200 {
		t.Fatalf("restore = 200 %s, want a refusal: the token names a participant nobody registered", r.Body)
	}
	var after int
	if err := env.DB.QueryRow(`SELECT revision FROM plan_state`).Scan(&after); err != nil {
		t.Fatal(err)
	}
	if after != rev {
		t.Errorf("revision %d → %d: the refused restore wrote", rev, after)
	}
}
