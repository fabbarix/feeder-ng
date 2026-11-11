package httpapi_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func TestNewMealSlotServesTheMainCourseOnly(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	main := courseID(t, env, "Main")
	r := admin.Post("/api/meal-slots", map[string]any{"weekday": 2, "name": "Dinner", "time": "19:30", "attendance": []any{}})
	if r.Status != 201 {
		t.Fatalf("create = %d %s", r.Status, r.Body)
	}
	var s slotC
	r.MustJSON(t, &s)
	if len(s.Courses) != 1 {
		t.Fatalf("courses = %+v, want the main Course", s.Courses)
	}
	if c := s.Courses[0]; c.ID != main || c.Name != "Main" || !c.Main || c.Optional || len(c.OptOutMemberIDs) != 0 {
		t.Errorf("course = %+v, want Main, main, required, nobody opting out", c)
	}
	// Lists, never null.
	var raw struct {
		Courses []map[string]json.RawMessage `json:"courses"`
	}
	r.MustJSON(t, &raw)
	if got := string(raw.Courses[0]["optOutMemberIds"]); got != "[]" {
		t.Errorf("optOutMemberIds = %s, want []", got)
	}
}

func TestMealSlotCoursesKeepTheirOrderOptionalFlagAndOptOuts(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna, sam := mustMember(t, admin, "Anna", 1), mustMember(t, admin, "Sam", 0.5)
	main, side, dessert := courseID(t, env, "Main"), courseID(t, env, "Side"), courseID(t, env, "Dessert")

	r := admin.Post("/api/meal-slots", map[string]any{"weekday": 7, "name": "Lunch", "time": "13:00",
		"attendance": []attendeeBody{{MemberID: anna.ID}, {MemberID: sam.ID}},
		"courses":    []any{courseSpec(side, false), courseSpec(main, true, sam.ID), courseSpec(dessert, true)}})
	if r.Status != 201 {
		t.Fatalf("create = %d %s", r.Status, r.Body)
	}
	var s slotC
	r.MustJSON(t, &s)
	want := []slotCourseBody{
		{ID: side, Name: "Side", Optional: false, OptOutMemberIDs: []int64{}},
		{ID: main, Name: "Main", Main: true, Optional: true, OptOutMemberIDs: []int64{sam.ID}},
		{ID: dessert, Name: "Dessert", Optional: true, OptOutMemberIDs: []int64{}},
	}
	check := func(label string, got []slotCourseBody) {
		if len(got) != len(want) {
			t.Fatalf("%s: courses = %+v", label, got)
		}
		for i := range want {
			g := got[i]
			if g.ID != want[i].ID || g.Name != want[i].Name || g.Main != want[i].Main || g.Optional != want[i].Optional || !sameIDs(g.OptOutMemberIDs, want[i].OptOutMemberIDs) {
				t.Errorf("%s: course %d = %+v, want %+v", label, i, g, want[i])
			}
		}
	}
	check("create answer", s.Courses)
	check("list", slotWithCourses(t, env.LoginUser(t), s.ID).Courses)
}

func TestMealSlotCoursesAreValidated(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna := mustMember(t, admin, "Anna", 1)
	main, side, starter := courseID(t, env, "Main"), courseID(t, env, "Side"), courseID(t, env, "Starter")
	mustExec(t, env, `UPDATE courses SET archived = 1 WHERE id = ?`, starter)
	post := func(courses any) *testkit.Response {
		return admin.Post("/api/meal-slots", map[string]any{"weekday": 3, "name": "Dinner", "time": "19:00", "attendance": []any{}, "courses": courses})
	}
	wantRefusal(t, "empty", post([]any{}), 422, "validation_failed", "courses", "courses_empty")
	wantRefusal(t, "all optional", post([]any{courseSpec(main, true), courseSpec(side, true)}), 422, "validation_failed", "courses", "courses_all_optional")
	wantRefusal(t, "unknown", post([]any{courseSpec(main, false), courseSpec(99999, false)}), 422, "validation_failed", "courses", "course_unknown")
	wantRefusal(t, "archived", post([]any{courseSpec(main, false), courseSpec(starter, false)}), 422, "validation_failed", "courses", "course_unknown")
	wantRefusal(t, "zero id", post([]any{courseSpec(0, false)}), 422, "validation_failed", "courses", "course_unknown")
	wantRefusal(t, "unknown opt-out Member", post([]any{courseSpec(main, false), courseSpec(side, false, anna.ID, 9999)}), 422, "validation_failed", "courses[1].optOutMemberIds", "member_unknown")
	if n := len(listSlots(t, admin)); n != 0 {
		t.Errorf("%d Meal Slots exist after the refusals", n)
	}

	// The main Course may be optional when another Course is required.
	if r := post([]any{courseSpec(main, true), courseSpec(side, false)}); r.Status != 201 {
		t.Errorf("optional main with a required Side = %d %s, want 201", r.Status, r.Body)
	}
	// The same rules hold on update.
	slot := mustSlot(t, admin, 4, "Dinner", "19:00")
	wantRefusal(t, "update: empty", putSlot(admin, slot, []any{}), 422, "validation_failed", "courses", "courses_empty")
	wantRefusal(t, "update: all optional", putSlot(admin, slot, []any{courseSpec(main, true)}), 422, "validation_failed", "courses", "courses_all_optional")
	wantRefusal(t, "update: unknown", putSlot(admin, slot, []any{courseSpec(99999, false)}), 422, "validation_failed", "courses", "course_unknown")
	wantRefusal(t, "update: unknown Member", putSlot(admin, slot, []any{courseSpec(main, false, 9999)}), 422, "validation_failed", "courses[0].optOutMemberIds", "member_unknown")
	if got := slotWithCourses(t, admin, slot.ID).Courses; len(got) != 1 || got[0].ID != main {
		t.Errorf("a refused update changed the Courses: %+v", got)
	}
}

