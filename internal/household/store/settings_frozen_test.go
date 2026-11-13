package store_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// B5-LO (migration 1510): household_settings.frozen_use_by_days is read and saved with the other settings.
func TestFrozenUseByDaysStartsAtNinetyAndRoundTrips(t *testing.T) {
	f := newFx(t)
	got, err := f.st.Settings(f.ctx)
	if err != nil || got.FrozenUseByDays != 90 {
		t.Fatalf("initial = %d, %v; want 90", got.FrozenUseByDays, err)
	}
	s := household.DefaultSettings("UTC")
	s.FrozenUseByDays = 45
	if err := f.st.SaveSettings(f.ctx, s); err != nil {
		t.Fatal(err)
	}
	if got, _ = f.st.Settings(f.ctx); got.FrozenUseByDays != 45 {
		t.Errorf("after save = %d, want 45", got.FrozenUseByDays)
	}
}
