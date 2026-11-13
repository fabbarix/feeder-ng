package baserecipe_test

import (
	"errors"
	"testing"

	br "github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/units"
)

func TestExpandPlainRecipeIsItsLines(t *testing.T) {
	c := newCat().add(br.Recipe{ID: 9, Name: "Toast", Lines: []br.Line{line(iFlour, 0.2, "kg"), line(iMilk, 2, "dl")}})
	tree := mustExpand(t, c, 9)
	if len(tree) != 2 {
		t.Fatalf("got %d needs: %+v", len(tree), tree)
	}
	wantQty(t, "flour", find(t, tree, iFlour).Quantity, 200)
	wantQty(t, "milk", find(t, tree, iMilk).Quantity, 200)
	if n := find(t, tree, iFlour); n.BaseRecipeID != 0 || n.Made != nil {
		t.Errorf("plain Ingredient has Base recipe fields: %+v", n)
	}
}

func TestExpandUnknownRecipe(t *testing.T) {
	if _, err := br.Expand(newCat(), 404); !errors.Is(err, br.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestExpandScalesByYield(t *testing.T) {
	// A 1 l Béchamel; the factor is line amount / Yield, in Base Units.
	cases := []struct {
		name   string
		q      float64
		unit   string
		factor float64
		qty    float64 // the Base recipe node's Quantity in ml
	}{
		{"500 ml of 1 l", 500, "ml", 0.5, 500},
		{"0.5 l of 1 l", 0.5, "l", 0.5, 500},
		{"1 batch (custom conversion batch = 1000 ml)", 1, "batch", 1, 1000},
		{"2 batches", 2, "batch", 2, 2000},
		{"a jar (custom conversion jar = 300 ml)", 1, "jar", 0.3, 300},
		{"3 dl", 3, "dl", 0.3, 300},
		{"case-insensitive unit", 500, "ML", 0.5, 500},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := baseCat()
			l := lasagne()
			l.Lines = []br.Line{line(iBechamelI, tc.q, tc.unit)}
			c.add(l)
			tree := mustExpand(t, c, rLasagne)
			if len(tree) != 1 {
				t.Fatalf("tree = %+v", tree)
			}
			n := tree[0]
			if n.IngredientID != iBechamelI || n.BaseRecipeID != rBechamel {
				t.Fatalf("not a Base recipe node: %+v", n)
			}
			wantQty(t, "Quantity", n.Quantity, tc.qty)
			wantQty(t, "milk", find(t, n.Made, iMilk).Quantity, 1000*tc.factor)
			wantQty(t, "butter", find(t, n.Made, iButter).Quantity, 50*tc.factor)
			wantQty(t, "flour", find(t, n.Made, iFlour).Quantity, 50*tc.factor)
		})
	}
}

func TestExpandYieldInKilosLineInGrams(t *testing.T) {
	frolla := br.Recipe{ID: rFrolla, Name: "Pasta frolla", Base: &br.Yield{IngredientID: iFrollaI, Quantity: 1, Unit: "kg"},
		Lines: []br.Line{line(iFlour, 500, "g"), line(iButter, 250, "g")}}
	tart := br.Recipe{ID: 8, Name: "Tart", Lines: []br.Line{line(iFrollaI, 250, "g")}}
	c := newCat().add(frolla, grams("Pasta frolla")).add(tart)
	n := mustExpand(t, c, 8)[0]
	wantQty(t, "Quantity", n.Quantity, 250)
	wantQty(t, "flour", find(t, n.Made, iFlour).Quantity, 125)
	wantQty(t, "butter", find(t, n.Made, iButter).Quantity, 62.5)
}

func TestExpandPortionYield(t *testing.T) {
	// Yield 4 portions of ragù: Base Unit piece, the store keeps portion = 1 piece and batch = 4 pieces.
	ragu := br.Recipe{ID: 5, Name: "Ragù", Base: &br.Yield{IngredientID: 50, Quantity: 4, Unit: "portion"},
		Lines: []br.Line{line(iPasta, 400, "g")}}
	u := pieces("Ragù", units.Conversion{Unit: "portion", ToBase: 1}, units.Conversion{Unit: "batch", ToBase: 4})
	pie := br.Recipe{ID: 6, Name: "Pie", Lines: []br.Line{line(50, 2, "portion"), line(50, 1, "batch")}}
	c := newCat().add(ragu, u).add(pie)
	tree := mustExpand(t, c, 6)
	if len(tree) != 2 {
		t.Fatalf("tree = %+v", tree)
	}
	wantQty(t, "2 portions: pasta", find(t, tree[0].Made, iPasta).Quantity, 200)
	wantQty(t, "2 portions: Quantity", tree[0].Quantity, 2)
	wantQty(t, "1 batch: pasta", find(t, tree[1].Made, iPasta).Quantity, 400)
	wantQty(t, "1 batch: Quantity", tree[1].Quantity, 4)
}

