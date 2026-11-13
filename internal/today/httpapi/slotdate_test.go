package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B5-SD (ADR 0014): Today's Advance Steps are due before the date's time, and slotTime shows it.

func TestTodaysAdvanceStepsFollowTheDatesTime(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{Steps: []crsc2.Step{
		{Text: "Marinate", Kind: "advance", Lead: 120}, {Text: "Roast", Kind: "active", Minutes: 20}}})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Exec(`INSERT INTO meal_slot_dates (slot_id, date, time, updated_at) VALUES (?, ?, '21:00', '2026-11-08T12:00:00Z')`, w.Slot, crsc2.Today)

	var out struct {
		Steps []struct {
			Description string `json:"description"`
			DueTime     string `json:"dueTime"`
			SlotTime    string `json:"slotTime"`
		} `json:"steps"`
	}
	r := w.User.Get("/api/today/advance-steps")
	r.MustJSON(t, &out)
	if len(out.Steps) != 1 {
		t.Fatalf("steps = %s", r.Body)
	}
	if s := out.Steps[0]; s.SlotTime != "21:00" || s.DueTime != "19:00" {
		t.Errorf("step = %+v, want slotTime 21:00 and due 19:00 (2 h before the date's time, not 17:00)", s)
	}
}
