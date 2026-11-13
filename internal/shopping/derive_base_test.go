package shopping_test

import (
	"sort"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// BR-F (docs/dev/design/base-recipes.md section 7, section 16): the Shopping List with Stock first. A Base recipe
// node (Made set) draws its own Ingredient from the projected Stock and only the shortfall is expanded to the
// Ingredients of what is left to make. The Base recipe Ingredient is never a Line then. Monday 2026-11-09 12:00 UTC.

const (
	bech   = int64(10) // Béchamel, Base Unit ml
	roux   = int64(11) // Roux, Base Unit g
	butter = int64(12)
	flour  = int64(13)
	pesto  = int64(14) // an empty Base recipe
)

func baseInfo() map[int64]shopping.IngredientInfo {
	m := map[int64]shopping.IngredientInfo{}
	for k, v := range ingredients {
		m[k] = v
	}
	m[bech] = shopping.IngredientInfo{Name: "Béchamel", BaseUnit: "ml"}
	m[roux] = shopping.IngredientInfo{Name: "Roux", BaseUnit: "g"}
	m[butter] = shopping.IngredientInfo{Name: "butter", BaseUnit: "g"}
	m[flour] = shopping.IngredientInfo{Name: "flour", BaseUnit: "g"}
	m[pesto] = shopping.IngredientInfo{Name: "Pesto", BaseUnit: "g"}
	return m
}

func baseIn(lots []stock.Lot, meals ...shopping.Meal) shopping.Input {
	in := input(meals...)
	in.Ingredients = baseInfo()
	in.Lots = lots
	return in
}

// madeOf is a Base recipe node: the Ingredient, the Quantity asked for, and what making all of it needs.
func madeOf(ing int64, q float64, made ...shopping.Need) shopping.Need {
	return shopping.Need{IngredientID: ing, Quantity: q, Made: made}
}

// bechamel500 is 500 ml of a Béchamel of Yield 1 l (1000 ml milk, 60 g butter, 60 g flour): what Expand gives for
// one Batch of a Lasagne that calls for 500 ml.
func bechamel500() shopping.Need {
	return madeOf(bech, 500, need(milk, 500), need(butter, 30), need(flour, 30))
}

// nestedBechamel500 is the same with the Béchamel made of 1000 ml milk and 100 g of Roux (150 g butter and 150 g
// flour per 300 g of Roux): at 500 ml, 500 ml milk and 50 g of Roux, itself made of 25 g butter and 25 g flour.
func nestedBechamel500() shopping.Need {
	return madeOf(bech, 500, need(milk, 500), madeOf(roux, 50, need(butter, 25), need(flour, 25)))
}

func jar(id, ing int64, qty float64) stock.Lot { return boLot(id, ing, qty) }

func wantQty(t *testing.T, l shopping.List, ing int64, want float64) {
	t.Helper()
	if got := line(t, l, ing); !near(got.Quantity, want) {
		t.Errorf("%s Quantity = %v, want %v", baseInfo()[ing].Name, got.Quantity, want)
	}
}

func TestAJarOfBechamelCoversPartOfTheNeedAndOnlyTheRestsIngredientsAreListed(t *testing.T) {
	// Lasagne calls for 500 ml; the Pantry has a 300 ml jar: 200 ml is still to make, 2/5 of the whole.
	l := shopping.Derive(baseIn([]stock.Lot{jar(1, bech, 300)}, dinner("2026-11-10", 1, bechamel500())))
	wantQty(t, l, milk, 200)
	wantQty(t, l, butter, 12)
	wantQty(t, l, flour, 12)
	noLine(t, l, bech)
	if len(l.Lines) != 3 {
		t.Errorf("Lines = %+v, want milk, butter and flour only", l.Lines)
	}
}

func TestAJarThatCoversTheWholeNeedLeavesNothingToBuyForIt(t *testing.T) {
	l := shopping.Derive(baseIn([]stock.Lot{jar(1, bech, 600)}, dinner("2026-11-10", 1, bechamel500())))
	if len(l.Lines) != 0 {
		t.Errorf("Lines = %+v, want none: 600 ml of Béchamel covers the 500 ml", l.Lines)
	}
}

func TestWithoutAJarTheWholeBaseRecipeIsMadeFromItsIngredients(t *testing.T) {
	l := shopping.Derive(baseIn(nil, dinner("2026-11-10", 1, bechamel500())))
	wantQty(t, l, milk, 500)
	wantQty(t, l, butter, 30)
	wantQty(t, l, flour, 30)
	noLine(t, l, bech)
}

func TestTheIngredientsOfThePartToMakeAreDrawnFromStockToo(t *testing.T) {
	l := shopping.Derive(baseIn([]stock.Lot{jar(1, bech, 300), jar(2, milk, 150)}, dinner("2026-11-10", 1, bechamel500())))
	m := line(t, l, milk)
	if !near(m.Need, 200) || !near(m.Available, 150) || !near(m.Quantity, 50) {
		t.Errorf("milk Need/Available/Quantity = %v/%v/%v, want 200/150/50 (the 200 ml still to make, 150 ml in Stock)", m.Need, m.Available, m.Quantity)
	}
}

func TestBatchesMultiplyTheBaseRecipeNeedBeforeTheJarIsDrawn(t *testing.T) {
	// 2 Batches ask for 1000 ml; the 300 ml jar leaves 700 ml, 7/10 of the whole.
	l := shopping.Derive(baseIn([]stock.Lot{jar(1, bech, 300)}, dinner("2026-11-10", 2, bechamel500())))
	wantQty(t, l, milk, 700)
	wantQty(t, l, butter, 42)
	wantQty(t, l, flour, 42)
}

func TestNestedBaseRecipesResolveTheSameWayDepthFirst(t *testing.T) {
	t.Run("a jar of Béchamel covers the Roux inside it as well", func(t *testing.T) {
		l := shopping.Derive(baseIn([]stock.Lot{jar(1, bech, 300)}, dinner("2026-11-10", 1, nestedBechamel500())))
		wantQty(t, l, milk, 200)
		wantQty(t, l, butter, 10)
		wantQty(t, l, flour, 10)
		noLine(t, l, bech)
		noLine(t, l, roux)
	})
	t.Run("a jar of Roux covers part of the Roux that is left to make", func(t *testing.T) {
		// 200 ml of Béchamel is left to make: 20 g of Roux. The 12 g jar covers 12, leaving 8 g (8/20 of 10 g and 10 g).
		l := shopping.Derive(baseIn([]stock.Lot{jar(1, bech, 300), jar(2, roux, 12)}, dinner("2026-11-10", 1, nestedBechamel500())))
		wantQty(t, l, milk, 200)
		wantQty(t, l, butter, 4)
		wantQty(t, l, flour, 4)
		noLine(t, l, roux)
	})
	t.Run("a jar of Roux alone, no Béchamel", func(t *testing.T) {
		// 50 g of Roux asked for inside the Béchamel; 50 g in Stock covers it, the milk is still bought.
		l := shopping.Derive(baseIn([]stock.Lot{jar(1, roux, 50)}, dinner("2026-11-10", 1, nestedBechamel500())))
		wantQty(t, l, milk, 500)
		noLine(t, l, butter)
		noLine(t, l, flour)
		noLine(t, l, roux)
	})
}

func TestOptionalIsKeptAtEveryDepth(t *testing.T) {
	t.Run("an optional Base recipe line adds nothing", func(t *testing.T) {
		b := bechamel500()
		b.Optional = true
		l := shopping.Derive(baseIn(nil, dinner("2026-11-10", 1, need(rice, 100), b)))
		if len(l.Lines) != 1 {
			t.Errorf("Lines = %+v, want rice only", l.Lines)
		}
	})
	t.Run("an optional child of a Base recipe adds nothing", func(t *testing.T) {
		b := madeOf(bech, 500, need(milk, 500), shopping.Need{IngredientID: butter, Quantity: 30, Optional: true})
		l := shopping.Derive(baseIn(nil, dinner("2026-11-10", 1, b)))
		wantQty(t, l, milk, 500)
		noLine(t, l, butter)
	})
}

func TestAJarThatGoesOffBeforeTheMealIsNotUsed(t *testing.T) {
	old := stock.Lot{ID: 1, IngredientID: bech, Quantity: 600, Purchased: "2026-11-01", GoesOff: "2026-11-09"}
	l := shopping.Derive(baseIn([]stock.Lot{old}, dinner("2026-11-10", 1, bechamel500())))
	wantQty(t, l, milk, 500) // the same date rule as every Ingredient: a Lot is usable up to its go-off date
	noLine(t, l, bech)
}

func TestTwoPlannedMealsShareOneJarInDateOrder(t *testing.T) {
	// 600 ml of Béchamel: Tuesday takes 500, Wednesday finds 100 and makes 400 ml (4/5 of the whole).
	lots := []stock.Lot{jar(1, bech, 600)}
	l := shopping.Derive(baseIn(lots, dinner("2026-11-12", 1, bechamel500()), dinner("2026-11-10", 1, bechamel500())))
	wantQty(t, l, milk, 400)
	wantQty(t, l, butter, 24)
	wantQty(t, l, flour, 24)
	noLine(t, l, bech)
}

func TestTheHintForAPastMealAlsoShowsOnTheLinesThatCameFromABaseRecipe(t *testing.T) {
	past := func(date string, h int, bn shopping.Need) shopping.Meal {
		m := dinner(date, 1, bn)
		m.At = time.Date(2026, 11, 9, h, 0, 0, 0, time.UTC)
		m.SlotID, m.SlotName, m.CourseName = 90, "Dinner", "Main"
		return m
	}
	want := shopping.PastMeal{Date: "2026-11-09", MealSlotID: 90, MealSlotName: "Dinner", CourseName: "Main"}
	t.Run("on each Ingredient of the part still to make", func(t *testing.T) {
		l := shopping.Derive(baseIn([]stock.Lot{jar(1, bech, 300)}, past("2026-11-09", 8, bechamel500())))
		for _, ing := range []int64{milk, butter, flour} {
			got := line(t, l, ing).PastPlannedMeals
			if len(got) != 1 || got[0] != want {
				t.Errorf("%s PastPlannedMeals = %+v, want [%+v]", baseInfo()[ing].Name, got, want)
			}
		}
	})
	t.Run("on nested Ingredients", func(t *testing.T) {
		l := shopping.Derive(baseIn(nil, past("2026-11-09", 8, nestedBechamel500())))
		for _, ing := range []int64{milk, butter, flour} {
			if got := line(t, l, ing).PastPlannedMeals; len(got) != 1 || got[0] != want {
				t.Errorf("%d PastPlannedMeals = %+v, want [%+v]", ing, got, want)
			}
		}
	})
	t.Run("not when the jar covers the meal, since it adds nothing to the list", func(t *testing.T) {
		l := shopping.Derive(baseIn([]stock.Lot{jar(1, bech, 600)}, past("2026-11-09", 8, bechamel500())))
		if len(l.Lines) != 0 {
			t.Errorf("Lines = %+v, want none", l.Lines)
		}
	})
	t.Run("not for a meal that is still ahead", func(t *testing.T) {
		l := shopping.Derive(baseIn(nil, past("2026-11-09", 19, bechamel500())))
		if got := line(t, l, milk).PastPlannedMeals; len(got) != 0 {
			t.Errorf("milk PastPlannedMeals = %+v, want none", got)
		}
	})
}

func TestAnEmptyBaseRecipeIsListedAsItselfAndDrawnFromItsOwnJar(t *testing.T) {
	toast := func() shopping.Meal { return dinner("2026-11-10", 1, need(rice, 100), need(pesto, 50)) } // Made nil
	t.Run("no jar: the line asks for the Base recipe", func(t *testing.T) {
		l := shopping.Derive(baseIn(nil, toast()))
		p := line(t, l, pesto)
		if p.Name != "Pesto" || !near(p.Quantity, 50) || p.BaseUnit != "g" {
			t.Errorf("Pesto line = %+v, want 50 g of Pesto", p)
		}
	})
	t.Run("a jar covers part of it", func(t *testing.T) {
		l := shopping.Derive(baseIn([]stock.Lot{jar(1, pesto, 20)}, toast()))
		wantQty(t, l, pesto, 30)
	})
	t.Run("a jar covers all of it", func(t *testing.T) {
		l := shopping.Derive(baseIn([]stock.Lot{jar(1, pesto, 80)}, toast()))
		noLine(t, l, pesto)
	})
}

func TestAMealServedFromALeftoverNeedsNothingEvenWithABaseRecipe(t *testing.T) {
	m := dinner("2026-11-10", 1, bechamel500())
	m.Leftover = true
	if l := shopping.Derive(baseIn(nil, m)); len(l.Lines) != 0 {
		t.Errorf("Lines = %+v, want none", l.Lines)
	}
}

func TestBoughtAttributionFollowsTheLinesOfAMealWithABaseRecipe(t *testing.T) {
	// A 600 ml jar covers Tuesday and 100 ml of Wednesday, which still has to make 400 ml: 400 ml milk is bought for it.
	lots := []stock.Lot{jar(8, bech, 600), jar(9, milk, 400)}
	in := boInput(lots, boMeal(1, "2026-11-10", 1, bechamel500()), boMeal(2, "2026-11-12", 1, bechamel500()))
	in.Ingredients = baseInfo()
	boWant(t, shopping.Attribute(in, 9), "2/3=400")
	if l := shopping.Derive(in); len(l.Lines) != 2 { // butter and flour are still to buy; milk is covered by the bought Lot
		t.Errorf("Lines = %+v, want butter and flour", l.Lines)
	}
}

// ---- Consistency with Cooked: shopping derives the same split as baserecipe.Resolve (section 7 and 8) ----

func plain(ing int64, q float64) baserecipe.Need {
	return baserecipe.Need{IngredientID: ing, Quantity: q}
}

func baseNode(ing, id int64, q float64, made ...baserecipe.Need) baserecipe.Need {
	return baserecipe.Need{IngredientID: ing, Quantity: q, BaseRecipeID: id, Made: made}
}

func TestShoppingAgreesWithBaseRecipeResolveOnWhatIsLeftToMake(t *testing.T) {
	tree := []baserecipe.Need{
		plain(flour, 200),
		baseNode(bech, 1, 500, plain(milk, 500), baseNode(roux, 2, 50, plain(butter, 25), plain(flour, 25))),
	}
	for _, c := range []struct {
		name    string
		batches float64
		jars    map[int64]float64
	}{
		{"no jar", 1, nil},
		{"a jar of Béchamel that covers part", 1, map[int64]float64{bech: 300}},
		{"a jar that covers all", 1, map[int64]float64{bech: 1000}},
		{"two Batches and a jar of each", 2, map[int64]float64{bech: 300, roux: 12}},
		{"a jar of Roux only", 1, map[int64]float64{roux: 30}},
	} {
		t.Run(c.name, func(t *testing.T) {
			avail := map[int64]float64{}
			var lots []stock.Lot
			id := int64(1)
			for ing, q := range c.jars {
				avail[ing] = q
				lots = append(lots, jar(id, ing, q))
				id++
			}
			want := map[int64]float64{}
			for _, n := range baserecipe.Resolve(tree, c.batches, func(i int64) float64 { return avail[i] }, func(i int64, q float64) { avail[i] -= q }) {
				if n.BaseRecipeID == 0 && !n.Optional {
					want[n.IngredientID] += n.Quantity // the part Stock did not cover, as plain Ingredients
				}
			}
			l := shopping.Derive(baseIn(lots, dinner("2026-11-10", c.batches, shopping.NeedsFromTree(tree)...)))
			var got, ids []int64
			for _, ln := range l.Lines {
				ids = append(ids, ln.IngredientID)
				if !near(ln.Quantity, want[ln.IngredientID]) {
					t.Errorf("%s: shopping %v, Resolve %v", baseInfo()[ln.IngredientID].Name, ln.Quantity, want[ln.IngredientID])
				}
			}
			for ing, q := range want {
				if q > 1e-9 {
					got = append(got, ing)
				}
			}
			sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
			sort.Slice(got, func(i, j int) bool { return got[i] < got[j] })
			if len(ids) != len(got) {
				t.Errorf("Lines for %v, Resolve leaves %v to buy", ids, got)
			}
		})
	}
}

// ---- Bought attribution of a jar (round 2) ----

func TestABoughtJarOfABaseRecipeIsAttributedUnderTheBaseRecipeIngredientNotItsChildren(t *testing.T) {
	// The jar bought (Lot 9, 300 ml of Béchamel) covers part of Tuesday's Lasagne: the share is 300 ml of Béchamel for
	// meal 1, not the milk, butter and flour that jar saved.
	in := boInput([]stock.Lot{boLot(9, bech, 300)}, boMeal(1, "2026-11-10", 1, bechamel500()))
	in.Ingredients = baseInfo()
	boWant(t, shopping.Attribute(in, 9), "1/10=300")
}

func TestABoughtJarSpreadsOverTheMealsThatShareItInDateOrder(t *testing.T) {
	in := boInput([]stock.Lot{boLot(9, bech, 600)}, boMeal(1, "2026-11-10", 1, bechamel500()), boMeal(2, "2026-11-12", 1, bechamel500()))
	in.Ingredients = baseInfo()
	boWant(t, shopping.Attribute(in, 9), "1/10=500", "2/10=100")
}

func TestABoughtJarInsideANestedBaseRecipeIsAttributedToThatNode(t *testing.T) {
	// A bought jar of Roux (Lot 9, 30 g) covers 30 g of the 50 g inside the Béchamel: the share is Roux, not butter or flour.
	in := boInput([]stock.Lot{boLot(9, roux, 30)}, boMeal(1, "2026-11-10", 1, nestedBechamel500()))
	in.Ingredients = baseInfo()
	boWant(t, shopping.Attribute(in, 9), "1/11=30")
}
