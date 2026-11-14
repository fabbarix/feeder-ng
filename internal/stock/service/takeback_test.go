package service_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/service"
)

// Beta.8 (undo): Undo of a tick takes back from the Lot the tick added (docs/dev/design/b8-undo.md, ADR 0019).
//
//	type TakenBack struct { IngredientID int64; Taken float64; Removed bool }
//	func (s *Service) TakeBackLot(ctx, lotID int64, added float64) (TakenBack, error)
//
// An unknown Lot (used up or deleted) is not an error: Taken is 0. A Lot already taken back is not taken again: the
// call answers the first take-back. One stock event is published when something was taken, none otherwise.

func TestTakeBackLotRemovesAnUntouchedLotAndPublishes(t *testing.T) {
	f := setup(t)
	lot := f.add(t, f.milk, 400, "")
	before := f.pub.count()
	res, err := f.svc.TakeBackLot(ctx, lot.ID, 400)
	if err != nil || res.Taken != 400 || !res.Removed || res.IngredientID != f.milk {
		t.Fatalf("TakeBackLot = %+v, %v", res, err)
	}
	if got := total(t, f, f.milk); got != 0 {
		t.Fatalf("Stock = %v, want 0", got)
	}
	if f.pub.count() != before+1 {
		t.Fatalf("events %d -> %d, want one stock event", before, f.pub.count())
	}
}

func TestTakeBackLotTakesOnlyWhatIsLeftOfAUsedLot(t *testing.T) {
	f := setup(t)
	lot := f.add(t, f.milk, 400, "")
	if _, err := f.svc.EditLot(ctx, lot.ID, stock.Edit{Quantity: fp(150)}); err != nil { // Cooked used 250
		t.Fatal(err)
	}
	res, err := f.svc.TakeBackLot(ctx, lot.ID, 400)
	if err != nil || res.Taken != 150 || !res.Removed {
		t.Fatalf("TakeBackLot = %+v, %v; want the 150 left, Lot gone", res, err)
	}
}

func TestTakeBackLotLeavesWhatTheTickDidNotAdd(t *testing.T) {
	f := setup(t)
	lot := f.add(t, f.milk, 400, "")
	if _, err := f.svc.EditLot(ctx, lot.ID, stock.Edit{Quantity: fp(600)}); err != nil {
		t.Fatal(err)
	}
	res, err := f.svc.TakeBackLot(ctx, lot.ID, 400)
	if err != nil || res.Taken != 400 || res.Removed {
		t.Fatalf("TakeBackLot = %+v, %v; want 400 taken, the Lot kept", res, err)
	}
	if got := total(t, f, f.milk); got != 200 {
		t.Fatalf("Stock = %v, want the 200 the tick did not add", got)
	}
}

// A Lot already taken back is not taken again: the second call answers what the first one took (so a retried Undo can
// finish its own steps) and changes nothing. An unknown Lot never taken back is a no-op.
func TestTakeBackLotOfAMissingLotIsANoOpAndIdempotent(t *testing.T) {
	f := setup(t)
	lot := f.add(t, f.milk, 400, "")
	if _, err := f.svc.TakeBackLot(ctx, lot.ID, 400); err != nil {
		t.Fatal(err)
	}
	before := f.pub.count()
	if res, err := f.svc.TakeBackLot(ctx, lot.ID, 400); err != nil || res.Taken != 400 || !res.Removed || res.IngredientID != 0 {
		t.Fatalf("TakeBackLot again = %+v, %v; want the first answer (400, removed) and nothing taken now", res, err)
	}
	if res, err := f.svc.TakeBackLot(ctx, 9999, 400); err != nil || res.Taken != 0 || res.Removed {
		t.Fatalf("TakeBackLot(unknown) = %+v, %v; want a no-op", res, err)
	}
	if f.pub.count() != before {
		t.Fatalf("a no-op published %d events", f.pub.count()-before)
	}
}

// Residual atomicity (beta.8 review): a retry after the take-back committed but the tick was not removed must not take
// the tick's amount twice from a Lot that was edited up.
func TestTakeBackLotTakesALotBackOnlyOnce(t *testing.T) {
	f := setup(t)
	lot := f.add(t, f.milk, 400, "")
	if _, err := f.svc.EditLot(ctx, lot.ID, stock.Edit{Quantity: fp(1000)}); err != nil {
		t.Fatal(err)
	}
	first, err := f.svc.TakeBackLot(ctx, lot.ID, 400)
	if err != nil || first.Taken != 400 || first.Removed {
		t.Fatalf("TakeBackLot = %+v, %v; want 400 taken, the Lot kept", first, err)
	}
	before := f.pub.count()
	again, err := f.svc.TakeBackLot(ctx, lot.ID, 400)
	if err != nil || again.Taken != 400 || again.Removed {
		t.Fatalf("TakeBackLot again = %+v, %v; want the first answer", again, err)
	}
	if got := total(t, f, f.milk); got != 600 {
		t.Fatalf("Stock = %v, want 600: the Lot is taken back once", got)
	}
	if f.pub.count() != before {
		t.Fatal("a repeated take-back published a stock event")
	}
}

func TestTakeBackLotNeverTouchesAnotherLot(t *testing.T) {
	f := setup(t)
	f.add(t, f.milk, 1000, "2026-11-01")
	lot := f.add(t, f.milk, 400, "")
	if _, err := f.svc.TakeBackLot(ctx, lot.ID, 400); err != nil {
		t.Fatal(err)
	}
	if got := total(t, f, f.milk); got != 1000 {
		t.Fatalf("Stock = %v, want the older Lot's 1000", got)
	}
}

func fp(f float64) *float64 { return &f }

var _ = service.ErrInvalid
