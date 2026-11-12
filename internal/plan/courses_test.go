package plan_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

// The adapter with Courses (crs-b): one planner cell per Course of a Meal Slot occurrence, Course Attendance,
// the keys of every record carrying the Course, relaxed picks and the keep check coming back.

const (
	mainCourse    int64 = 5
	sideCourse    int64 = 6
	dessertCourse int64 = 7
)

func kc(date string, slot, course int64) plan.Key {
	return plan.Key{Date: date, MealSlotID: slot, CourseID: course}
}

func pkc(date string, slot, course int64) planner.SlotKey {
	return planner.SlotKey{Date: planner.Date(date), MealSlotID: slot, CourseID: course}
}

func att(ids ...int64) []plan.Attendee {
	var out []plan.Attendee
	for _, id := range ids {
		out = append(out, plan.Attendee{MemberID: id, Factor: 1})
	}
	return out
}

// dinnerWithCourses is a Dinner (slot 1) on date serving Main, Side (optional) and Dessert; members 1 and 2 attend
// the slot, member 2 opts out of the Side, and both opt out of the Dessert.
func dinnerWithCourses(date string) plan.SlotInfo {
	return plan.SlotInfo{
		Key: k(date, 1), Name: "Dinner", Time: "19:00", Attendance: att(1, 2),
		Courses: []plan.SlotCourse{
			{CourseID: mainCourse, Main: true, Attendance: att(1, 2)},
			{CourseID: sideCourse, Optional: true, Attendance: att(1)},
			{CourseID: dessertCourse, Attendance: nil},
		},
	}
}

func TestBuildInputPlansOneCellPerCourse(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{dinnerWithCourses("2026-11-10")}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	if len(in.Slots) != 3 {
		t.Fatalf("%d cells, want 3: %+v", len(in.Slots), in.Slots)
	}
	at := time.Date(2026, 11, 10, 19, 0, 0, 0, time.UTC)
	want := map[int64]planner.Slot{
		mainCourse:    {Key: pkc("2026-11-10", 1, mainCourse), At: at, Main: true, Position: 0, Attendance: []planner.Attendee{{MemberID: 1, PortionFactor: 1}, {MemberID: 2, PortionFactor: 1}}},
		sideCourse:    {Key: pkc("2026-11-10", 1, sideCourse), At: at, Optional: true, Position: 1, Attendance: []planner.Attendee{{MemberID: 1, PortionFactor: 1}}},
		dessertCourse: {Key: pkc("2026-11-10", 1, dessertCourse), At: at, Position: 2, AllOptedOut: true},
	}
	for _, got := range in.Slots {
		w, ok := want[got.Key.CourseID]
		if !ok {
			t.Fatalf("unexpected cell %+v", got.Key)
		}
		if !reflect.DeepEqual(got, w) {
			t.Errorf("cell for Course %d =\n%+v\nwant\n%+v", got.Key.CourseID, got, w)
		}
	}
}

func TestBuildInputAMealSlotNobodyAttendsIsNotAnOptOut(t *testing.T) {
	s := baseSnapshot()
	si := dinnerWithCourses("2026-11-10")
	si.Attendance = nil
	for i := range si.Courses {
		si.Courses[i].Attendance = nil
	}
	s.Slots = []plan.SlotInfo{si}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range in.Slots {
		if c.AllOptedOut {
			t.Errorf("cell %+v: AllOptedOut must be false when the slot itself has no attendees (no_attendance, not unserved)", c.Key)
		}
	}
}

func TestBuildInputZeroFactorCourseAttendeesCountAsNobody(t *testing.T) {
	s := baseSnapshot()
	si := dinnerWithCourses("2026-11-10")
	si.Courses[0].Attendance = []plan.Attendee{{MemberID: 1, Factor: 0}}
	s.Slots = []plan.SlotInfo{si}
	in, _ := plan.BuildInput(s)
	main := slotByKey(t, in, pkc("2026-11-10", 1, mainCourse))
	if len(main.Attendance) != 0 || !main.AllOptedOut {
		t.Errorf("main cell = %+v, want no attendance and AllOptedOut", main)
	}
}

func TestBuildInputASlotWithoutCoursesIsOneCellAsBefore(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{slotInfo("2026-11-10", 1, "19:00", 1, 2)}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	if len(in.Slots) != 1 {
		t.Fatalf("cells = %+v", in.Slots)
	}
	c := in.Slots[0]
	if c.Key != pk("2026-11-10", 1) || c.Main || c.Optional || c.Position != 0 || c.AllOptedOut {
		t.Errorf("cell = %+v", c)
	}
}

