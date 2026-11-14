package store_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-04 (SAFE-02, ADR 0021): Remove Member and Remove Meal Slot keep what Undo and the history need.
// Today is 2026-11-09, a Monday, 12:00 UTC (testkit.StartTime). Red until the store has the removals.

type rfx struct {
	t      *testing.T
	d      *sql.DB
	st     *store.Store
	clk    *clock.Fake
	images *fakeImages
	ctx    context.Context
	main   int64
	recipe int64
}

type fakeImages struct{ deleted []string }

func (f *fakeImages) Delete(_ context.Context, id string) error {
	f.deleted = append(f.deleted, id)
	return nil
}

func newRfx(t *testing.T) *rfx {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(testkit.StartTime)
	im := &fakeImages{}
	r := &rfx{t: t, d: d, clk: clk, images: im, ctx: context.Background(), st: store.New(d, clk).WithImages(im)}
	if err := d.QueryRow(`SELECT id FROM courses WHERE is_main = 1`).Scan(&r.main); err != nil {
		t.Fatal(err)
	}
	r.exec(`INSERT INTO recipes (name, yield, created_at, updated_at) VALUES ('Pasta', 2, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`)
	if err := d.QueryRow(`SELECT id FROM recipes WHERE name = 'Pasta'`).Scan(&r.recipe); err != nil {
		t.Fatal(err)
	}
	return r
}

func (r *rfx) exec(q string, args ...any) {
	r.t.Helper()
	if _, err := r.d.Exec(q, args...); err != nil {
		r.t.Fatalf("%s: %v", q, err)
	}
}

func (r *rfx) count(q string, args ...any) int {
	r.t.Helper()
	var n int
	if err := r.d.QueryRow(q, args...).Scan(&n); err != nil {
		r.t.Fatalf("%s: %v", q, err)
	}
	return n
}

func (r *rfx) member(name string, factor float64) household.Member {
	r.t.Helper()
	m, err := r.st.CreateMember(r.ctx, household.MemberInput{Name: name, Colour: "#3366cc", PortionFactor: factor})
	if err != nil {
		r.t.Fatal(err)
	}
	return m
}

func (r *rfx) slot(weekday int, name, at string, att ...household.Attendee) household.MealSlot {
	r.t.Helper()
	if att == nil {
		att = []household.Attendee{}
	}
	s, err := r.st.CreateSlot(r.ctx, household.MealSlotInput{Weekday: weekday, Name: name, Time: at, Attendance: att})
	if err != nil {
		r.t.Fatal(err)
	}
	return s
}

// meal writes a Planned Meal on the slot (state planned, cooked or skipped).
func (r *rfx) meal(slot int64, date, state string, pinned bool) {
	r.t.Helper()
	p := 0
	if pinned {
		p = 1
	}
	r.exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, created_at, updated_at)
		VALUES (?, ?, ?, ?, 1, 2, ?, ?, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`, date, slot, r.main, r.recipe, state, p)
}

func (r *rfx) mealsOf(slot int64) int {
	return r.count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ?`, slot)
}

func slotIDs(ss []household.MealSlot) []int64 {
	out := []int64{}
	for _, s := range ss {
		out = append(out, s.ID)
	}
	return out
}

// ---- Remove Meal Slot ----

func TestRemoveSlotKeepsResolvedMealsAndDeletesTheUnresolvedOnes(t *testing.T) {
	r := newRfx(t)
	anna := r.member("Anna", 1)
	dinner := r.slot(1, "Dinner", "19:00", household.Attendee{MemberID: anna.ID})
	other := r.slot(2, "Dinner", "19:00")
	r.meal(dinner.ID, "2026-11-02", "cooked", false)
	r.meal(dinner.ID, "2026-10-26", "skipped", false)
	r.meal(dinner.ID, "2026-11-07", "planned", false) // To confirm: before today, never marked
	r.meal(dinner.ID, "2026-11-09", "planned", true)  // today, Pinned
	r.meal(dinner.ID, "2026-11-16", "planned", false)
	r.meal(other.ID, "2026-11-10", "planned", false)
	r.exec(`INSERT INTO plan_unfilled (date, meal_slot_id, course_id, reason) VALUES ('2026-11-23', ?, ?, 'no_candidates')`, dinner.ID, r.main)
	r.exec(`INSERT INTO slot_rules (meal_slot_id, course_id, recipe_id) VALUES (?, ?, ?)`, dinner.ID, r.main, r.recipe)
	r.exec(`INSERT INTO meal_slot_dates (slot_id, date, guests, updated_at) VALUES (?, '2026-11-16', 2, '2026-11-01T00:00:00Z')`, dinner.ID)
	if err := r.st.SetDateAttendance(r.ctx, dinner.ID, "2026-11-23", nil); err != nil {
		t.Fatal(err)
	}

	if err := r.st.RemoveSlot(r.ctx, dinner.ID); err != nil {
		t.Fatalf("RemoveSlot: %v", err)
	}

	if got := r.count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND state IN ('cooked','skipped')`, dinner.ID); got != 2 {
		t.Errorf("%d resolved meals kept, want the Cooked and the Not cooked one", got)
	}
	if got := r.count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND state = 'planned'`, dinner.ID); got != 0 {
		t.Errorf("%d unresolved meals remain, want none (nothing of a removed Meal Slot stays in To confirm)", got)
	}
	if got := r.count(`SELECT count(*) FROM plan_unfilled WHERE meal_slot_id = ?`, dinner.ID); got != 0 {
		t.Errorf("%d plan_unfilled rows remain, want none", got)
	}
	if got := r.mealsOf(other.ID); got != 1 {
		t.Errorf("the other Dinner has %d meals, want its 1 untouched", got)
	}
	// Kept for the history and for Undo.
	for q, what := range map[string]string{
		`SELECT count(*) FROM slot_rules WHERE meal_slot_id = ?`:        "Slot Rules",
		`SELECT count(*) FROM meal_slot_attendees WHERE slot_id = ?`:    "usual Attendance",
		`SELECT count(*) FROM meal_slot_courses WHERE meal_slot_id = ?`: "Courses",
		`SELECT count(*) FROM meal_slot_dates WHERE slot_id = ?`:        "date changes",
		`SELECT count(*) FROM attendance_overrides WHERE slot_id = ?`:   "date Attendance",
	} {
		if r.count(q, dinner.ID) != 1 {
			t.Errorf("the removed Meal Slot lost its %s", what)
		}
	}
}

