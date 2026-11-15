package service_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/receipt"
	"github.com/fabbarix/feeder-ng/internal/scan"
)

// B9-50 (SSP-08): an Add of a line that is already a Product is a plain new_scan of that Product. The plan cannot know the
// Product's pack size, so it sends Quantity 0 for a pack scan; the step reads that as one pack of the Product (its pack size
// in Base Units), at the receipt's date and Shop and the given Price. A Quantity above 0 (a weighed line) is used as it is.

func TestANewScanStepOfAKnownProductWithNoQuantityIsOnePackOfIt(t *testing.T) {
	e := newRR3Env(t)
	plan := receipt.Plan{Steps: []receipt.Step{
		step(receipt.PhaseAdd, newScanOp("receipt:r1:0", milkProd, 0, 175), undoOp("receipt:r1:0")),
	}}
	res, err := e.apply(t, plan)
	if err != nil {
		t.Fatalf("ApplyReceiptPlan: %v", err)
	}
	if len(res.Results) != 1 || res.Results[0].Status != scan.StatusApplied || res.Results[0].Scan == nil {
		t.Fatalf("results = %+v", res.Results)
	}
	ev, ok, err := e.ledger.Get(context.Background(), "receipt:r1:0")
	if err != nil || !ok || ev.UndoneAt != "" {
		t.Fatalf("the scan is not live: %+v %v %v", ev, ok, err)
	}
	if ev.Quantity != 1000 {
		t.Errorf("quantity = %v, want the Product's pack size 1000", ev.Quantity)
	}
	if ev.PriceCents == nil || *ev.PriceCents != 175 || ev.ProductID == nil || *ev.ProductID != milkProd {
		t.Errorf("scan = %+v", ev)
	}
}

func TestANewScanStepWithAQuantityKeepsIt(t *testing.T) {
	e := newRR3Env(t)
	plan := receipt.Plan{Steps: []receipt.Step{
		step(receipt.PhaseAdd, newScanOp("receipt:r1:0", milkProd, 330, 90), undoOp("receipt:r1:0")),
	}}
	if _, err := e.apply(t, plan); err != nil {
		t.Fatalf("ApplyReceiptPlan: %v", err)
	}
	ev, _, _ := e.ledger.Get(context.Background(), "receipt:r1:0")
	if ev.Quantity != 330 {
		t.Errorf("quantity = %v, want 330", ev.Quantity)
	}
}
