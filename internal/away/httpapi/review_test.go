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

func TestADryRunOfAChangeCountsOnlyTheMealSlotsWithoutTheMemberAndMarksThoseItGivesBack(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": tue, "through": wed})
	f.settle()
	ch, cancel := f.Env.App.Deps.Events.Subscribe("household", "plan")
	defer cancel()
	before := f.revision()
	r := f.User.Patch(fmt.Sprintf("/api/away/%d?dryRun=1", a.ID), map[string]any{"through": tue})
	if r.Status != 200 {
		t.Fatalf("dry run = %d %s", r.Status, r.Body)
	}
	var s struct {
		SlotsWithout int `json:"slotsWithout"`
		MealsChanged int `json:"mealsChanged"`
		Days         []struct {
			Date  string `json:"date"`
			Slots []struct {
				MealSlotID     int64   `json:"mealSlotId"`
				PortionsBefore float64 `json:"portionsBefore"`
				PortionsAfter  float64 `json:"portionsAfter"`
				Changes        bool    `json:"changes"`
				Back           bool    `json:"back"`
			} `json:"slots"`
		} `json:"days"`
		UndoToken string `json:"undoToken"`
	}
	r.MustJSON(t, &s)
	if s.SlotsWithout != 2 || s.MealsChanged != 1 {
		t.Errorf("summary = %s, want 2 Meal Slots without Anna (Tuesday) and 1 meal changing (Wednesday Dinner, back to 2)", r.Body)
	}
	if n := len(s.Days); n != 2 || s.Days[1].Date != wed || len(s.Days[1].Slots) != 1 {
		t.Fatalf("days = %s, want Tuesday and Wednesday", r.Body)
	}
	if w := s.Days[1].Slots[0]; w.MealSlotID != f.wedDinner || !w.Back || !w.Changes || w.PortionsBefore != 1 || w.PortionsAfter != 2 {
		t.Errorf("Wednesday Dinner = %+v, want back, 1 → 2", w)
	}
	for _, sl := range s.Days[0].Slots {
		if sl.Back {
			t.Errorf("Tuesday slot %d marked back: Anna still misses it", sl.MealSlotID)
		}
	}
	if s.UndoToken != "" || f.revision() != before {
		t.Errorf("a dry run of a change issued a token (%q) or replanned", s.UndoToken)
	}
	if got := f.list(f.Anna); len(got) != 1 || got[0].Through == nil || *got[0].Through != wed {
		t.Errorf("a dry run of a change wrote it: %+v", got)
	}
	select {
	case e := <-ch:
		t.Errorf("a dry run of a change published %s", e.Data)
	case <-time.After(200 * time.Millisecond):
	}
}

func TestEatsHereAnywayIsNotShownOnceTheAwayIsDeleted(t *testing.T) {
	f := newFixture(t)
	a := f.add(f.Anna, map[string]any{"from": tue, "through": wed})
	if r := f.putDate(f.tueDinner, tue, map[string]any{"attendance": []map[string]any{{"memberId": f.Anna, "despiteAway": true}, {"memberId": f.Sam}}}); r.Status != 200 {
		t.Fatalf("PUT attendance = %d %s", r.Status, r.Body)
	}
	if r := f.User.Delete(fmt.Sprintf("/api/away/%d", a.ID)); r.Status != 200 {
		t.Fatalf("DELETE = %d %s", r.Status, r.Body)
	}
	f.settle()
	r := f.User.Get(fmt.Sprintf("/api/meal-slots/%d/attendance?date=%s", f.tueDinner, tue))
	if r.Status != 200 {
		t.Fatalf("GET attendance = %d %s", r.Status, r.Body)
	}
	if strings.Contains(string(r.Body), `"despiteAway":true`) {
		t.Errorf("Who's eating = %s, want no despiteAway: Anna is not away any more", r.Body)
	}
	for _, at := range f.slot(tue, f.tueDinner).Attendance {
		if at.DespiteAway {
			t.Errorf("plan slot marks member %d despiteAway with no Away", at.MemberID)
		}
	}
	if p := f.portions(tue, f.tueDinner); p != 2 {
		t.Errorf("Tuesday Dinner = %v portions, want 2", p)
	}
}
