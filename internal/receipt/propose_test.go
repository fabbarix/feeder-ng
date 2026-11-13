package receipt_test

import (
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/receipt"
)

// RR1: Propose(rows, answer, ctx) Result (design §6; the design's []Proposal is a Result so that the notes and totals
// of §7.1 come from the same pure call). Decisions where the design is silent:
//   - a Proposal id is "<kind>:<row index>" (price, weight, quantity, pack_size, name, missing), "add:<line index>" for
//     Adds (the index in Answer.Lines), and plain "shop" and "date";
//   - the weight tolerance is max(1 % of the scanned quantity, 2 g): "more than 1 % or 2 g" is read as exceeding both;
//   - a per-pack Price is round half up of the sum of the lines' prices over the sum of their counts, or the printed
//     unit price when every line printed the same one;
//   - Proposals come in the review's section order: shop, date, price, weight, quantity, pack_size, name, add, missing.

func propose(t *testing.T, top map[string]any, lines ...map[string]any) receipt.Result {
	t.Helper()
	return receipt.Propose(fixtureRows(), answer(t, top, lines...), fixtureCtx())
}

func mustFind(t *testing.T, r receipt.Result, id string) receipt.Proposal {
	t.Helper()
	p, ok := find(r.Proposals, id)
	if !ok {
		t.Fatalf("no proposal %q in %v", id, ids(r.Proposals))
	}
	return p
}

func none(t *testing.T, r receipt.Result, id string) {
	t.Helper()
	if _, ok := find(r.Proposals, id); ok {
		t.Errorf("unexpected proposal %q in %v", id, ids(r.Proposals))
	}
}

func TestPriceChangeForAPackRow(t *testing.T) {
	r := propose(t, nil, mkLine(map[string]any{"row": 0, "text": "MUTTI", "count": 2, "priceCents": 270}))
	p := mustFind(t, r, "price:0")
	if p.Kind != receipt.KindPrice || p.Row != 0 || p.Before.PriceCents == nil || *p.Before.PriceCents != 129 ||
		p.After.PriceCents == nil || *p.After.PriceCents != 135 || p.After.PerKg || p.Text != "MUTTI" {
		t.Errorf("price proposal = %+v", p)
	}
}

func TestNoPriceProposalWhenThePriceIsTheSame(t *testing.T) {
	none(t, propose(t, nil, mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258})), "price:0")
}

func TestPriceProposalForARowWithoutAPrice(t *testing.T) {
	p := mustFind(t, propose(t, nil, mkLine(map[string]any{"row": 2, "count": 1, "priceCents": 99})), "price:2")
	if p.Before.PriceCents != nil || *p.After.PriceCents != 99 {
		t.Errorf("Add price: before nil, after 99: %+v", p)
	}
}

func TestPriceIsTheRoundedAverageOverSplitLines(t *testing.T) {
	// one Product on two lines (a split receipt): 100 + 101 over 2 packs = 100.5, rounded half up
	r := propose(t, nil,
		mkLine(map[string]any{"row": 0, "count": 1, "priceCents": 100}),
		mkLine(map[string]any{"row": 0, "count": 1, "priceCents": 101}))
	if p := mustFind(t, r, "price:0"); *p.After.PriceCents != 101 {
		t.Errorf("after = %d, want 101", *p.After.PriceCents)
	}
}

func TestPriceUsesThePrintedUnitPriceWhenEveryLinePrintedTheSame(t *testing.T) {
	// 3 packs for 4.00 with a discount: the shelf price is 1.35, not 1.33
	r := propose(t, nil, mkLine(map[string]any{"row": 0, "count": 3, "priceCents": 400, "unitPriceCents": 135}))
	if p := mustFind(t, r, "price:0"); *p.After.PriceCents != 135 {
		t.Errorf("after = %d, want 135", *p.After.PriceCents)
	}
}

func TestPriceProposalIgnoresALineWithAnUnreadablePrice(t *testing.T) {
	none(t, propose(t, nil, mkLine(map[string]any{"row": 0, "count": 2})), "price:0")
}

