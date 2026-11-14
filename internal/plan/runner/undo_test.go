package runner_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
)

// B9-11 (PC-01, SAFE-07): every replanning write says what it changed beyond its own target and issues an undo token;
// Restore writes the before-snapshot back exactly. The household is the fake of fakes_test.go. Tests that need a week use
// a 7-day Planning Horizon: Mon 9 to Sun 15 November 2026, one Dinner at 19:00 a day, now Monday 12:00.

// weekEnv is a planned week whose Recipes carry names. With chicken (yield 4) pinned on Monday, Tuesday is served from
// its Leftover and Wed..Sun are fresh meals of other Recipes.
func weekEnv(t *testing.T) *env {
	t.Helper()
	e := newEnv(t)
	e.src.settings.HorizonDays = 7
	byID := map[int64]string{}
	for name, id := range e.rec {
		byID[id] = name
	}
	for i := range e.src.recipes {
		e.src.recipes[i].Name = byID[int64(e.src.recipes[i].ID)]
	}
	e.mustPlan()
	return e
}

// chickenWeek is weekEnv with the chicken Monday: Monday pinned chicken, Tuesday its Leftover.
func chickenWeek(t *testing.T) *env {
	t.Helper()
	e := weekEnv(t)
	if _, err := e.r.SetCourseMeal(ctx, e.key(9), e.rec["chicken"], nil); err != nil {
		t.Fatal(err)
	}
	if m := e.meal(10); m.Fresh() || m.RecipeID != e.rec["chicken"] {
		t.Fatalf("set-up: Tuesday = %+v, want served from the chicken Leftover", m)
	}
	e.clk.Advance(time.Minute) // so a row written later has another updated_at than the rows before
	return e
}

// rowsOf runs a query and returns every row as one string of its columns, in query order.
func (e *env) rowsOf(q string) []string {
	e.t.Helper()
	r, err := e.db.Query(q)
	if err != nil {
		e.t.Fatalf("%s: %v", q, err)
	}
	defer r.Close()
	cols, _ := r.Columns()
	var out []string
	for r.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := r.Scan(ptrs...); err != nil {
			e.t.Fatal(err)
		}
		var parts []string
		for i, v := range vals {
			if b, ok := v.([]byte); ok {
				v = string(b)
			}
			parts = append(parts, fmt.Sprintf("%s=%v", cols[i], v))
		}
		out = append(out, strings.Join(parts, "|"))
	}
	return out
}

// planState is every table a write can change, every column, rows ordered by their cell.
func (e *env) planState() []string {
	out := e.rowsOf(`SELECT * FROM planned_meals ORDER BY date, meal_slot_id, course_id`)
	out = append(out, e.rowsOf(`SELECT * FROM plan_unfilled ORDER BY date, meal_slot_id, course_id`)...)
	out = append(out, e.rowsOf(`SELECT * FROM planned_meal_bought ORDER BY planned_meal_id, ingredient_id, lot_id`)...)
	out = append(out, e.rowsOf(`SELECT generation FROM plan_state WHERE id = 1`)...)
	return out
}

func (e *env) revision() int64 {
	e.t.Helper()
	var n int64
	if err := e.db.QueryRow(`SELECT revision FROM plan_state WHERE id = 1`).Scan(&n); err != nil {
		e.t.Fatalf("plan_state.revision: %v", err)
	}
	return n
}

// shape is what a cell holds as far as "what changed" is concerned.
func (e *env) shape() map[string]string {
	e.t.Helper()
	out := map[string]string{}
	for _, m := range e.planMeals() {
		out[m.Key.Date] = fmt.Sprintf("%d/leftover=%v", m.RecipeID, m.From != nil)
	}
	return out
}

func changeDates(cs []plan.CellChange) []string {
	var out []string
	for _, c := range cs {
		out = append(out, c.Date)
	}
	return out
}

