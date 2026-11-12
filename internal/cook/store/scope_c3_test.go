package store_test

import (
	"database/sql"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/cook/cooktest"
	"github.com/fabbarix/feeder-ng/internal/cook/store"
)

// Team C3 (docs/dev/design/crs-c3.md §2): the cook scope shim is gone. The store keeps a scope exactly as it is
// given and gives it back exactly as stored; it no longer reads the courses table. The main Course's Planned Meal
// scope is three-part like every other Course's (migration 1400 already rewrote what was stored).

type scopeFx struct {
	st         *store.Store
	db         *sql.DB
	main, side int64
}

func newScopeFx(t *testing.T) scopeFx {
	t.Helper()
	d := cooktest.NewDB(t)
	f := scopeFx{st: store.New(d), db: d}
	for key, dst := range map[string]*int64{"main": &f.main, "side": &f.side} {
		if err := d.QueryRow(`SELECT id FROM courses WHERE name_key = ?`, key).Scan(dst); err != nil {
			t.Fatal(err)
		}
	}
	return f
}

func (f scopeFx) raw(t *testing.T, table string) []string {
	t.Helper()
	rows, err := f.db.Query(`SELECT scope FROM ` + table + ` ORDER BY rowid`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s sql.NullString
		rows.Scan(&s)
		out = append(out, s.String)
	}
	return out
}

func (f scopeFx) scope(date string, slot, course int64) cook.Scope {
	return cook.Scope(fmt.Sprintf("meal:%s/%d/%d", date, slot, course))
}

// The main Course reads back three-part (the shim wrote it two-part for the old SPA).
func TestTheMainCoursesScopeReadsBackThreePart(t *testing.T) {
	f := newScopeFx(t)
	three := f.scope("2026-11-09", 3, f.main)
	got, err := f.st.InsertTimer(ctx, stepTimer(t, three, 2, 600))
	if err != nil || got.Scope != three {
		t.Fatalf("InsertTimer = %+v, %v; want scope %q", got, err, three)
	}
	back, err := f.st.Timer(ctx, got.ID)
	if err != nil || back.Scope != three {
		t.Errorf("Timer() scope = %q, %v; want %q", back.Scope, err, three)
	}
	ts, err := f.st.Timers(ctx, three)
	if err != nil || len(ts) != 1 || ts[0].Scope != three {
		t.Errorf("Timers(three-part) = %+v, %v", ts, err)
	}
	all, _ := f.st.Timers(ctx, "")
	if len(all) != 1 || all[0].Scope != three {
		t.Errorf("Timers(\"\") = %+v, want the timer with its three-part scope", all)
	}
	if _, ok, _ := f.st.StepTimer(ctx, three, 2); !ok {
		t.Error("StepTimer found nothing")
	}
}

// What migration 1400 rewrote is three-part and stays so: running timers and marks of an upgraded Household show
// in the new SPA under the scopes the server names.
func TestScopesRewrittenByMigration1400ReadBackAsStored(t *testing.T) {
	f := newScopeFx(t)
	three := f.scope("2026-11-09", 3, f.main)
	f.db.Exec(fmt.Sprintf(`INSERT INTO cook_timers(scope,step,label,duration_seconds,state,started_at,ends_at) VALUES ('%s',2,'Simmer',600,'running','2026-11-09T18:00:00.000Z','2026-11-09T18:10:00.000Z')`, three))
	f.db.Exec(fmt.Sprintf(`INSERT INTO advance_step_marks(scope,step,done_at) VALUES ('%s',0,'2026-11-09T10:00:00.000Z')`, three))
	tm, ok, err := f.st.StepTimer(ctx, three, 2)
	if err != nil || !ok || tm.Scope != three {
		t.Errorf("upgraded timer = %+v, %v, %v; want scope %q", tm, ok, err, three)
	}
	if got, _ := f.st.Marks(ctx, three); len(got) != 1 {
		t.Errorf("Marks = %v, want the upgraded mark", got)
	}
}