func TestPricePerKgOfAWeighedRowFromThePrintedPerKg(t *testing.T) {
	r := propose(t, nil, mkLine(map[string]any{"row": 1, "grams": 312, "priceCents": 655, "perKgCents": 2100}))
	p := mustFind(t, r, "price:1")
	if !p.After.PerKg || *p.After.PriceCents != 2100 || p.Before.PriceCents == nil || *p.Before.PriceCents != 2000 || !p.Before.PerKg {
		t.Errorf("per kg proposal = %+v", p)
	}
}

func TestPricePerKgDerivedFromThePriceAndTheWeight(t *testing.T) {
	// 655 x 1000 / 312 = 2099.36 -> 2099
	p := mustFind(t, propose(t, nil, mkLine(map[string]any{"row": 1, "grams": 312, "priceCents": 655})), "price:1")
	if !p.After.PerKg || *p.After.PriceCents != 2099 {
		t.Errorf("per kg = %+v", p.After)
	}
}

func TestWeighedRowAtTheSamePricePerKgHasNoPriceProposal(t *testing.T) {
	r := propose(t, nil, mkLine(map[string]any{"row": 1, "grams": 312, "priceCents": 624, "perKgCents": 2000}))
	none(t, r, "price:1")
	none(t, r, "weight:1")
}

func TestWeightProposalWithItsNewPrice(t *testing.T) {
	r := propose(t, nil, mkLine(map[string]any{"row": 1, "grams": 330, "priceCents": 660, "perKgCents": 2000}))
	p := mustFind(t, r, "weight:1")
	if p.Kind != receipt.KindWeight || *p.Before.Grams != 312 || *p.After.Grams != 330 || *p.After.PriceCents != 660 {
		t.Errorf("weight proposal = %+v", p)
	}
	none(t, r, "price:1") // the per kg price did not change
}

func TestWeightPriceFollowsThePerKgWhenTheLineHasNoPrice(t *testing.T) {
	r := propose(t, nil, mkLine(map[string]any{"row": 1, "grams": 330, "perKgCents": 2000}))
	if p := mustFind(t, r, "weight:1"); *p.After.PriceCents != 660 {
		t.Errorf("2000/kg x 330 g = 660, got %d", *p.After.PriceCents)
	}
}

func TestWeightToleranceIsOnePercentOrTwoGrams(t *testing.T) {
	for grams, want := range map[int]bool{312: false, 313: false, 315: false, 316: true, 310: false, 309: false, 308: true, 400: true} {
		r := propose(t, nil, mkLine(map[string]any{"row": 1, "grams": grams, "priceCents": 624, "perKgCents": 2000}))
		if _, got := find(r.Proposals, "weight:1"); got != want {
			t.Errorf("%d g against 312 g: proposed=%v, want %v", grams, got, want)
		}
	}
	// a big weight: 1 % of 3000 g is 30 g, so 3020 g is within the tolerance
	rows := fixtureRows()
	rows[1].Quantity = 3000
	rows[1].Events[0].Quantity = 3000
	a := answer(t, nil, mkLine(map[string]any{"row": 1, "grams": 3020, "perKgCents": 2000}))
	if _, ok := find(receipt.Propose(rows, a, fixtureCtx()).Proposals, "weight:1"); ok {
		t.Error("3020 g against 3000 g is inside 1 %")
	}
}

func TestWeightsSumOverSplitLines(t *testing.T) {
	r := propose(t, nil,
		mkLine(map[string]any{"row": 1, "grams": 200, "priceCents": 400}),
		mkLine(map[string]any{"row": 1, "grams": 130, "priceCents": 260}))
	if p := mustFind(t, r, "weight:1"); *p.After.Grams != 330 || *p.After.PriceCents != 660 {
		t.Errorf("sum of both lines: %+v", p.After)
	}
}

