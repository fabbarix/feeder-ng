package baserecipe_test

import (
	"math/rand"
	"testing"

	br "github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
)

// ---- Flatten ----

func TestFlattenBaseRecipeIsAnOptionalZeroLineThenItsLeaves(t *testing.T) {
	tree := mustExpand(t, baseCat(), rLasagne)
	flat := br.Flatten(tree)
	wantIDs := []int64{iBechamelI, iMilk, iButter, iFlour, iPasta}
	if len(flat) != len(wantIDs) {
		t.Fatalf("flat = %+v", flat)
	}
	for i, id := range wantIDs {
		if flat[i].IngredientID != id {
			t.Fatalf("flat[%d] = %d, want %d (depth first): %+v", i, flat[i].IngredientID, id, flat)
		}
	}
	b := flat[0]
	if !b.Optional || b.Quantity != 0 {
		t.Errorf("Base recipe line = %+v, want optional with Quantity 0", b)
	}
	wantQty(t, "milk", flat[1].Quantity, 500)
	wantQty(t, "pasta", flat[4].Quantity, 200)
	for _, n := range flat[1:] {
		if n.Optional {
			t.Errorf("leaf %d must stay required: %+v", n.IngredientID, n)
		}
		if n.Made != nil {
			t.Errorf("flat needs carry no Made: %+v", n)
		}
	}
}

func TestFlattenNestedKeepsEveryDepth(t *testing.T) {
	flat := br.Flatten(mustExpand(t, nestedCat(), rLasagne))
	for _, id := range []int64{iBechamelI, iRouxI} {
		var found bool
		for _, n := range flat {
			if n.IngredientID == id {
				found = true
				if !n.Optional || n.Quantity != 0 {
					t.Errorf("Base recipe %d = %+v", id, n)
				}
			}
		}
		if !found {
			t.Errorf("Base recipe %d missing from %+v", id, flat)
		}
	}
	wantQty(t, "flour", sum(flat, iFlour), 50)
	wantQty(t, "milk", sum(flat, iMilk), 500)
}

func TestFlattenEmptyBaseRecipeStaysARealLine(t *testing.T) {
	b := bechamel()
	b.Lines = nil
	flat := br.Flatten(mustExpand(t, baseCat().add(b), rLasagne))
	var got *br.Need
	for i := range flat {
		if flat[i].IngredientID == iBechamelI {
			got = &flat[i]
		}
	}
	if got == nil {
		t.Fatal("empty Base recipe vanished")
	}
	if got.Optional || !near(got.Quantity, 500) {
		t.Errorf("empty Base recipe = %+v, want a required 500 line", *got)
	}
}

func TestFlattenOptionalBaseRecipeLeavesAreOptional(t *testing.T) {
	l := lasagne()
	l.Lines = []br.Line{{IngredientID: iBechamelI, Quantity: 500, Unit: "ml", Optional: true}}
	flat := br.Flatten(mustExpand(t, baseCat().add(l), rLasagne))
	for _, n := range flat {
		if !n.Optional {
			t.Errorf("%+v should be optional", n)
		}
	}
}

func TestFlattenHandBuiltTree(t *testing.T) {
	// Unconvertible lines are skipped by Expand, so they never reach Flatten; Flatten must not invent lines
	// and must tolerate empty input.
	if got := br.Flatten(nil); len(got) != 0 {
		t.Errorf("Flatten(nil) = %+v", got)
	}
	tree := []br.Need{{IngredientID: iPasta, Quantity: 10}}
	got := br.Flatten(tree)
	if len(got) != 1 || got[0].IngredientID != iPasta || got[0].Quantity != 10 {
		t.Errorf("got %+v", got)
	}
}

func TestFlattenDoesNotModifyTheTree(t *testing.T) {
	tree := mustExpand(t, baseCat(), rLasagne)
	br.Flatten(tree)
	if tree[0].Quantity != 500 || len(tree[0].Made) != 3 || tree[0].Optional {
		t.Errorf("tree changed: %+v", tree[0])
	}
}

