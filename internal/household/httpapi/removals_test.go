package httpapi_test

import (
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/testkit"
	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B9-04 (SAFE-02, SET-15, ADR 0021): the removal routes. The fixture is crsc2: Monday Dinner at 19:00 serving Main
// then Side for Anna and Sam; today is Monday 2026-11-09 12:00. Red until the routes exist.

type slotImpactBody struct {
	PlannedMeals []struct {
		Date       string `json:"date"`
		MealSlotID int64  `json:"mealSlotId"`
		CourseName string `json:"courseName"`
		RecipeName string `json:"recipeName"`
		Pinned     bool   `json:"pinned"`
	} `json:"plannedMeals"`
	SlotRules []struct {
		ID         int64  `json:"id"`
		RecipeName string `json:"recipeName"`
	} `json:"slotRules"`
	ToConfirm []struct {
		Date       string `json:"date"`
		RecipeName string `json:"recipeName"`
	} `json:"toConfirm"`
	CookedKept int `json:"cookedKept"`
}

type removedSlotBody struct {
	IDs            []int64 `json:"ids"`
	Name           string  `json:"name"`
	Weekdays       []int   `json:"weekdays"`
	Time           string  `json:"time"`
	RemovedAt      string  `json:"removedAt"`
	CookedCount    int     `json:"cookedCount"`
	NotCookedCount int     `json:"notCookedCount"`
}

type memberImpactBody struct {
	Preferences int `json:"preferences"`
	MealSlots   int `json:"mealSlots"`
	SignIn      *struct {
		Email string `json:"email"`
	} `json:"signIn"`
}

func slotURL(id int64, rest string) string { return path("/api/meal-slots/%d%s", id, rest) }

func TestRemovalRoutesAreForAdminsOnlyExceptTheRemovedSlotsRead(t *testing.T) {
	w := crsc2.New(t)
	for _, c := range []struct{ method, path string }{
		{"GET", slotURL(w.Slot, "/impact")},
		{"POST", slotURL(w.Slot, "/restore")},
		{"GET", path("/api/members/%d/impact", w.Sam)},
		{"POST", path("/api/members/%d/restore", w.Sam)},
	} {
		if r := w.User.Do(c.method, c.path, nil); r.Status != 403 {
			t.Errorf("User %s %s = %d, want 403", c.method, c.path, r.Status)
		}
		if r := w.Env.Anonymous().Do(c.method, c.path, nil); r.Status != 401 {
			t.Errorf("anonymous %s %s = %d, want 401", c.method, c.path, r.Status)
		}
	}
	if r := w.User.Get("/api/meal-slots?removed=with-history"); r.Status != 200 {
		t.Errorf("a plain User reads the Removed Meal Slots tile: %d %s", r.Status, r.Body)
	}
	if r := w.Env.Anonymous().Get("/api/meal-slots?removed=with-history"); r.Status != 401 {
		t.Errorf("anonymous removed read = %d", r.Status)
	}
}

func TestMealSlotImpactListsWhatGoesAndWhatStays(t *testing.T) {
	w := crsc2.New(t)
	pasta := w.Recipe("Pasta al pomodoro", crsc2.RecipeSpec{})
	w.Settle()
	w.Meal("2026-11-07", w.Slot, w.Main, pasta, "planned", false) // To confirm
	w.Meal("2026-11-02", w.Slot, w.Main, pasta, "cooked", false)
	w.Meal("2026-11-09", w.Slot, w.Main, pasta, "planned", true)
	w.Meal("2026-11-16", w.Slot, w.Main, pasta, "planned", false)
	w.Exec(`INSERT INTO slot_rules (meal_slot_id, course_id, recipe_id) VALUES (?, ?, ?)`, w.Slot, w.Main, pasta)

	r := w.Admin.Get(slotURL(w.Slot, "/impact"))
	if r.Status != 200 {
		t.Fatalf("impact = %d %s", r.Status, r.Body)
	}
	var got slotImpactBody
	r.MustJSON(t, &got)
	if len(got.PlannedMeals) != 2 || got.PlannedMeals[0].RecipeName != "Pasta al pomodoro" || got.PlannedMeals[0].CourseName == "" {
		t.Errorf("plannedMeals = %+v, want the 2 meals from today with their Recipe and Course names", got.PlannedMeals)
	}
	pinned := 0
	for _, m := range got.PlannedMeals {
		if m.Pinned {
			pinned++
		}
		if m.MealSlotID != w.Slot {
			t.Errorf("plannedMeals mealSlotId = %d", m.MealSlotID)
		}
	}
	if pinned != 1 {
		t.Errorf("%d pinned planned meals, want 1", pinned)
	}
	if len(got.SlotRules) != 1 || got.SlotRules[0].RecipeName != "Pasta al pomodoro" {
		t.Errorf("slotRules = %+v", got.SlotRules)
	}
	if len(got.ToConfirm) != 1 || got.ToConfirm[0].Date != "2026-11-07" {
		t.Errorf("toConfirm = %+v, want the 7 Nov meal", got.ToConfirm)
	}
	if got.CookedKept != 1 {
		t.Errorf("cookedKept = %d, want 1", got.CookedKept)
	}
	if !strings.Contains(string(r.Body), `"toConfirm":[`) || !strings.Contains(string(r.Body), `"slotRules":[`) {
		t.Errorf("lists must be [] and never null: %s", r.Body)
	}
	// Nothing changed.
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ?`, w.Slot); n != 4 {
		t.Errorf("impact is read-only: %d meals left", n)
	}
	if r := w.Admin.Get(slotURL(9999, "/impact")); r.Status != 404 {
		t.Errorf("impact of an unknown slot = %d", r.Status)
	}
}

func TestRemovingAMealSlotKeepsItsCookedMealsAndAnnouncesIt(t *testing.T) {
	w := crsc2.New(t)
	pasta := w.Recipe("Pasta", crsc2.RecipeSpec{})
	w.Settle()
	w.Meal("2026-11-02", w.Slot, w.Main, pasta, "cooked", false)
	w.Meal("2026-11-16", w.Slot, w.Main, pasta, "planned", false)
	ch, cancel := w.Env.App.Deps.Events.Subscribe("household")
	defer cancel()

	if r := w.Admin.Delete(slotURL(w.Slot, "")); r.Status != 204 {
		t.Fatalf("DELETE = %d %s", r.Status, r.Body)
	}
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, `"mealSlots"`) {
		t.Errorf("event = %s %s, want household changed mealSlots", topic, data)
	}
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND state = 'cooked'`, w.Slot); n != 1 {
		t.Errorf("%d Cooked meals after the removal, want 1 (history is kept)", n)
	}
	var list []slotBody
	w.Admin.Get("/api/meal-slots").MustJSON(t, &list)
	for _, s := range list {
		if s.ID == w.Slot {
			t.Errorf("GET /api/meal-slots still lists the removed Meal Slot: %+v", s)
		}
	}
	if r := w.Admin.Delete(slotURL(w.Slot, "")); r.Status != 404 {
		t.Errorf("a second DELETE = %d, want 404", r.Status)
	}
	if r := w.Admin.Patch(slotURL(w.Slot, ""), map[string]any{"weekday": 1, "name": "Dinner", "time": "20:00", "attendance": []any{}}); r.Status != 404 {
		t.Errorf("PATCH of a removed Meal Slot = %d, want 404", r.Status)
	}
	for _, c := range []struct{ method, path string }{
		{"GET", slotURL(w.Slot, "/attendance?date=2026-11-16")},
		{"GET", slotURL(w.Slot, "/dates/2026-11-16")},
	} {
		if r := w.User.Do(c.method, c.path, nil); r.Status != 404 {
			t.Errorf("%s %s on a removed Meal Slot = %d, want 404", c.method, c.path, r.Status)
		}
	}
	if r := w.User.Put(slotURL(w.Slot, "/attendance?date=2026-11-16"), map[string]any{"attendance": []attendeeBody{{MemberID: w.Anna}}}); r.Status != 404 {
		t.Errorf("PUT attendance on a removed Meal Slot = %d, want 404", r.Status)
	}
}

