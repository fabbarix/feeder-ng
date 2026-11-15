package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/service"
	shopservice "github.com/fabbarix/feeder-ng/internal/shopping/service"
)

// B9-23 (RES-03): shop_tick and shop_untick through Apply and Sync. The scan service calls the Shopping List through
// its List port (shopservice.Service.Tick, TickExtra, Untick, UntickAddition), never over HTTP. A Tick is idempotent on
// the Shopping List's own client UUID (shopping_tick_additions.client_uuid), not the scan ledger (its kinds are Scans):
// a repeated UUID answers status duplicate with the same Lot. The User comes from the context, as for a Tick online.

func asUser(id int64) context.Context {
	return auth.ContextWithUser(context.Background(), auth.User{ID: id, DisplayName: "Sam"})
}

func tickOp(uuid string, ing int64, qty, covers float64) scan.Op {
	return scan.Op{ClientUUID: uuid, ScannedAt: "2026-11-09T10:20:00Z", Kind: scan.KindShopTick, ShopID: i64(1), IngredientID: ing,
		Quantity: qty, Covers: covers, RangeTo: "2026-11-15"}
}

func applyTick(t *testing.T, e *env, ctx context.Context, op scan.Op) scan.Result {
	t.Helper()
	res, err := e.svc.Apply(ctx, op)
	if err != nil {
		t.Fatalf("Apply(%s): %v", op.ClientUUID, err)
	}
	return res
}

func TestAShopTickTicksTheLineWithTheAmountTheCoversAndThePhonesTime(t *testing.T) {
	e := newEnv(t)
	res := applyTick(t, e, asUser(12), tickOp("tick-1", passataIng, 50, 150))
	if res.Status != scan.StatusApplied || res.Error != nil || res.Tick == nil || res.Tick.LotID == nil || res.Tick.Added != 50 || res.Scan != nil {
		t.Fatalf("Result = %+v / %+v; want applied with a Tick that added 50 and a Lot", res, res.Tick)
	}
	if len(e.list.ticks) != 1 {
		t.Fatalf("Tick calls = %+v, want one", e.list.ticks)
	}
	in := e.list.ticks[0]
	if in.IngredientID != passataIng || in.Quantity != 50 || in.Covers != 150 || in.ClientUUID != "tick-1" || in.UserID != 12 || in.To != "2026-11-15" ||
		in.ShopID == nil || *in.ShopID != 1 || !in.RequireOnList || in.TickedAt.IsZero() || in.TickedAt.Format("2006-01-02T15:04:05Z") != "2026-11-09T10:20:00Z" {
		t.Errorf("TickInput = %+v; want the op's amount, covers, UUID, Shop and range, the User from the context, the phone's time, RequireOnList", in)
	}
	if e.stock.lotCount() != 0 {
		t.Errorf("the scan service added a Lot itself: %d; the Shopping List adds it through Stock", e.stock.lotCount())
	}
}

func TestAShopTickWithNoRangeUsesTheDefaultRange(t *testing.T) {
	e := newEnv(t)
	op := tickOp("tick-1", passataIng, 50, 150)
	op.RangeTo = ""
	applyTick(t, e, asUser(12), op)
	if len(e.list.ticks) != 1 || e.list.ticks[0].To != "2026-11-15" {
		t.Errorf("Tick calls = %+v, want the default range end, 2026-11-15 (today + 7 days, capped at the 7 day Planning Horizon), as a Shop scan has", e.list.ticks)
	}
}

func TestAShopTickRepeatedIsADuplicateWithTheSameLot(t *testing.T) {
	e := newEnv(t)
	first := applyTick(t, e, asUser(12), tickOp("tick-1", passataIng, 50, 150))
	for i := 0; i < 2; i++ {
		again := applyTick(t, e, asUser(12), tickOp("tick-1", passataIng, 50, 150))
		if again.Status != scan.StatusDuplicate || again.Tick == nil || again.Tick.LotID == nil || *again.Tick.LotID != *first.Tick.LotID {
			t.Fatalf("retry %d = %+v / %+v, want a duplicate with the first Lot", i, again, again.Tick)
		}
	}
}

func TestAShopTickNamesWhoTickedTheLineBefore(t *testing.T) {
	e := newEnv(t)
	e.list.tickAlso = []shopservice.AlsoTicked{{Name: "Ana", Quantity: 50, By: "hand"}, {Name: "Sam", Quantity: 700, By: "scan"}}
	res := applyTick(t, e, asUser(12), tickOp("tick-1", passataIng, 50, 150))
	if res.Tick == nil || len(res.Tick.AlsoTickedBy) != 2 || res.Tick.AlsoTickedBy[0] != (scan.AlsoTickedBy{Name: "Ana", Quantity: 50, By: "hand"}) ||
		res.Tick.AlsoTickedBy[1] != (scan.AlsoTickedBy{Name: "Sam", Quantity: 700, By: "scan"}) {
		t.Errorf("Tick = %+v, want alsoTickedBy Ana's hand tick and Sam's scan, in order", res.Tick)
	}
}