func TestRemovedSlotsLeaveSlotsButStayReadableByID(t *testing.T) {
	r := newRfx(t)
	dinner := r.slot(1, "Dinner", "19:00")
	lunch := r.slot(1, "Lunch", "12:30")
	if err := r.st.RemoveSlot(r.ctx, dinner.ID); err != nil {
		t.Fatalf("RemoveSlot: %v", err)
	}
	active, err := r.st.Slots(r.ctx)
	if err != nil || !reflect.DeepEqual(slotIDs(active), []int64{lunch.ID}) {
		t.Errorf("Slots = %v, %v; want only the active Lunch", slotIDs(active), err)
	}
	all, err := r.st.AllSlots(r.ctx)
	if err != nil || len(all) != 2 {
		t.Fatalf("AllSlots = %v, %v; want both", slotIDs(all), err)
	}
	for _, s := range all {
		if s.Removed != (s.ID == dinner.ID) {
			t.Errorf("AllSlots: %s Removed = %v", s.Name, s.Removed)
		}
	}
	got, err := r.st.Slot(r.ctx, dinner.ID)
	if err != nil || !got.Removed || got.Name != "Dinner" || got.RemovedAt == "" {
		t.Errorf("Slot(removed) = %+v, %v; want it returned with Removed true, its name and RemovedAt", got, err)
	}
	if len(got.Courses) == 0 {
		t.Errorf("Slot(removed) lost its Courses: %+v", got)
	}
	if err := r.st.RemoveSlot(r.ctx, dinner.ID); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("removing a removed Meal Slot = %v, want ErrNotFound", err)
	}
	if err := r.st.RemoveSlot(r.ctx, 9999); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("removing an unknown Meal Slot = %v, want ErrNotFound", err)
	}
}

func TestARemovedMealSlotNameCanBeUsedAgain(t *testing.T) {
	r := newRfx(t)
	old := r.slot(1, "Dinner", "19:00")
	if _, err := r.st.CreateSlot(r.ctx, household.MealSlotInput{Weekday: 1, Name: "dinner", Time: "20:00", Attendance: []household.Attendee{}}); !errors.Is(err, household.ErrDuplicateSlot) {
		t.Fatalf("a second active Dinner = %v, want ErrDuplicateSlot", err)
	}
	if err := r.st.RemoveSlot(r.ctx, old.ID); err != nil {
		t.Fatalf("RemoveSlot: %v", err)
	}
	fresh, err := r.st.CreateSlot(r.ctx, household.MealSlotInput{Weekday: 1, Name: "Dinner", Time: "20:00", Attendance: []household.Attendee{}})
	if err != nil || fresh.ID == old.ID {
		t.Fatalf("a new Dinner on Monday after the removal = %+v, %v; want it created with a new id", fresh, err)
	}
	if _, err := r.st.CreateSlot(r.ctx, household.MealSlotInput{Weekday: 1, Name: "Dinner", Time: "21:00", Attendance: []household.Attendee{}}); !errors.Is(err, household.ErrDuplicateSlot) {
		t.Errorf("a third Dinner while one is active = %v, want ErrDuplicateSlot", err)
	}
	// Renaming a slot onto the removed one's name is fine too.
	other := r.slot(1, "Supper", "21:00")
	if _, err := r.st.UpdateSlot(r.ctx, other.ID, household.MealSlotInput{Weekday: 1, Name: "Supper", Time: "21:30", Attendance: []household.Attendee{}}); err != nil {
		t.Errorf("UpdateSlot of an active slot = %v", err)
	}
}

func TestAMealSlotThatWasRemovedRefusesEveryWrite(t *testing.T) {
	r := newRfx(t)
	anna := r.member("Anna", 1)
	dinner := r.slot(1, "Dinner", "19:00", household.Attendee{MemberID: anna.ID})
	if err := r.st.RemoveSlot(r.ctx, dinner.ID); err != nil {
		t.Fatalf("RemoveSlot: %v", err)
	}
	if _, err := r.st.UpdateSlot(r.ctx, dinner.ID, household.MealSlotInput{Weekday: 1, Name: "Dinner", Time: "20:00", Attendance: []household.Attendee{}}); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("UpdateSlot = %v, want ErrNotFound", err)
	}
	if err := r.st.SaveSlotDate(r.ctx, household.SlotDate{SlotID: dinner.ID, Date: "2026-11-16", Guests: 1}); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("SaveSlotDate = %v, want ErrNotFound (a removed slot is refused)", err)
	}
	if err := r.st.SetDateAttendance(r.ctx, dinner.ID, "2026-11-16", []household.Attendee{{MemberID: anna.ID}}); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("SetDateAttendance = %v, want ErrNotFound", err)
	}
	if err := r.st.SetDateCourseOptOuts(r.ctx, dinner.ID, "2026-11-16", r.main, &[]int64{anna.ID}); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("SetDateCourseOptOuts = %v, want ErrNotFound", err)
	}
}

