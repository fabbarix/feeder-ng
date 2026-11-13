package store_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
)

// B5-LO (ADR 0012, docs/dev/design/b5-lo.md): the repository of Leftovers by hand, over migration 1510.

func (f *fixture) place(t *testing.T, name, kind string) int64 {
	t.Helper()
	res, err := f.db.Exec(`INSERT INTO storage_places (name, name_key, kind, is_default, created_at) VALUES (?, lower(?), ?, 0, '2026-11-01T00:00:00Z')`, name, name, kind)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func (f *fixture) leftover(t *testing.T, recipe int64, portions float64, useBy string) plan.Leftover {
	t.Helper()
	l, err := f.st.AddLeftover(ctx, plan.Leftover{RecipeID: recipe, From: f.key("2026-11-05", f.dinner), Portions: portions, CookedOn: "2026-11-05", UseBy: useBy})
	if err != nil {
		t.Fatal(err)
	}
	return l
}

func TestALeftoverCarriesItsStoragePlaceAndFrozenDate(t *testing.T) {
	f := newFixture(t)
	freezer := f.place(t, "Garage Freezer", "freezer")
	added, err := f.st.AddLeftover(ctx, plan.Leftover{RecipeID: f.chicken, From: f.key("2026-11-05", f.dinner), Portions: 3, CookedOn: "2026-11-05",
		UseBy: "2027-02-07", StoragePlaceID: freezer, FrozenOn: "2026-11-09"})
	if err != nil {
		t.Fatal(err)
	}
	for name, l := range map[string]plan.Leftover{"AddLeftover": added} {
		if l.StoragePlaceID != freezer || l.FrozenOn != "2026-11-09" || !l.Frozen() {
			t.Errorf("%s answered %+v, want the Garage Freezer and frozen on 2026-11-09", name, l)
		}
	}
	got, err := f.st.Leftover(ctx, added.ID)
	if err != nil || got.StoragePlaceID != freezer || got.FrozenOn != "2026-11-09" {
		t.Errorf("Leftover = %+v, %v; want the same place and date", got, err)
	}
	list, err := f.st.Leftovers(ctx)
	if err != nil || len(list) != 1 || list[0].FrozenOn != "2026-11-09" || list[0].StoragePlaceID != freezer {
		t.Errorf("Leftovers = %+v, %v; a frozen Leftover is listed with its place and date", list, err)
	}
}

func TestAFrozenLeftoverStaysFrozenWhenItsFreezerIsDeleted(t *testing.T) {
	f := newFixture(t)
	freezer := f.place(t, "Garage Freezer", "freezer")
	l, err := f.st.AddLeftover(ctx, plan.Leftover{RecipeID: f.chicken, From: f.key("2026-11-05", f.dinner), Portions: 3, CookedOn: "2026-11-05",
		UseBy: "2027-02-07", StoragePlaceID: freezer, FrozenOn: "2026-11-09"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`DELETE FROM storage_places WHERE id = ?`, freezer); err != nil {
		t.Fatal(err)
	}
	got, err := f.st.Leftover(ctx, l.ID)
	if err != nil || got.StoragePlaceID != 0 || got.FrozenOn != "2026-11-09" || !got.Frozen() {
		t.Errorf("Leftover = %+v, %v; want no place and still frozen (Not sorted)", got, err)
	}
}

func TestSaveLeftoverStateChangesOnlyItsFourFields(t *testing.T) {
	f := newFixture(t)
	freezer := f.place(t, "Garage Freezer", "freezer")
	l := f.leftover(t, f.chicken, 4, "2026-11-08")
	if err := f.st.SaveLeftoverState(ctx, l.ID, 3, "2027-02-07", freezer, "2026-11-09"); err != nil {
		t.Fatal(err)
	}
	got, _ := f.st.Leftover(ctx, l.ID)
	want := l
	want.Portions, want.UseBy, want.StoragePlaceID, want.FrozenOn = 3, "2027-02-07", freezer, "2026-11-09"
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Leftover = %+v, want %+v (Recipe, source, cooked date and status untouched)", got, want)
	}
	// Taking out clears both.
	if err := f.st.SaveLeftoverState(ctx, l.ID, 3, "2026-11-12", 0, ""); err != nil {
		t.Fatal(err)
	}
	if got, _ := f.st.Leftover(ctx, l.ID); got.StoragePlaceID != 0 || got.FrozenOn != "" || got.UseBy != "2026-11-12" || got.Frozen() {
		t.Errorf("after Take out: %+v, want no place, not frozen, Use-by 2026-11-12", got)
	}
	if err := f.st.SaveLeftoverState(ctx, 9999, 1, "2026-11-12", 0, ""); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown Leftover: err = %v, want ErrNotFound", err)
	}
}

