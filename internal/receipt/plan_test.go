package receipt_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/receipt"
)

// RR1: the apply plan (design §8). BuildPlan turns the accepted Proposals into an ordered list of steps over the
// scan service's existing operations; each step carries its inverse for compensation (§8.3).
//
//	BuildPlan(PlanInput) (Plan, error)     Plan{Steps []Step}     Step{Phase, Op, Inverse}
//	Plan.Compensate(failedAt int) []Op     inverses of steps [0, failedAt) in reverse order
//
// Decisions where the design is silent:
//   - new scans get the uuid "receipt:<readId>:<n>", n counting the plan's new scans from 0 in plan order; the
//     inverse that re-applies an Undo uses "receipt:<readId>:undo:<undone uuid>";
//   - a row whose events are replaced (weight, pack size, shop, date) has its Price carried by the new scans, so it
//     gets no separate set_prices step;
//   - a Price per kg on a weighed event is priceCents = round half up of perKg x quantity / 1000.

func planInput(t *testing.T, top map[string]any, accept []string, adds map[string]receipt.AddChoice, lines ...map[string]any) receipt.PlanInput {
	t.Helper()
	rows, ctx := fixtureRows(), fixtureCtx()
	a := answer(t, top, lines...)
	res := receipt.Propose(rows, a, ctx)
	return receipt.PlanInput{ReadID: "r1", Rows: rows, Ctx: ctx, Proposals: res.Proposals, Accept: accept, Adds: adds}
}

func buildPlan(t *testing.T, in receipt.PlanInput) receipt.Plan {
	t.Helper()
	p, err := receipt.BuildPlan(in)
	if err != nil {
		t.Fatalf("BuildPlan: %v", err)
	}
	return p
}

func kinds(p receipt.Plan) []receipt.OpKind {
	var out []receipt.OpKind
	for _, s := range p.Steps {
		out = append(out, s.Op.Kind)
	}
	return out
}

func TestNothingAcceptedIsAnEmptyPlan(t *testing.T) {
	p := buildPlan(t, planInput(t, nil, nil, nil, mkLine(map[string]any{"row": 0, "count": 3, "priceCents": 400})))
	if len(p.Steps) != 0 {
		t.Errorf("steps = %v", kinds(p))
	}
}

func TestPriceOnlyIsOneSetPricesOnAllTheRowsEvents(t *testing.T) {
	p := buildPlan(t, planInput(t, nil, []string{"price:0"}, nil, mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 270})))
	if len(p.Steps) != 1 {
		t.Fatalf("steps = %v", kinds(p))
	}
	s := p.Steps[0]
	if s.Phase != receipt.PhasePrice || s.Op.Kind != receipt.OpSetPrices || len(s.Op.Prices) != 2 {
		t.Fatalf("step = %+v", s)
	}
	for i, uuid := range []string{"e1", "e2"} {
		if g := s.Op.Prices[i]; g.UUID != uuid || g.PriceCents != 135 || g.PerKgCents != -1 {
			t.Errorf("price %d = %+v", i, g)
		}
		if g := s.Inverse.Prices[i]; s.Inverse.Kind != receipt.OpSetPrices || g.UUID != uuid || g.PriceCents != 129 || g.PerKgCents != -1 {
			t.Errorf("inverse %d = %+v", i, g)
		}
	}
}

func TestPricePerKgOfAWeighedRowKeepsTheWeight(t *testing.T) {
	p := buildPlan(t, planInput(t, nil, []string{"price:1"}, nil, mkLine(map[string]any{"row": 1, "grams": 312, "priceCents": 655, "perKgCents": 2100})))
	g := p.Steps[0].Op.Prices[0]
	if g.UUID != "e3" || g.PerKgCents != 2100 || g.PriceCents != 655 { // 2100 x 312 / 1000 = 655.2
		t.Errorf("price = %+v", g)
	}
	if b := p.Steps[0].Inverse.Prices[0]; b.PriceCents != 624 || b.PerKgCents != 2000 {
		t.Errorf("inverse = %+v", b)
	}
}

