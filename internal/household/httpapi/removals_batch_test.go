package httpapi_test

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B9-42 (SAFE-02, user ruling): Remove and Undo for a Meal Slot on several days are one call each, all or nothing.
//   POST /api/meal-slots/remove  {ids}  204; 404 not_found or 409 meal_slot_removed, each with the refused id.
//   POST /api/meal-slots/restore {ids}  200 {slots}; 409 meal_slot_name_taken naming the days; 404 not_found with the id.
// One household event per call (the replan runs once), the same permission as the single routes.

type batchErrBody struct {
	Error struct {
		Code     string  `json:"code"`
		Message  string  `json:"message"`
		ID       int64   `json:"id"`
		IDs      []int64 `json:"ids"`
		Weekdays []int   `json:"weekdays"`
		Field    string  `json:"field"`
	} `json:"error"`
}

// noMoreEvents fails when another event arrives within a short wait: the batch announces itself once.
func noMoreEvents(t *testing.T, ch <-chan events.Event) {
	t.Helper()
	select {
	case e := <-ch:
		t.Errorf("a second event %s %s: the batch must announce itself once", e.Topic, e.Data)
	case <-time.After(200 * time.Millisecond):
	}
}

func dinners(w *crsc2.World) (tue, wed int64) {
	return w.AddSlot(2, "Dinner", "19:00"), w.AddSlot(3, "Dinner", "19:00")
}

func TestBatchRemovalRoutesAreForAdminsOnly(t *testing.T) {
	w := crsc2.New(t)
	for _, p := range []string{"/api/meal-slots/remove", "/api/meal-slots/restore"} {
		body := map[string]any{"ids": []int64{w.Slot}}
		if r := w.User.Post(p, body); r.Status != 403 {
			t.Errorf("User POST %s = %d, want 403", p, r.Status)
		}
		if r := w.Env.Anonymous().Post(p, body); r.Status != 401 {
			t.Errorf("anonymous POST %s = %d, want 401", p, r.Status)
		}
	}
}

