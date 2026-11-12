package planner

import (
	"testing"
	"time"
)

// Guests and Not served (ADR 0014; beta5-reconcile §12.3 golden cases). Team B5-SD, test-first: every test here is red
// until Slot.Guests, Slot.NotServed and Result.Raised are honoured.

func withGuests(n int) cellOpt { return func(s *Slot) { s.Guests = n } }
func notServedDate() cellOpt   { return func(s *Slot) { s.NotServed = true } }

func TestSlotPortionsAddOneStandardPortionPerGuest(t *testing.T) {
	s := Slot{Attendance: []Attendee{{anna, 1}, {ben, 0.5}}, Guests: 3}
	if got := s.Portions(); !approx(got, 4.5) {
		t.Errorf("Portions = %v, want 1.5 + 3 Guests = 4.5", got)
	}
	if got := (Slot{Guests: 2}).Portions(); !approx(got, 2) {
		t.Errorf("Guests alone = %v, want 2", got)
	}
}

func TestGuestsAddPortionsBatchesAndTheLeftover(t *testing.T) {
	// Two Members and 3 Guests: 5 portions; a yield-4 Recipe needs 2 Batches and leaves 3 over; yield-2 needs 3, leaves 1.
	in := baseInput([]Slot{mainCell(0, withGuests(3))}, rcp(1, 4, courses(mainC)))
	p := wantPlaced(t, mustPlan(t, in), ck(0, mainC), 1)
	if !approx(p.Portions, 5) || p.Batches != 2 || p.NewLeftover == nil || !approx(p.NewLeftover.Portions, 3) {
		t.Errorf("placement = %+v, want 5 portions, 2 Batches, a Leftover of 3", p)
	}
	in = baseInput([]Slot{mainCell(0, withGuests(3))}, rcp(1, 2, courses(mainC)))
	p = wantPlaced(t, mustPlan(t, in), ck(0, mainC), 1)
	if p.Batches != 3 || p.NewLeftover == nil || !approx(p.NewLeftover.Portions, 1) {
		t.Errorf("placement = %+v, want 3 Batches and a Leftover of 1", p)
	}
}

func TestGuestsRaiseTheStockTheMealUses(t *testing.T) {
	// 4 portions with yield 2 = 2 Batches of 400 g chicken: 800 g to buy with no Stock.
	in := baseInput([]Slot{mainCell(0, withGuests(2))}, rcp(1, 2, courses(mainC), needs(need(chicken, 400))))
	r := mustPlan(t, in)
	if len(r.Purchases) != 1 || !approx(r.Purchases[0].Shortfall, 800) {
		t.Errorf("Purchases = %+v, want 800 g of chicken for 2 Batches", r.Purchases)
	}
}

func TestGuestsOnlyDateIsPlannedWithNoPreferences(t *testing.T) {
	// Nobody among the Members attends; 3 Guests do. The Members' Exclusions do not apply: Recipe 1 is excluded by Ben,
	// who is not eating, and is the lowest id.
	in := prefs(baseInput([]Slot{mainCell(0, eats(), withGuests(3))}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(mainC))),
		ben, Preferences{ExcludedRecipes: []RecipeID{1}})
	r := mustPlan(t, in)
	p := wantPlaced(t, r, ck(0, mainC), 1)
	if !approx(p.Portions, 3) || p.Batches != 2 {
		t.Errorf("placement = %+v, want 3 portions in 2 Batches", p)
	}
	if isUnfilled(r, ck(0, mainC)) {
		t.Errorf("a date with Guests and no Member is served, not no_attendance: %+v", r.Unfilled)
	}
}

func TestGuestsOnlyDateGivesNoFavouriteOrDislikeChips(t *testing.T) {
	in := weighted(baseInput([]Slot{mainCell(0, eats(), withGuests(2))}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(mainC))),
		Weights{Favourite: 5, Dislike: -5})
	in.Members = map[MemberID]Preferences{anna: {Favourites: []RecipeID{2}}, ben: {Dislikes: []RecipeID{1}}}
	p := wantPlaced(t, mustPlan(t, in), ck(0, mainC), 1) // neither Member eats: no Favourite, no Dislike
	for _, w := range p.Why {
		if w.Code == ReasonFavourite {
			t.Errorf("a Favourite chip %+v for a date only Guests eat", w)
		}
	}
}

