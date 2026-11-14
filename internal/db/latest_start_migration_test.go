package db_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// 1578 (beta.9 Latest start, A2, B9-58) is additive: the Household that is already there gets latest_start '22:00'
// and everything else in household_settings is left as it was. Off is NULL. When the stored Earliest start is not
// before 22:00 (an Admin set it late in the evening) the Household gets Off instead, so its settings stay valid
// (Latest start must be later than Earliest start).
func TestMigration1578GivesTheExistingHouseholdALatestStartAndKeepsTheRest(t *testing.T) {
	d := tagsOpenAt(t, "1578_")
	mustExec(t, d, `UPDATE household_settings SET time_zone = 'Europe/Rome', currency = 'EUR', earliest_start = '07:00',
		setup_hidden = 1, quiet_hours_start = '23:00' WHERE id = 1`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1578: %v", err)
	}
	if n := count(t, d, `SELECT count(*) FROM household_settings WHERE id = 1 AND latest_start = '22:00'`); n != 1 {
		t.Errorf("the existing Household has latest_start 22:00: %d rows, want 1", n)
	}
	if n := count(t, d, `SELECT count(*) FROM household_settings WHERE time_zone = 'Europe/Rome' AND currency = 'EUR'
		AND earliest_start = '07:00' AND setup_hidden = 1 AND quiet_hours_start = '23:00'`); n != 1 {
		t.Errorf("the other settings changed: %d rows match, want 1", n)
	}
	mustExec(t, d, `UPDATE household_settings SET latest_start = NULL WHERE id = 1`)
	if n := count(t, d, `SELECT count(*) FROM household_settings WHERE latest_start IS NULL`); n != 1 {
		t.Error("Off (NULL) does not store")
	}
}

func TestMigration1578KeepsTheSettingsValidForAnEarliestStartAtOrAfterTenInTheEvening(t *testing.T) {
	for earliest, want := range map[string]string{"21:59": "22:00", "22:00": "", "23:30": ""} {
		d := tagsOpenAt(t, "1578_")
		mustExec(t, d, `UPDATE household_settings SET earliest_start = ? WHERE id = 1`, earliest)
		if err := db.MigrateEmbedded(context.Background(), d); err != nil {
			t.Fatalf("1578: %v", err)
		}
		var got *string
		if err := d.QueryRow(`SELECT latest_start FROM household_settings WHERE id = 1`).Scan(&got); err != nil {
			t.Fatal(err)
		}
		switch {
		case want == "" && got != nil:
			t.Errorf("earliest %s: latest_start = %q, want NULL (Off)", earliest, *got)
		case want != "" && (got == nil || *got != want):
			t.Errorf("earliest %s: latest_start = %v, want %q", earliest, got, want)
		}
	}
	// Earliest start Off: Latest start 22:00.
	d := tagsOpenAt(t, "1578_")
	mustExec(t, d, `UPDATE household_settings SET earliest_start = NULL WHERE id = 1`)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	if n := count(t, d, `SELECT count(*) FROM household_settings WHERE latest_start = '22:00' AND earliest_start IS NULL`); n != 1 {
		t.Errorf("Earliest start Off: want latest_start 22:00, %d rows", n)
	}
}

func TestMigration1578IsInThePre1570Snapshot(t *testing.T) {
	var found bool
	for _, p := range db.Pre1570Prefixes {
		found = found || p == "1578_"
	}
	if !found {
		t.Fatalf("Pre1570Prefixes = %v, want 1578_ in it", db.Pre1570Prefixes)
	}
}
