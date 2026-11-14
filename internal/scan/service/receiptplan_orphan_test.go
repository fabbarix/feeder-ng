package service_test

// b8-rxgo (docs/dev/design/b8-rxgo.md): a receipt apply that fails leaves no Ingredient, Supply or Product it made.
//
// Contract of the fix (the Ingredients port gains two methods; Ensure stays for the unknown-barcode path):
//
//	EnsureNew(ctx, name, baseUnit, kind) (id int64, created bool, err error)  Ensure that says whether it created the row
//	DeleteUnused(ctx, id) (deleted bool, err error)                           removes the Ingredient only when nothing
//	                                                                          references it; a referenced one is left
//	                                                                          alone (false, nil), as the store's ErrInUse
//
// create_product's compensation deletes the Product it made and, only when EnsureNew created the Ingredient in this
// run, then the Ingredient (after the Product, so the Product no longer references it). An Ingredient that was found
// (it existed before) is never deleted. An Ingredient that something else references by then is left (not an error).
// A create_product whose CreateProduct fails right after EnsureNew created the Ingredient deletes it at once, because
// the step has no compensation of its own to run.

import (
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/receipt"
	"github.com/fabbarix/feeder-ng/internal/scan/service"
)

func addOf(kind, name string) receipt.Plan {
	add := receipt.Op{Kind: receipt.OpCreateProduct, Ref: "add:0", Name: "Receipt line 450 g", PackSize: 450, BaseUnit: "g",
		Ingredient: &receipt.IngredientChoice{New: &receipt.NewIngredient{Name: name, BaseUnit: "g", Kind: kind}}}
	sc := newScanOp(uAdd, 0, 450, 225)
	sc.Ref = "add:0"
	return receipt.Plan{Steps: []receipt.Step{
		step(receipt.PhaseAdd, add, receipt.Op{Kind: receipt.OpDeleteProduct, Ref: "add:0"}),
		step(receipt.PhaseAdd, sc, undoOp(uAdd)),
	}}
}

func failAddScan(e *rr3Env) {
	e.f.arm("AddLot", func(a any) bool { return a.(service.StockAdd).ClientUUID == uAdd })
}

func TestAFailedApplyLeavesNoNewIngredientBehind(t *testing.T) {
	for _, kind := range []string{"food", "supply"} {
		t.Run(kind, func(t *testing.T) {
			e := newRR3Env(t)
			before := e.snapshot(t)
			failAddScan(e)
			_, err := e.apply(t, addOf(kind, "pane"))
			var ae *service.ReceiptApplyError
			if !errors.As(err, &ae) || ae.Compensation != nil {
				t.Fatalf("error = %v, want a failure put back cleanly", err)
			}
			if got := e.snapshot(t); got != before {
				t.Errorf("a new %s was left behind.\nbefore:\n%s\nafter:\n%s", kind, before, got)
			}
			if _, ok := e.ing.byName["pane"]; ok || len(e.cat.products) != 2 {
				t.Errorf("ingredient pane kept = %v, products = %d", ok, len(e.cat.products))
			}
		})
	}
}

func TestAFailureRightAfterTheIngredientWasMadeRemovesItToo(t *testing.T) {
	e := newRR3Env(t)
	before := e.snapshot(t)
	e.f.arm("CreateProduct", any_) // the Ingredient exists by now, the Product is refused
	_, err := e.apply(t, addOf("food", "pane"))
	var ae *service.ReceiptApplyError
	if !errors.As(err, &ae) || ae.Step != 0 || ae.Kind != receipt.OpCreateProduct {
		t.Fatalf("error = %v, want step 0 (create_product) to fail", err)
	}
	if got := e.snapshot(t); got != before {
		t.Errorf("the Ingredient of a Product that was never made is still there.\n%s", got)
	}
}

func TestAFailureWhileCreatingAnAddAfterEarlierStepsRemovesTheIngredientOnlyOnce(t *testing.T) {
	// two Adds with two new Ingredients; the second Add's scan fails: both Ingredients and both Products go
	e := newRR3Env(t)
	before := e.snapshot(t)
	p1, p2 := addOf("food", "pane"), addOf("supply", "soap")
	for i := range p2.Steps {
		if p2.Steps[i].Op.Ref == "add:0" {
			p2.Steps[i].Op.Ref = "add:1"
		}
		if p2.Steps[i].Inverse.Ref == "add:0" {
			p2.Steps[i].Inverse.Ref = "add:1"
		}
	}
	p2.Steps[1].Op.UUID, p2.Steps[1].Inverse.UUID = "receipt:r1:2", "receipt:r1:2"
	e.f.arm("AddLot", func(a any) bool { return a.(service.StockAdd).ClientUUID == "receipt:r1:2" })
	if _, err := e.apply(t, receipt.Plan{Steps: append(p1.Steps, p2.Steps...)}); err == nil {
		t.Fatal("the plan succeeded")
	}
	if got := e.snapshot(t); got != before {
		t.Errorf("not put back.\nbefore:\n%s\nafter:\n%s", before, got)
	}
	if len(e.ing.deleted) != 2 {
		t.Errorf("deleted Ingredients = %v, want both new ones, once each", e.ing.deleted)
	}
}

