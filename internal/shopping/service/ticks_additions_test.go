package service_test

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/service"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// B9-23 (SSP-01, SSP-02, RES-03): a Line is ticked by additions. Each tick by hand keeps its own Stock Lot, quantity,
// covered amount and client UUID (ADR 0024, migration 1576). The Line is milk (ml) here; the household date is Monday
// 2026-11-09 and the range ends 2026-11-15.

const rng = "2026-11-15"

var ctx = context.Background()

// needsMilk plans a Dinner on Tuesday that needs q ml of milk: the Line's need.
func needsMilk(e *env, q float64) {
	e.plan.meals = []shopping.Meal{dinner("2026-11-10", 1, shopping.Need{IngredientID: e.ids[milk], Quantity: q})}
}

func tickMilk(t *testing.T, e *env, in service.TickInput) service.TickResult {
	t.Helper()
	in.IngredientID, in.To = e.ids[milk], rng
	res, err := e.svc.Tick(ctx, in)
	if err != nil {
		t.Fatalf("Tick(%+v) = %v", in, err)
	}
	return res
}

func milkLine(t *testing.T, e *env) (shopping.Line, service.View) {
	t.Helper()
	v, err := e.svc.List(ctx, service.Query{To: rng})
	if err != nil {
		t.Fatal(err)
	}
	l, ok := v.LineFor(e.ids[milk])
	if !ok {
		t.Fatalf("no Line for milk in %+v", v.Lines)
	}
	return l, v
}

// tickOf is l.Tick, stopping the test when the Line carries none (instead of a nil dereference).
func tickOf(t *testing.T, l shopping.Line) *shopping.Tick {
	t.Helper()
	if l.Tick == nil {
		t.Fatalf("Line %+v has no Tick", l)
	}
	return l.Tick
}

func exTickOf(t *testing.T, e shopping.ExtraLine) *shopping.Tick {
	t.Helper()
	if e.Tick == nil {
		t.Fatalf("extra %+v has no Tick", e)
	}
	return e.Tick
}

func additionOf(t *testing.T, l shopping.Line, uuid string) shopping.Addition {
	t.Helper()
	if l.Tick == nil {
		t.Fatalf("Line %+v has no Tick", l)
	}
	for _, a := range tickOf(t, l).Additions {
		if a.ClientUUID == uuid {
			return a
		}
	}
	t.Fatalf("no addition %q in %+v", uuid, tickOf(t, l).Additions)
	return shopping.Addition{}
}

func TestATickByHandRecordsAnAdditionWithItsUserQuantityAndCovers(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	res := tickMilk(t, e, service.TickInput{Quantity: 400, ClientUUID: "u1", UserID: ana})
	l, v := milkLine(t, e)
	if !l.Ticked || l.More != 0 || l.Tick == nil || tickOf(t, l).By != "hand" || tickOf(t, l).Added != 400 || tickOf(t, l).Needed != 800 {
		t.Fatalf("Line = %+v Tick %+v; want ticked by hand, 400 added, covering 800", l, l.Tick)
	}
	a := additionOf(t, l, "u1")
	if a.By != "hand" || a.UserID != ana || a.Who != "Ana" || a.Quantity != 400 || a.Covers != 800 || res.LotID == nil || a.LotID != *res.LotID {
		t.Errorf("addition = %+v, want Ana's 400 ml by hand covering 800 on the tick's Lot", a)
	}
	if !a.TickedAt.Equal(startTime) || !a.SyncedAt.IsZero() {
		t.Errorf("TickedAt %v SyncedAt %v; want the time of the tick and no sync time for an online tick", a.TickedAt, a.SyncedAt)
	}
	if v.Progress.Ticked != 1 || res.Added != 400 || len(res.AlsoTickedBy) != 0 {
		t.Errorf("progress %+v, result %+v; want 1 ticked, Added 400, nobody else", v.Progress, res)
	}
}

func TestATickWithoutAddingIsAnAdditionOfZero(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	tickMilk(t, e, service.TickInput{ClientUUID: "u1", UserID: ana})
	l, _ := milkLine(t, e)
	a := additionOf(t, l, "u1")
	if !l.Ticked || tickOf(t, l).Added != 0 || a.Quantity != 0 || a.LotID != 0 || a.Covers != 800 {
		t.Errorf("Line %+v addition %+v; want ticked, nothing added, no Lot, covering 800", l, a)
	}
	if len(e.stock.adds) != 0 {
		t.Errorf("Stock adds = %+v, want none", e.stock.adds)
	}
}

func TestATickUsesTheCoversItIsGivenNotTheNeedNow(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	tickMilk(t, e, service.TickInput{Quantity: 400, ClientUUID: "u1", UserID: ana, Covers: 600}) // the phone showed 600
	l, _ := milkLine(t, e)
	if a := additionOf(t, l, "u1"); a.Covers != 600 || tickOf(t, l).Needed != 600 {
		t.Errorf("Covers %v Needed %v, want 600: the server uses covers, not the need at sync time", a.Covers, tickOf(t, l).Needed)
	}
}

func TestAQueuedTickKeepsThePhonesTimeAndRecordsWhenItSynced(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	at := startTime.Add(-90 * time.Minute)
	tickMilk(t, e, service.TickInput{Quantity: 400, ClientUUID: "u1", UserID: ana, TickedAt: at})
	l, _ := milkLine(t, e)
	if a := additionOf(t, l, "u1"); !a.TickedAt.Equal(at) || !a.SyncedAt.Equal(startTime) {
		t.Errorf("TickedAt %v SyncedAt %v; want the phone's time and the sync time %v", a.TickedAt, a.SyncedAt, startTime)
	}
}

