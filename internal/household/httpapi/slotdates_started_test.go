package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B5-SD, PM decision on the test author's question 3: emptying Who's eating on a Meal Slot that has started on that
// date (a Course Cooked or Not cooked) is refused with 409 slot_started, consistent with U2. Team B5-SD, test-first.

func TestEmptyingAStartedSlotIsRefused(t *testing.T) {
	for _, state := range []string{"cooked", "skipped"} {
		w := crsc2.New(t)
		roast := sdRecipe(w)
		w.Settle()
		w.Meal(sdToday, w.Slot, w.Main, roast, state, false)
		r := w.User.Put(whoURL(w, sdToday), map[string]any{"attendance": []attendeeBody{}})
		var e errorBody
		r.MustJSON(t, &e)
		if r.Status != 409 || e.Error.Code != "slot_started" {
			t.Errorf("%s: PUT emptying = %d %s, want 409 slot_started", state, r.Status, r.Body)
		}
		if b := whoGet(t, w, sdToday); b.IsOverride || len(b.Attendance) != 2 {
			t.Errorf("%s: attendance = %+v, want the usual two Members (nothing written)", state, b)
		}
	}
}
