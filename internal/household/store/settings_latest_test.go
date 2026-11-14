package store_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// A2 (B9-58, migration 1578): latest_start is read and saved with the other settings; Off is NULL; a new Household
// starts at 22:00.
func TestLatestStartStartsAtTenInTheEveningAndRoundTripsIncludingOff(t *testing.T) {
	f := newFx(t)
	got, err := f.st.Settings(f.ctx)
	if err != nil || got.LatestStart != "22:00" {
		t.Fatalf("initial = %q, %v; want 22:00", got.LatestStart, err)
	}
	s := household.DefaultSettings("UTC")
	s.LatestStart = "21:15"
	if err := f.st.SaveSettings(f.ctx, s); err != nil {
		t.Fatal(err)
	}
	if got, _ = f.st.Settings(f.ctx); got.LatestStart != "21:15" || got.EarliestStart != "06:30" {
		t.Errorf("after save = latest %q earliest %q, want 21:15 and 06:30", got.LatestStart, got.EarliestStart)
	}
	s.LatestStart = ""
	if err := f.st.SaveSettings(f.ctx, s); err != nil {
		t.Fatal(err)
	}
	if got, _ = f.st.Settings(f.ctx); got.LatestStart != "" {
		t.Errorf("Off after save = %q, want empty", got.LatestStart)
	}
	var isNull int
	if err := f.db.QueryRow(`SELECT latest_start IS NULL FROM household_settings WHERE id = 1`).Scan(&isNull); err != nil || isNull != 1 {
		t.Errorf("Off is stored as NULL: IS NULL = %d, %v", isNull, err)
	}
}
