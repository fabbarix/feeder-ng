package plan_test

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/plan"
)

// B9-11 (PC-01, SAFE-03): the pure side. CellChanges is what "What changed" lists; MayReopen is the end-of-day window
// of Undo for Cooked and Not cooked.

func cell(date string, slot, course int64) plan.Key {
	return plan.Key{Date: date, MealSlotID: slot, CourseID: course}
}

func planned(k plan.Key, recipe int64) plan.Meal {
	return plan.Meal{Key: k, RecipeID: recipe, Batches: 1, Portions: 2, State: plan.StatePlanned}
}

func fromLeftover(k plan.Key, recipe int64, src plan.Key) plan.Meal {
	m := planned(k, recipe)
	m.Batches = 0
	m.From = &plan.Source{From: src}
	return m
}

func names(id int64) string {
	return map[int64]string{1: "Lentil soup", 2: "Chicken curry", 3: "Stew"}[id]
}

func TestCellChangesListsACellWhoseRecipeChanged(t *testing.T) {
	k := cell("2026-11-10", 5, 7)
	got := plan.CellChanges([]plan.Meal{planned(k, 1)}, []plan.Meal{planned(k, 2)}, names)
	want := []plan.CellChange{{Date: "2026-11-10", MealSlotID: 5, CourseID: 7,
		Before: &plan.CellState{RecipeID: 1, RecipeName: "Lentil soup"},
		After:  &plan.CellState{RecipeID: 2, RecipeName: "Chicken curry"}, Why: []plan.Why{}}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("changes = %+v, want %+v", got, want)
	}
}

func TestCellChangesCarriesTheWhyChipsOfTheNewMeal(t *testing.T) {
	k := cell("2026-11-10", 5, 7)
	after := planned(k, 2)
	after.Why = []plan.Why{{Code: "favourite", MemberIDs: []int64{1}}}
	got := plan.CellChanges([]plan.Meal{planned(k, 1)}, []plan.Meal{after}, names)
	if len(got) != 1 || len(got[0].Why) != 1 || got[0].Why[0].Code != "favourite" {
		t.Errorf("why = %+v, want the after meal's chips", got)
	}
}

func TestCellChangesAnEmptyCellIsNilOnItsSideAndWhyIsNeverNil(t *testing.T) {
	k, k2 := cell("2026-11-10", 5, 7), cell("2026-11-11", 5, 7)
	got := plan.CellChanges([]plan.Meal{planned(k2, 3)}, []plan.Meal{planned(k, 1)}, names)
	if len(got) != 2 {
		t.Fatalf("changes = %+v, want the new cell and the dropped one", got)
	}
	added, dropped := got[0], got[1] // by date
	if added.Before != nil || added.After == nil || added.After.RecipeID != 1 {
		t.Errorf("a cell that was empty = %+v, want Before nil and After the Recipe", added)
	}
	if dropped.After != nil || dropped.Before == nil || dropped.Before.RecipeName != "Stew" {
		t.Errorf("a cell that is empty now = %+v, want After nil and Before the Recipe", dropped)
	}
	if dropped.Why == nil {
		t.Error("Why of a dropped cell is nil; it must be an empty list so the JSON says [] and not null")
	}
}

func TestCellChangesAMealThatBecameAFreshBatchIsAChangeEvenWithTheSameRecipe(t *testing.T) {
	k, src := cell("2026-11-12", 5, 7), cell("2026-11-11", 5, 7)
	got := plan.CellChanges([]plan.Meal{fromLeftover(k, 1, src)}, []plan.Meal{planned(k, 1)}, names)
	if len(got) != 1 || !got[0].Before.ServedFromLeftover || got[0].After.ServedFromLeftover {
		t.Errorf("changes = %+v, want one change from a Leftover to a fresh Batch", got)
	}
}

func TestCellChangesIgnoresWhatIsNotARecipeOrLeftoverChange(t *testing.T) {
	k := cell("2026-11-10", 5, 7)
	before := planned(k, 1)
	after := planned(k, 1)
	after.Pinned, after.Batches, after.Portions = true, 2, 4
	after.Why = []plan.Why{{Code: "variety"}}
	if got := plan.CellChanges([]plan.Meal{before}, []plan.Meal{after}, names); len(got) != 0 {
		t.Errorf("changes = %+v, want none: Pinned, Batches, portions and chips are not a different meal", got)
	}
}

func TestCellChangesIgnoresTheTargetAndEverythingCookedOrSkipped(t *testing.T) {
	target, cooked, skipped := cell("2026-11-09", 5, 7), cell("2026-11-10", 5, 7), cell("2026-11-11", 5, 7)
	before := []plan.Meal{planned(target, 1), planned(cooked, 1), planned(skipped, 1)}
	c, s := planned(cooked, 2), planned(skipped, 2)
	c.State, s.State = plan.StateCooked, plan.StateSkipped
	after := []plan.Meal{planned(target, 2), c, s}
	got := plan.CellChanges(before, after, names, target)
	if len(got) != 0 {
		t.Errorf("changes = %+v, want none: the target is named, and a Cooked or Not cooked meal is not a replan", got)
	}
	if got := plan.CellChanges(before, after, names); len(got) != 1 || got[0].Key() != target {
		t.Errorf("without except the target is listed, and only the target: %+v", got)
	}
}

func TestCellChangesAreOrderedByDateThenMealSlotThenCourse(t *testing.T) {
	a, b, c := cell("2026-11-10", 6, 1), cell("2026-11-10", 5, 2), cell("2026-11-09", 9, 3)
	after := []plan.Meal{planned(a, 2), planned(b, 2), planned(c, 2)}
	before := []plan.Meal{planned(a, 1), planned(b, 1), planned(c, 1)}
	var got []plan.Key
	for _, ch := range plan.CellChanges(before, after, names) {
		got = append(got, ch.Key())
	}
	if want := []plan.Key{c, b, a}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = %v, want %v", got, want)
	}
}

func TestCellChangeJSONUsesTheNamesOfTheAPI(t *testing.T) {
	k := cell("2026-11-10", 5, 7)
	ch := plan.CellChanges([]plan.Meal{planned(k, 1)}, nil, names)
	raw, err := json.Marshal(ch)
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	for _, want := range []string{`"date":"2026-11-10"`, `"mealSlotId":5`, `"courseId":7`, `"before":{"recipeId":1,"recipeName":"Lentil soup","servedFromLeftover":false}`, `"after":null`, `"why":[]`} {
		if !strings.Contains(s, want) {
			t.Errorf("JSON %s lacks %s", s, want)
		}
	}
}

func TestMayReopenUntilTheEndOfTheHouseholdDayItWasMarkedOn(t *testing.T) {
	cases := []struct {
		name, markedOn, today string
		want                  bool
	}{
		{"the same day", "2026-11-09", "2026-11-09", true},
		{"the next day", "2026-11-09", "2026-11-10", false},
		{"a meal of yesterday marked today (To confirm)", "2026-11-09", "2026-11-09", true},
		{"a week later", "2026-11-02", "2026-11-09", false},
		{"no mark recorded", "", "2026-11-09", false},
	}
	for _, c := range cases {
		if got := plan.MayReopen(c.markedOn, c.today); got != c.want {
			t.Errorf("%s: MayReopen(%q, %q) = %v, want %v", c.name, c.markedOn, c.today, got, c.want)
		}
	}
}