func TestTheSameClientUUIDThreeTimesIsOneLotAndOneAddition(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	var first service.TickResult
	for i := 0; i < 3; i++ {
		res := tickMilk(t, e, service.TickInput{Quantity: 400, ClientUUID: "u1", UserID: ana})
		if i == 0 {
			first = res
		} else if res.Created || res.LotID == nil || *res.LotID != *first.LotID {
			t.Fatalf("retry %d = %+v, want the first Lot and Created false", i, res)
		}
	}
	l, _ := milkLine(t, e)
	if len(e.stock.lots) != 1 || e.stock.total(e.ids[milk]) != 400 || len(tickOf(t, l).Additions) != 1 || tickOf(t, l).Added != 400 {
		t.Errorf("Lots %d total %v additions %d added %v; want one of each", len(e.stock.lots), e.stock.total(e.ids[milk]), len(tickOf(t, l).Additions), tickOf(t, l).Added)
	}
}

func TestASecondUsersTickAddsItsOwnLotAndNamesTheFirst(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	first := tickMilk(t, e, service.TickInput{Quantity: 400, ClientUUID: "a", UserID: ana})
	second := tickMilk(t, e, service.TickInput{Quantity: 300, ClientUUID: "b", UserID: sam})
	if len(e.stock.lots) != 2 || first.LotID == nil || second.LotID == nil || *first.LotID == *second.LotID {
		t.Fatalf("Stock Lots = %+v, want two", e.stock.lots)
	}
	if len(first.AlsoTickedBy) != 0 {
		t.Errorf("first AlsoTickedBy = %+v, want none", first.AlsoTickedBy)
	}
	if len(second.AlsoTickedBy) != 1 || second.AlsoTickedBy[0] != (service.AlsoTicked{Name: "Ana", Quantity: 400, By: "hand"}) {
		t.Errorf("second AlsoTickedBy = %+v, want Ana's 400 by hand", second.AlsoTickedBy)
	}
	l, v := milkLine(t, e)
	if tickOf(t, l).Added != 700 || tickOf(t, l).Needed != 800 || len(tickOf(t, l).Additions) != 2 || tickOf(t, l).By != "hand" || v.Progress.Ticked != 1 {
		t.Errorf("Tick = %+v progress %+v; want 700 added in all, still covering 800, two additions, ticked once", l.Tick, v.Progress)
	}
	if tickOf(t, l).Additions[0].Who != "Ana" || tickOf(t, l).Additions[1].Who != "Sam" {
		t.Errorf("additions = %+v, want Ana's first (oldest first), then Sam's", tickOf(t, l).Additions)
	}
}

func TestTickingTheMoreRowCoversOnlyTheDifference(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	tickMilk(t, e, service.TickInput{Quantity: 800, ClientUUID: "a", UserID: ana})
	needsMilk(e, 1550) // a Recipe import
	l, v := milkLine(t, e)
	if !l.Ticked || math.Abs(l.More-750) > 1e-6 || v.Progress.Total != 2 || v.Complete {
		t.Fatalf("Line %+v progress %+v complete %v; want ticked with 750 more, 1 of 2, not complete", l, v.Progress, v.Complete)
	}
	tickMilk(t, e, service.TickInput{Quantity: 750, ClientUUID: "b", UserID: ana})
	l, v = milkLine(t, e)
	// The More row's tick covers the 750 on top of the 800 the tick covered: 1550 in all (reviewer: covers stack, so
	// that a tick of the More row without adding also clears it; see the next test).
	if b := additionOf(t, l, "b"); b.Covers != 1550 {
		t.Errorf("second addition Covers = %v, want 1550 (the difference on top of the 800 covered)", b.Covers)
	}
	if tickOf(t, l).Needed != 1550 || tickOf(t, l).Added != 1550 || l.More != 0 || !v.Complete {
		t.Errorf("Tick %+v More %v complete %v; want covering 1550, 1550 added, no more, complete", l.Tick, l.More, v.Complete)
	}
	if e.stock.total(e.ids[milk]) != 1550 {
		t.Errorf("Stock = %v, want 1550: the More row's tick added only the difference", e.stock.total(e.ids[milk]))
	}
}

func TestTickingTheMoreRowWithoutAddingSaysItIsCoveredAndTheMoreGoes(t *testing.T) {
	// SSP-02, decision SSP 3: "Tick without adding" on the More row means the User has the difference covered.
	e := newEnv(t)
	needsMilk(e, 800)
	tickMilk(t, e, service.TickInput{Quantity: 800, ClientUUID: "a", UserID: ana})
	needsMilk(e, 1550)
	tickMilk(t, e, service.TickInput{Quantity: 0, ClientUUID: "b", UserID: ana})
	l, v := milkLine(t, e)
	if !l.Ticked || l.More != 0 || !v.Complete || v.Progress.Total != 1 || tickOf(t, l).Added != 800 {
		t.Fatalf("Line %+v Tick %+v progress %+v complete %v; want ticked, no More, complete, 800 added", l, l.Tick, v.Progress, v.Complete)
	}
	if e.stock.total(e.ids[milk]) != 800 || len(e.stock.adds) != 1 {
		t.Errorf("Stock = %v after %d adds, want the first 800 only", e.stock.total(e.ids[milk]), len(e.stock.adds))
	}
	// Taking the More row's tick back (its untick) brings the More back; the first tick stays.
	if err := e.svc.UntickAddition(ctx, "b"); err != nil {
		t.Fatal(err)
	}
	if l, _ := milkLine(t, e); !l.Ticked || math.Abs(l.More-750) > 1e-6 || tickOf(t, l).Needed != 800 {
		t.Errorf("after untick of the More row's tick: Line %+v Tick %+v; want 750 more again, covering 800", l, l.Tick)
	}
}

func TestTickingTheMoreRowWithLessThanTheMoreLeavesNothingMore(t *testing.T) {
	// The More row ticked with a smaller pack: the tick covers the More, as a first tick covers its Line.
	e := newEnv(t)
	needsMilk(e, 800)
	tickMilk(t, e, service.TickInput{Quantity: 1000, ClientUUID: "a", UserID: ana}) // a 1 l pack: 200 over
	needsMilk(e, 1550)                                                              // 550 more than the 1000 in Stock
	if l, _ := milkLine(t, e); math.Abs(l.More-550) > 1e-6 {
		t.Fatalf("More = %v, want 550", l.More)
	}
	tickMilk(t, e, service.TickInput{Quantity: 500, ClientUUID: "b", UserID: ana})
	if l, v := milkLine(t, e); l.More != 0 || !v.Complete {
		t.Errorf("Line %+v complete %v; want no More after the More row's tick", l, v.Complete)
	}
	// The need grows again by 300: that much reappears.
	needsMilk(e, 1850)
	if l, _ := milkLine(t, e); math.Abs(l.More-300) > 1e-6 {
		t.Errorf("More after a second growth = %v, want 300", l.More)
	}
}