func TestSwapReportsTheCellsItChangedBeyondItsTarget(t *testing.T) {
	e := chickenWeek(t)
	c, out := runner.WithOutcome(ctx)
	if _, err := e.r.SetCourseMeal(c, e.key(9), e.rec["pasta"], nil); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(changeDates(out.Changes), []string{"2026-11-10"}) {
		t.Fatalf("changed cells = %v, want only Tuesday, whose Leftover is gone (and not Monday, the target)", changeDates(out.Changes))
	}
	ch := out.Changes[0]
	if ch.Key() != e.key(10) {
		t.Errorf("change key = %+v, want Tuesday's Dinner main Course %+v", ch.Key(), e.key(10))
	}
	if ch.Before == nil || ch.Before.RecipeID != e.rec["chicken"] || ch.Before.RecipeName != "chicken" || !ch.Before.ServedFromLeftover {
		t.Errorf("before = %+v, want the chicken Leftover, named", ch.Before)
	}
	now := e.meal(10)
	if ch.After == nil || ch.After.RecipeID != now.RecipeID || ch.After.ServedFromLeftover != (now.From != nil) {
		t.Errorf("after = %+v, want what Tuesday holds now (%+v)", ch.After, now)
	}
	if ch.After != nil && ch.After.RecipeID == ch.Before.RecipeID && ch.After.ServedFromLeftover == ch.Before.ServedFromLeftover {
		t.Errorf("after = before = %+v: not a change", ch.After)
	}
	if ch.After != nil && ch.After.RecipeName == "" {
		t.Errorf("after has no Recipe name: %+v", ch.After)
	}
}

func TestAValidLaterMealIsKeptAfterASwap(t *testing.T) {
	e := chickenWeek(t)
	before := e.shape()
	if _, err := e.r.SetCourseMeal(ctx, e.key(9), e.rec["pasta"], nil); err != nil {
		t.Fatal(err)
	}
	after := e.shape()
	for _, d := range []string{"2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"} {
		if after[d] != before[d] {
			t.Errorf("%s was %s and is %s after a Swap of Monday: a later meal that is still valid must stay", d, before[d], after[d])
		}
	}
}

func TestASwapWithNoOtherChangeReturnsAnEmptyListAndAToken(t *testing.T) {
	e := weekEnv(t)
	unused := ""
	for _, name := range simpleRecipes { // Sunday is the last day: nothing follows it, so nothing else can change
		if e.rec[name] != e.meal(15).RecipeID {
			unused = name
		}
	}
	c, out := runner.WithOutcome(ctx)
	if _, err := e.r.SetCourseMeal(c, e.key(15), e.rec[unused], nil); err != nil {
		t.Fatal(err)
	}
	if out.Changes == nil || len(out.Changes) != 0 {
		t.Errorf("changes = %#v, want an empty list that is not nil (the JSON says [] and not null)", out.Changes)
	}
	if out.UndoToken == "" {
		t.Error("no undo token: the Swap changed the target, so it can be undone")
	}
}