func TestAShopTickWithoutAnAmountAddsNoLot(t *testing.T) {
	e := newEnv(t)
	res := applyTick(t, e, asUser(12), tickOp("tick-1", passataIng, 0, 150))
	if res.Status != scan.StatusApplied || res.Tick == nil || res.Tick.LotID != nil || res.Tick.Added != 0 {
		t.Errorf("Result = %+v / %+v; want applied with no Lot", res, res.Tick)
	}
}

func TestAShopTickOfAnExtraTicksTheExtra(t *testing.T) {
	e := newEnv(t)
	op := tickOp("tick-1", 0, 2000, 0)
	op.ExtraID = 9
	res := applyTick(t, e, asUser(12), op)
	if res.Status != scan.StatusApplied || res.Tick == nil || res.Tick.Added != 2000 {
		t.Fatalf("Result = %+v / %+v", res, res.Tick)
	}
	if len(e.list.extras) != 1 || e.list.extras[0].ID != 9 || e.list.extras[0].Quantity != 2000 || e.list.extras[0].ClientUUID != "tick-1" || len(e.list.ticks) != 0 {
		t.Errorf("TickExtra calls = %+v, Tick calls %+v; want the extra ticked with its UUID and no Line tick", e.list.extras, e.list.ticks)
	}
	if len(e.list.extraAt) != 1 || !e.list.extraAt[0].Equal(time.Date(2026, 11, 9, 10, 20, 0, 0, time.UTC)) {
		t.Errorf("extra tick times = %v, want the phone's 10:20 (reviewer: the offline order of extras)", e.list.extraAt)
	}
}

func TestAShopTickOfALineThatLeftTheListIsRejectedNotOnList(t *testing.T) {
	e := newEnv(t)
	e.list.tickErr = shopservice.ErrNotOnList
	res := applyTick(t, e, asUser(12), tickOp("tick-1", passataIng, 50, 150))
	if res.Status != scan.StatusRejected || res.Error == nil || res.Error.Code != service.CodeNotOnList || res.Tick != nil {
		t.Errorf("Result = %+v, want rejected not_on_list", res)
	}
	e.list.extraErr = shopservice.ErrNotFound
	op := tickOp("tick-2", 0, 5, 0)
	op.ExtraID = 9
	if res := applyTick(t, e, asUser(12), op); res.Status != scan.StatusRejected || res.Error == nil || res.Error.Code != service.CodeNotOnList {
		t.Errorf("an extra that is gone = %+v, want rejected not_on_list", res)
	}
}

func TestAShopTickOfAnIngredientThatIsGoneIsRejectedLikeAScan(t *testing.T) {
	e := newEnv(t)
	e.list.tickErr = shopservice.ErrUnknownIngredient
	res := applyTick(t, e, asUser(12), tickOp("tick-1", passataIng, 50, 150))
	if res.Status != scan.StatusRejected || res.Error == nil || res.Error.Code != service.CodeUnknownIngr {
		t.Errorf("Result = %+v, want rejected unknown_ingredient", res)
	}
}

func TestAnInvalidShopTickIsRejectedAndTouchesNothing(t *testing.T) {
	e := newEnv(t)
	op := tickOp("tick-1", passataIng, -5, 150)
	res := applyTick(t, e, asUser(12), op)
	if res.Status != scan.StatusRejected || res.Error == nil || res.Error.Code != service.CodeValidation || len(e.list.ticks) != 0 {
		t.Errorf("Result = %+v, Tick calls %+v; want rejected validation_failed and no call", res, e.list.ticks)
	}
}

func TestAShopUntickByUUIDUnticksThatAddition(t *testing.T) {
	e := newEnv(t)
	for i := 0; i < 2; i++ { // idempotent: the second finds nothing to do and is still applied
		res := applyTick(t, e, asUser(12), scan.Op{ClientUUID: "untick-1", ScannedAt: "2026-11-09T10:30:00Z", Kind: scan.KindShopUntick, TickClientUUID: "tick-1"})
		if res.Status != scan.StatusApplied || res.Tick != nil {
			t.Fatalf("untick %d = %+v, want applied with no tick", i, res)
		}
	}
	if len(e.list.unticks) != 2 || e.list.unticks[0] != "uuid:tick-1" {
		t.Errorf("untick calls = %v, want UntickAddition(tick-1)", e.list.unticks)
	}
}