// ---- Resolve ----

func resolve(t *testing.T, cat br.Catalog, batches float64, stock stockOf) []br.Need {
	t.Helper()
	return br.Resolve(mustExpand(t, cat, rLasagne), batches, stock.have, stock.take)
}

func TestResolveNoStockMakesEverything(t *testing.T) {
	stock := stockOf{}
	out := resolve(t, baseCat(), 1, stock)
	wantQty(t, "milk", sum(out, iMilk), 500)
	wantQty(t, "butter", sum(out, iButter), 25)
	wantQty(t, "pasta", sum(out, iPasta), 200)
	wantQty(t, "jar", sum(out, iBechamelI), 0)
	if len(stock) != 0 && stock[iBechamelI] != 0 {
		t.Errorf("took from nothing: %v", stock)
	}
}

func TestResolveStockCoversAll(t *testing.T) {
	stock := stockOf{iBechamelI: 600}
	out := resolve(t, baseCat(), 1, stock)
	wantQty(t, "jar taken", sum(out, iBechamelI), 500)
	wantQty(t, "milk", sum(out, iMilk), 0)
	wantQty(t, "butter", sum(out, iButter), 0)
	wantQty(t, "pasta", sum(out, iPasta), 200)
	wantQty(t, "stock left", stock[iBechamelI], 100)
}

func TestResolveStockCoversPart(t *testing.T) {
	stock := stockOf{iBechamelI: 300}
	out := resolve(t, baseCat(), 1, stock)
	wantQty(t, "jar taken", sum(out, iBechamelI), 300)
	// 200 of 500 ml is made: x0.4 of the 500 ml milk, 25 g butter, 25 g flour.
	wantQty(t, "milk", sum(out, iMilk), 200)
	wantQty(t, "butter", sum(out, iButter), 10)
	wantQty(t, "flour", sum(out, iFlour), 10)
	wantQty(t, "stock left", stock[iBechamelI], 0)
}

func TestResolveBatchesMultiplyOnTop(t *testing.T) {
	// 2 Batches need 1000 ml of béchamel; 300 ml in the jar -> 700/1000 made.
	stock := stockOf{iBechamelI: 300}
	out := resolve(t, baseCat(), 2, stock)
	wantQty(t, "jar taken", sum(out, iBechamelI), 300)
	wantQty(t, "milk", sum(out, iMilk), 700)
	wantQty(t, "butter", sum(out, iButter), 35)
	wantQty(t, "pasta", sum(out, iPasta), 400)
}

func TestResolveBatchesNoStock(t *testing.T) {
	out := resolve(t, baseCat(), 2, stockOf{})
	wantQty(t, "milk", sum(out, iMilk), 1000)
	wantQty(t, "pasta", sum(out, iPasta), 400)
}

func TestResolveFractionalBatches(t *testing.T) {
	out := resolve(t, baseCat(), 0.5, stockOf{})
	wantQty(t, "milk", sum(out, iMilk), 250)
}

func TestResolveNestedPartial(t *testing.T) {
	// A jar of béchamel (250 of 500 ml), no roux: half of the béchamel is made, so half of the roux inside.
	stock := stockOf{iBechamelI: 250}
	out := resolve(t, nestedCat(), 1, stock)
	wantQty(t, "jar", sum(out, iBechamelI), 250)
	wantQty(t, "milk", sum(out, iMilk), 250)
	wantQty(t, "roux jar", sum(out, iRouxI), 0)
	wantQty(t, "flour", sum(out, iFlour), 25)
	wantQty(t, "butter", sum(out, iButter), 25)
}

