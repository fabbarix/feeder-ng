package store_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/recipe/store"
)

// B9-27 (SAFE-05): Store.Deletable is what the detail's `deletable` says. It is the check Delete makes, asked before the User confirms.

func TestDeletableIsTrueForARecipeNeverPlanned(t *testing.T) {
	f := newFixture(t)
	r, _ := f.s.Create(ctx, pancakes(f.basics(t)))
	ok, err := f.s.Deletable(ctx, r.ID)
	if err != nil || !ok {
		t.Fatalf("Deletable = %v, %v; want true, nil", ok, err)
	}
}

func TestDeletableIsFalseForARecipeThatWasEverPlanned(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	planned1, _ := f.s.Create(ctx, pancakes(i))
	in := pancakes(i)
	in.Name = "Waffles"
	other, _ := f.s.Create(ctx, in)
	store.RegisterPlannedChecker("deletable test", planned{planned1.ID: true})
	t.Cleanup(func() { store.DefaultPlannedCheckers.Unregister("deletable test") })

	if ok, err := f.s.Deletable(ctx, planned1.ID); err != nil || ok {
		t.Errorf("Deletable of a planned Recipe = %v, %v; want false, nil", ok, err)
	}
	if ok, err := f.s.Deletable(ctx, other.ID); err != nil || !ok {
		t.Errorf("Deletable of a Recipe nobody planned = %v, %v; want true, nil", ok, err)
	}
	// It agrees with Delete: what Deletable refuses, Delete refuses; what it allows, Delete does.
	if err := f.s.Delete(ctx, planned1.ID); !errors.Is(err, store.ErrAlreadyPlanned) {
		t.Errorf("Delete of what Deletable refused = %v, want ErrAlreadyPlanned", err)
	}
	if err := f.s.Delete(ctx, other.ID); err != nil {
		t.Errorf("Delete of what Deletable allowed = %v", err)
	}
}

func TestDeletableReturnsTheCheckersError(t *testing.T) {
	f := newFixture(t)
	r, _ := f.s.Create(ctx, pancakes(f.basics(t)))
	store.RegisterPlannedChecker("deletable err", errChecker{})
	t.Cleanup(func() { store.DefaultPlannedCheckers.Unregister("deletable err") })
	if _, err := f.s.Deletable(ctx, r.ID); err == nil {
		t.Error("a failing PlannedChecker must be an error, not a silent true")
	}
}

func TestDeletableOfAnUnknownRecipeIsNotFound(t *testing.T) {
	f := newFixture(t)
	if _, err := f.s.Deletable(ctx, 999); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Deletable(999) = %v, want ErrNotFound", err)
	}
}

func TestDeletableIsFalseForABaseRecipeThatRecipesCallFor(t *testing.T) {
	f := newBaseFixture(t)
	bech := f.createBase(t, baseIn("Béchamel", 1, "l"))
	if ok, err := f.s.Deletable(ctx, bech.ID); err != nil || !ok {
		t.Fatalf("an unused Base recipe: Deletable = %v, %v; want true, nil", ok, err)
	}
	lasagne := f.createPlain(t, plainIn("Lasagne", callFor(bech, 500, "ml")))
	if ok, err := f.s.Deletable(ctx, bech.ID); err != nil || ok {
		t.Errorf("a Base recipe in use: Deletable = %v, %v; want false, nil", ok, err)
	}
	// An archived Recipe that calls for it still counts (Delete refuses with it in usedBy).
	if _, err := f.s.SetArchived(ctx, lasagne.ID, true); err != nil {
		t.Fatal(err)
	}
	if ok, _ := f.s.Deletable(ctx, bech.ID); ok {
		t.Error("an archived caller still makes the Base recipe undeletable")
	}
	if err := f.s.Delete(ctx, bech.ID); !errors.Is(err, recipe.ErrBaseRecipeInUse) {
		t.Errorf("Delete = %v, want ErrBaseRecipeInUse (Deletable and Delete agree)", err)
	}
	// Once the caller is gone, it can go.
	if err := f.s.Delete(ctx, lasagne.ID); err != nil {
		t.Fatal(err)
	}
	if ok, err := f.s.Deletable(ctx, bech.ID); err != nil || !ok {
		t.Errorf("after the caller is deleted: Deletable = %v, %v; want true, nil", ok, err)
	}
}

// RX-07: the list row carries how many Steps the Recipe has, so "2 Steps, none timed" is not "No Steps".
func TestListSummariesCarryTheStepCount(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	create := func(in recipe.Input) recipe.Recipe {
		t.Helper()
		r, err := f.s.Create(ctx, in)
		if err != nil {
			t.Fatalf("Create %q: %v", in.Name, err)
		}
		return r
	}
	withSteps := create(pancakes(i)) // six Steps (specSteps)
	bare := pancakes(i)
	bare.Name = "Bare toast"
	bare.Steps = nil
	none := create(bare)
	untimed := pancakes(i)
	untimed.Name = "Green salad"
	untimed.Steps = []recipe.Step{{Text: "Wash", Kind: schedule.Active}, {Text: "Toss", Kind: schedule.Active}}
	salad := create(untimed)

	list, err := f.s.List(ctx, store.ListFilter{})
	if err != nil {
		t.Fatal(err)
	}
	got := map[int64]int{}
	for _, s := range list {
		got[s.ID] = s.StepCount
	}
	for _, c := range []struct {
		name string
		id   int64
		want int
	}{{"six Steps", withSteps.ID, 6}, {"no Steps", none.ID, 0}, {"two untimed Steps", salad.ID, 2}} {
		if got[c.id] != c.want {
			t.Errorf("%s: StepCount = %d, want %d", c.name, got[c.id], c.want)
		}
	}
	if salad.Timing.TotalMinutes != 0 {
		t.Fatalf("the fixture: untimed Steps have no total (got %d)", salad.Timing.TotalMinutes)
	}
}