func TestEveryReplanningWriteIssuesAnUndoTokenAndAutomaticRunsAndMarksDoNot(t *testing.T) {
	writes := []struct {
		name string
		want bool
		do   func(c context.Context, e *env) error
	}{
		{"Choose or Swap", true, func(c context.Context, e *env) error {
			_, err := e.r.SetCourseMeal(c, e.key(11), e.rec["curry"], nil)
			return err
		}},
		{"Pin (confirm)", true, func(c context.Context, e *env) error { _, err := e.r.Confirm(c, e.key(12)); return err }},
		{"Unpin", true, func(c context.Context, e *env) error { _, err := e.r.Unpin(c, e.key(9)); return err }},
		{"Regenerate", true, func(c context.Context, e *env) error { _, err := e.r.Regenerate(c); return err }},
		{"Apply (Who's eating, a Meal Slot's date, Away)", true, func(c context.Context, e *env) error {
			_, err := e.r.Apply(c, plan.ReasonAttendanceChanged, func(ctx context.Context, tx *sql.Tx, st *store.Store) error {
				return st.SetPinned(ctx, e.key(13), true)
			})
			return err
		}},
		{"the nightly run", false, func(c context.Context, e *env) error { _, err := e.r.Plan(c, plan.ReasonNightly); return err }},
		{"Cooked", false, func(c context.Context, e *env) error { _, err := e.r.Cooked(c, e.key(9), nil); return err }},
		{"Not cooked", false, func(c context.Context, e *env) error { _, err := e.r.NotCooked(c, e.key(9)); return err }},
	}
	for _, w := range writes {
		t.Run(w.name, func(t *testing.T) {
			e := chickenWeek(t)
			c, out := runner.WithOutcome(ctx)
			if err := w.do(c, e); err != nil {
				t.Fatal(err)
			}
			if got := out.UndoToken != ""; got != w.want {
				t.Errorf("undo token %q: issued = %v, want %v", out.UndoToken, got, w.want)
			}
			if out.Changes == nil {
				t.Error("Changes is nil after a write; it must be an empty list at least")
			}
		})
	}
}

func TestTwoTokensAreNeverTheSame(t *testing.T) {
	e := weekEnv(t)
	seen := map[string]bool{}
	for i := 0; i < 5; i++ {
		c, out := runner.WithOutcome(ctx)
		name := []string{"curry", "pizza"}[i%2]
		if _, err := e.r.SetCourseMeal(c, e.key(14), e.rec[name], nil); err != nil {
			t.Fatal(err)
		}
		if out.UndoToken == "" || seen[out.UndoToken] {
			t.Fatalf("token %q is empty or was issued before", out.UndoToken)
		}
		if len(out.UndoToken) < 16 {
			t.Fatalf("token %q is short enough to guess", out.UndoToken)
		}
		seen[out.UndoToken] = true
	}
}

func TestRegenerateReportsEveryCellItChangedAndCanBeUndone(t *testing.T) {
	e := weekEnv(t)
	before := e.shape()
	c, out := runner.WithOutcome(ctx)
	if _, err := e.r.Regenerate(c); err != nil {
		t.Fatal(err)
	}
	after := e.shape()
	var want []string
	for d := 9; d <= 15; d++ {
		date := fmt.Sprintf("2026-11-%02d", d)
		if before[date] != after[date] {
			want = append(want, date)
		}
	}
	if len(want) == 0 {
		t.Fatal("set-up: Regenerate changed nothing")
	}
	if !reflect.DeepEqual(changeDates(out.Changes), want) {
		t.Errorf("changed cells = %v, want %v (Regenerate has no target: every changed cell is listed)", changeDates(out.Changes), want)
	}
	if out.UndoToken == "" {
		t.Fatal("no undo token")
	}
	if _, err := e.r.Restore(ctx, out.UndoToken); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(e.shape(), before) {
		t.Errorf("after Undo the plan is %v, want %v", e.shape(), before)
	}
}

func TestARegenerateThatChangesNothingIssuesNoToken(t *testing.T) {
	e := weekEnv(t)
	for d := 9; d <= 15; d++ {
		if _, err := e.r.Confirm(ctx, e.key(d)); err != nil { // everything Pinned: Regenerate leaves it all
			t.Fatal(err)
		}
	}
	rev := e.revision()
	c, out := runner.WithOutcome(ctx)
	if _, err := e.r.Regenerate(c); err != nil {
		t.Fatal(err)
	}
	if out.UndoToken != "" || len(out.Changes) != 0 {
		t.Errorf("outcome = %+v, want no changes and no token: there is nothing to undo", out)
	}
	if e.revision() != rev {
		t.Errorf("revision %d -> %d: a write that changed no row must not bump it", rev, e.revision())
	}
}