func TestASecondShoppersTickOfACoveredLineKeepsItsCovers(t *testing.T) {
	// RES 2: the Line has no More when Sam's queued tick of the same need syncs; it covers what Sam saw, not more.
	e := newEnv(t)
	needsMilk(e, 800)
	tickMilk(t, e, service.TickInput{Quantity: 800, ClientUUID: "a", UserID: ana})
	tickMilk(t, e, service.TickInput{Quantity: 800, ClientUUID: "b", UserID: sam, Covers: 800})
	l, _ := milkLine(t, e)
	if b := additionOf(t, l, "b"); b.Covers != 800 || tickOf(t, l).Needed != 800 || tickOf(t, l).Added != 1600 {
		t.Errorf("addition %+v Tick %+v; want covers 800, needed 800, 1600 added", b, l.Tick)
	}
	// Both bought it: a need grown by 500 is already in Stock.
	needsMilk(e, 1300)
	if l, _ := milkLine(t, e); l.More != 0 {
		t.Errorf("More = %v, want 0: the second purchase covers the growth", l.More)
	}
}

func TestATickWithRequireOnListRefusesALineThatIsNotOnTheList(t *testing.T) {
	e := newEnv(t)
	// Not on the list at all.
	if _, err := e.svc.Tick(ctx, service.TickInput{IngredientID: e.ids[milk], To: rng, Quantity: 400, ClientUUID: "x", RequireOnList: true}); !errors.Is(err, service.ErrNotOnList) {
		t.Fatalf("off-list = %v, want ErrNotOnList", err)
	}
	if len(e.stock.lots) != 0 {
		t.Fatalf("a refused tick added Stock: %+v", e.stock.lots)
	}
	// Without the flag the existing behaviour holds: an off-list tick works.
	if _, err := e.svc.Tick(ctx, service.TickInput{IngredientID: e.ids[milk], To: rng, Quantity: 400, ClientUUID: "y"}); err != nil {
		t.Fatalf("off-list without the flag = %v, want nil", err)
	}
}

func TestATickWithRequireOnListAcceptsAnOpenLineAndATickedLine(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	if _, err := e.svc.Tick(ctx, service.TickInput{IngredientID: e.ids[milk], To: rng, Quantity: 400, ClientUUID: "a", UserID: ana, RequireOnList: true}); err != nil {
		t.Fatalf("open Line = %v", err)
	}
	// RES 2: someone else ticked it already; this is the "ticked twice" case, not a refusal.
	if _, err := e.svc.Tick(ctx, service.TickInput{IngredientID: e.ids[milk], To: rng, Quantity: 400, ClientUUID: "b", UserID: sam, RequireOnList: true}); err != nil {
		t.Fatalf("ticked Line = %v", err)
	}
}

func TestATickWithRequireOnListRefusesALineMarkedNotNeeded(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	if err := e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: e.ids[milk], To: rng}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Tick(ctx, service.TickInput{IngredientID: e.ids[milk], To: rng, Quantity: 400, ClientUUID: "a", RequireOnList: true}); !errors.Is(err, service.ErrNotOnList) {
		t.Errorf("Not needed Line = %v, want ErrNotOnList", err)
	}
}

// ---- Change and Take back ----

func ticked400(t *testing.T) (*env, int64) {
	t.Helper()
	e := newEnv(t)
	needsMilk(e, 800)
	res := tickMilk(t, e, service.TickInput{Quantity: 400, ClientUUID: "a", UserID: ana})
	return e, *res.LotID
}

func change(e *env, in service.ChangeInput) (service.ChangeResult, error) {
	in.IngredientID, in.To = e.ids[milk], rng
	return e.svc.ChangeTick(ctx, in)
}