func TestOtherValidationErrorsNameTheirFieldToo(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	r := admin.Post("/api/meal-slots", map[string]any{"weekday": 8, "name": "Dinner", "time": "19:00", "attendance": []any{}})
	var e errorBody
	r.MustJSON(t, &e)
	if r.Status != 422 || e.Error.Code != "validation_failed" || e.Error.Field != "weekday" {
		t.Errorf("weekday 8 = %d %+v, want 422 validation_failed with field weekday", r.Status, e.Error)
	}
}

func TestDuplicateCoursesAndOptOutMembersAreDropped(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna := mustMember(t, admin, "Anna", 1)
	main, side := courseID(t, env, "Main"), courseID(t, env, "Side")
	r := admin.Post("/api/meal-slots", map[string]any{"weekday": 3, "name": "Dinner", "time": "19:00", "attendance": []attendeeBody{{MemberID: anna.ID}},
		"courses": []any{courseSpec(main, false), courseSpec(side, false, anna.ID, anna.ID), courseSpec(main, true)}})
	var s slotC
	r.MustJSON(t, &s)
	if r.Status != 201 || len(s.Courses) != 2 || s.Courses[0].Optional || len(s.Courses[1].OptOutMemberIDs) != 1 {
		t.Errorf("duplicates = %d %s, want Main (first wins) and Side with Anna once", r.Status, r.Body)
	}
}

func TestAnOptOutOfAMemberWhoDoesNotAttendIsAcceptedAndKept(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna, sam := mustMember(t, admin, "Anna", 1), mustMember(t, admin, "Sam", 0.5)
	main, side := courseID(t, env, "Main"), courseID(t, env, "Side")
	r := admin.Post("/api/meal-slots", map[string]any{"weekday": 3, "name": "Dinner", "time": "19:00", "attendance": []attendeeBody{{MemberID: anna.ID}},
		"courses": []any{courseSpec(main, false), courseSpec(side, false, sam.ID)}})
	var s slotC
	r.MustJSON(t, &s)
	if r.Status != 201 || len(s.Courses) != 2 || !sameIDs(s.Courses[1].OptOutMemberIDs, []int64{sam.ID}) {
		t.Errorf("= %d %s, want Sam's opt-out kept although he does not attend", r.Status, r.Body)
	}
}