func TestGuestsDoNotLiftAnExclusionOfAMemberWhoEats(t *testing.T) {
	in := prefs(baseInput([]Slot{mainCell(0, eats(Attendee{anna, 1}), withGuests(2))}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(mainC))),
		anna, Preferences{ExcludedRecipes: []RecipeID{1}})
	wantPlaced(t, mustPlan(t, in), ck(0, mainC), 2)
}

func TestACourseEveryMemberOptsOutOfIsServedForTheGuests(t *testing.T) {
	// Golden case "Guests with Course opt-outs" (reconcile §12.3, U3): the dessert is opted out by everyone, 2 Guests eat it.
	in := baseInput([]Slot{mainCell(0, withGuests(2)), cell(0, dessertC, optedOut(), withGuests(2))},
		rcp(1, 2, courses(mainC)), rcp(2, 2, courses(dessertC)))
	r := mustPlan(t, in)
	wantPlaced(t, r, ck(0, mainC), 1)
	p := wantPlaced(t, r, ck(0, dessertC), 2)
	if !approx(p.Portions, 2) || p.Batches != 1 {
		t.Errorf("dessert = %+v, want 2 portions (the Guests) in 1 Batch", p)
	}
	if _, ok := notServedAt(r, ck(0, dessertC)); ok {
		t.Error("the dessert is listed as not served although Guests eat it")
	}
}

func TestACourseSomeMembersOptOutOfCountsTheGuestsToo(t *testing.T) {
	// Main for Anna and Ben, dessert for Anna only: dessert portions = 1 + 2 Guests.
	in := baseInput([]Slot{mainCell(0, withGuests(2)), cell(0, dessertC, eats(Attendee{anna, 1}), withGuests(2))},
		rcp(1, 2, courses(mainC)), rcp(2, 4, courses(dessertC)))
	r := mustPlan(t, in)
	if p := wantPlaced(t, r, ck(0, mainC), 1); !approx(p.Portions, 4) || p.Batches != 2 {
		t.Errorf("main = %+v, want 4 portions in 2 Batches", p)
	}
	if p := wantPlaced(t, r, ck(0, dessertC), 2); !approx(p.Portions, 3) || p.Batches != 1 {
		t.Errorf("dessert = %+v, want 3 portions in 1 Batch", p)
	}
}

func TestAnOptionalCourseStaysOptionalWithGuests(t *testing.T) {
	// Nothing is marked with the dessert's Course: it is left empty with no reason, Guests or not.
	in := baseInput([]Slot{mainCell(0, withGuests(2)), cell(0, dessertC, isOptional(), withGuests(2))}, rcp(1, 2, courses(mainC)))
	r := mustPlan(t, in)
	wantPlaced(t, r, ck(0, mainC), 1)
	if isUnfilled(r, ck(0, dessertC)) {
		t.Errorf("an optional Course with nothing to serve is not Couldn't plan: %+v", r.Unfilled)
	}
}

func TestASlotNobodyAndNoGuestEatsIsStillNoAttendance(t *testing.T) {
	in := baseInput([]Slot{mainCell(0, eats())}, rcp(1, 2, courses(mainC)))
	if u := unfilledAt(t, mustPlan(t, in), ck(0, mainC)); u.Reason != UnfilledNoAttendance {
		t.Errorf("reason = %q, want no_attendance (the usual Attendance is empty and no Guest)", u.Reason)
	}
}

func TestAKeptMealUsesTheGuestsInItsPortions(t *testing.T) {
	// 2 Members + 2 Guests = 4 portions; 2 Batches of yield 2 still cover: kept, KeptPortions 4, nothing raised.
	meal := ExistingMeal{State: MealPlanned, RecipeID: 3, Batches: 2}
	in := baseInput([]Slot{mainCell(0, withGuests(2), holding(meal))}, rcp(1, 2, courses(mainC)), rcp(3, 2, courses(mainC)))
	r := mustPlan(t, in)
	if !isKept(r, ck(0, mainC)) || !approx(r.KeptPortions[ck(0, mainC)], 4) || len(r.Raised) != 0 {
		t.Errorf("Kept = %v, KeptPortions = %v, Raised = %v; want kept for 4 portions, nothing raised", r.Kept, r.KeptPortions, r.Raised)
	}
}

// ---- Not served ----