func TestDeleteLeftoverUnlinksItsDependantsAndKeepsItsHistory(t *testing.T) {
	f := newFixture(t)
	l := f.leftover(t, f.chicken, 4, "2026-11-08")
	if _, err := f.st.SaveMeal(ctx, plan.Meal{Key: f.key("2026-11-10", f.dinner), RecipeID: f.chicken, Portions: 2, State: plan.StatePlanned,
		From: &plan.Source{LeftoverID: l.ID, From: l.From}}); err != nil {
		t.Fatal(err)
	}
	if err := f.st.AddLeftoverEvent(ctx, plan.LeftoverEvent{LeftoverID: l.ID, RecipeID: f.chicken, Kind: plan.EventWasntThere, Portions: 4, On: "2026-11-09", UserID: 1}); err != nil {
		t.Fatal(err)
	}
	if err := f.st.DeleteLeftover(ctx, l.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.st.Leftover(ctx, l.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Leftover after Wasn't there: err = %v, want ErrNotFound", err)
	}
	m, err := f.st.Meal(ctx, f.key("2026-11-10", f.dinner))
	if err != nil || m.From == nil || m.From.LeftoverID != 0 {
		t.Errorf("dependant = %+v, %v; want it kept with no Leftover link (the runner then replans it)", m, err)
	}
	if ev, _ := f.st.LeftoverEvents(ctx, l.ID); len(ev) != 1 {
		t.Errorf("events = %+v, want the history to outlive the Leftover", ev)
	}
	if err := f.st.DeleteLeftover(ctx, l.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("second delete: err = %v, want ErrNotFound", err)
	}
}

func TestLeftoverEventsAreKeptInOrderPerLeftover(t *testing.T) {
	f := newFixture(t)
	a, b := f.leftover(t, f.chicken, 4, "2026-11-12"), f.leftover(t, f.pasta, 2, "2026-11-12")
	freezer := f.place(t, "Garage Freezer", "freezer")
	evs := []plan.LeftoverEvent{
		{LeftoverID: a.ID, RecipeID: f.chicken, Kind: plan.EventHadIt, Portions: 1, On: "2026-11-09", UserID: 2},
		{LeftoverID: b.ID, RecipeID: f.pasta, Kind: plan.EventThrewOut, Portions: 2, On: "2026-11-09"},
		{LeftoverID: a.ID, RecipeID: f.chicken, Kind: plan.EventFroze, Portions: 3, On: "2026-11-09", StoragePlaceID: freezer, UserID: 2},
	}
	for _, e := range evs {
		if err := f.st.AddLeftoverEvent(ctx, e); err != nil {
			t.Fatal(err)
		}
	}
	got, err := f.st.LeftoverEvents(ctx, a.ID)
	if err != nil || len(got) != 2 {
		t.Fatalf("events of the first Leftover = %+v, %v; want 2", got, err)
	}
	for i, want := range []plan.LeftoverEvent{evs[0], evs[2]} {
		g := got[i]
		g.ID = 0
		if !reflect.DeepEqual(g, want) {
			t.Errorf("event %d = %+v, want %+v", i, g, want)
		}
	}
	if only, _ := f.st.LeftoverEvents(ctx, b.ID); len(only) != 1 || only[0].Kind != plan.EventThrewOut || only[0].UserID != 0 || only[0].StoragePlaceID != 0 {
		t.Errorf("events of the second = %+v, want one Threw it out with no user and no place", only)
	}
}

func TestDependantsOfLeftoverTellsASplitPartFromTheOneThatStayed(t *testing.T) {
	f := newFixture(t)
	stays := f.leftover(t, f.chicken, 2, "2026-11-12")
	frozen := f.leftover(t, f.chicken, 2, "2027-02-07") // same source Meal Slot as stays (it was split off it)
	mk := func(date string, slot int64, l plan.Leftover, state plan.State) {
		if _, err := f.st.SaveMeal(ctx, plan.Meal{Key: f.key(date, slot), RecipeID: f.chicken, Portions: 2, State: state, From: &plan.Source{LeftoverID: l.ID, From: l.From}}); err != nil {
			t.Fatal(err)
		}
	}
	mk("2026-11-11", f.dinner, stays, plan.StatePlanned)
	mk("2026-11-12", f.dinner, frozen, plan.StatePlanned)
	mk("2026-11-10", f.lunch, stays, plan.StateCooked)
	got, err := f.st.DependantsOfLeftover(ctx, stays.ID)
	if err != nil || len(got) != 1 || got[0].Key != f.key("2026-11-11", f.dinner) {
		t.Errorf("dependants of the first = %+v, %v; want only the planned meal linked to it", got, err)
	}
	got, _ = f.st.DependantsOfLeftover(ctx, frozen.ID)
	if len(got) != 1 || got[0].Key != f.key("2026-11-12", f.dinner) {
		t.Errorf("dependants of the frozen part = %+v, want only Thursday's meal", got)
	}
}

func TestStoragePlaceAndFrozenUseByLookups(t *testing.T) {
	f := newFixture(t)
	freezer, fridge := f.place(t, "Garage Freezer", "freezer"), f.place(t, "Kitchen Fridge", "fridge")
	if p, err := f.st.StoragePlace(ctx, freezer); err != nil || p != (plan.StoragePlace{ID: freezer, Name: "Garage Freezer", Kind: "freezer"}) {
		t.Errorf("StoragePlace(freezer) = %+v, %v", p, err)
	}
	if p, err := f.st.StoragePlace(ctx, fridge); err != nil || p.Kind != "fridge" {
		t.Errorf("StoragePlace(fridge) = %+v, %v", p, err)
	}
	if _, err := f.st.StoragePlace(ctx, 9999); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown place: err = %v, want ErrNotFound", err)
	}

	own, house, err := f.st.FrozenUseByDays(ctx, f.chicken)
	if err != nil || own != nil || house != 90 {
		t.Errorf("FrozenUseByDays(chicken) = %v, %d, %v; want no own value and the Household's 90", own, house, err)
	}
	if _, err := f.db.Exec(`UPDATE recipes SET frozen_use_by_days = 45 WHERE id = ?`, f.chicken); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`UPDATE household_settings SET frozen_use_by_days = 60`); err != nil {
		t.Fatal(err)
	}
	if own, house, err = f.st.FrozenUseByDays(ctx, f.chicken); err != nil || own == nil || *own != 45 || house != 60 {
		t.Errorf("FrozenUseByDays(chicken) = %v, %d, %v; want 45 and the Household's 60", own, house, err)
	}
	if _, _, err := f.st.FrozenUseByDays(ctx, 9999); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown Recipe: err = %v, want ErrNotFound", err)
	}
}