func TestMoreScansAddANewScanPerMissingPack(t *testing.T) {
	p := buildPlan(t, planInput(t, nil, []string{"quantity:0"}, nil, mkLine(map[string]any{"row": 0, "count": 3, "priceCents": 387})))
	if len(p.Steps) != 1 {
		t.Fatalf("steps = %v", kinds(p))
	}
	s := p.Steps[0]
	if s.Phase != receipt.PhaseQuantity || s.Op.Kind != receipt.OpNewScan || s.Op.UUID != "receipt:r1:0" || s.Op.ProductID != 10 ||
		s.Op.Quantity != 700 || s.Op.PriceCents != 129 || s.Op.ShopID != 1 || s.Op.Date != "2026-11-13" {
		t.Errorf("op = %+v", s.Op)
	}
	if s.Inverse.Kind != receipt.OpUndo || s.Inverse.UUID != "receipt:r1:0" {
		t.Errorf("inverse = %+v", s.Inverse)
	}
}

func TestFewerScansUndoTheLatestEvents(t *testing.T) {
	p := buildPlan(t, planInput(t, nil, []string{"quantity:0"}, nil, mkLine(map[string]any{"row": 0, "count": 1, "priceCents": 129})))
	if len(p.Steps) != 1 {
		t.Fatalf("steps = %v", kinds(p))
	}
	s := p.Steps[0]
	if s.Op.Kind != receipt.OpUndo || s.Op.UUID != "e2" {
		t.Errorf("the latest event is undone: %+v", s.Op)
	}
	if s.Inverse.Kind != receipt.OpNewScan || s.Inverse.UUID != "receipt:r1:undo:e2" || s.Inverse.ProductID != 10 ||
		s.Inverse.Quantity != 700 || s.Inverse.PriceCents != 129 || s.Inverse.ShopID != 1 || s.Inverse.Date != "2026-11-13" {
		t.Errorf("an Undo is compensated by re-applying the original scan under a new uuid: %+v", s.Inverse)
	}
}

func TestAnotherWeightUndoesThenScansAgainWithTheTargetQuantityAndPrice(t *testing.T) {
	p := buildPlan(t, planInput(t, nil, []string{"weight:1"}, nil, mkLine(map[string]any{"row": 1, "grams": 330, "priceCents": 660, "perKgCents": 2000})))
	if got := kinds(p); len(got) != 2 || got[0] != receipt.OpUndo || got[1] != receipt.OpNewScan {
		t.Fatalf("steps = %v", got)
	}
	if p.Steps[0].Op.UUID != "e3" {
		t.Errorf("undo = %+v", p.Steps[0].Op)
	}
	n := p.Steps[1].Op
	if n.ProductID != 11 || n.Quantity != 330 || n.PriceCents != 660 || n.UUID != "receipt:r1:0" || n.ShopID != 1 {
		t.Errorf("new scan = %+v", n)
	}
	if p.Steps[0].Phase != receipt.PhaseQuantity || p.Steps[1].Phase != receipt.PhaseQuantity {
		t.Errorf("weight changes are in the quantity phase: %v %v", p.Steps[0].Phase, p.Steps[1].Phase)
	}
}

func TestShopAndDateMoveEveryScanOfTheSession(t *testing.T) {
	in := planInput(t, map[string]any{"shopName": "Coop", "date": "2026-11-12"}, []string{"shop", "date"}, nil,
		mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258}),
		mkLine(map[string]any{"row": 1, "grams": 312, "priceCents": 624, "perKgCents": 2000}))
	in.Rows = in.Rows[:2] // two rows, three events
	p := buildPlan(t, in)
	if len(p.Steps) != 6 {
		t.Fatalf("3 events, an undo and a new scan each: %v", kinds(p))
	}
	for i, s := range p.Steps {
		wantKind := receipt.OpUndo
		if i%2 == 1 {
			wantKind = receipt.OpNewScan
		}
		if s.Op.Kind != wantKind || s.Phase != receipt.PhaseReplace {
			t.Errorf("step %d = %+v", i, s)
		}
		if s.Op.Kind == receipt.OpNewScan && (s.Op.ShopID != 2 || s.Op.Date != "2026-11-12") {
			t.Errorf("step %d goes to Coop on 12 Nov: %+v", i, s.Op)
		}
	}
	if p.Steps[1].Op.UUID != "receipt:r1:0" || p.Steps[3].Op.UUID != "receipt:r1:1" || p.Steps[5].Op.UUID != "receipt:r1:2" {
		t.Errorf("uuids are numbered in plan order: %s %s %s", p.Steps[1].Op.UUID, p.Steps[3].Op.UUID, p.Steps[5].Op.UUID)
	}
	if p.Steps[1].Op.Quantity != 700 || p.Steps[1].Op.PriceCents != 129 || p.Steps[5].Op.Quantity != 312 || p.Steps[5].Op.PriceCents != 624 {
		t.Errorf("quantities and Prices are carried over: %+v %+v", p.Steps[1].Op, p.Steps[5].Op)
	}
}

