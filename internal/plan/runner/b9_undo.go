package runner

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
)

// B9-11 (PC-01, SAFE-03, SAFE-07): every replanning write says what it changed beyond its own target and issues an undo
// token; Restore writes the plan rows back exactly; Reopen takes back Cooked and Not cooked until the end of the
// household day. The plan rows a write changed are found by comparing every row before and after it (store.DiffRows);
// the same diff is the undo token's snapshot and the record of a mark.

// Errors of restore and reopen; the HTTP layer maps them.
var (
	// ErrUndoUnknown: no snapshot has that token (never issued, or pruned). The API answers 404 not_found.
	ErrUndoUnknown = errors.New("planning: no such undo")
	// ErrPlanChanged: something wrote to the plan since the write that issued the token, or the token was already used.
	// The API answers 409 plan_changed.
	ErrPlanChanged = errors.New("planning: the plan changed since")
	// ErrLeftoverUsed: some of the Leftover that Cooked made was had, so Cooked cannot be reopened (409 leftover_used).
	ErrLeftoverUsed = plan.ErrLeftoverUsed
	// ErrReopenWindowOver: the household day of the mark is over, or the mark has no record (409 reopen_window_over).
	ErrReopenWindowOver = plan.ErrReopenWindowOver
)

// Actor is the User a write is made by: the plan event names it ("Anna swapped Thu Dinner").
type Actor struct {
	UserID int64
	Name   string
}

type actorKey struct{}

// WithActor says which User makes the writes made with the returned context.
func WithActor(ctx context.Context, a Actor) context.Context {
	return context.WithValue(ctx, actorKey{}, a)
}

func actorOf(ctx context.Context) (Actor, bool) {
	a, ok := ctx.Value(actorKey{}).(Actor)
	return a, ok
}

// Outcome is what a write left behind, read after the call that made it.
type Outcome struct {
	// Changes are the cells the write changed beyond its own target (the target is never listed). Never nil after a write.
	Changes []plan.CellChange
	// UndoToken restores the plan to what it was before the write, while nothing else has written. "" when the write
	// issues none (Cooked, Not cooked, automatic runs) or wrote nothing.
	UndoToken string
}

type outcomeKey struct{}

// WithOutcome returns a context whose writes fill the returned Outcome.
func WithOutcome(ctx context.Context) (context.Context, *Outcome) {
	o := &Outcome{}
	return context.WithValue(ctx, outcomeKey{}, o), o
}

func outcomeOf(ctx context.Context) *Outcome {
	o, _ := ctx.Value(outcomeKey{}).(*Outcome)
	return o
}

// RestoreResult is what Restore changed.
type RestoreResult struct {
	Changes []plan.CellChange
}

// undoState is what a token keeps: the plan rows its write changed and what each participant captured.
type undoState struct {
	Rows         json.RawMessage            `json:"rows"`
	Participants map[string]json.RawMessage `json:"participants,omitempty"`
}

// newToken is 128 random bits as hex.
func newToken() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(fmt.Sprintf("planning: no randomness for an undo token: %v", err))
	}
	return hex.EncodeToString(b[:])
}

// changeSet is what a write compares against when it is done: every plan row and Planned Meal before it.
type changeSet struct {
	rows  store.Rows
	meals []plan.Meal
}

func captureChanges(ctx context.Context, st *store.Store) (changeSet, error) {
	rows, err := st.CaptureRows(ctx)
	if err != nil {
		return changeSet{}, err
	}
	meals, err := st.Meals(ctx, "", "")
	return changeSet{rows: rows, meals: meals}, err
}

// since compares the plan now with the capture: the row diff and the cells that changed beyond except.
func (r *Runner) since(ctx context.Context, st *store.Store, before changeSet, except []plan.Key) (store.RowDiff, []plan.CellChange, error) {
	rows, err := st.CaptureRows(ctx)
	if err != nil {
		return store.RowDiff{}, nil, err
	}
	meals, err := st.Meals(ctx, "", "")
	if err != nil {
		return store.RowDiff{}, nil, err
	}
	names, err := r.recipeNames(ctx)
	if err != nil {
		return store.RowDiff{}, nil, err
	}
	return store.DiffRows(before.rows, rows), plan.CellChanges(before.meals, meals, names, except...), nil
}

