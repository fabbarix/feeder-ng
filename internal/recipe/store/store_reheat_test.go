package store_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/store"
)

// R12: the per-Recipe reheat time is stored, read back, replaced and listed.
func TestReheatMinutesRoundTripAndReplace(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)

	in := pancakes(i)
	in.ReheatMinutes = intp(5)
	created, err := f.s.Create(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	got, err := f.s.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ReheatMinutes == nil || *got.ReheatMinutes != 5 {
		t.Fatalf("ReheatMinutes = %v, want 5", got.ReheatMinutes)
	}

	in.ReheatMinutes = intp(12)
	upd, err := f.s.Update(ctx, created.ID, in)
	if err != nil {
		t.Fatal(err)
	}
	if upd.ReheatMinutes == nil || *upd.ReheatMinutes != 12 {
		t.Fatalf("after Update ReheatMinutes = %v, want 12", upd.ReheatMinutes)
	}

	in.ReheatMinutes = nil
	upd, err = f.s.Update(ctx, created.ID, in)
	if err != nil {
		t.Fatal(err)
	}
	if upd.ReheatMinutes != nil {
		t.Fatalf("clearing the reheat time must store NULL, got %d", *upd.ReheatMinutes)
	}
}

func TestRecipeWithoutReheatTimeStaysNil(t *testing.T) {
	f := newFixture(t)
	created, err := f.s.Create(ctx, pancakes(f.basics(t)))
	if err != nil {
		t.Fatal(err)
	}
	got, _ := f.s.Get(ctx, created.ID)
	if got.ReheatMinutes != nil {
		t.Fatalf("ReheatMinutes = %d, want nil", *got.ReheatMinutes)
	}
}

func TestInvalidReheatMinutesIsRejectedAndWritesNothing(t *testing.T) {
	f := newFixture(t)
	in := pancakes(f.basics(t))
	in.ReheatMinutes = intp(31)
	_, err := f.s.Create(ctx, in)
	var ve *recipe.ValidationError
	if !errors.As(err, &ve) || ve.Field != "reheatMinutes" || ve.Code != recipe.CodeReheatInvalid {
		t.Fatalf("err = %v, want a reheat_invalid ValidationError on reheatMinutes", err)
	}
	if n := f.count(t, "recipes"); n != 0 {
		t.Fatalf("%d recipes written", n)
	}
}

func TestListCarriesTheReheatTimeForThePlan(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	with := pancakes(i)
	with.ReheatMinutes = intp(6)
	if _, err := f.s.Create(ctx, with); err != nil {
		t.Fatal(err)
	}
	without := pancakes(i)
	without.Name = "Waffles"
	if _, err := f.s.Create(ctx, without); err != nil {
		t.Fatal(err)
	}
	list, err := f.s.List(ctx, store.ListFilter{})
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]int{}
	for _, s := range list {
		got[s.Name] = s.ReheatMinutes
	}
	if got["Pancakes"] != 6 || got["Waffles"] != 0 {
		t.Fatalf("Summary.ReheatMinutes = %v, want Pancakes 6 and Waffles 0 (0 = none)", got)
	}
}
