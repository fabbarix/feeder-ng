package httpapi_test

import (
	"context"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/notify"
	notifyapi "github.com/fabbarix/feeder-ng/internal/notify/httpapi"
	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// TB-02 review (B9-12): "today" is the household date, not the UTC one. In Los Angeles it is still Monday 22:00 when it
// is already Tuesday 06:00 UTC; the Monday 23:30 supper's overdue Step is listed by Today, is the board's Next Advance
// Step and is pushed, all at the same instant.
func TestAdvanceStepsUseTheHouseholdDateAroundMidnight(t *testing.T) {
	w := crsc2.New(t)
	w.Exec(`UPDATE household_settings SET time_zone = 'America/Los_Angeles', time_zone_configured = 1`)
	supper := w.AddSlot(1, "Supper", "23:30", w.Main)
	soak := advanceRecipe(w, "Bean pot", "Soak the beans", 3*60)
	w.Settle()
	w.Meal(crsc2.Today, supper, w.Main, soak, "planned", false)
	w.Env.Clock.Set(time.Date(2026, 11, 10, 6, 0, 0, 0, time.UTC)) // Monday 22:00 PST

	rows := advanceRows(t, w)
	if len(rows) != 1 || rows[0].Description != "Soak the beans" || !rows[0].Overdue || rows[0].DueTime != "20:30" ||
		rows[0].MealDate != crsc2.Today {
		t.Fatalf("rows = %+v, want the Monday supper's Step, overdue, due 20:30 local", rows)
	}
	var b struct {
		NextAdvance *stepRow `json:"nextAdvance"`
	}
	w.User.Get("/api/board").MustJSON(t, &b)
	if b.NextAdvance == nil || b.NextAdvance.Scope != rows[0].Scope || b.NextAdvance.DueAt != rows[0].DueAt {
		t.Errorf("board nextAdvance = %+v, want Today's row %+v", b.NextAdvance, rows[0])
	}
	loc, _ := time.LoadLocation("America/Los_Angeles")
	f, err := notifyapi.DispatcherFor(w.Env.DB).Facts(context.Background(), w.Env.Clock.Now())
	if err != nil {
		t.Fatal(err)
	}
	var pushedAt []time.Time
	for _, c := range notify.Compute(f, loc) {
		if c.Type == notify.AdvanceStep {
			pushedAt = append(pushedAt, c.At)
		}
	}
	due, _ := time.Parse(time.RFC3339, rows[0].DueAt)
	if len(pushedAt) != 1 || !pushedAt[0].Equal(due) {
		t.Errorf("push at %v, want one at Today's dueAt %v", pushedAt, due)
	}
}
