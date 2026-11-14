package service_test

import (
	"context"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/service"
)

// B9-05 (SAFE-09): a Stock-take can be undone through the same Undo as a Shop scan.
//
//   - +1 pack removes the Lot it added;
//   - -1 pack and Set total (down) give back what the Stock-take took, exactly as the StockTakes port reported it
//     (so a -1 floored at what was there gives back what was there, not a whole pack);
//   - Set total (up) removes the Lot it added;
//   - nothing of the Shopping List, purchases, Prices or sold-at is touched (a Stock-take never changed them);
//   - the steps are journalled, so a retry after a failure repeats only what is left;
//   - the second Undo says AlreadyUndone, and a replay of the original op is a duplicate, never applied again.
//
// The ledger needs to keep what the Stock-take took (migration 1572); these tests go through the real ledger.

func undo(t *testing.T, e *env, uuid string) service.UndoResult {
	t.Helper()
	res, err := e.svc.Undo(context.Background(), uuid)
	if err != nil {
		t.Fatalf("Undo(%s): %v", uuid, err)
	}
	return res
}

func untouched(t *testing.T, e *env) {
	t.Helper()
	if len(e.list.undo) != 0 || len(e.list.after) != 0 || len(e.cat.purchases) != 0 || len(e.cat.soldAt) != 0 {
		t.Fatalf("a Stock-take Undo touched the list, purchases or sold-at: list undo %d after %d, purchases %d, soldAt %d",
			len(e.list.undo), len(e.list.after), len(e.cat.purchases), len(e.cat.soldAt))
	}
}

func TestUndoOfPlusPackRemovesItsLot(t *testing.T) {
	e := newEnv(t)
	res := apply(t, e, stockTake("take-1", scan.PlusPack))
	lotID := *res.Scan.LotID
	if got := undo(t, e, "take-1"); !got.Undone || got.AlreadyUndone {
		t.Fatalf("Undo = %+v", got)
	}
	if _, ok := e.stock.lots[lotID]; ok || e.stock.totals[passataIng] != 0 {
		t.Errorf("the Lot is still there: lots %v, total %v", e.stock.lots, e.stock.totals[passataIng])
	}
	untouched(t, e)
}

func TestUndoOfMinusPackGivesBackWhatItTook(t *testing.T) {
	e := newEnv(t)
	e.stock.totals[passataIng] = 1000
	apply(t, e, stockTake("take-1", scan.MinusPack)) // 1000 -> 300
	if got := undo(t, e, "take-1"); !got.Undone {
		t.Fatalf("Undo = %+v", got)
	}
	if e.stock.totals[passataIng] != 1000 {
		t.Errorf("total = %v, want 1000 back", e.stock.totals[passataIng])
	}
	if len(e.stock.givenBack) != 1 {
		t.Fatalf("GiveBack called %d times, want once", len(e.stock.givenBack))
	}
	untouched(t, e)
}

func TestUndoOfAMinusPackThatFlooredGivesBackOnlyWhatWasThere(t *testing.T) {
	e := newEnv(t)
	e.stock.totals[passataIng] = 500 // less than a 700 g pack
	res := apply(t, e, stockTake("take-1", scan.MinusPack))
	if *res.Scan.Total != 0 {
		t.Fatalf("total after = %v, want 0", *res.Scan.Total)
	}
	undo(t, e, "take-1")
	if e.stock.totals[passataIng] != 500 {
		t.Errorf("total = %v, want the 500 that was there, not a whole pack", e.stock.totals[passataIng])
	}
}

