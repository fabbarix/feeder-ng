package runner_test

import (
	"database/sql"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/household"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/plantest"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
)

// The real adapter (DBSources) over team A's stores: the Courses of a Meal Slot with their Course Attendance, and the
// Courses and Whole meal flag of every Recipe.

type realHousehold struct {
	t          *testing.T
	clk        *Clock_
	db         *sql.DB
	src        *runner.DBSources
	hh         *householdstore.Store
	anna, ben  int64 // Ben eats half portions
	main, side int64
	dessert    int64
	slot       int64 // Monday dinner: Main, Side (Ben opts out), Dessert (optional)
}

func newRealHousehold(t *testing.T) *realHousehold {
	t.Helper()
	d := plantest.NewDB(t)
	clk := newClock(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	hh := householdstore.New(d, clk.Fake)
	anna, err := hh.CreateMember(ctx, household.MemberInput{Name: "Anna", Colour: "#336699", PortionFactor: 1})
	if err != nil {
		t.Fatal(err)
	}
	ben, err := hh.CreateMember(ctx, household.MemberInput{Name: "Ben", Colour: "#993366", PortionFactor: 0.5})
	if err != nil {
		t.Fatal(err)
	}
	h := &realHousehold{t: t, clk: clk, db: d, hh: hh, anna: anna.ID, ben: ben.ID,
		main: plantest.CourseID(t, d, "Main"), side: plantest.CourseID(t, d, "Side"), dessert: plantest.CourseID(t, d, "Dessert")}
	slot, err := hh.CreateSlot(ctx, household.MealSlotInput{Weekday: 1, Name: "Dinner", Time: "19:00",
		Attendance: []household.Attendee{{MemberID: anna.ID}, {MemberID: ben.ID}},
		Courses: []household.SlotCourseInput{
			{CourseID: h.main},
			{CourseID: h.side, OptOutMemberIDs: []int64{ben.ID}},
			{CourseID: h.dessert, Optional: true},
		}})
	if err != nil {
		t.Fatal(err)
	}
	h.slot = slot.ID
	h.src = runner.NewDBSources(d, clk.Fake, slog.New(slog.NewTextHandler(io.Discard, nil)))
	return h
}

func TestDBSourcesSlotCoursesServeTheSlotsCoursesWithCourseAttendance(t *testing.T) {
	h := newRealHousehold(t)
	got, err := h.src.SlotCourses(ctx, h.slot, "2026-11-09")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("%d Courses, want Main, Side, Dessert in the slot's order: %+v", len(got), got)
	}
	want := []struct {
		id       int64
		main     bool
		optional bool
		att      []plan.Attendee
	}{
		{h.main, true, false, []plan.Attendee{{MemberID: h.anna, Factor: 1}, {MemberID: h.ben, Factor: 0.5}}},
		{h.side, false, false, []plan.Attendee{{MemberID: h.anna, Factor: 1}}},
		{h.dessert, false, true, []plan.Attendee{{MemberID: h.anna, Factor: 1}, {MemberID: h.ben, Factor: 0.5}}},
	}
	for i, w := range want {
		g := got[i]
		if g.CourseID != w.id || g.Main != w.main || g.Optional != w.optional {
			t.Errorf("Course %d = %+v, want id %d main=%v optional=%v", i, g, w.id, w.main, w.optional)
		}
		if len(g.Attendance) != len(w.att) {
			t.Errorf("Course %d attendance = %+v, want %+v", i, g.Attendance, w.att)
			continue
		}
		for j := range w.att {
			if g.Attendance[j] != w.att[j] {
				t.Errorf("Course %d attendance = %+v, want %+v", i, g.Attendance, w.att)
			}
		}
	}
}