func TestBuildInputDropsPastEmptyCellsPerCell(t *testing.T) {
	s := baseSnapshot()
	s.Now = time.Date(2026, 11, 10, 20, 0, 0, 0, time.UTC) // after the 19:00 dinner
	s.Slots = []plan.SlotInfo{dinnerWithCourses("2026-11-10")}
	s.Meals = []plan.Meal{{Key: kc("2026-11-10", 1, sideCourse), RecipeID: 3, Batches: 1, State: plan.StateCooked}}
	in, _ := plan.BuildInput(s)
	if len(in.Slots) != 1 || in.Slots[0].Key != pkc("2026-11-10", 1, sideCourse) {
		t.Errorf("cells = %+v, want only the Side with its Cooked meal", in.Slots)
	}
}

func TestBuildInputMatchesMealsToTheirCourse(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{dinnerWithCourses("2026-11-10")}
	s.Meals = []plan.Meal{
		{Key: kc("2026-11-10", 1, mainCourse), RecipeID: 1, Batches: 1, State: plan.StatePlanned, Relaxed: true},
		{Key: kc("2026-11-10", 1, sideCourse), RecipeID: 2, Batches: 1, State: plan.StatePlanned, Pinned: true},
	}
	s.Clear = []plan.Key{kc("2026-11-10", 1, mainCourse)}
	in, _ := plan.BuildInput(s)
	if slotByKey(t, in, pkc("2026-11-10", 1, mainCourse)).Existing != nil {
		t.Error("Clear applies to the cell: the unpinned main meal must be treated as empty")
	}
	if e := slotByKey(t, in, pkc("2026-11-10", 1, sideCourse)).Existing; e == nil || e.State != planner.MealPinned || e.RecipeID != 2 {
		t.Errorf("side Existing = %+v", e)
	}
	// Relaxed comes through on a meal that stays.
	s.Clear = nil
	in, _ = plan.BuildInput(s)
	if e := slotByKey(t, in, pkc("2026-11-10", 1, mainCourse)).Existing; e == nil || !e.Relaxed {
		t.Errorf("main Existing = %+v, want Relaxed", e)
	}
}

// crs-c3 §3: Course 0 names no Course. A stored meal or Slot Rule keyed 0 on a slot with Courses matches no cell (the
// main Course is its real id), so it neither fills the main cell nor rules it.
func TestBuildInputCourseZeroNamesNoCourseOnASlotWithCourses(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{dinnerWithCourses("2026-11-10")}
	s.Meals = []plan.Meal{{Key: k("2026-11-10", 1), RecipeID: 1, Batches: 1, State: plan.StatePlanned, Pinned: true}}
	s.SlotRules = []plan.SlotRule{{ID: 1, MealSlotID: 1, Tag: "Pizza"}}
	in, _ := plan.BuildInput(s)
	if len(in.Slots) == 0 {
		t.Fatal("no cells")
	}
	for _, c := range in.Slots {
		if c.Existing != nil {
			t.Errorf("cell %+v Existing = %+v, want none: Course 0 names no Course", c.Key, c.Existing)
		}
		if len(c.Rules) != 0 {
			t.Errorf("cell %+v Rules = %+v, want none: Course 0 names no Course", c.Key, c.Rules)
		}
	}
}

func TestBuildInputSlotRulesBelongToTheirCourse(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{dinnerWithCourses("2026-11-10")}
	s.SlotRules = []plan.SlotRule{
		{ID: 1, MealSlotID: 1, CourseID: mainCourse, Tag: "Pizza"},
		{ID: 2, MealSlotID: 1, CourseID: sideCourse, RecipeID: 40},
		{ID: 3, MealSlotID: 2, CourseID: mainCourse, Tag: "x"},
	}
	in, _ := plan.BuildInput(s)
	if got, want := slotByKey(t, in, pkc("2026-11-10", 1, mainCourse)).Rules, []planner.SlotRule{{Tag: "pizza"}}; !reflect.DeepEqual(got, want) {
		t.Errorf("main Rules = %+v, want %+v", got, want)
	}
	if got, want := slotByKey(t, in, pkc("2026-11-10", 1, sideCourse)).Rules, []planner.SlotRule{{RecipeID: 40}}; !reflect.DeepEqual(got, want) {
		t.Errorf("side Rules = %+v, want %+v", got, want)
	}
	if got := slotByKey(t, in, pkc("2026-11-10", 1, dessertCourse)).Rules; len(got) != 0 {
		t.Errorf("dessert Rules = %+v", got)
	}
}

