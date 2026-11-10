package service_test

import (
	"context"
	"errors"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/service"
)

// Two requests for the same thing reach the server together (a double tap, a retry racing the original, two
// phones syncing one queue). Every port call is slow, so without serialisation both requests are inside Apply,
// Undo or SetPrice at the same time. The design note says how: one mutex in the Service around Apply, Undo and
// SetPrice (a single process on one SQLite file), plus the ledger's unique client UUID as a second guard.

// together runs a and b at the same moment and waits for both.
func together(a, b func()) {
	var ready, done sync.WaitGroup
	start := make(chan struct{})
	for _, f := range []func(){a, b} {
		ready.Add(1)
		done.Add(1)
		go func() {
			defer done.Done()
			ready.Done()
			<-start
			f()
		}()
	}
	ready.Wait()
	close(start)
	done.Wait()
}

func slow(e *env) {
	d := 15 * time.Millisecond
	e.stock.delay, e.cat.delay, e.list.delay = d, d, d
}

func statuses(rs ...scan.Result) []string {
	var out []string
	for _, r := range rs {
		out = append(out, string(r.Status))
	}
	sort.Strings(out)
	return out
}

func TestTheSameClientUUIDSentTwiceAtOnceIsAppliedOnceAndTheFirstKeepsItsPriceAndLink(t *testing.T) {
	e := newEnv(t)
	slow(e)
	op := packScan("scan-0001", mutti, 700)
	op.PriceCents = ip(179)
	var r1, r2 scan.Result
	var e1, e2 error
	together(
		func() { r1, e1 = e.svc.Apply(context.Background(), op) },
		func() { r2, e2 = e.svc.Apply(context.Background(), op) },
	)
	if e1 != nil || e2 != nil {
		t.Fatalf("errors: %v, %v", e1, e2)
	}
	if got := statuses(r1, r2); got[0] != "applied" || got[1] != "duplicate" {
		t.Fatalf("statuses = %v, want one applied and one duplicate", got)
	}
	if r1.Scan == nil || r2.Scan == nil || r1.Scan.LotID == nil || r2.Scan.LotID == nil || *r1.Scan.LotID != *r2.Scan.LotID {
		t.Fatalf("both answers must describe the same Lot: %+v / %+v", r1.Scan, r2.Scan)
	}
	if e.stock.lotCount() != 1 || e.stock.totals[passataIng] != 700 {
		t.Fatalf("Stock: %d Lots, total %v; want 1 Lot of 700", e.stock.lotCount(), e.stock.totals[passataIng])
	}
	if len(e.cat.purchases) != 1 {
		t.Fatalf("purchases = %d, want 1 (the loser must not leave one, nor delete the winner's)", len(e.cat.purchases))
	}
	if l := e.cat.latest(mutti, 1); l == nil || l.PriceCents == nil || *l.PriceCents != 179 {
		t.Fatalf("the Price the first scan wrote is gone or changed: %+v", l)
	}
	if !e.cat.soldAt[[2]int64{mutti, 1}] {
		t.Fatal("the sold-at link the first scan made is gone")
	}
	if len(e.list.after) != 1 || len(e.list.undo) != 0 || e.list.remaining[passataIng] != 700 {
		t.Fatalf("Shopping List: %d AfterLot calls, %d UndoLot calls, %v left; want 1, 0, 700", len(e.list.after), len(e.list.undo), e.list.remaining[passataIng])
	}
	ev, ok, _ := e.ledger.Get(context.Background(), "scan-0001")
	if !ok || ev.UndoneAt != "" || ev.PurchaseID == nil || ev.PriceID == nil {
		t.Fatalf("ledger event = %+v, %v", ev, ok)
	}
}

func TestAStockTakeMinusPackSentTwiceAtOnceTakesOnePackOnce(t *testing.T) {
	e := newEnv(t)
	slow(e)
	e.stock.totals[milkIng] = 2000
	op := stockTake("take-1", scan.MinusPack)
	op.ProductID = milkProd
	var r1, r2 scan.Result
	together(
		func() { r1, _ = e.svc.Apply(context.Background(), op) },
		func() { r2, _ = e.svc.Apply(context.Background(), op) },
	)
	if got := statuses(r1, r2); got[0] != "applied" || got[1] != "duplicate" {
		t.Fatalf("statuses = %v, want one applied and one duplicate", got)
	}
	if len(e.stock.sets) != 1 || e.stock.totals[milkIng] != 1000 {
		t.Fatalf("SetTotal calls %v, total %v; want one call and 1000 ml (2000 minus one pack, once)", e.stock.sets, e.stock.totals[milkIng])
	}
}

