package plan_test

import (
	"reflect"
	"sort"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

// A Meal Slot on one date: BuildInput and Reconcile (ADR 0014). Team B5-SD, test-first.

func TestReasonForEventSlotDates(t *testing.T) {
	if r, ok := plan.ReasonForEvent("household", []byte(`{"changed":"slotDates"}`)); !ok || r != plan.ReasonSlotDateChanged {
		t.Errorf("household slotDates = %q, %v; want ReasonSlotDateChanged", r, ok)
	}
	if r, ok := plan.ReasonForEvent(plan.InvalidateTopic, []byte(`{"reason":"slot_date_changed"}`)); !ok || r != plan.ReasonSlotDateChanged {
		t.Errorf("explicit hook = %q, %v; want ReasonSlotDateChanged", r, ok)
	}
	if plan.ReasonSlotDateChanged != "slot_date_changed" {
		t.Errorf("reason = %q", plan.ReasonSlotDateChanged)
	}
}

func TestBuildInputUsesTheEffectiveTimeForTheInstant(t *testing.T) {
	s := baseSnapshot()
	si := slotInfo("2026-11-10", 1, "20:15", 1, 2) // the date's own time; the usual one is 19:00
	si.UsualTime = "19:00"
	s.Slots = []plan.SlotInfo{si}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	got := slotByKey(t, in, pk("2026-11-10", 1))
	if want := time.Date(2026, 11, 10, 20, 15, 0, 0, time.UTC); !got.At.Equal(want) {
		t.Errorf("At = %v, want the date's 20:15", got.At)
	}
}

func TestBuildInputPassesTheGuestsToEveryCell(t *testing.T) {
	s := baseSnapshot()
	si := dinnerWithCourses("2026-11-10")
	si.Guests = 3
	s.Slots = []plan.SlotInfo{si}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []int64{mainCourse, sideCourse, dessertCourse} {
		if got := slotByKey(t, in, pkc("2026-11-10", 1, c)); got.Guests != 3 {
			t.Errorf("cell for Course %d has Guests %d, want 3", c, got.Guests)
		}
	}
	// The Attendance stays the Members': Guests are not an Attendee and have no id.
	main := slotByKey(t, in, pkc("2026-11-10", 1, mainCourse))
	if len(main.Attendance) != 2 {
		t.Errorf("main Attendance = %+v, want the 2 Members only", main.Attendance)
	}
}

func TestBuildInputADateOfGuestsAndNoMemberIsNotAnOptOut(t *testing.T) {
	s := baseSnapshot()
	si := dinnerWithCourses("2026-11-10")
	si.Attendance, si.Guests = nil, 3
	for i := range si.Courses {
		si.Courses[i].Attendance = nil
	}
	s.Slots = []plan.SlotInfo{si}
	in, _ := plan.BuildInput(s)
	for _, c := range in.Slots {
		if c.AllOptedOut || c.Guests != 3 || len(c.Attendance) != 0 {
			t.Errorf("cell %+v: want no Attendance, 3 Guests and not an opt-out", c)
		}
	}
}

func notServedSlot() plan.SlotInfo {
	si := dinnerWithCourses("2026-11-10")
	si.NotServed = true
	return si
}

func TestBuildInputMarksEveryCellOfANotServedSlot(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{notServedSlot(), dinnerWithCourses("2026-11-11")}
	in, _ := plan.BuildInput(s)
	for _, c := range in.Slots {
		if want := c.Key.Date == "2026-11-10"; c.NotServed != want {
			t.Errorf("cell %+v: NotServed = %v, want %v", c.Key, c.NotServed, want)
		}
	}
}

func TestBuildInputDropsTheUnresolvedMealsOfANotServedSlotPinnedOnesToo(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{notServedSlot()}
	s.Meals = []plan.Meal{
		{Key: kc("2026-11-10", 1, mainCourse), RecipeID: 1, Batches: 1, State: plan.StatePlanned},
		{Key: kc("2026-11-10", 1, sideCourse), RecipeID: 2, Batches: 1, State: plan.StatePlanned, Pinned: true},
	}
	in, _ := plan.BuildInput(s)
	for _, c := range []int64{mainCourse, sideCourse} {
		if got := slotByKey(t, in, pkc("2026-11-10", 1, c)); got.Existing != nil {
			t.Errorf("Course %d: Existing = %+v, want none: Not served removes unresolved meals, Pinned ones after the confirm", c, got.Existing)
		}
	}
}

func TestBuildInputIgnoresNotServedOnceACourseIsCookedOrNotCooked(t *testing.T) {
	for _, state := range []plan.State{plan.StateCooked, plan.StateSkipped} {
		s := baseSnapshot()
		s.Slots = []plan.SlotInfo{notServedSlot()}
		s.Meals = []plan.Meal{
			{Key: kc("2026-11-10", 1, mainCourse), RecipeID: 1, Batches: 1, State: state},
			{Key: kc("2026-11-10", 1, sideCourse), RecipeID: 2, Batches: 1, State: plan.StatePlanned},
		}
		in, _ := plan.BuildInput(s)
		for _, c := range in.Slots {
			if c.NotServed {
				t.Errorf("%s: cell %+v is Not served although a Course is resolved (U2)", state, c.Key)
			}
		}
		if got := slotByKey(t, in, pkc("2026-11-10", 1, sideCourse)); got.Existing == nil {
			t.Errorf("%s: the side's Planned Meal was dropped; the slot has started, so Not served does not apply", state)
		}
	}
}

func TestBuildInputKeepsAnUnconfirmedMealOfANotServedSlotThatIsOver(t *testing.T) {
	s := baseSnapshot()
	s.Now = time.Date(2026, 11, 10, 22, 0, 0, 0, time.UTC) // the 19:00 dinner is over
	s.Slots = []plan.SlotInfo{notServedSlot()}
	s.Meals = []plan.Meal{{Key: kc("2026-11-10", 1, mainCourse), RecipeID: 1, Batches: 1, State: plan.StatePlanned}}
	in, _ := plan.BuildInput(s)
	got := slotByKey(t, in, pkc("2026-11-10", 1, mainCourse))
	if got.Existing == nil || got.Existing.State != planner.MealPinned {
		t.Errorf("Existing = %+v, want the unconfirmed meal passed as Pinned: it happened, only Cooked / Not cooked resolves it", got.Existing)
	}
}

// ---- Reconcile ----

func TestReconcileRaisesBatchesOfKeptAndPinnedMeals(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{slotInfo("2026-11-10", 1, "19:00", 1, 2), slotInfo("2026-11-11", 1, "19:00", 1, 2)}
	s.Meals = []plan.Meal{
		{ID: 2, Key: k("2026-11-10", 1), RecipeID: 3, Batches: 1, Portions: 2, State: plan.StatePlanned},
		{ID: 3, Key: k("2026-11-11", 1), RecipeID: 4, Batches: 1, Portions: 2, State: plan.StatePlanned, Pinned: true},
	}
	res := planner.Result{
		Kept:         []planner.SlotKey{pk("2026-11-10", 1)},
		KeptPortions: map[planner.SlotKey]float64{pk("2026-11-10", 1): 6},
		Raised: []planner.BatchRaise{
			{Key: pk("2026-11-10", 1), Batches: 3, Portions: 6},
			{Key: pk("2026-11-11", 1), Batches: 2, Portions: 4},
		},
	}
	got := plan.Reconcile(s, res)
	want := []plan.BatchRaise{
		{Key: k("2026-11-10", 1), Batches: 3, Portions: 6},
		{Key: k("2026-11-11", 1), Batches: 2, Portions: 4},
	}
	if !reflect.DeepEqual(got.RaiseBatches, want) {
		t.Errorf("RaiseBatches = %+v, want %+v", got.RaiseBatches, want)
	}
	for _, u := range got.Upserts {
		if u.Key == k("2026-11-10", 1) {
			t.Errorf("the kept meal is also upserted with its old Batches: %+v (RaiseBatches writes them)", u)
		}
	}
	if len(got.Deletes) != 0 {
		t.Errorf("Deletes = %v; raising never deletes a meal", got.Deletes)
	}
}

// Review round 3: a kept meal that is both raised and re-checked gets both: the raised Batches and portions, and the
// re-check's relaxed flag and reason. Apply runs RaiseBatches before Upserts, so the upsert must carry the raised
// values (or it undoes the raise).
func TestReconcileAppliesTheRecheckOfAMealThatIsAlsoRaised(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{slotInfo("2026-11-10", 1, "19:00", 1, 2)}
	s.Meals = []plan.Meal{{ID: 2, Key: k("2026-11-10", 1), RecipeID: 3, Batches: 1, Portions: 2, State: plan.StatePlanned}}
	res := planner.Result{
		Kept:   []planner.SlotKey{pk("2026-11-10", 1)},
		Raised: []planner.BatchRaise{{Key: pk("2026-11-10", 1), Batches: 3, Portions: 6}},
		Rechecks: []planner.Recheck{{Key: pk("2026-11-10", 1), Relaxed: true,
			Why: &planner.Why{Code: planner.ReasonCooldownRelaxed, Date: "2026-11-05"}}},
	}
	got := plan.Reconcile(s, res)
	if want := []plan.BatchRaise{{Key: k("2026-11-10", 1), Batches: 3, Portions: 6}}; !reflect.DeepEqual(got.RaiseBatches, want) {
		t.Errorf("RaiseBatches = %+v, want %+v", got.RaiseBatches, want)
	}
	var up *plan.Meal
	for i := range got.Upserts {
		if got.Upserts[i].Key == k("2026-11-10", 1) {
			up = &got.Upserts[i]
		}
	}
	if up == nil {
		t.Fatalf("Upserts = %+v; the re-check's relaxed flag and reason never reach Changes for a raised meal", got.Upserts)
	}
	if !up.Relaxed {
		t.Errorf("upsert = %+v, want Relaxed from the re-check", *up)
	}
	hasChip := false
	for _, w := range up.Why {
		hasChip = hasChip || w.Code == string(planner.ReasonCooldownRelaxed)
	}
	if !hasChip {
		t.Errorf("upsert Why = %+v, want the re-check's cooldown_relaxed chip", up.Why)
	}
	if up.Batches != 3 || up.Portions != 6 {
		t.Errorf("upsert Batches %v Portions %v, want the raised 3 and 6 (Apply would undo the raise with the old values)", up.Batches, up.Portions)
	}
}

func TestReconcileNoRaiseWhenNothingWasRaised(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{slotInfo("2026-11-10", 1, "19:00", 1, 2)}
	s.Meals = []plan.Meal{{ID: 2, Key: k("2026-11-10", 1), RecipeID: 3, Batches: 3, Portions: 2, State: plan.StatePlanned}}
	got := plan.Reconcile(s, planner.Result{Kept: []planner.SlotKey{pk("2026-11-10", 1)}})
	if len(got.RaiseBatches) != 0 {
		t.Errorf("RaiseBatches = %+v, want none", got.RaiseBatches)
	}
}

func sortedKeys(ks []plan.Key) []plan.Key {
	out := append([]plan.Key(nil), ks...)
	sort.Slice(out, func(i, j int) bool { return out[i].CourseID < out[j].CourseID })
	return out
}

func TestReconcileRemovesTheUnresolvedMealsOfANotServedSlotEvenWhenPinned(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{notServedSlot()}
	s.Meals = []plan.Meal{
		{ID: 1, Key: kc("2026-11-10", 1, mainCourse), RecipeID: 1, Batches: 1, State: plan.StatePlanned},
		{ID: 2, Key: kc("2026-11-10", 1, sideCourse), RecipeID: 2, Batches: 1, State: plan.StatePlanned, Pinned: true},
	}
	got := plan.Reconcile(s, planner.Result{})
	want := []plan.Key{kc("2026-11-10", 1, mainCourse), kc("2026-11-10", 1, sideCourse)}
	if !reflect.DeepEqual(sortedKeys(got.RemoveUnresolved), want) {
		t.Errorf("RemoveUnresolved = %v, want %v", got.RemoveUnresolved, want)
	}
	// Not served cells hold no Couldn't plan reason.
	if len(got.Unfilled) != 0 {
		t.Errorf("Unfilled = %+v, want none", got.Unfilled)
	}
	cleared := map[plan.Key]bool{}
	for _, c := range got.ClearUnfilled {
		cleared[c] = true
	}
	for _, c := range []int64{mainCourse, sideCourse, dessertCourse} {
		if !cleared[kc("2026-11-10", 1, c)] {
			t.Errorf("ClearUnfilled misses Course %d: a date that is Not served has no old reason left", c)
		}
	}
}

func TestReconcileLeavesCookedAndNotCookedMealsOfANotServedSlot(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{notServedSlot()}
	s.Meals = []plan.Meal{
		{ID: 1, Key: kc("2026-11-10", 1, mainCourse), RecipeID: 1, Batches: 1, State: plan.StateCooked},
		{ID: 2, Key: kc("2026-11-10", 1, sideCourse), RecipeID: 2, Batches: 1, State: plan.StatePlanned, Pinned: true},
	}
	got := plan.Reconcile(s, planner.Result{})
	if len(got.RemoveUnresolved) != 0 || len(got.Deletes) != 0 {
		t.Errorf("RemoveUnresolved = %v, Deletes = %v; the slot has started (U2): Not served does not apply and nothing is removed",
			got.RemoveUnresolved, got.Deletes)
	}
}

func TestReconcileKeepsAnUnconfirmedMealOfANotServedSlotThatIsOver(t *testing.T) {
	s := baseSnapshot()
	s.Now = time.Date(2026, 11, 10, 22, 0, 0, 0, time.UTC)
	s.Slots = []plan.SlotInfo{notServedSlot()}
	s.Meals = []plan.Meal{{ID: 1, Key: kc("2026-11-10", 1, mainCourse), RecipeID: 1, Batches: 1, State: plan.StatePlanned, Pinned: true}}
	got := plan.Reconcile(s, planner.Result{})
	if len(got.RemoveUnresolved) != 0 {
		t.Errorf("RemoveUnresolved = %v; a meal whose slot is over waits in To confirm", got.RemoveUnresolved)
	}
}

func TestBuildInputPassesThePortionsAMealWasPlacedWith(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{dinnerWithCourses("2026-11-10")}
	s.Meals = []plan.Meal{
		{Key: kc("2026-11-10", 1, mainCourse), RecipeID: 1, Batches: 1, Portions: 2.5, State: plan.StatePlanned},
		{Key: kc("2026-11-10", 1, sideCourse), RecipeID: 2, Batches: 0.5, Portions: 1, State: plan.StatePlanned, Pinned: true},
	}
	in, _ := plan.BuildInput(s)
	for course, want := range map[int64]float64{mainCourse: 2.5, sideCourse: 1} {
		got := slotByKey(t, in, pkc("2026-11-10", 1, course))
		if got.Existing == nil || got.Existing.PlacedPortions != want {
			t.Errorf("Course %d: Existing = %+v, want PlacedPortions %v (the stored portions)", course, got.Existing, want)
		}
	}
}
