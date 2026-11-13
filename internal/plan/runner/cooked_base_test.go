package runner_test

import (
	"context"
	"errors"
	"fmt"
	"math"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/plantest"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/planner"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
)

// BR-G (docs/dev/design/base-recipes.md sections 4.3 and 8): Cooked resolves the Recipe's need tree against Stock, the Base
// recipe Ingredient first, then deducts. The runner reads the trees through an optional interface of its Sources, declared in
// snapshot.go (DBSources already implements it, in basetree.go):
//
//	type TreeSource interface {
//	    NeedTrees(ctx context.Context) (map[int64][]baserecipe.Need, error)
//	}
//
// For a Recipe that has an entry in the map, the needs to deduct are baserecipe.Resolve(tree, Batches, have, take) minus the
// Optional ones, in Resolve's order, where have(id) is the sum of the quantities of the Stock.Lots read inside the write's
// transaction and take shrinks it. A Recipe without an entry (a cycle, or a Source with no trees) keeps the planner's Needs
// as before. CookedAll shares one availability across the Courses of the Mark, in the slot's Course order; the one combined
// deduction is as before. With Used from picks on a Base recipe Ingredient the part Stock covers is what the picks add up to
// (never more than the need); picks on other Ingredients change nothing here. CookPreview.Needs and the previewed needs are the
// resolved needs (picks are not known yet), so Used from lists the Base recipe Ingredient when Stock holds some of it.
//
// The fixture: Lasagne is the env's "chicken" Recipe (id e.rec["chicken"], yield 4). Per Batch its tree is 200 g pasta (21),
// 500 g Béchamel (30; made of 400 g milk (31), 50 g butter (32), 50 g flour (33)) and optional parsley (12).

const (
	pasta, bechamelIng, milk, butter, flour = 21, 30, 31, 32, 33
)

type treeSources struct {
	*fakeSources
	trees map[int64][]baserecipe.Need
	err   error
}

func (s *treeSources) NeedTrees(context.Context) (map[int64][]baserecipe.Need, error) {
	return s.trees, s.err
}

// jarStock is the Used from capable Stock with Lots to read.
type jarStock struct {
	*pickedStock
	lots []planner.StockLot
}

func (j *jarStock) Lots(context.Context) ([]planner.StockLot, map[planner.IngredientID]int, error) {
	return j.lots, nil, nil
}

func lot(id, ingredient int64, q float64) planner.StockLot {
	return planner.StockLot{ID: id, IngredientID: planner.IngredientID(ingredient), Quantity: q}
}

func bechamelNode() baserecipe.Need {
	return baserecipe.Need{IngredientID: bechamelIng, Quantity: 500, BaseRecipeID: 7, Path: "1", Made: []baserecipe.Need{
		{IngredientID: milk, Quantity: 400, Path: "1/0"}, {IngredientID: butter, Quantity: 50, Path: "1/1"}, {IngredientID: flour, Quantity: 50, Path: "1/2"}}}
}

func lasagneTree() []baserecipe.Need {
	return []baserecipe.Need{
		{IngredientID: pasta, Quantity: 200, Path: "0"},
		bechamelNode(),
		{IngredientID: 12, Quantity: 10, Optional: true, Path: "2"},
	}
}

type brgEnv struct {
	*env
	ts *treeSources
	js *jarStock
}

func newBrgEnv(t *testing.T, lots ...planner.StockLot) *brgEnv {
	t.Helper()
	b := &brgEnv{}
	b.env = newEnvWith(t, func(d *runner.Deps) {
		b.ts = &treeSources{fakeSources: d.Source.(*fakeSources), trees: map[int64][]baserecipe.Need{}}
		b.js = &jarStock{pickedStock: &pickedStock{fakeStock: d.Stock.(*fakeStock)}, lots: lots}
		d.Source, d.Stock = b.ts, b.js
	})
	b.ts.trees[b.rec["chicken"]] = lasagneTree()
	return b
}

// pinLasagne plans the horizon and pins Monday's dinner as Lasagne for batches Batches.
func (b *brgEnv) pinLasagne(batches float64) {
	b.t.Helper()
	b.mustPlan()
	if _, err := b.r.SetMeal(ctx, b.key(9), b.rec["chicken"], f64(batches)); err != nil {
		b.t.Fatal(err)
	}
}

func needsText(ns []runner.Need) string {
	s := ""
	for _, n := range ns {
		s += fmt.Sprintf("%d=%.4g ", n.IngredientID, n.Quantity)
	}
	return s
}

func wantNeeds(t *testing.T, label string, got, want []runner.Need) {
	t.Helper()
	ok := len(got) == len(want)
	for i := 0; ok && i < len(got); i++ {
		ok = got[i].IngredientID == want[i].IngredientID && math.Abs(got[i].Quantity-want[i].Quantity) < 1e-6
	}
	if !ok {
		t.Errorf("%s = %s, want %s", label, needsText(got), needsText(want))
	}
}

