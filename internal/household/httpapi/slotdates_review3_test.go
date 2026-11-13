package httpapi_test

import (
	"os"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B5-SD review round 3 (PM decisions). Today is Monday 2026-11-09 12:00; the Dinner is at 19:00.

// 3a: the handlers are thin. PATCH parses, calls Store.PatchSlotDate (one transaction) and responds; the
// "emptied while started" check lives in SaveWhoIsEating's transaction, not in the handler.
func TestTheSlotDateHandlersOnlyParseCallAndRespond(t *testing.T) {
	src, err := os.ReadFile("slotdates.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(src)
	start := strings.Index(text, "func (a *api) patchSlotDate(")
	if start < 0 {
		t.Fatal("patchSlotDate not found")
	}
	body := text[start:]
	if end := strings.Index(body, "\n}\n"); end > 0 {
		body = body[:end]
	}
	if !strings.Contains(body, ".PatchSlotDate(") {
		t.Error("patchSlotDate does not call Store.PatchSlotDate: the read / serve again / apply / save must run in one store transaction")
	}
	for _, forbidden := range []string{".SaveSlotDate(", ".ServeAgain("} {
		if strings.Contains(body, forbidden) {
			t.Errorf("patchSlotDate calls %s itself; that belongs to the store's transaction", forbidden)
		}
	}
	if strings.Contains(text, "func (a *api) checkNotEmptiedWhileStarted(") {
		t.Error("checkNotEmptiedWhileStarted is still in the handler package: move the check into Store.SaveWhoIsEating")
	}
	meals, err := os.ReadFile("meals.go")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(meals), "checkNotEmptiedWhileStarted") {
		t.Error("the attendance PUT handler still runs the emptied-while-started check itself")
	}
}

// 3b: a Guests-only PUT of 0 that leaves a started slot with no Member and no Guest is refused like emptying Members.
func TestTakingTheLastGuestAwayFromAStartedSlotIsRefused(t *testing.T) {
	for _, state := range []string{"cooked", "skipped"} {
		w := crsc2.New(t)
		roast := sdRecipe(w)
		w.Settle()
		if r := w.User.Put(whoURL(w, sdToday), map[string]any{"attendance": []attendeeBody{}, "guests": 2}); r.Status != 200 {
			t.Fatalf("PUT = %d %s", r.Status, r.Body)
		}
		sdSettle(t, w)
		w.Exec(`DELETE FROM planned_meals WHERE date = ?`, sdToday) // the replan may have planned the Guests' Dinner
		w.Meal(sdToday, w.Slot, w.Main, roast, state, false)
		r := w.User.Put(whoURL(w, sdToday), map[string]any{"guests": 0})
		var e errorBody
		r.MustJSON(t, &e)
		if r.Status != 409 || e.Error.Code != "slot_started" {
			t.Errorf("%s: PUT guests 0 = %d %s, want 409 slot_started", state, r.Status, r.Body)
		}
		if b := whoGet(t, w, sdToday); b.Guests != 2 {
			t.Errorf("%s: Guests = %d, want the 2 kept (nothing written)", state, b.Guests)
		}
		if d := sdGet(t, w, sdToday); d.NotServed {
			t.Errorf("%s: date = %+v, want it still served", state, d)
		}
		// With the usual Members present, Guests 0 on a started slot is fine.
		if r := w.User.Put(whoURL(w, sdToday), map[string]any{"attendance": []attendeeBody{{MemberID: w.Anna}}, "guests": 0}); r.Status != 200 {
			t.Errorf("%s: PUT Anna and no Guests = %d %s, want 200", state, r.Status, r.Body)
		}
	}
}

// 3c: the dry run lists exactly what Not served removes. A meal whose slot instant is already over stays in To
// confirm, so it is not listed, and the real change leaves it alone.
func TestTheDryRunDoesNotListAMealWhoseSlotIsAlreadyOver(t *testing.T) {
	w := crsc2.New(t)
	roast := sdRecipe(w)
	w.Settle()
	// 08:00 today is before "now" (12:00): the slot is over.
	if r := w.User.Patch(sdURL(w, sdToday), map[string]any{"time": "08:00"}); r.Status != 200 {
		t.Fatalf("time = %d %s", r.Status, r.Body)
	}
	sdSettle(t, w)
	w.Meal(sdToday, w.Slot, w.Main, roast, "planned", true)
	w.Meal(sdToday, w.Slot, w.Side, roast, "planned", false)
	r := w.User.Patch(sdURL(w, sdToday)+"?dryRun=1", map[string]any{"notServed": true})
	var out struct {
		Removes struct {
			PlannedMeals []removedBody `json:"plannedMeals"`
		} `json:"removes"`
	}
	r.MustJSON(t, &out)
	if r.Status != 200 || out.Removes.PlannedMeals == nil || len(out.Removes.PlannedMeals) != 0 {
		t.Errorf("dry run = %d %s, want an empty list: the meals of a slot that is over are not removed", r.Status, r.Body)
	}
	if r := w.User.Patch(sdURL(w, sdToday), map[string]any{"notServed": true}); r.Status != 200 {
		t.Fatalf("PATCH = %d %s", r.Status, r.Body)
	}
	sdSettle(t, w)
	if n := sdMeals(w, sdToday); n != 2 {
		t.Errorf("%d Planned Meals after Not served, want both kept (they wait in To confirm)", n)
	}
}

// 3f: Reset to usual Attendance on an emptied date (Not served by U1) serves the date again, with 0 Guests.
func TestResetOfAnEmptiedDateServesItAgain(t *testing.T) {
	w := crsc2.New(t)
	w.User.Patch(sdURL(w, sdToday), map[string]any{"time": "20:00"})
	if r := w.User.Put(whoURL(w, sdToday), map[string]any{"attendance": []attendeeBody{}}); r.Status != 200 {
		t.Fatalf("PUT = %d %s", r.Status, r.Body)
	}
	if d := sdGet(t, w, sdToday); !d.NotServed {
		t.Fatalf("date = %+v, want Not served after emptying", d)
	}
	if r := w.User.Delete(whoURL(w, sdToday)); r.Status != 204 {
		t.Fatalf("DELETE = %d %s", r.Status, r.Body)
	}
	d := sdGet(t, w, sdToday)
	if d.NotServed || d.Guests != 0 || d.Time == nil || *d.Time != "20:00" {
		t.Errorf("date = %+v, want served again, 0 Guests and 20:00 kept", d)
	}
	if b := whoGet(t, w, sdToday); b.IsOverride || len(b.Attendance) != 2 {
		t.Errorf("attendance = %+v, want the usual two Members", b)
	}
}

// 3g: a time change on a past date is refused 422 date_past (also in TestSlotDatePatchIsValidated); the same time as
// the stored one is not a change.
func TestATimeChangeOnAPastDateIsRefusedAndWritesNothing(t *testing.T) {
	w := crsc2.New(t)
	r := w.User.Patch(sdURL(w, sdPast), map[string]any{"time": "20:00"})
	wantRefusal(t, "a time on a past date", r, 422, "validation_failed", "time", "date_past")
	r = w.User.Patch(sdURL(w, sdPast), map[string]any{"time": nil})
	if r.Status != 200 {
		t.Errorf("time null on a past date with no time of its own = %d %s, want 200 (no change)", r.Status, r.Body)
	}
	if n := w.Count(`SELECT count(*) FROM meal_slot_dates`); n != 0 {
		t.Errorf("%d rows written, want none", n)
	}
}

// 3h: emptying Who's eating on a started slot stays refused with 409 slot_started (TestEmptyingAStartedSlotIsRefused).