func TestANewDinnerOnMondayCanBeAddedAfterTheOldOneWasRemoved(t *testing.T) {
	w := crsc2.New(t)
	if r := w.Admin.Post("/api/meal-slots", map[string]any{"weekday": 1, "name": "Dinner", "time": "20:00", "attendance": []any{}}); r.Status != 409 || r.ErrorCode() != "duplicate_slot" {
		t.Fatalf("a second active Dinner = %d %s", r.Status, r.Body)
	}
	if r := w.Admin.Delete(slotURL(w.Slot, "")); r.Status != 204 {
		t.Fatalf("DELETE = %d", r.Status)
	}
	r := w.Admin.Post("/api/meal-slots", map[string]any{"weekday": 1, "name": "Dinner", "time": "20:00", "attendance": []any{}})
	var fresh slotBody
	r.MustJSON(t, &fresh)
	if r.Status != 201 || fresh.ID == w.Slot {
		t.Fatalf("new Dinner = %d %s, want 201 with a new id", r.Status, r.Body)
	}
}

func TestRestoringAMealSlotPutsItBackAndRefusesATakenName(t *testing.T) {
	w := crsc2.New(t)
	w.Admin.Delete(slotURL(w.Slot, ""))
	fresh := w.Admin.Post("/api/meal-slots", map[string]any{"weekday": 1, "name": "Dinner", "time": "20:00", "attendance": []any{}})
	var f slotBody
	fresh.MustJSON(t, &f)
	r := w.Admin.Post(slotURL(w.Slot, "/restore"), nil)
	if r.Status != 409 || r.ErrorCode() != "meal_slot_name_taken" || !strings.Contains(string(r.Body), "There is already a Dinner on Monday.") {
		t.Fatalf("restore over a taken name = %d %s, want 409 meal_slot_name_taken naming Dinner on Monday", r.Status, r.Body)
	}
	w.Admin.Delete(slotURL(f.ID, ""))
	ch, cancel := w.Env.App.Deps.Events.Subscribe("household")
	defer cancel()
	r = w.Admin.Post(slotURL(w.Slot, "/restore"), nil)
	var back slotBody
	r.MustJSON(t, &back)
	if r.Status != 200 || back.ID != w.Slot || back.Name != "Dinner" || back.Weekday != 1 || len(back.Attendance) != 2 || w.Count(`SELECT count(*) FROM meal_slot_courses WHERE meal_slot_id = ?`, w.Slot) != 2 {
		t.Fatalf("restore = %d %s, want the Dinner back with its Attendance and Courses", r.Status, r.Body)
	}
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, `"mealSlots"`) {
		t.Errorf("event = %s %s", topic, data)
	}
	var list []slotBody
	w.Admin.Get("/api/meal-slots").MustJSON(t, &list)
	if len(list) != 1 || list[0].ID != w.Slot {
		t.Errorf("slots = %+v, want just the restored Dinner", list)
	}
	if r := w.Admin.Post(slotURL(w.Slot, "/restore"), nil); r.Status != 404 {
		t.Errorf("restoring an active Meal Slot = %d, want 404", r.Status)
	}
	if r := w.Admin.Post(slotURL(9999, "/restore"), nil); r.Status != 404 {
		t.Errorf("restoring an unknown Meal Slot = %d, want 404", r.Status)
	}
}