func TestANewMemberDoesNotJoinARemovedMealSlot(t *testing.T) {
	r := newRfx(t)
	dinner := r.slot(1, "Dinner", "19:00")
	if err := r.st.RemoveSlot(r.ctx, dinner.ID); err != nil {
		t.Fatalf("RemoveSlot: %v", err)
	}
	r.member("Sam", 1)
	if n := r.count(`SELECT count(*) FROM meal_slot_attendees WHERE slot_id = ?`, dinner.ID); n != 0 {
		t.Errorf("a Member who joined after the removal attends the removed Meal Slot (%d rows)", n)
	}
}

// ---- Restore Meal Slot ----

func TestRestoreSlotBringsItBackWithItsToConfirmRowsWithinTenMinutes(t *testing.T) {
	r := newRfx(t)
	dinner := r.slot(1, "Dinner", "19:00")
	r.meal(dinner.ID, "2026-11-07", "planned", true) // To confirm
	r.meal(dinner.ID, "2026-11-02", "cooked", false)
	r.meal(dinner.ID, "2026-11-16", "planned", false)
	if err := r.st.RemoveSlot(r.ctx, dinner.ID); err != nil {
		t.Fatalf("RemoveSlot: %v", err)
	}
	r.clk.Advance(9 * time.Minute)
	got, err := r.st.RestoreSlot(r.ctx, dinner.ID)
	if err != nil || got.Removed || got.ID != dinner.ID || got.Name != "Dinner" {
		t.Fatalf("RestoreSlot = %+v, %v; want the active Dinner with the same id", got, err)
	}
	active, _ := r.st.Slots(r.ctx)
	if !reflect.DeepEqual(slotIDs(active), []int64{dinner.ID}) {
		t.Errorf("Slots after restore = %v", slotIDs(active))
	}
	var recipe, course, pinned int64
	err = r.d.QueryRow(`SELECT recipe_id, course_id, pinned FROM planned_meals WHERE meal_slot_id = ? AND date = '2026-11-07' AND state = 'planned'`, dinner.ID).Scan(&recipe, &course, &pinned)
	if err != nil || recipe != r.recipe || course != r.main || pinned != 1 {
		t.Errorf("the To confirm row came back as %d/%d/%d, %v; want the same Recipe, Course and Pin", recipe, course, pinned, err)
	}
	if n := r.count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND state = 'cooked'`, dinner.ID); n != 1 {
		t.Errorf("%d Cooked meals after restore, want the 1 kept (never duplicated)", n)
	}
}

// Today's meal whose slot time has passed waits in To confirm too, and the replan cannot plan it again (it is in the
// past): removal keeps it for Undo, and the impact lists it under To confirm, not under the Planned Meals from today.
// The clock is Mon 9 Nov 12:00 UTC: Breakfast 08:00 has passed, Dinner 19:00 has not, Lunch moved to 13:00 today has not.
func TestTodaysPassedMealCountsAsToConfirmAndComesBackWithUndo(t *testing.T) {
	r := newRfx(t)
	breakfast := r.slot(1, "Breakfast", "08:00")
	lunch := r.slot(1, "Lunch", "11:00")
	r.meal(breakfast.ID, "2026-11-09", "planned", false)
	r.meal(lunch.ID, "2026-11-09", "planned", false)
	r.exec(`INSERT INTO meal_slot_dates (slot_id, date, time, updated_at) VALUES (?, '2026-11-09', '13:00', '2026-11-01T00:00:00Z')`, lunch.ID)

	im, err := r.st.SlotImpact(r.ctx, breakfast.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(im.ToConfirm) != 1 || len(im.PlannedMeals) != 0 {
		t.Errorf("Breakfast impact = %d To confirm, %d Planned Meals; want today's passed Breakfast under To confirm", len(im.ToConfirm), len(im.PlannedMeals))
	}
	if im, err = r.st.SlotImpact(r.ctx, lunch.ID); err != nil || len(im.ToConfirm) != 0 || len(im.PlannedMeals) != 1 {
		t.Errorf("Lunch moved to 13:00 today = %+v, %v; want it under the Planned Meals from today", im, err)
	}

	if err := r.st.RemoveSlot(r.ctx, breakfast.ID); err != nil {
		t.Fatal(err)
	}
	r.clk.Advance(5 * time.Minute)
	if _, err := r.st.RestoreSlot(r.ctx, breakfast.ID); err != nil {
		t.Fatal(err)
	}
	if n := r.count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND date = '2026-11-09' AND state = 'planned'`, breakfast.ID); n != 1 {
		t.Errorf("today's passed Breakfast came back %d times, want once (Undo puts To confirm back)", n)
	}
}