func TestRestoreWithAFreshTokenWritesBackTheSnapshotExactly(t *testing.T) {
	e := chickenWeek(t)
	before := e.planState()
	c, out := runner.WithOutcome(ctx)
	if _, err := e.r.SetCourseMeal(c, e.key(9), e.rec["pasta"], nil); err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(e.planState(), before) {
		t.Fatal("set-up: the Swap changed nothing")
	}
	e.clk.Advance(time.Hour)
	res, err := e.r.Restore(ctx, out.UndoToken)
	if err != nil {
		t.Fatal(err)
	}
	if got := e.planState(); !reflect.DeepEqual(got, before) {
		t.Errorf("rows after Restore differ from the rows before the Swap (every column, ids and timestamps included):\n got  %v\n want %v", got, before)
	}
	if len(res.Changes) == 0 || res.Changes[0].Key() != e.key(10) && res.Changes[0].Key() != e.key(9) {
		t.Errorf("Restore changes = %+v, want the cells it put back", res.Changes)
	}
}

func TestRestoreWritesBackRegenerateAndItsGenerationExactly(t *testing.T) {
	e := weekEnv(t)
	before := e.planState()
	e.clk.Advance(time.Minute)
	c, out := runner.WithOutcome(ctx)
	if _, err := e.r.Regenerate(c); err != nil {
		t.Fatal(err)
	}
	e.clk.Advance(time.Minute)
	if _, err := e.r.Restore(ctx, out.UndoToken); err != nil {
		t.Fatal(err)
	}
	if got := e.planState(); !reflect.DeepEqual(got, before) {
		t.Errorf("rows and generation after Restore differ from before Regenerate:\n got  %v\n want %v", got, before)
	}
}

func TestRestoreBringsBackTheBoughtRecordsOfAMealChosenByHand(t *testing.T) {
	e, bought := boughtEnv(t)
	e.clk.Advance(time.Minute)
	before := e.planState()
	c, out := runner.WithOutcome(ctx)
	if _, err := e.r.SetCourseMeal(c, bought.Key, e.rec["curry"], nil); err != nil {
		t.Fatal(err)
	}
	if e.meal(10).IsBought() {
		t.Fatal("set-up: choosing a Recipe by hand should end Bought")
	}
	if _, err := e.r.Restore(ctx, out.UndoToken); err != nil {
		t.Fatal(err)
	}
	if got := e.planState(); !reflect.DeepEqual(got, before) {
		t.Errorf("rows after Restore differ from before the Swap:\n got  %v\n want %v", got, before)
	}
	if !e.meal(10).IsBought() {
		t.Error("Tuesday is not Bought again after Undo")
	}
}

func TestRestoreDoesNotReplan(t *testing.T) {
	e := chickenWeek(t)
	c, out := runner.WithOutcome(ctx)
	if _, err := e.r.SetCourseMeal(c, e.key(9), e.rec["pasta"], nil); err != nil {
		t.Fatal(err)
	}
	snapshotBefore := e.planState()
	_ = snapshotBefore
	// Nobody eats on Thursday now, without a plan event: a replan after the Restore would drop Thursday's meal.
	e.src.setAttendance(e.slotOn(12), "2026-11-12", []plan.Attendee{})
	if _, err := e.r.Restore(ctx, out.UndoToken); err != nil {
		t.Fatal(err)
	}
	if m := e.meal(12); m.RecipeID == 0 {
		t.Error("Thursday's meal is gone: Restore replanned")
	}
	if m := e.meal(10); m.Fresh() {
		t.Errorf("Tuesday = %+v, want the chicken Leftover again, exactly as before the Swap", m)
	}
}