func TestADoubleTappedUndoIsAppliedOnce(t *testing.T) {
	e := newEnv(t)
	op := packScan("scan-0001", mutti, 700)
	op.PriceCents = ip(179)
	apply(t, e, op)
	slow(e)
	var u1, u2 service.UndoResult
	var e1, e2 error
	together(
		func() { u1, e1 = e.svc.Undo(context.Background(), "scan-0001") },
		func() { u2, e2 = e.svc.Undo(context.Background(), "scan-0001") },
	)
	if e1 != nil || e2 != nil {
		t.Fatalf("errors: %v, %v", e1, e2)
	}
	if u1.Undone == u2.Undone || u1.AlreadyUndone == u2.AlreadyUndone || (u1.Undone && u1.AlreadyUndone) || (u2.Undone && u2.AlreadyUndone) {
		t.Fatalf("results %+v and %+v: exactly one must be Undone and the other AlreadyUndone", u1, u2)
	}
	if len(e.list.undo) != 1 || e.list.remaining[passataIng] != 1400 {
		t.Fatalf("UndoLot called %d times, %v left; want once and 1400 (the quantity given back once)", len(e.list.undo), e.list.remaining[passataIng])
	}
	if len(e.stock.removed) != 1 || e.stock.lotCount() != 0 || len(e.cat.purchases) != 0 || len(e.cat.prices) != 0 || e.cat.soldAt[[2]int64{mutti, 1}] {
		t.Fatalf("after Undo: removed %v, Lots %d, purchases %d, prices %d, sold-at %v; want everything reversed once",
			e.stock.removed, e.stock.lotCount(), len(e.cat.purchases), len(e.cat.prices), e.cat.soldAt)
	}
}

func TestAnUndoRacingAPriceEditEndsUndoneWithoutAPriceBackFromTheDead(t *testing.T) {
	e := newEnv(t)
	op := packScan("scan-0001", mutti, 700)
	op.PriceCents = ip(179)
	apply(t, e, op)
	slow(e)
	var setErr error
	together(
		func() { _, _ = e.svc.Undo(context.Background(), "scan-0001") },
		func() { _, setErr = e.svc.SetPrice(context.Background(), "scan-0001", 199) },
	)
	if setErr != nil && !errors.Is(setErr, service.ErrAlreadyUndone) {
		t.Fatalf("SetPrice error = %v, want nil or ErrAlreadyUndone", setErr)
	}
	if len(e.cat.prices) != 0 {
		t.Fatalf("a Price survived the Undo: %+v (the edit and the Undo must not interleave)", e.cat.prices[0])
	}
}

// Undo is atomic and retry-safe: each step is recorded in the ledger (Event.UndoSteps) when it finishes and
// UndoneAt is set after the last one, so a retry after a failure continues where the first attempt stopped and
// never gives the quantity back twice.
func TestAnUndoThatFailsMidwayCanBeRetriedAndGivesTheQuantityBackOnce(t *testing.T) {
	for _, failing := range []string{"UndoLot", "RemoveLot", "DeletePurchase", "DeletePrice", "UnsetSoldAt"} {
		t.Run(failing, func(t *testing.T) {
			e := newEnv(t)
			op := packScan("scan-0001", mutti, 700)
			op.PriceCents = ip(179)
			apply(t, e, op)
			switch failing {
			case "UndoLot":
				e.list.failOnce(failing)
			case "RemoveLot":
				e.stock.failOnce(failing)
			default:
				e.cat.failOnce(failing)
			}
			ctx := context.Background()
			if _, err := e.svc.Undo(ctx, "scan-0001"); err == nil {
				t.Fatalf("the first Undo must fail when %s fails", failing)
			}
			if ev, _, _ := e.ledger.Get(ctx, "scan-0001"); ev.UndoneAt != "" {
				t.Fatalf("a failed Undo must not mark the scan undone: %+v", ev)
			}
			out, err := e.svc.Undo(ctx, "scan-0001")
			if err != nil || !out.Undone || out.AlreadyUndone {
				t.Fatalf("the retry = %+v, %v; want Undone", out, err)
			}
			if len(e.list.undo) != 1 || e.list.remaining[passataIng] != 1400 {
				t.Fatalf("UndoLot succeeded %d times, %v left; want once and 1400", len(e.list.undo), e.list.remaining[passataIng])
			}
			if e.stock.lotCount() != 0 || e.stock.totals[passataIng] != 0 || len(e.cat.purchases) != 0 || len(e.cat.prices) != 0 || e.cat.soldAt[[2]int64{mutti, 1}] {
				t.Fatalf("after the retry: Lots %d (total %v), purchases %d, prices %d, sold-at %v; want everything reversed",
					e.stock.lotCount(), e.stock.totals[passataIng], len(e.cat.purchases), len(e.cat.prices), e.cat.soldAt)
			}
			ev, _, _ := e.ledger.Get(ctx, "scan-0001")
			if ev.UndoneAt == "" || len(ev.UndoSteps) != 5 {
				t.Fatalf("ledger event = undoneAt %q, steps %v; want undone with 5 steps recorded", ev.UndoneAt, ev.UndoSteps)
			}
			if again, err := e.svc.Undo(ctx, "scan-0001"); err != nil || !again.AlreadyUndone {
				t.Fatalf("a third Undo = %+v, %v; want AlreadyUndone", again, err)
			}
		})
	}
}

