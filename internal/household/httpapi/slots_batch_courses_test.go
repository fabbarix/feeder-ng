package httpapi_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// PATCH /api/meal-slots/batch with set.courses, dryRun and removes (spec §16).

func TestBatchAppliesCoursesToEveryMatchingSlotAndIgnoresOptOutsOfMembersWhoDoNotAttendThere(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna, sam := mustMember(t, admin, "Anna", 1), mustMember(t, admin, "Sam", 0.5)
	main, side := courseID(t, env, "Main"), courseID(t, env, "Side")
	mon := mustSlot(t, admin, 1, "Dinner", "19:00", attendeeBody{MemberID: anna.ID}, attendeeBody{MemberID: sam.ID})
	tue := mustSlot(t, admin, 2, "Dinner", "19:00", attendeeBody{MemberID: anna.ID})

	r := admin.Patch("/api/meal-slots/batch", batch([]int{1, 2}, map[string]any{
		"courses": []any{courseSpec(main, false), courseSpec(side, true, sam.ID)}}))
	var out batchC
	r.MustJSON(t, &out)
	if r.Status != 200 || len(out.Updated) != 2 {
		t.Fatalf("batch = %d %s", r.Status, r.Body)
	}
	for _, s := range out.Updated {
		if !sameStrings(courseNames(s.Courses), []string{"Main", "Side"}) || !s.Courses[1].Optional {
			t.Errorf("%s: courses = %+v", s.Name, s.Courses)
		}
	}
	if got := slotCourse(t, slotWithCourses(t, admin, mon.ID).Courses, 1).OptOutMemberIDs; !sameIDs(got, []int64{sam.ID}) {
		t.Errorf("Monday: Side opt-outs = %v, want Sam", got)
	}
	if got := slotCourse(t, slotWithCourses(t, admin, tue.ID).Courses, 1).OptOutMemberIDs; len(got) != 0 {
		t.Errorf("Tuesday: Side opt-outs = %v; Sam does not attend there, so the batch ignores him", got)
	}
}

func TestBatchKeepsOptOutsOfKeptCoursesWhenTheyAreNotSent(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	sam := mustMember(t, admin, "Sam", 0.5)
	main, side := courseID(t, env, "Main"), courseID(t, env, "Side")
	slot := mustSlot(t, admin, 1, "Dinner", "19:00", attendeeBody{MemberID: sam.ID})
	if r := putSlot(admin, slot, []any{courseSpec(main, false), courseSpec(side, false, sam.ID)}); r.Status != 200 {
		t.Fatalf("setup = %d %s", r.Status, r.Body)
	}
	// A time-only batch and a reordering batch both keep who opts out of what.
	if r := admin.Patch("/api/meal-slots/batch", batch([]int{1}, map[string]any{"time": "18:30"})); r.Status != 200 {
		t.Fatalf("time batch = %d %s", r.Status, r.Body)
	}
	if r := admin.Patch("/api/meal-slots/batch", batch([]int{1}, map[string]any{"courses": []any{courseSpec(side, false), courseSpec(main, false)}})); r.Status != 200 {
		t.Fatalf("reorder batch = %d %s", r.Status, r.Body)
	}
	s := slotWithCourses(t, admin, slot.ID)
	if s.Time != "18:30" || !sameStrings(courseNames(s.Courses), []string{"Side", "Main"}) || !sameIDs(s.Courses[0].OptOutMemberIDs, []int64{sam.ID}) {
		t.Errorf("slot = %+v, want Side first, still without Sam", s)
	}
}

func TestBatchCourseValidationIsAllOrNothing(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	main, side := courseID(t, env, "Main"), courseID(t, env, "Side")
	mon := mustSlot(t, admin, 1, "Dinner", "19:00")
	mustSlot(t, admin, 2, "Dinner", "19:00")
	send := func(courses any) *testkit.Response {
		return admin.Patch("/api/meal-slots/batch", batch([]int{1, 2}, map[string]any{"time": "17:00", "courses": courses}))
	}
	wantRefusal(t, "empty", send([]any{}), 422, "validation_failed", "courses", "courses_empty")
	wantRefusal(t, "all optional", send([]any{courseSpec(main, true), courseSpec(side, true)}), 422, "validation_failed", "courses", "courses_all_optional")
	wantRefusal(t, "unknown", send([]any{courseSpec(99999, false)}), 422, "validation_failed", "courses", "course_unknown")
	wantRefusal(t, "unknown Member", send([]any{courseSpec(main, false, 9999)}), 422, "validation_failed", "courses[0].optOutMemberIds", "member_unknown")
	if s := slotWithCourses(t, admin, mon.ID); s.Time != "19:00" {
		t.Errorf("a refused batch changed the time to %s", s.Time)
	}
}

