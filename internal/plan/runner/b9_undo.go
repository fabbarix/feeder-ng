package runner

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
)

// B9-11 (PC-01, SAFE-03, SAFE-07). STUB written by the test author so the tests compile: the Developer replaces the
// bodies. The contracts are in the doc comments and in undo_*_test.go and reopen_test.go.

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

// WithActor says which User makes the writes made with the returned context.
func WithActor(ctx context.Context, a Actor) context.Context { return ctx }

// Outcome is what a write left behind, read after the call that made it.
type Outcome struct {
	// Changes are the cells the write changed beyond its own target (the target is never listed). Never nil after a write.
	Changes []plan.CellChange
	// UndoToken restores the plan to what it was before the write, while nothing else has written. "" when the write
	// issues none (Cooked, Not cooked, automatic runs) or wrote nothing.
	UndoToken string
}

// WithOutcome returns a context whose writes fill the returned Outcome.
func WithOutcome(ctx context.Context) (context.Context, *Outcome) { return ctx, &Outcome{} }

// RestoreResult is what Restore changed.
type RestoreResult struct {
	Changes []plan.CellChange
}

// Restore writes the snapshot of token back exactly, in one transaction and with no replan. ErrUndoUnknown, ErrPlanChanged.
func (r *Runner) Restore(ctx context.Context, token string) (RestoreResult, error) {
	return RestoreResult{}, errors.New("not implemented")
}

// UndoParticipant is state outside the plan rows that an undoable write also changes (Away, B9-24). Capture runs inside
// the write's transaction before it changes anything; Restore runs inside Restore's transaction with what Capture
// returned.
type UndoParticipant interface {
	Capture(ctx context.Context, tx *sql.Tx) (json.RawMessage, error)
	Restore(ctx context.Context, tx *sql.Tx, captured json.RawMessage) error
}

// RegisterUndo adds a participant under a name that is stable across releases.
func (r *Runner) RegisterUndo(name string, p UndoParticipant) {}

// Apply runs mutate and one replan in ONE transaction, like every write, and issues an undo token: the entry point for a
// write that another module owns (Who's eating, a Meal Slot's date, Away). Fill an Outcome with WithOutcome.
func (r *Runner) Apply(ctx context.Context, reason plan.Reason, mutate func(ctx context.Context, tx *sql.Tx, st *store.Store) error) (Summary, error) {
	return Summary{}, errors.New("not implemented")
}

// Take is what Cooked took from one Stock Lot. LotJSON is the Lot as it was before, opaque to the runner.
type Take struct {
	IngredientID int64
	LotID        int64
	Taken        float64
	LotJSON      json.RawMessage
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

// ReopenResult is what Reopen put back.
type ReopenResult struct {
	Meals     []plan.Meal // the meals now open again, in the slot's Course order; empty when nothing was marked
	StockGone int         // Stock Lots that were gone, whose Stock was not put back
}

// Reopen takes back Cooked or Not cooked of one Planned Meal (of every Course of its action for a Mark all). Idempotent:
// a meal that is open answers with no meals. ErrReopenWindowOver, ErrLeftoverUsed.
func (r *Runner) Reopen(ctx context.Context, key plan.Key) (ReopenResult, error) {
	return ReopenResult{}, errors.New("not implemented")
}

// ReopenAll is Reopen for every Course of the slot occurrence that was marked.
func (r *Runner) ReopenAll(ctx context.Context, date string, mealSlotID int64) (ReopenResult, error) {
	return ReopenResult{}, errors.New("not implemented")
}

// Resolution says how a Cooked or Not cooked meal was marked and whether it can be reopened; CourseView carries it.
type Resolution struct {
	Kind             string // "cooked" or "not_cooked"
	MarkedOn         string // household date
	MarkedAt         time.Time
	UserID           int64 // 0 when unknown
	LeftoverPortions float64
	CanUndo          bool
	CannotUndo       string // "leftover_used" or "window_over" when CanUndo is false
}
