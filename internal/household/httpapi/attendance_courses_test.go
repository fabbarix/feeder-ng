package httpapi_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Date Attendance `courses` (spec §3.1 Course Attendance, §16 Date Attendance).

type courseDayBody struct {
	CourseID        int64          `json:"courseId"`
	Name            string         `json:"name"`
	OptOutMemberIDs []int64        `json:"optOutMemberIds"`
	IsOverride      bool           `json:"isOverride"`
	Attendance      []attendeeBody `json:"attendance"`
	PortionsNeeded  float64        `json:"portionsNeeded"`
}

type dayC struct {
	dateAttendanceBody
	Courses []courseDayBody `json:"courses"`
}

const thursday = "2026-11-12"

// attendanceFixture: Dinner on Thursday for Anna (1), Sam (0.5) and Marco (1), serving Main, Side (Sam usually
// opts out) and Dessert (optional).
type attendanceFixture struct {
	admin            *testkit.Client
	env              *testkit.Env
	anna, sam, marco memberBody
	main, side       int64
	dessert, starter int64
	slot             slotBody
	url              string
}

func newAttendanceFixture(t *testing.T) attendanceFixture {
	t.Helper()
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	f := attendanceFixture{env: env, admin: admin}
	f.anna, f.sam, f.marco = mustMember(t, admin, "Anna", 1), mustMember(t, admin, "Sam", 0.5), mustMember(t, admin, "Marco", 1)
	f.main, f.side, f.dessert, f.starter = courseID(t, env, "Main"), courseID(t, env, "Side"), courseID(t, env, "Dessert"), courseID(t, env, "Starter")
	f.slot = mustSlot(t, admin, 4, "Dinner", "19:00", attendeeBody{MemberID: f.anna.ID}, attendeeBody{MemberID: f.sam.ID}, attendeeBody{MemberID: f.marco.ID})
	if r := putSlot(admin, f.slot, []any{courseSpec(f.main, false), courseSpec(f.side, false, f.sam.ID), courseSpec(f.dessert, true)}); r.Status != 200 {
		t.Fatalf("setup Courses = %d %s", r.Status, r.Body)
	}
	f.url = path("/api/meal-slots/%d/attendance?date=%s", f.slot.ID, thursday)
	return f
}

func (f attendanceFixture) get(t *testing.T) dayC {
	t.Helper()
	var d dayC
	r := f.admin.Get(f.url)
	if r.Status != 200 {
		t.Fatalf("GET attendance = %d %s", r.Status, r.Body)
	}
	r.MustJSON(t, &d)
	return d
}

// day returns the i-th Course of a date, failing the test (not panicking) when there is none.
func day(t *testing.T, d dayC, i int) courseDayBody {
	t.Helper()
	if i >= len(d.Courses) {
		t.Fatalf("courses = %+v, want at least %d", d.Courses, i+1)
	}
	return d.Courses[i]
}

func memberIDs(att []attendeeBody) []int64 {
	out := make([]int64, 0, len(att))
	for _, a := range att {
		out = append(out, a.MemberID)
	}
	return out
}

func TestDateAttendanceListsTheEffectiveAttendanceOfEachCourseInSlotOrder(t *testing.T) {
	f := newAttendanceFixture(t)
	d := f.get(t)
	if d.IsOverride || len(d.Attendance) != 3 || d.PortionsNeeded != 2.5 {
		t.Fatalf("slot attendance = %+v", d.dateAttendanceBody)
	}
	if len(d.Courses) != 3 {
		t.Fatalf("courses = %+v", d.Courses)
	}
	want := []struct {
		id       int64
		name     string
		optOut   []int64
		attend   []int64
		portions float64
	}{
		{f.main, "Main", nil, []int64{f.anna.ID, f.sam.ID, f.marco.ID}, 2.5},
		{f.side, "Side", []int64{f.sam.ID}, []int64{f.anna.ID, f.marco.ID}, 2},
		{f.dessert, "Dessert", nil, []int64{f.anna.ID, f.sam.ID, f.marco.ID}, 2.5},
	}
	for i, w := range want {
		g := d.Courses[i]
		if g.CourseID != w.id || g.Name != w.name || !sameIDs(g.OptOutMemberIDs, w.optOut) || g.IsOverride || !sameIDs(memberIDs(g.Attendance), w.attend) || g.PortionsNeeded != w.portions {
			t.Errorf("course %d = %+v, want %+v", i, g, w)
		}
	}
	if r := f.env.LoginUser(t).Get(f.url); r.Status != 200 {
		t.Errorf("a User reads it too: %d", r.Status)
	}
}