func TestExpandSkipsUnconvertibleLine(t *testing.T) {
	l := lasagne()
	l.Lines = []br.Line{line(iBechamelI, 500, "ml"), line(iPasta, 2, "cup"), line(iMilk, 1, "furlong"), line(iPasta, 100, "g")}
	c := baseCat().add(l)
	tree := mustExpand(t, c, rLasagne)
	if len(tree) != 2 {
		t.Fatalf("want béchamel and 100 g pasta, got %+v", tree)
	}
	wantQty(t, "pasta", find(t, tree, iPasta).Quantity, 100)
}

func TestExpandSkipsLineWhoseUnitDoesNotConvertForTheBaseRecipe(t *testing.T) {
	l := lasagne()
	l.Lines = []br.Line{line(iBechamelI, 2, "cup"), line(iBechamelI, 500, "g")}
	c := baseCat().add(l) // Béchamel's Base Unit is ml: "cup" converts, grams do not
	tree := mustExpand(t, c, rLasagne)
	if len(tree) != 1 {
		t.Fatalf("tree = %+v", tree)
	}
	wantQty(t, "2 cups", tree[0].Quantity, 480)
}

func TestExpandNestedThreeDeepFactorsMultiply(t *testing.T) {
	// Lasagne: 500 ml of Béchamel (1 l) -> x0.5; Béchamel: 200 g Roux (Yield 400 g) -> x0.5 -> 100 g Roux -> x0.25.
	c := nestedCat()
	tree := mustExpand(t, c, rLasagne)
	bech := find(t, tree, iBechamelI)
	wantQty(t, "béchamel", bech.Quantity, 500)
	wantQty(t, "milk", find(t, bech.Made, iMilk).Quantity, 500)
	roux := find(t, bech.Made, iRouxI)
	if roux.BaseRecipeID != rRoux {
		t.Fatalf("roux node: %+v", roux)
	}
	wantQty(t, "roux", roux.Quantity, 100)
	wantQty(t, "flour", find(t, roux.Made, iFlour).Quantity, 50)
	wantQty(t, "butter", find(t, roux.Made, iButter).Quantity, 50)
}

func TestExpandDeeperThanThree(t *testing.T) {
	// A chain of 12 Base recipes, each calling for 50% of a same-Yield next: the leaf gets 1/2^11.
	c := newCat()
	const depth = 12
	for i := 1; i <= depth; i++ {
		r := br.Recipe{ID: int64(100 + i), Name: "B", Base: &br.Yield{IngredientID: int64(200 + i), Quantity: 100, Unit: "g"}}
		if i < depth {
			r.Lines = []br.Line{line(int64(200+i+1), 50, "g")}
		} else {
			r.Lines = []br.Line{line(iFlour, 100, "g")}
		}
		c.add(r, grams("B"))
	}
	c.add(br.Recipe{ID: 99, Name: "Top", Lines: []br.Line{line(201, 100, "g")}})
	ns := mustExpand(t, c, 99)
	for i := 1; i < depth; i++ {
		ns = ns[0].Made
	}
	wantQty(t, "deepest base", ns[0].Quantity, 100.0/2048)
	wantQty(t, "leaf flour", find(t, ns[0].Made, iFlour).Quantity, 100.0/2048)
}

func TestExpandOptionalPropagatesDown(t *testing.T) {
	c := nestedCat()
	l := lasagne()
	l.Lines = []br.Line{{IngredientID: iBechamelI, Quantity: 500, Unit: "ml", Optional: true}, line(iPasta, 200, "g")}
	c.add(l)
	tree := mustExpand(t, c, rLasagne)
	bech := find(t, tree, iBechamelI)
	if !bech.Optional {
		t.Error("optional Base recipe line not optional")
	}
	if !find(t, bech.Made, iMilk).Optional {
		t.Error("milk inside an optional Base recipe line must be optional")
	}
	roux := find(t, bech.Made, iRouxI)
	if !roux.Optional || !find(t, roux.Made, iFlour).Optional {
		t.Error("optional must reach every depth")
	}
	if find(t, tree, iPasta).Optional {
		t.Error("a sibling line became optional")
	}
}

func TestExpandOptionalInsideDoesNotMakeParentOptional(t *testing.T) {
	b := bechamel()
	b.Lines = []br.Line{line(iMilk, 1000, "ml"), {IngredientID: iButter, Quantity: 50, Unit: "g", Optional: true}}
	c := baseCat().add(b)
	bech := find(t, mustExpand(t, c, rLasagne), iBechamelI)
	if bech.Optional || find(t, bech.Made, iMilk).Optional {
		t.Error("parent and sibling must stay required")
	}
	if !find(t, bech.Made, iButter).Optional {
		t.Error("butter keeps its own optional flag")
	}
}