func TestRestoreSlotAfterTenMinutesBringsBackTheSlotButNotItsToConfirmRows(t *testing.T) {
	r := newRfx(t)
	dinner := r.slot(1, "Dinner", "19:00")
	r.meal(dinner.ID, "2026-11-07", "planned", false)
	if err := r.st.RemoveSlot(r.ctx, dinner.ID); err != nil {
		t.Fatalf("RemoveSlot: %v", err)
	}
	r.clk.Advance(11 * time.Minute)
	got, err := r.st.RestoreSlot(r.ctx, dinner.ID)
	if err != nil || got.Removed {
		t.Fatalf("RestoreSlot after 11 minutes = %+v, %v; want the slot back (the Admin can always Put back)", got, err)
	}
	if n := r.count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND state = 'planned'`, dinner.ID); n != 0 {
		t.Errorf("%d To confirm rows came back after the 10 minutes, want none", n)
	}
}

func TestRestoreSlotIsRefusedWhenTheNameIsTakenAndDoesNothing(t *testing.T) {
	r := newRfx(t)
	old := r.slot(1, "Dinner", "19:00")
	r.meal(old.ID, "2026-11-07", "planned", false)
	if err := r.st.RemoveSlot(r.ctx, old.ID); err != nil {
		t.Fatalf("RemoveSlot: %v", err)
	}
	fresh := r.slot(1, "Dinner", "20:00")
	if _, err := r.st.RestoreSlot(r.ctx, old.ID); !errors.Is(err, household.ErrSlotNameTaken) {
		t.Fatalf("RestoreSlot = %v, want ErrSlotNameTaken", err)
	}
	if got, _ := r.st.Slot(r.ctx, old.ID); !got.Removed {
		t.Error("a refused restore must leave the Meal Slot removed")
	}
	if n := r.mealsOf(old.ID); n != 0 {
		t.Errorf("a refused restore put %d rows back", n)
	}
	if active, _ := r.st.Slots(r.ctx); !reflect.DeepEqual(slotIDs(active), []int64{fresh.ID}) {
		t.Errorf("Slots = %v, want only the new Dinner", slotIDs(active))
	}
	// The name is free once the new one goes: restore then works.
	if err := r.st.RemoveSlot(r.ctx, fresh.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.st.RestoreSlot(r.ctx, old.ID); err != nil {
		t.Errorf("RestoreSlot once the name is free = %v", err)
	}
}

func TestRestoreSlotOfASlotThatIsNotRemovedIsNotFound(t *testing.T) {
	r := newRfx(t)
	dinner := r.slot(1, "Dinner", "19:00")
	if _, err := r.st.RestoreSlot(r.ctx, dinner.ID); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("restore of an active slot = %v, want ErrNotFound", err)
	}
	if _, err := r.st.RestoreSlot(r.ctx, 9999); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("restore of an unknown slot = %v, want ErrNotFound", err)
	}
	if err := r.st.RemoveSlot(r.ctx, dinner.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.st.RestoreSlot(r.ctx, dinner.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.st.RestoreSlot(r.ctx, dinner.ID); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("a second restore = %v, want ErrNotFound (idempotent: nothing is put back twice)", err)
	}
	if n := r.count(`SELECT count(*) FROM meal_slot_courses WHERE meal_slot_id = ?`, dinner.ID); n != 1 {
		t.Errorf("%d Course rows after the restores, want 1", n)
	}
}

func TestRemoveRestoreRemoveKeepsTheHistoryIntact(t *testing.T) {
	r := newRfx(t)
	dinner := r.slot(1, "Dinner", "19:00")
	r.meal(dinner.ID, "2026-11-02", "cooked", false)
	for i := 0; i < 3; i++ {
		if err := r.st.RemoveSlot(r.ctx, dinner.ID); err != nil {
			t.Fatalf("round %d RemoveSlot: %v", i, err)
		}
		if _, err := r.st.RestoreSlot(r.ctx, dinner.ID); err != nil {
			t.Fatalf("round %d RestoreSlot: %v", i, err)
		}
	}
	if n := r.count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND state = 'cooked'`, dinner.ID); n != 1 {
		t.Errorf("%d Cooked meals, want 1", n)
	}
}

// ---- impact and the Removed Meal Slots read ----

func TestSlotImpactNamesWhatGoesAndWhatStays(t *testing.T) {
	r := newRfx(t)
	dinner := r.slot(1, "Dinner", "19:00")
	r.meal(dinner.ID, "2026-11-09", "planned", true)
	r.meal(dinner.ID, "2026-11-16", "planned", false)
	r.meal(dinner.ID, "2026-11-07", "planned", false) // To confirm
	r.meal(dinner.ID, "2026-11-02", "cooked", false)
	r.meal(dinner.ID, "2026-10-26", "skipped", false)
	r.exec(`INSERT INTO slot_rules (meal_slot_id, course_id, recipe_id) VALUES (?, ?, ?)`, dinner.ID, r.main, r.recipe)

	got, err := r.st.SlotImpact(r.ctx, dinner.ID)
	if err != nil {
		t.Fatalf("SlotImpact: %v", err)
	}
	var dates []string
	for _, m := range got.PlannedMeals {
		dates = append(dates, m.Date)
	}
	if !reflect.DeepEqual(dates, []string{"2026-11-09", "2026-11-16"}) {
		t.Errorf("PlannedMeals = %v, want today and next Monday (from today, Pinned included)", dates)
	}
	if !got.PlannedMeals[0].Pinned || got.PlannedMeals[0].RecipeID != r.recipe || got.PlannedMeals[0].CourseID != r.main || got.PlannedMeals[0].MealSlotID != dinner.ID {
		t.Errorf("PlannedMeals[0] = %+v", got.PlannedMeals[0])
	}
	if len(got.SlotRules) != 1 || got.SlotRules[0].RecipeID != r.recipe {
		t.Errorf("SlotRules = %+v, want the one Dinner = Pasta rule", got.SlotRules)
	}
	if len(got.ToConfirm) != 1 || got.ToConfirm[0].Date != "2026-11-07" {
		t.Errorf("ToConfirm = %+v, want the one meal from 7 Nov", got.ToConfirm)
	}
	if got.CookedKept != 2 {
		t.Errorf("CookedKept = %d, want 2 (Cooked and Not cooked)", got.CookedKept)
	}
	if n := r.mealsOf(dinner.ID); n != 5 {
		t.Errorf("SlotImpact is read-only: %d meals left, want 5", n)
	}
}

