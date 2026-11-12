package httpapi_test

import (
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Beta.5 F7: the whole app, wired at mount: the Recipe routes read Last cooked from the plan store through the port.

type lcRecipe struct {
	Name         string  `json:"name"`
	LastCookedOn *string `json:"lastCookedOn"`
}

func TestTheMountedRecipeRoutesReadLastCookedFromThePlanStore(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	main := courseID(t, env, "Main")
	slot := mustExec(t, env, `INSERT INTO meal_slots (weekday, name, time) VALUES (1, 'Dinner', '19:00')`)
	mustExec(t, env, `INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional) VALUES (?, ?, 0, 0)`, slot, main)
	ids := map[string]int64{}
	for _, n := range []string{"Apple pie", "Borscht", "Chilli"} {
		ids[n] = mustExec(t, env, `INSERT INTO recipes (name, yield, created_at, updated_at) VALUES (?, 4, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`, n)
		mustExec(t, env, `INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, ids[n], main)
	}
	cook := func(recipe int64, date, state string) {
		mustExec(t, env, `INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, created_at, updated_at)
			VALUES (?, ?, ?, ?, 1, 3, ?, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`, date, slot, main, recipe, state)
	}
	cook(ids["Chilli"], "2026-10-05", "cooked")
	cook(ids["Chilli"], "2026-11-02", "cooked")
	cook(ids["Chilli"], "2026-11-06", "planned")
	cook(ids["Apple pie"], "2026-10-20", "cooked")

	var list []lcRecipe
	r := user.Get("/api/recipes?sort=last_cooked_asc")
	r.MustJSON(t, &list)
	order := fmt.Sprint(len(list), " ", list[0].Name, ",", list[1].Name, ",", list[2].Name)
	if r.Status != 200 || order != "3 Borscht,Apple pie,Chilli" {
		t.Fatalf("sort=last_cooked_asc = %d %s, want Borscht, Apple pie, Chilli", r.Status, r.Body)
	}
	if list[0].LastCookedOn != nil || list[1].LastCookedOn == nil || *list[1].LastCookedOn != "2026-10-20" || *list[2].LastCookedOn != "2026-11-02" {
		t.Errorf("dates = %s, want null, 2026-10-20, 2026-11-02 (the planned 6th does not count)", r.Body)
	}
	var one lcRecipe
	user.Get(fmt.Sprintf("/api/recipes/%d", ids["Chilli"])).MustJSON(t, &one)
	if one.LastCookedOn == nil || *one.LastCookedOn != "2026-11-02" {
		t.Errorf("detail lastCookedOn = %v, want 2026-11-02", one.LastCookedOn)
	}
}