func TestRestoringAMealSlotBringsBackItsToConfirmRowsOnlyWithinTenMinutes(t *testing.T) {
	w := crsc2.New(t)
	pasta := w.Recipe("Pasta", crsc2.RecipeSpec{})
	w.Settle()
	w.Meal("2026-11-07", w.Slot, w.Main, pasta, "planned", false)
	w.Admin.Delete(slotURL(w.Slot, ""))
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND date = '2026-11-07'`, w.Slot); n != 0 {
		t.Fatalf("the To confirm row stays after the removal (%d rows)", n)
	}
	w.Env.Clock.Advance(5 * time.Minute)
	if r := w.Admin.Post(slotURL(w.Slot, "/restore"), nil); r.Status != 200 {
		t.Fatalf("restore = %d %s", r.Status, r.Body)
	}
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND date = '2026-11-07' AND state = 'planned'`, w.Slot); n != 1 {
		t.Errorf("%d To confirm rows after Undo within 10 minutes, want 1", n)
	}
	w.Admin.Delete(slotURL(w.Slot, ""))
	w.Env.Clock.Advance(15 * time.Minute)
	w.Admin.Post(slotURL(w.Slot, "/restore"), nil)
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND date = '2026-11-07'`, w.Slot); n != 0 {
		t.Errorf("%d To confirm rows came back after 15 minutes, want none", n)
	}
}

func TestRemovedMealSlotsWithHistoryAreListedForThePutBackTile(t *testing.T) {
	w := crsc2.New(t)
	pasta := w.Recipe("Pasta", crsc2.RecipeSpec{})
	snackMon := w.AddSlot(1, "Snack", "16:30", w.Main)
	snackWed := w.AddSlot(3, "Snack", "16:30", w.Main)
	tea := w.AddSlot(5, "Tea", "16:00", w.Main)
	w.Settle()
	w.Meal("2026-11-02", snackMon, w.Main, pasta, "cooked", false)
	w.Meal("2026-10-26", snackMon, w.Main, pasta, "cooked", false)
	w.Meal("2026-11-04", snackWed, w.Main, pasta, "skipped", false)
	for _, id := range []int64{snackMon, snackWed, tea} {
		if r := w.Admin.Delete(slotURL(id, "")); r.Status != 204 {
			t.Fatalf("DELETE %d = %d", id, r.Status)
		}
	}
	r := w.User.Get("/api/meal-slots?removed=with-history")
	if r.Status != 200 {
		t.Fatalf("removed = %d %s", r.Status, r.Body)
	}
	var got []removedSlotBody
	r.MustJSON(t, &got)
	if len(got) != 1 {
		t.Fatalf("removed = %+v, want the one Snack row (Tea has no history)", got)
	}
	s := got[0]
	if s.Name != "Snack" || len(s.IDs) != 2 || s.IDs[0] != snackMon || s.IDs[1] != snackWed || len(s.Weekdays) != 2 || s.Weekdays[0] != 1 || s.Weekdays[1] != 3 ||
		s.Time != "16:30" || s.CookedCount != 2 || s.NotCookedCount != 1 || s.RemovedAt == "" {
		t.Errorf("row = %+v, want Snack on Mon and Wed, 16:30, 2 Cooked, 1 Not cooked", s)
	}
	var active []slotBody
	w.User.Get("/api/meal-slots").MustJSON(t, &active)
	for _, a := range active {
		if a.Name == "Snack" || a.Name == "Tea" {
			t.Errorf("the plain list shows a removed Meal Slot: %+v", a)
		}
	}
	if r := w.Admin.Post(slotURL(snackMon, "/restore"), nil); r.Status != 200 {
		t.Fatalf("restore Monday = %d", r.Status)
	}
	w.User.Get("/api/meal-slots?removed=with-history").MustJSON(t, &got)
	if len(got) != 1 || len(got[0].IDs) != 1 || got[0].IDs[0] != snackWed {
		t.Errorf("removed after putting one weekday back = %+v, want only Wednesday's", got)
	}
	if r := w.User.Get("/api/meal-slots?removed=nonsense"); r.Status != 400 && r.Status != 422 {
		t.Errorf("an unknown removed filter = %d, want 400 or 422", r.Status)
	}
}

func TestRecipeLastCookedIsUnchangedWhenItsMealSlotIsRemoved(t *testing.T) {
	w := crsc2.New(t)
	pasta := w.Recipe("Pasta", crsc2.RecipeSpec{})
	w.Settle()
	w.Meal("2026-11-02", w.Slot, w.Main, pasta, "cooked", false)
	last := func() string {
		var rb struct {
			LastCookedOn *string `json:"lastCookedOn"`
		}
		w.User.Get(path("/api/recipes/%d", pasta)).MustJSON(t, &rb)
		if rb.LastCookedOn == nil {
			return ""
		}
		return *rb.LastCookedOn
	}
	if got := last(); got != "2026-11-02" {
		t.Fatalf("setup: lastCookedOn = %q", got)
	}
	w.Admin.Delete(slotURL(w.Slot, ""))
	if got := last(); got != "2026-11-02" {
		t.Errorf("lastCookedOn = %q after the Meal Slot was removed, want 2026-11-02", got)
	}
}

// ---- Members ----

func TestMemberImpactCountsPreferencesAttendanceAndSignIn(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	var sam memberBody
	r := admin.Post("/api/members", map[string]any{"name": "Sam", "colour": "#e07a5f", "portionFactor": 0.5, "email": "sam@example.test"})
	r.MustJSON(t, &sam)
	anna := mustMember(t, admin, "Anna", 1)
	mustSlot(t, admin, 1, "Dinner", "19:00", attendeeBody{MemberID: sam.ID}, attendeeBody{MemberID: anna.ID})
	mustSlot(t, admin, 2, "Dinner", "19:00", attendeeBody{MemberID: sam.ID})
	mustSlot(t, admin, 3, "Dinner", "19:00", attendeeBody{MemberID: anna.ID})
	if _, err := env.DB.Exec(`INSERT INTO recipes (name, yield, created_at, updated_at) VALUES ('Pasta', 2, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := env.DB.Exec(`INSERT INTO member_recipe_preferences (member_id, recipe_id, state) SELECT ?, id, 'favourite' FROM recipes`, sam.ID); err != nil {
		t.Fatal(err)
	}

	r = admin.Get(path("/api/members/%d/impact", sam.ID))
	var got memberImpactBody
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Preferences != 1 || got.MealSlots != 2 || got.SignIn == nil || got.SignIn.Email != "sam@example.test" {
		t.Errorf("Sam's impact = %d %s, want 1 preference, 2 Meal Slots and the sign-in address", r.Status, r.Body)
	}
	var none memberImpactBody
	admin.Get(path("/api/members/%d/impact", anna.ID)).MustJSON(t, &none)
	if none.SignIn != nil || none.MealSlots != 2 {
		t.Errorf("Anna's impact = %+v, want no sign-in (null) and 2 Meal Slots", none)
	}
	if body := string(admin.Get(path("/api/members/%d/impact", anna.ID)).Body); !strings.Contains(body, `"signIn":null`) {
		t.Errorf("a Member without an address has signIn null, got %s", body)
	}
	if r := admin.Get("/api/members/9999/impact"); r.Status != 404 {
		t.Errorf("impact of an unknown Member = %d", r.Status)
	}
}