func TestExpandEmptyBaseRecipeIsItsOwnIngredient(t *testing.T) {
	b := bechamel()
	b.Lines = nil
	c := baseCat().add(b)
	tree := mustExpand(t, c, rLasagne)
	n := find(t, tree, iBechamelI)
	if n.Made != nil {
		t.Errorf("Made = %+v, want nil for an empty Base recipe", n.Made)
	}
	if n.BaseRecipeID != rBechamel {
		t.Errorf("BaseRecipeID = %d", n.BaseRecipeID)
	}
	wantQty(t, "Quantity", n.Quantity, 500)
}

func TestExpandCycles(t *testing.T) {
	selfCall := func() *fakeCat {
		b := bechamel()
		b.Lines = []br.Line{line(iMilk, 1000, "ml"), line(iBechamelI, 100, "ml")}
		return baseCat().add(b)
	}
	twoStep := func() *fakeCat {
		b := bechamel()
		b.Lines = []br.Line{line(iRouxI, 100, "g")}
		roux := br.Recipe{ID: rRoux, Name: "Roux", Base: &br.Yield{IngredientID: iRouxI, Quantity: 400, Unit: "g"}, Lines: []br.Line{line(iBechamelI, 10, "ml")}}
		return newCat().add(b, ml("Béchamel")).add(roux, grams("Roux")).add(lasagne())
	}
	threeStep := func() *fakeCat {
		b := bechamel()
		b.Lines = []br.Line{line(iRouxI, 100, "g")}
		roux := br.Recipe{ID: rRoux, Name: "Roux", Base: &br.Yield{IngredientID: iRouxI, Quantity: 400, Unit: "g"}, Lines: []br.Line{line(iFrollaI, 10, "g")}}
		frolla := br.Recipe{ID: rFrolla, Name: "Pasta frolla", Base: &br.Yield{IngredientID: iFrollaI, Quantity: 1, Unit: "kg"}, Lines: []br.Line{line(iBechamelI, 10, "ml")}}
		return newCat().add(b, ml("Béchamel")).add(roux, grams("Roux")).add(frolla, grams("Pasta frolla")).add(lasagne())
	}
	cases := []struct {
		name string
		cat  *fakeCat
		root int64
		path []string
	}{
		{"self", selfCall(), rBechamel, []string{"Béchamel", "Béchamel"}},
		{"self, reached from Lasagne", selfCall(), rLasagne, []string{"Béchamel", "Béchamel"}},
		{"two steps", twoStep(), rBechamel, []string{"Béchamel", "Roux", "Béchamel"}},
		{"two steps, reached from Lasagne", twoStep(), rLasagne, []string{"Béchamel", "Roux", "Béchamel"}},
		{"three steps", threeStep(), rBechamel, []string{"Béchamel", "Roux", "Pasta frolla", "Béchamel"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tree, err := br.Expand(tc.cat, tc.root)
			if !errors.Is(err, br.ErrCycle) {
				t.Fatalf("err = %v, want ErrCycle", err)
			}
			var ce *br.CycleError
			if !errors.As(err, &ce) {
				t.Fatalf("err %T is not *CycleError", err)
			}
			if !eqStrings(ce.Path, tc.path) {
				t.Errorf("path = %v, want %v", ce.Path, tc.path)
			}
			if tree != nil {
				t.Errorf("tree = %+v, want nil with an error", tree)
			}
		})
	}
}

func TestExpandSameBaseRecipeTwiceIsNotACycle(t *testing.T) {
	l := lasagne()
	l.Lines = []br.Line{line(iBechamelI, 500, "ml"), line(iBechamelI, 250, "ml")}
	tree := mustExpand(t, baseCat().add(l), rLasagne)
	if len(tree) != 2 {
		t.Fatalf("two lines for the same Base recipe stay two nodes, got %+v", tree)
	}
	wantQty(t, "second", tree[1].Quantity, 250)
}

func TestExpandDiamondIsNotACycle(t *testing.T) {
	// Lasagne -> Béchamel -> Roux and Lasagne -> Roux directly.
	c := nestedCat()
	l := lasagne()
	l.Lines = append(l.Lines, line(iRouxI, 80, "g"))
	c.add(l)
	tree := mustExpand(t, c, rLasagne)
	if len(tree) != 3 {
		t.Fatalf("tree = %+v", tree)
	}
}

func TestExpandDoesNotModifyTheCatalogRecipes(t *testing.T) {
	c := nestedCat()
	before := c.recipes[rBechamel].Lines[0].Quantity
	mustExpand(t, c, rLasagne)
	if c.recipes[rBechamel].Lines[0].Quantity != before {
		t.Error("Expand mutated the Catalog's lines")
	}
}