func TestQuantityDifference(t *testing.T) {
	r := propose(t, nil, mkLine(map[string]any{"row": 0, "count": 3, "priceCents": 387}))
	p := mustFind(t, r, "quantity:0")
	if p.Kind != receipt.KindQuantity || *p.Before.Count != 2 || *p.After.Count != 3 {
		t.Errorf("quantity proposal = %+v", p)
	}
	none(t, r, "price:0") // 387 / 3 = 129
}

func TestQuantitySumsOverSplitLinesAndIgnoresWeighedRows(t *testing.T) {
	r := propose(t, nil,
		mkLine(map[string]any{"row": 0, "count": 1, "priceCents": 129}),
		mkLine(map[string]any{"row": 0, "count": 1, "priceCents": 129}),
		mkLine(map[string]any{"row": 1, "count": 2, "grams": 312, "priceCents": 624}))
	none(t, r, "quantity:0")
	none(t, r, "quantity:1")
}

func TestCorrectionsPackSizeAndName(t *testing.T) {
	r := propose(t, nil,
		mkLine(map[string]any{"row": 2, "count": 1, "priceCents": 99, "packSize": 400, "packUnit": "g"}),
		mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258, "name": "Mutti passata 500 g"}))
	ps := mustFind(t, r, "pack_size:2")
	if ps.Kind != receipt.KindPackSize || *ps.Before.PackSize != 500 || *ps.After.PackSize != 400 || ps.After.PackUnit != "g" {
		t.Errorf("pack size = %+v", ps)
	}
	nm := mustFind(t, r, "name:0")
	if nm.Kind != receipt.KindName || nm.Before.Name != "Mutti passata 700 g" || nm.After.Name != "Mutti passata 500 g" {
		t.Errorf("name = %+v", nm)
	}
}

func TestNoCorrectionWhenTheNameDiffersOnlyByCaseAndSpacing(t *testing.T) {
	r := propose(t, nil, mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258, "name": "  MUTTI  passata 700 g "}))
	none(t, r, "name:0")
}

func TestNoPackSizeCorrectionWhenItIsTheSame(t *testing.T) {
	r := propose(t, nil, mkLine(map[string]any{"row": 2, "count": 1, "packSize": 500, "packUnit": "g"}))
	none(t, r, "pack_size:2")
}

func TestAddForALineThatWasNotScanned(t *testing.T) {
	r := propose(t, nil,
		mkLine(map[string]any{"row": -1, "text": "PANE CASERECCIO 0,45 kg", "grams": 450, "priceCents": 225, "name": "Pane casereccio"}),
		mkLine(map[string]any{"row": -1, "text": "SACCHETTO", "count": 2, "priceCents": 498, "name": "Sacchetto", "packSize": 20, "packUnit": "piece"}),
		mkLine(map[string]any{"row": -1, "text": "NO PRICE", "count": 1, "name": "X"}),
		mkLine(map[string]any{"row": -1, "text": "SCONTO FEDELTA", "priceCents": -200}),
		mkLine(map[string]any{"row": -1, "text": "NOTHING BOUGHT", "priceCents": 100}))
	pane := mustFind(t, r, "add:0")
	if pane.Kind != receipt.KindAdd || pane.Row != -1 || pane.Line != 0 || pane.After.Name != "Pane casereccio" ||
		*pane.After.Grams != 450 || *pane.After.PriceCents != 225 || pane.Text != "PANE CASERECCIO 0,45 kg" || !pane.NeedsInput {
		t.Errorf("weighed add = %+v", pane)
	}
	sac := mustFind(t, r, "add:1")
	if *sac.After.Count != 2 || *sac.After.PriceCents != 498 || *sac.After.PackSize != 20 || sac.After.PackUnit != "piece" {
		t.Errorf("pack add = %+v", sac)
	}
	for _, id := range []string{"add:2", "add:3", "add:4"} {
		none(t, r, id)
	}
}

func TestMissingForAScannedRowNoLineMatched(t *testing.T) {
	r := propose(t, nil, mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258}))
	for _, id := range []string{"missing:1", "missing:2", "missing:3"} {
		p := mustFind(t, r, id)
		if p.Kind != receipt.KindMissing {
			t.Errorf("%s kind = %s", id, p.Kind)
		}
	}
	if p := mustFind(t, r, "missing:3"); p.Row != 3 || p.Before.Name != "Latte intero 1 l" {
		t.Errorf("missing:3 = %+v", p)
	}
	none(t, r, "missing:0")
}