func TestPackSizeAndNameCorrectUpdateTheProductFirstThenReplaceTheSessionScans(t *testing.T) {
	p := buildPlan(t, planInput(t, nil, []string{"pack_size:2", "name:2"}, nil,
		mkLine(map[string]any{"row": 2, "count": 1, "priceCents": 99, "packSize": 400, "packUnit": "g", "name": "Barilla spaghetti 400 g"})))
	if got := kinds(p); len(got) != 3 || got[0] != receipt.OpUpdateProduct || got[1] != receipt.OpUndo || got[2] != receipt.OpNewScan {
		t.Fatalf("steps = %v", got)
	}
	u := p.Steps[0]
	if u.Phase != receipt.PhaseCorrection || u.Op.ProductID != 12 || u.Op.Name != "Barilla spaghetti 400 g" || u.Op.PackSize != 400 {
		t.Errorf("update = %+v", u)
	}
	if u.Inverse.Kind != receipt.OpUpdateProduct || u.Inverse.Name != "Barilla spaghetti 500 g" || u.Inverse.PackSize != 500 || u.Inverse.ProductID != 12 {
		t.Errorf("inverse restores the previous name and pack size: %+v", u.Inverse)
	}
	if n := p.Steps[2].Op; n.Quantity != 400 || n.ProductID != 12 || p.Steps[2].Phase != receipt.PhaseReplace {
		t.Errorf("the replacement scan has the new pack size: %+v", n)
	}
}

func TestNameAloneKeepsThePackSizeAndDoesNotReplaceScans(t *testing.T) {
	p := buildPlan(t, planInput(t, nil, []string{"name:0"}, nil, mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258, "name": "Mutti polpa"})))
	if got := kinds(p); len(got) != 1 || got[0] != receipt.OpUpdateProduct {
		t.Fatalf("steps = %v", got)
	}
	if o := p.Steps[0].Op; o.Name != "Mutti polpa" || o.PackSize != 700 {
		t.Errorf("update = %+v", o)
	}
}

func TestAReplacedRowCarriesItsPriceSoNoSeparateSetPrices(t *testing.T) {
	p := buildPlan(t, planInput(t, map[string]any{"date": "2026-11-12"}, []string{"date", "price:0"}, nil,
		mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 270})))
	for _, s := range p.Steps {
		if s.Op.Kind == receipt.OpSetPrices {
			t.Errorf("a replaced row takes its Price on the new scans: %+v", s)
		}
		if s.Op.Kind == receipt.OpNewScan && (s.Op.Date != "2026-11-12" || (s.Op.ProductID == 10 && s.Op.PriceCents != 135)) {
			t.Errorf("new scan = %+v", s.Op)
		}
	}
}

func TestAddCreatesTheProductThenScansIt(t *testing.T) {
	choice := receipt.AddChoice{Ingredient: receipt.IngredientChoice{New: &receipt.NewIngredient{Name: "pane", BaseUnit: "g", Kind: "ingredient"}},
		ProductName: "Pane casereccio", PackSize: 450}
	in := planInput(t, nil, []string{"add:0"}, map[string]receipt.AddChoice{"add:0": choice},
		mkLine(map[string]any{"row": -1, "text": "PANE", "grams": 450, "priceCents": 225, "name": "Pane"}))
	p := buildPlan(t, in)
	if got := kinds(p); len(got) != 2 || got[0] != receipt.OpCreateProduct || got[1] != receipt.OpNewScan {
		t.Fatalf("steps = %v", got)
	}
	c, n := p.Steps[0], p.Steps[1]
	if c.Phase != receipt.PhaseAdd || c.Op.Ref != "add:0" || c.Op.Name != "Pane casereccio" || c.Op.PackSize != 450 || c.Op.BaseUnit != "g" ||
		c.Op.Ingredient == nil || c.Op.Ingredient.New == nil || c.Op.Ingredient.New.Name != "pane" {
		t.Errorf("create = %+v", c.Op)
	}
	if c.Inverse.Kind != receipt.OpDeleteProduct || c.Inverse.Ref != "add:0" {
		t.Errorf("a created Product is compensated by deleting it: %+v", c.Inverse)
	}
	if n.Op.Ref != "add:0" || n.Op.Quantity != 450 || n.Op.PriceCents != 225 || n.Op.ShopID != 1 || n.Op.Date != "2026-11-13" || n.Op.UUID != "receipt:r1:0" {
		t.Errorf("scan = %+v", n.Op)
	}
	if n.Inverse.Kind != receipt.OpUndo || n.Inverse.UUID != "receipt:r1:0" {
		t.Errorf("inverse = %+v", n.Inverse)
	}
}