// recipeNames names Recipes for the changes list.
func (r *Runner) recipeNames(ctx context.Context) (func(int64) string, error) {
	recipes, err := r.d.Source.Recipes(ctx)
	if err != nil {
		return nil, err
	}
	byID := make(map[int64]string, len(recipes))
	for _, rc := range recipes {
		byID[int64(rc.ID)] = rc.Name
	}
	return func(id int64) string { return byID[id] }, nil
}

// saveUndo stores the token of an undoable write.
func (r *Runner) saveUndo(ctx context.Context, st *store.Store, revision int64, d store.RowDiff, captured map[string]json.RawMessage) (string, error) {
	rows, err := json.Marshal(d)
	if err != nil {
		return "", err
	}
	state, err := json.Marshal(undoState{Rows: rows, Participants: captured})
	if err != nil {
		return "", err
	}
	token := newToken()
	return token, st.SaveSnapshot(ctx, store.Snapshot{Token: token, Revision: revision, State: state})
}

// publishPlan publishes the plan event of a committed write: its reason, who made it (when a User did), its target
// cell and the cells it changed beyond it. It never carries the undo token: only the User who made the write may undo it.
func (r *Runner) publishPlan(ctx context.Context, reason plan.Reason, target []plan.Key, changes []plan.CellChange) {
	if r.d.Events == nil {
		return
	}
	ev := map[string]any{"changed": "plan", "reason": reason, "changes": changes}
	if a, ok := actorOf(ctx); ok {
		ev["by"] = map[string]any{"userId": a.UserID, "name": a.Name}
	}
	if len(target) > 0 {
		k := target[0]
		ev["target"] = map[string]any{"date": k.Date, "mealSlotId": k.MealSlotID, "courseId": k.CourseID}
	}
	r.d.Events.Publish("plan", ev)
}

// Restore writes the snapshot of token back exactly, in one transaction and with no replan. ErrUndoUnknown, ErrPlanChanged.
func (r *Runner) Restore(ctx context.Context, token string) (RestoreResult, error) {
	r.writeMu.Lock()
	defer r.writeMu.Unlock()
	var changes []plan.CellChange
	err := r.d.Store.InTx(ctx, func(tx *sql.Tx, st *store.Store) error {
		sn, err := st.SnapshotOf(ctx, token)
		if errors.Is(err, store.ErrNotFound) {
			return ErrUndoUnknown
		}
		if err != nil {
			return err
		}
		rev, err := st.Revision(ctx)
		if err != nil {
			return err
		}
		if rev != sn.Revision {
			return ErrPlanChanged
		}
		var state undoState
		if err := json.Unmarshal(sn.State, &state); err != nil {
			return err
		}
		diff, err := store.DecodeRowDiff(state.Rows)
		if err != nil {
			return err
		}
		for name := range state.Participants {
			if r.undo.get(name) == nil {
				return fmt.Errorf("planning: the undo participant %q is not registered", name)
			}
		}
		before, err := captureChanges(ctx, st)
		if err != nil {
			return err
		}
		if err := st.Revert(ctx, diff, false); err != nil {
			return err
		}
		for _, name := range r.undo.order() {
			if raw, ok := state.Participants[name]; ok {
				if err := r.undo.get(name).Restore(withTx(ctx, tx), tx, raw); err != nil {
					return err
				}
			}
		}
		if _, err := st.BumpRevision(ctx); err != nil {
			return err
		}
		_, changes, err = r.since(ctx, st, before, nil)
		return err
	})
	if err != nil {
		return RestoreResult{}, err
	}
	r.publishPlan(ctx, plan.ReasonRestored, nil, changes)
	return RestoreResult{Changes: changes}, nil
}