func TestChangeTickSetsTheQuantityTheTickAddedUpAndDown(t *testing.T) {
	e, lot := ticked400(t)
	res, err := change(e, service.ChangeInput{Quantity: 600, UserID: ana})
	if err != nil || res.Quantity != 600 || res.LotID == nil || *res.LotID != lot {
		t.Fatalf("up = %+v, %v", res, err)
	}
	if got := e.stock.total(e.ids[milk]); got != 600 {
		t.Fatalf("Stock = %v after Change to 600, want 600", got)
	}
	if _, err := change(e, service.ChangeInput{Quantity: 100, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	l, _ := milkLine(t, e)
	if got := e.stock.total(e.ids[milk]); got != 100 || tickOf(t, l).Added != 100 || additionOf(t, l, "a").Quantity != 100 || !l.Ticked {
		t.Errorf("Stock %v Added %v; want 100 and still ticked", got, tickOf(t, l).Added)
	}
}

func TestChangeTickMovesTheLotByTheDifferenceWhenPartOfItWasUsed(t *testing.T) {
	e, lot := ticked400(t)
	e.stock.lots[0].Quantity = 150 // a Cooked Planned Meal used 250
	if _, err := change(e, service.ChangeInput{Quantity: 600, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	if len(e.stock.adjusts) != 1 || e.stock.adjusts[0] != [2]float64{float64(lot), 350} {
		t.Errorf("AdjustLot calls = %v, want the Lot at 150 + 200 = 350", e.stock.adjusts)
	}
	l, _ := milkLine(t, e)
	if additionOf(t, l, "a").Quantity != 600 {
		t.Errorf("the addition says %v, want 600: it records what the tick added", additionOf(t, l, "a").Quantity)
	}
}

func TestChangeTickToZeroIsTakeBackAndKeepsTheTick(t *testing.T) {
	e, lot := ticked400(t)
	res, err := change(e, service.ChangeInput{Quantity: 0, UserID: ana})
	if err != nil || res.Quantity != 0 || res.LotID != nil {
		t.Fatalf("Take back = %+v, %v; want quantity 0 and no Lot", res, err)
	}
	if len(e.stock.takes) != 1 || e.stock.takes[0] != [2]float64{float64(lot), 400} {
		t.Errorf("TakeBack calls = %v, want the tick's Lot and 400", e.stock.takes)
	}
	l, _ := milkLine(t, e)
	if a := additionOf(t, l, "a"); !l.Ticked || tickOf(t, l).Added != 0 || a.Quantity != 0 || a.LotID != 0 || e.stock.total(e.ids[milk]) != 0 {
		t.Errorf("Line %+v addition %+v; want the tick kept with nothing added", l, a)
	}
}

func TestTakeBackAfterAPartialCookedTakesOnlyWhatIsLeft(t *testing.T) {
	e, _ := ticked400(t)
	e.stock.lots = append(e.stock.lots, stockLot(99, e.ids[milk], 1000)) // an older Lot stays
	e.stock.lots[0].Quantity = 150
	if _, err := change(e, service.ChangeInput{Quantity: 0, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	if got := e.stock.total(e.ids[milk]); got != 1000 {
		t.Errorf("Stock = %v, want only the older 1000 left", got)
	}
}

func TestTheUndoOfATakeBackPutsTheSameAmountBackAsAFreshLot(t *testing.T) {
	e, _ := ticked400(t)
	if _, err := change(e, service.ChangeInput{Quantity: 0, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	res, err := change(e, service.ChangeInput{Quantity: 400, UserID: ana}) // the toast's Undo: the previous quantity
	if err != nil || res.Quantity != 400 || res.LotID == nil {
		t.Fatalf("Undo = %+v, %v", res, err)
	}
	if got := e.stock.total(e.ids[milk]); got != 400 {
		t.Errorf("Stock = %v, want 400 back", got)
	}
	l, _ := milkLine(t, e)
	if a := additionOf(t, l, "a"); a.Quantity != 400 || a.LotID != *res.LotID || tickOf(t, l).Added != 400 {
		t.Errorf("addition = %+v, want 400 on the restored Lot", a)
	}
}

func TestChangeOfATickWithoutAddingAddsALot(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	tickMilk(t, e, service.TickInput{ClientUUID: "a", UserID: ana})
	res, err := change(e, service.ChangeInput{Quantity: 500, UserID: ana})
	if err != nil || res.LotID == nil || res.Quantity != 500 || e.stock.total(e.ids[milk]) != 500 {
		t.Errorf("Change = %+v, %v, Stock %v; want a Lot of 500", res, err, e.stock.total(e.ids[milk]))
	}
}

func TestChangeTickActsOnTheUsersOwnLatestAdditionOnly(t *testing.T) {
	e, _ := ticked400(t) // Ana's
	second := tickMilk(t, e, service.TickInput{Quantity: 300, ClientUUID: "b", UserID: sam})
	if _, err := change(e, service.ChangeInput{Quantity: 0, UserID: sam}); err != nil {
		t.Fatal(err)
	}
	if len(e.stock.takes) != 1 || e.stock.takes[0][0] != float64(*second.LotID) {
		t.Errorf("TakeBack calls = %v, want only Sam's Lot %d", e.stock.takes, *second.LotID)
	}
	l, _ := milkLine(t, e)
	if additionOf(t, l, "a").Quantity != 400 || additionOf(t, l, "b").Quantity != 0 || tickOf(t, l).Added != 400 {
		t.Errorf("additions = %+v; want Ana's 400 untouched and Sam's 0", tickOf(t, l).Additions)
	}
	// A User with no addition of their own has nothing to change.
	if _, err := change(e, service.ChangeInput{Quantity: 5, UserID: 99}); !errors.Is(err, service.ErrNotFound) {
		t.Errorf("a stranger's Change = %v, want ErrNotFound", err)
	}
}

func TestChangeTickWithAClientUUIDAddressesThatAddition(t *testing.T) {
	// PRODUCT QUESTION for the user: the Line sheet offers Take back on every row, so a UUID reaches any User's addition.
	e, _ := ticked400(t) // Ana's, "a"
	second := tickMilk(t, e, service.TickInput{Quantity: 300, ClientUUID: "b", UserID: sam})
	if _, err := change(e, service.ChangeInput{Quantity: 0, UserID: ana, ClientUUID: "b"}); err != nil {
		t.Fatal(err)
	}
	if len(e.stock.takes) != 1 || e.stock.takes[0] != [2]float64{float64(*second.LotID), 300} {
		t.Errorf("TakeBack calls = %v, want only the addressed Lot", e.stock.takes)
	}
	if _, err := change(e, service.ChangeInput{Quantity: 5, UserID: ana, ClientUUID: "nope"}); !errors.Is(err, service.ErrNotFound) {
		t.Errorf("unknown UUID = %v, want ErrNotFound", err)
	}
}

func TestChangeTickRefusesATickAScanMade(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	lot, _, _ := e.stock.AddLot(ctx, service.StockAdd{IngredientID: e.ids[milk], Quantity: 800, ClientUUID: "scan-1"})
	if eff, err := e.svc.AfterLot(ctx, service.AfterLotInput{IngredientID: e.ids[milk], To: rng, LotID: lot, Quantity: 800, ClientUUID: "scan-1", UserID: sam}); err != nil || !eff.Ticked {
		t.Fatalf("AfterLot = %+v, %v; want the Line ticked", eff, err)
	}
	if _, err := change(e, service.ChangeInput{Quantity: 0, UserID: sam, ClientUUID: "scan-1"}); !errors.Is(err, service.ErrNotByHand) {
		t.Errorf("by UUID = %v, want ErrNotByHand", err)
	}
	if _, err := change(e, service.ChangeInput{Quantity: 0, UserID: sam}); !errors.Is(err, service.ErrNotByHand) {
		t.Errorf("a Line ticked by a Scan alone = %v, want ErrNotByHand", err)
	}
	if len(e.stock.takes) != 0 || e.stock.total(e.ids[milk]) != 800 {
		t.Errorf("takes %v Stock %v; want the scanned Lot untouched", e.stock.takes, e.stock.total(e.ids[milk]))
	}
}

func TestChangeTickToTheSameQuantityTouchesNothingAndStaysQuiet(t *testing.T) {
	e, _ := ticked400(t)
	events := e.bus.count(service.Topic)
	if _, err := change(e, service.ChangeInput{Quantity: 400, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	if len(e.stock.adjusts)+len(e.stock.takes) != 0 || e.bus.count(service.Topic) != events {
		t.Errorf("adjusts %v takes %v events %d -> %d; want no Stock call and no event", e.stock.adjusts, e.stock.takes, events, e.bus.count(service.Topic))
	}
}

func TestAChangePublishesAShoppingEvent(t *testing.T) {
	e, _ := ticked400(t)
	events := e.bus.count(service.Topic)
	if _, err := change(e, service.ChangeInput{Quantity: 450, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	if e.bus.count(service.Topic) != events+1 {
		t.Errorf("events %d -> %d, want one more", events, e.bus.count(service.Topic))
	}
}

func TestChangeTickRefusesWhatItCannotDo(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	if _, err := change(e, service.ChangeInput{Quantity: 5, UserID: ana}); !errors.Is(err, service.ErrNotFound) {
		t.Errorf("no tick = %v, want ErrNotFound", err)
	}
	tickMilk(t, e, service.TickInput{Quantity: 400, ClientUUID: "a", UserID: ana})
	for _, q := range []float64{-1, math.NaN(), math.Inf(1)} {
		if _, err := change(e, service.ChangeInput{Quantity: q, UserID: ana}); !errors.Is(err, service.ErrInvalid) {
			t.Errorf("Change to %v = %v, want ErrInvalid", q, err)
		}
	}
}

// ---- Untick and Undo ----

func TestUntickTakesBackEveryHandAdditionAndLeavesAScansLot(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	scanLot, _, _ := e.stock.AddLot(ctx, service.StockAdd{IngredientID: e.ids[milk], Quantity: 800, ClientUUID: "scan-1"})
	if _, err := e.svc.AfterLot(ctx, service.AfterLotInput{IngredientID: e.ids[milk], To: rng, LotID: scanLot, Quantity: 800, ClientUUID: "scan-1", UserID: sam}); err != nil {
		t.Fatal(err)
	}
	a := tickMilk(t, e, service.TickInput{Quantity: 400, ClientUUID: "a", UserID: ana})
	b := tickMilk(t, e, service.TickInput{Quantity: 300, ClientUUID: "b", UserID: sam})
	if err := e.svc.Untick(ctx, e.ids[milk], rng); err != nil {
		t.Fatal(err)
	}
	taken := map[float64]float64{}
	for _, tk := range e.stock.takes {
		taken[tk[0]] = tk[1]
	}
	if len(taken) != 2 || taken[float64(*a.LotID)] != 400 || taken[float64(*b.LotID)] != 300 {
		t.Errorf("TakeBack calls = %v, want both hand Lots and not the scanned one", e.stock.takes)
	}
	if e.stock.total(e.ids[milk]) != 800 {
		t.Errorf("Stock = %v, want the scan's 800 left", e.stock.total(e.ids[milk]))
	}
	// The scan's 800 still covers the need, so there is no open Line either: the Line is gone, not ticked.
	if l, ok := milkLineIf(t, e); ok && (l.Ticked || l.Tick != nil) {
		t.Errorf("Line after untick = %+v, want it no longer ticked", l)
	}
	if ticks, _ := e.st.Ticks(ctx, rng); len(ticks) != 0 {
		t.Errorf("ticks after untick = %+v, want none", ticks)
	}
}

// milkLineIf is the milk Line when the list has one (a Line Stock covers and nobody ticked is not on the list).
func milkLineIf(t *testing.T, e *env) (shopping.Line, bool) {
	t.Helper()
	v, err := e.svc.List(ctx, service.Query{To: rng})
	if err != nil {
		t.Fatal(err)
	}
	return v.LineFor(e.ids[milk])
}

func TestUntickAdditionTakesBackThatAdditionOnly(t *testing.T) {
	e, _ := ticked400(t)
	second := tickMilk(t, e, service.TickInput{Quantity: 300, ClientUUID: "b", UserID: sam})
	if err := e.svc.UntickAddition(ctx, "b"); err != nil {
		t.Fatal(err)
	}
	if len(e.stock.takes) != 1 || e.stock.takes[0] != [2]float64{float64(*second.LotID), 300} {
		t.Errorf("TakeBack calls = %v, want Sam's Lot only", e.stock.takes)
	}
	l, _ := milkLine(t, e)
	if !l.Ticked || len(tickOf(t, l).Additions) != 1 || tickOf(t, l).Additions[0].ClientUUID != "a" || tickOf(t, l).Added != 400 {
		t.Errorf("Line = %+v Tick %+v; want still ticked by Ana's addition alone", l, l.Tick)
	}
	// The last addition's untick unticks the Line; an unknown or repeated UUID changes nothing.
	for _, uuid := range []string{"a", "a", "nope"} {
		if err := e.svc.UntickAddition(ctx, uuid); err != nil {
			t.Fatalf("UntickAddition(%q) = %v", uuid, err)
		}
	}
	if l, _ := milkLine(t, e); l.Ticked || e.stock.total(e.ids[milk]) != 0 || len(e.stock.takes) != 2 {
		t.Errorf("Line %+v Stock %v takes %v; want open, no Stock, two takes in all", l, e.stock.total(e.ids[milk]), e.stock.takes)
	}
}

func TestUntickAdditionBeforeTheTickLeavesNothing(t *testing.T) {
	// RES-03: "shop_untick after shop_tick in one batch leaves no Stock Lot".
	e := newEnv(t)
	needsMilk(e, 800)
	tickMilk(t, e, service.TickInput{Quantity: 400, ClientUUID: "a", UserID: ana})
	if err := e.svc.UntickAddition(ctx, "a"); err != nil {
		t.Fatal(err)
	}
	if e.stock.total(e.ids[milk]) != 0 {
		t.Errorf("Stock = %v, want none", e.stock.total(e.ids[milk]))
	}
}

func TestAScanTickIsAnAdditionByScanAndItsUndoRemovesIt(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	lot, _, _ := e.stock.AddLot(ctx, service.StockAdd{IngredientID: e.ids[milk], Quantity: 1000, ClientUUID: "scan-1"})
	if _, err := e.svc.AfterLot(ctx, service.AfterLotInput{IngredientID: e.ids[milk], To: rng, LotID: lot, Quantity: 1000, ClientUUID: "scan-1", UserID: sam}); err != nil {
		t.Fatal(err)
	}
	l, _ := milkLine(t, e)
	a := additionOf(t, l, "scan-1")
	if !l.Ticked || tickOf(t, l).By != "scan" || tickOf(t, l).Added != 1000 || a.By != "scan" || a.LotID != lot || a.Quantity != 1000 || a.Covers != 800 || a.UserID != sam || a.Who != "Sam" {
		t.Fatalf("Line %+v addition %+v; want a scan tick: by scan, the scanned Lot, 1000 added, covering 800, Sam", l, a)
	}
	if err := e.svc.UndoLot(ctx, service.UndoLotInput{IngredientID: e.ids[milk], To: rng, Quantity: 1000, Unmark: true, LotID: lot}); err != nil {
		t.Fatal(err)
	}
	// The fake Stock keeps the scanned Lot (the scan service removes it), so the Line is covered and gone, not ticked.
	if l, ok := milkLineIf(t, e); ok && (l.Ticked || l.Tick != nil) {
		t.Errorf("Line after the Scan's Undo = %+v, want it no longer ticked", l)
	}
	if ticks, _ := e.st.Ticks(ctx, rng); len(ticks) != 0 {
		t.Errorf("ticks after the Scan's Undo = %+v, want none", ticks)
	}
}

// ---- SSP-02 at the service ----

func TestAGrownNeedAfterATickMakesTheListNotCompleteAndCountsTheMoreRow(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	tickMilk(t, e, service.TickInput{Quantity: 800, ClientUUID: "a", UserID: ana})
	if _, v := milkLine(t, e); !v.Complete || v.Progress.Total != 1 {
		t.Fatalf("before growth: progress %+v complete %v", v.Progress, v.Complete)
	}
	needsMilk(e, 1550)
	l, v := milkLine(t, e)
	if !l.Ticked || math.Abs(l.More-750) > 1e-6 || v.Complete || v.Progress.Total != 2 || v.Progress.Ticked != 1 {
		t.Errorf("Line %+v progress %+v complete %v; want 750 more, 1 of 2, not complete", l, v.Progress, v.Complete)
	}
}

func TestNotNeededOnTheMoreRowTakesOnlyTheDifferenceOff(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	tickMilk(t, e, service.TickInput{Quantity: 800, ClientUUID: "a", UserID: ana})
	// A ticked Line with nothing more is still refused, as before.
	if err := e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: e.ids[milk], To: rng}); !errors.Is(err, service.ErrNotOnList) {
		t.Fatalf("Not needed on a covered ticked Line = %v, want ErrNotOnList", err)
	}
	needsMilk(e, 1550)
	if err := e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: e.ids[milk], To: rng}); err != nil {
		t.Fatalf("Not needed on the more row = %v", err)
	}
	nn, err := e.st.NotNeeded(ctx, rng)
	if err != nil || len(nn) != 1 || math.Abs(nn[e.ids[milk]].Needed-750) > 1e-6 {
		t.Fatalf("Not needed marks = %+v, %v; want one of 750 (the more)", nn, err)
	}
	l, v := milkLine(t, e)
	if !l.Ticked || l.More != 0 || v.Progress.Total != 1 || !v.Complete || len(v.NotNeeded) != 0 {
		t.Errorf("Line %+v progress %+v NotNeeded %v; want the ticked Line alone, complete", l, v.Progress, v.NotNeeded)
	}
}

// ---- Ingredient extras ----

func TestATickedIngredientExtraCarriesItsTickAndChangeAndTakeBackWork(t *testing.T) {
	e := newEnv(t)
	x, err := e.svc.AddExtra(ctx, service.ExtraInput{IngredientID: e.ids[milk], Quantity: 2000})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.TickExtra(ctx, x.ID, 2000, nil, "x1"); err != nil {
		t.Fatal(err)
	}
	extra := func() shopping.ExtraLine {
		v, _ := e.svc.List(ctx, service.Query{To: rng})
		for _, ex := range v.Extras {
			if ex.ID == x.ID {
				return ex
			}
		}
		t.Fatal("extra not in the list")
		return shopping.ExtraLine{}
	}
	if ex := extra(); ex.Tick == nil || exTickOf(t, ex).Added != 2000 || exTickOf(t, ex).By != "hand" || len(exTickOf(t, ex).Additions) != 1 || exTickOf(t, ex).Additions[0].ClientUUID != "x1" {
		t.Fatalf("extra Tick = %+v, want 2000 added by hand with its addition", ex.Tick)
	}
	if res, err := e.svc.ChangeExtraTick(ctx, x.ID, 2500); err != nil || res.Quantity != 2500 || e.stock.total(e.ids[milk]) != 2500 {
		t.Fatalf("Change up = %+v, %v, Stock %v", res, err, e.stock.total(e.ids[milk]))
	}
	if ex := extra(); exTickOf(t, ex).Added != 2500 || ex.Quantity != 0 {
		t.Errorf("after Change extra Tick %+v Quantity %v; want 2500 added and nothing left to get", ex.Tick, ex.Quantity)
	}
	if _, err := e.svc.ChangeExtraTick(ctx, x.ID, 0); err != nil {
		t.Fatal(err)
	}
	if ex := extra(); !ex.Ticked || exTickOf(t, ex).Added != 0 || e.stock.total(e.ids[milk]) != 0 {
		t.Errorf("after Take back extra %+v Stock %v; want it ticked with nothing added and no Stock", ex, e.stock.total(e.ids[milk]))
	}
	if _, err := e.svc.ChangeExtraTick(ctx, 9999, 1); !errors.Is(err, service.ErrNotFound) {
		t.Errorf("unknown extra = %v, want ErrNotFound", err)
	}
	if _, err := e.svc.ChangeExtraTick(ctx, x.ID, -1); !errors.Is(err, service.ErrInvalid) {
		t.Errorf("negative = %v, want ErrInvalid", err)
	}
}

// ---- Extras 1 and 2: Snapshot and the Price behind a priced fallback ----

func TestSnapshotIsTheListWithoutPricesPacksOrTheLedger(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	e.products.packs = map[int64]shopping.Pack{e.ids[milk]: {ProductID: 1, Name: "Milk 1 l", Size: 1000}}
	snap, err := e.svc.Snapshot(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	want, _ := e.svc.List(ctx, service.Query{})
	if len(snap.Lines) != 1 || snap.Lines[0].IngredientID != e.ids[milk] || snap.Lines[0].Quantity != 800 || snap.From != want.From || snap.To != want.To {
		t.Fatalf("Snapshot = %+v, want the same Lines and range as List", snap)
	}
	e2 := newEnv(t)
	needsMilk(e2, 800)
	if _, err := e2.svc.Snapshot(ctx, ""); err != nil {
		t.Fatal(err)
	}
	if len(e2.products.lastBoughtShop)+len(e2.products.priceShop)+len(e2.products.pricedAskedAbout) != 0 {
		t.Errorf("Snapshot asked Products about packs or prices: %v %v %v", e2.products.lastBoughtShop, e2.products.priceShop, e2.products.pricedAskedAbout)
	}
}

func TestSnapshotTakesAnExplicitRangeEnd(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800) // Tuesday 2026-11-10
	snap, err := e.svc.Snapshot(ctx, "2026-11-09")
	if err != nil || len(snap.Lines) != 0 || snap.To != "2026-11-09" {
		t.Errorf("Snapshot until Monday = %+v, %v; want an empty list ending on Monday", snap, err)
	}
}

func TestThePackOfAPricedFallbackCarriesTheDateCentsAndShopOfItsPrice(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	e.products.priced = map[int64]shopping.Pack{e.ids[milk]: {ProductID: 7, Name: "Milk 1 l", Size: 1000}}
	e.products.prices = map[int64]int{7: 299}
	e.products.pricedWhen = map[int64]struct {
		Date   stock.Date
		ShopID int64
	}{7: {Date: "2026-11-14", ShopID: 2}}
	l, _ := milkLine(t, e)
	if l.Pack == nil || l.Pack.Bought || l.Pack.Price == nil || *l.Pack.Price != (shopping.PackPrice{Cents: 299, Date: "2026-11-14", ShopID: 2}) {
		t.Fatalf("pack = %+v, want the priced fallback with Price 299 cents, 2026-11-14, Shop 2", l.Pack)
	}
	// Once bought the pack is the Product last bought and carries no Price.
	e.products.packs = map[int64]shopping.Pack{e.ids[milk]: {ProductID: 7, Name: "Milk 1 l", Size: 1000}}
	if l, _ := milkLine(t, e); l.Pack == nil || !l.Pack.Bought || l.Pack.Price != nil {
		t.Errorf("bought pack = %+v, want no Price", l.Pack)
	}
}

// ---- Stock under every sequence (reviewer) ----

func TestTheUndoOfATakeBackAfterAPartialCookedPutsBackOnlyWhatWasTaken(t *testing.T) {
	e, _ := ticked400(t)
	e.stock.lots[0].Quantity = 150 // a Cooked Planned Meal used 250
	if _, err := change(e, service.ChangeInput{Quantity: 0, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	if got := e.stock.total(e.ids[milk]); got != 0 {
		t.Fatalf("Stock after Take back = %v, want 0", got)
	}
	res, err := change(e, service.ChangeInput{Quantity: 400, UserID: ana}) // the toast's Undo
	if err != nil || res.LotID == nil || res.Quantity != 400 {
		t.Fatalf("Undo = %+v, %v", res, err)
	}
	if got := e.stock.total(e.ids[milk]); got != 150 {
		t.Errorf("Stock after Undo = %v, want the 150 that was taken back, not 400 (250 were cooked)", got)
	}
	// Change down below what was cooked, then up again: Stock follows the Lot, never below 0 and never doubled.
	if _, err := change(e, service.ChangeInput{Quantity: 100, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	if got := e.stock.total(e.ids[milk]); got != 0 {
		t.Errorf("Stock after Change to 100 = %v, want 0 (250 of it were cooked)", got)
	}
	if _, err := change(e, service.ChangeInput{Quantity: 500, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	if got := e.stock.total(e.ids[milk]); got != 250 {
		t.Errorf("Stock after Change to 500 = %v, want 250 (500 less the 250 cooked)", got)
	}
	l, _ := milkLine(t, e)
	if a := additionOf(t, l, "a"); a.Quantity != 500 || tickOf(t, l).Added != 500 {
		t.Errorf("addition %+v, want 500 added", a)
	}
	// Untick takes back the rest and leaves nothing behind.
	if err := e.svc.Untick(ctx, e.ids[milk], rng); err != nil {
		t.Fatal(err)
	}
	if got := e.stock.total(e.ids[milk]); got != 0 {
		t.Errorf("Stock after untick = %v, want 0", got)
	}
}

func TestChangeAfterTheLotWasUsedUpAddsOnlyTheDifference(t *testing.T) {
	e, _ := ticked400(t)
	e.stock.lots = nil // the Lot was used up by a Cooked Planned Meal
	if _, err := change(e, service.ChangeInput{Quantity: 300, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	if got := e.stock.total(e.ids[milk]); got != 0 || len(e.stock.adds) != 1 {
		t.Errorf("Stock = %v after %d adds, want nothing new: 300 is less than the 400 used", got, len(e.stock.adds))
	}
	if _, err := change(e, service.ChangeInput{Quantity: 600, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	if got := e.stock.total(e.ids[milk]); got != 200 {
		t.Errorf("Stock = %v, want 200 (600 less the 400 used)", got)
	}
	// Take back and its Undo of the fresh Lot.
	if _, err := change(e, service.ChangeInput{Quantity: 0, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	if _, err := change(e, service.ChangeInput{Quantity: 600, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	if got := e.stock.total(e.ids[milk]); got != 200 {
		t.Errorf("Stock after Take back and Undo = %v, want 200 again", got)
	}
}

func TestTheUndoOfAnExtrasTakeBackMovesGotByWhatStockGotBack(t *testing.T) {
	e := newEnv(t)
	x, err := e.svc.AddExtra(ctx, service.ExtraInput{IngredientID: e.ids[milk], Quantity: 2000})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.TickExtra(ctx, x.ID, 2000, nil, "x1"); err != nil {
		t.Fatal(err)
	}
	e.stock.lots[0].Quantity = 500 // 1500 cooked
	if _, err := e.svc.ChangeExtraTick(ctx, x.ID, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.ChangeExtraTick(ctx, x.ID, 2000); err != nil { // Undo
		t.Fatal(err)
	}
	if got := e.stock.total(e.ids[milk]); got != 500 {
		t.Errorf("Stock = %v, want the 500 taken back, put back", got)
	}
	extras, err := e.st.Extras(ctx, "2026-11-09")
	if err != nil {
		t.Fatal(err)
	}
	for _, ex := range extras {
		if ex.ID == x.ID && ex.Got != 2000 {
			t.Errorf("got = %v, want 2000 again after the Undo", ex.Got)
		}
	}
}

func TestAnUntickOfAnAdditionWithUnknownQuantityNeverWritesInfinity(t *testing.T) {
	// A tick from before migration 1560: its addition has a Lot and no quantity.
	e := newEnv(t)
	needsMilk(e, 800)
	lot, _, _ := e.stock.AddLot(ctx, service.StockAdd{IngredientID: e.ids[milk], Quantity: 800})
	if err := e.st.SetTick(ctx, rng, shopping.Tick{IngredientID: e.ids[milk], Needed: 800, By: "hand"}, &lot); err != nil {
		t.Fatal(err)
	}
	e.stock.lots[0].Quantity = 300 // 500 cooked
	l, _ := milkLine(t, e)
	if tk := tickOf(t, l); math.IsInf(tk.Added, 0) || !tk.AddedUnknown {
		t.Fatalf("Tick %+v; want a finite Added and AddedUnknown", tk)
	}
	if _, err := change(e, service.ChangeInput{Quantity: 0, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	if got := e.stock.total(e.ids[milk]); got != 0 {
		t.Errorf("Stock = %v, want what was left taken back", got)
	}
	adds, err := e.st.LineAdditions(ctx, rng, e.ids[milk])
	if err != nil || len(adds) != 1 || adds[0].Quantity != 0 || math.IsInf(adds[0].Used, 0) {
		t.Fatalf("additions = %+v, %v; want one of 0 with a finite Used", adds, err)
	}
	// Change to 400: unknown what was used, so a fresh Lot of 400.
	if _, err := change(e, service.ChangeInput{Quantity: 400, UserID: ana}); err != nil {
		t.Fatal(err)
	}
	if got := e.stock.total(e.ids[milk]); got != 400 {
		t.Errorf("Stock = %v, want 400", got)
	}
}

func TestTheUndoOfAScanTickFromBeforeBeta9KeepsALaterTickByHand(t *testing.T) {
	// A Scan ticked the Line before beta.9 (no addition); Sam's tick by hand was added since. Undo of the Scan leaves
	// Sam's tick and its Stock Lot, so a later untick can still take that Lot back.
	e := newEnv(t)
	needsMilk(e, 800)
	scanLot, _, _ := e.stock.AddLot(ctx, service.StockAdd{IngredientID: e.ids[milk], Quantity: 500, ClientUUID: "scan-1"})
	if err := e.st.SetTick(ctx, rng, shopping.Tick{IngredientID: e.ids[milk], Needed: 800, By: "scan"}, nil); err != nil {
		t.Fatal(err)
	}
	sam1 := tickMilk(t, e, service.TickInput{Quantity: 300, ClientUUID: "b", UserID: sam})
	if err := e.svc.UndoLot(ctx, service.UndoLotInput{IngredientID: e.ids[milk], To: rng, Quantity: 500, Unmark: true, LotID: scanLot}); err != nil {
		t.Fatal(err)
	}
	ticks, _ := e.st.Ticks(ctx, rng)
	if tk, ok := ticks[e.ids[milk]]; !ok || len(tk.Additions) != 1 || tk.Additions[0].ClientUUID != "b" {
		t.Fatalf("ticks after the Scan's Undo = %+v; want Sam's tick by hand kept", ticks)
	}
	if err := e.svc.Untick(ctx, e.ids[milk], rng); err != nil {
		t.Fatal(err)
	}
	if len(e.stock.takes) != 1 || e.stock.takes[0][0] != float64(*sam1.LotID) {
		t.Errorf("TakeBack calls = %v, want Sam's Lot taken back on untick", e.stock.takes)
	}
}

func TestAQueuedTickOfAnExtraKeepsThePhonesTimeAndItsUser(t *testing.T) {
	e := newEnv(t)
	x, err := e.svc.AddExtra(ctx, service.ExtraInput{IngredientID: e.ids[milk], Quantity: 2000})
	if err != nil {
		t.Fatal(err)
	}
	at := startTime.Add(-30 * time.Minute)
	if _, err := e.svc.TickExtraAt(ctx, service.ExtraTickInput{ID: x.ID, Quantity: 2000, ClientUUID: "x1", TickedAt: at}); err != nil {
		t.Fatal(err)
	}
	adds, err := e.st.ExtraAdditions(ctx, x.ID)
	if err != nil || len(adds) != 1 || !adds[0].TickedAt.Equal(at) || !adds[0].SyncedAt.Equal(startTime) {
		t.Fatalf("additions = %+v, %v; want the phone's time and the sync time", adds, err)
	}
}