func TestPutCourseOptOutsForOneDateReplacesTheUsualOnesAndLeavesTheSlotAttendanceAlone(t *testing.T) {
	f := newAttendanceFixture(t)
	ch, cancel := f.env.App.Deps.Events.Subscribe("household")
	defer cancel()

	r := f.admin.Put(f.url, map[string]any{"courses": []any{map[string]any{"courseId": f.side, "optOutMemberIds": []int64{f.anna.ID}}}})
	var d dayC
	r.MustJSON(t, &d)
	if r.Status != 200 {
		t.Fatalf("PUT = %d %s", r.Status, r.Body)
	}
	if d.IsOverride || len(d.Attendance) != 3 {
		t.Errorf("a PUT without attendance changed the slot's date Attendance: %+v", d.dateAttendanceBody)
	}
	side := day(t, d, 1)
	if !side.IsOverride || !sameIDs(side.OptOutMemberIDs, []int64{f.anna.ID}) || !sameIDs(memberIDs(side.Attendance), []int64{f.sam.ID, f.marco.ID}) || side.PortionsNeeded != 1.5 {
		t.Errorf("Side that date = %+v, want Anna out (the usual Sam opt-out is replaced), Sam and Marco eating", side)
	}
	if day(t, d, 0).IsOverride || day(t, d, 2).IsOverride {
		t.Errorf("Courses not named changed: %+v", d.Courses)
	}
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, `"attendance"`) {
		t.Errorf("event = %s %s, want household changed: attendance", topic, data)
	}
	// Another day keeps the usual opt-outs.
	var other dayC
	f.admin.Get(path("/api/meal-slots/%d/attendance?date=2026-11-19", f.slot.ID)).MustJSON(t, &other)
	if day(t, other, 1).IsOverride || !sameIDs(day(t, other, 1).OptOutMemberIDs, []int64{f.sam.ID}) {
		t.Errorf("the next Thursday = %+v", day(t, other, 1))
	}
}

func TestAnEmptyListMeansEveryoneEatsAndNullGoesBackToUsual(t *testing.T) {
	f := newAttendanceFixture(t)
	put := func(courses ...any) dayC {
		var d dayC
		r := f.admin.Put(f.url, map[string]any{"courses": courses})
		if r.Status != 200 {
			t.Fatalf("PUT = %d %s", r.Status, r.Body)
		}
		r.MustJSON(t, &d)
		return d
	}
	d := put(map[string]any{"courseId": f.side, "optOutMemberIds": []int64{}})
	if s := day(t, d, 1); !s.IsOverride || len(s.OptOutMemberIDs) != 0 || len(s.Attendance) != 3 {
		t.Errorf("[] = %+v, want an override with everyone eating Side", s)
	}
	put(map[string]any{"courseId": f.dessert, "optOutMemberIds": []int64{f.marco.ID}})
	d = put(map[string]any{"courseId": f.side, "optOutMemberIds": nil})
	if s := day(t, d, 1); s.IsOverride || !sameIDs(s.OptOutMemberIDs, []int64{f.sam.ID}) || len(s.Attendance) != 2 {
		t.Errorf("null = %+v, want Side back to its usual opt-out of Sam", s)
	}
	if s := day(t, d, 2); !s.IsOverride || !sameIDs(s.OptOutMemberIDs, []int64{f.marco.ID}) {
		t.Errorf("a Course not named must be unchanged, got Dessert %+v", s)
	}
}

func TestCourseOptOutsFollowTheDatesAttendance(t *testing.T) {
	f := newAttendanceFixture(t)
	// Marco is away that Thursday and Anna does not eat Side: only Sam eats it? No: Sam usually opts out, the date replaces that.
	r := f.admin.Put(f.url, map[string]any{
		"attendance": []attendeeBody{{MemberID: f.anna.ID}, {MemberID: f.sam.ID}},
		"courses":    []any{map[string]any{"courseId": f.side, "optOutMemberIds": []int64{f.marco.ID, f.anna.ID}}},
	})
	var d dayC
	r.MustJSON(t, &d)
	if r.Status != 200 || !d.IsOverride || !sameIDs(memberIDs(d.Attendance), []int64{f.anna.ID, f.sam.ID}) {
		t.Fatalf("PUT = %d %s", r.Status, r.Body)
	}
	if main := day(t, d, 0); !sameIDs(memberIDs(main.Attendance), []int64{f.anna.ID, f.sam.ID}) || main.PortionsNeeded != 1.5 {
		t.Errorf("Main = %+v, want the date's Attendance", main)
	}
	side := day(t, d, 1)
	if !sameIDs(memberIDs(side.Attendance), []int64{f.sam.ID}) || side.PortionsNeeded != 0.5 || len(side.OptOutMemberIDs) != 2 {
		t.Errorf("Side = %+v, want only Sam (the opt-out of Marco, who is away, is kept and does nothing)", side)
	}
}

func TestPuttingOnlyTheDatesAttendanceLeavesCourseOptOutsAlone(t *testing.T) {
	f := newAttendanceFixture(t)
	f.admin.Put(f.url, map[string]any{"courses": []any{map[string]any{"courseId": f.side, "optOutMemberIds": []int64{f.anna.ID}}}})
	r := f.admin.Put(f.url, map[string]any{"attendance": []attendeeBody{{MemberID: f.anna.ID}, {MemberID: f.sam.ID}}})
	var d dayC
	r.MustJSON(t, &d)
	if r.Status != 200 || !day(t, d, 1).IsOverride || !sameIDs(day(t, d, 1).OptOutMemberIDs, []int64{f.anna.ID}) {
		t.Errorf("PUT attendance only = %d %s, want Side's date opt-outs kept", r.Status, r.Body)
	}
}