func TestUndoPutsARemovedMemberBackWithTheSameIdAndAttendance(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	var sam memberBody
	admin.Post("/api/members", map[string]any{"name": "Sam", "colour": "#e07a5f", "avatar": "🦊", "portionFactor": 0.5, "email": "sam@example.test"}).MustJSON(t, &sam)
	anna := mustMember(t, admin, "Anna", 1)
	slot := mustSlot(t, admin, 4, "Dinner", "19:00", attendeeBody{MemberID: anna.ID}, attendeeBody{MemberID: sam.ID})
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	defer cancel()

	if r := admin.Delete(path("/api/members/%d", sam.ID)); r.Status != 204 {
		t.Fatalf("DELETE = %d", r.Status)
	}
	nextEvent(t, ch)
	var list []slotBody
	admin.Get("/api/meal-slots").MustJSON(t, &list)
	if len(list[0].Attendance) != 1 || list[0].PortionsNeeded != 1 {
		t.Fatalf("slot after removal = %+v", list[0])
	}

	r := admin.Post(path("/api/members/%d/restore", sam.ID), nil)
	var back memberBody
	r.MustJSON(t, &back)
	if r.Status != 200 || back.ID != sam.ID || back.Name != "Sam" || back.Avatar != "🦊" || back.PortionFactor != 0.5 {
		t.Fatalf("restore = %d %s, want Sam with the same id and fields", r.Status, r.Body)
	}
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, `"members"`) {
		t.Errorf("event = %s %s, want household changed members", topic, data)
	}
	admin.Get("/api/meal-slots").MustJSON(t, &list)
	if len(list) != 1 || list[0].ID != slot.ID || len(list[0].Attendance) != 2 || list[0].PortionsNeeded != 1.5 {
		t.Errorf("slot after Undo = %+v, want both back at 1.5 portions", list)
	}
	if r := admin.Post(path("/api/members/%d/restore", sam.ID), nil); r.Status != 404 {
		t.Errorf("a second restore = %d, want 404 (once)", r.Status)
	}
}