func TestRestoreWithAStaleTokenAnswersPlanChangedAndChangesNothing(t *testing.T) {
	e := chickenWeek(t)
	cA, a := runner.WithOutcome(ctx)
	if _, err := e.r.SetCourseMeal(cA, e.key(9), e.rec["pasta"], nil); err != nil {
		t.Fatal(err)
	}
	cB, b := runner.WithOutcome(ctx)
	if _, err := e.r.SetCourseMeal(cB, e.key(11), e.rec["curry"], nil); err != nil {
		t.Fatal(err)
	}
	now := e.planState()
	if _, err := e.r.Restore(ctx, a.UndoToken); !errors.Is(err, runner.ErrPlanChanged) {
		t.Fatalf("Restore with the older token = %v, want ErrPlanChanged: another write came after it", err)
	}
	if got := e.planState(); !reflect.DeepEqual(got, now) {
		t.Error("a refused Restore changed the plan")
	}
	if _, err := e.r.Restore(ctx, b.UndoToken); err != nil {
		t.Fatalf("Restore with the newest token = %v", err)
	}
	if _, err := e.r.Restore(ctx, b.UndoToken); !errors.Is(err, runner.ErrPlanChanged) {
		t.Errorf("a token used twice = %v, want ErrPlanChanged: the first Restore was a write", err)
	}
}

func TestRestoreWithATokenNobodyIssuedAnswersUnknown(t *testing.T) {
	e := weekEnv(t)
	for _, tok := range []string{"nope", "0000000000000000000000000000000000000000"} {
		if _, err := e.r.Restore(ctx, tok); !errors.Is(err, runner.ErrUndoUnknown) {
			t.Errorf("Restore(%q) = %v, want ErrUndoUnknown", tok, err)
		}
	}
}

func TestAnAutomaticRunThatChangesTheRowsStalesTheToken(t *testing.T) {
	e := chickenWeek(t)
	c, out := runner.WithOutcome(ctx)
	if _, err := e.r.SetCourseMeal(c, e.key(11), e.rec["curry"], nil); err != nil {
		t.Fatal(err)
	}
	e.src.archive(e.rec["curry"]) // the Recipe just chosen: the next run must replace the meal
	e.src.recipes = e.src.recipes[:len(e.src.recipes)]
	if _, err := e.r.Plan(ctx, plan.ReasonRecipeChanged); err != nil {
		t.Fatal(err)
	}
	if _, err := e.r.Restore(ctx, out.UndoToken); !errors.Is(err, runner.ErrPlanChanged) {
		t.Errorf("Restore after the plan changed behind it = %v, want ErrPlanChanged", err)
	}
}

func TestAnAutomaticRunThatChangesNothingKeepsTheTokenGood(t *testing.T) {
	e := chickenWeek(t)
	c, out := runner.WithOutcome(ctx)
	if _, err := e.r.SetCourseMeal(c, e.key(9), e.rec["pasta"], nil); err != nil {
		t.Fatal(err)
	}
	rev := e.revision()
	// The invalidation that follows a change of Attendance replans once more and finds nothing to do.
	if _, err := e.r.Plan(ctx, plan.ReasonAttendanceChanged); err != nil {
		t.Fatal(err)
	}
	if e.revision() != rev {
		t.Fatalf("revision %d -> %d: a run that wrote no row must not bump it", rev, e.revision())
	}
	if _, err := e.r.Restore(ctx, out.UndoToken); err != nil {
		t.Errorf("Restore after a no-op run = %v: the token must stay good", err)
	}
}

func TestEveryWriteThatChangesTheRowsBumpsTheRevisionAndRestoreDoesToo(t *testing.T) {
	e := weekEnv(t)
	rev := e.revision()
	c, out := runner.WithOutcome(ctx)
	if _, err := e.r.SetCourseMeal(c, e.key(14), e.rec["curry"], nil); err != nil {
		t.Fatal(err)
	}
	if e.revision() <= rev {
		t.Errorf("revision %d after a Swap, want more than %d", e.revision(), rev)
	}
	rev = e.revision()
	if _, err := e.r.Restore(ctx, out.UndoToken); err != nil {
		t.Fatal(err)
	}
	if e.revision() <= rev {
		t.Errorf("revision %d after Restore, want more than %d: Restore is a write, so older tokens go stale", e.revision(), rev)
	}
}