func TestSlotImpactOfARemovedOrUnknownSlotIsNotFound(t *testing.T) {
	r := newRfx(t)
	dinner := r.slot(1, "Dinner", "19:00")
	if _, err := r.st.SlotImpact(r.ctx, 9999); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("unknown = %v", err)
	}
	if err := r.st.RemoveSlot(r.ctx, dinner.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.st.SlotImpact(r.ctx, dinner.ID); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("removed = %v", err)
	}
}

func TestRemovedSlotsListsOnlyThoseWithHistoryGroupedByNameAndRemovalNewestFirst(t *testing.T) {
	r := newRfx(t)
	snackMon := r.slot(1, "Snack", "16:30")
	snackTue := r.slot(2, "Snack", "16:30")
	brunch := r.slot(6, "Brunch", "10:30")
	empty := r.slot(7, "Tea", "16:00")
	cooked := r.slot(3, "Late", "22:00") // a Late slot with only Not cooked meals
	r.meal(snackMon.ID, "2026-11-02", "cooked", false)
	r.meal(snackMon.ID, "2026-10-26", "cooked", false)
	r.meal(snackTue.ID, "2026-11-03", "cooked", false)
	r.meal(snackTue.ID, "2026-10-27", "skipped", false)
	r.meal(brunch.ID, "2026-11-07", "cooked", false)
	r.meal(cooked.ID, "2026-11-04", "skipped", false)
	r.meal(empty.ID, "2026-11-08", "planned", false) // unresolved only: no history

	if err := r.st.RemoveSlot(r.ctx, snackMon.ID); err != nil {
		t.Fatal(err)
	}
	r.clk.Advance(3 * time.Second) // removed one call at a time, a few seconds apart: still one row
	if err := r.st.RemoveSlot(r.ctx, snackTue.ID); err != nil {
		t.Fatal(err)
	}
	if err := r.st.RemoveSlot(r.ctx, empty.ID); err != nil {
		t.Fatal(err)
	}
	r.clk.Advance(2 * time.Hour)
	if err := r.st.RemoveSlot(r.ctx, brunch.ID); err != nil {
		t.Fatal(err)
	}
	if err := r.st.RemoveSlot(r.ctx, cooked.ID); err != nil {
		t.Fatal(err)
	}

	got, err := r.st.RemovedSlots(r.ctx)
	if err != nil {
		t.Fatalf("RemovedSlots: %v", err)
	}
	type row struct {
		name      string
		weekdays  []int
		cooked    int
		notCooked int
	}
	var rows []row
	for _, g := range got {
		rows = append(rows, row{g.Name, g.Weekdays, g.Cooked, g.NotCooked})
	}
	// Newest removal first; within the same instant by name. Tea has no Cooked or Not cooked meal, so it is not listed.
	want := []row{{"Brunch", []int{6}, 1, 0}, {"Late", []int{3}, 0, 1}, {"Snack", []int{1, 2}, 3, 1}}
	if !reflect.DeepEqual(rows, want) {
		t.Fatalf("RemovedSlots = %+v, want %+v", rows, want)
	}
	snack := got[2]
	if !reflect.DeepEqual(snack.IDs, []int64{snackMon.ID, snackTue.ID}) || snack.Time != "16:30" || snack.RemovedAt == "" {
		t.Errorf("Snack row = %+v, want ids in weekday order, time 16:30 and RemovedAt", snack)
	}
	// Putting one back drops its row.
	if _, err := r.st.RestoreSlot(r.ctx, brunch.ID); err != nil {
		t.Fatal(err)
	}
	if got, _ = r.st.RemovedSlots(r.ctx); len(got) != 2 {
		t.Errorf("RemovedSlots after a restore = %d rows, want 2", len(got))
	}
}

// ---- Remove Member and restore ----