func TestNotServedLeavesEveryCellEmptyWithNoReason(t *testing.T) {
	in := baseInput([]Slot{mainCell(0, notServedDate()), cell(0, sideC, notServedDate()), cell(0, dessertC, isOptional(), notServedDate()),
		mainCell(1)}, rcp(1, 2, courses(mainC, sideC, dessertC)))
	r := mustPlan(t, in)
	for _, c := range []int64{mainC, sideC, dessertC} {
		wantNotServed(t, r, ck(0, c), NotServedDate)
	}
	wantPlaced(t, r, ck(1, mainC), 1) // the next day is planned as usual
}

func TestNotServedIsNotCouldntPlanEvenWhenNobodyAttends(t *testing.T) {
	in := baseInput([]Slot{mainCell(0, eats(), notServedDate())}, rcp(1, 2, courses(mainC)))
	wantNotServed(t, mustPlan(t, in), ck(0, mainC), NotServedDate)
}

func TestNotServedDropsAnUnpinnedPlannedMeal(t *testing.T) {
	in := baseInput([]Slot{mainCell(0, notServedDate(), holding(plannedMeal(1)))}, rcp(1, 2, courses(mainC)))
	r := mustPlan(t, in)
	wantNotServed(t, r, ck(0, mainC), NotServedDate) // not kept, not placed: Reconcile deletes the stored meal
	if isKept(r, ck(0, mainC)) {
		t.Error("the Planned Meal of a Not served slot was kept")
	}
}

func TestNotServedWithAWholeMealInTheMainCourse(t *testing.T) {
	// Golden case (reconcile §12.3): a Whole meal planned in the main Course would cover the side. Not served wins:
	// neither cell is covered, both are not served for the date, and the Whole meal is not "cooked": the next day may
	// take it with no Cool-down against it.
	in := baseInput([]Slot{
		mainCell(0, notServedDate(), holding(plannedMeal(1))), cell(0, sideC, notServedDate()),
		mainCell(1),
	}, rcp(1, 2, courses(mainC), whole()), rcp(2, 2, courses(mainC)), rcp(3, 2, courses(sideC)))
	r := mustPlan(t, in)
	wantNotServed(t, r, ck(0, mainC), NotServedDate)
	wantNotServed(t, r, ck(0, sideC), NotServedDate)
	p := wantPlaced(t, r, ck(1, mainC), 1)
	if p.Relaxed {
		t.Errorf("day 1 took the Whole meal %+v as a relaxed pick: the Not served day must leave no Cool-down", p)
	}
}

func TestNotServedTakesNoStock(t *testing.T) {
	in := baseInput([]Slot{mainCell(0, notServedDate(), holding(plannedMeal(1))), mainCell(1)},
		rcp(1, 2, courses(mainC), needs(need(chicken, 400))), rcp(2, 2, courses(mainC)))
	in.Lots = []StockLot{lot(1, chicken, 400, day(9))}
	in.Weights = &Weights{PerishableUse: 5}
	r := mustPlan(t, in)
	if len(r.Purchases) != 0 {
		t.Errorf("Purchases = %+v, want none", r.Purchases)
	}
	// The 400 g of chicken was not reserved by the Not served day: day 1 can still use it (Recipe 1 needs it).
	wantPlaced(t, r, ck(1, mainC), 1)
}

func TestACookedCourseOfANotServedSlotStaysHistory(t *testing.T) {
	in := baseInput([]Slot{mainCell(0, notServedDate(), holding(cookedMeal(1))), cell(0, sideC, notServedDate())},
		rcp(1, 2, courses(mainC)), rcp(2, 2, courses(sideC)))
	r := mustPlan(t, in)
	if _, ok := notServedAt(r, ck(0, mainC)); ok {
		t.Error("a Cooked Planned Meal is history: it is not listed as not served")
	}
	if isKept(r, ck(0, mainC)) {
		t.Error("a Cooked meal is never in Kept")
	}
}

func TestSlotsAreWalkedByTheirEffectiveTime(t *testing.T) {
	// Lunch is usually at 12:00 and dinner at 19:30; a date's own time moves the dinner to 11:00, so it is walked first
	// and cooks the 4-portion Recipe whose extra portions the lunch then eats as a Leftover.
	dinnerEarly := dinner(0)
	dinnerEarly.At = baseDay.Add(11 * time.Hour)
	in := baseInput([]Slot{lunch(0), dinnerEarly}, rcp(1, 4))
	r := mustPlan(t, in)
	if len(r.Placements) != 2 || r.Placements[0].Key.MealSlotID != dinnerSlot || r.Placements[1].Source != SourceLeftover {
		t.Errorf("placements = %+v, want the 11:00 dinner first, then the lunch from its Leftover", r.Placements)
	}
}