func TestResolveNestedInnerStock(t *testing.T) {
	// Roux in Stock (100 g needed, 60 g on the shelf), no béchamel: milk in full, roux 40% made.
	stock := stockOf{iRouxI: 60}
	out := resolve(t, nestedCat(), 1, stock)
	wantQty(t, "milk", sum(out, iMilk), 500)
	wantQty(t, "roux taken", sum(out, iRouxI), 60)
	wantQty(t, "flour", sum(out, iFlour), 20)
	wantQty(t, "butter", sum(out, iButter), 20)
	wantQty(t, "stock left", stock[iRouxI], 0)
}

func TestResolveNestedOuterCoversSoInnerIsNotTouched(t *testing.T) {
	stock := stockOf{iBechamelI: 500, iRouxI: 100}
	out := resolve(t, nestedCat(), 1, stock)
	wantQty(t, "jar", sum(out, iBechamelI), 500)
	wantQty(t, "roux taken", sum(out, iRouxI), 0)
	wantQty(t, "roux stock untouched", stock[iRouxI], 100)
	wantQty(t, "flour", sum(out, iFlour), 0)
}

func TestResolveTwoLinesShareOneJar(t *testing.T) {
	l := lasagne()
	l.Lines = []br.Line{line(iBechamelI, 500, "ml"), line(iBechamelI, 500, "ml")}
	c := baseCat().add(l)
	stock := stockOf{iBechamelI: 700}
	out := resolve(t, c, 1, stock)
	wantQty(t, "jar taken", sum(out, iBechamelI), 700)
	// First line takes 500, the second takes 200 and makes 300 of 500 (x0.6).
	wantQty(t, "milk", sum(out, iMilk), 300)
	wantQty(t, "stock left", stock[iBechamelI], 0)
}

func TestResolveSeveralCoursesShareOneJar(t *testing.T) {
	// A Mark of two Courses is two Resolve calls on one availability map.
	c := baseCat()
	tree := mustExpand(t, c, rLasagne)
	stock := stockOf{iBechamelI: 600}
	first := br.Resolve(tree, 1, stock.have, stock.take)
	second := br.Resolve(tree, 1, stock.have, stock.take)
	wantQty(t, "first jar", sum(first, iBechamelI), 500)
	wantQty(t, "first milk", sum(first, iMilk), 0)
	wantQty(t, "second jar", sum(second, iBechamelI), 100)
	wantQty(t, "second milk", sum(second, iMilk), 400)
}

func TestResolveEmptyBaseRecipeDeductsItsOwnIngredient(t *testing.T) {
	b := bechamel()
	b.Lines = nil
	c := baseCat().add(b)
	stock := stockOf{iBechamelI: 200}
	out := resolve(t, c, 2, stock)
	// 1000 ml needed in all: the 200 ml jar and 800 ml more of the Ingredient itself.
	wantQty(t, "béchamel as Ingredient", sum(out, iBechamelI), 1000)
	wantQty(t, "stock taken", 200-stock[iBechamelI], 200)
}

func TestResolveOptionalIsKept(t *testing.T) {
	l := lasagne()
	l.Lines = []br.Line{{IngredientID: iBechamelI, Quantity: 500, Unit: "ml", Optional: true}}
	out := resolve(t, baseCat().add(l), 1, stockOf{})
	for _, n := range out {
		if !n.Optional {
			t.Errorf("%+v lost Optional", n)
		}
	}
}

func TestResolveOutputIsFlat(t *testing.T) {
	out := resolve(t, nestedCat(), 1, stockOf{iBechamelI: 100})
	for _, n := range out {
		if n.Made != nil {
			t.Errorf("Resolve output must be flat: %+v", n)
		}
	}
}

func TestResolveZeroQuantityBaseNodeIsHarmless(t *testing.T) {
	tree := []br.Need{{IngredientID: iBechamelI, Quantity: 0, BaseRecipeID: rBechamel, Made: []br.Need{{IngredientID: iMilk, Quantity: 0}}}}
	stock := stockOf{iBechamelI: 5}
	out := br.Resolve(tree, 1, stock.have, stock.take)
	wantQty(t, "milk", sum(out, iMilk), 0)
	wantQty(t, "stock untouched", stock[iBechamelI], 5)
}

