package httpapi_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"testing"

	domain "github.com/fabbarix/feeder-ng/internal/plan"
	planhttp "github.com/fabbarix/feeder-ng/internal/plan/httpapi"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B9-11: another module's replanning write (Who's eating, a Meal Slot's date, Away: B9-24, B9-26) reaches the planning
// Runner through ReplannerFor, with no edit in this package: its answer embeds Replan, and its token undoes it.
func TestAnotherModulesWriteReplansThroughTheReplannerAndCanBeUndone(t *testing.T) {
	d := newDinner(t)
	p := planhttp.ReplannerFor(d.Env.DB)
	if p == nil {
		t.Fatal("ReplannerFor: nil, want the Runner the planning module mounted")
	}
	side := domain.Key{Date: crsc2.Today, MealSlotID: d.Slot, CourseID: d.Side}
	req := httptest.NewRequest("PUT", "/api/meal-slots/1/dates/2026-11-09", nil)
	out, err := p.Apply(req, domain.ReasonAttendanceChanged, func(ctx context.Context, tx *sql.Tx, st *store.Store) error {
		if tx == nil {
			t.Error("mutate got no transaction")
		}
		return st.SetPinned(ctx, side, false)
	})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(struct {
		ID int64 `json:"id"`
		planhttp.Replan
	}{7, out})
	if err != nil {
		t.Fatal(err)
	}
	var body struct {
		ID        int64             `json:"id"`
		Changes   []json.RawMessage `json:"changes"`
		UndoToken string            `json:"undoToken"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatal(err)
	}
	if body.ID != 7 || body.Changes == nil || body.UndoToken == "" {
		t.Fatalf("answer = %s, want the module's own fields beside \"changes\" ([] at least) and \"undoToken\"", raw)
	}
	var pinned bool
	if err := d.Env.DB.QueryRow(`SELECT pinned FROM planned_meals WHERE date = ? AND meal_slot_id = ? AND course_id = ?`,
		side.Date, side.MealSlotID, side.CourseID).Scan(&pinned); err != nil || pinned {
		t.Fatalf("Side pinned = %v (%v) after the write, want unpinned", pinned, err)
	}
	if r := d.User.Post("/api/plan/restore", map[string]any{"undoToken": body.UndoToken}); r.Status != 200 {
		t.Fatalf("restore = %d %s", r.Status, r.Body)
	}
	if err := d.Env.DB.QueryRow(`SELECT pinned FROM planned_meals WHERE date = ? AND meal_slot_id = ? AND course_id = ?`,
		side.Date, side.MealSlotID, side.CourseID).Scan(&pinned); err != nil || !pinned {
		t.Errorf("Side pinned = %v (%v) after Undo, want Pinned again", pinned, err)
	}
}
