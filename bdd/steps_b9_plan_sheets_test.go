package bdd

import (
	"fmt"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("b9_plan_sheets", b9PlanSheetsSteps) }

// b9PlanSheetsSteps drives B9-38's API half: the plan PUT with `markCourse: true` ("Other Recipes" in Choose a Recipe). It
// builds on the C2 household steps; the mark check is B9-32's step, Undo is B9-11's ("I undo the change").
func b9PlanSheetsSteps(sc *godog.ScenarioContext, w *World) {
	one := func(query string, args ...any) (int64, error) {
		var id int64
		if err := w.Ensure().DB.QueryRow(query, args...).Scan(&id); err != nil {
			return 0, fmt.Errorf("%s %v: %v", query, args, err)
		}
		return id, nil
	}
	sc.Step(`^I put "([^"]*)" in the Course "([^"]*)" on (\d{4}-\d{2}-\d{2}) and mark it for that Course$`, func(recipe, course, date string) error {
		rid, err := one(`SELECT id FROM recipes WHERE name = ?`, recipe)
		if err != nil {
			return err
		}
		cid, err := one(`SELECT id FROM courses WHERE name = ?`, course)
		if err != nil {
			return err
		}
		sid, err := one(`SELECT id FROM meal_slots WHERE name = 'Dinner'`)
		if err != nil {
			return err
		}
		w.Last = w.Ensure().LoginUser(w.TB).Put(fmt.Sprintf("/api/plan/%s/%d/%d", date, sid, cid), map[string]any{"recipeId": rid, "markCourse": true})
		return nil
	})
	sc.Step(`^the Course "([^"]*)" on (\d{4}-\d{2}-\d{2}) does not hold "([^"]*)"$`, func(course, date, recipe string) error {
		n, err := one(`SELECT count(*) FROM planned_meals pm JOIN courses c ON c.id = pm.course_id JOIN recipes r ON r.id = pm.recipe_id
		               WHERE pm.date = ? AND c.name = ? AND r.name = ?`, date, course, recipe)
		if err != nil {
			return err
		}
		if n != 0 {
			return fmt.Errorf("the Course %q on %s still holds %q", course, date, recipe)
		}
		return nil
	})
}
