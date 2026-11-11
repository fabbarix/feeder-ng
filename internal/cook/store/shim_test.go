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

// The cook scope shim (crs-plan §2.2, "Cook scope shim", team A, removed by C3).
//
// Migration 1400 rewrites every stored Planned Meal scope to meal:<date>/<slot>/<course>, but the old SPA and
// the current cook.MealScope callers still use meal:<date>/<slot>. Until C3 the store maps both ways for the
// main Course: on write and on every lookup a two-part scope means ".../<main Course id>"; on read a main-Course
// scope is written out two-part (the old SPA compares scopes by string equality). Other Courses are three-part
// both ways.

type shimFx struct {
	st         *store.Store
	db         *sql.DB
	main, side int64
}

func newShim(t *testing.T) shimFx {
	t.Helper()
	d := cooktest.NewDB(t)
	f := shimFx{st: store.New(d), db: d}
	for key, dst := range map[string]*int64{"main": &f.main, "side": &f.side} {
		if err := d.QueryRow(`SELECT id FROM courses WHERE name_key = ?`, key).Scan(dst); err != nil {
			t.Fatal(err)
		}
	}
	return f
}

func (f shimFx) rawScopes(t *testing.T, table string) []string {
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

func (f shimFx) threePart(date string, slot, course int64) cook.Scope {
	return cook.Scope(fmt.Sprintf("meal:%s/%d/%d", date, slot, course))
}

func TestATwoPartWriteLandsOnTheMainCourseAndReadsBackTwoPart(t *testing.T) {
	f := newShim(t)
	two := cook.MealScope("2026-11-09", 3, 0)
	got, err := f.st.InsertTimer(ctx, stepTimer(t, two, 2, 600))
	if err != nil {
		t.Fatal(err)
	}
	if want := string(f.threePart("2026-11-09", 3, f.main)); len(f.rawScopes(t, "cook_timers")) != 1 || f.rawScopes(t, "cook_timers")[0] != want {
		t.Errorf("stored scope = %v, want %q (a two-part write lands on the main Course)", f.rawScopes(t, "cook_timers"), want)
	}
	if got.Scope != two {
		t.Errorf("InsertTimer returned scope %q, want the two-part form %q", got.Scope, two)
	}
	back, err := f.st.Timer(ctx, got.ID)
	if err != nil || back.Scope != two {
		t.Errorf("Timer() scope = %q, %v; want %q (a main-Course scope reads back two-part)", back.Scope, err, two)
	}
}

func TestATwoPartLookupFindsTheMainCourseWhicheverFormWroteIt(t *testing.T) {
	f := newShim(t)
	two := cook.MealScope("2026-11-09", 3, 0)
	three := f.threePart("2026-11-09", 3, f.main)
	if _, err := f.st.InsertTimer(ctx, stepTimer(t, three, 4, 300)); err != nil { // written by a three-part caller
		t.Fatal(err)
	}
	for _, scope := range []cook.Scope{two, three} {
		ts, err := f.st.Timers(ctx, scope)
		if err != nil || len(ts) != 1 || ts[0].Scope != two {
			t.Errorf("Timers(%q) = %+v, %v; want the one timer, scope %q", scope, ts, err, two)
		}
		tm, ok, err := f.st.StepTimer(ctx, scope, 4)
		if err != nil || !ok || tm.Scope != two {
			t.Errorf("StepTimer(%q, 4) = %+v, %v, %v", scope, tm, ok, err)
		}
	}
	// One timer per (scope, Step) holds across the two forms.
	if _, err := f.st.InsertTimer(ctx, stepTimer(t, two, 4, 300)); !errors.Is(err, store.ErrDuplicateStep) {
		t.Errorf("a two-part insert of a Step that has a three-part timer: %v, want ErrDuplicateStep", err)
	}
	if _, err := f.st.InsertTimer(ctx, stepTimer(t, three, 4, 300)); !errors.Is(err, store.ErrDuplicateStep) {
		t.Errorf("a three-part repeat: %v, want ErrDuplicateStep", err)
	}
	all, _ := f.st.Timers(ctx, "")
	if len(all) != 1 || all[0].Scope != two {
		t.Errorf("Timers(\"\") = %+v, want the timer with its two-part scope", all)
	}
}

func TestAnotherCoursesScopeStaysThreePartBothWays(t *testing.T) {
	f := newShim(t)
	side := f.threePart("2026-11-09", 3, f.side)
	mainTwo := cook.MealScope("2026-11-09", 3, 0)
	a, err := f.st.InsertTimer(ctx, stepTimer(t, side, 1, 60))
	if err != nil || a.Scope != side {
		t.Fatalf("Side insert = %+v, %v; want scope %q", a, err, side)
	}
	if raw := f.rawScopes(t, "cook_timers"); len(raw) != 1 || raw[0] != string(side) {
		t.Errorf("stored = %v, want %q untouched", raw, side)
	}
	// The Main and the Side of one slot are separate scopes: the same Step number can be timed in both.
	if _, err := f.st.InsertTimer(ctx, stepTimer(t, mainTwo, 1, 60)); err != nil {
		t.Errorf("same Step in the Main Course: %v", err)
	}
	ts, _ := f.st.Timers(ctx, side)
	if len(ts) != 1 || ts[0].Scope != side {
		t.Errorf("Timers(Side) = %+v", ts)
	}
	ts, _ = f.st.Timers(ctx, mainTwo)
	if len(ts) != 1 || ts[0].Scope != mainTwo {
		t.Errorf("Timers(Main, two-part) = %+v, want only the main timer", ts)
	}
	if _, ok, _ := f.st.StepTimer(ctx, mainTwo, 1); !ok {
		t.Error("StepTimer(main) found nothing")
	}
	got, ok, _ := f.st.StepTimer(ctx, side, 1)
	if !ok || got.Scope != side {
		t.Errorf("StepTimer(Side) = %+v, %v", got, ok)
	}
}

func TestRecipeScopesAndFreeTimersAreNotTouched(t *testing.T) {
	f := newShim(t)
	if _, err := f.st.InsertTimer(ctx, stepTimer(t, cook.RecipeScope(5), 1, 60)); err != nil {
		t.Fatal(err)
	}
	free, _ := cook.StartTimer(now, "", nil, "Eggs", 180)
	if _, err := f.st.InsertTimer(ctx, free); err != nil {
		t.Fatal(err)
	}
	raw := f.rawScopes(t, "cook_timers")
	if len(raw) != 2 || raw[0] != "recipe:5" || raw[1] != "" {
		t.Errorf("stored scopes = %q, want recipe:5 and NULL", raw)
	}
	all, _ := f.st.Timers(ctx, "")
	if len(all) != 2 || all[0].Scope != "recipe:5" || all[1].Scope != "" {
		t.Errorf("Timers = %+v", all)
	}
}

func TestMarksMapBothWaysToo(t *testing.T) {
	f := newShim(t)
	two := cook.MealScope("2026-11-09", 3, 0)
	three := f.threePart("2026-11-09", 3, f.main)
	side := f.threePart("2026-11-09", 3, f.side)
	if err := f.st.SetMark(ctx, two, 0, true, now); err != nil {
		t.Fatal(err)
	}
	if raw := f.rawScopes(t, "advance_step_marks"); len(raw) != 1 || raw[0] != string(three) {
		t.Errorf("stored mark scope = %v, want %q", raw, three)
	}
	if err := f.st.SetMark(ctx, three, 1, true, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err := f.st.SetMark(ctx, side, 0, true, now.Add(2*time.Minute)); err != nil {
		t.Fatal(err)
	}
	for _, scope := range []cook.Scope{two, three} {
		got, err := f.st.Marks(ctx, scope)
		if err != nil || len(got) != 2 || got[0].IsZero() || got[1].IsZero() {
			t.Errorf("Marks(%q) = %v, %v; want Steps 0 and 1", scope, got, err)
		}
	}
	if got, _ := f.st.Marks(ctx, side); len(got) != 1 || got[0].IsZero() {
		t.Errorf("Marks(Side) = %v, want just Step 0", got)
	}
	// Marking twice through the other form keeps the first time.
	if err := f.st.SetMark(ctx, three, 0, true, now.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if got, _ := f.st.Marks(ctx, two); !got[0].Equal(now) {
		t.Errorf("Step 0 done_at = %v, want the first mark %v", got[0], now)
	}
	// Unmarking through either form removes the main Course's mark, and only that.
	if err := f.st.SetMark(ctx, two, 1, false, now); err != nil {
		t.Fatal(err)
	}
	if got, _ := f.st.Marks(ctx, three); len(got) != 1 {
		t.Errorf("Marks after unmarking Step 1 = %v", got)
	}
	if err := f.st.SetMark(ctx, three, 0, false, now); err != nil {
		t.Fatal(err)
	}
	if got, _ := f.st.Marks(ctx, two); len(got) != 0 {
		t.Errorf("Marks after unmarking Step 0 = %v", got)
	}
	if got, _ := f.st.Marks(ctx, side); len(got) != 1 {
		t.Errorf("unmarking the Main touched the Side: %v", got)
	}
}

// What 1400 rewrote is read two-part for the main Course, so running timers and marks of an upgraded Household
// do not vanish from the old SPA's Cook Mode.
func TestScopesRewrittenByMigration1400ReadBackTwoPart(t *testing.T) {
	f := newShim(t)
	f.db.Exec(fmt.Sprintf(`INSERT INTO cook_timers(scope,step,label,duration_seconds,state,started_at,ends_at) VALUES ('meal:2026-11-09/3/%d',2,'Simmer',600,'running','2026-11-09T18:00:00.000Z','2026-11-09T18:10:00.000Z')`, f.main))
	f.db.Exec(fmt.Sprintf(`INSERT INTO advance_step_marks(scope,step,done_at) VALUES ('meal:2026-11-09/3/%d',0,'2026-11-09T10:00:00.000Z')`, f.main))
	two := cook.MealScope("2026-11-09", 3, 0)
	if _, ok, err := f.st.StepTimer(ctx, two, 2); err != nil || !ok {
		t.Errorf("the old SPA's lookup of an upgraded timer: %v, %v", ok, err)
	}
	if got, _ := f.st.Marks(ctx, two); len(got) != 1 {
		t.Errorf("Marks = %v, want the upgraded mark", got)
	}
}

func TestTheShimFollowsTheMainFlag(t *testing.T) {
	f := newShim(t)
	two := cook.MealScope("2026-11-09", 3, 0)
	if _, err := f.st.InsertTimer(ctx, stepTimer(t, two, 1, 60)); err != nil { // on the old main Course
		t.Fatal(err)
	}
	f.db.Exec(`UPDATE courses SET is_main = 0 WHERE is_main = 1`)
	f.db.Exec(`UPDATE courses SET is_main = 1 WHERE id = ?`, f.side)
	// The old main Course is an ordinary Course now: its scope is three-part both ways; two-part is the new main (Side).
	if ts, _ := f.st.Timers(ctx, f.threePart("2026-11-09", 3, f.main)); len(ts) != 1 || ts[0].Scope != f.threePart("2026-11-09", 3, f.main) {
		t.Errorf("the former main Course's timer = %+v, want it three-part", ts)
	}
	if ts, _ := f.st.Timers(ctx, two); len(ts) != 0 {
		t.Errorf("a two-part lookup now means the new main Course and finds %+v", ts)
	}
}