func TestOnlyTheNewestTwentySnapshotsAreKept(t *testing.T) {
	e := weekEnv(t)
	var first string
	var last string
	names := []string{"curry", "pizza"}
	for i := 0; i < 25; i++ {
		c, out := runner.WithOutcome(ctx)
		if _, err := e.r.SetCourseMeal(c, e.key(14), e.rec[names[i%2]], nil); err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			first = out.UndoToken
		}
		last = out.UndoToken
	}
	if _, err := e.r.Restore(ctx, first); !errors.Is(err, runner.ErrUndoUnknown) {
		t.Errorf("the 25th-oldest token = %v, want ErrUndoUnknown: the store keeps 20", err)
	}
	if n := e.rowsOf(`SELECT count(*) AS n FROM plan_snapshots`); len(n) != 1 || n[0] != "n=20" {
		t.Errorf("plan_snapshots holds %v, want 20 rows", n)
	}
	if _, err := e.r.Restore(ctx, last); err != nil {
		t.Errorf("the newest token = %v", err)
	}
}

func TestABoughtMealIsNotChangedByAnotherMealsSwap(t *testing.T) {
	e, bought := boughtEnv(t)
	other := int64(0)
	for _, name := range simpleRecipes {
		if id := e.rec[name]; id != bought.RecipeID && id != e.meal(9).RecipeID && id != e.meal(11).RecipeID {
			other = id
		}
	}
	c, out := runner.WithOutcome(ctx)
	if _, err := e.r.SetCourseMeal(c, e.key(9), other, nil); err != nil {
		t.Fatal(err)
	}
	e.wantUntouched("a Swap of Monday", bought)
	for _, ch := range out.Changes {
		if ch.Key() == bought.Key {
			t.Errorf("the Bought meal is listed as changed: %+v", ch)
		}
	}
}

func TestABoughtMealIsNotChangedByARegenerateOfAPinnedOne(t *testing.T) {
	e, bought := boughtEnv(t)
	if _, err := e.r.SetCourseMeal(ctx, e.key(11), e.rec["curry"], nil); err != nil {
		t.Fatal(err)
	}
	e.wantUntouched("a Swap of Wednesday", bought)
	if _, err := e.r.Unpin(ctx, e.key(11)); err != nil {
		t.Fatal(err)
	}
	e.wantUntouched("an Unpin of Wednesday", bought)
}

// undoPart is an UndoParticipant with one number of state; its calls are logged in order.
type undoPart struct {
	val int
	log *[]string
}

func (p *undoPart) Capture(_ context.Context, tx *sql.Tx) (json.RawMessage, error) {
	if tx == nil {
		return nil, errors.New("Capture without the write's transaction")
	}
	*p.log = append(*p.log, fmt.Sprintf("capture %d", p.val))
	return json.RawMessage(fmt.Sprintf(`{"val":%d}`, p.val)), nil
}

func (p *undoPart) Restore(_ context.Context, tx *sql.Tx, raw json.RawMessage) error {
	if tx == nil {
		return errors.New("Restore without the transaction")
	}
	var v struct{ Val int }
	if err := json.Unmarshal(raw, &v); err != nil {
		return err
	}
	*p.log = append(*p.log, fmt.Sprintf("restore %d", v.Val))
	p.val = v.Val
	return nil
}

func TestAnUndoParticipantIsCapturedBeforeTheWriteAndRestoredWithTheSnapshot(t *testing.T) {
	e := weekEnv(t)
	var log []string
	part := &undoPart{val: 1, log: &log}
	e.r.RegisterUndo("away", part)
	c, out := runner.WithOutcome(ctx)
	_, err := e.r.Apply(c, plan.ReasonAttendanceChanged, func(ctx context.Context, tx *sql.Tx, st *store.Store) error {
		log = append(log, "mutate")
		part.val = 2 // Away records the Member's days
		return st.SetPinned(ctx, e.key(13), true)
	})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"capture 1", "mutate"}; !reflect.DeepEqual(log, want) {
		t.Fatalf("calls = %v, want %v: the participant is captured before the write changes anything", log, want)
	}
	if _, err := e.r.Restore(ctx, out.UndoToken); err != nil {
		t.Fatal(err)
	}
	if part.val != 1 || log[len(log)-1] != "restore 1" {
		t.Errorf("participant = %d, calls = %v, want it restored to 1 by the same Restore", part.val, log)
	}
	if e.meal(13).Pinned {
		t.Error("the plan rows were not restored with the participant")
	}
}