func TestShopProposalWhenTheReceiptNamesAnotherSavedShop(t *testing.T) {
	r := propose(t, map[string]any{"shopName": "COOP "}, mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258}))
	p := mustFind(t, r, "shop")
	if p.Kind != receipt.KindShop || p.After.ShopID != 2 || p.After.Shop != "Coop" || p.Before.Shop != "Esselunga" || p.Before.ShopID != 1 {
		t.Errorf("shop = %+v", p)
	}
}

func TestNoShopProposalForTheSessionShopOrAnUnknownOne(t *testing.T) {
	for _, name := range []string{"", "esselunga", "  ESSELUNGA  ", "Esselunga S.p.A."} {
		r := propose(t, map[string]any{"shopName": name}, mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258}))
		none(t, r, "shop")
	}
	r := propose(t, map[string]any{"shopName": "Penny"}, mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258}))
	none(t, r, "shop")
	var note *receipt.Note
	for i := range r.Notes {
		if r.Notes[i].Code == receipt.NoteShopUnknown {
			note = &r.Notes[i]
		}
	}
	if note == nil || note.Text != "Penny" {
		t.Errorf("an unknown shop name is a note only, with the printed name: %+v", r.Notes)
	}
}

func TestNoShopProposalWhenTwoSavedShopsMatch(t *testing.T) {
	ctx := fixtureCtx()
	ctx.Shops = append(ctx.Shops, receipt.Shop{ID: 4, Name: "coop"})
	r := receipt.Propose(fixtureRows(), answer(t, map[string]any{"shopName": "Coop"}, mkLine(map[string]any{"row": 0, "count": 2})), ctx)
	none(t, r, "shop")
}

func TestDateProposalWithinTheLastSevenDays(t *testing.T) {
	for date, want := range map[string]bool{"2026-11-13": false, "2026-11-12": true, "2026-11-06": true, "2026-11-05": false, "": false} {
		r := propose(t, map[string]any{"date": date}, mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258}))
		p, got := find(r.Proposals, "date")
		if got != want {
			t.Errorf("date %q: proposed=%v, want %v", date, got, want)
		}
		if got && (p.Kind != receipt.KindDate || p.After.Date != date || p.Before.Date != "2026-11-13") {
			t.Errorf("date proposal = %+v", p)
		}
	}
}

func TestReviewDefaults(t *testing.T) {
	r := propose(t, map[string]any{"shopName": "Coop", "date": "2026-11-12"},
		mkLine(map[string]any{"row": 0, "count": 3, "priceCents": 400, "name": "Mutti passata", "packSize": 500, "packUnit": "g"}),
		mkLine(map[string]any{"row": 1, "grams": 330, "priceCents": 700, "perKgCents": 2121}),
		mkLine(map[string]any{"row": -1, "text": "PANE", "count": 1, "priceCents": 225, "name": "Pane"}))
	want := map[receipt.Kind]bool{
		receipt.KindPrice: true, receipt.KindWeight: true, receipt.KindQuantity: true, // checked
		receipt.KindPackSize: false, receipt.KindName: false, receipt.KindShop: false, receipt.KindDate: false, // corrections, shop and date
		receipt.KindAdd: false, receipt.KindMissing: false, // wait for their form / never a default
	}
	seen := map[receipt.Kind]bool{}
	for _, p := range r.Proposals {
		seen[p.Kind] = true
		if w, ok := want[p.Kind]; ok && p.Checked != w {
			t.Errorf("%s: Checked = %v, want %v", p.ID, p.Checked, w)
		}
	}
	for k := range want {
		if !seen[k] {
			t.Errorf("the scenario must produce a %s proposal: %v", k, ids(r.Proposals))
		}
	}
}

