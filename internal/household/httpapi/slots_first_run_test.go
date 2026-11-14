package httpapi_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-12 (TB-06): POST /api/meal-slots/batch creates several Meal Slots in one go (the first-run "When do you eat?"
// sheet): {"slots":[{"name","time","weekdays":[1..7]}]} makes one Meal Slot per weekday, each attended by every
// Member, with no Portion Factor override and the default Courses of a new slot. It is all or nothing. 201
// {"created":[slot...]}, in the order of the request and then by weekday. Admin only. The existing PATCH
// /api/meal-slots/batch (Edit all) is not touched.

func firstRunBody(slots ...map[string]any) map[string]any { return map[string]any{"slots": slots} }

func lunchSlot() map[string]any {
	return map[string]any{"name": "Lunch", "time": "13:00", "weekdays": []int{1, 2, 3, 4, 5, 6, 7}}
}

func dinnerSlot() map[string]any {
	return map[string]any{"name": "Dinner", "time": "19:30", "weekdays": []int{1, 2, 3, 4, 5}}
}

type createdBody struct {
	Created []slotBody `json:"created"`
}

func slotCount(t *testing.T, c *testkit.Client) int {
	t.Helper()
	var list []slotBody
	c.Get("/api/meal-slots").MustJSON(t, &list)
	return len(list)
}

func TestBatchCreateMakesOneMealSlotPerWeekdayAttendedByEveryone(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna, ben := mustMember(t, admin, "Anna", 1), mustMember(t, admin, "Ben", 0.5)
	r := admin.Post("/api/meal-slots/batch", firstRunBody(lunchSlot(), dinnerSlot()))
	var out createdBody
	r.MustJSON(t, &out)
	if r.Status != 201 || len(out.Created) != 12 {
		t.Fatalf("POST = %d, %d created; want 201 and 7 Lunches + 5 Dinners: %s", r.Status, len(out.Created), r.Body)
	}
	if first := out.Created[0]; first.Name != "Lunch" || first.Weekday != 1 || first.Time != "13:00" || out.Created[6].Weekday != 7 || out.Created[7].Name != "Dinner" {
		t.Errorf("order = %+v ... %+v", first, out.Created[7])
	}
	for _, s := range out.Created {
		ids := map[int64]bool{}
		for _, a := range s.Attendance {
			ids[a.MemberID] = true
			if a.PortionFactorOverride != nil {
				t.Errorf("%s weekday %d: override %v, want none", s.Name, s.Weekday, *a.PortionFactorOverride)
			}
		}
		if len(ids) != 2 || !ids[anna.ID] || !ids[ben.ID] || s.PortionsNeeded != 1.5 {
			t.Errorf("%s weekday %d attendance = %+v, portions %v; want everyone", s.Name, s.Weekday, s.Attendance, s.PortionsNeeded)
		}
	}
	if n := slotCount(t, env.LoginUser(t)); n != 12 {
		t.Errorf("Meal Slots = %d, want 12", n)
	}
}

func TestBatchCreateIsAdminOnlyAndNeedsASignIn(t *testing.T) {
	env := testkit.Start(t)
	if r := env.LoginUser(t).Post("/api/meal-slots/batch", firstRunBody(lunchSlot())); r.Status != 403 {
		t.Errorf("User = %d", r.Status)
	}
	if r := env.Anonymous().Post("/api/meal-slots/batch", firstRunBody(lunchSlot())); r.Status != 401 {
		t.Errorf("anonymous = %d", r.Status)
	}
}

func TestBatchCreateRefusesAnEmptyNameBadTimeNoWeekdaysAndNothingToCreate(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	cases := map[string]map[string]any{
		"name":     firstRunBody(map[string]any{"name": "  ", "time": "13:00", "weekdays": []int{1}}),
		"time":     firstRunBody(map[string]any{"name": "Lunch", "time": "1pm", "weekdays": []int{1}}),
		"weekdays": firstRunBody(map[string]any{"name": "Lunch", "time": "13:00", "weekdays": []int{}}),
		"slots":    firstRunBody(),
	}
	for field, body := range cases {
		r := admin.Post("/api/meal-slots/batch", body)
		if r.Status != 422 || r.ErrorCode() != "validation_failed" || !strings.Contains(string(r.Body), field) {
			t.Errorf("%s: %d %s", field, r.Status, r.Body)
		}
	}
	body := firstRunBody(lunchSlot(), map[string]any{"name": "Dinner", "time": "19:30", "weekdays": []int{8}})
	if r := admin.Post("/api/meal-slots/batch", body); r.Status != 422 || !strings.Contains(string(r.Body), "weekdays") {
		t.Errorf("weekday 8: %d %s", r.Status, r.Body)
	}
	if n := slotCount(t, admin); n != 0 {
		t.Errorf("a refused request created %d Meal Slots, want none (all or nothing)", n)
	}
}

func TestBatchCreateFailsWholeWhenAnActiveMealSlotHasTheName(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	mustSlot(t, admin, 3, "dinner", "20:00")
	r := admin.Post("/api/meal-slots/batch", firstRunBody(lunchSlot(), dinnerSlot()))
	if r.Status != 409 || r.ErrorCode() != "duplicate_slot" {
		t.Fatalf("POST = %d %s, want 409 duplicate_slot", r.Status, r.Body)
	}
	if n := slotCount(t, admin); n != 1 {
		t.Errorf("Meal Slots = %d, want only the one that was there (no Lunch was created)", n)
	}
	twice := firstRunBody(lunchSlot(), lunchSlot())
	if r := admin.Post("/api/meal-slots/batch", twice); r.Status != 409 || r.ErrorCode() != "duplicate_slot" {
		t.Errorf("the same name twice in one request = %d %s, want 409 duplicate_slot", r.Status, r.Body)
	}
}

func TestBatchCreateCanReuseANameFreedByRemovingAMealSlot(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	old := mustSlot(t, admin, 1, "Lunch", "12:00")
	if r := admin.Delete(slotURL(old.ID, "")); r.Status != 204 {
		t.Fatalf("DELETE = %d %s", r.Status, r.Body)
	}
	var out createdBody
	r := admin.Post("/api/meal-slots/batch", firstRunBody(lunchSlot()))
	r.MustJSON(t, &out)
	if r.Status != 201 || len(out.Created) != 7 || out.Created[0].ID == old.ID {
		t.Fatalf("POST = %d %s, want 7 new Lunches (a removed Meal Slot is not a clash)", r.Status, r.Body)
	}
	if n := slotCount(t, admin); n != 7 {
		t.Errorf("Meal Slots = %d, want the 7 new ones; the removed Lunch stays out of the list", n)
	}
	// The removed one is history: its restore now meets the name taken.
	if r := admin.Post(slotURL(old.ID, "/restore"), nil); r.Status != 409 || r.ErrorCode() != "meal_slot_name_taken" {
		t.Errorf("restore = %d %s, want 409 meal_slot_name_taken", r.Status, r.Body)
	}
}

func TestBatchCreatePublishesOneMealSlotsEventAndIsTheRoutePATCHDoesNotShadow(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	defer cancel()
	admin.Post("/api/meal-slots/batch", firstRunBody(lunchSlot()))
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, "mealSlots") {
		t.Errorf("event = %s %s", topic, data)
	}
	// Edit all still answers its own verb on the same path.
	r := admin.Patch("/api/meal-slots/batch", map[string]any{"match": "Lunch", "weekdays": []int{1}, "change": map[string]any{"time": "12:30"}})
	if r.Status == 404 || r.Status == 405 {
		t.Errorf("PATCH /api/meal-slots/batch = %d, the Edit all route must stay", r.Status)
	}
}