func n(id int64, q float64) runner.Need { return runner.Need{IngredientID: id, Quantity: q} }

func TestCookedDeductsTheJarFirstThenTheMadePart(t *testing.T) {
	b := newBrgEnv(t, lot(301, bechamelIng, 300))
	b.pinLasagne(2) // 2 Batches call for 1000 g of Béchamel; the jar holds 300 g
	if _, err := b.r.Cooked(ctx, b.key(9), nil); err != nil {
		t.Fatal(err)
	}
	if len(b.stock.deductions) != 1 {
		t.Fatalf("deductions = %v, want one call", b.stock.deductions)
	}
	// 700 g are made: 700/500 of the Béchamel Lines. Optional parsley is not deducted.
	wantNeeds(t, "deduction", b.stock.deductions[0], []runner.Need{n(pasta, 400), n(bechamelIng, 300), n(milk, 560), n(butter, 70), n(flour, 70)})
}

func TestCookedWithAJarThatCoversItDeductsOnlyTheJar(t *testing.T) {
	b := newBrgEnv(t, lot(301, bechamelIng, 600), lot(302, bechamelIng, 600))
	b.pinLasagne(2)
	if _, err := b.r.Cooked(ctx, b.key(9), nil); err != nil {
		t.Fatal(err)
	}
	wantNeeds(t, "deduction", b.stock.deductions[0], []runner.Need{n(pasta, 400), n(bechamelIng, 1000)})
}

func TestCookedWithoutAJarDeductsTheIngredientsOfTheWholeBaseRecipe(t *testing.T) {
	b := newBrgEnv(t)
	b.pinLasagne(2)
	if _, err := b.r.Cooked(ctx, b.key(9), nil); err != nil {
		t.Fatal(err)
	}
	wantNeeds(t, "deduction", b.stock.deductions[0], []runner.Need{n(pasta, 400), n(milk, 800), n(butter, 100), n(flour, 100)})
}

func TestCookedReadsTheJarFromTheStockPortLots(t *testing.T) {
	// Lots of other Ingredients do not count as a jar.
	b := newBrgEnv(t, lot(401, milk, 5000), lot(402, flour, 5000))
	b.pinLasagne(1)
	if _, err := b.r.Cooked(ctx, b.key(9), nil); err != nil {
		t.Fatal(err)
	}
	wantNeeds(t, "deduction", b.stock.deductions[0], []runner.Need{n(pasta, 200), n(milk, 400), n(butter, 50), n(flour, 50)})
}

func TestCookedKeepsThePlannersNeedsForARecipeWithNoTree(t *testing.T) {
	b := newBrgEnv(t, lot(301, bechamelIng, 600))
	delete(b.ts.trees, b.rec["chicken"]) // a cycle written before the check leaves it out of NeedTrees
	b.pinLasagne(1)
	if _, err := b.r.Cooked(ctx, b.key(9), nil); err != nil {
		t.Fatal(err)
	}
	wantNeeds(t, "deduction", b.stock.deductions[0], []runner.Need{n(11, 400), n(13, 250)})
}

func TestCookedDeductsTheBaseRecipeIngredientOfAnEmptyBaseRecipe(t *testing.T) {
	b := newBrgEnv(t)
	b.ts.trees[b.rec["chicken"]] = []baserecipe.Need{{IngredientID: pasta, Quantity: 200, Path: "0"},
		{IngredientID: bechamelIng, Quantity: 500, BaseRecipeID: 7, Path: "1"}} // no Made: nothing to make it from
	b.pinLasagne(2)
	if _, err := b.r.Cooked(ctx, b.key(9), nil); err != nil {
		t.Fatal(err)
	}
	wantNeeds(t, "deduction", b.stock.deductions[0], []runner.Need{n(pasta, 400), n(bechamelIng, 1000)})
}

func TestCookedWritesNothingWhenTheNeedTreesCannotBeRead(t *testing.T) {
	b := newBrgEnv(t, lot(301, bechamelIng, 300))
	b.pinLasagne(1)
	b.ts.err = errBoom
	if _, err := b.r.Cooked(ctx, b.key(9), nil); !errors.Is(err, errBoom) {
		t.Fatalf("Cooked = %v, want the read error", err)
	}
	if len(b.stock.deductions) != 0 || b.meal(9).State != plan.StatePlanned {
		t.Errorf("deductions %v, state %q; want nothing written", b.stock.deductions, b.meal(9).State)
	}
}