func TestProposalsComeInTheReviewsSectionOrder(t *testing.T) {
	r := propose(t, map[string]any{"shopName": "Coop", "date": "2026-11-12"},
		mkLine(map[string]any{"row": 0, "count": 3, "priceCents": 400, "name": "Mutti passata", "packSize": 500, "packUnit": "g"}),
		mkLine(map[string]any{"row": 1, "grams": 330, "priceCents": 700, "perKgCents": 2121}),
		mkLine(map[string]any{"row": -1, "text": "PANE", "count": 1, "priceCents": 225, "name": "Pane"}))
	order := map[receipt.Kind]int{receipt.KindShop: 0, receipt.KindDate: 1, receipt.KindPrice: 2, receipt.KindWeight: 3,
		receipt.KindQuantity: 4, receipt.KindPackSize: 5, receipt.KindName: 6, receipt.KindAdd: 7, receipt.KindMissing: 8}
	last := -1
	for _, p := range r.Proposals {
		if o := order[p.Kind]; o < last {
			t.Errorf("%s out of order in %v", p.ID, ids(r.Proposals))
		} else {
			last = o
		}
	}
	if len(r.Proposals) < 8 {
		t.Errorf("expected every kind, got %v", ids(r.Proposals))
	}
}

func TestProposalIDsAreStableAcrossRuns(t *testing.T) {
	lines := []map[string]any{mkLine(map[string]any{"row": 0, "count": 3, "priceCents": 400}), mkLine(map[string]any{"row": -1, "count": 1, "priceCents": 5})}
	a, b := ids(propose(t, nil, lines...).Proposals), ids(propose(t, nil, lines...).Proposals)
	if fmt.Sprint(a) != fmt.Sprint(b) || len(a) == 0 {
		t.Errorf("%v vs %v", a, b)
	}
}

func TestWholeReceiptDiscountIsANoteNeverAProposal(t *testing.T) {
	r := propose(t, nil,
		mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258}),
		mkLine(map[string]any{"row": -1, "text": "SCONTO FEDELTA", "priceCents": -200}))
	for _, p := range r.Proposals {
		if p.Kind == receipt.KindAdd {
			t.Errorf("a discount is not an Add: %+v", p)
		}
	}
	found := false
	for _, n := range r.Notes {
		if n.Code == receipt.NoteDiscount && n.Cents != nil && *n.Cents == -200 && n.Text == "SCONTO FEDELTA" {
			found = true
		}
	}
	if !found {
		t.Errorf("want a discount note: %+v", r.Notes)
	}
}

func TestSuppliesInPiecesHaveNoPerKgProposal(t *testing.T) {
	rows := []receipt.Row{{Index: 0, ProductID: 20, Product: "Sacchetti", BaseUnit: "piece", PackSize: 20, Scans: 1, Quantity: 20,
		PriceCents: 100, PerKgCents: -1, Events: []receipt.Event{{UUID: "s1", Quantity: 20, PriceCents: 100, PerKgCents: -1, ShopID: 1, Date: "2026-11-13"}}}}
	a, _, err := receipt.Finish(mkRaw(t, nil, mkLine(map[string]any{"row": 0, "count": 1, "priceCents": 110, "perKgCents": 500})), rows, "2026-11-13")
	if err != nil {
		t.Fatal(err)
	}
	r := receipt.Propose(rows, a, fixtureCtx())
	p := mustFind(t, r, "price:0")
	if p.After.PerKg || *p.After.PriceCents != 110 {
		t.Errorf("a piece row is priced per pack, whatever the line says per kg: %+v", p)
	}
}