func TestUndoOfARemovedMemberIsRefusedWhenTheAddressIsTakenOrTheWindowEnded(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	var sam memberBody
	admin.Post("/api/members", map[string]any{"name": "Sam", "colour": "#e07a5f", "portionFactor": 1, "email": "sam@example.test"}).MustJSON(t, &sam)
	admin.Delete(path("/api/members/%d", sam.ID))
	if r := admin.Post("/api/members", map[string]any{"name": "Other", "colour": "#000000", "portionFactor": 1, "email": "sam@example.test"}); r.Status != 201 {
		t.Fatalf("the freed address = %d %s", r.Status, r.Body)
	}
	if r := admin.Post(path("/api/members/%d/restore", sam.ID), nil); r.Status != 409 || r.ErrorCode() != "email_taken" {
		t.Errorf("restore over a taken address = %d %s, want 409 email_taken", r.Status, r.Body)
	}
	var pia memberBody
	admin.Post("/api/members", map[string]any{"name": "Pia", "colour": "#000000", "portionFactor": 1}).MustJSON(t, &pia)
	admin.Delete(path("/api/members/%d", pia.ID))
	env.Clock.Advance(10*time.Minute + time.Second)
	if r := admin.Post(path("/api/members/%d/restore", pia.ID), nil); r.Status != 404 {
		t.Errorf("restore after the window = %d, want 404", r.Status)
	}
	if r := admin.Post("/api/members/9999/restore", nil); r.Status != 404 {
		t.Errorf("restore of an unknown Member = %d, want 404", r.Status)
	}
}
