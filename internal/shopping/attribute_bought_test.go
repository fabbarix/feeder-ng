package shopping_test

import (
	"fmt"
	"math/rand"
	"sort"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// B5-BO: shopping.Attribute, which Planned Meals a purchase was bought for (docs/dev/design/b5-bo.md §3,
// beta5-plan 2.4 "Bought, precisely"). Monday 2026-11-09 12:00 UTC (now); dinners at 19:00; range 11-09 .. 11-15.

// boMeal is a dinner with a Planned Meal id.
func boMeal(id int64, date string, batches float64, needs ...shopping.Need) shopping.Meal {
	m := dinner(date, batches, needs...)
	m.MealID = id
	return m
}

func boLot(id, ing int64, qty float64) stock.Lot {
	return stock.Lot{ID: id, IngredientID: ing, Quantity: qty, Purchased: "2026-11-09", GoesOff: stock.None}
}

func boInput(lots []stock.Lot, meals ...shopping.Meal) shopping.Input {
	in := input(meals...)
	in.Lots = lots
	return in
}

// boShares flattens shares to "meal/ingredient=qty" for a readable comparison.
func boShares(shares []shopping.Share) []string {
	out := make([]string, 0, len(shares))
	for _, s := range shares {
		out = append(out, fmt.Sprintf("%d/%d=%g", s.MealID, s.IngredientID, s.Quantity))
	}
	return out
}

func boWant(t *testing.T, got []shopping.Share, want ...string) {
	t.Helper()
	g := boShares(got)
	if len(g) != len(want) {
		t.Fatalf("shares = %v, want %v", g, want)
	}
	for i := range want {
		if g[i] != want[i] {
			t.Fatalf("shares = %v, want %v", g, want)
		}
	}
}

func TestAPurchaseCoversTheEarliestPlannedMealStillShortFirst(t *testing.T) {
	// Two dinners each short 300 g of chicken thighs; one 400 g pack is bought.
	in := boInput([]stock.Lot{boLot(9, chicken, 400)},
		boMeal(1, "2026-11-10", 1, need(chicken, 300)),
		boMeal(2, "2026-11-12", 1, need(chicken, 300)))
	boWant(t, shopping.Attribute(in, 9), "1/1=300", "2/1=100")
}

func TestAPurchaseThatCoversOnlyTheFirstPlannedMealLeavesTheLaterOneAlone(t *testing.T) {
	in := boInput([]stock.Lot{boLot(9, chicken, 300)},
		boMeal(1, "2026-11-10", 1, need(chicken, 300)),
		boMeal(2, "2026-11-12", 1, need(chicken, 300)))
	boWant(t, shopping.Attribute(in, 9), "1/1=300")
}

func TestPlannedMealsAreWalkedInDateAndTimeOrderWhateverTheInputOrder(t *testing.T) {
	later := boMeal(2, "2026-11-12", 1, need(chicken, 300))
	earlier := boMeal(1, "2026-11-10", 1, need(chicken, 300))
	in := boInput([]stock.Lot{boLot(9, chicken, 400)}, later, earlier)
	boWant(t, shopping.Attribute(in, 9), "1/1=300", "2/1=100")
}

func TestAPurchaseCoveringStockThePlannedMealAlreadyHadBuysNothing(t *testing.T) {
	in := boInput([]stock.Lot{boLot(1, chicken, 1000), boLot(9, chicken, 400)},
		boMeal(1, "2026-11-10", 1, need(chicken, 800)))
	if got := shopping.Attribute(in, 9); len(got) != 0 {
		t.Fatalf("shares = %v, want none: Stock already covered the dinner", boShares(got))
	}
}

func TestOnlyTheShortfallPartOfAPurchaseIsBoughtFor(t *testing.T) {
	// Stock has 200 g; the dinner needs 500 g; a 1000 g pack is bought: 300 g of it is bought for the dinner.
	in := boInput([]stock.Lot{boLot(1, chicken, 200), boLot(9, chicken, 1000)},
		boMeal(1, "2026-11-10", 1, need(chicken, 500)))
	boWant(t, shopping.Attribute(in, 9), "1/1=300")
}

func TestEachIngredientOfAPlannedMealIsItsOwnShare(t *testing.T) {
	in := boInput([]stock.Lot{boLot(9, chicken, 400), boLot(10, rice, 50)},
		boMeal(1, "2026-11-10", 1, need(chicken, 300), need(rice, 250)))
	boWant(t, shopping.Attribute(in, 9), "1/1=300")
	boWant(t, shopping.Attribute(in, 10), "1/4=50")
}

func TestSeveralLinesOfOneIngredientInOnePlannedMealAreOneShare(t *testing.T) {
	in := boInput([]stock.Lot{boLot(9, chicken, 1000)},
		boMeal(1, "2026-11-10", 2, need(chicken, 100), need(chicken, 50)))
	boWant(t, shopping.Attribute(in, 9), "1/1=300")
}

func TestOptionalLinesAreNeverBoughtFor(t *testing.T) {
	in := boInput([]stock.Lot{boLot(9, milk, 500)},
		boMeal(1, "2026-11-10", 1, shopping.Need{IngredientID: milk, Quantity: 200, Optional: true}))
	if got := shopping.Attribute(in, 9); len(got) != 0 {
		t.Fatalf("shares = %v, want none: an optional line is not on the list", boShares(got))
	}
}

func TestAPlannedMealServedFromALeftoverIsNeverBoughtFor(t *testing.T) {
	left := boMeal(1, "2026-11-10", 1, need(chicken, 300))
	left.Leftover = true
	in := boInput([]stock.Lot{boLot(9, chicken, 400)}, left, boMeal(2, "2026-11-12", 1, need(chicken, 300)))
	boWant(t, shopping.Attribute(in, 9), "2/1=300")
}

func TestAPlannedMealOutsideTheRangeIsNotBoughtFor(t *testing.T) {
	// The range ends on 11-15; the dinner on 11-16 is outside it, even though the Lot would cover it.
	in := boInput([]stock.Lot{boLot(9, chicken, 600)},
		boMeal(1, "2026-11-10", 1, need(chicken, 300)),
		boMeal(2, "2026-11-16", 1, need(chicken, 300)))
	boWant(t, shopping.Attribute(in, 9), "1/1=300")
}

func TestAPlannedMealWhoseSlotHasPassedAbsorbsStockButGetsNoShare(t *testing.T) {
	// Q18: the unconfirmed dinner of 11-08 sits first in date order and takes 300 g of the 400 g pack, as it does on the
	// list; it gets no share. The dinner of 11-10 is short 300 g and the pack's last 100 g lowers it by 100.
	past := boMeal(1, "2026-11-08", 1, need(chicken, 300))
	in := boInput([]stock.Lot{boLot(9, chicken, 400)}, past, boMeal(2, "2026-11-10", 1, need(chicken, 300)))
	boWant(t, shopping.Attribute(in, 9), "2/1=100")
}

func TestASlotThatIsOverTodayBeforeNowGetsNoShare(t *testing.T) {
	// Today's dinner at 07:00 is before now (12:00): over. Tonight's at 19:00 is not.
	over := boMeal(1, "2026-11-09", 1, need(chicken, 300))
	over.At = time.Date(2026, 11, 9, 7, 0, 0, 0, time.UTC)
	tonight := boMeal(2, "2026-11-09", 1, need(chicken, 300))
	in := boInput([]stock.Lot{boLot(9, chicken, 600)}, over, tonight)
	boWant(t, shopping.Attribute(in, 9), "2/1=300")
}

func TestAPlannedMealWithoutAnIdIsNeverNamed(t *testing.T) {
	in := boInput([]stock.Lot{boLot(9, chicken, 600)},
		boMeal(0, "2026-11-10", 1, need(chicken, 300)),
		boMeal(2, "2026-11-12", 1, need(chicken, 300)))
	boWant(t, shopping.Attribute(in, 9), "2/1=300")
}

func TestAFractionalBatchCountScalesTheShare(t *testing.T) {
	in := boInput([]stock.Lot{boLot(9, chicken, 1000)}, boMeal(1, "2026-11-10", 0.5, need(chicken, 300)))
	boWant(t, shopping.Attribute(in, 9), "1/1=150")
}

func TestALotThatIsNotInTheStockOrLowersNothingGivesNoShares(t *testing.T) {
	in := boInput([]stock.Lot{boLot(9, chicken, 400)}, boMeal(1, "2026-11-10", 1, need(chicken, 300)))
	if got := shopping.Attribute(in, 777); len(got) != 0 {
		t.Errorf("unknown Lot: shares = %v, want none", boShares(got))
	}
	in = boInput([]stock.Lot{boLot(9, rice, 400)}, boMeal(1, "2026-11-10", 1, need(chicken, 300)))
	if got := shopping.Attribute(in, 9); len(got) != 0 {
		t.Errorf("a Lot of an Ingredient no dinner needs: shares = %v, want none", boShares(got))
	}
}

func TestTicksNotNeededMarksAndExtrasPlayNoPart(t *testing.T) {
	in := boInput([]stock.Lot{boLot(9, chicken, 400)}, boMeal(1, "2026-11-10", 1, need(chicken, 300)))
	in.Ticks = map[int64]shopping.Tick{chicken: {IngredientID: chicken, Needed: 300, By: "hand"}}
	in.NotNeeded = map[int64]shopping.NotNeeded{rice: {IngredientID: rice, Needed: 10}}
	in.Extras = []shopping.Extra{{ID: 1, IngredientID: chicken, Quantity: 500}}
	boWant(t, shopping.Attribute(in, 9), "1/1=300")
}

func TestAttributeDoesNotModifyItsInput(t *testing.T) {
	lots := []stock.Lot{boLot(1, chicken, 100), boLot(9, chicken, 400)}
	in := boInput(lots, boMeal(1, "2026-11-10", 1, need(chicken, 300)), boMeal(2, "2026-11-12", 1, need(chicken, 300)))
	before := fmt.Sprintf("%+v", in)
	_ = shopping.Attribute(in, 9)
	if after := fmt.Sprintf("%+v", in); after != before {
		t.Errorf("Attribute changed its Input:\n%s\n%s", before, after)
	}
}

// boOracle is an independent reference: the share of the k-th Planned Meal (meals in date and time order) is how much
// its own shortfall fell, read off Derive on growing prefixes of the Planned Meals, with and without the new Lot.
func boOracle(in shopping.Input, lotID int64) map[string]float64 {
	var without []stock.Lot
	for _, l := range in.Lots {
		if l.ID != lotID {
			without = append(without, l)
		}
	}
	short := func(lots []stock.Lot, k int, ing int64) float64 {
		p := in
		p.Lots, p.Meals = lots, in.Meals[:k]
		if l, ok := shopping.Derive(p).LineFor(ing); ok {
			return l.Quantity
		}
		return 0
	}
	out := map[string]float64{}
	for k, m := range in.Meals {
		if m.At.Before(in.Now) || m.MealID == 0 || m.Leftover || m.Date > in.To {
			continue
		}
		for _, ing := range []int64{chicken, rice, passata, milk} {
			before := short(without, k+1, ing) - short(without, k, ing)
			after := short(in.Lots, k+1, ing) - short(in.Lots, k, ing)
			if d := before - after; d > 1e-6 {
				out[fmt.Sprintf("%d/%d", m.MealID, ing)] = d
			}
		}
	}
	return out
}

// boRandomInput builds a sorted, in-range list of dinners (strictly increasing date and time) with random needs and Stock.
func boRandomInput(r *rand.Rand, withPast bool) (shopping.Input, int64) {
	ings := []int64{chicken, rice, passata}
	var meals []shopping.Meal
	day := 8
	if !withPast {
		day = 9
	}
	for id := int64(1); id <= int64(1+r.Intn(6)); id++ {
		day += r.Intn(2)
		if day > 15 {
			day = 15
		}
		hour := 8 + int(id) // strictly increasing times within a day keep the order unambiguous
		date := fmt.Sprintf("2026-11-%02d", day)
		at := time.Date(2026, 11, day, hour, 0, 0, 0, time.UTC)
		if !withPast && at.Before(now) {
			at = now.Add(time.Duration(id) * time.Hour)
		}
		var needs []shopping.Need
		for _, ing := range ings {
			if r.Intn(2) == 0 {
				needs = append(needs, need(ing, float64(50*(1+r.Intn(8)))))
			}
		}
		if r.Intn(5) == 0 {
			needs = append(needs, shopping.Need{IngredientID: milk, Quantity: 100, Optional: true})
		}
		m := shopping.Meal{Date: stock.Date(date), At: at, Batches: []float64{0.5, 1, 1, 2}[r.Intn(4)], Needs: needs, MealID: id}
		meals = append(meals, m)
	}
	sort.SliceStable(meals, func(i, j int) bool { return meals[i].At.Before(meals[j].At) })
	for i := range meals { // dates follow the sorted instants
		meals[i].Date = stock.Date(meals[i].At.Format("2006-01-02"))
	}
	in := input(meals...)
	var lots []stock.Lot
	for id := int64(1); id <= int64(r.Intn(4)); id++ {
		lots = append(lots, boLot(id, ings[r.Intn(len(ings))], float64(100*(1+r.Intn(6)))))
	}
	const newLot = int64(99)
	lots = append(lots, boLot(newLot, ings[r.Intn(len(ings))], float64(100*(1+r.Intn(10)))))
	in.Lots = lots
	return in, newLot
}

func TestPropertyTheSharesOfAPurchaseAddUpToTheDropInTheLine(t *testing.T) {
	r := rand.New(rand.NewSource(20261112))
	for i := 0; i < 300; i++ {
		in, lot := boRandomInput(r, false)
		var without []stock.Lot
		for _, l := range in.Lots {
			if l.ID != lot {
				without = append(without, l)
			}
		}
		beforeIn := in
		beforeIn.Lots = without
		before, after := shopping.Derive(beforeIn), shopping.Derive(in)
		got := map[int64]float64{}
		for _, s := range shopping.Attribute(in, lot) {
			if !(s.Quantity > 0) {
				t.Fatalf("run %d: a share of %v, want > 0: %+v", i, s.Quantity, s)
			}
			got[s.IngredientID] += s.Quantity
		}
		for _, ing := range []int64{chicken, rice, passata, milk} {
			var b, a float64
			if l, ok := before.LineFor(ing); ok {
				b = l.Quantity
			}
			if l, ok := after.LineFor(ing); ok {
				a = l.Quantity
			}
			if !near(got[ing], b-a) {
				t.Fatalf("run %d, Ingredient %d: shares add up to %v, the Line fell by %v (before %v, after %v)\ninput %+v",
					i, ing, got[ing], b-a, b, a, in)
			}
		}
	}
}

func TestPropertySharesMatchAnIndependentPerPlannedMealOracleIncludingPastSlots(t *testing.T) {
	r := rand.New(rand.NewSource(7))
	for i := 0; i < 300; i++ {
		in, lot := boRandomInput(r, true)
		want := boOracle(in, lot)
		got := map[string]float64{}
		for _, s := range shopping.Attribute(in, lot) {
			got[fmt.Sprintf("%d/%d", s.MealID, s.IngredientID)] += s.Quantity
		}
		if len(got) != len(want) {
			t.Fatalf("run %d: shares %v, oracle %v\ninput %+v", i, got, want, in)
		}
		for k, w := range want {
			if !near(got[k], w) {
				t.Fatalf("run %d: share %s = %v, oracle %v\ninput %+v", i, k, got[k], w, in)
			}
		}
	}
}

func TestPropertyAPlannedMealIsOnlyCoveredWhenEveryEarlierOneIsCoveredFirst(t *testing.T) {
	r := rand.New(rand.NewSource(99))
	for i := 0; i < 200; i++ {
		in, lot := boRandomInput(r, false)
		var without []stock.Lot
		for _, l := range in.Lots {
			if l.ID != lot {
				without = append(without, l)
			}
		}
		for _, ing := range []int64{chicken, rice, passata} {
			// Each Planned Meal's shortfall before the purchase (prefix differences of Derive on the Stock without the Lot).
			shortOf := func(k int) float64 {
				p := in
				p.Lots, p.Meals = without, in.Meals[:k]
				if l, ok := shopping.Derive(p).LineFor(ing); ok {
					return l.Quantity
				}
				return 0
			}
			share := map[int64]float64{}
			for _, s := range shopping.Attribute(in, lot) {
				if s.IngredientID == ing {
					share[s.MealID] += s.Quantity
				}
			}
			sawPartial := false
			for k, m := range in.Meals {
				own := shortOf(k+1) - shortOf(k)
				if own <= 1e-6 {
					continue
				}
				if share[m.MealID] > own+1e-6 {
					t.Fatalf("run %d: Planned Meal %d got %v of its own %v shortfall", i, m.MealID, share[m.MealID], own)
				}
				if sawPartial && share[m.MealID] > 1e-6 {
					t.Fatalf("run %d: Planned Meal %d was covered after an earlier one was left short (shares %v)", i, m.MealID, share)
				}
				if share[m.MealID] < own-1e-6 {
					sawPartial = true
				}
			}
		}
	}
}
