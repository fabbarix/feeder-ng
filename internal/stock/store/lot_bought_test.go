package store_test

import (
	"testing"
)

// B5-BO (ADR 0013, plan 2.4): Delete of a Lot removes the records of what it was bought for, in the same transaction;
// the records of other Lots, and of a Lot used up (not deleted), stay.
func TestDeleteLotRemovesWhatItWasBoughtFor(t *testing.T) {
	f := setup(t)
	mustExecStock(t, f, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (1,1,'Dinner','19:00')`)
	mustExecStock(t, f, `INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (5,'Roast chicken',4,'2026-11-01T00:00:00Z','2026-11-01T00:00:00Z')`)
	var course int64
	if err := f.db.QueryRow(`SELECT id FROM courses WHERE is_main = 1`).Scan(&course); err != nil {
		t.Fatal(err)
	}
	mustExecStock(t, f, `INSERT INTO planned_meals(id,date,meal_slot_id,course_id,recipe_id,batches,portions,state,created_at,updated_at)
		VALUES (40,'2026-11-09',1,?,5,1,2,'planned','2026-11-01T00:00:00Z','2026-11-01T00:00:00Z')`, course)

	gone := f.add(t, f.thighs, 400, "2026-11-09", "2026-11-13")
	kept := f.add(t, f.milk, 500, "2026-11-09", "2026-11-13")
	for _, lot := range []int64{gone.ID, kept.ID} {
		mustExecStock(t, f, `INSERT INTO planned_meal_bought(planned_meal_id,ingredient_id,lot_id,quantity,bought_at)
			VALUES (40, ?, ?, 100, '2026-11-09T11:00:00Z')`, f.thighs, lot)
	}
	if err := f.st.DeleteLot(ctx, gone.ID); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := f.db.QueryRow(`SELECT count(*) FROM planned_meal_bought WHERE lot_id = ?`, gone.ID).Scan(&n); err != nil || n != 0 {
		t.Errorf("records of the deleted Lot = %d (%v), want none", n, err)
	}
	if err := f.db.QueryRow(`SELECT count(*) FROM planned_meal_bought WHERE lot_id = ?`, kept.ID).Scan(&n); err != nil || n != 1 {
		t.Errorf("records of another Lot = %d (%v), want the one kept", n, err)
	}
	if err := f.db.QueryRow(`SELECT count(*) FROM planned_meals WHERE id = 40`).Scan(&n); err != nil || n != 1 {
		t.Errorf("the Planned Meal went with the Lot: %d (%v)", n, err)
	}
}

func mustExecStock(t *testing.T, f fixture, query string, args ...any) {
	t.Helper()
	if _, err := f.db.Exec(query, args...); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
}
