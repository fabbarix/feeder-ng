package httpapi_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func TestMealSlotsAuthz(t *testing.T) {
	env := testkit.Start(t)
	user, anon := env.LoginUser(t), env.Anonymous()
	if r := anon.Get("/api/meal-slots"); r.Status != 401 {
		t.Errorf("anonymous GET = %d", r.Status)
	}
	if r := user.Get("/api/meal-slots"); r.Status != 200 {
		t.Errorf("User GET = %d", r.Status)
	}
	body := map[string]any{"weekday": 1, "name": "Dinner", "time": "19:00", "attendance": []any{}}
	for _, c := range []struct{ method, path string }{{"POST", "/api/meal-slots"}, {"PATCH", "/api/meal-slots/1"}, {"DELETE", "/api/meal-slots/1"}} {
		if r := user.Do(c.method, c.path, body); r.Status != 403 {
			t.Errorf("User %s %s = %d", c.method, c.path, r.Status)
		}
	}
}

func TestMealSlotsListedInWeekOrderWithPortionsNeeded(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna, marco, sam := mustMember(t, admin, "Anna", 1), mustMember(t, admin, "Marco", 1), mustMember(t, admin, "Sam", 0.5)
	both := []attendeeBody{{MemberID: anna.ID}, {MemberID: marco.ID}, {MemberID: sam.ID}}
	tueDinner := mustSlot(t, admin, 2, "Dinner", "19:30", both...)
	mustSlot(t, admin, 1, "Dinner", "19:00", attendeeBody{MemberID: anna.ID, PortionFactorOverride: f64(1.5)})
	mustSlot(t, admin, 1, "Lunch", "12:30")

	var list []slotBody
	env.LoginUser(t).Get("/api/meal-slots").MustJSON(t, &list)
	if len(list) != 3 || list[0].Name != "Lunch" || list[1].Name != "Dinner" || list[1].Weekday != 1 || list[2].ID != tueDinner.ID {
		t.Fatalf("order = %+v", list)
	}
	if list[0].PortionsNeeded != 0 || list[1].PortionsNeeded != 1.5 || list[2].PortionsNeeded != 2.5 {
		t.Errorf("portions = %v, %v, %v; want 0, 1.5, 2.5", list[0].PortionsNeeded, list[1].PortionsNeeded, list[2].PortionsNeeded)
	}
	if list[1].Attendance[0].PortionFactorOverride == nil || *list[1].Attendance[0].PortionFactorOverride != 1.5 || list[2].Attendance[0].PortionFactorOverride != nil {
		t.Errorf("overrides = %+v / %+v", list[1].Attendance, list[2].Attendance)
	}
}

func TestMealSlotValidationAndConflicts(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna := mustMember(t, admin, "Anna", 1)
	mustSlot(t, admin, 1, "Dinner", "19:00")
	post := func(weekday int, name, at string, att ...attendeeBody) (int, string, string) {
		r := admin.Post("/api/meal-slots", map[string]any{"weekday": weekday, "name": name, "time": at, "attendance": att})
		return r.Status, r.ErrorCode(), string(r.Body)
	}
	if st, code, body := post(8, "Dinner", "19:00"); st != 422 || code != "validation_failed" || !strings.Contains(body, "weekday") {
		t.Errorf("weekday 8: %d %s %s", st, code, body)
	}
	if st, code, body := post(2, "Dinner", "7pm"); st != 422 || code != "validation_failed" || !strings.Contains(body, "time") {
		t.Errorf("time: %d %s %s", st, code, body)
	}
	if st, code, _ := post(1, "dinner", "20:00"); st != 409 || code != "duplicate_slot" {
		t.Errorf("duplicate: %d %s", st, code)
	}
	if st, code, _ := post(3, "Dinner", "20:00", attendeeBody{MemberID: 9999}); st != 422 || code != "unknown_member" {
		t.Errorf("unknown member: %d %s", st, code)
	}
	if st, code, _ := post(3, "Dinner", "20:00", attendeeBody{MemberID: anna.ID}, attendeeBody{MemberID: anna.ID}); st != 422 || code != "duplicate_attendee" {
		t.Errorf("duplicate attendee: %d %s", st, code)
	}
	if st, code, _ := post(3, "Dinner", "20:00", attendeeBody{MemberID: anna.ID, PortionFactorOverride: f64(0.3)}); st != 422 || code != "validation_failed" {
		t.Errorf("bad override: %d %s", st, code)
	}
	if st, _, _ := post(2, "Dinner", "20:00"); st != 201 {
		t.Errorf("same name on another weekday = %d, want 201", st)
	}
}