func TestDBSourcesSlotCoursesFollowADatesOwnOptOutsAndAttendance(t *testing.T) {
	h := newRealHousehold(t)
	// On the 16th everybody skips the Side, and Anna is away from the whole dinner on the 23rd.
	everyone := []int64{h.anna, h.ben}
	if err := h.hh.SetDateCourseOptOuts(ctx, h.slot, "2026-11-16", h.side, &everyone); err != nil {
		t.Fatal(err)
	}
	if err := h.hh.SetDateAttendance(ctx, h.slot, "2026-11-23", []household.Attendee{{MemberID: h.ben}}); err != nil {
		t.Fatal(err)
	}
	side := func(date string) []plan.Attendee {
		cs, err := h.src.SlotCourses(ctx, h.slot, date)
		if err != nil || len(cs) != 3 {
			t.Fatalf("SlotCourses(%s) = %+v, %v", date, cs, err)
		}
		return cs[1].Attendance
	}
	if got := side("2026-11-09"); len(got) != 1 || got[0].MemberID != h.anna {
		t.Errorf("a date without overrides: Side attendance = %+v, want Anna only", got)
	}
	if got := side("2026-11-16"); len(got) != 0 {
		t.Errorf("the 16th: Side attendance = %+v, want nobody", got)
	}
	cs, _ := h.src.SlotCourses(ctx, h.slot, "2026-11-23")
	if len(cs) != 3 || len(cs[0].Attendance) != 1 || cs[0].Attendance[0].MemberID != h.ben || len(cs[1].Attendance) != 0 {
		t.Errorf("the 23rd: %+v, want Ben alone at the Main and nobody at the Side (Ben opts out of it, Anna is away)", cs)
	}
}

func TestDBSourcesRecipesCarryTheirCoursesInHouseholdOrderAndTheWholeMealFlag(t *testing.T) {
	h := newRealHousehold(t)
	d, src := h.db, h.src
	main, side, dessert := plantest.CourseID(t, d, "Main"), plantest.CourseID(t, d, "Side"), plantest.CourseID(t, d, "Dessert")
	plain := plantest.SeedRecipe(t, d, "plain", 2) // main only, as the seed helper leaves it
	both := plantest.SeedRecipe(t, d, "both", 2)
	plantest.SetRecipeCourses(t, d, both, dessert, side, main) // stored in any order
	feast := plantest.SeedRecipe(t, d, "feast", 4)
	plantest.SetWholeMeal(t, d, feast, true)

	recipes, err := src.Recipes(ctx)
	if err != nil {
		t.Fatal(err)
	}
	by := map[int64]struct {
		courses []int64
		whole   bool
	}{}
	for _, r := range recipes {
		by[int64(r.ID)] = struct {
			courses []int64
			whole   bool
		}{r.CourseIDs, r.WholeMeal}
	}
	same := func(a, b []int64) bool {
		if len(a) != len(b) {
			return false
		}
		for i := range a {
			if a[i] != b[i] {
				return false
			}
		}
		return true
	}
	if g := by[plain]; !same(g.courses, []int64{main}) || g.whole {
		t.Errorf("plain = %+v, want [Main], not a Whole meal", g)
	}
	if g := by[both]; !same(g.courses, []int64{main, side, dessert}) || g.whole {
		t.Errorf("both = %+v, want [Main Side Dessert] in the household's order", g)
	}
	if g := by[feast]; !same(g.courses, []int64{main}) || !g.whole {
		t.Errorf("feast = %+v, want [Main] and a Whole meal", g)
	}
}

func TestRunnerWithTheRealSourcesPlansMainSideAndDessertWithCourseAttendance(t *testing.T) {
	h := newRealHousehold(t)
	d := h.db
	roast := plantest.SeedRecipe(t, d, "roast", 2)
	rice := plantest.SeedRecipe(t, d, "rice", 2)
	plantest.SetRecipeCourses(t, d, rice, h.side)
	tart := plantest.SeedRecipe(t, d, "tart", 2)
	plantest.SetRecipeCourses(t, d, tart, h.dessert)

	st := store.New(d, h.clk)
	r := runner.New(runner.Deps{DB: d, Clock: h.clk, Store: st, Source: h.src, Stock: &fakeStock{}, Events: &fakeBus{}})
	if _, err := r.Plan(ctx, plan.ReasonNightly); err != nil {
		t.Fatal(err)
	}
	at := func(course int64) (plan.Meal, bool) {
		k := plan.Key{Date: "2026-11-09", MealSlotID: h.slot, CourseID: course}
		m, err := st.Meal(ctx, k)
		return m, err == nil
	}
	m, ok := at(h.main)
	if !ok || m.RecipeID != roast || m.Portions != 1.5 {
		t.Errorf("Main = %+v (found %v), want the roast for 1.5 portions (Anna 1 + Ben 0.5)", m, ok)
	}
	s, ok := at(h.side)
	if !ok || s.RecipeID != rice || s.Portions != 1 {
		t.Errorf("Side = %+v (found %v), want the rice for Anna's 1 portion: Ben opts out", s, ok)
	}
	de, ok := at(h.dessert)
	if !ok || de.RecipeID != tart {
		t.Errorf("Dessert = %+v (found %v), want the tart", de, ok)
	}
}