// UndoParticipant is state outside the plan rows that an undoable write also changes (Away, B9-24). Capture runs inside
// the write's transaction before it changes anything; Restore runs inside Restore's transaction with what Capture
// returned.
type UndoParticipant interface {
	Capture(ctx context.Context, tx *sql.Tx) (json.RawMessage, error)
	Restore(ctx context.Context, tx *sql.Tx, captured json.RawMessage) error
}

// undoRegistry holds the participants by name, in the order they were registered.
type undoRegistry struct {
	mu    sync.Mutex
	names []string
	parts map[string]UndoParticipant
}

func (u *undoRegistry) add(name string, p UndoParticipant) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.parts == nil {
		u.parts = map[string]UndoParticipant{}
	}
	if _, ok := u.parts[name]; !ok {
		u.names = append(u.names, name)
	}
	u.parts[name] = p
}

func (u *undoRegistry) order() []string {
	u.mu.Lock()
	defer u.mu.Unlock()
	return append([]string(nil), u.names...)
}

func (u *undoRegistry) get(name string) UndoParticipant {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.parts[name]
}

// capture asks every participant for its state, inside the write's transaction.
func (u *undoRegistry) capture(ctx context.Context, tx *sql.Tx) (map[string]json.RawMessage, error) {
	names := u.order()
	if len(names) == 0 {
		return nil, nil
	}
	out := make(map[string]json.RawMessage, len(names))
	for _, n := range names {
		raw, err := u.get(n).Capture(ctx, tx)
		if err != nil {
			return nil, err
		}
		out[n] = raw
	}
	return out, nil
}

// RegisterUndo adds a participant under a name that is stable across releases.
func (r *Runner) RegisterUndo(name string, p UndoParticipant) { r.undo.add(name, p) }

// Apply runs mutate and one replan in ONE transaction, like every write, and issues an undo token: the entry point for a
// write that another module owns (Who's eating, a Meal Slot's date, Away). Fill an Outcome with WithOutcome.
//
// A caller (the Who's eating PUT, the slot-date PATCH, the Away endpoints) makes its own change inside mutate, with tx
// (or st, bound to it), instead of in a transaction of its own, and does not also publish an event that invalidates the
// plan: Apply replans at once and publishes the plan event after the commit. Its context should carry the User
// (WithActor) and an Outcome (WithOutcome), whose Changes and UndoToken go into its answer. State outside the plan rows
// that the Undo must put back too (Who's eating, the slot date, Away) is registered once with RegisterUndo. Apply always
// bumps the revision and issues a token, even when the replan moved no meal.
func (r *Runner) Apply(ctx context.Context, reason plan.Reason, mutate func(ctx context.Context, tx *sql.Tx, st *store.Store) error) (Summary, error) {
	return r.write(ctx, reason, runOpts{undoable: true, always: true}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		return nil, mutate(withTx(ctx, tx), tx, st)
	})
}

// Take is what Cooked took from one Stock Lot. LotJSON is the Lot as it was before, opaque to the runner.
type Take struct {
	IngredientID int64
	LotID        int64
	Taken        float64
	LotJSON      json.RawMessage
}

// takeJSON is a Take as cooked_takes.lot_json keeps it.
type takeJSON struct {
	IngredientID int64           `json:"ingredientId"`
	LotID        int64           `json:"lotId"`
	Taken        float64         `json:"taken"`
	Lot          json.RawMessage `json:"lot"`
}

func encodeTakes(takes []Take) (string, error) {
	out := make([]takeJSON, 0, len(takes))
	for _, t := range takes {
		out = append(out, takeJSON{IngredientID: t.IngredientID, LotID: t.LotID, Taken: t.Taken, Lot: t.LotJSON})
	}
	b, err := json.Marshal(out)
	return string(b), err
}