func TestAnAddOfSeveralPacksScansEachPackAtTheSharedPrice(t *testing.T) {
	choice := receipt.AddChoice{Ingredient: receipt.IngredientChoice{ID: 7}, ProductName: "Sacchetto", PackSize: 20}
	p := buildPlan(t, planInput(t, nil, []string{"add:0"}, map[string]receipt.AddChoice{"add:0": choice},
		mkLine(map[string]any{"row": -1, "text": "SACCHETTO", "count": 2, "priceCents": 498, "name": "Sacchetto", "packSize": 20, "packUnit": "piece"})))
	if got := kinds(p); len(got) != 3 || got[1] != receipt.OpNewScan || got[2] != receipt.OpNewScan {
		t.Fatalf("steps = %v", got)
	}
	if p.Steps[1].Op.PriceCents != 249 || p.Steps[2].Op.PriceCents != 249 || p.Steps[2].Op.UUID != "receipt:r1:1" || p.Steps[0].Op.Ingredient.ID != 7 {
		t.Errorf("steps = %+v", p.Steps)
	}
}

func TestAnAddWithoutItsChoicesIsRefused(t *testing.T) {
	in := planInput(t, nil, []string{"add:0"}, nil, mkLine(map[string]any{"row": -1, "text": "PANE", "grams": 450, "priceCents": 225, "name": "Pane"}))
	_, err := receipt.BuildPlan(in)
	pe, ok := err.(*receipt.PlanError)
	if !ok || pe.Code != receipt.PlanAddIncomplete || pe.ID != "add:0" {
		t.Errorf("err = %#v", err)
	}
}

func TestAnAcceptedIDThatIsNotAProposalIsRefused(t *testing.T) {
	in := planInput(t, nil, []string{"price:0", "price:99"}, nil, mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 270}))
	_, err := receipt.BuildPlan(in)
	pe, ok := err.(*receipt.PlanError)
	if !ok || pe.Code != receipt.PlanUnknownProposal || pe.ID != "price:99" {
		t.Errorf("err = %#v", err)
	}
}

func TestRemoveUndoesEachEventOfTheRow(t *testing.T) {
	p := buildPlan(t, planInput(t, nil, []string{"missing:0"}, nil, mkLine(map[string]any{"row": 1, "grams": 312, "priceCents": 624, "perKgCents": 2000})))
	if got := kinds(p); len(got) != 2 || got[0] != receipt.OpUndo || got[1] != receipt.OpUndo {
		t.Fatalf("steps = %v", got)
	}
	if p.Steps[0].Phase != receipt.PhaseRemove || p.Steps[0].Op.UUID != "e1" || p.Steps[1].Op.UUID != "e2" {
		t.Errorf("steps = %+v", p.Steps)
	}
	if p.Steps[0].Inverse.Kind != receipt.OpNewScan || p.Steps[0].Inverse.UUID != "receipt:r1:undo:e1" {
		t.Errorf("inverse = %+v", p.Steps[0].Inverse)
	}
}

func TestPlanOrderCorrectionsReplacementsQuantitiesPricesAddsRemoves(t *testing.T) {
	choice := receipt.AddChoice{Ingredient: receipt.IngredientChoice{ID: 7}, ProductName: "Sacchetto", PackSize: 20}
	in := planInput(t, map[string]any{"shopName": "Coop"},
		[]string{"missing:3", "add:3", "price:1", "quantity:0", "shop", "pack_size:2"},
		map[string]receipt.AddChoice{"add:3": choice},
		mkLine(map[string]any{"row": 0, "count": 3, "priceCents": 387}),
		mkLine(map[string]any{"row": 1, "grams": 312, "priceCents": 655, "perKgCents": 2100}),
		mkLine(map[string]any{"row": 2, "count": 1, "packSize": 400, "packUnit": "g"}),
		mkLine(map[string]any{"row": -1, "text": "SACCHETTO", "count": 1, "priceCents": 249, "name": "Sacchetto"}))
	// row 3 is not on the receipt, so missing:3 exists; the shop moves every scan, so rows 0, 1, 2 are replaced
	p := buildPlan(t, in)
	order := []receipt.Phase{receipt.PhaseCorrection, receipt.PhaseReplace, receipt.PhaseQuantity, receipt.PhasePrice, receipt.PhaseAdd, receipt.PhaseRemove}
	rank := map[receipt.Phase]int{}
	for i, ph := range order {
		rank[ph] = i
	}
	last, seen := -1, map[receipt.Phase]bool{}
	for i, s := range p.Steps {
		seen[s.Phase] = true
		if r := rank[s.Phase]; r < last {
			t.Errorf("step %d (%s, %s) is out of order: phases must run correction, replace, quantity, price, add, remove", i, s.Op.Kind, s.Phase)
		} else {
			last = r
		}
	}
	for _, ph := range []receipt.Phase{receipt.PhaseCorrection, receipt.PhaseReplace, receipt.PhaseAdd, receipt.PhaseRemove} {
		if !seen[ph] {
			t.Errorf("the scenario must reach the %s phase", ph)
		}
	}
}

