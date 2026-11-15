package receipt_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/receipt"
)

// B9-50 (SSP-08): an Add of a line that is already a Product. The Add's choice names the Product (ProductID); the plan then
// makes no Product and no Ingredient: it only scans the Product at the receipt's price, one scan per pack (one for a weighed
// line), each undone by its inverse like any Add scan.
//
// Choices where the chapter is silent (pinned here):
//   - the plan cannot know the Product's pack size, so a pack scan carries Quantity 0, which the scan service reads as "one
//     pack of this Product" (internal/scan/service/receiptplan_productid_test.go); a weighed line carries its grams;
//   - the scan's Ref stays empty (there is no created Product to refer to) and its ProductID is the chosen Product.

func existingProductChoice(id int64) receipt.AddChoice { return receipt.AddChoice{ProductID: id} }

func TestAnAddOfAnExistingProductMakesNoProductAndScansIt(t *testing.T) {
	in := planInput(t, nil, []string{"add:0"}, map[string]receipt.AddChoice{"add:0": existingProductChoice(55)},
		mkLine(map[string]any{"row": -1, "text": "KITCHEN ROLL 4 PACK", "count": 1, "priceCents": 349, "name": "Kitchen roll", "packSize": 4, "packUnit": "piece"}))
	p := buildPlan(t, in)
	if got := kinds(p); len(got) != 1 || got[0] != receipt.OpNewScan {
		t.Fatalf("steps = %v, want one new_scan and no create_product", got)
	}
	s := p.Steps[0]
	if s.Phase != receipt.PhaseAdd || s.Op.ProductID != 55 || s.Op.Ref != "" || s.Op.Quantity != 0 || s.Op.PriceCents != 349 || s.Op.ShopID != 1 {
		t.Errorf("scan = %+v", s.Op)
	}
	if s.Op.UUID != "receipt:r1:0" || s.Inverse.Kind != receipt.OpUndo || s.Inverse.UUID != "receipt:r1:0" {
		t.Errorf("uuid and inverse = %+v / %+v", s.Op, s.Inverse)
	}
}

func TestAnAddOfAnExistingProductWithSeveralPacksScansEachAtTheSharedPrice(t *testing.T) {
	in := planInput(t, nil, []string{"add:0"}, map[string]receipt.AddChoice{"add:0": existingProductChoice(55)},
		mkLine(map[string]any{"row": -1, "text": "OLIO", "count": 2, "priceCents": 1798, "name": "Olive oil", "packSize": 750, "packUnit": "ml"}))
	p := buildPlan(t, in)
	if got := kinds(p); len(got) != 2 || got[0] != receipt.OpNewScan || got[1] != receipt.OpNewScan {
		t.Fatalf("steps = %v", got)
	}
	for i, s := range p.Steps {
		if s.Op.ProductID != 55 || s.Op.PriceCents != 899 || s.Op.Quantity != 0 || s.Op.Ref != "" {
			t.Errorf("step %d = %+v", i, s.Op)
		}
	}
	if p.Steps[1].Op.UUID != "receipt:r1:1" {
		t.Errorf("second uuid = %q", p.Steps[1].Op.UUID)
	}
}

func TestAnAddOfAnExistingProductOnAWeighedLineScansItsGrams(t *testing.T) {
	in := planInput(t, nil, []string{"add:0"}, map[string]receipt.AddChoice{"add:0": existingProductChoice(55)},
		mkLine(map[string]any{"row": -1, "text": "PANE", "grams": 450, "priceCents": 225, "name": "Pane"}))
	p := buildPlan(t, in)
	if got := kinds(p); len(got) != 1 || got[0] != receipt.OpNewScan {
		t.Fatalf("steps = %v", got)
	}
	if o := p.Steps[0].Op; o.ProductID != 55 || o.Quantity != 450 || o.PriceCents != 225 || o.Ref != "" {
		t.Errorf("scan = %+v", o)
	}
}

func TestAnExistingProductChoiceIsCompleteWithoutIngredientNameOrPackSize(t *testing.T) {
	in := planInput(t, nil, []string{"add:0"}, map[string]receipt.AddChoice{"add:0": existingProductChoice(55)},
		mkLine(map[string]any{"row": -1, "text": "PANE", "grams": 450, "priceCents": 225, "name": "Pane"}))
	if _, err := receipt.BuildPlan(in); err != nil {
		t.Errorf("a Product id alone must be a complete choice: %v", err)
	}
}

func TestAnExistingProductAddUndoesLikeAnyAddWhenALaterStepFails(t *testing.T) {
	in := planInput(t, nil, []string{"add:0"}, map[string]receipt.AddChoice{"add:0": existingProductChoice(55)},
		mkLine(map[string]any{"row": -1, "text": "KITCHEN ROLL 4 PACK", "count": 1, "priceCents": 349, "name": "Kitchen roll", "packSize": 4, "packUnit": "piece"}))
	p := buildPlan(t, in)
	back := p.Compensate(1)
	if len(back) != 1 || back[0].Kind != receipt.OpUndo || back[0].UUID != "receipt:r1:0" {
		t.Errorf("compensation = %+v", back)
	}
}

func TestAnAddWithNeitherAProductNorTheFullChoiceIsStillRefused(t *testing.T) {
	in := planInput(t, nil, []string{"add:0"}, map[string]receipt.AddChoice{"add:0": {ProductName: "Pane", PackSize: 450}},
		mkLine(map[string]any{"row": -1, "text": "PANE", "grams": 450, "priceCents": 225, "name": "Pane"}))
	_, err := receipt.BuildPlan(in)
	pe, ok := err.(*receipt.PlanError)
	if !ok || pe.Code != receipt.PlanAddIncomplete {
		t.Errorf("err = %#v", err)
	}
}