func TestMealSlotPatchAndDelete(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna, sam := mustMember(t, admin, "Anna", 1), mustMember(t, admin, "Sam", 0.5)
	slot := mustSlot(t, admin, 4, "Dinner", "19:00", attendeeBody{MemberID: anna.ID}, attendeeBody{MemberID: sam.ID})
	var up slotBody
	r := admin.Patch(path("/api/meal-slots/%d", slot.ID), map[string]any{"weekday": 4, "name": "Supper", "time": "20:15", "attendance": []attendeeBody{{MemberID: sam.ID}}})
	r.MustJSON(t, &up)
	if r.Status != 200 || up.Name != "Supper" || up.Time != "20:15" || len(up.Attendance) != 1 || up.PortionsNeeded != 0.5 {
		t.Fatalf("patch = %d %+v", r.Status, up)
	}
	if r := admin.Patch("/api/meal-slots/9999", map[string]any{"weekday": 1, "name": "x", "time": "10:00", "attendance": []any{}}); r.Status != 404 {
		t.Errorf("patch unknown = %d", r.Status)
	}
	if r := admin.Delete(path("/api/meal-slots/%d", slot.ID)); r.Status != 204 {
		t.Errorf("delete = %d", r.Status)
	}
	if r := admin.Delete(path("/api/meal-slots/%d", slot.ID)); r.Status != 404 {
		t.Errorf("second delete = %d", r.Status)
	}
}

func TestDeletingAMemberShrinksTheSlotsPortions(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna, sam := mustMember(t, admin, "Anna", 1), mustMember(t, admin, "Sam", 0.5)
	mustSlot(t, admin, 4, "Dinner", "19:00", attendeeBody{MemberID: anna.ID}, attendeeBody{MemberID: sam.ID})
	admin.Delete(path("/api/members/%d", sam.ID))
	var list []slotBody
	admin.Get("/api/meal-slots").MustJSON(t, &list)
	if len(list[0].Attendance) != 1 || list[0].PortionsNeeded != 1 {
		t.Fatalf("slot = %+v", list[0])
	}
}

func TestSamIsAwayThursday(t *testing.T) {
	env := testkit.Start(t)
	admin, user := env.LoginAdmin(t), env.LoginUser(t)
	anna, marco, sam := mustMember(t, admin, "Anna", 1), mustMember(t, admin, "Marco", 1), mustMember(t, admin, "Sam", 0.5)
	slot := mustSlot(t, admin, 4, "Dinner", "19:00", attendeeBody{MemberID: anna.ID}, attendeeBody{MemberID: marco.ID}, attendeeBody{MemberID: sam.ID})
	thursday := path("/api/meal-slots/%d/attendance?date=2026-11-12", slot.ID)
	nextThursday := path("/api/meal-slots/%d/attendance?date=2026-11-19", slot.ID)

	var d dateAttendanceBody
	user.Get(thursday).MustJSON(t, &d)
	if d.IsOverride || d.PortionsNeeded != 2.5 || len(d.Attendance) != 3 || d.Date != "2026-11-12" || d.SlotID != slot.ID {
		t.Fatalf("before = %+v", d)
	}
	// Any User (not only an Admin) records a one-off change.
	r := user.Put(thursday, map[string]any{"attendance": []attendeeBody{{MemberID: anna.ID}, {MemberID: marco.ID}}})
	r.MustJSON(t, &d)
	if r.Status != 200 || !d.IsOverride || d.PortionsNeeded != 2 || len(d.Attendance) != 2 {
		t.Fatalf("PUT = %d %+v", r.Status, d)
	}
	user.Get(nextThursday).MustJSON(t, &d)
	if d.IsOverride || d.PortionsNeeded != 2.5 {
		t.Errorf("next Thursday must be unaffected: %+v", d)
	}
	var list []slotBody
	user.Get("/api/meal-slots").MustJSON(t, &list)
	if len(list[0].Attendance) != 3 || list[0].PortionsNeeded != 2.5 {
		t.Errorf("the usual Attendance must be unchanged: %+v", list[0])
	}
	if r := user.Delete(thursday); r.Status != 204 {
		t.Errorf("DELETE = %d", r.Status)
	}
	user.Get(thursday).MustJSON(t, &d)
	if d.IsOverride || d.PortionsNeeded != 2.5 {
		t.Errorf("after reset: %+v", d)
	}
}

