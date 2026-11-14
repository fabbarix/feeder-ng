package service

import (
	"context"
	"database/sql"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

// B9-05 test stubs: the signatures the tests compile against. The developer implements them.

var (
	// ErrNotUndoable is returned by UndoThrowOut for a waste record with no Lot to put back (a discarded Leftover, or
	// waste recorded before migration 1572). The API answers 409 not_undoable.
	ErrNotUndoable = errors.New("stock: this waste cannot be undone")
	// ErrUndoWindowOver is returned by UndoThrowOut for waste recorded on an earlier household day (409 undo_window_over).
	ErrUndoWindowOver = errors.New("stock: it is too late to undo this waste")
)

var errNotImplemented = errors.New("not implemented (B9-05 stub)")

// LotTake is what an action took from one Stock Lot: the Lot as it was before (with its Storage Place, Product and Shop)
// and the quantity taken. It is what Planning's cooked_takes and the Scan ledger keep (as JSON) for Undo.
type LotTake struct {
	Lot   store.StoredLot
	Taken float64
}

// GiveBackOutcome says what GiveBackTx did.
type GiveBackOutcome struct {
	IngredientIDs []int64 // Ingredients whose Stock changed, ascending
	Restored      []int64 // Lot ids that got Stock back
	Gone          []int64 // Lot ids that were gone since, so their Stock was not put back
}

// GiveBackTx puts back what takes took, inside the caller's transaction. It publishes nothing (PublishGiveBack does).
func (s *Service) GiveBackTx(ctx context.Context, tx *sql.Tx, takes []LotTake) (GiveBackOutcome, error) {
	return GiveBackOutcome{}, errNotImplemented
}

// GiveBack is GiveBackTx in its own transaction, publishing one stock event when something was restored.
func (s *Service) GiveBack(ctx context.Context, takes []LotTake) (GiveBackOutcome, error) {
	return GiveBackOutcome{}, errNotImplemented
}

// PublishGiveBack publishes one stock event for what GiveBackTx restored; nothing when nothing was.
func (s *Service) PublishGiveBack(o GiveBackOutcome) {}

// UndoThrowOut puts a thrown-out Lot back (same id, dates and Storage Place) and removes its waste record.
func (s *Service) UndoThrowOut(ctx context.Context, wasteID int64) (LotView, error) {
	return LotView{}, errNotImplemented
}

// Adjusted is what AdjustLot did.
type Adjusted struct {
	Lot     LotView // the Lot after (its Quantity 0 when Removed)
	Removed bool
}

// AdjustLot sets a Lot's quantity (SSP-01 Change): more or less than it holds, and 0 removes it.
func (s *Service) AdjustLot(ctx context.Context, lotID int64, quantity float64) (Adjusted, error) {
	return Adjusted{}, errNotImplemented
}

// PlaceMove is one move of MoveMany.
type PlaceMove struct{ LotID, PlaceID int64 }

// MovedMany is what MoveMany did.
type MovedMany struct {
	Moved   []LotView // the Lots moved, in request order
	Skipped []int64   // Lot ids that already had a Storage Place, left where they are
}

// MoveMany puts Not sorted Lots into Storage Places, all or none (SSP-10).
func (s *Service) MoveMany(ctx context.Context, moves []PlaceMove) (MovedMany, error) {
	return MovedMany{}, errNotImplemented
}

// KeepUntil makes a spoiled Lot good until goodUntil ("" = today); a date before today is ErrInvalid (SSP-17).
func (s *Service) KeepUntil(ctx context.Context, lotID int64, goodUntil stock.Date) (LotView, error) {
	return LotView{}, errNotImplemented
}

// TotalChange is what SetTotalRecorded did.
type TotalChange struct {
	Stock      IngredientStock
	Takes      []LotTake // what a decrease took (the Lots before, with the quantity taken from each)
	AddedLotID int64     // the Lot an increase created, 0 when none
}

// SetTotalRecorded is SetTotal that also says what it took or added, so a Stock-take can be undone.
func (s *Service) SetTotalRecorded(ctx context.Context, ingredientID int64, total float64) (TotalChange, error) {
	return TotalChange{}, errNotImplemented
}
