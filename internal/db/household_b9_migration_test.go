package db_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// 1575 (beta.9 Earliest start and the first-run checklist, B9-12) is additive: the Household that is already there
// gets earliest_start '06:30' (decision PC 5: so its next replan may move a long Recipe off an early slot, which the
// upgrade notes say) and setup_hidden 0; everything else in household_settings is left as it was. Off is NULL.
func TestMigration1575GivesTheExistingHouseholdAnEarliestStartAndKeepsTheRest(t *testing.T) {
	d := tagsOpenAt(t, "1575_")
	mustExec(t, d, `UPDATE household_settings SET time_zone = 'Europe/Rome', time_zone_configured = 1, currency = 'EUR',
		planning_horizon_days = 14, quiet_hours_start = '23:00' WHERE id = 1`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1575: %v", err)
	}
	if n := count(t, d, `SELECT count(*) FROM household_settings WHERE id = 1 AND earliest_start = '06:30' AND setup_hidden = 0`); n != 1 {
		t.Errorf("the existing Household has earliest_start 06:30 and setup_hidden 0: %d rows, want 1", n)
	}
	if n := count(t, d, `SELECT count(*) FROM household_settings WHERE time_zone = 'Europe/Rome' AND time_zone_configured = 1
		AND currency = 'EUR' AND planning_horizon_days = 14 AND quiet_hours_start = '23:00'`); n != 1 {
		t.Errorf("the other settings changed: %d rows match, want 1", n)
	}
	mustExec(t, d, `UPDATE household_settings SET earliest_start = NULL, setup_hidden = 1 WHERE id = 1`)
	if n := count(t, d, `SELECT count(*) FROM household_settings WHERE earliest_start IS NULL AND setup_hidden = 1`); n != 1 {
		t.Error("Off (NULL) and setup_hidden = 1 do not store")
	}
}

func TestMigration1575IsInThePre1570Snapshot(t *testing.T) {
	var found bool
	for _, p := range db.Pre1570Prefixes {
		found = found || p == "1575_"
	}
	if !found {
		t.Fatalf("Pre1570Prefixes = %v, want 1575_ in it", db.Pre1570Prefixes)
	}
}