func TestResolveDoesNotModifyTheTree(t *testing.T) {
	tree := mustExpand(t, baseCat(), rLasagne)
	br.Resolve(tree, 3, stockOf{iBechamelI: 100}.have, func(int64, float64) {})
	wantQty(t, "tree quantity", tree[0].Made[0].Quantity, 500)
}

// ---- properties ----

// randomTree builds a Lasagne -> Béchamel -> Roux catalogue with random quantities and yields.
func randomCat(r *rand.Rand) *fakeCat {
	q := func() float64 { return float64(1 + r.Intn(900)) }
	b := bechamel()
	b.Base.Quantity = float64(1 + r.Intn(3))
	b.Lines = []br.Line{line(iMilk, q(), "ml"), line(iRouxI, q(), "g")}
	roux := br.Recipe{ID: rRoux, Name: "Roux", Base: &br.Yield{IngredientID: iRouxI, Quantity: q(), Unit: "g"},
		Lines: []br.Line{line(iFlour, q(), "g"), line(iButter, q(), "g")}}
	l := lasagne()
	l.Lines = []br.Line{line(iBechamelI, q(), "ml"), line(iPasta, q(), "g")}
	return newCat().add(b, ml("Béchamel")).add(roux, grams("Roux")).add(l)
}

func TestPropertyResolveConservesTheMade(t *testing.T) {
	r := rand.New(rand.NewSource(42))
	for n := 0; n < 200; n++ {
		c := randomCat(r)
		tree := mustExpand(t, c, rLasagne)
		batches := 0.25 + r.Float64()*4
		full := br.Resolve(tree, batches, stockOf{}.have, func(int64, float64) {})
		stock := stockOf{iBechamelI: r.Float64() * 3000, iRouxI: r.Float64() * 600}
		start := stockOf{iBechamelI: stock[iBechamelI], iRouxI: stock[iRouxI]}
		got := br.Resolve(tree, batches, stock.have, stock.take)
		for _, id := range []int64{iMilk, iFlour, iButter, iPasta} {
			if sum(got, id) > sum(full, id)+eps {
				t.Fatalf("iter %d: Stock made ingredient %d grow: %v > %v", n, id, sum(got, id), sum(full, id))
			}
			if sum(got, id) < -eps {
				t.Fatalf("negative quantity for %d", id)
			}
		}
		wantQty(t, "pasta is never Stock-covered", sum(got, iPasta), sum(full, iPasta))
		for _, id := range []int64{iBechamelI, iRouxI} {
			if stock[id] < -eps {
				t.Fatalf("iter %d: took more than the Stock had of %d", n, id)
			}
			// What Resolve reports as the covered part is exactly what take removed.
			wantQty(t, "taken = reported", start[id]-stock[id], sum(got, id))
		}
		// Milk is only scaled by the béchamel left to make.
		need := tree[0].Quantity * batches
		left := need - sum(got, iBechamelI)
		wantQty(t, "milk", sum(got, iMilk), sum(full, iMilk)*left/need)
	}
}

func TestPropertyResolveWithNoStockEqualsFlattenLeavesTimesBatches(t *testing.T) {
	r := rand.New(rand.NewSource(7))
	for n := 0; n < 100; n++ {
		tree := mustExpand(t, randomCat(r), rLasagne)
		batches := float64(1 + r.Intn(4))
		got := br.Resolve(tree, batches, stockOf{}.have, func(int64, float64) {})
		flat := br.Flatten(tree)
		for _, id := range []int64{iMilk, iFlour, iButter, iPasta} {
			wantQty(t, "leaf", sum(got, id), sum(flat, id)*batches)
		}
	}
}