func TestAnIngredientThatExistedBeforeIsNeverRemovedByAPutBack(t *testing.T) {
	e := newRR3Env(t)
	id, _, _ := e.ing.EnsureNew(nil, "pane", "g", "food") // made by the household earlier, nothing references it
	failAddScan(e)
	if _, err := e.apply(t, addOf("food", "pane")); err == nil {
		t.Fatal("the plan succeeded")
	}
	if got, ok := e.ing.byName["pane"]; !ok || got != id {
		t.Errorf("the existing Ingredient pane was removed (%d, %v)", got, ok)
	}
	if len(e.ing.deleted) != 0 {
		t.Errorf("deleted = %v, want none: the Ingredient was found, not created", e.ing.deleted)
	}
}

func TestAnAddOfAnExistingIngredientByIdIsNeverRemovedByAPutBack(t *testing.T) {
	e := newRR3Env(t)
	plan := addOf("food", "x")
	plan.Steps[0].Op.Ingredient = &receipt.IngredientChoice{ID: passataIng}
	failAddScan(e)
	before := e.snapshot(t)
	if _, err := e.apply(t, plan); err == nil {
		t.Fatal("the plan succeeded")
	}
	if got := e.snapshot(t); got != before || len(e.ing.deleted) != 0 {
		t.Errorf("state changed or an Ingredient was deleted: %v\n%s", e.ing.deleted, got)
	}
}

func TestANewIngredientSomethingElseNowReferencesIsLeftAlone(t *testing.T) {
	e := newRR3Env(t)
	// a Recipe saved on another phone while the apply ran: it references the new Ingredient by the time of the put-back
	failAddScan(e)
	e.f.arm("DeleteProduct", func(any) bool {
		e.ing.extraRefs[e.ing.byName["pane"]] = true
		return false // the delete itself works
	})
	e.ing.extraRefs = map[int64]bool{}
	_, err := e.apply(t, addOf("food", "pane"))
	var ae *service.ReceiptApplyError
	if !errors.As(err, &ae) || ae.Compensation != nil {
		t.Fatalf("error = %v, want the put-back to count as clean", err)
	}
	if _, ok := e.ing.byName["pane"]; !ok {
		t.Error("an Ingredient a Recipe references was removed")
	}
	if len(e.cat.products) != 2 {
		t.Errorf("the Product of the Add was not removed: %d Products", len(e.cat.products))
	}
}

func TestAnIngredientIsRemovedAfterItsProductNotBefore(t *testing.T) {
	// when deleting the Product fails, the Ingredient (still referenced by it) stays and the failure is reported
	e := newRR3Env(t)
	failAddScan(e)
	e.f.arm("DeleteProduct", any_)
	_, err := e.apply(t, addOf("food", "pane"))
	var ae *service.ReceiptApplyError
	if !errors.As(err, &ae) || ae.Compensation == nil {
		t.Fatalf("error = %v, want a put-back error", err)
	}
	if _, ok := e.ing.byName["pane"]; !ok {
		t.Error("the Ingredient was removed while its Product was still there")
	}
}

func TestAFailureOfTheIngredientDeleteIsReportedAsAPutBackError(t *testing.T) {
	e := newRR3Env(t)
	failAddScan(e)
	e.f.arm("DeleteUnused", any_)
	_, err := e.apply(t, addOf("food", "pane"))
	var ae *service.ReceiptApplyError
	if !errors.As(err, &ae) || ae.Compensation == nil || !strings.Contains(ae.Compensation.Error(), "DeleteUnused") {
		t.Fatalf("error = %v, want the put-back to say the Ingredient could not be removed", err)
	}
}

func TestARetryAfterAFailedApplyMakesTheIngredientOnce(t *testing.T) {
	e := newRR3Env(t)
	failAddScan(e)
	if _, err := e.apply(t, addOf("food", "pane")); err == nil {
		t.Fatal("the first apply succeeded")
	}
	if _, err := e.apply(t, addOf("food", "pane")); err != nil {
		t.Fatalf("the retry: %v", err)
	}
	if _, ok := e.ing.byName["pane"]; !ok || len(e.cat.created) != 2 {
		t.Errorf("after the retry: pane kept = %v, Products created = %d (one per attempt)", ok, len(e.cat.created))
	}
	if len(e.ing.deleted) != 1 {
		t.Errorf("deleted = %v, want the first attempt's Ingredient only", e.ing.deleted)
	}
}

func TestASuccessfulApplyKeepsItsNewIngredient(t *testing.T) {
	e := newRR3Env(t)
	if _, err := e.apply(t, addOf("supply", "soap")); err != nil {
		t.Fatal(err)
	}
	if _, ok := e.ing.byName["soap"]; !ok || len(e.ing.deleted) != 0 {
		t.Errorf("the new Supply was lost: kept = %v, deleted = %v", ok, e.ing.deleted)
	}
}
