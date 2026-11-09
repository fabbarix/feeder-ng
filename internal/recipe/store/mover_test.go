package store_test

import (
	"database/sql"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/units"

	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	_ "github.com/fabbarix/feeder-ng/internal/recipe/store" // registers the movers
)

func mover(t *testing.T, name string) ingstore.ReferenceMover {
	t.Helper()
	for _, m := range ingstore.DefaultMovers.All() {
		if m.Name() == name {
			return m
		}
	}
	t.Fatalf("no ReferenceMover %q registered with the ingredient store", name)
	return nil
}

func TestRecipeLinesMover(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	basil := f.ingredient(t, "basil", units.Gram)
	in := pancakes(i) // flour x2 lines, milk x1, plus a Step use of flour
	if _, err := f.s.Create(ctx, in); err != nil {
		t.Fatal(err)
	}
	m := mover(t, "recipe lines")

	n, err := m.Count(ctx, f.db, i.flour)
	if err != nil || n != 3 { // 2 lines + 1 Step use
		t.Errorf("Count(flour) = %d, %v; want 3 (two lines and one Step use)", n, err)
	}
	if n, _ := m.Count(ctx, f.db, basil); n != 0 {
		t.Errorf("Count(basil) = %d", n)
	}

	guard, ok := m.(ingstore.UnitGuard)
	if !ok {
		t.Fatal("the recipe lines mover must implement UnitGuard")
	}
	for unit, want := range map[string]bool{"cup": true, "g": true, "clove": false} {
		got, err := guard.UnitInUse(ctx, f.db, i.flour, unit)
		if err != nil || got != want {
			t.Errorf("UnitInUse(flour, %q) = %v, %v; want %v (a line or Step use writes it)", unit, got, err, want)
		}
	}

	tx, err := f.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Move(ctx, tx, i.flour, basil); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if n, _ := m.Count(ctx, f.db, i.flour); n != 0 {
		t.Errorf("flour still referenced %d times after Move", n)
	}
	if n, _ := m.Count(ctx, f.db, basil); n != 3 {
		t.Errorf("basil referenced %d times after Move, want 3", n)
	}
}

func TestIngredientExclusionsMoverDropsDuplicates(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	sam, kim := f.member(t, "Sam", 0), f.member(t, "Kim", 0)
	for _, c := range []struct{ m, ing int64 }{{sam, i.flour}, {sam, i.milk}, {kim, i.flour}} {
		if err := f.s.SetIngredientExclusion(ctx, c.m, c.ing, true); err != nil {
			t.Fatal(err)
		}
	}
	m := mover(t, "ingredient exclusions")
	if n, _ := m.Count(ctx, f.db, i.flour); n != 2 {
		t.Errorf("Count(flour) = %d, want 2", n)
	}
	withTx(t, f.db, func(tx *sql.Tx) error { return m.Move(ctx, tx, i.flour, i.milk) })
	if got := mustPrefs(t, f, sam).ExcludedIngredients; !reflect.DeepEqual(got, []int64{i.milk}) {
		t.Errorf("Sam excluded %v, want only milk (the duplicate is dropped)", got)
	}
	if got := mustPrefs(t, f, kim).ExcludedIngredients; !reflect.DeepEqual(got, []int64{i.milk}) {
		t.Errorf("Kim excluded %v, want milk", got)
	}
}

func withTx(t *testing.T, d *sql.DB, fn func(*sql.Tx) error) {
	t.Helper()
	tx, err := d.Begin()
	if err != nil {
		t.Fatal(err)
	}
	if err := fn(tx); err != nil {
		tx.Rollback()
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
}