func TestRemoveMemberKeepsASnapshotAndRestoreGivesBackTheSameRows(t *testing.T) {
	r := newRfx(t)
	anna := r.member("Anna", 1)
	r.exec(`INSERT INTO users (email, display_name, is_admin, created_at) VALUES ('sam-login@example.test', 'Sam', 0, '2026-11-01T00:00:00Z')`)
	var uid int64
	if err := r.d.QueryRow(`SELECT id FROM users WHERE email = 'sam-login@example.test'`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	sam, err := r.st.CreateMember(r.ctx, household.MemberInput{Name: "Sam", Colour: "#e07a5f", Avatar: "🦊", PortionFactor: 0.5, Email: "sam@example.test", Photo: "0123456789abcdef0123456789abcdef"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := r.st.LinkUser(r.ctx, sam.ID, &uid); err != nil {
		t.Fatal(err)
	}
	half := 0.5
	dinner := r.slot(1, "Dinner", "19:00", household.Attendee{MemberID: anna.ID}, household.Attendee{MemberID: sam.ID, PortionFactorOverride: &half})
	if err := r.st.SetDateAttendance(r.ctx, dinner.ID, "2026-11-16", []household.Attendee{{MemberID: sam.ID}}); err != nil {
		t.Fatal(err)
	}
	if err := r.st.SetDateCourseOptOuts(r.ctx, dinner.ID, "2026-11-16", r.main, &[]int64{sam.ID}); err != nil {
		t.Fatal(err)
	}
	r.exec(`INSERT INTO meal_slot_course_opt_outs (meal_slot_id, course_id, member_id) VALUES (?, ?, ?)`, dinner.ID, r.main, sam.ID)
	r.exec(`INSERT INTO member_recipe_preferences (member_id, recipe_id, state) VALUES (?, ?, 'favourite')`, sam.ID, r.recipe)
	r.exec(`INSERT INTO ingredients (name, name_key, base_unit, created_at, updated_at) VALUES ('Peanut', 'peanut', 'g', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`)
	r.exec(`INSERT INTO member_ingredient_exclusions (member_id, ingredient_id) SELECT ?, id FROM ingredients WHERE name_key = 'peanut'`, sam.ID)

	if err := r.st.RemoveMember(r.ctx, sam.ID); err != nil {
		t.Fatalf("RemoveMember: %v", err)
	}
	if _, err := r.st.Member(r.ctx, sam.ID); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("Member after removal = %v, want ErrNotFound", err)
	}
	for _, q := range []string{
		`SELECT count(*) FROM meal_slot_attendees WHERE member_id = ?`,
		`SELECT count(*) FROM member_recipe_preferences WHERE member_id = ?`,
		`SELECT count(*) FROM member_ingredient_exclusions WHERE member_id = ?`,
		`SELECT count(*) FROM meal_slot_course_opt_outs WHERE member_id = ?`,
		`SELECT count(*) FROM attendance_override_attendees WHERE member_id = ?`,
		`SELECT count(*) FROM course_attendance_override_opt_outs WHERE member_id = ?`,
	} {
		if n := r.count(q, sam.ID); n != 0 {
			t.Errorf("%s = %d after removal, want 0", q, n)
		}
	}
	// The address is free while Sam is removed.
	if _, err := r.st.CreateMember(r.ctx, household.MemberInput{Name: "Samuel", Colour: "#000000", PortionFactor: 1, Email: "sam@example.test"}); err != nil {
		t.Fatalf("the removed Member's address is not free: %v", err)
	}
	if _, err := r.d.Exec(`DELETE FROM members WHERE name = 'Samuel'`); err != nil {
		t.Fatal(err)
	}

	r.clk.Advance(5 * time.Minute)
	back, err := r.st.RestoreMember(r.ctx, sam.ID)
	if err != nil {
		t.Fatalf("RestoreMember: %v", err)
	}
	if back.ID != sam.ID || back.Name != "Sam" || back.Colour != "#e07a5f" || back.Avatar != "🦊" || back.PortionFactor != 0.5 ||
		back.Email != "sam@example.test" || back.Photo != "0123456789abcdef0123456789abcdef" || back.UserID == nil || *back.UserID != uid {
		t.Errorf("restored Member = %+v, want the same id and every field, with the User link", back)
	}
	got, _ := r.st.Slot(r.ctx, dinner.ID)
	var sams []household.Attendee
	for _, a := range got.Attendance {
		if a.MemberID == sam.ID {
			sams = append(sams, a)
		}
	}
	if len(sams) != 1 || sams[0].PortionFactorOverride == nil || *sams[0].PortionFactorOverride != 0.5 {
		t.Errorf("Sam's usual Attendance after restore = %+v, want the row with the 0.5 override", sams)
	}
	if att, isOverride, _ := r.st.DateAttendance(r.ctx, dinner.ID, "2026-11-16"); !isOverride || len(att) != 1 || att[0].MemberID != sam.ID {
		t.Errorf("date Attendance after restore = %+v %v, want Sam's override back", att, isOverride)
	}
	for q, want := range map[string]int{
		`SELECT count(*) FROM member_recipe_preferences WHERE member_id = ?`:           1,
		`SELECT count(*) FROM member_ingredient_exclusions WHERE member_id = ?`:        1,
		`SELECT count(*) FROM meal_slot_course_opt_outs WHERE member_id = ?`:           1,
		`SELECT count(*) FROM course_attendance_override_opt_outs WHERE member_id = ?`: 1,
	} {
		if n := r.count(q, sam.ID); n != want {
			t.Errorf("%s = %d after restore, want %d", q, n, want)
		}
	}
	if len(r.images.deleted) != 0 {
		t.Errorf("the photo file was released (%v) although the Member was put back", r.images.deleted)
	}
}

func TestRemoveMemberDoesNotReleaseThePhotoUntilTheSnapshotExpires(t *testing.T) {
	r := newRfx(t)
	sam, err := r.st.CreateMember(r.ctx, household.MemberInput{Name: "Sam", Colour: "#e07a5f", PortionFactor: 1, Photo: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"})
	if err != nil {
		t.Fatal(err)
	}
	kept, err := r.st.CreateMember(r.ctx, household.MemberInput{Name: "Pia", Colour: "#e07a5f", PortionFactor: 1, Photo: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"})
	if err != nil {
		t.Fatal(err)
	}
	if err := r.st.RemoveMember(r.ctx, sam.ID); err != nil {
		t.Fatal(err)
	}
	if len(r.images.deleted) != 0 {
		t.Fatalf("RemoveMember released %v at once; the photo stays until the Undo window ends", r.images.deleted)
	}
	r.clk.Advance(9 * time.Minute)
	if n, err := r.st.ExpireMemberRemovals(r.ctx); err != nil || n != 0 || len(r.images.deleted) != 0 {
		t.Fatalf("ExpireMemberRemovals at 9 minutes = %d, %v, deleted %v; want nothing yet", n, err, r.images.deleted)
	}
	r.clk.Advance(2 * time.Minute)
	if n, err := r.st.ExpireMemberRemovals(r.ctx); err != nil || n != 1 {
		t.Fatalf("ExpireMemberRemovals at 11 minutes = %d, %v; want 1", n, err)
	}
	if !reflect.DeepEqual(r.images.deleted, []string{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}) {
		t.Errorf("released photos = %v, want only the removed Member's (not Pia's, who is still here: %s)", r.images.deleted, kept.Name)
	}
	if n, _ := r.st.ExpireMemberRemovals(r.ctx); n != 0 || len(r.images.deleted) != 1 {
		t.Errorf("a second sweep dropped %d and released %v; each snapshot goes once", n, r.images.deleted)
	}
	if _, err := r.st.RestoreMember(r.ctx, sam.ID); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("RestoreMember after the sweep = %v, want ErrNotFound", err)
	}
}

func TestRestoreMemberIsRefusedAfterTenMinutesAndTwiceAndForAnUnknownId(t *testing.T) {
	r := newRfx(t)
	sam := r.member("Sam", 1)
	if err := r.st.RemoveMember(r.ctx, sam.ID); err != nil {
		t.Fatal(err)
	}
	if err := r.st.RemoveMember(r.ctx, sam.ID); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("removing a removed Member = %v, want ErrNotFound", err)
	}
	r.clk.Advance(10*time.Minute + time.Second)
	if _, err := r.st.RestoreMember(r.ctx, sam.ID); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("RestoreMember after 10 minutes = %v, want ErrNotFound", err)
	}
	if _, err := r.st.RestoreMember(r.ctx, 9999); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("RestoreMember of an unknown id = %v, want ErrNotFound", err)
	}
	pia := r.member("Pia", 1)
	if err := r.st.RemoveMember(r.ctx, pia.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.st.RestoreMember(r.ctx, pia.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.st.RestoreMember(r.ctx, pia.ID); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("a second RestoreMember = %v, want ErrNotFound (idempotent)", err)
	}
	if n := r.count(`SELECT count(*) FROM members WHERE name = 'Pia'`); n != 1 {
		t.Errorf("%d Pias, want 1", n)
	}
}

func TestRestoreMemberIsRefusedWhenTheAddressWasTakenSince(t *testing.T) {
	r := newRfx(t)
	sam, err := r.st.CreateMember(r.ctx, household.MemberInput{Name: "Sam", Colour: "#e07a5f", PortionFactor: 1, Email: "sam@example.test"})
	if err != nil {
		t.Fatal(err)
	}
	if err := r.st.RemoveMember(r.ctx, sam.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.st.CreateMember(r.ctx, household.MemberInput{Name: "Other", Colour: "#000000", PortionFactor: 1, Email: "sam@example.test"}); err != nil {
		t.Fatal(err)
	}
	if _, err := r.st.RestoreMember(r.ctx, sam.ID); !errors.Is(err, household.ErrEmailTaken) {
		t.Errorf("RestoreMember = %v, want ErrEmailTaken", err)
	}
	if n := r.count(`SELECT count(*) FROM members WHERE name = 'Sam'`); n != 0 {
		t.Error("a refused restore must not bring Sam back")
	}
}

// Like checkEmail on create: an address that became a User's (the Allowlist) since the removal is refused, unless it is
// the address of the User the Member is linked to again.
func TestRestoreMemberIsRefusedWhenTheAddressWentOnTheAllowlistSince(t *testing.T) {
	r := newRfx(t)
	sam, err := r.st.CreateMember(r.ctx, household.MemberInput{Name: "Sam", Colour: "#e07a5f", PortionFactor: 1, Email: "sam@example.test"})
	if err != nil {
		t.Fatal(err)
	}
	if err := r.st.RemoveMember(r.ctx, sam.ID); err != nil {
		t.Fatal(err)
	}
	r.exec(`INSERT INTO users (email, display_name, created_at) VALUES ('Sam@Example.test', 'Sam', '2026-11-09T12:00:00Z')`)
	if _, err := r.st.RestoreMember(r.ctx, sam.ID); !errors.Is(err, household.ErrEmailTaken) {
		t.Errorf("RestoreMember = %v, want ErrEmailTaken (the address is a User's now)", err)
	}
	if n := r.count(`SELECT count(*) FROM members WHERE name = 'Sam'`); n != 0 {
		t.Error("a refused restore must not bring Sam back")
	}
	if n := r.count(`SELECT count(*) FROM member_removals WHERE member_id = ?`, sam.ID); n != 1 {
		t.Error("a refused restore keeps the snapshot")
	}
}

func TestRestoreMemberKeepsTheAddressOfTheUserItIsLinkedToAgain(t *testing.T) {
	r := newRfx(t)
	r.exec(`INSERT INTO users (email, display_name, created_at) VALUES ('sam@example.test', 'Sam', '2026-11-09T12:00:00Z')`)
	var uid int64
	if err := r.d.QueryRow(`SELECT id FROM users WHERE email = 'sam@example.test'`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	sam, err := r.st.CreateMember(r.ctx, household.MemberInput{Name: "Sam", Colour: "#e07a5f", PortionFactor: 1, Email: "sam@example.test"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := r.st.LinkUser(r.ctx, sam.ID, &uid); err != nil {
		t.Fatal(err)
	}
	if err := r.st.RemoveMember(r.ctx, sam.ID); err != nil {
		t.Fatal(err)
	}
	back, err := r.st.RestoreMember(r.ctx, sam.ID)
	if err != nil {
		t.Fatalf("RestoreMember: %v", err)
	}
	if back.UserID == nil || *back.UserID != uid || back.Email != "sam@example.test" {
		t.Errorf("restored Sam = %+v, want the link to User %d and the address back", back, uid)
	}
}

func TestRestoreMemberWorksWhenAMealSlotWasRemovedInTheMeantime(t *testing.T) {
	r := newRfx(t)
	sam := r.member("Sam", 1)
	lunch := r.slot(1, "Lunch", "12:30", household.Attendee{MemberID: sam.ID})
	dinner := r.slot(1, "Dinner", "19:00", household.Attendee{MemberID: sam.ID})
	if err := r.st.RemoveMember(r.ctx, sam.ID); err != nil {
		t.Fatal(err)
	}
	if err := r.st.RemoveSlot(r.ctx, lunch.ID); err != nil { // Lunch is removed meanwhile; it stays removed
		t.Fatal(err)
	}
	if _, err := r.st.RestoreMember(r.ctx, sam.ID); err != nil {
		t.Fatalf("RestoreMember: %v", err)
	}
	if n := r.count(`SELECT count(*) FROM meal_slot_attendees WHERE member_id = ? AND slot_id = ?`, sam.ID, dinner.ID); n != 1 {
		t.Errorf("Sam attends %d Dinners after restore, want 1", n)
	}
	if bad := r.count(`SELECT count(*) FROM pragma_foreign_key_check`); bad != 0 {
		t.Errorf("foreign_key_check reports %d violations after the restore", bad)
	}
}

func TestMemberImpactCountsWhatGoesWithTheMember(t *testing.T) {
	r := newRfx(t)
	anna := r.member("Anna", 1)
	sam, err := r.st.CreateMember(r.ctx, household.MemberInput{Name: "Sam", Colour: "#e07a5f", PortionFactor: 1, Email: "sam@example.test"})
	if err != nil {
		t.Fatal(err)
	}
	dinner := r.slot(1, "Dinner", "19:00", household.Attendee{MemberID: sam.ID}, household.Attendee{MemberID: anna.ID})
	r.slot(2, "Dinner", "19:00", household.Attendee{MemberID: sam.ID})
	r.slot(3, "Dinner", "19:00", household.Attendee{MemberID: anna.ID})
	gone := r.slot(4, "Dinner", "19:00", household.Attendee{MemberID: sam.ID})
	if err := r.st.RemoveSlot(r.ctx, gone.ID); err != nil { // a removed Meal Slot does not count
		t.Fatal(err)
	}
	r.exec(`INSERT INTO member_recipe_preferences (member_id, recipe_id, state) VALUES (?, ?, 'dislike')`, sam.ID, r.recipe)
	r.exec(`INSERT INTO ingredients (name, name_key, base_unit, created_at, updated_at) VALUES ('Peanut', 'peanut', 'g', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`)
	r.exec(`INSERT INTO ingredients (name, name_key, base_unit, created_at, updated_at) VALUES ('Shrimp', 'shrimp', 'g', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`)
	r.exec(`INSERT INTO member_ingredient_exclusions (member_id, ingredient_id) SELECT ?, id FROM ingredients`, sam.ID)

	got, err := r.st.MemberImpact(r.ctx, sam.ID)
	if err != nil {
		t.Fatalf("MemberImpact: %v", err)
	}
	if got.Preferences != 3 || got.MealSlots != 2 || got.SignInEmail != "sam@example.test" {
		t.Errorf("MemberImpact(Sam) = %+v, want 3 preferences, 2 active Meal Slots, sign-in sam@example.test", got)
	}
	got, err = r.st.MemberImpact(r.ctx, anna.ID)
	if err != nil || got.Preferences != 0 || got.MealSlots != 2 || got.SignInEmail != "" {
		t.Errorf("MemberImpact(Anna) = %+v, %v; want 0, 2 and no sign-in", got, err)
	}
	// An address on the Allowlist keeps signing in after the Member goes: no Sign-in row (SAFE-02 "only when true").
	r.exec(`INSERT INTO users (email, display_name, created_at) VALUES ('SAM@example.test', 'Sam', '2026-11-09T12:00:00Z')`)
	if got, err := r.st.MemberImpact(r.ctx, sam.ID); err != nil || got.SignInEmail != "" {
		t.Errorf("MemberImpact(Sam on the Allowlist) = %+v, %v; want no sign-in that ends", got, err)
	}
	if _, err := r.st.MemberImpact(r.ctx, 9999); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("unknown Member = %v, want ErrNotFound", err)
	}
	if _, err := r.st.Member(r.ctx, sam.ID); err != nil {
		t.Errorf("MemberImpact is read-only: Sam = %v", err)
	}
	_ = dinner
}