// removeFixture: Dinner on Monday serves Main and Side. Side has two unresolved Planned Meals (one Pinned),
// a cooked one, one before today and a Slot Rule.
type removeFixture struct {
	slot         slotBody
	main, side   int64
	greens, peas int64
	pinnedDate   string
	unpinnedDate string
	ruleID       int64
}

func seedRemovals(t *testing.T, env *testkit.Env, admin *testkit.Client) removeFixture {
	t.Helper()
	f := removeFixture{main: courseID(t, env, "Main"), side: courseID(t, env, "Side"), pinnedDate: "2026-11-23", unpinnedDate: "2026-11-16"}
	f.slot = mustSlot(t, admin, 1, "Dinner", "19:00")
	if r := putSlot(admin, f.slot, []any{courseSpec(f.main, false), courseSpec(f.side, false)}); r.Status != 200 {
		t.Fatalf("setup Courses = %d %s", r.Status, r.Body)
	}
	f.greens, f.peas = seedRecipe(t, env, "Greens", f.side), seedRecipe(t, env, "Peas", f.side)
	seedPlannedMeal(t, env, f.unpinnedDate, f.slot.ID, f.side, f.peas, "planned", false) // earlier, but not Pinned
	seedPlannedMeal(t, env, f.pinnedDate, f.slot.ID, f.side, f.greens, "planned", true)  // later, Pinned
	seedPlannedMeal(t, env, "2026-11-30", f.slot.ID, f.side, f.greens, "cooked", false)
	seedPlannedMeal(t, env, "2026-11-02", f.slot.ID, f.side, f.greens, "planned", false)
	f.ruleID = seedSlotRule(t, env, f.slot.ID, f.side, f.greens)
	return f
}

func TestBatchDryRunAnswersWhatWouldGoAndWritesNothing(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	f := seedRemovals(t, env, admin)
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	defer cancel()

	r := admin.Patch("/api/meal-slots/batch", map[string]any{"match": "Dinner", "weekdays": []int{1}, "dryRun": true,
		"set": map[string]any{"courses": []any{courseSpec(f.main, false)}}})
	var out batchC
	r.MustJSON(t, &out)
	if r.Status != 200 || out.Removes == nil || len(out.Updated) != 1 {
		t.Fatalf("dry run = %d %s", r.Status, r.Body)
	}
	if got := courseNames(out.Updated[0].Courses); !sameStrings(got, []string{"Main"}) {
		t.Errorf("updated[0].courses = %v, want the result the save would give", got)
	}
	meals := out.Removes.PlannedMeals
	if len(meals) < 2 {
		t.Fatalf("removes.plannedMeals = %+v, want the two unresolved Side meals", meals)
	}
	// Pinned ones are listed first (the dialog names them before saving), then by date.
	if !meals[0].Pinned || meals[0].Date != f.pinnedDate || meals[1].Pinned || meals[1].Date != f.unpinnedDate {
		t.Errorf("order = %+v, want the Pinned meal first", meals[:2])
	}
	seenPinnedAfterUnpinned := false
	for i, m := range meals {
		if m.Pinned && i > 0 && !meals[i-1].Pinned {
			seenPinnedAfterUnpinned = true
		}
		if m.CourseID != f.side || m.CourseName != "Side" || m.MealSlotID != f.slot.ID || m.MealSlotName != "Dinner" || m.RecipeName == "" || m.RecipeID == 0 {
			t.Errorf("removes.plannedMeals[%d] = %+v, want the real Course id and the names", i, m)
		}
	}
	if seenPinnedAfterUnpinned {
		t.Errorf("a Pinned meal comes after an unpinned one: %+v", meals)
	}
	if meals[0].RecipeName != "Greens" || meals[1].RecipeName != "Peas" {
		t.Errorf("recipe names = %q, %q", meals[0].RecipeName, meals[1].RecipeName)
	}
	rules := out.Removes.SlotRules
	if len(rules) != 1 || rules[0].ID != f.ruleID || rules[0].MealSlotID != f.slot.ID || rules[0].CourseID != f.side || rules[0].CourseName != "Side" || rules[0].RecipeID != f.greens || rules[0].RecipeName != "Greens" {
		t.Errorf("removes.slotRules = %+v", rules)
	}

	// Nothing was written and nothing was published.
	if got := slotWithCourses(t, admin, f.slot.ID).Courses; len(got) != 2 {
		t.Errorf("the dry run changed the Courses: %+v", got)
	}
	if n := count(t, env, `SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND course_id = ? AND state = 'planned'`, f.slot.ID, f.side); n != 3 {
		t.Errorf("the dry run removed Planned Meals (%d left, want 3)", n)
	}
	if n := count(t, env, `SELECT count(*) FROM slot_rules WHERE meal_slot_id = ?`, f.slot.ID); n != 1 {
		t.Errorf("the dry run removed the Slot Rule")
	}
	if got := drainHousehold(ch); strings.Contains(got, "mealSlots") {
		t.Errorf("a dry run published %s", got)
	}
}