func TestTotalsAndTheDifferenceNote(t *testing.T) {
	lines := []map[string]any{
		mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 270}),
		mkLine(map[string]any{"row": 1, "grams": 312, "priceCents": 624, "perKgCents": 2000}),
		mkLine(map[string]any{"row": 2, "count": 1, "priceCents": 99}),
		mkLine(map[string]any{"row": -1, "text": "PANE", "count": 1, "priceCents": 249, "name": "Pane"}),
	}
	// the Scanned list costs 258 + 624 + 0 (row 2 has no price) + 150 = 1032; after the proposals (row 3 is not on
	// the receipt) it is 270 + 624 + 99 + 249 = 1242
	r := propose(t, map[string]any{"totalCents": 1242}, lines...)
	if r.Totals.ScannedCents != 1032 || r.Totals.ProjectedCents != 1242 || r.Totals.ReceiptCents == nil || *r.Totals.ReceiptCents != 1242 || r.Totals.Lines != 4 {
		t.Errorf("totals = %+v", r.Totals)
	}
	for _, n := range r.Notes {
		if n.Code == receipt.NoteTotalDiffers {
			t.Errorf("the totals agree: %+v", n)
		}
	}
	r = propose(t, map[string]any{"totalCents": 1292}, lines...)
	found := false
	for _, n := range r.Notes {
		if n.Code == receipt.NoteTotalDiffers && n.Cents != nil && *n.Cents == 50 {
			found = true
		}
	}
	if !found {
		t.Errorf("the receipt is 50 more than the list after the proposals: %+v", r.Notes)
	}
	r = propose(t, nil, lines...) // total unreadable: no note
	for _, n := range r.Notes {
		if n.Code == receipt.NoteTotalDiffers {
			t.Errorf("no total, no comparison: %+v", n)
		}
	}
}

func TestProposeOnAnExactReceiptProposesNothingButMissingRows(t *testing.T) {
	r := propose(t, nil,
		mkLine(map[string]any{"row": 0, "count": 2, "priceCents": 258}),
		mkLine(map[string]any{"row": 1, "grams": 312, "priceCents": 624, "perKgCents": 2000}),
		mkLine(map[string]any{"row": 3, "count": 1, "priceCents": 150}))
	if got := ids(r.Proposals); len(got) != 1 || got[0] != "missing:2" {
		t.Errorf("proposals = %v", got)
	}
}

// Review: a weighed line whose price and per kg are both unreadable keeps the row's own price per kg (design §6, "the
// new Price follows").
func TestWeightPriceFollowsTheRowsPerKgWhenTheLineHasNone(t *testing.T) {
	r := propose(t, nil, mkLine(map[string]any{"row": 1, "grams": 330}))
	p := mustFind(t, r, "weight:1")
	if p.After.PriceCents == nil || *p.After.PriceCents != 660 {
		t.Errorf("the row's 2000/kg x 330 g = 660: %+v", p.After)
	}
	none(t, r, "price:1")
}

// Review: design §6 reads "a weighed row (or a Product in g whose line has grams > 0)" by weight.
func TestAProductInGramsWhoseLineGivesGramsIsReadByWeight(t *testing.T) {
	r := propose(t, nil, mkLine(map[string]any{"row": 0, "grams": 1500, "priceCents": 290}))
	w := mustFind(t, r, "weight:0")
	if *w.Before.Grams != 1400 || *w.After.Grams != 1500 || *w.After.PriceCents != 290 || *w.Before.PriceCents != 258 {
		t.Errorf("weight = before %v/%v after %v/%v", *w.Before.Grams, *w.Before.PriceCents, *w.After.Grams, *w.After.PriceCents)
	}
	p := mustFind(t, r, "price:0")
	if !p.After.PerKg || *p.After.PriceCents != 193 || *p.Before.PriceCents != 184 { // 290 / 1.5 kg; 129 / 0.7 kg
		t.Errorf("price per kg = before %v after %v", *p.Before.PriceCents, *p.After.PriceCents)
	}
	none(t, r, "quantity:0")
	none(t, r, "pack_size:0")
}

func TestAWeighedRowWithATinyQuantityDoesNotDivideByZero(t *testing.T) {
	rows := fixtureRows()
	rows[1].Quantity, rows[1].PerKgCents = 0.3, -1
	a := answer(t, nil, mkLine(map[string]any{"row": 1, "grams": 300, "priceCents": 600}))
	if _, ok := find(receipt.Propose(rows, a, fixtureCtx()).Proposals, "price:1"); !ok {
		t.Error("the line's per kg is proposed, the row has none")
	}
}
