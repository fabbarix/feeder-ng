package httpapi_test

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// B9-24 review: what the developer's tests left out.

func TestAChangeCannotGiveBackAMealSlotThatHasStarted(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": mon, "through": wed})
	f.Env.Clock.Set(time.Date(2026, 11, 10, 9, 0, 0, 0, time.UTC)) // Tuesday 09:00: Tuesday Breakfast has started
	f.settle()
	r := f.User.Patch(fmt.Sprintf("/api/away/%d", a.ID), map[string]any{"through": mon})
	code, field, reason, msg := errorOf(t, r)
	if r.Status != 422 || code != "validation_failed" || field != "through" || reason != "slot_started" {
		t.Fatalf("PATCH through Monday at Tuesday 09:00 = %d %s, want 422 on through (slot_started)", r.Status, r.Body)
	}
	if !strings.Contains(msg, "To bring Anna back now, end the Away.") {
		t.Errorf("message = %q, want it to point at End", msg)
	}
	if got := f.list(f.Anna); len(got) != 1 || got[0].Through == nil || *got[0].Through != wed {
		t.Errorf("the refused change was written: %+v", got)
	}
	// Ending at the Meal Slot that has started is what End does, and a PATCH may say it too.
	r = f.User.Patch(fmt.Sprintf("/api/away/%d", a.ID), map[string]any{"through": tue, "throughMealSlotId": f.tueBreakfast})
	if r.Status != 200 {
		t.Fatalf("PATCH through Tuesday Breakfast = %d %s, want 200", r.Status, r.Body)
	}
	f.settle()
	if p := f.portions(tue, f.tueDinner); p != 2 {
		t.Errorf("Tuesday Dinner = %v portions, want 2: Anna is back", p)
	}
}
