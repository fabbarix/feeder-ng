package store_test

import (
	"reflect"
	"sort"
	"testing"
	"time"

	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	_ "github.com/fabbarix/feeder-ng/internal/recipe/store"
)

// B5-BO: the repository of planned_meal_bought (migration 1520; ADR 0013; docs/dev/design/b5-bo.md §4). The records
// follow their Planned Meal: they go when it is deleted, resolved or changes Recipe, and they SURVIVE every in-place
// update (Apply's upsert, raised Batches, a recheck's relaxed flag and chip, Pin and Unpin).

var boughtAt = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)

// bf is the shared fixture with the *testing.T its helpers report to.
type bf struct {
	*fixture
	t *testing.T
}

func boughtFixture(t *testing.T) *bf {
	t.Helper()
	return &bf{fixture: newFixture(t), t: t}
}

func (f *bf) ingredient(name string) int64 {
	f.t.Helper()
	res, err := f.db.Exec(`INSERT INTO ingredients(name,name_key,base_unit,created_at,updated_at) VALUES (?,?,?,?,?)`,
		name, name, "g", "2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z")
	if err != nil {
		f.t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func (f *bf) boughtMeal(date string, recipe int64) plan.Meal {
	m, err := f.st.SaveMeal(ctx, f.meal(date, f.dinner, recipe))
	if err != nil {
		f.t.Fatal(err)
	}
	return m
}

func (f *bf) bought(m plan.Meal, lot int64, qty float64, ings ...int64) {
	f.t.Helper()
	var recs []plan.BoughtRecord
	for _, ing := range ings {
		recs = append(recs, plan.BoughtRecord{MealID: m.ID, IngredientID: ing, LotID: lot, Quantity: qty, At: boughtAt})
	}
	if err := f.st.AddBought(ctx, recs); err != nil {
		f.t.Fatalf("AddBought: %v", err)
	}
	if got, _ := f.st.BoughtRecords(ctx, m.ID); len(got) < len(recs) { // the set-up itself must have worked
		f.t.Fatalf("set-up: %d records stored for Planned Meal %d, want at least %d", len(got), m.ID, len(recs))
	}
}

func (f *bf) records(m plan.Meal) []plan.BoughtRecord {
	f.t.Helper()
	recs, err := f.st.BoughtRecords(ctx, m.ID)
	if err != nil {
		f.t.Fatal(err)
	}
	return recs
}

func (f *bf) reload(key plan.Key) plan.Meal {
	f.t.Helper()
	m, err := f.st.Meal(ctx, key)
	if err != nil {
		f.t.Fatal(err)
	}
	return m
}

func TestAddBoughtStoresRecordsPerIngredientAndLot(t *testing.T) {
	f := boughtFixture(t)
	chickenIng, cream := f.ingredient("chicken thighs"), f.ingredient("cream")
	m := f.boughtMeal("2026-11-10", f.chicken)
	f.bought(m, 900, 300, chickenIng)
	f.bought(m, 901, 100, chickenIng, cream)
	got := f.records(m)
	want := []plan.BoughtRecord{
		{MealID: m.ID, IngredientID: chickenIng, LotID: 900, Quantity: 300, At: boughtAt},
		{MealID: m.ID, IngredientID: chickenIng, LotID: 901, Quantity: 100, At: boughtAt},
		{MealID: m.ID, IngredientID: cream, LotID: 901, Quantity: 100, At: boughtAt},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("records =\n%+v\nwant\n%+v", got, want)
	}
}

func TestAddBoughtAgainForTheSameLotReplacesTheRecord(t *testing.T) {
	f := boughtFixture(t)
	ing := f.ingredient("cream")
	m := f.boughtMeal("2026-11-10", f.chicken)
	f.bought(m, 900, 300, ing)
	f.bought(m, 900, 150, ing) // a retry computed against a changed list: replaces, never doubles
	if got := f.records(m); len(got) != 1 || got[0].Quantity != 150 {
		t.Errorf("records = %+v, want one record of 150", got)
	}
}

func TestAddBoughtRefusesAnUnknownPlannedMealOrIngredient(t *testing.T) {
	f := boughtFixture(t)
	ing := f.ingredient("cream")
	m := f.boughtMeal("2026-11-10", f.chicken)
	if err := f.st.AddBought(ctx, []plan.BoughtRecord{{MealID: 9999, IngredientID: ing, LotID: 1, Quantity: 1, At: boughtAt}}); err == nil {
		t.Error("an unknown Planned Meal must be refused")
	}
	if err := f.st.AddBought(ctx, []plan.BoughtRecord{{MealID: m.ID, IngredientID: 9999, LotID: 1, Quantity: 1, At: boughtAt}}); err == nil {
		t.Error("an unknown Ingredient must be refused")
	}
	if err := f.st.AddBought(ctx, []plan.BoughtRecord{{MealID: m.ID, IngredientID: ing, LotID: 1, Quantity: 0, At: boughtAt}}); err == nil {
		t.Error("a quantity of 0 must be refused")
	}
	if got := f.records(m); len(got) != 0 {
		t.Errorf("records = %+v after refused adds, want none", got)
	}
}

func TestAddBoughtIsAtomic(t *testing.T) {
	f := boughtFixture(t)
	ing := f.ingredient("cream")
	m := f.boughtMeal("2026-11-10", f.chicken)
	err := f.st.AddBought(ctx, []plan.BoughtRecord{
		{MealID: m.ID, IngredientID: ing, LotID: 1, Quantity: 5, At: boughtAt},
		{MealID: m.ID, IngredientID: 9999, LotID: 1, Quantity: 5, At: boughtAt}, // breaks
	})
	if err == nil {
		t.Fatal("AddBought with an unknown Ingredient must fail")
	}
	if got := f.records(m); len(got) != 0 {
		t.Errorf("records = %+v, want none: a failed purchase records nothing", got)
	}
}

func TestMealsCarryTheIngredientsTheyWereBoughtFor(t *testing.T) {
	f := boughtFixture(t)
	chickenIng, cream := f.ingredient("chicken thighs"), f.ingredient("cream")
	bought := f.boughtMeal("2026-11-10", f.chicken)
	plain := f.boughtMeal("2026-11-11", f.pasta)
	f.bought(bought, 900, 300, cream, chickenIng)
	f.bought(bought, 901, 50, chickenIng) // a second Lot of the same Ingredient: one entry

	want := []int64{chickenIng, cream}
	sort.Slice(want, func(i, j int) bool { return want[i] < want[j] })
	if got := f.reload(bought.Key); !reflect.DeepEqual(got.Bought, want) || !got.IsBought() {
		t.Errorf("Meal.Bought = %v, want %v (distinct, ascending)", got.Bought, want)
	}
	if got := f.reload(plain.Key); got.IsBought() || len(got.Bought) != 0 {
		t.Errorf("a Planned Meal nothing was bought for has Bought = %v", got.Bought)
	}
	all, _ := f.st.Meals(ctx, "", "")
	if len(all) != 2 || !all[0].IsBought() || all[1].IsBought() {
		t.Errorf("Meals = %+v, want the first Bought and the second not", all)
	}
	unresolved, _ := f.st.UnresolvedBefore(ctx, "2026-12-01")
	if len(unresolved) != 2 || !unresolved[0].IsBought() {
		t.Errorf("UnresolvedBefore = %+v, want the Bought one marked too", unresolved)
	}
}

func TestRemoveBoughtForLotRemovesOnlyThatLotsRecords(t *testing.T) {
	f := boughtFixture(t)
	ing := f.ingredient("cream")
	a, b := f.boughtMeal("2026-11-10", f.chicken), f.boughtMeal("2026-11-11", f.pasta)
	f.bought(a, 900, 300, ing)
	f.bought(b, 900, 100, ing)
	f.bought(a, 901, 50, ing)
	n, err := f.st.RemoveBoughtForLot(ctx, 900)
	if err != nil || n != 2 {
		t.Fatalf("RemoveBoughtForLot = %d, %v; want 2 records", n, err)
	}
	if got := f.records(a); len(got) != 1 || got[0].LotID != 901 {
		t.Errorf("a's records = %+v, want only Lot 901", got)
	}
	if got := f.reload(b.Key); got.IsBought() {
		t.Errorf("b is still Bought: %+v", got.Bought)
	}
	if n, err := f.st.RemoveBoughtForLot(ctx, 424242); err != nil || n != 0 {
		t.Errorf("an unknown Lot = %d, %v; want 0 and no error", n, err)
	}
}

func TestDeletingAPlannedMealTakesItsRecordsWithIt(t *testing.T) {
	f := boughtFixture(t)
	ing := f.ingredient("cream")
	m := f.boughtMeal("2026-11-10", f.chicken)
	f.bought(m, 900, 300, ing)
	if err := f.st.DeleteMeal(ctx, m.Key); err != nil {
		t.Fatal(err)
	}
	if got := f.records(m); len(got) != 0 {
		t.Errorf("records = %+v after the Planned Meal was deleted, want none", got)
	}
}

func TestResolvingAPlannedMealEndsBought(t *testing.T) {
	for _, state := range []plan.State{plan.StateCooked, plan.StateSkipped} {
		f := boughtFixture(t)
		ing := f.ingredient("cream")
		m := f.boughtMeal("2026-11-10", f.chicken)
		f.bought(m, 900, 300, ing)
		if err := f.st.MarkResolved(ctx, m.Key, state); err != nil {
			t.Fatal(err)
		}
		if got := f.records(m); len(got) != 0 {
			t.Errorf("%s: records = %+v, want none: what was bought stays in Stock, the Planned Meal is history", state, got)
		}
	}
}

func TestChangingTheRecipeEndsBoughtButKeepsTheRow(t *testing.T) {
	f := boughtFixture(t)
	ing := f.ingredient("cream")
	m := f.boughtMeal("2026-11-10", f.chicken)
	f.bought(m, 900, 300, ing)
	swapped := m
	swapped.RecipeID = f.pasta
	got, err := f.st.SaveMeal(ctx, swapped) // Swap, choosing a Recipe by hand, Regenerate re-placing the cell
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != m.ID {
		t.Errorf("id %d -> %d: the row is updated in place", m.ID, got.ID)
	}
	if recs := f.records(got); len(recs) != 0 {
		t.Errorf("records = %+v after the Recipe changed, want none", recs)
	}
}

func TestEveryInPlaceUpdateOfTheSameRecipeKeepsTheRecords(t *testing.T) {
	f := boughtFixture(t)
	ing := f.ingredient("cream")
	m := f.boughtMeal("2026-11-10", f.chicken)
	f.bought(m, 900, 300, ing)
	check := func(what string) {
		t.Helper()
		got, err := f.st.Meal(ctx, m.Key)
		if err != nil || got.ID != m.ID {
			t.Fatalf("%s: Meal = %+v, %v; want the same row id %d", what, got, err, m.ID)
		}
		if recs := f.records(m); len(recs) != 1 {
			t.Fatalf("%s: records = %+v, want the one record kept", what, recs)
		}
	}

	same := m
	same.Batches, same.Portions, same.Relaxed = 2, 6, true
	same.Why = []plan.Why{{Code: "cooldown_relaxed"}}
	if _, err := f.st.SaveMeal(ctx, same); err != nil {
		t.Fatal(err)
	}
	check("SaveMeal with the same Recipe")

	if err := f.st.Apply(ctx, plan.Changes{Upserts: []plan.Meal{{Key: m.Key, RecipeID: m.RecipeID, Batches: 2, Portions: 4, State: plan.StatePlanned, Relaxed: false}}}); err != nil {
		t.Fatal(err)
	}
	check("Apply upsert (a recheck of the relaxed flag)")

	if err := f.st.Apply(ctx, plan.Changes{RaiseBatches: []plan.BatchRaise{{Key: m.Key, Batches: 3, Portions: 8}}}); err != nil {
		t.Fatal(err)
	}
	check("raised Batches")

	if err := f.st.SetPinned(ctx, m.Key, true); err != nil {
		t.Fatal(err)
	}
	check("Pin")
	if err := f.st.SetPinned(ctx, m.Key, false); err != nil {
		t.Fatal(err)
	}
	check("Unpin")
	if err := f.st.SetWhy(ctx, m.Key, []plan.Why{{Code: "favourite"}}); err != nil {
		t.Fatal(err)
	}
	check("SetWhy")
}

func TestApplyDeletesAnUnpinnedBoughtMealAndItsRecordsWhenTheRunReplacesIt(t *testing.T) {
	// Regenerate drops a Bought meal it cannot refill: the run lists it in Deletes, and the records go with the row.
	f := boughtFixture(t)
	ing := f.ingredient("cream")
	m := f.boughtMeal("2026-11-10", f.chicken)
	f.bought(m, 900, 300, ing)
	if err := f.st.Apply(ctx, plan.Changes{Deletes: []plan.Key{m.Key}}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.st.Meal(ctx, m.Key); err == nil {
		t.Error("the Bought Planned Meal is still there")
	}
	if recs := f.records(m); len(recs) != 0 {
		t.Errorf("records = %+v, want none", recs)
	}
}

func TestApplyReplacingTheRecipeOfABoughtMealUpdatesTheRowInPlace(t *testing.T) {
	f := boughtFixture(t)
	ing := f.ingredient("cream")
	m := f.boughtMeal("2026-11-10", f.chicken)
	f.bought(m, 900, 300, ing)
	if err := f.st.Apply(ctx, plan.Changes{Upserts: []plan.Meal{{Key: m.Key, RecipeID: f.soup, Batches: 1, Portions: 3, State: plan.StatePlanned}}}); err != nil {
		t.Fatal(err)
	}
	got := f.reload(m.Key)
	if got.ID != m.ID || got.RecipeID != f.soup || got.IsBought() {
		t.Errorf("after Regenerate re-placed the cell: %+v; want the same row id, the new Recipe and no longer Bought", got)
	}
}

func TestAPinnedBoughtMealKeepsItsRecordsAndStaysBought(t *testing.T) {
	f := boughtFixture(t)
	ing := f.ingredient("cream")
	m := f.boughtMeal("2026-11-10", f.chicken)
	f.bought(m, 900, 300, ing)
	if err := f.st.SetPinned(ctx, m.Key, true); err != nil {
		t.Fatal(err)
	}
	if got := f.reload(m.Key); !got.Pinned || !got.IsBought() {
		t.Errorf("meal = %+v, want Pinned and Bought both (the sheet shows both facts)", got)
	}
}

func TestTheIngredientMoverCountsMovesAndSumsDuplicateRecords(t *testing.T) {
	f := boughtFixture(t)
	from, to := f.ingredient("single cream"), f.ingredient("cream")
	m := f.boughtMeal("2026-11-10", f.chicken)
	other := f.boughtMeal("2026-11-11", f.pasta)
	f.bought(m, 900, 200, from)
	f.bought(m, 900, 100, to) // the same Planned Meal and Lot already have the target: merged into one record
	f.bought(other, 901, 50, from)

	mover := store.Mover{}
	if n, err := mover.Count(ctx, f.db, from); err != nil || n != 2 {
		t.Fatalf("Count = %d, %v; want the 2 records of the old Ingredient", n, err)
	}
	var _ ingstore.ReferenceMover = mover
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := mover.Move(ctx, tx, from, to); err != nil {
		t.Fatalf("Move: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if n, _ := mover.Count(ctx, f.db, from); n != 0 {
		t.Errorf("Count of the old Ingredient = %d, want 0", n)
	}
	got := f.records(m)
	if len(got) != 1 || got[0].IngredientID != to || got[0].Quantity != 300 {
		t.Errorf("m's records = %+v, want one record of the target for 300 (200 + 100)", got)
	}
	if got := f.records(other); len(got) != 1 || got[0].IngredientID != to || got[0].Quantity != 50 {
		t.Errorf("other's records = %+v, want moved to the target", got)
	}
	if got := f.reload(m.Key); !reflect.DeepEqual(got.Bought, []int64{to}) {
		t.Errorf("Meal.Bought = %v, want [%d]", got.Bought, to)
	}
}

func TestTheMoverIsRegisteredWithTheIngredientMerge(t *testing.T) {
	found := false
	for _, m := range ingstore.DefaultMovers.All() {
		if m.Name() == (store.Mover{}).Name() {
			found = true
		}
	}
	if !found {
		t.Errorf("no mover named %q is registered with the Ingredient merge/delete protection", (store.Mover{}).Name())
	}
}