// No mapping in either direction: a two-part scope is just another string (the HTTP layer and the service refuse it
// before it gets here), and it is never the main Course.
func TestAScopeIsStoredAndFoundExactlyAsGiven(t *testing.T) {
	f := newScopeFx(t)
	two := cook.Scope("meal:2026-11-09/3")
	three := f.scope("2026-11-09", 3, f.main)
	if _, err := f.st.InsertTimer(ctx, stepTimer(t, two, 1, 60)); err != nil {
		t.Fatal(err)
	}
	if raw := f.raw(t, "cook_timers"); len(raw) != 1 || raw[0] != string(two) {
		t.Errorf("stored = %v, want %q untouched (no mapping to the main Course)", raw, two)
	}
	if ts, _ := f.st.Timers(ctx, three); len(ts) != 0 {
		t.Errorf("Timers(three-part main) found %+v: the two-part scope must not mean the main Course", ts)
	}
	if _, ok, _ := f.st.StepTimer(ctx, three, 1); ok {
		t.Error("StepTimer(three-part main) found the two-part timer")
	}
	// The same Step in the three-part scope is a different timer, not a duplicate.
	if _, err := f.st.InsertTimer(ctx, stepTimer(t, three, 1, 60)); errors.Is(err, store.ErrDuplicateStep) || err != nil {
		t.Errorf("same Step under the three-part scope: %v, want a separate timer", err)
	}
}

func TestMarksKeepTheirScopeExactly(t *testing.T) {
	f := newScopeFx(t)
	two := cook.Scope("meal:2026-11-09/3")
	three := f.scope("2026-11-09", 3, f.main)
	side := f.scope("2026-11-09", 3, f.side)
	if err := f.st.SetMark(ctx, three, 0, true, now); err != nil {
		t.Fatal(err)
	}
	if err := f.st.SetMark(ctx, side, 0, true, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if raw := f.raw(t, "advance_step_marks"); len(raw) != 2 || raw[0] != string(three) || raw[1] != string(side) {
		t.Errorf("stored mark scopes = %v", raw)
	}
	if got, _ := f.st.Marks(ctx, two); len(got) != 0 {
		t.Errorf("Marks(two-part) = %v, want none: it is not the main Course", got)
	}
	if got, _ := f.st.Marks(ctx, three); len(got) != 1 {
		t.Errorf("Marks(main) = %v", got)
	}
	if got, _ := f.st.Marks(ctx, side); len(got) != 1 {
		t.Errorf("Marks(side) = %v", got)
	}
}

func TestMakeMainDoesNotChangeAScope(t *testing.T) {
	f := newScopeFx(t)
	main := f.scope("2026-11-09", 3, f.main)
	if _, err := f.st.InsertTimer(ctx, stepTimer(t, main, 1, 60)); err != nil {
		t.Fatal(err)
	}
	f.db.Exec(`UPDATE courses SET is_main = 0 WHERE is_main = 1`)
	f.db.Exec(`UPDATE courses SET is_main = 1 WHERE id = ?`, f.side)
	ts, _ := f.st.Timers(ctx, main)
	if len(ts) != 1 || ts[0].Scope != main {
		t.Errorf("after Make main the timer is %+v, want it still under %q", ts, main)
	}
}

func TestRecipeScopesAndFreeTimersAreNotTouched(t *testing.T) {
	f := newScopeFx(t)
	if _, err := f.st.InsertTimer(ctx, stepTimer(t, cook.RecipeScope(5), 1, 60)); err != nil {
		t.Fatal(err)
	}
	free, _ := cook.StartTimer(now, "", nil, "Eggs", 180)
	if _, err := f.st.InsertTimer(ctx, free); err != nil {
		t.Fatal(err)
	}
	raw := f.raw(t, "cook_timers")
	if len(raw) != 2 || raw[0] != "recipe:5" || raw[1] != "" {
		t.Errorf("stored scopes = %q, want recipe:5 and NULL", raw)
	}
}