func TestBuildInputLeftoverSourcesCarryTheCourse(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{dinnerWithCourses("2026-11-11")}
	s.Leftovers = []plan.Leftover{{ID: 1, RecipeID: 5, From: kc("2026-11-10", 1, sideCourse), Portions: 2, CookedOn: "2026-11-10", UseBy: "2026-11-13", Status: plan.LeftoverAvailable}}
	s.Meals = []plan.Meal{{Key: kc("2026-11-11", 1, mainCourse), RecipeID: 5, State: plan.StatePlanned,
		From: &plan.Source{LeftoverID: 1, From: kc("2026-11-10", 1, sideCourse)}}}
	in, _ := plan.BuildInput(s)
	if want := pkc("2026-11-10", 1, sideCourse); in.Leftovers[0].FromSlot != want {
		t.Errorf("Leftover.FromSlot = %+v, want %+v", in.Leftovers[0].FromSlot, want)
	}
	e := slotByKey(t, in, pkc("2026-11-11", 1, mainCourse)).Existing
	if e == nil || e.From == nil || e.From.FromSlot != pkc("2026-11-10", 1, sideCourse) {
		t.Errorf("Existing.From = %+v", e)
	}
}

func TestBuildInputRecipesKeepTheirCoursesAndWholeMeal(t *testing.T) {
	s := baseSnapshot()
	s.Recipes = []planner.Recipe{{ID: 1, Yield: 2, CourseIDs: []int64{mainCourse, sideCourse}, WholeMeal: true}}
	in, _ := plan.BuildInput(s)
	if got := in.Recipes[0]; !reflect.DeepEqual(got.CourseIDs, []int64{mainCourse, sideCourse}) || !got.WholeMeal {
		t.Errorf("Recipe = %+v", got)
	}
}

func TestReconcileKeepsTheCourseOnEveryRow(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{dinnerWithCourses("2026-11-10")}
	s.Meals = []plan.Meal{{ID: 9, Key: kc("2026-11-10", 1, sideCourse), RecipeID: 3, Batches: 1, State: plan.StatePlanned}}
	res := planner.Result{
		Placements: []planner.Placement{
			{Key: pkc("2026-11-10", 1, mainCourse), Source: planner.SourceRecipe, RecipeID: 1, Batches: 1, Portions: 2, Relaxed: true,
				Why: []planner.Why{{Code: planner.ReasonCooldownRelaxed, Date: "2026-11-08", RecipeID: 1}}},
			{Key: pkc("2026-11-10", 1, dessertCourse), Source: planner.SourceLeftover, RecipeID: 4, Portions: 2,
				From: &planner.LeftoverSource{LeftoverID: 3, FromSlot: pkc("2026-11-08", 1, sideCourse)}},
		},
		Unfilled: nil,
	}
	got := plan.Reconcile(s, res)
	wantUpserts := []plan.Meal{
		{Key: kc("2026-11-10", 1, mainCourse), RecipeID: 1, Batches: 1, Portions: 2, State: plan.StatePlanned, Relaxed: true,
			Why: []plan.Why{{Code: "cooldown_relaxed", Date: "2026-11-08", RecipeID: 1}}},
		{Key: kc("2026-11-10", 1, dessertCourse), RecipeID: 4, Portions: 2, State: plan.StatePlanned,
			From: &plan.Source{LeftoverID: 3, From: kc("2026-11-08", 1, sideCourse)}},
	}
	if !reflect.DeepEqual(got.Upserts, wantUpserts) {
		t.Errorf("Upserts =\n%+v\nwant\n%+v", got.Upserts, wantUpserts)
	}
	// The stored side meal is not kept and not re-placed (covered or no longer served): deleted, found by its cell.
	if want := []plan.Key{kc("2026-11-10", 1, sideCourse)}; !reflect.DeepEqual(got.Deletes, want) {
		t.Errorf("Deletes = %v, want %v", got.Deletes, want)
	}
}