func decodeTakes(s string) ([]Take, error) {
	if s == "" {
		return nil, nil
	}
	var in []takeJSON
	if err := json.Unmarshal([]byte(s), &in); err != nil {
		return nil, err
	}
	out := make([]Take, 0, len(in))
	for _, t := range in {
		out = append(out, Take{IngredientID: t.IngredientID, LotID: t.LotID, Taken: t.Taken, LotJSON: t.Lot})
	}
	return out, nil
}

// GiveBackResult is what putting takes back did: the Lot ids that got Stock back and those that were gone since.
type GiveBackResult struct {
	Restored []int64
	Gone     []int64
	Handle   any
}

// TakeGiver is optionally implemented by a StockPort: the give-back of Reopen, inside the caller's transaction, and the
// event after the commit. Without it a Reopen of a Cooked meal that took Stock is a wiring error.
type TakeGiver interface {
	GiveBackTx(ctx context.Context, tx *sql.Tx, takes []Take) (GiveBackResult, error)
	PublishGiveBack(r GiveBackResult)
}

// mark is what one Cooked or Not cooked did to one Course, for its record.
type mark struct {
	key              plan.Key
	kind             string // store.MarkCooked or store.MarkNotCooked
	leftoverID       int64
	leftoverPortions float64
	sourceID         int64
	sourceTaken      float64
}

// marking collects what one Cooked or Not cooked action did, then records it once the replan is written.
type marking struct {
	marks []mark
	takes []Take
}

// record keeps the records of the action (one Course, or every Course of a Mark all), inside its transaction after the
// replan. The action's takes and the plan rows it changed go on its first record.
func (mk *marking) record(r *Runner) func(ctx context.Context, st *store.Store, d store.RowDiff) error {
	return func(ctx context.Context, st *store.Store, d store.RowDiff) error {
		if len(mk.marks) == 0 {
			return nil
		}
		in, err := r.info(ctx)
		if err != nil {
			return err
		}
		planJSON, err := json.Marshal(d)
		if err != nil {
			return err
		}
		lotJSON, err := encodeTakes(mk.takes)
		if err != nil {
			return err
		}
		a, _ := actorOf(ctx)
		action := newToken()
		at := in.now.UTC().Format(time.RFC3339)
		for i, m := range mk.marks {
			rec := store.MarkRecord{Date: m.key.Date, MealSlotID: m.key.MealSlotID, CourseID: m.key.CourseID, Kind: m.kind,
				MarkedOn: in.today, MarkedAt: at, UserID: a.UserID, UserName: a.Name, Action: action,
				LeftoverID: m.leftoverID, LeftoverPortions: m.leftoverPortions, SourceLeftoverID: m.sourceID, SourceTaken: m.sourceTaken}
			if i == 0 {
				rec.LotJSON, rec.PlanJSON = lotJSON, string(planJSON)
			}
			if _, err := st.AddMark(ctx, rec); err != nil {
				return err
			}
		}
		return nil
	}
}

// ReopenResult is what Reopen put back.
type ReopenResult struct {
	Meals     []plan.Meal // the meals now open again, in the slot's Course order; empty when nothing was marked
	StockGone int         // Stock Lots that were gone, whose Stock was not put back
}

// Reopen takes back Cooked or Not cooked of one Planned Meal (of every Course of its action for a Mark all). Idempotent:
// a meal that is open answers with no meals. ErrReopenWindowOver, ErrLeftoverUsed.
func (r *Runner) Reopen(ctx context.Context, key plan.Key) (ReopenResult, error) {
	return r.reopen(ctx, key.Date, key.MealSlotID, &key.CourseID)
}

// ReopenAll is Reopen for every Course of the slot occurrence that was marked.
func (r *Runner) ReopenAll(ctx context.Context, date string, mealSlotID int64) (ReopenResult, error) {
	return r.reopen(ctx, date, mealSlotID, nil)
}

// errNothingToReopen rolls back a Reopen that found nothing marked: it answers with no meals and publishes nothing.
var errNothingToReopen = errors.New("planning: nothing to reopen")

