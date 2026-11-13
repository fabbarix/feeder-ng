package service_test

import (
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook/service"
	"github.com/fabbarix/feeder-ng/internal/stock/stocktest"
)

// B5-LO (ADR 0012): DB.StreakInput reads Leftover waste from stock_waste only. A Leftover past its Use-by that nobody
// answered is a row of leftovers and no waste row, so it counts nothing; no "discarded" status is read. Passes today by
// design: it pins that the streak needs no change.
func TestStreakInputCountsAnsweredLeftoverWasteAndNotUnansweredLeftovers(t *testing.T) {
	d := stocktest.NewDB(t)
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	exec(t, d, `UPDATE household_settings SET created_at = '2026-10-01T09:00:00Z' WHERE id = 1`)
	exec(t, d, `INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (7,'Chilli',4,'2026-11-01T00:00:00Z','2026-11-01T00:00:00Z')`)
	// Unanswered: past its Use-by since 11-04, still available. Answered Threw it out: waste dated Use-by + 1.
	exec(t, d, `INSERT INTO leftovers(id,recipe_id,from_date,from_meal_slot_id,from_course_id,portions,cooked_on,use_by,status,created_at)
		VALUES (1,7,'2026-11-01',1,(SELECT id FROM courses WHERE is_main = 1),3,'2026-11-01','2026-11-04','available','2026-11-01T00:00:00Z')`)
	exec(t, d, `INSERT INTO stock_waste(ingredient_id,quantity,wasted_on,reason,lot_id,lot_goes_off,created_at)
		VALUES (NULL,2,'2026-11-06','leftover_discarded',NULL,NULL,'2026-11-09T10:00:00Z')`)

	in, err := service.NewDB(d, clk).StreakInput(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(in.Waste) != 1 || in.Waste[0].WastedOn != "2026-11-06" || in.Waste[0].LotID != 0 {
		t.Errorf("waste = %+v, want only the answered Leftover, dated 2026-11-06 (the unanswered one counts nothing)", in.Waste)
	}
}