func TestReconcileUnfilledAndClearAreKeyedByCell(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{dinnerWithCourses("2026-11-10"), slotInfo("2026-11-11", 1, "19:00", 1)}
	res := planner.Result{
		Unfilled: []planner.Unfilled{
			{Key: pkc("2026-11-10", 1, mainCourse), Reason: planner.UnfilledNoCourseRecipes},
			{Key: pk("2026-11-11", 1), Reason: planner.UnfilledNoAttendance},
		},
		NotServed: []planner.NotServed{{Key: pkc("2026-11-10", 1, sideCourse), Cause: planner.NotServedOptional}},
	}
	got := plan.Reconcile(s, res)
	wantUnfilled := []plan.Unfilled{
		{Key: kc("2026-11-10", 1, mainCourse), Reason: "no_course_recipes"},
		{Key: k("2026-11-11", 1), Reason: "no_attendance"},
	}
	if !reflect.DeepEqual(got.Unfilled, wantUnfilled) {
		t.Errorf("Unfilled = %+v, want %+v", got.Unfilled, wantUnfilled)
	}
	// Every cell that is not Unfilled has no reason: covered and not-served cells included.
	wantClear := []plan.Key{kc("2026-11-10", 1, sideCourse), kc("2026-11-10", 1, dessertCourse)}
	if !reflect.DeepEqual(got.ClearUnfilled, wantClear) {
		t.Errorf("ClearUnfilled = %v, want %v", got.ClearUnfilled, wantClear)
	}
}

func TestReconcileStoresTheKeepCheckOfKeptMeals(t *testing.T) {
	stored := func(relaxed bool, why ...plan.Why) plan.Meal {
		return plan.Meal{ID: 4, Key: kc("2026-11-10", 1, mainCourse), RecipeID: 1, Batches: 1, Portions: 2, State: plan.StatePlanned, Relaxed: relaxed, Why: why}
	}
	fav := plan.Why{Code: "favourite", Value: 2, MemberIDs: []int64{1}}
	oldChip := plan.Why{Code: "cooldown_relaxed", Date: "2026-11-01", RecipeID: 1}
	newChip := &planner.Why{Code: planner.ReasonCooldownRelaxed, Date: "2026-11-08", RecipeID: 1}
	tests := []struct {
		name    string
		meal    plan.Meal
		recheck planner.Recheck
		want    []plan.Meal // upserts
	}{
		{
			name: "a strict meal that now breaks a rule becomes relaxed, its chips kept, the relaxed chip last",
			meal: stored(false, fav), recheck: planner.Recheck{Key: pkc("2026-11-10", 1, mainCourse), Relaxed: true, Why: newChip},
			want: []plan.Meal{stored(true, fav, plan.Why{Code: "cooldown_relaxed", Date: "2026-11-08", RecipeID: 1})},
		},
		{
			name: "a relaxed chip is recomputed",
			meal: stored(true, fav, oldChip), recheck: planner.Recheck{Key: pkc("2026-11-10", 1, mainCourse), Relaxed: true, Why: newChip},
			want: []plan.Meal{stored(true, fav, plan.Why{Code: "cooldown_relaxed", Date: "2026-11-08", RecipeID: 1})},
		},
		{
			name: "a relaxed meal that keeps every rule now loses the flag and the chip",
			meal: stored(true, fav, oldChip), recheck: planner.Recheck{Key: pkc("2026-11-10", 1, mainCourse), Relaxed: false},
			want: []plan.Meal{stored(false, fav)},
		},
		{
			name:    "nothing changed: no row is written",
			meal:    stored(true, fav, plan.Why{Code: "cooldown_relaxed", Date: "2026-11-08", RecipeID: 1}),
			recheck: planner.Recheck{Key: pkc("2026-11-10", 1, mainCourse), Relaxed: true, Why: newChip},
			want:    nil,
		},
		{
			name: "a strict meal that stays strict: no row is written",
			meal: stored(false, fav), recheck: planner.Recheck{Key: pkc("2026-11-10", 1, mainCourse)},
			want: nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := baseSnapshot()
			s.Slots = []plan.SlotInfo{dinnerWithCourses("2026-11-10")}
			s.Meals = []plan.Meal{tt.meal}
			got := plan.Reconcile(s, planner.Result{Kept: []planner.SlotKey{tt.recheck.Key}, Rechecks: []planner.Recheck{tt.recheck}})
			if !reflect.DeepEqual(got.Upserts, tt.want) {
				t.Errorf("Upserts =\n%+v\nwant\n%+v", got.Upserts, tt.want)
			}
			if len(got.Deletes) != 0 {
				t.Errorf("Deletes = %v", got.Deletes)
			}
		})
	}
}

func TestWhyConversionCarriesTheRelaxedChips(t *testing.T) {
	got := plan.WhyFrom(planner.Why{Code: planner.ReasonVarietyRelaxed, Tag: "fish", Value: 3})
	if want := (plan.Why{Code: "variety_relaxed", Tag: "fish", Value: 3}); !reflect.DeepEqual(got, want) {
		t.Errorf("WhyFrom = %+v, want %+v", got, want)
	}
}