// reopenScope is what one Reopen takes back, from the open records of the slot occurrence: the records of every action
// that one of the chosen records belongs to. A Mark all takes its Stock in one go, so it is reopened as a whole.
// This is the one place that decides it: to reopen one Course of a Mark all on its own, return chosen here instead (and
// record the takes and plan rows per Course in marking.record).
func reopenScope(open, chosen []store.MarkRecord) []store.MarkRecord {
	actions := map[string]bool{}
	ids := map[int64]bool{}
	for _, c := range chosen {
		ids[c.ID] = true
		if c.Action != "" {
			actions[c.Action] = true
		}
	}
	var out []store.MarkRecord
	for _, m := range open {
		if ids[m.ID] || (m.Action != "" && actions[m.Action]) {
			out = append(out, m)
		}
	}
	return out
}

func (r *Runner) reopen(ctx context.Context, date string, mealSlotID int64, course *int64) (ReopenResult, error) {
	var keys []plan.Key
	var giveBack *GiveBackResult
	var giver TakeGiver
	_, err := r.write(ctx, plan.ReasonReopened, runOpts{}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		keys, giveBack, giver = nil, nil, nil
		in, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		open, err := st.OpenMarks(ctx, date, mealSlotID)
		if err != nil {
			return nil, err
		}
		chosen := open
		if course != nil {
			chosen = nil
			for _, m := range open {
				if m.CourseID == *course {
					chosen = append(chosen, m)
				}
			}
		}
		if len(chosen) == 0 {
			// Nothing on record: an open meal is open already; a resolved one was marked before the records were kept.
			meals, err := st.Meals(ctx, date, date)
			if err != nil {
				return nil, err
			}
			for _, m := range meals {
				if m.Key.MealSlotID == mealSlotID && (course == nil || m.Key.CourseID == *course) && m.State != plan.StatePlanned {
					return nil, ErrReopenWindowOver
				}
			}
			return nil, errNothingToReopen
		}
		recs := reopenScope(open, chosen)
		for _, m := range recs {
			if !plan.MayReopen(m.MarkedOn, in.today) {
				return nil, ErrReopenWindowOver
			}
		}
		for _, m := range recs {
			used, err := leftoverUsed(ctx, st, m)
			if err != nil {
				return nil, err
			}
			if used {
				return nil, ErrLeftoverUsed
			}
		}
		// The plan rows each mark changed go back while nobody changed them since, the newest mark first.
		for i := len(recs) - 1; i >= 0; i-- {
			if recs[i].PlanJSON == "" {
				continue
			}
			d, err := store.DecodeRowDiff([]byte(recs[i].PlanJSON))
			if err != nil {
				return nil, err
			}
			if err := st.Revert(ctx, d, true); err != nil {
				return nil, err
			}
		}
		var takes []Take
		ids := make([]int64, 0, len(recs))
		for _, m := range recs {
			if m.LeftoverID != 0 {
				if err := st.DeleteLeftover(ctx, m.LeftoverID); err != nil && !errors.Is(err, store.ErrNotFound) {
					return nil, err
				}
			}
			if m.SourceLeftoverID != 0 && m.SourceTaken > 0 {
				l, err := st.Leftover(ctx, m.SourceLeftoverID)
				switch {
				case errors.Is(err, store.ErrNotFound): // gone since: nothing to put the portions back into
				case err != nil:
					return nil, err
				default:
					if err := st.SetLeftoverPortions(ctx, l.ID, l.Portions+m.SourceTaken); err != nil {
						return nil, err
					}
				}
			}
			t, err := decodeTakes(m.LotJSON)
			if err != nil {
				return nil, err
			}
			takes = append(takes, t...)
			ids = append(ids, m.ID)
			keys = append(keys, plan.Key{Date: m.Date, MealSlotID: m.MealSlotID, CourseID: m.CourseID})
		}
		if len(takes) > 0 {
			g, ok := r.d.Stock.(TakeGiver)
			if !ok {
				return nil, errors.New("runner: the Stock port cannot give Stock back")
			}
			res, err := g.GiveBackTx(ctx, tx, takes)
			if err != nil {
				return nil, err
			}
			giver, giveBack = g, &res
		}
		if err := st.MarkReopened(ctx, ids); err != nil {
			return nil, err
		}
		return func() {
			if giveBack != nil {
				giver.PublishGiveBack(*giveBack)
			}
		}, nil
	})
	if errors.Is(err, errNothingToReopen) {
		return ReopenResult{Meals: []plan.Meal{}}, nil
	}
	if err != nil {
		return ReopenResult{}, err
	}
	res := ReopenResult{Meals: []plan.Meal{}}
	if giveBack != nil {
		res.StockGone = len(giveBack.Gone)
	}
	reopened := map[plan.Key]bool{}
	for _, k := range keys {
		reopened[k] = true
	}
	meals, err := r.d.Store.Meals(ctx, date, date) // in the slot's Course order
	if err != nil {
		return ReopenResult{}, err
	}
	for _, m := range meals {
		if reopened[m.Key] {
			res.Meals = append(res.Meals, m)
		}
	}
	return res, nil
}