func TestEveryStepHasAnInverse(t *testing.T) {
	choice := receipt.AddChoice{Ingredient: receipt.IngredientChoice{ID: 7}, ProductName: "Sacchetto", PackSize: 20}
	in := planInput(t, map[string]any{"shopName": "Coop"},
		[]string{"missing:3", "add:2", "price:0", "shop"},
		map[string]receipt.AddChoice{"add:2": choice},
		mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 270}),
		mkLine(map[string]any{"row": 1, "grams": 312, "priceCents": 624, "perKgCents": 2000}),
		mkLine(map[string]any{"row": -1, "text": "SACCHETTO", "count": 1, "priceCents": 249, "name": "Sacchetto"}))
	for i, s := range buildPlan(t, in).Steps {
		if s.Inverse.Kind == "" {
			t.Errorf("step %d (%s) has no inverse", i, s.Op.Kind)
		}
	}
}

func TestCompensateRunsTheInversesInReverseUpToTheFailure(t *testing.T) {
	p := buildPlan(t, planInput(t, map[string]any{"shopName": "Coop"}, []string{"shop"}, nil,
		mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258}),
		mkLine(map[string]any{"row": 1, "grams": 312, "priceCents": 624, "perKgCents": 2000})))
	if len(p.Steps) < 4 {
		t.Fatalf("steps = %v", kinds(p))
	}
	got := p.Compensate(3) // steps 0, 1 and 2 were applied; step 3 failed and left nothing
	if len(got) != 3 {
		t.Fatalf("compensation = %+v", got)
	}
	for i, want := range []receipt.Op{p.Steps[2].Inverse, p.Steps[1].Inverse, p.Steps[0].Inverse} {
		if got[i].Kind != want.Kind || got[i].UUID != want.UUID {
			t.Errorf("compensation %d = %+v, want %+v", i, got[i], want)
		}
	}
	if len(p.Compensate(0)) != 0 {
		t.Error("a failure at the first step has nothing to undo")
	}
	if n := len(p.Compensate(len(p.Steps) + 5)); n != len(p.Steps) {
		t.Errorf("a failedAt past the end compensates every step, got %d", n)
	}
}

// Review decision (design §8.1): the Shop and date move every scan the User keeps. A row the receipt does not list
// stays in the session unless the User accepts its missing proposal, and then it was bought on this trip too.
func TestShopAndDateAlsoMoveAKeptRowTheReceiptDoesNotList(t *testing.T) {
	in := planInput(t, map[string]any{"shopName": "Coop", "date": "2026-11-12"}, []string{"shop", "date"}, nil,
		mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258}),
		mkLine(map[string]any{"row": 1, "grams": 312, "priceCents": 624, "perKgCents": 2000}),
		mkLine(map[string]any{"row": 2, "count": 1, "priceCents": 99}))
	// row 3 (e5) is not on the receipt and the User keeps it
	p := buildPlan(t, in)
	undone, moved := map[string]bool{}, 0
	for _, s := range p.Steps {
		switch s.Op.Kind {
		case receipt.OpUndo:
			undone[s.Op.UUID] = true
		case receipt.OpNewScan:
			moved++
			if s.Op.ShopID != 2 || s.Op.Date != "2026-11-12" {
				t.Errorf("new scan goes to Coop on 12 Nov: %+v", s.Op)
			}
		}
	}
	for _, u := range []string{"e1", "e2", "e3", "e4", "e5"} {
		if !undone[u] {
			t.Errorf("%s is not moved", u)
		}
	}
	if moved != 5 {
		t.Errorf("5 events, 5 new scans, got %d", moved)
	}
}