func TestAnUpdateWithoutCoursesKeepsThemAndReorderingKeepsWhoOptsOut(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna, sam := mustMember(t, admin, "Anna", 1), mustMember(t, admin, "Sam", 0.5)
	main, side := courseID(t, env, "Main"), courseID(t, env, "Side")
	slot := mustSlot(t, admin, 3, "Dinner", "19:00", attendeeBody{MemberID: anna.ID}, attendeeBody{MemberID: sam.ID})
	if r := putSlot(admin, slot, []any{courseSpec(main, false), courseSpec(side, true, sam.ID)}); r.Status != 200 {
		t.Fatalf("set Courses = %d %s", r.Status, r.Body)
	}

	// No "courses": unchanged.
	slot.Time = "20:00"
	r := putSlot(admin, slot, nil)
	var s slotC
	r.MustJSON(t, &s)
	if r.Status != 200 || s.Time != "20:00" || !sameStrings(courseNames(s.Courses), []string{"Main", "Side"}) || !s.Courses[1].Optional || !sameIDs(s.Courses[1].OptOutMemberIDs, []int64{sam.ID}) {
		t.Fatalf("update without courses = %d %s, want Courses and opt-outs untouched", r.Status, r.Body)
	}
	// A reorder that leaves opt-outs out keeps each Course's opt-outs; its optional flag is the one sent.
	r = putSlot(admin, slot, []any{courseSpec(side, false), courseSpec(main, false)})
	r.MustJSON(t, &s)
	if r.Status != 200 || !sameStrings(courseNames(s.Courses), []string{"Side", "Main"}) || !sameIDs(s.Courses[0].OptOutMemberIDs, []int64{sam.ID}) || s.Courses[0].Optional {
		t.Fatalf("reorder = %d %s, want Side first, still without Sam, now required", r.Status, r.Body)
	}
	// An empty list clears them.
	r = putSlot(admin, slot, []any{courseSpec(side, false, []int64{}...), courseSpec(main, false)})
	r.MustJSON(t, &s)
	if r.Status != 200 || len(slotCourse(t, s.Courses, 0).OptOutMemberIDs) != 0 {
		t.Errorf("explicit [] = %d %s, want the opt-outs cleared", r.Status, r.Body)
	}
}

func TestTakingACourseOffASlotDropsItsOptOutsAndUnresolvedMealsButAnswersNoRemoves(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna, sam := mustMember(t, admin, "Anna", 1), mustMember(t, admin, "Sam", 0.5)
	main, side := courseID(t, env, "Main"), courseID(t, env, "Side")
	slot := mustSlot(t, admin, 4, "Dinner", "19:00", attendeeBody{MemberID: anna.ID}, attendeeBody{MemberID: sam.ID})
	if r := putSlot(admin, slot, []any{courseSpec(main, false), courseSpec(side, false, sam.ID)}); r.Status != 200 {
		t.Fatalf("set Courses = %d %s", r.Status, r.Body)
	}
	greens := seedRecipe(t, env, "Greens", side)
	seedPlannedMeal(t, env, "2026-11-12", slot.ID, side, greens, "planned", true)
	seedPlannedMeal(t, env, "2026-11-19", slot.ID, side, greens, "planned", false)
	seedPlannedMeal(t, env, "2026-11-05", slot.ID, side, greens, "cooked", false)
	seedSlotRule(t, env, slot.ID, side, greens)

	r := putSlot(admin, slot, []any{courseSpec(main, false)})
	if r.Status != 200 {
		t.Fatalf("take Side off = %d %s", r.Status, r.Body)
	}
	var raw map[string]json.RawMessage
	r.MustJSON(t, &raw)
	if _, ok := raw["removes"]; ok {
		t.Errorf("a single-slot PATCH answers removes; the editor previews through a one-weekday batch dryRun")
	}
	if n := count(t, env, `SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND course_id = ? AND state = 'planned'`, slot.ID, side); n != 0 {
		t.Errorf("%d unresolved Side Planned Meals stayed (Pinned ones go too)", n)
	}
	if n := count(t, env, `SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND course_id = ? AND state = 'cooked'`, slot.ID, side); n != 1 {
		t.Errorf("the cooked Side meal must stay as history")
	}
	if n := count(t, env, `SELECT count(*) FROM slot_rules WHERE meal_slot_id = ? AND course_id = ?`, slot.ID, side); n != 0 {
		t.Errorf("the Slot Rule on Side stayed")
	}

	// Adding Side back starts with nobody opting out.
	var s slotC
	r = putSlot(admin, slot, []any{courseSpec(main, false), courseSpec(side, false)})
	r.MustJSON(t, &s)
	if r.Status != 200 || len(s.Courses) != 2 || len(s.Courses[1].OptOutMemberIDs) != 0 {
		t.Errorf("Side added back = %d %s, want nobody opting out", r.Status, r.Body)
	}
}

func TestSavingACourseListPublishesAMealSlotsEvent(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	main, side := courseID(t, env, "Main"), courseID(t, env, "Side")
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	defer cancel()
	r := admin.Post("/api/meal-slots", map[string]any{"weekday": 3, "name": "Dinner", "time": "19:00", "attendance": []any{}, "courses": []any{courseSpec(main, false), courseSpec(side, false)}})
	if r.Status != 201 {
		t.Fatalf("create = %d %s", r.Status, r.Body)
	}
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, `"mealSlots"`) {
		t.Errorf("create event = %s %s", topic, data)
	}
	var s slotC
	r.MustJSON(t, &s)
	putSlot(admin, s.slotBody, []any{courseSpec(side, false), courseSpec(main, false)})
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, `"mealSlots"`) {
		t.Errorf("update event = %s %s", topic, data)
	}
}
