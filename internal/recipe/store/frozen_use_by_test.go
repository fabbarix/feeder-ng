package store_test

import "testing"

// B5-LO (migration 1510): recipes.frozen_use_by_days is stored, read, replaced and cleared.
func TestFrozenUseByDaysRoundTripReplaceAndClear(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)

	in := pancakes(i)
	in.FrozenUseByDays = intp(120)
	created, err := f.s.Create(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	got, err := f.s.Get(ctx, created.ID)
	if err != nil || got.FrozenUseByDays == nil || *got.FrozenUseByDays != 120 {
		t.Fatalf("FrozenUseByDays = %v, %v; want 120", got.FrozenUseByDays, err)
	}

	in.FrozenUseByDays = intp(30)
	upd, err := f.s.Update(ctx, created.ID, in)
	if err != nil || upd.FrozenUseByDays == nil || *upd.FrozenUseByDays != 30 {
		t.Fatalf("after Update = %v, %v; want 30", upd.FrozenUseByDays, err)
	}

	in.FrozenUseByDays = nil
	upd, err = f.s.Update(ctx, created.ID, in)
	if err != nil || upd.FrozenUseByDays != nil {
		t.Fatalf("clearing must store NULL, got %v, %v", upd.FrozenUseByDays, err)
	}
}

func TestARecipeWithoutAFrozenUseByStaysNil(t *testing.T) {
	f := newFixture(t)
	created, err := f.s.Create(ctx, pancakes(f.basics(t)))
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := f.s.Get(ctx, created.ID); got.FrozenUseByDays != nil {
		t.Errorf("FrozenUseByDays = %d, want nil", *got.FrozenUseByDays)
	}
}