func TestCookedWithUsedFromOnTheBaseRecipeIngredientResolvesOnThePickedAmount(t *testing.T) {
	b := newBrgEnv(t, lot(301, bechamelIng, 400), lot(302, bechamelIng, 200)) // 600 g in two jars
	b.pinLasagne(2)
	pick := []runner.UsedFrom{{IngredientID: bechamelIng, Picks: []runner.Pick{{LotID: 301, Quantity: 200}}}}
	if _, err := b.r.CookedUsing(ctx, b.key(9), nil, pick); err != nil {
		t.Fatal(err)
	}
	if len(b.js.picked) != 1 || len(b.js.picked[0]) != 1 {
		t.Fatalf("picked deductions = %+v, want one call with one meal", b.js.picked)
	}
	m := b.js.picked[0][0]
	// The User takes 200 g from one jar: 800 g of the 1000 g are made (800/500 of the Lines), not the 400 g Stock would give.
	wantNeeds(t, "needs", m.Needs, []runner.Need{n(pasta, 400), n(bechamelIng, 200), n(milk, 640), n(butter, 80), n(flour, 80)})
	if !reflect.DeepEqual(m.UsedFrom, pick) {
		t.Errorf("UsedFrom = %+v, want the picks as given", m.UsedFrom)
	}
	if len(b.stock.deductions) != 0 {
		t.Errorf("the plain deduction ran as well: %v", b.stock.deductions)
	}
}

func TestCookedWithUsedFromOnAnotherIngredientKeepsTheJarCover(t *testing.T) {
	b := newBrgEnv(t, lot(301, bechamelIng, 600))
	b.pinLasagne(2)
	pick := []runner.UsedFrom{{IngredientID: pasta, Picks: []runner.Pick{{LotID: 501, Quantity: 400}}}}
	if _, err := b.r.CookedUsing(ctx, b.key(9), nil, pick); err != nil {
		t.Fatal(err)
	}
	wantNeeds(t, "needs", b.js.picked[0][0].Needs, []runner.Need{n(pasta, 400), n(bechamelIng, 600), n(milk, 320), n(butter, 40), n(flour, 40)})
}

func TestCookPreviewListsTheJarAsAnIngredientSoUsedFromCanPickIt(t *testing.T) {
	b := newBrgEnv(t, lot(301, bechamelIng, 300))
	b.pinLasagne(2)
	b.js.preview = []runner.NeedPreview{{IngredientID: bechamelIng, Lots: []runner.PreviewLot{{ID: 301, Quantity: 300}}}}
	p, err := b.r.CookPreview(ctx, b.key(9))
	if err != nil {
		t.Fatal(err)
	}
	want := []runner.Need{n(pasta, 400), n(bechamelIng, 300), n(milk, 560), n(butter, 70), n(flour, 70)}
	wantNeeds(t, "preview Needs", p.Needs, want)
	if len(b.js.previewed) != 1 {
		t.Fatalf("previewed %d times", len(b.js.previewed))
	}
	wantNeeds(t, "previewed needs", b.js.previewed[0], want)
	if len(p.Stock) != 1 || p.Stock[0].IngredientID != bechamelIng {
		t.Errorf("Stock = %+v, want the jar's Lots", p.Stock)
	}
}

// --- Mark all Cooked: a Main and a Side that both call for 500 g of Béchamel share one jar of 600 g ---

func TestMarkAllCookedSharesOneJarAcrossTheCourses(t *testing.T) {
	var js *jarStock
	var ts *treeSources
	base := newEnvWith(t, func(d *runner.Deps) {
		ts = &treeSources{fakeSources: d.Source.(*fakeSources), trees: map[int64][]baserecipe.Need{}}
		js = &jarStock{pickedStock: &pickedStock{fakeStock: d.Stock.(*fakeStock)}, lots: []planner.StockLot{lot(301, bechamelIng, 600)}}
		d.Source, d.Stock = ts, js
	})
	base.src.recipes = nil
	c := &cenv{env: base}
	c.main = base.main
	c.side = plantest.CourseID(t, base.db, "Side")
	c.oneDay()
	roast := c.recipe("roast", false, c.main)
	beans := c.recipe("beans", false, c.side)
	ts.trees[roast] = []baserecipe.Need{{IngredientID: 11, Quantity: 400, Path: "0"}, bechamelNode()}
	ts.trees[beans] = []baserecipe.Need{{IngredientID: 12, Quantity: 100, Path: "0"}, bechamelNode()}
	c.serve(cspec{course: c.main}, cspec{course: c.side})
	c.mustPlan()
	if c.mustMeal(9, c.main).State != plan.StatePlanned || c.mustMeal(9, c.side).State != plan.StatePlanned {
		t.Fatal("set-up: a Main and a Side should be planned on Monday")
	}
	if _, err := c.r.CookedAll(ctx, "2026-11-09", c.slotIDs[1], nil); err != nil {
		t.Fatal(err)
	}
	if len(c.stock.deductions) != 1 {
		t.Fatalf("deductions = %v, want one combined call", c.stock.deductions)
	}
	// The Main takes 500 g of the jar, the Side the 100 g left and makes the other 400 g (400/500 of the Lines).
	wantNeeds(t, "combined deduction", c.stock.deductions[0],
		[]runner.Need{n(11, 400), n(bechamelIng, 600), n(12, 100), n(milk, 320), n(butter, 40), n(flour, 40)})
}
