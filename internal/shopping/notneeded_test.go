package shopping_test

import (
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// B5-SH (docs/dev/design/beta5-plan.md 2.5): Not needed lines and the hint for unconfirmed past meals.
// "Now" (derive_test.go) is Monday 2026-11-09 12:00 UTC; dinners are at 19:00.

// slotMeal is a dinner of slot 7 ("Dinner") on a Course, so a hint can name it.
func slotMeal(date, course string, batches float64, needs ...shopping.Need) shopping.Meal {
	m := dinner(date, batches, needs...)
	m.SlotID, m.SlotName, m.CourseName = 7, "Dinner", course
	return m
}

func withNotNeeded(in shopping.Input, ids ...int64) shopping.Input {
	in.NotNeeded = map[int64]shopping.NotNeeded{}
	for _, id := range ids {
		in.NotNeeded[id] = shopping.NotNeeded{IngredientID: id, Needed: 1}
	}
	return in
}

func TestANotNeededLineLeavesLinesAndIsListedUnderNotNeeded(t *testing.T) {
	in := withNotNeeded(input(dinner("2026-11-10", 2, need(passata, 350), need(rice, 100))), passata)
	l := shopping.Derive(in)
	noLine(t, l, passata)
	if len(l.Lines) != 1 || l.Lines[0].IngredientID != rice {
		t.Fatalf("Lines = %+v, want only rice", l.Lines)
	}
	if len(l.NotNeeded) != 1 || l.NotNeeded[0].IngredientID != passata || l.NotNeeded[0].Name != "Passata" || !near(l.NotNeeded[0].Quantity, 700) {
		t.Fatalf("NotNeeded = %+v, want passata 700 g", l.NotNeeded)
	}
}

func TestNotNeededLinesCountInNeitherProgressNorTheEstimateNorTheUnpricedCount(t *testing.T) {
	in := input(dinner("2026-11-10", 1, need(passata, 700), need(rice, 100)))
	in.Packs = map[int64]shopping.Pack{passata: {ProductID: 7, Name: "Mutti 700 g", Size: 700}, rice: {ProductID: 8, Name: "Rice 1 kg", Size: 1000}}
	in.PackPrices = map[int64]int{7: 159} // rice has no Price
	withPassata := shopping.Derive(in)
	if withPassata.EstimatedCostCents != 159 || withPassata.UnpricedLines != 1 || withPassata.Progress.Total != 2 {
		t.Fatalf("baseline = cost %d unpriced %d total %d", withPassata.EstimatedCostCents, withPassata.UnpricedLines, withPassata.Progress.Total)
	}
	l := shopping.Derive(withNotNeeded(in, passata, rice))
	if l.EstimatedCostCents != 0 || l.UnpricedLines != 0 || l.Progress.Total != 0 || l.Progress.Ticked != 0 {
		t.Fatalf("with both Not needed: cost %d unpriced %d progress %+v, want all zero", l.EstimatedCostCents, l.UnpricedLines, l.Progress)
	}
	if len(l.NotNeeded) != 2 {
		t.Fatalf("NotNeeded = %+v, want 2", l.NotNeeded)
	}
}

func TestTheListIsCompleteWhenEveryOtherLineIsTickedWhateverIsNotNeeded(t *testing.T) {
	in := input(dinner("2026-11-10", 1, need(passata, 700), need(rice, 100)))
	in.Ticks = map[int64]shopping.Tick{rice: {IngredientID: rice, Needed: 100, By: "hand"}}
	if shopping.Derive(in).Complete {
		t.Fatal("passata is still open: the list is not complete")
	}
	l := shopping.Derive(withNotNeeded(in, passata))
	if !l.Complete || l.Progress.Ticked != 1 || l.Progress.Total != 1 {
		t.Fatalf("Complete = %v progress %+v, want complete 1 of 1", l.Complete, l.Progress)
	}
}

func TestAListWhoseLinesAreAllNotNeededIsNotComplete(t *testing.T) {
	l := shopping.Derive(withNotNeeded(input(dinner("2026-11-10", 1, need(passata, 700))), passata))
	if l.Complete || l.Progress.Total != 0 {
		t.Fatalf("Complete = %v progress %+v, want an empty list that is not complete", l.Complete, l.Progress)
	}
}

func TestATickedLineStaysTickedEvenIfItIsAlsoMarkedNotNeeded(t *testing.T) {
	in := input(dinner("2026-11-10", 1, need(passata, 700)))
	in.Ticks = map[int64]shopping.Tick{passata: {IngredientID: passata, Needed: 700, By: "scan"}}
	l := shopping.Derive(withNotNeeded(in, passata))
	if got := line(t, l, passata); !got.Ticked || len(l.NotNeeded) != 0 {
		t.Fatalf("ticked = %v, NotNeeded = %+v; Not needed is only for open lines", got.Ticked, l.NotNeeded)
	}
}

func TestANotNeededLineWhoseNeedGrowsStaysNotNeededWithTheNewQuantity(t *testing.T) {
	in := withNotNeeded(input(dinner("2026-11-10", 1, need(passata, 700)), dinner("2026-11-12", 1, need(passata, 500))), passata)
	in.NotNeeded[passata] = shopping.NotNeeded{IngredientID: passata, Needed: 700} // set when only the first meal existed
	l := shopping.Derive(in)
	noLine(t, l, passata)
	if len(l.NotNeeded) != 1 || !near(l.NotNeeded[0].Quantity, 1200) {
		t.Fatalf("NotNeeded = %+v, want passata 1200 g (the mark is not tied to the quantity)", l.NotNeeded)
	}
}

func TestANotNeededIngredientWithNoNeedLeftIsNotShown(t *testing.T) {
	in := input(dinner("2026-11-10", 1, need(passata, 700)))
	in.Lots = []stock.Lot{{ID: 1, IngredientID: passata, Quantity: 1000, Purchased: "2026-11-09"}}
	l := shopping.Derive(withNotNeeded(in, passata))
	if len(l.Lines) != 0 || len(l.NotNeeded) != 0 {
		t.Fatalf("Lines %+v, NotNeeded %+v; Stock covers it, nothing to show", l.Lines, l.NotNeeded)
	}
}

func TestNotNeededLinesAreSortedByNameThenId(t *testing.T) {
	in := withNotNeeded(input(dinner("2026-11-10", 1, need(rice, 1), need(passata, 1), need(chicken, 1), need(milk, 1))), rice, passata, chicken)
	l := shopping.Derive(in)
	var got []int64
	for _, n := range l.NotNeeded {
		got = append(got, n.IngredientID)
	}
	if len(got) != 3 || got[0] != chicken || got[1] != passata || got[2] != rice {
		t.Fatalf("NotNeeded order = %v, want chicken, Passata, rice", got)
	}
}

// ---- pastPlannedMeals ----

func TestAPastUnconfirmedMealStillCountsAndIsNamedOnItsLine(t *testing.T) {
	// Tuesday 2026-11-03 19:00 is a week before "now": its slot has passed and nobody marked it Cooked.
	l := shopping.Derive(input(
		slotMeal("2026-11-03", "Main", 1, need(passata, 700)),
		slotMeal("2026-11-10", "Main", 1, need(passata, 700)),
	))
	p := line(t, l, passata)
	if !near(p.Quantity, 1400) {
		t.Fatalf("quantity = %v, want 1400 (both meals count)", p.Quantity)
	}
	want := shopping.PastMeal{Date: "2026-11-03", MealSlotID: 7, MealSlotName: "Dinner", CourseName: "Main"}
	if len(p.PastPlannedMeals) != 1 || p.PastPlannedMeals[0] != want {
		t.Fatalf("PastPlannedMeals = %+v, want only %+v (the 10th is in the future)", p.PastPlannedMeals, want)
	}
}

func TestAMealEarlierTodayWhoseSlotHasPassedIsPastToo(t *testing.T) {
	m := slotMeal("2026-11-09", "Main", 1, need(passata, 700))
	m.At = time.Date(2026, 11, 9, 8, 0, 0, 0, time.UTC) // a breakfast slot at 08:00, now is 12:00
	later := slotMeal("2026-11-09", "Main", 1, need(rice, 100))
	l := shopping.Derive(input(m, later))
	if got := line(t, l, passata).PastPlannedMeals; len(got) != 1 || got[0].Date != "2026-11-09" {
		t.Fatalf("passata PastPlannedMeals = %+v, want today's earlier slot", got)
	}
	if got := line(t, l, rice).PastPlannedMeals; len(got) != 0 {
		t.Fatalf("rice PastPlannedMeals = %+v, want none (19:00 has not passed)", got)
	}
}

func TestAPastMealIsOnlyNamedOnTheLinesItNeeds(t *testing.T) {
	l := shopping.Derive(input(
		slotMeal("2026-11-03", "Main", 1, need(passata, 700)),
		slotMeal("2026-11-10", "Main", 1, need(rice, 100)),
	))
	if got := line(t, l, rice).PastPlannedMeals; len(got) != 0 {
		t.Fatalf("rice PastPlannedMeals = %+v, want none", got)
	}
}

func TestPastCoursesOfOneSlotGetOneEntryEachInDateThenCourseOrder(t *testing.T) {
	l := shopping.Derive(input(
		slotMeal("2026-11-04", "Main", 1, need(passata, 100)),
		slotMeal("2026-11-03", "Main", 1, need(passata, 100)),
		slotMeal("2026-11-03", "Side", 1, need(passata, 100)),
	))
	got := line(t, l, passata).PastPlannedMeals
	if len(got) != 3 || got[0].Date != "2026-11-03" || got[0].CourseName != "Main" || got[1].Date != "2026-11-03" || got[1].CourseName != "Side" || got[2].Date != "2026-11-04" {
		t.Fatalf("PastPlannedMeals = %+v, want 3 entries: 3 Nov Main, 3 Nov Side, 4 Nov Main", got)
	}
}

func TestAMealWithoutSlotInformationIsNeverNamed(t *testing.T) {
	l := shopping.Derive(input(dinner("2026-11-03", 1, need(passata, 700)))) // SlotID 0
	p := line(t, l, passata)
	if !near(p.Quantity, 700) || len(p.PastPlannedMeals) != 0 {
		t.Fatalf("quantity %v, PastPlannedMeals %+v; it counts but is not named", p.Quantity, p.PastPlannedMeals)
	}
}

func TestANotNeededLineStillNamesItsPastMeals(t *testing.T) {
	l := shopping.Derive(withNotNeeded(input(slotMeal("2026-11-03", "Main", 1, need(passata, 700))), passata))
	if len(l.NotNeeded) != 1 || len(l.NotNeeded[0].PastPlannedMeals) != 1 {
		t.Fatalf("NotNeeded = %+v, want the line with its past meal (Not needed is allowed on such a line)", l.NotNeeded)
	}
}
