package httpapi_test

import (
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B5-BO: the dry runs that list what a structural edit would remove also list what was bought for it, so the dialog can
// say so before the User confirms (ADR 0013 point 2; beta5-reconcile §4.3). The fixture is crsc2: Monday Dinner at 19:00
// serving Main then Side for Anna and Sam; today is Monday 2026-11-09 12:00. Test-first: red until the stores read
// planned_meal_bought.

type boRemoved struct {
	CourseID   int64    `json:"courseId"`
	CourseName string   `json:"courseName"`
	RecipeName string   `json:"recipeName"`
	Pinned     bool     `json:"pinned"`
	Bought     []string `json:"bought"`
}

// boughtDinner makes Roast chicken (Main, Bought for chicken thighs and cream) and Green beans (Side, not Bought) planned
// for tonight, with the Anna and Sam attending.
func boughtDinner(t *testing.T) (w *crsc2.World, roast, beans int64) {
	t.Helper()
	w = crsc2.New(t)
	chicken, cream := w.Ingredient("chicken thighs"), w.Ingredient("cream")
	roast = w.Recipe("Roast chicken", crsc2.RecipeSpec{Lines: []crsc2.Line{{Ingredient: chicken, Grams: 400}, {Ingredient: cream, Grams: 100}}})
	beans = w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	main := w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, beans, "planned", false)
	for _, ing := range []int64{cream, chicken} {
		w.Exec(`INSERT INTO planned_meal_bought(planned_meal_id,ingredient_id,lot_id,quantity,bought_at) VALUES (?,?,900,100,'2026-11-09T11:00:00Z')`, main, ing)
	}
	return w, roast, beans
}

func TestNotServedDryRunNamesWhatWasBoughtForEachMeal(t *testing.T) {
	w, _, _ := boughtDinner(t)
	r := w.User.Patch(path("/api/meal-slots/%d/dates/%s", w.Slot, crsc2.Today)+"?dryRun=1", map[string]any{"notServed": true})
	var out struct {
		Removes struct {
			PlannedMeals []boRemoved `json:"plannedMeals"`
		} `json:"removes"`
	}
	r.MustJSON(t, &out)
	if r.Status != 200 || len(out.Removes.PlannedMeals) != 2 {
		t.Fatalf("dry run = %d %s, want two Planned Meals", r.Status, r.Body)
	}
	main, side := out.Removes.PlannedMeals[0], out.Removes.PlannedMeals[1]
	if fmt.Sprint(main.Bought) != "[chicken thighs cream]" {
		t.Errorf("main.bought = %v, want [chicken thighs cream] (by name)", main.Bought)
	}
	if side.Bought == nil || len(side.Bought) != 0 {
		t.Errorf("side.bought = %#v, want an empty list (not null)", side.Bought)
	}
}

func TestTakingACourseOffADryRunNamesWhatWasBoughtForTheMealsItRemoves(t *testing.T) {
	w, roast, _ := boughtDinner(t)
	// Take Main off by making Side the only Course: the Bought Roast chicken is what goes.
	r := w.Admin.Patch("/api/meal-slots/batch", map[string]any{"match": "Dinner", "weekdays": []int{1}, "dryRun": true,
		"set": map[string]any{"courses": []any{courseSpec(w.Side, false)}}})
	var out struct {
		Removes *struct {
			PlannedMeals []struct {
				boRemoved
				RecipeID int64 `json:"recipeId"`
			} `json:"plannedMeals"`
		} `json:"removes"`
	}
	r.MustJSON(t, &out)
	if r.Status != 200 || out.Removes == nil || len(out.Removes.PlannedMeals) != 1 {
		t.Fatalf("dry run = %d %s, want the one Main meal", r.Status, r.Body)
	}
	m := out.Removes.PlannedMeals[0]
	if m.RecipeID != roast || m.CourseName != "Main" || fmt.Sprint(m.Bought) != "[chicken thighs cream]" {
		t.Errorf("removes.plannedMeals[0] = %+v, want Roast chicken (Main) bought for [chicken thighs cream]", m)
	}
	if n := w.Count(`SELECT count(*) FROM planned_meal_bought`); n != 2 {
		t.Errorf("%d records after a dry run, want both still there", n)
	}
}

func TestRemovingTheCourseForRealTakesTheRecordsWithTheMeal(t *testing.T) {
	w, _, _ := boughtDinner(t)
	r := w.Admin.Patch("/api/meal-slots/batch", map[string]any{"match": "Dinner", "weekdays": []int{1},
		"set": map[string]any{"courses": []any{courseSpec(w.Side, false)}}})
	if r.Status != 200 {
		t.Fatalf("batch = %d %s", r.Status, r.Body)
	}
	if n := w.Count(`SELECT count(*) FROM planned_meals WHERE course_id = ? AND meal_slot_id = ?`, w.Main, w.Slot); n != 0 {
		t.Errorf("%d Main meals left, want none", n)
	}
	if n := w.Count(`SELECT count(*) FROM planned_meal_bought`); n != 0 {
		t.Errorf("%d records survive their Planned Meal, want none (cascade)", n)
	}
}

func TestADryRunWithNothingBoughtListsEmptyBoughtLists(t *testing.T) {
	w := crsc2.New(t)
	roast := w.Recipe("Roast chicken", crsc2.RecipeSpec{})
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, roast, "planned", false)
	r := w.Admin.Patch("/api/meal-slots/batch", map[string]any{"match": "Dinner", "weekdays": []int{1}, "dryRun": true,
		"set": map[string]any{"courses": []any{courseSpec(w.Side, false)}}})
	if r.Status != 200 || string(r.Body) == "" {
		t.Fatalf("dry run = %d %s", r.Status, r.Body)
	}
	var out struct {
		Removes struct {
			PlannedMeals []boRemoved `json:"plannedMeals"`
		} `json:"removes"`
	}
	r.MustJSON(t, &out)
	if len(out.Removes.PlannedMeals) != 1 || out.Removes.PlannedMeals[0].Bought == nil || len(out.Removes.PlannedMeals[0].Bought) != 0 {
		t.Errorf("removes = %s, want one meal with \"bought\":[] (not null, not missing)", r.Body)
	}
}