func TestResetToUsualAttendanceAlsoDropsTheDatesCourseOptOuts(t *testing.T) {
	f := newAttendanceFixture(t)
	f.admin.Put(f.url, map[string]any{
		"attendance": []attendeeBody{{MemberID: f.anna.ID}},
		"courses": []any{map[string]any{"courseId": f.side, "optOutMemberIds": []int64{}},
			map[string]any{"courseId": f.dessert, "optOutMemberIds": []int64{f.anna.ID}}},
	})
	if r := f.admin.Delete(f.url); r.Status != 204 {
		t.Fatalf("DELETE = %d %s", r.Status, r.Body)
	}
	d := f.get(t)
	if d.IsOverride || len(d.Attendance) != 3 {
		t.Errorf("after reset = %+v", d.dateAttendanceBody)
	}
	for i, c := range d.Courses {
		if c.IsOverride {
			t.Errorf("course %d still has a date override after Reset to usual: %+v", i, c)
		}
	}
	if !sameIDs(day(t, d, 1).OptOutMemberIDs, []int64{f.sam.ID}) {
		t.Errorf("Side = %+v, want the usual opt-out again", day(t, d, 1))
	}
}

func TestDateAttendanceCourseRefusals(t *testing.T) {
	f := newAttendanceFixture(t)
	put := func(courses ...any) *testkit.Response {
		return f.admin.Put(f.url, map[string]any{"courses": courses})
	}
	wantRefusal(t, "Course not on the slot", put(map[string]any{"courseId": f.starter, "optOutMemberIds": []int64{}}), 422, "validation_failed", "courses[0].courseId", "course_not_in_slot")
	wantRefusal(t, "unknown Course", put(map[string]any{"courseId": 99999, "optOutMemberIds": []int64{}}), 422, "validation_failed", "courses[0].courseId", "course_not_in_slot")
	wantRefusal(t, "unknown Member", put(map[string]any{"courseId": f.side, "optOutMemberIds": []int64{9999}}), 422, "validation_failed", "courses[0].optOutMemberIds", "member_unknown")
	wantRefusal(t, "nothing to change", f.admin.Put(f.url, map[string]any{}), 422, "validation_failed", "attendance", "nothing_to_change")

	// All or nothing: a bad second entry leaves the first, and the date Attendance, unwritten.
	r := f.admin.Put(f.url, map[string]any{
		"attendance": []attendeeBody{{MemberID: f.anna.ID}},
		"courses": []any{map[string]any{"courseId": f.dessert, "optOutMemberIds": []int64{f.anna.ID}},
			map[string]any{"courseId": f.starter, "optOutMemberIds": []int64{}}},
	})
	wantRefusal(t, "second entry bad", r, 422, "validation_failed", "courses[1].courseId", "course_not_in_slot")
	d := f.get(t)
	if d.IsOverride || day(t, d, 2).IsOverride {
		t.Errorf("a refused PUT wrote something: %+v", d)
	}
	// The existing checks still run first.
	other := path("/api/meal-slots/%d/attendance?date=2026-11-11", f.slot.ID)
	if r := f.admin.Put(other, map[string]any{"courses": []any{}}); r.Status != 422 || r.ErrorCode() != "weekday_mismatch" {
		t.Errorf("Wednesday = %d %s", r.Status, r.Body)
	}
	if r := f.admin.Put("/api/meal-slots/99999/attendance?date="+thursday, map[string]any{"courses": []any{}}); r.Status != 404 {
		t.Errorf("unknown slot = %d", r.Status)
	}
	if r := f.env.LoginUser(t).Put(f.url, map[string]any{"courses": []any{}}); r.Status != 200 && r.Status != 422 {
		t.Errorf("a User may write Date Attendance (as today): %d", r.Status)
	}
}

func TestDuplicateOptOutMembersForADateAreDropped(t *testing.T) {
	f := newAttendanceFixture(t)
	r := f.admin.Put(f.url, map[string]any{"courses": []any{map[string]any{"courseId": f.side, "optOutMemberIds": []int64{f.anna.ID, f.anna.ID}}}})
	var d dayC
	r.MustJSON(t, &d)
	if r.Status != 200 || len(day(t, d, 1).OptOutMemberIDs) != 1 {
		t.Errorf("= %d %s, want Anna once", r.Status, r.Body)
	}
}

func TestSingleCourseSlotsAnswerOneCourse(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna := mustMember(t, admin, "Anna", 1)
	slot := mustSlot(t, admin, 4, "Dinner", "19:00", attendeeBody{MemberID: anna.ID})
	var d dayC
	admin.Get(path("/api/meal-slots/%d/attendance?date=%s", slot.ID, thursday)).MustJSON(t, &d)
	if len(d.Courses) != 1 || day(t, d, 0).Name != "Main" || day(t, d, 0).OptOutMemberIDs == nil || len(day(t, d, 0).Attendance) != 1 {
		t.Errorf("courses = %+v, want Main with Anna and an empty (not null) opt-out list", d.Courses)
	}
}