func TestAPriceEditOnAnUndoneScanIsRefused(t *testing.T) {
	e := newEnv(t)
	op := packScan("scan-0001", mutti, 700)
	op.PriceCents = ip(179)
	apply(t, e, op)
	if _, err := e.svc.Undo(context.Background(), "scan-0001"); err != nil {
		t.Fatal(err)
	}
	recorded := len(e.cat.recorded)
	if _, err := e.svc.SetPrice(context.Background(), "scan-0001", 199); !errors.Is(err, service.ErrAlreadyUndone) {
		t.Fatalf("SetPrice on an undone scan: err = %v, want ErrAlreadyUndone", err)
	}
	if len(e.cat.recorded) != recorded || len(e.cat.prices) != 0 {
		t.Fatalf("a refused edit must not write a Price: recorded %d -> %d, live prices %d", recorded, len(e.cat.recorded), len(e.cat.prices))
	}
	if spent, _, _ := e.ledger.Totals(context.Background(), "2026-11-15"); spent != 0 {
		t.Fatalf("spent = %d, want 0", spent)
	}
}

// A domain error in one queued op is that op's rejection; the rest of the batch still applies. The adapter maps
// the Product store's ErrUnknownIngredient to service.ErrUnknownIngredient.
func TestADomainErrorInOneOpRejectsOnlyThatOpAndTheRestOfTheBatchApplies(t *testing.T) {
	e := newEnv(t)
	e.cat.createErr = service.ErrUnknownIngredient // the Ingredient was merged away while the phone was offline
	unknown := unknownPack("scan-0002", scan.ScopeGlobal)
	unknown.Ingredient = &scan.IngredientRef{ID: 4242}
	ops := []scan.Op{packScan("scan-0001", mutti, 700), unknown, packScan("scan-0003", milkProd, 1000)}
	results, err := e.svc.Sync(context.Background(), ops)
	if err != nil {
		t.Fatalf("Sync must not fail for a domain error: %v", err)
	}
	if len(results) != 3 || results[0].Status != scan.StatusApplied || results[2].Status != scan.StatusApplied {
		t.Fatalf("results = %+v; want applied, rejected, applied", results)
	}
	if r := results[1]; r.Status != scan.StatusRejected || r.Error == nil || r.Error.Code != service.CodeUnknownIngr || r.ClientUUID != "scan-0002" {
		t.Fatalf("the unknown-barcode op = %+v; want rejected with %s", r, service.CodeUnknownIngr)
	}
	if e.stock.lotCount() != 2 {
		t.Fatalf("Lots = %d, want 2 (the two good scans)", e.stock.lotCount())
	}
	// Replaying the batch is safe: the rejected op is rejected again, the others are duplicates.
	again, err := e.svc.Sync(context.Background(), ops)
	if err != nil || again[0].Status != scan.StatusDuplicate || again[1].Status != scan.StatusRejected || again[2].Status != scan.StatusDuplicate {
		t.Fatalf("replay = %+v, %v", again, err)
	}
}
