package httpapi_test

import (
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B5-BO: GET /api/courses/{id}/impact lists what a Delete or Archive of a Course would remove, and what was bought for
// each of those Planned Meals (ADR 0013 point 2). Test-first: red until the store reads planned_meal_bought.

func TestImpactNamesWhatWasBoughtForEachPlannedMealTheCourseRemoves(t *testing.T) {
	w := crsc2.New(t)
	chicken, cream := w.Ingredient("chicken thighs"), w.Ingredient("cream")
	gratin := w.Recipe("Dauphinoise", crsc2.RecipeSpec{Courses: []int64{w.Side}, Lines: []crsc2.Line{{Ingredient: cream, Grams: 200}, {Ingredient: chicken, Grams: 1}}})
	beans := w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	bought := w.Meal(crsc2.Today, w.Slot, w.Side, gratin, "planned", false)
	w.Meal("2026-11-16", w.Slot, w.Side, beans, "planned", true)
	w.Exec(`INSERT INTO planned_meal_bought(planned_meal_id,ingredient_id,lot_id,quantity,bought_at) VALUES (?,?,900,200,'2026-11-09T11:00:00Z')`, bought, cream)

	r := w.User.Get(fmt.Sprintf("/api/courses/%d/impact", w.Side))
	var out struct {
		PlannedMeals []struct {
			RecipeName string   `json:"recipeName"`
			Pinned     bool     `json:"pinned"`
			Bought     []string `json:"bought"`
		} `json:"plannedMeals"`
	}
	r.MustJSON(t, &out)
	if r.Status != 200 || len(out.PlannedMeals) != 2 {
		t.Fatalf("impact = %d %s, want two Planned Meals", r.Status, r.Body)
	}
	first, second := out.PlannedMeals[0], out.PlannedMeals[1]
	if first.RecipeName != "Dauphinoise" || fmt.Sprint(first.Bought) != "[cream]" {
		t.Errorf("first = %+v, want Dauphinoise bought for [cream]", first)
	}
	if second.RecipeName != "Green beans" || !second.Pinned || second.Bought == nil || len(second.Bought) != 0 {
		t.Errorf("second = %+v, want Green beans (Pinned) with an empty bought list (not null)", second)
	}
}