func TestBatchSaveAnswersRemovesAndPublishesOneEvent(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	f := seedRemovals(t, env, admin)
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	defer cancel()

	r := admin.Patch("/api/meal-slots/batch", batch([]int{1}, map[string]any{"courses": []any{courseSpec(f.main, false)}}))
	var out batchC
	r.MustJSON(t, &out)
	if r.Status != 200 || out.Removes == nil || len(out.Removes.PlannedMeals) < 2 || len(out.Removes.SlotRules) != 1 {
		t.Fatalf("save = %d %s, want removes", r.Status, r.Body)
	}
	if n := count(t, env, `SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND course_id = ? AND state = 'planned'`, f.slot.ID, f.side); n != 0 {
		t.Errorf("%d unresolved Side meals stayed", n)
	}
	if n := count(t, env, `SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND course_id = ? AND state <> 'planned'`, f.slot.ID, f.side); n != 1 {
		t.Errorf("the cooked Side meal must stay")
	}
	if got := drainHousehold(ch); strings.Count(got, "mealSlots") != 1 {
		t.Errorf("events = %s, want exactly one mealSlots", got)
	}
}

func TestBatchRemovesNamesTheMainCourseByItsRealIdAndIsAlwaysPresent(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	f := seedRemovals(t, env, admin)
	seedPlannedMeal(t, env, "2026-11-16", f.slot.ID, f.main, seedRecipe(t, env, "Roast", f.main), "planned", true)

	r := admin.Patch("/api/meal-slots/batch", map[string]any{"match": "Dinner", "weekdays": []int{1}, "dryRun": true,
		"set": map[string]any{"courses": []any{courseSpec(f.side, false)}}})
	var out batchC
	r.MustJSON(t, &out)
	if r.Status != 200 || out.Removes == nil {
		t.Fatalf("dry run = %d %s", r.Status, r.Body)
	}
	found := false
	for _, m := range out.Removes.PlannedMeals {
		if m.CourseID == f.main && m.CourseName == "Main" && m.RecipeName == "Roast" && m.Pinned {
			found = true
		}
		if m.CourseID == 0 {
			t.Errorf("removes carries course 0 (the plan shim's main Course): %+v; the API always uses the real id", m)
		}
	}
	if !found {
		t.Errorf("removes.plannedMeals = %+v, want the Pinned Roast in Main with Main's real id %d", out.Removes.PlannedMeals, f.main)
	}

	// A change that removes nothing still answers removes, with empty lists (not null).
	r = admin.Patch("/api/meal-slots/batch", batch([]int{1}, map[string]any{"time": "18:00"}))
	var raw struct {
		Removes struct {
			PlannedMeals []any `json:"plannedMeals"`
			SlotRules    []any `json:"slotRules"`
		} `json:"removes"`
	}
	r.MustJSON(t, &raw)
	if r.Status != 200 || raw.Removes.PlannedMeals == nil || raw.Removes.SlotRules == nil || len(raw.Removes.PlannedMeals) != 0 || len(raw.Removes.SlotRules) != 0 {
		t.Errorf("time-only batch = %d %s, want removes with two empty lists", r.Status, r.Body)
	}
}

func TestBatchDryRunOfAnInvalidEditStillRefuses(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	main := courseID(t, env, "Main")
	mustSlot(t, admin, 1, "Dinner", "19:00")
	r := admin.Patch("/api/meal-slots/batch", map[string]any{"match": "Dinner", "weekdays": []int{1}, "dryRun": true,
		"set": map[string]any{"courses": []any{courseSpec(main, true)}}})
	wantRefusal(t, "dry run, all optional", r, 422, "validation_failed", "courses", "courses_all_optional")
	r = admin.Patch("/api/meal-slots/batch", map[string]any{"match": "Lunch", "weekdays": []int{1}, "dryRun": true, "set": map[string]any{"time": "12:00"}})
	if r.Status != 422 || r.ErrorCode() != "no_matching_slot" {
		t.Errorf("dry run with no Matching Meal Slot = %d %s", r.Status, r.Body)
	}
}
