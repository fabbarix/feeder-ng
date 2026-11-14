package store_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// B9-12 (migration 1575): earliest_start and setup_hidden are read and saved with the other settings; Off is NULL.
func TestEarliestStartStartsAtHalfPastSixAndRoundTripsIncludingOff(t *testing.T) {
	f := newFx(t)
	got, err := f.st.Settings(f.ctx)
	if err != nil || got.EarliestStart != "06:30" || got.SetupHidden {
		t.Fatalf("initial = %q hidden %v, %v; want 06:30, false", got.EarliestStart, got.SetupHidden, err)
	}
	s := household.DefaultSettings("UTC")
	s.EarliestStart, s.SetupHidden = "07:15", true
	if err := f.st.SaveSettings(f.ctx, s); err != nil {
		t.Fatal(err)
	}
	if got, _ = f.st.Settings(f.ctx); got.EarliestStart != "07:15" || !got.SetupHidden {
		t.Errorf("after save = %q hidden %v, want 07:15, true", got.EarliestStart, got.SetupHidden)
	}
	s.EarliestStart = ""
	if err := f.st.SaveSettings(f.ctx, s); err != nil {
		t.Fatal(err)
	}
	if got, _ = f.st.Settings(f.ctx); got.EarliestStart != "" {
		t.Errorf("Off after save = %q, want empty", got.EarliestStart)
	}
	var isNull int
	if err := f.db.QueryRow(`SELECT earliest_start IS NULL FROM household_settings WHERE id = 1`).Scan(&isNull); err != nil || isNull != 1 {
		t.Errorf("Off is stored as NULL: IS NULL = %d, %v", isNull, err)
	}
}