func TestAnUndoParticipantThatFailsRollsTheWholeRestoreBack(t *testing.T) {
	e := weekEnv(t)
	var log []string
	e.r.RegisterUndo("away", &failingPart{undoPart{val: 1, log: &log}})
	c, out := runner.WithOutcome(ctx)
	if _, err := e.r.Apply(c, plan.ReasonAttendanceChanged, func(ctx context.Context, tx *sql.Tx, st *store.Store) error {
		return st.SetPinned(ctx, e.key(13), true)
	}); err != nil {
		t.Fatal(err)
	}
	now := e.planState()
	if _, err := e.r.Restore(ctx, out.UndoToken); err == nil {
		t.Fatal("Restore succeeded although the participant failed")
	}
	if got := e.planState(); !reflect.DeepEqual(got, now) {
		t.Error("a failed Restore left the plan rows half written")
	}
}

type failingPart struct{ undoPart }

func (p *failingPart) Restore(context.Context, *sql.Tx, json.RawMessage) error { return errBoom }

func TestApplyReportsWhatItsReplanChangedAndIssuesAToken(t *testing.T) {
	e := weekEnv(t)
	tue := e.meal(10)
	c, out := runner.WithOutcome(ctx)
	_, err := e.r.Apply(c, plan.ReasonAttendanceChanged, func(ctx context.Context, tx *sql.Tx, st *store.Store) error {
		e.src.setAttendance(e.slotOn(10), "2026-11-10", []plan.Attendee{}) // nobody eats on Tuesday
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.UndoToken == "" {
		t.Error("no undo token from Apply")
	}
	var got *plan.CellChange
	for i := range out.Changes {
		if out.Changes[i].Key() == e.key(10) {
			got = &out.Changes[i]
		}
	}
	if got == nil || got.Before == nil || got.Before.RecipeID != tue.RecipeID || got.After != nil {
		t.Errorf("changes = %+v, want Tuesday's meal gone (After nil), because nobody eats", out.Changes)
	}
}

func TestApplyRollsBackAndIssuesNothingWhenItsMutationFails(t *testing.T) {
	e := weekEnv(t)
	before, rev := e.planState(), e.revision()
	c, out := runner.WithOutcome(ctx)
	_, err := e.r.Apply(c, plan.ReasonAttendanceChanged, func(ctx context.Context, tx *sql.Tx, st *store.Store) error {
		if err := st.SetPinned(ctx, e.key(13), true); err != nil {
			return err
		}
		return errBoom
	})
	if !errors.Is(err, errBoom) {
		t.Fatalf("Apply = %v, want the mutation's error", err)
	}
	if out.UndoToken != "" || !reflect.DeepEqual(e.planState(), before) || e.revision() != rev {
		t.Error("a failed Apply left a token, a row or a revision behind")
	}
	if n := e.rowsOf(`SELECT count(*) AS n FROM plan_snapshots`); n[0] != "n=0" {
		t.Errorf("plan_snapshots holds %v after a failed write, want none", n)
	}
}

// eventOf reads the latest plan event as the SPA gets it: as JSON.
func (e *env) eventOf() map[string]any {
	e.t.Helper()
	d := e.bus.last("plan")
	if d == nil {
		e.t.Fatal("no plan event was published")
	}
	raw, err := json.Marshal(d)
	if err != nil {
		e.t.Fatal(err)
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		e.t.Fatalf("plan event %s is not an object: %v", raw, err)
	}
	return out
}

func TestThePlanEventNamesWhoChangedItAndWhatChangedButNeverCarriesTheToken(t *testing.T) {
	e := chickenWeek(t)
	c, out := runner.WithOutcome(runner.WithActor(ctx, runner.Actor{UserID: 7, Name: "Anna"}))
	if _, err := e.r.SetCourseMeal(c, e.key(9), e.rec["pasta"], nil); err != nil {
		t.Fatal(err)
	}
	ev := e.eventOf()
	if ev["changed"] != "plan" || ev["reason"] != string(plan.ReasonPinned) {
		t.Errorf("event = %v, want changed=plan and reason=pinned", ev)
	}
	by, _ := ev["by"].(map[string]any)
	if by["userId"] != float64(7) || by["name"] != "Anna" {
		t.Errorf("by = %v, want {userId 7, name Anna}", ev["by"])
	}
	target, _ := ev["target"].(map[string]any)
	if target["date"] != "2026-11-09" || target["mealSlotId"] != float64(e.key(9).MealSlotID) {
		t.Errorf("target = %v, want the cell that was swapped", ev["target"])
	}
	changes, _ := ev["changes"].([]any)
	if len(changes) != len(out.Changes) || len(changes) == 0 {
		t.Errorf("changes = %v, want the %d cells the response lists", ev["changes"], len(out.Changes))
	}
	for k := range ev {
		if strings.Contains(strings.ToLower(k), "token") {
			t.Errorf("the event carries %q: only the User who made the change may undo it", k)
		}
	}
	if strings.Contains(fmt.Sprint(ev), out.UndoToken) {
		t.Error("the event carries the undo token")
	}
}

func TestAWriteWithNoActorPublishesNoBy(t *testing.T) {
	e := weekEnv(t)
	if _, err := e.r.Plan(ctx, plan.ReasonNightly); err != nil {
		t.Fatal(err)
	}
	if ev := e.eventOf(); ev["by"] != nil {
		t.Errorf("by = %v on a run nobody asked for, want none", ev["by"])
	}
}

func TestRestorePublishesAPlanEventWithTheRestoredCells(t *testing.T) {
	e := chickenWeek(t)
	c, out := runner.WithOutcome(runner.WithActor(ctx, runner.Actor{UserID: 7, Name: "Anna"}))
	if _, err := e.r.SetCourseMeal(c, e.key(9), e.rec["pasta"], nil); err != nil {
		t.Fatal(err)
	}
	n := e.bus.count("plan")
	if _, err := e.r.Restore(runner.WithActor(ctx, runner.Actor{UserID: 7, Name: "Anna"}), out.UndoToken); err != nil {
		t.Fatal(err)
	}
	if e.bus.count("plan") != n+1 {
		t.Fatalf("plan events %d -> %d, want one more", n, e.bus.count("plan"))
	}
	ev := e.eventOf()
	if ev["reason"] != string(plan.ReasonRestored) {
		t.Errorf("reason = %v, want %q", ev["reason"], plan.ReasonRestored)
	}
	if ch, _ := ev["changes"].([]any); len(ch) == 0 {
		t.Errorf("changes = %v, want the restored cells", ev["changes"])
	}
}

func TestAFailedWritePublishesNothingAndLeavesTheOutcomeEmpty(t *testing.T) {
	e := weekEnv(t)
	n := e.bus.count("plan")
	c, out := runner.WithOutcome(ctx)
	if _, err := e.r.SetCourseMeal(c, e.key(9), 999999, nil); !errors.Is(err, runner.ErrUnknownRecipe) {
		t.Fatalf("SetCourseMeal = %v, want ErrUnknownRecipe", err)
	}
	if out.UndoToken != "" || e.bus.count("plan") != n {
		t.Errorf("a refused write left token %q and %d events", out.UndoToken, e.bus.count("plan")-n)
	}
}
