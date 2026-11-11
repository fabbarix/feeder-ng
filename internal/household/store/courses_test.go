package store_test

import (
	"database/sql"
	"errors"
	"path/filepath"
	"reflect"
	"sort"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Meal Slot Courses, the optional flag, Course Attendance opt-outs and household.CourseAttendance in the
// household store (crs-plan §1.1 "Course Attendance in the store" and §2.3, team A). Today is 2026-11-09.

type cfx struct {
	*fx
	db                           *sql.DB
	main, side, starter, dessert int64
	anna, sam, nonna             household.Member
}

func newCfx(t *testing.T) *cfx {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(t.Context(), d); err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(testkit.StartTime)
	f := &fx{st: store.New(d, clk), auth: auth.NewService(d, clk, false), ctx: t.Context()}
	c := &cfx{fx: f, db: d}
	c.main, c.side, c.starter, c.dessert = c.course(t, "main"), c.course(t, "side"), c.course(t, "starter"), c.course(t, "dessert")
	c.anna, c.sam, c.nonna = f.member(t, "Anna", 1), f.member(t, "Sam", 0.5), f.member(t, "Nonna", 0.75)
	return c
}

func (c *cfx) course(t *testing.T, key string) int64 {
	t.Helper()
	var id int64
	if err := c.db.QueryRow(`SELECT id FROM courses WHERE name_key = ?`, key).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func (c *cfx) exec(t *testing.T, q string, args ...any) {
	t.Helper()
	if _, err := c.db.Exec(q, args...); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
}

func (c *cfx) count(t *testing.T, q string, args ...any) int {
	t.Helper()
	var n int
	if err := c.db.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
	return n
}

func (c *cfx) slot(t *testing.T, weekday int, name string, courses []household.SlotCourseInput) household.MealSlot {
	t.Helper()
	s, err := c.st.CreateSlot(c.ctx, household.MealSlotInput{Weekday: weekday, Name: name, Time: "19:00", Courses: courses})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func ids64(v ...int64) []int64 { return v }

func courseIDs(cs []household.SlotCourse) []int64 {
	out := []int64{}
	for _, c := range cs {
		out = append(out, c.CourseID)
	}
	return out
}

// optOuts returns slot courseID -> opt-outs as the store reads them back.
func optOuts(s household.MealSlot) map[int64][]int64 {
	out := map[int64][]int64{}
	for _, c := range s.Courses {
		if len(c.OptOutMemberIDs) > 0 {
			out[c.CourseID] = c.OptOutMemberIDs
		}
	}
	return out
}

func (c *cfx) plannedMeal(t *testing.T, date string, slot, course, recipe int64, state string, pinned int) {
	t.Helper()
	c.exec(t, `INSERT OR IGNORE INTO recipes(id,name,yield,created_at,updated_at) VALUES (?,?,4,'t','t')`, recipe, "R")
	c.exec(t, `INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,state,pinned,created_at,updated_at)
		VALUES (?,?,?,?,1,4,?,?,'t','t')`, date, slot, course, recipe, state, pinned)
}

func TestNewSlotServesTheMainCourseRequiredWithNobodyOptingOut(t *testing.T) {
	c := newCfx(t)
	s := c.slot(t, 1, "Dinner", nil)
	if len(s.Courses) != 1 || s.Courses[0].CourseID != c.main || !s.Courses[0].Main || s.Courses[0].Name != "Main" ||
		s.Courses[0].Optional || len(s.Courses[0].OptOutMemberIDs) != 0 {
		t.Fatalf("Courses = %+v, want the main Course, required, no opt-outs", s.Courses)
	}
	list, _ := c.st.Slots(c.ctx)
	if len(list) != 1 || !reflect.DeepEqual(list[0].Courses, s.Courses) {
		t.Errorf("Slots() Courses = %+v, want %+v", list[0].Courses, s.Courses)
	}
	if got, _ := c.st.Slot(c.ctx, s.ID); !reflect.DeepEqual(got.Courses, s.Courses) {
		t.Errorf("Slot() Courses = %+v", got.Courses)
	}
}

func TestCreateSlotWithCoursesKeepsOrderOptionalAndOptOuts(t *testing.T) {
	c := newCfx(t)
	s := c.slot(t, 1, "Dinner", []household.SlotCourseInput{
		{CourseID: c.dessert, Optional: true, OptOutMemberIDs: ids64(c.sam.ID)},
		{CourseID: c.main, OptOutMemberIDs: ids64(c.nonna.ID, c.anna.ID)},
		{CourseID: c.side},
	})
	if got := courseIDs(s.Courses); !reflect.DeepEqual(got, ids64(c.dessert, c.main, c.side)) {
		t.Fatalf("order = %v, want Dessert, Main, Side (the slot's own order)", got)
	}
	if !s.Courses[0].Optional || s.Courses[1].Optional || s.Courses[2].Optional {
		t.Errorf("optional flags = %+v", s.Courses)
	}
	if !s.Courses[1].Main || s.Courses[0].Main {
		t.Errorf("main flags = %+v", s.Courses)
	}
	want := map[int64][]int64{c.dessert: ids64(c.sam.ID), c.main: ids64(c.anna.ID, c.nonna.ID)}
	if got := optOuts(s); !reflect.DeepEqual(got, want) {
		t.Errorf("opt-outs = %v, want %v (ascending Member ids)", got, want)
	}
}

func TestCreateSlotRejectsUnknownOrArchivedCoursesAndUnknownMembersAndWritesNothing(t *testing.T) {
	c := newCfx(t)
	c.exec(t, `UPDATE courses SET archived = 1 WHERE id = ?`, c.starter)
	for name, tc := range map[string]struct {
		courses []household.SlotCourseInput
		field   string
		reason  string
	}{
		"unknown Course":  {[]household.SlotCourseInput{{CourseID: 999}}, "courses", household.ReasonCourseUnknown},
		"archived Course": {[]household.SlotCourseInput{{CourseID: c.main}, {CourseID: c.starter}}, "courses", household.ReasonCourseUnknown},
		"unknown Member":  {[]household.SlotCourseInput{{CourseID: c.main}, {CourseID: c.side, OptOutMemberIDs: ids64(c.sam.ID, 777)}}, "courses[1].optOutMemberIds", household.ReasonMemberUnknown},
	} {
		_, err := c.st.CreateSlot(c.ctx, household.MealSlotInput{Weekday: 3, Name: "Dinner", Time: "19:00", Courses: tc.courses})
		var ve *household.ValidationError
		if !errors.As(err, &ve) || ve.Field != tc.field || ve.Reason != tc.reason {
			t.Errorf("%s: err = %v, want field %q reason %q", name, err, tc.field, tc.reason)
		}
	}
	if n := c.count(t, `SELECT count(*) FROM meal_slots`); n != 0 {
		t.Errorf("%d Meal Slots written by rejected creates", n)
	}
	if n := c.count(t, `SELECT count(*) FROM meal_slot_courses`); n != 0 {
		t.Errorf("%d meal_slot_courses rows written by rejected creates", n)
	}
}

func TestUpdateSlotWithoutCoursesKeepsThemAndTheirOptOuts(t *testing.T) {
	c := newCfx(t)
	s := c.slot(t, 1, "Dinner", []household.SlotCourseInput{{CourseID: c.main}, {CourseID: c.side, Optional: true, OptOutMemberIDs: ids64(c.sam.ID)}})
	up, err := c.st.UpdateSlot(c.ctx, s.ID, household.MealSlotInput{Weekday: 1, Name: "Supper", Time: "20:00"})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(up.Courses, s.Courses) {
		t.Errorf("Courses after an update without them = %+v, want %+v", up.Courses, s.Courses)
	}
}

// Reorder keeps opt-outs although meal_slot_courses is deleted and reinserted.
func TestReorderKeepsEveryUsualAndDateOptOut(t *testing.T) {
	c := newCfx(t)
	s := c.slot(t, 1, "Dinner", []household.SlotCourseInput{
		{CourseID: c.main}, {CourseID: c.side, OptOutMemberIDs: ids64(c.sam.ID)}, {CourseID: c.dessert, Optional: true, OptOutMemberIDs: ids64(c.anna.ID)}})
	if err := c.st.SetDateCourseOptOuts(c.ctx, s.ID, "2026-11-12", c.side, &[]int64{c.nonna.ID}); err != nil {
		t.Fatal(err)
	}
	up, err := c.st.UpdateSlot(c.ctx, s.ID, household.MealSlotInput{Weekday: 1, Name: "Dinner", Time: "19:00", Courses: []household.SlotCourseInput{
		{CourseID: c.dessert, Optional: true}, {CourseID: c.main}, {CourseID: c.side}}}) // nil OptOutMemberIDs: keep the stored ones
	if err != nil {
		t.Fatal(err)
	}
	if got := courseIDs(up.Courses); !reflect.DeepEqual(got, ids64(c.dessert, c.main, c.side)) {
		t.Fatalf("order = %v", got)
	}
	want := map[int64][]int64{c.side: ids64(c.sam.ID), c.dessert: ids64(c.anna.ID)}
	if got := optOuts(up); !reflect.DeepEqual(got, want) {
		t.Errorf("usual opt-outs after the reorder = %v, want %v", got, want)
	}
	days, err := c.st.CoursesOn(c.ctx, s.ID, "2026-11-12")
	if err != nil {
		t.Fatal(err)
	}
	var side household.CourseDay
	for _, d := range days {
		if d.CourseID == c.side {
			side = d
		}
	}
	if !side.IsOverride || !reflect.DeepEqual(side.OptOutMemberIDs, ids64(c.nonna.ID)) {
		t.Errorf("the date opt-outs of Side after the reorder = %+v", side)
	}
}

func TestOptOutsFollowTheRulesOfAbsentEmptyAndListed(t *testing.T) {
	c := newCfx(t)
	s := c.slot(t, 1, "Dinner", []household.SlotCourseInput{{CourseID: c.main, OptOutMemberIDs: ids64(c.sam.ID)}, {CourseID: c.side, OptOutMemberIDs: ids64(c.anna.ID)}})
	up, err := c.st.UpdateSlot(c.ctx, s.ID, household.MealSlotInput{Weekday: 1, Name: "Dinner", Time: "19:00", Courses: []household.SlotCourseInput{
		{CourseID: c.main, OptOutMemberIDs: []int64{}}, // empty: clears
		{CourseID: c.side},                    // absent: keeps Anna
		{CourseID: c.dessert, Optional: true}, // new to the slot, absent: none
		{CourseID: c.starter, OptOutMemberIDs: ids64(c.nonna.ID, c.sam.ID)}, // listed: replaces (none before)
	}})
	if err != nil {
		t.Fatal(err)
	}
	want := map[int64][]int64{c.side: ids64(c.anna.ID), c.starter: ids64(c.sam.ID, c.nonna.ID)}
	if got := optOuts(up); !reflect.DeepEqual(got, want) {
		t.Errorf("opt-outs = %v, want %v", got, want)
	}
}

// Removing a Course drops its opt-outs and the slot's plan for it, in the same transaction.
func TestTakingACourseOffASlotDropsItsOptOutsAndPlanButNothingElse(t *testing.T) {
	c := newCfx(t)
	dinner := c.slot(t, 1, "Dinner", []household.SlotCourseInput{{CourseID: c.main, OptOutMemberIDs: ids64(c.sam.ID)}, {CourseID: c.side, OptOutMemberIDs: ids64(c.sam.ID, c.anna.ID)}})
	lunch := c.slot(t, 2, "Dinner", []household.SlotCourseInput{{CourseID: c.main}, {CourseID: c.side, OptOutMemberIDs: ids64(c.sam.ID)}})
	for _, s := range []int64{dinner.ID, lunch.ID} {
		if err := c.st.SetDateCourseOptOuts(c.ctx, s, "2026-11-16", c.side, &[]int64{c.anna.ID}); err != nil {
			t.Fatal(err)
		}
	}
	if err := c.st.SetDateCourseOptOuts(c.ctx, dinner.ID, "2026-11-16", c.main, &[]int64{c.nonna.ID}); err != nil {
		t.Fatal(err)
	}
	// Planned Meals of Dinner's Side: unresolved from today (pinned or not) go; Cooked, Not cooked and past ones stay.
	c.plannedMeal(t, "2026-11-10", dinner.ID, c.side, 11, "planned", 0)
	c.plannedMeal(t, "2026-11-11", dinner.ID, c.side, 12, "planned", 1)
	c.plannedMeal(t, "2026-11-09", dinner.ID, c.side, 13, "planned", 0) // today counts as "from today on"
	c.plannedMeal(t, "2026-11-12", dinner.ID, c.side, 14, "cooked", 0)
	c.plannedMeal(t, "2026-11-13", dinner.ID, c.side, 15, "skipped", 0)
	c.plannedMeal(t, "2026-11-08", dinner.ID, c.side, 16, "planned", 0) // yesterday: history
	c.plannedMeal(t, "2026-11-10", dinner.ID, c.main, 17, "planned", 0)
	c.plannedMeal(t, "2026-11-10", lunch.ID, c.side, 18, "planned", 0)
	// Slot Rules on Side go; on Main, and on another slot, stay. Couldn't plan reasons of Side go too.
	c.exec(t, `INSERT INTO slot_rules(meal_slot_id,course_id,recipe_id) VALUES (?,?,11),(?,?,11)`, dinner.ID, c.side, dinner.ID, c.main)
	c.exec(t, `INSERT INTO slot_rules(meal_slot_id,course_id,tag) VALUES (?,?,'fish'),(?,?,'fish')`, dinner.ID, c.side, lunch.ID, c.side)
	c.exec(t, `INSERT INTO plan_unfilled(date,meal_slot_id,course_id,reason) VALUES ('2026-11-14',?,?,'no_candidates'),('2026-11-14',?,?,'no_candidates')`, dinner.ID, c.side, dinner.ID, c.main)

	up, err := c.st.UpdateSlot(c.ctx, dinner.ID, household.MealSlotInput{Weekday: 1, Name: "Dinner", Time: "19:00", Courses: []household.SlotCourseInput{{CourseID: c.main}}})
	if err != nil {
		t.Fatal(err)
	}
	if got := courseIDs(up.Courses); !reflect.DeepEqual(got, ids64(c.main)) {
		t.Fatalf("Courses = %v, want just Main", got)
	}
	if want := map[int64][]int64{c.main: ids64(c.sam.ID)}; !reflect.DeepEqual(optOuts(up), want) {
		t.Errorf("Main's usual opt-outs = %v, want %v (untouched)", optOuts(up), want)
	}
	if n := c.count(t, `SELECT count(*) FROM meal_slot_course_opt_outs WHERE meal_slot_id = ? AND course_id = ?`, dinner.ID, c.side); n != 0 {
		t.Errorf("%d usual Side opt-outs left on Dinner", n)
	}
	if n := c.count(t, `SELECT count(*) FROM course_attendance_overrides WHERE slot_id = ? AND course_id = ?`, dinner.ID, c.side); n != 0 {
		t.Errorf("%d Side date overrides left on Dinner", n)
	}
	if n := c.count(t, `SELECT count(*) FROM course_attendance_override_opt_outs WHERE slot_id = ? AND course_id = ?`, dinner.ID, c.side); n != 0 {
		t.Errorf("%d Side date opt-outs left on Dinner", n)
	}
	if n := c.count(t, `SELECT count(*) FROM course_attendance_overrides WHERE slot_id = ? AND course_id = ?`, dinner.ID, c.main); n != 1 {
		t.Errorf("Main's date override on Dinner: %d rows, want 1", n)
	}
	if n := c.count(t, `SELECT count(*) FROM meal_slot_course_opt_outs WHERE meal_slot_id = ? AND course_id = ?`, lunch.ID, c.side); n != 1 {
		t.Errorf("the other slot's Side opt-outs: %d, want 1", n)
	}
	if n := c.count(t, `SELECT count(*) FROM course_attendance_overrides WHERE slot_id = ?`, lunch.ID); n != 1 {
		t.Errorf("the other slot's date override: %d rows, want 1", n)
	}
	// The plan: only Dinner's unresolved Side Planned Meals from today on (recipes 11, 12, 13) are gone.
	var left []int64
	rows, err := c.db.Query(`SELECT recipe_id FROM planned_meals ORDER BY recipe_id`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var id int64
		rows.Scan(&id)
		left = append(left, id)
	}
	rows.Close()
	if want := []int64{14, 15, 16, 17, 18}; !reflect.DeepEqual(left, want) {
		t.Errorf("Planned Meals left (by Recipe) = %v, want %v", left, want)
	}
	if n := c.count(t, `SELECT count(*) FROM slot_rules WHERE meal_slot_id = ? AND course_id = ?`, dinner.ID, c.side); n != 0 {
		t.Errorf("%d Slot Rules on the removed Course left", n)
	}
	if n := c.count(t, `SELECT count(*) FROM slot_rules`); n != 2 {
		t.Errorf("%d Slot Rules left, want Dinner's Main rule and the other slot's Side rule", n)
	}
	if n := c.count(t, `SELECT count(*) FROM plan_unfilled WHERE course_id = ?`, c.side); n != 0 {
		t.Errorf("%d Couldn't plan reasons of the removed Course left", n)
	}
	if n := c.count(t, `SELECT count(*) FROM plan_unfilled WHERE course_id = ?`, c.main); n != 1 {
		t.Errorf("Main's Couldn't plan reason: %d, want 1", n)
	}
	// Adding Side back later starts with nobody opting out.
	back, err := c.st.UpdateSlot(c.ctx, dinner.ID, household.MealSlotInput{Weekday: 1, Name: "Dinner", Time: "19:00", Courses: []household.SlotCourseInput{{CourseID: c.main}, {CourseID: c.side}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := optOuts(back)[c.side]; ok {
		t.Errorf("Side came back with opt-outs %v", optOuts(back)[c.side])
	}
}

func TestAnOptOutOfAMemberWhoDoesNotAttendIsKeptAndAppliesAgainWhenTheyReturn(t *testing.T) {
	c := newCfx(t)
	both := []household.Attendee{{MemberID: c.anna.ID}, {MemberID: c.sam.ID}}
	s, err := c.st.CreateSlot(c.ctx, household.MealSlotInput{Weekday: 1, Name: "Dinner", Time: "19:00", Attendance: both,
		Courses: []household.SlotCourseInput{{CourseID: c.main}, {CourseID: c.side, OptOutMemberIDs: ids64(c.sam.ID, c.nonna.ID)}}}) // Nonna does not attend: accepted
	if err != nil {
		t.Fatal(err)
	}
	if got := optOuts(s)[c.side]; !reflect.DeepEqual(got, ids64(c.sam.ID, c.nonna.ID)) {
		t.Fatalf("stored opt-outs = %v, want Sam and Nonna (kept although Nonna does not attend)", got)
	}
	// Sam leaves the slot; his opt-out is kept and changes nothing.
	up, err := c.st.UpdateSlot(c.ctx, s.ID, household.MealSlotInput{Weekday: 1, Name: "Dinner", Time: "19:00", Attendance: []household.Attendee{{MemberID: c.anna.ID}}})
	if err != nil {
		t.Fatal(err)
	}
	if got := optOuts(up)[c.side]; !reflect.DeepEqual(got, ids64(c.sam.ID, c.nonna.ID)) {
		t.Errorf("opt-outs after Sam left = %v, want them kept", got)
	}
	days, _ := c.st.CoursesOn(c.ctx, s.ID, "2026-11-12")
	if got := ids(days[1].Attendance); !reflect.DeepEqual(got, ids64(c.anna.ID)) {
		t.Errorf("Side Attendance = %v, want just Anna", got)
	}
	// Sam comes back: the opt-out applies again.
	if _, err := c.st.UpdateSlot(c.ctx, s.ID, household.MealSlotInput{Weekday: 1, Name: "Dinner", Time: "19:00", Attendance: both}); err != nil {
		t.Fatal(err)
	}
	days, _ = c.st.CoursesOn(c.ctx, s.ID, "2026-11-12")
	if got := ids(days[0].Attendance); !reflect.DeepEqual(got, ids64(c.anna.ID, c.sam.ID)) {
		t.Errorf("Main Attendance = %v, want both", got)
	}
	if got := ids(days[1].Attendance); !reflect.DeepEqual(got, ids64(c.anna.ID)) {
		t.Errorf("Side Attendance after Sam returned = %v, want Anna only", got)
	}
}

func TestANewMemberOptsOutOfNothing(t *testing.T) {
	c := newCfx(t)
	s := c.slot(t, 1, "Dinner", []household.SlotCourseInput{{CourseID: c.main}, {CourseID: c.side, OptOutMemberIDs: ids64(c.sam.ID)}})
	late := c.member(t, "Late", 1)
	days, err := c.st.CoursesOn(c.ctx, s.ID, "2026-11-12")
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range days {
		found := false
		for _, a := range d.Attendance {
			found = found || a.MemberID == late.ID
		}
		if !found {
			t.Errorf("Course %d: the new Member does not eat it (attendance %v)", d.CourseID, ids(d.Attendance))
		}
	}
}

func ids(a []household.Attendee) []int64 {
	out := []int64{}
	for _, x := range a {
		out = append(out, x.MemberID)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

func TestCoursesOnAppliesTheUsualAndTheDateOptOutsToTheDatesAttendance(t *testing.T) {
	c := newCfx(t)
	all := []household.Attendee{{MemberID: c.anna.ID}, {MemberID: c.sam.ID, PortionFactorOverride: fp(1)}, {MemberID: c.nonna.ID}}
	s, err := c.st.CreateSlot(c.ctx, household.MealSlotInput{Weekday: 4, Name: "Dinner", Time: "19:00", Attendance: all,
		Courses: []household.SlotCourseInput{{CourseID: c.main}, {CourseID: c.side}, {CourseID: c.dessert, Optional: true, OptOutMemberIDs: ids64(c.sam.ID)}}})
	if err != nil {
		t.Fatal(err)
	}
	const date = "2026-11-12" // a Thursday
	days, err := c.st.CoursesOn(c.ctx, s.ID, date)
	if err != nil || len(days) != 3 {
		t.Fatalf("CoursesOn = %+v, %v", days, err)
	}
	if days[0].CourseID != c.main || !days[0].Main || days[0].Optional || days[2].CourseID != c.dessert || !days[2].Optional || days[2].Main {
		t.Errorf("Courses/flags = %+v", days)
	}
	if days[0].IsOverride || len(days[0].OptOutMemberIDs) != 0 || len(days[0].Attendance) != 3 {
		t.Errorf("Main = %+v, want everyone and no opt-outs", days[0])
	}
	if got := ids(days[2].Attendance); !reflect.DeepEqual(got, ids64(c.anna.ID, c.nonna.ID)) || days[2].IsOverride ||
		!reflect.DeepEqual(days[2].OptOutMemberIDs, ids64(c.sam.ID)) {
		t.Errorf("Dessert = %+v, want Anna and Nonna by the usual opt-out of Sam", days[2])
	}

	// A date override replaces the usual opt-outs on that date only.
	if err := c.st.SetDateCourseOptOuts(c.ctx, s.ID, date, c.dessert, &[]int64{c.nonna.ID}); err != nil {
		t.Fatal(err)
	}
	days, _ = c.st.CoursesOn(c.ctx, s.ID, date)
	if got := ids(days[2].Attendance); !reflect.DeepEqual(got, ids64(c.anna.ID, c.sam.ID)) || !days[2].IsOverride || !reflect.DeepEqual(days[2].OptOutMemberIDs, ids64(c.nonna.ID)) {
		t.Errorf("Dessert with a date override = %+v", days[2])
	}
	if a := days[2].Attendance; a[1].PortionFactorOverride == nil || *a[1].PortionFactorOverride != 1 {
		t.Errorf("Sam's Portion Factor override was lost: %+v", a)
	}
	other, _ := c.st.CoursesOn(c.ctx, s.ID, "2026-11-19")
	if got := ids(other[2].Attendance); !reflect.DeepEqual(got, ids64(c.anna.ID, c.nonna.ID)) || other[2].IsOverride {
		t.Errorf("another date must keep the usual opt-outs: %+v", other[2])
	}
	// An empty override puts everyone back; nil drops the override.
	if err := c.st.SetDateCourseOptOuts(c.ctx, s.ID, date, c.dessert, &[]int64{}); err != nil {
		t.Fatal(err)
	}
	days, _ = c.st.CoursesOn(c.ctx, s.ID, date)
	if len(days[2].Attendance) != 3 || !days[2].IsOverride || len(days[2].OptOutMemberIDs) != 0 {
		t.Errorf("Dessert with an empty override = %+v, want everyone", days[2])
	}
	if err := c.st.SetDateCourseOptOuts(c.ctx, s.ID, date, c.dessert, nil); err != nil {
		t.Fatal(err)
	}
	days, _ = c.st.CoursesOn(c.ctx, s.ID, date)
	if days[2].IsOverride || !reflect.DeepEqual(ids(days[2].Attendance), ids64(c.anna.ID, c.nonna.ID)) {
		t.Errorf("Dessert back to usual = %+v", days[2])
	}
	if n := c.count(t, `SELECT count(*) FROM course_attendance_overrides`); n != 0 {
		t.Errorf("%d override rows left after dropping it", n)
	}
	// Dropping an override that was never set is harmless.
	if err := c.st.SetDateCourseOptOuts(c.ctx, s.ID, date, c.side, nil); err != nil {
		t.Errorf("dropping nothing: %v", err)
	}
}

func TestCourseOptOutsSitOnTopOfTheDatesAttendanceOverride(t *testing.T) {
	c := newCfx(t)
	s := c.slot(t, 4, "Dinner", []household.SlotCourseInput{{CourseID: c.main}, {CourseID: c.dessert, Optional: true, OptOutMemberIDs: ids64(c.sam.ID)}})
	const date = "2026-11-12"
	if err := c.st.SetDateAttendance(c.ctx, s.ID, date, []household.Attendee{{MemberID: c.sam.ID}, {MemberID: c.nonna.ID}}); err != nil {
		t.Fatal(err)
	}
	days, _ := c.st.CoursesOn(c.ctx, s.ID, date)
	if got := ids(days[0].Attendance); !reflect.DeepEqual(got, ids64(c.sam.ID, c.nonna.ID)) {
		t.Errorf("Main = %v, want the date's Attendance", got)
	}
	if got := ids(days[1].Attendance); !reflect.DeepEqual(got, ids64(c.nonna.ID)) {
		t.Errorf("Dessert = %v, want the date's Attendance less Sam", got)
	}
	// Setting the date's Attendance did not touch Course opt-outs, and a Course override does not touch the Attendance.
	if err := c.st.SetDateCourseOptOuts(c.ctx, s.ID, date, c.dessert, &[]int64{c.nonna.ID}); err != nil {
		t.Fatal(err)
	}
	if att, isOverride, _ := c.st.DateAttendance(c.ctx, s.ID, date); !isOverride || len(att) != 2 {
		t.Errorf("DateAttendance after a Course override = %+v %v, want unchanged", att, isOverride)
	}
	// Reset to usual Attendance also drops the date's Course opt-outs.
	if err := c.st.ClearDateAttendance(c.ctx, s.ID, date); err != nil {
		t.Fatal(err)
	}
	if n := c.count(t, `SELECT count(*) FROM course_attendance_overrides WHERE slot_id = ?`, s.ID); n != 0 {
		t.Errorf("%d Course date overrides left after Reset to usual Attendance", n)
	}
	if n := c.count(t, `SELECT count(*) FROM course_attendance_override_opt_outs`); n != 0 {
		t.Errorf("%d Course date opt-outs left after Reset", n)
	}
	if n := c.count(t, `SELECT count(*) FROM meal_slot_course_opt_outs WHERE meal_slot_id = ?`, s.ID); n != 1 {
		t.Errorf("Reset must not touch the usual opt-outs: %d left, want 1", n)
	}
}

func TestSetDateCourseOptOutsErrors(t *testing.T) {
	c := newCfx(t)
	s := c.slot(t, 4, "Dinner", []household.SlotCourseInput{{CourseID: c.main}})
	if err := c.st.SetDateCourseOptOuts(c.ctx, s.ID, "2026-11-12", c.side, &[]int64{c.sam.ID}); !errors.Is(err, household.ErrCourseNotInSlot) {
		t.Errorf("a Course the slot does not serve: %v, want ErrCourseNotInSlot", err)
	}
	if err := c.st.SetDateCourseOptOuts(c.ctx, s.ID, "2026-11-12", c.main, &[]int64{777}); !errors.Is(err, household.ErrUnknownMember) {
		t.Errorf("an unknown Member: %v, want ErrUnknownMember", err)
	}
	if err := c.st.SetDateCourseOptOuts(c.ctx, 999, "2026-11-12", c.main, nil); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("an unknown slot: %v, want ErrNotFound", err)
	}
	if _, err := c.st.CoursesOn(c.ctx, 999, "2026-11-12"); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("CoursesOn of an unknown slot: %v, want ErrNotFound", err)
	}
	// Repeated Members are dropped; a Member who does not attend is accepted.
	if err := c.st.SetDateCourseOptOuts(c.ctx, s.ID, "2026-11-12", c.main, &[]int64{c.sam.ID, c.sam.ID}); err != nil {
		t.Errorf("repeated Member: %v", err)
	}
	if n := c.count(t, `SELECT count(*) FROM course_attendance_override_opt_outs`); n != 1 {
		t.Errorf("%d date opt-outs, want 1", n)
	}
	if n := c.count(t, `SELECT count(*) FROM course_attendance_overrides`); n != 1 {
		t.Errorf("%d override rows, want 1 (the failed calls wrote nothing)", n)
	}
}

func TestDeletingAMemberOrASlotRemovesTheirOptOuts(t *testing.T) {
	c := newCfx(t)
	a := c.slot(t, 1, "Dinner", []household.SlotCourseInput{{CourseID: c.main}, {CourseID: c.side, OptOutMemberIDs: ids64(c.sam.ID, c.anna.ID)}})
	b := c.slot(t, 2, "Dinner", []household.SlotCourseInput{{CourseID: c.main}, {CourseID: c.side, OptOutMemberIDs: ids64(c.sam.ID)}})
	for _, s := range []int64{a.ID, b.ID} {
		if err := c.st.SetDateCourseOptOuts(c.ctx, s, "2026-11-16", c.side, &[]int64{c.sam.ID, c.nonna.ID}); err != nil {
			t.Fatal(err)
		}
	}
	if err := c.st.DeleteMember(c.ctx, c.sam.ID); err != nil {
		t.Fatal(err)
	}
	if n := c.count(t, `SELECT count(*) FROM meal_slot_course_opt_outs`); n != 1 {
		t.Errorf("usual opt-outs after deleting Sam = %d, want just Anna's", n)
	}
	if n := c.count(t, `SELECT count(*) FROM course_attendance_override_opt_outs`); n != 2 {
		t.Errorf("date opt-outs after deleting Sam = %d, want the two of Nonna", n)
	}
	if err := c.st.DeleteSlot(c.ctx, a.ID); err != nil {
		t.Fatal(err)
	}
	if c.count(t, `SELECT count(*) FROM meal_slot_course_opt_outs`) != 0 || c.count(t, `SELECT count(*) FROM course_attendance_overrides WHERE slot_id = ?`, a.ID) != 0 {
		t.Error("deleting a Meal Slot must remove its usual and date opt-outs")
	}
	if n := c.count(t, `SELECT count(*) FROM course_attendance_override_opt_outs`); n != 1 {
		t.Errorf("the other slot's date opt-out: %d rows, want 1", n)
	}
}

// ---- the multi-day (batch) edit ----

func (c *cfx) threeDinners(t *testing.T) []household.MealSlot {
	t.Helper()
	var out []household.MealSlot
	for wd := 1; wd <= 3; wd++ {
		s, err := c.st.CreateSlot(c.ctx, household.MealSlotInput{Weekday: wd, Name: "Dinner", Time: "19:00",
			Attendance: []household.Attendee{{MemberID: c.anna.ID}, {MemberID: c.sam.ID}},
			Courses:    []household.SlotCourseInput{{CourseID: c.main}, {CourseID: c.side, OptOutMemberIDs: ids64(c.sam.ID)}}})
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, s)
	}
	return out
}

func TestBatchEditKeepsEachSlotsOptOutsForTheCoursesItKeeps(t *testing.T) {
	c := newCfx(t)
	slots := c.threeDinners(t)
	name, tm := "Supper", "20:00"
	edits := []household.SlotChange{
		{Name: &name},
		{Time: &tm},
		{Attendance: &[]household.Attendee{{MemberID: c.anna.ID}, {MemberID: c.sam.ID}, {MemberID: c.nonna.ID}}},
		{Courses: &[]household.SlotCourseInput{{CourseID: c.side}, {CourseID: c.main}}}, // order only: opt-outs absent = keep
	}
	for i, ch := range edits {
		match := "Supper" // the first edit renames Dinner to Supper; the later ones match the new name
		if i == 0 {
			match = "Dinner"
		}
		res, err := c.st.UpdateSlotsBatch(c.ctx, household.BatchInput{Match: match, Weekdays: []int{1, 2, 3}, Change: ch})
		if err != nil {
			t.Fatalf("edit %d: %v", i, err)
		}
		if len(res.Updated) != 3 {
			t.Fatalf("edit %d updated %d slots", i, len(res.Updated))
		}
		for _, s := range slots {
			got, _ := c.st.Slot(c.ctx, s.ID)
			if want := ids64(c.sam.ID); !reflect.DeepEqual(optOuts(got)[c.side], want) {
				t.Errorf("edit %d: slot %d Side opt-outs = %v, want %v kept", i, s.ID, optOuts(got)[c.side], want)
			}
		}
	}
	got, _ := c.st.Slot(c.ctx, slots[0].ID)
	if want := ids64(c.side, c.main); !reflect.DeepEqual(courseIDs(got.Courses), want) {
		t.Errorf("Course order after the batch = %v, want %v", courseIDs(got.Courses), want)
	}
}

func TestBatchAppliesOptionalAndOptOutsAndIgnoresAMemberWhoDoesNotAttendTheMatchingSlot(t *testing.T) {
	c := newCfx(t)
	slots := c.threeDinners(t) // each is attended by Anna and Sam; Nonna attends none
	res, err := c.st.UpdateSlotsBatch(c.ctx, household.BatchInput{Match: "Dinner", Weekdays: []int{1, 2, 3}, Change: household.SlotChange{
		Courses: &[]household.SlotCourseInput{
			{CourseID: c.main},
			{CourseID: c.side, OptOutMemberIDs: ids64(c.anna.ID, c.nonna.ID)}, // Nonna does not attend: ignored
			{CourseID: c.dessert, Optional: true},
		}}})
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range res.Updated {
		if got := courseIDs(m.Courses); !reflect.DeepEqual(got, ids64(c.main, c.side, c.dessert)) {
			t.Errorf("slot %d Courses = %v", m.ID, got)
		}
		if !m.Courses[2].Optional {
			t.Errorf("slot %d: Dessert must be optional", m.ID)
		}
		if got := m.Courses[1].OptOutMemberIDs; !reflect.DeepEqual(got, ids64(c.anna.ID)) {
			t.Errorf("slot %d: Side opt-outs in the result = %v, want just Anna", m.ID, got)
		}
	}
	for _, s := range slots {
		got, _ := c.st.Slot(c.ctx, s.ID)
		if want := ids64(c.anna.ID); !reflect.DeepEqual(optOuts(got)[c.side], want) {
			t.Errorf("slot %d stored Side opt-outs = %v, want %v", s.ID, optOuts(got)[c.side], want)
		}
	}
}

func TestBatchCourseErrorsLeaveEveryMatchingSlotUntouched(t *testing.T) {
	c := newCfx(t)
	slots := c.threeDinners(t)
	for name, courses := range map[string][]household.SlotCourseInput{
		"unknown Course": {{CourseID: c.main}, {CourseID: 999}},
		"unknown Member": {{CourseID: c.main, OptOutMemberIDs: ids64(777)}},
	} {
		_, err := c.st.UpdateSlotsBatch(c.ctx, household.BatchInput{Match: "Dinner", Weekdays: []int{1, 2, 3}, Change: household.SlotChange{Courses: &courses}})
		var ve *household.ValidationError
		if !errors.As(err, &ve) {
			t.Errorf("%s: err = %v, want a ValidationError", name, err)
		}
	}
	for _, s := range slots {
		got, _ := c.st.Slot(c.ctx, s.ID)
		if want := ids64(c.main, c.side); !reflect.DeepEqual(courseIDs(got.Courses), want) {
			t.Errorf("slot %d Courses = %v after failed batches, want %v", s.ID, courseIDs(got.Courses), want)
		}
	}
}

func TestBatchTakingACourseOffReportsAndRemovesWhatGoes(t *testing.T) {
	c := newCfx(t)
	slots := c.threeDinners(t)
	monday, tuesday, wednesday := slots[0], slots[1], slots[2]
	c.plannedMeal(t, "2026-11-10", tuesday.ID, c.side, 11, "planned", 0) // Tuesday 2026-11-10: unresolved, goes
	c.plannedMeal(t, "2026-11-11", wednesday.ID, c.side, 12, "planned", 1)
	c.plannedMeal(t, "2026-11-16", monday.ID, c.side, 13, "cooked", 0)
	c.plannedMeal(t, "2026-11-10", tuesday.ID, c.main, 14, "planned", 0)
	c.exec(t, `INSERT INTO slot_rules(meal_slot_id,course_id,recipe_id) VALUES (?,?,11)`, tuesday.ID, c.side)
	change := household.SlotChange{Courses: &[]household.SlotCourseInput{{CourseID: c.main}}}
	in := household.BatchInput{Match: "Dinner", Weekdays: []int{2, 3}, Change: change, DryRun: true}

	dry, err := c.st.UpdateSlotsBatch(c.ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	if len(dry.Removes.PlannedMeals) != 2 || len(dry.Removes.SlotRules) != 1 {
		t.Fatalf("dry run Removes = %+v, want 2 Planned Meals and 1 Slot Rule", dry.Removes)
	}
	pinned := 0
	for _, m := range dry.Removes.PlannedMeals {
		if m.CourseID != c.side {
			t.Errorf("removal in Course %d, want Side", m.CourseID)
		}
		if m.Pinned {
			pinned++
		}
	}
	if pinned != 1 {
		t.Errorf("the Pinned one must be listed too (%d pinned of %+v)", pinned, dry.Removes.PlannedMeals)
	}
	if n := c.count(t, `SELECT count(*) FROM planned_meals`); n != 4 {
		t.Errorf("a dry run deleted Planned Meals: %d left, want 4", n)
	}
	if got, _ := c.st.Slot(c.ctx, tuesday.ID); len(got.Courses) != 2 || len(optOuts(got)) != 1 {
		t.Errorf("a dry run changed Tuesday: %+v", got.Courses)
	}

	in.DryRun = false
	res, err := c.st.UpdateSlotsBatch(c.ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(res.Removes, dry.Removes) {
		t.Errorf("a real save answers Removes %+v, the dry run said %+v", res.Removes, dry.Removes)
	}
	if n := c.count(t, `SELECT count(*) FROM planned_meals`); n != 2 {
		t.Errorf("%d Planned Meals left, want Monday's Cooked Side and Tuesday's Main", n)
	}
	for _, s := range []household.MealSlot{tuesday, wednesday} {
		got, _ := c.st.Slot(c.ctx, s.ID)
		if len(got.Courses) != 1 || len(optOuts(got)) != 0 {
			t.Errorf("slot %d after the batch = %+v", s.ID, got.Courses)
		}
	}
	if got, _ := c.st.Slot(c.ctx, monday.ID); len(got.Courses) != 2 || !reflect.DeepEqual(optOuts(got)[c.side], ids64(c.sam.ID)) {
		t.Errorf("Monday did not match and must keep Side with its opt-out: %+v", got.Courses)
	}
	if n := c.count(t, `SELECT count(*) FROM meal_slot_course_opt_outs`); n != 1 {
		t.Errorf("%d usual opt-outs left, want Monday's", n)
	}
}
