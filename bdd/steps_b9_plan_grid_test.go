package bdd

import (
	"encoding/json"
	"fmt"
	"regexp"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("b9_plan_grid", b9PlanGridSteps) }

// b9PlanGridSteps drives B9-32's API half: POST /api/courses/{id}/recipes (Mark Recipes as <Course> from the Plan). It builds on
// the C2 steps for the household and the Recipes; "the answer has an undo token" is B9-11's step (steps_b9_plan_undo_test.go).
func b9PlanGridSteps(sc *godog.ScenarioContext, w *World) {
	one := func(query string, args ...any) (int64, error) {
		var id int64
		if err := w.Ensure().DB.QueryRow(query, args...).Scan(&id); err != nil {
			return 0, fmt.Errorf("%s %v: %v", query, args, err)
		}
		return id, nil
	}
	mark := func(course string, ids []int64) error {
		cid, err := one(`SELECT id FROM courses WHERE name = ?`, course)
		if err != nil {
			return err
		}
		w.Last = w.Ensure().LoginUser(w.TB).Post(fmt.Sprintf("/api/courses/%d/recipes", cid), map[string]any{"recipeIds": ids})
		return nil
	}
	recipe := func(name string) (int64, error) { return one(`SELECT id FROM recipes WHERE name = ?`, name) }
	sc.Step(`^I mark the Recipe "([^"]*)" as the Course "([^"]*)" from the Plan$`, func(name, course string) error {
		id, err := recipe(name)
		if err != nil {
			return err
		}
		return mark(course, []int64{id})
	})
	sc.Step(`^I mark the Recipe "([^"]*)" and a Recipe that does not exist as the Course "([^"]*)" from the Plan$`, func(name, course string) error {
		id, err := recipe(name)
		if err != nil {
			return err
		}
		return mark(course, []int64{id, 99999})
	})
	sc.Step(`^the answer says (\d+) Recipes? (?:was|were) marked$`, func(n int) error {
		var out struct {
			Marked int `json:"marked"`
		}
		if w.Last == nil || json.Unmarshal(w.Last.Body, &out) != nil {
			return fmt.Errorf("the answer is not JSON: %v", w.Last)
		}
		if out.Marked != n {
			return fmt.Errorf("marked = %d, want %d: %s", out.Marked, n, w.Last.Body)
		}
		return nil
	})
	marked := regexp.MustCompile(`^the Recipe "([^"]*)" is (not )?marked for the Course "([^"]*)"$`)
	sc.Step(marked.String(), func(name, not, course string) error {
		var n int
		err := w.Ensure().DB.QueryRow(`SELECT count(*) FROM recipe_courses rc JOIN recipes r ON r.id = rc.recipe_id JOIN courses c ON c.id = rc.course_id WHERE r.name = ? AND c.name = ?`, name, course).Scan(&n)
		if err != nil {
			return err
		}
		if (not == "") != (n == 1) {
			return fmt.Errorf("Recipe %q is marked for %q %d times (want marked=%v)", name, course, n, not == "")
		}
		return nil
	})
}