// leftoverUsed reports whether some of the Leftover a Cooked mark made was had, thrown out or frozen since: then the
// mark cannot be taken back.
func leftoverUsed(ctx context.Context, st *store.Store, m store.MarkRecord) (bool, error) {
	if m.Kind != store.MarkCooked || m.LeftoverID == 0 {
		return false, nil
	}
	l, err := st.Leftover(ctx, m.LeftoverID)
	if errors.Is(err, store.ErrNotFound) {
		return true, nil
	}
	if err != nil {
		return false, err
	}
	return l.Status != plan.LeftoverAvailable || l.FrozenOn != "" || l.Portions < m.LeftoverPortions-eps, nil
}

// Resolution says how a Cooked or Not cooked meal was marked and whether it can be reopened; CourseView carries it.
type Resolution struct {
	Kind             string // "cooked" or "not_cooked"
	MarkedOn         string // household date
	MarkedAt         time.Time
	UserID           int64  // 0 when unknown
	UserName         string // the User's name when the mark was made, "" when unknown
	LeftoverPortions float64
	CanUndo          bool
	CannotUndo       string // "leftover_used" or "window_over" when CanUndo is false
}

// resolve fills the Resolution of the resolved meals of one occurrence's Course rows. A meal with no open record (marked
// before the records were kept) cannot be undone: its window is over.
func (r *Runner) resolve(ctx context.Context, in info, key plan.Key, cells []CourseView) error {
	var open []store.MarkRecord
	read := false
	for i := range cells {
		m := cells[i].Meal
		if m == nil || m.State == plan.StatePlanned {
			continue
		}
		if !read {
			var err error
			if open, err = r.d.Store.OpenMarks(ctx, key.Date, key.MealSlotID); err != nil {
				return err
			}
			read = true
		}
		res := &Resolution{Kind: store.MarkCooked, CannotUndo: "window_over"}
		if m.State == plan.StateSkipped {
			res.Kind = store.MarkNotCooked
		}
		for _, rec := range open {
			if rec.CourseID != m.Key.CourseID {
				continue
			}
			res.Kind, res.MarkedOn, res.UserID, res.UserName = rec.Kind, rec.MarkedOn, rec.UserID, rec.UserName
			res.LeftoverPortions = rec.LeftoverPortions
			if t, err := time.Parse(time.RFC3339, rec.MarkedAt); err == nil {
				res.MarkedAt = t
			}
			used := false
			for _, g := range reopenScope(open, []store.MarkRecord{rec}) {
				u, err := leftoverUsed(ctx, r.d.Store, g)
				if err != nil {
					return err
				}
				used = used || u
			}
			switch {
			case !plan.MayReopen(rec.MarkedOn, in.today):
				res.CannotUndo = "window_over"
			case used:
				res.CannotUndo = "leftover_used"
			default:
				res.CanUndo, res.CannotUndo = true, ""
			}
		}
		cells[i].Resolution = res
	}
	return nil
}