func TestShopAndDateLeaveARemovedRowToItsRemove(t *testing.T) {
	in := planInput(t, map[string]any{"shopName": "Coop"}, []string{"shop", "missing:3"}, nil,
		mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258}),
		mkLine(map[string]any{"row": 1, "grams": 312, "priceCents": 624, "perKgCents": 2000}),
		mkLine(map[string]any{"row": 2, "count": 1, "priceCents": 99}))
	p := buildPlan(t, in)
	n := 0
	for _, s := range p.Steps {
		if s.Op.Kind == receipt.OpUndo && s.Op.UUID == "e5" {
			n++
			if s.Phase != receipt.PhaseRemove {
				t.Errorf("e5 is undone by its Remove only: %v", s.Phase)
			}
		}
	}
	if n != 1 {
		t.Errorf("e5 undone %d times", n)
	}
}

func TestAReweighedRowIsScannedAgainOnceAtTheNewShop(t *testing.T) {
	in := planInput(t, map[string]any{"shopName": "Coop"}, []string{"shop", "weight:1"}, nil,
		mkLine(map[string]any{"row": 1, "grams": 330, "priceCents": 660, "perKgCents": 2000}))
	in.Rows = in.Rows[1:2]
	in.Rows[0].Index = 0
	// the proposals were made on the four rows: re-key them to the one row kept here
	for i := range in.Proposals {
		if in.Proposals[i].ID == "weight:1" {
			in.Proposals[i].ID, in.Proposals[i].Row = "weight:0", 0
		}
	}
	in.Accept = []string{"shop", "weight:0"}
	p := buildPlan(t, in)
	if got := kinds(p); len(got) != 2 || got[0] != receipt.OpUndo || got[1] != receipt.OpNewScan {
		t.Fatalf("one undo and one new scan: %v", got)
	}
	if o := p.Steps[1].Op; o.ShopID != 2 || o.Quantity != 330 || o.PriceCents != 660 {
		t.Errorf("new scan = %+v", o)
	}
}

func TestAWeightChangeKeepsThePricePerKg(t *testing.T) {
	p := buildPlan(t, planInput(t, nil, []string{"weight:1"}, nil, mkLine(map[string]any{"row": 1, "grams": 330})))
	if n := p.Steps[len(p.Steps)-1].Op; n.Kind != receipt.OpNewScan || n.Quantity != 330 || n.PriceCents != 660 || n.PerKgCents != 2000 {
		t.Errorf("new scan = %+v", n)
	}
}

func TestAPackRowReadByWeightIsScannedAgainOnceAtItsWeight(t *testing.T) {
	p := buildPlan(t, planInput(t, nil, []string{"weight:0", "price:0"}, nil, mkLine(map[string]any{"row": 0, "grams": 1500, "priceCents": 290})))
	got := kinds(p)
	if len(got) != 3 || got[0] != receipt.OpUndo || got[1] != receipt.OpUndo || got[2] != receipt.OpNewScan {
		t.Fatalf("steps = %v", got)
	}
	if n := p.Steps[2].Op; n.ProductID != 10 || n.Quantity != 1500 || n.PerKgCents != 193 || n.PriceCents != 290 {
		t.Errorf("new scan = %+v", n)
	}
}

func TestAnAddChoiceNeedsAPackSizeAndAKnownBaseUnit(t *testing.T) {
	line := mkLine(map[string]any{"row": -1, "text": "PANE", "grams": 450, "priceCents": 225, "name": "Pane"})
	for name, c := range map[string]receipt.AddChoice{
		"no pack size":   {Ingredient: receipt.IngredientChoice{ID: 7}, ProductName: "Pane"},
		"blank name":     {Ingredient: receipt.IngredientChoice{ID: 7}, ProductName: "  ", PackSize: 450},
		"bad base unit":  {Ingredient: receipt.IngredientChoice{New: &receipt.NewIngredient{Name: "pane", BaseUnit: "kg"}}, ProductName: "Pane", PackSize: 450},
		"no ingredient":  {ProductName: "Pane", PackSize: 450},
		"blank new name": {Ingredient: receipt.IngredientChoice{New: &receipt.NewIngredient{Name: " ", BaseUnit: "g"}}, ProductName: "Pane", PackSize: 450},
	} {
		in := planInput(t, nil, []string{"add:0"}, map[string]receipt.AddChoice{"add:0": c}, line)
		if _, err := receipt.BuildPlan(in); err == nil {
			t.Errorf("%s: the Add must be refused", name)
		}
	}
}