func TestBatchRemoveTakesEveryDayAwayInOneCallAndAnnouncesItOnce(t *testing.T) {
	w := crsc2.New(t)
	pasta := w.Recipe("Pasta", crsc2.RecipeSpec{})
	tue, wed := dinners(w)
	w.Settle()
	w.Meal("2026-11-02", w.Slot, w.Main, pasta, "cooked", false)
	ch, cancel := w.Env.App.Deps.Events.Subscribe("household")
	defer cancel()

	if r := w.Admin.Post("/api/meal-slots/remove", map[string]any{"ids": []int64{w.Slot, tue, wed}}); r.Status != 204 {
		t.Fatalf("remove = %d %s", r.Status, r.Body)
	}
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, `"mealSlots"`) {
		t.Errorf("event = %s %s", topic, data)
	}
	noMoreEvents(t, ch)
	var list []slotBody
	w.Admin.Get("/api/meal-slots").MustJSON(t, &list)
	if len(list) != 0 {
		t.Errorf("slots after the removal = %+v, want none", list)
	}
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND state = 'cooked'`, w.Slot); n != 1 {
		t.Errorf("%d Cooked meals, want the 1 kept", n)
	}
	var removed []removedSlotBody
	w.User.Get("/api/meal-slots?removed=with-history").MustJSON(t, &removed)
	if len(removed) != 1 || removed[0].Name != "Dinner" {
		t.Errorf("removed list = %+v", removed)
	}
}

func TestBatchRemoveRefusesTheWholeCallAndNamesTheSlot(t *testing.T) {
	w := crsc2.New(t)
	tue, wed := dinners(w)
	var e batchErrBody

	r := w.Admin.Post("/api/meal-slots/remove", map[string]any{"ids": []int64{w.Slot, 9999}})
	r.MustJSON(t, &e)
	if r.Status != 404 || e.Error.Code != "not_found" || e.Error.ID != 9999 {
		t.Errorf("unknown id = %d %s, want 404 not_found with id 9999", r.Status, r.Body)
	}
	w.Admin.Delete(slotURL(wed, ""))
	e = batchErrBody{}
	r = w.Admin.Post("/api/meal-slots/remove", map[string]any{"ids": []int64{w.Slot, tue, wed}})
	r.MustJSON(t, &e)
	if r.Status != 409 || e.Error.Code != "meal_slot_removed" || e.Error.ID != wed {
		t.Errorf("already removed = %d %s, want 409 meal_slot_removed with id %d", r.Status, r.Body, wed)
	}
	var list []slotBody
	w.Admin.Get("/api/meal-slots").MustJSON(t, &list)
	if len(list) != 2 {
		t.Errorf("%d active slots after two refused calls, want Monday and Tuesday still there", len(list))
	}
	for _, body := range []any{map[string]any{"ids": []int64{}}, map[string]any{"ids": []int64{tue, tue}}, map[string]any{}} {
		e = batchErrBody{}
		r = w.Admin.Post("/api/meal-slots/remove", body)
		r.MustJSON(t, &e)
		if r.Status != 422 || e.Error.Code != "validation_failed" || e.Error.Field != "ids" {
			t.Errorf("remove %v = %d %s, want 422 on ids", body, r.Status, r.Body)
		}
	}
}

func TestBatchRestorePutsEveryDayBackInOneCall(t *testing.T) {
	w := crsc2.New(t)
	pasta := w.Recipe("Pasta", crsc2.RecipeSpec{})
	tue, wed := dinners(w)
	w.Settle()
	w.Meal("2026-11-07", w.Slot, w.Main, pasta, "planned", false) // To confirm
	if r := w.Admin.Post("/api/meal-slots/remove", map[string]any{"ids": []int64{w.Slot, tue, wed}}); r.Status != 204 {
		t.Fatalf("remove = %d", r.Status)
	}
	w.Env.Clock.Advance(3 * time.Minute)
	ch, cancel := w.Env.App.Deps.Events.Subscribe("household")
	defer cancel()

	r := w.Admin.Post("/api/meal-slots/restore", map[string]any{"ids": []int64{w.Slot, tue, wed}})
	var out struct {
		Slots []slotBody `json:"slots"`
	}
	r.MustJSON(t, &out)
	if r.Status != 200 || len(out.Slots) != 3 || out.Slots[0].ID != w.Slot || out.Slots[1].ID != tue || out.Slots[2].ID != wed {
		t.Fatalf("restore = %d %s, want 200 with the three slots in the order asked", r.Status, r.Body)
	}
	if topic, _ := nextEvent(t, ch); topic != "household" {
		t.Errorf("event topic %s", topic)
	}
	noMoreEvents(t, ch)
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND date = '2026-11-07' AND state = 'planned'`, w.Slot); n != 1 {
		t.Errorf("%d To confirm rows after Undo, want 1", n)
	}
	var e batchErrBody
	r = w.Admin.Post("/api/meal-slots/restore", map[string]any{"ids": []int64{tue}})
	r.MustJSON(t, &e)
	if r.Status != 404 || e.Error.Code != "not_found" || e.Error.ID != tue {
		t.Errorf("restoring an active slot = %d %s, want 404 not_found with id %d", r.Status, r.Body, tue)
	}
}

func TestBatchRestoreRefusesTheWholeCallWhenANameIsTaken(t *testing.T) {
	w := crsc2.New(t)
	tue, wed := dinners(w)
	w.Admin.Post("/api/meal-slots/remove", map[string]any{"ids": []int64{w.Slot, tue, wed}})
	for _, d := range []int{1, 3} {
		if r := w.Admin.Post("/api/meal-slots", map[string]any{"weekday": d, "name": "Dinner", "time": "20:00", "attendance": []any{}}); r.Status != 201 {
			t.Fatalf("new Dinner = %d %s", r.Status, r.Body)
		}
	}
	r := w.Admin.Post("/api/meal-slots/restore", map[string]any{"ids": []int64{w.Slot, tue, wed}})
	var e batchErrBody
	r.MustJSON(t, &e)
	if r.Status != 409 || e.Error.Code != "meal_slot_name_taken" || e.Error.Message != "There is already a Dinner on Monday and Wednesday." {
		t.Fatalf("restore = %d %s, want 409 meal_slot_name_taken naming Monday and Wednesday", r.Status, r.Body)
	}
	if b, _ := json.Marshal(e.Error.Weekdays); string(b) != "[1,3]" {
		t.Errorf("weekdays = %s, want [1,3]", b)
	}
	if n := w.Count(`SELECT count(*) FROM meal_slots WHERE id = ? AND removed_at IS NULL`, tue); n != 0 {
		t.Error("Tuesday came back although the whole restore was refused")
	}
}