func TestDateAttendanceCanBeEmptyAndHonoursOverrides(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna := mustMember(t, admin, "Anna", 1)
	slot := mustSlot(t, admin, 4, "Dinner", "19:00", attendeeBody{MemberID: anna.ID})
	url := path("/api/meal-slots/%d/attendance?date=2026-11-12", slot.ID)
	var d dateAttendanceBody
	admin.Put(url, map[string]any{"attendance": []attendeeBody{}}).MustJSON(t, &d)
	if !d.IsOverride || d.PortionsNeeded != 0 || len(d.Attendance) != 0 {
		t.Fatalf("nobody home = %+v", d)
	}
	admin.Put(url, map[string]any{"attendance": []attendeeBody{{MemberID: anna.ID, PortionFactorOverride: f64(2)}}}).MustJSON(t, &d)
	if d.PortionsNeeded != 2 {
		t.Fatalf("override factor = %+v", d)
	}
}

func TestDateAttendanceValidation(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna := mustMember(t, admin, "Anna", 1)
	slot := mustSlot(t, admin, 4, "Dinner", "19:00", attendeeBody{MemberID: anna.ID})
	base := path("/api/meal-slots/%d/attendance", slot.ID)
	body := map[string]any{"attendance": []attendeeBody{{MemberID: anna.ID}}}
	if r := admin.Put(base+"?date=2026-11-11", body); r.Status != 422 || r.ErrorCode() != "weekday_mismatch" {
		t.Errorf("Wednesday on a Thursday slot: %d %s", r.Status, r.Body)
	}
	if r := admin.Get(base + "?date=2026-11-11"); r.Status != 422 || r.ErrorCode() != "weekday_mismatch" {
		t.Errorf("GET Wednesday: %d %s", r.Status, r.Body)
	}
	if r := admin.Put(base+"?date=nope", body); r.Status != 422 || r.ErrorCode() != "validation_failed" || !strings.Contains(string(r.Body), "date") {
		t.Errorf("bad date: %d %s", r.Status, r.Body)
	}
	if r := admin.Put(base, body); r.Status != 422 || r.ErrorCode() != "validation_failed" {
		t.Errorf("missing date: %d %s", r.Status, r.Body)
	}
	if r := admin.Put(base+"?date=2026-11-12", map[string]any{"attendance": []attendeeBody{{MemberID: 9999}}}); r.Status != 422 || r.ErrorCode() != "unknown_member" {
		t.Errorf("unknown member: %d %s", r.Status, r.Body)
	}
	if r := admin.Put("/api/meal-slots/9999/attendance?date=2026-11-12", body); r.Status != 404 {
		t.Errorf("unknown slot: %d", r.Status)
	}
	if r := env.Anonymous().Get(base + "?date=2026-11-12"); r.Status != 401 {
		t.Errorf("anonymous: %d", r.Status)
	}
}

func TestAttendanceChangePublishesHouseholdEvent(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna := mustMember(t, admin, "Anna", 1)
	slot := mustSlot(t, admin, 4, "Dinner", "19:00", attendeeBody{MemberID: anna.ID})
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	defer cancel()
	admin.Put(path("/api/meal-slots/%d/attendance?date=2026-11-12", slot.ID), map[string]any{"attendance": []attendeeBody{}})
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, `"attendance"`) {
		t.Fatalf("event = %s %s", topic, data)
	}
}