func TestAShopUntickByLineUnticksTheLine(t *testing.T) {
	e := newEnv(t)
	res := applyTick(t, e, asUser(12), scan.Op{ClientUUID: "untick-1", ScannedAt: "2026-11-09T10:30:00Z", Kind: scan.KindShopUntick,
		IngredientID: passataIng, RangeTo: "2026-11-15"})
	if res.Status != scan.StatusApplied || len(e.list.unticks) != 1 || e.list.unticks[0] != "ing:"+itoa(passataIng)+":2026-11-15" {
		t.Errorf("Result = %+v untick calls = %v", res, e.list.unticks)
	}
}

func TestTicksAndScansSyncInTheOrderTheyWereMade(t *testing.T) {
	e := newEnv(t)
	ops := []scan.Op{
		tickOp("tick-1", passataIng, 50, 150),
		packScan("scan-1", mutti, 700),
		{ClientUUID: "untick-1", ScannedAt: "2026-11-09T10:30:00Z", Kind: scan.KindShopUntick, TickClientUUID: "tick-1"},
		tickOp("tick-2", milkIng, 0, 0),
	}
	results, err := e.svc.Sync(asUser(12), ops)
	if err != nil {
		t.Fatal(err)
	}
	got := []string{}
	for _, r := range results {
		got = append(got, r.ClientUUID+":"+string(r.Status))
	}
	want := []string{"tick-1:applied", "scan-1:applied", "untick-1:applied", "tick-2:applied"}
	if len(got) != 4 || got[0] != want[0] || got[1] != want[1] || got[2] != want[2] || got[3] != want[3] {
		t.Fatalf("results = %v, want %v", got, want)
	}
	if calls := e.list.calls; len(calls) != 4 || calls[0] != "tick:tick-1" || calls[1] != "after" || calls[2] != "untick" || calls[3] != "tick:tick-2" {
		t.Errorf("calls = %v, want tick, scan's AfterLot, untick, tick: the order the ops were made", calls)
	}
}

func TestOneRefusedTickDoesNotFailTheBatch(t *testing.T) {
	e := newEnv(t)
	e.list.tickErr = shopservice.ErrNotOnList
	results, err := e.svc.Sync(asUser(12), []scan.Op{tickOp("tick-1", passataIng, 50, 150), tickOp("tick-2", milkIng, 10, 10)})
	if err != nil || len(results) != 2 || results[0].Status != scan.StatusRejected || results[1].Status != scan.StatusApplied {
		t.Errorf("results = %+v, %v; want the first rejected and the second applied", results, err)
	}
}

func TestAScanThatTicksALineRecordsItsUUIDAndUserForTheAddition(t *testing.T) {
	e := newEnv(t)
	res := applyTick(t, e, asUser(12), packScan("scan-0001", mutti, 700))
	if res.Status != scan.StatusApplied || len(e.list.after) != 1 {
		t.Fatalf("Result = %+v, AfterLot calls %+v", res, e.list.after)
	}
	if in := e.list.after[0]; in.ClientUUID != "scan-0001" || in.UserID != 12 {
		t.Errorf("AfterLotInput = %+v, want the scan's client UUID and the User from the context", in)
	}
}

// B9-54 (RES 2): the answer carries `mine` and the time each earlier addition was ticked (RFC 3339, UTC).
func TestAShopTickAnswerCarriesMineAndTheTimeOfEachEarlierAddition(t *testing.T) {
	e := newEnv(t)
	at := time.Date(2026, 11, 9, 9, 15, 0, 0, time.UTC)
	e.list.tickAlso = []shopservice.AlsoTicked{{Name: "Sam", Quantity: 50, By: "hand", Mine: true, TickedAt: at}, {Name: "Ana", Quantity: 700, By: "scan", TickedAt: at.Add(time.Minute)}}
	res := applyTick(t, e, asUser(12), tickOp("tick-1", passataIng, 50, 150))
	if res.Tick == nil || len(res.Tick.AlsoTickedBy) != 2 {
		t.Fatalf("Tick = %+v, want two earlier additions", res.Tick)
	}
	a, b := res.Tick.AlsoTickedBy[0], res.Tick.AlsoTickedBy[1]
	if !a.Mine || a.TickedAt != "2026-11-09T09:15:00Z" || b.Mine || b.TickedAt != "2026-11-09T09:16:00Z" {
		t.Errorf("alsoTickedBy = %+v, want Mine and RFC 3339 times carried through", res.Tick.AlsoTickedBy)
	}
}