func TestUndoOfSetTotalDownGivesBackAndUpRemovesTheAddedLot(t *testing.T) {
	e := newEnv(t)
	e.stock.totals[passataIng] = 1400
	down := stockTake("down", scan.SetTotal)
	down.Total = fp(600)
	apply(t, e, down)
	undo(t, e, "down")
	if e.stock.totals[passataIng] != 1400 {
		t.Errorf("after undoing a decrease: total = %v, want 1400", e.stock.totals[passataIng])
	}

	up := stockTake("up", scan.SetTotal)
	up.Total = fp(2000) // +600 as a new Lot
	apply(t, e, up)
	if e.stock.totals[passataIng] != 2000 {
		t.Fatalf("setup: total = %v", e.stock.totals[passataIng])
	}
	givenBack := len(e.stock.givenBack)
	undo(t, e, "up")
	if e.stock.totals[passataIng] != 1400 || e.stock.lotCount() != 0 {
		t.Errorf("after undoing an increase: total = %v, lots %d; want 1400 and the added Lot removed", e.stock.totals[passataIng], e.stock.lotCount())
	}
	if len(e.stock.givenBack) != givenBack {
		t.Error("undoing an increase gave back Stock that was never taken")
	}
	untouched(t, e)
}

func TestUndoOfASetTotalThatChangedNothingDoesNothing(t *testing.T) {
	e := newEnv(t)
	e.stock.totals[passataIng] = 700
	op := stockTake("same", scan.SetTotal)
	op.Total = fp(700)
	apply(t, e, op)
	if got := undo(t, e, "same"); !got.Undone {
		t.Fatalf("Undo = %+v", got)
	}
	if e.stock.totals[passataIng] != 700 || len(e.stock.givenBack) != 0 || len(e.stock.removed) != 0 {
		t.Errorf("total %v, given back %d, removed %v; want nothing touched", e.stock.totals[passataIng], len(e.stock.givenBack), e.stock.removed)
	}
}

func TestStockTakeUndoTwiceAndReplayAfterUndo(t *testing.T) {
	e := newEnv(t)
	e.stock.totals[passataIng] = 1000
	apply(t, e, stockTake("take-1", scan.MinusPack))
	undo(t, e, "take-1")
	if again := undo(t, e, "take-1"); !again.AlreadyUndone || again.Undone {
		t.Fatalf("second Undo = %+v, want AlreadyUndone", again)
	}
	if len(e.stock.givenBack) != 1 {
		t.Errorf("GiveBack called %d times, want once", len(e.stock.givenBack))
	}
	replay := apply(t, e, stockTake("take-1", scan.MinusPack)) // the phone's queue replays an op the user undid
	if replay.Status != scan.StatusDuplicate || e.stock.totals[passataIng] != 1000 {
		t.Errorf("replay = %s, total %v; want a duplicate and Stock untouched", replay.Status, e.stock.totals[passataIng])
	}
}

func TestStockTakeUndoRetriesAfterAFailureWithoutGivingBackTwice(t *testing.T) {
	e := newEnv(t)
	e.stock.totals[passataIng] = 1000
	apply(t, e, stockTake("take-1", scan.MinusPack))
	e.stock.failOnce("GiveBack")
	if _, err := e.svc.Undo(context.Background(), "take-1"); err == nil {
		t.Fatal("Undo should fail when GiveBack fails")
	}
	if e.stock.totals[passataIng] != 300 {
		t.Fatalf("total = %v after a failed Undo, want 300", e.stock.totals[passataIng])
	}
	if got := undo(t, e, "take-1"); !got.Undone {
		t.Fatalf("retry = %+v", got)
	}
	if e.stock.totals[passataIng] != 1000 || len(e.stock.givenBack) != 1 {
		t.Errorf("total %v, GiveBack %d times; want 1000 and once", e.stock.totals[passataIng], len(e.stock.givenBack))
	}
}

func TestUndoGivesBackExactlyWhatThePortReported(t *testing.T) {
	e := newEnv(t)
	e.stock.totals[passataIng] = 1000
	apply(t, e, stockTake("take-1", scan.MinusPack))
	undo(t, e, "take-1")
	want := []service.TakenLot{{LotID: 900 + passataIng, LotJSON: `{"id":902}`, Taken: 700}}
	if len(e.stock.givenBack) != 1 || !reflect.DeepEqual(e.stock.givenBack[0], want) {
		t.Errorf("GiveBack got %+v, want %+v (the ledger keeps the takes verbatim)", e.stock.givenBack, want)
	}
}
