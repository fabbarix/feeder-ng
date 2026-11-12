package bdd

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("crs-b", crsBSteps) }

// crsBSteps holds the steps for the planner with soft Cool-down and Variety Rules (ADR 0009, docs/dev/design/crs-b.md).
// They reuse the world of the "planning" steps (w.Vars "plan:recipe:<name>" and "plan:tags:<name>").
func crsBSteps(sc *godog.ScenarioContext, w *World) {
	crsBCourseSteps(sc, w)
	sc.Step(`^every planning Recipe is archived$`, func() error {
		for k, v := range w.Vars {
			if name, ok := strings.CutPrefix(k, "plan:recipe:"); ok {
				if r := w.Ensure().LoginAdmin(w.TB).Post(fmt.Sprintf("/api/recipes/%d/archive", v.(int64)), nil); r.Status != 200 {
					return fmt.Errorf("archive %s: %d %s", name, r.Status, r.Body)
				}
			}
		}
		return nil
	})
	// A Member's Exclusion of an Ingredient, for the Members and Ingredients of the "planning" steps.
	sc.Step(`^the planning Member "([^"]*)" excludes the planning Ingredient "([^"]*)"$`, func(member, ing string) error {
		mid, _ := w.Vars["plan:member:"+member].(int64)
		iid, _ := w.Vars["plan:ingredient:"+ing].(int64)
		if mid == 0 || iid == 0 {
			return fmt.Errorf("unknown planning Member %q (%d) or Ingredient %q (%d)", member, mid, ing, iid)
		}
		r := w.Ensure().LoginAdmin(w.TB).Put(fmt.Sprintf("/api/ingredient-exclusions/%d", iid), map[string]any{"excluded": true, "memberId": mid})
		if r.Status != 200 && r.Status != 204 {
			return fmt.Errorf("exclude %s for %s: %d %s", ing, member, r.Status, r.Body)
		}
		return nil
	})
	// Fresh meals tagged <tag> that carry no variety_relaxed chip are the ones that keep the rule.
	sc.Step(`^the planned fresh meals tagged "([^"]*)" that keep the Variety Rule number at most (\d+)$`, func(tag string, max int) error {
		v, err := planJSON(w.Last.Body, "slots")
		if err != nil {
			return err
		}
		var kept, relaxed []string
		for _, s := range v.([]any) {
			slot := s.(map[string]any)
			m := slotMeal(slot)
			if m == nil || m["servedFromLeftover"] != nil {
				continue
			}
			tags, _ := w.Vars["plan:tags:"+fmt.Sprint(m["recipeName"])].([]string)
			tagged := false
			for _, tg := range tags {
				if strings.EqualFold(strings.Join(strings.Fields(tg), " "), tag) {
					tagged = true
				}
			}
			if !tagged {
				continue
			}
			isRelaxed := false
			chips, _ := m["why"].([]any)
			for _, c := range chips {
				if c.(map[string]any)["code"] == "variety_relaxed" {
					isRelaxed = true
				}
			}
			if isRelaxed {
				relaxed = append(relaxed, fmt.Sprint(slot["date"]))
			} else {
				kept = append(kept, fmt.Sprint(slot["date"]))
			}
		}
		if len(kept) > max {
			return fmt.Errorf("%d fresh %q meals keep the rule (%v), it allows %d", len(kept), tag, kept, max)
		}
		if len(relaxed) == 0 {
			return fmt.Errorf("no %q meal was relaxed, but the Recipes run out before the week does", tag)
		}
		return nil
	})
	sc.Step(`^no alternative has more than (\d+) why chips and every chip has a code$`, func(max int) error {
		v, err := planJSON(w.Last.Body, "alternatives")
		if err != nil {
			return err
		}
		for _, a := range v.([]any) {
			chips, _ := a.(map[string]any)["why"].([]any)
			if len(chips) > max {
				return fmt.Errorf("alternative with %d why chips, want at most %d: %v", len(chips), max, a)
			}
			for _, c := range chips {
				if c.(map[string]any)["code"] == "" {
					return fmt.Errorf("why chip without a code: %v", a)
				}
			}
		}
		return nil
	})
}

// crsBCourseSteps are the steps for planning with Courses (ADR 0008). The Courses of a Meal Slot, the Courses of a
// Recipe and the opt-outs of Course Attendance are set in the database, because their API belongs to team C; the
// planner is driven through the plan API as in the planning steps, and the Planned Meals are read back from the
// database, because the plan view does not show Courses yet.
func crsBCourseSteps(sc *godog.ScenarioContext, w *World) {
	db := func() *sql.DB { return w.Ensure().DB }
	courseID := func(name string) (int64, error) {
		var id int64
		if err := db().QueryRow(`SELECT id FROM courses WHERE name = ?`, name).Scan(&id); err != nil {
			return 0, fmt.Errorf("no Course %q: %v", name, err)
		}
		return id, nil
	}
	recipeID := func(name string) (int64, error) {
		id, _ := w.Vars["plan:recipe:"+name].(int64)
		if id == 0 {
			return 0, fmt.Errorf("no planning Recipe %q", name)
		}
		return id, nil
	}
	exec := func(query string, args ...any) error {
		_, err := db().Exec(query, args...)
		return err
	}
	// mealsOn lists "course name: recipe name" and the portions of the Planned Meals of the date.
	type planned struct {
		course   string
		recipe   string
		portions float64
	}
	mealsOn := func(date string) ([]planned, error) {
		rows, err := db().Query(`SELECT c.name, r.name, p.portions FROM planned_meals p
			JOIN courses c ON c.id = p.course_id JOIN recipes r ON r.id = p.recipe_id
			WHERE p.date = ? AND p.state = 'planned' ORDER BY c.position`, date)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var out []planned
		for rows.Next() {
			var m planned
			if err := rows.Scan(&m.course, &m.recipe, &m.portions); err != nil {
				return nil, err
			}
			out = append(out, m)
		}
		return out, rows.Err()
	}
	inCourse := func(date, course string) (planned, bool, error) {
		ms, err := mealsOn(date)
		if err != nil {
			return planned{}, false, err
		}
		for _, m := range ms {
			if m.course == course {
				return m, true, nil
			}
		}
		return planned{}, false, nil
	}

	sc.Step(`^every planning Dinner also serves the Course "([^"]*)"( as an optional Course)?$`, func(course, optional string) error {
		id, err := courseID(course)
		if err != nil {
			return err
		}
		opt := 0
		if optional != "" {
			opt = 1
		}
		return exec(`INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional)
			SELECT meal_slot_id, ?, MAX(position) + 1, ? FROM meal_slot_courses GROUP BY meal_slot_id`, id, opt)
	})
	sc.Step(`^the planning Recipe "([^"]*)" is served only as the Course "([^"]*)"$`, func(recipe, course string) error {
		rid, err := recipeID(recipe)
		if err != nil {
			return err
		}
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		if err := exec(`DELETE FROM recipe_courses WHERE recipe_id = ?`, rid); err != nil {
			return err
		}
		return exec(`INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, rid, cid)
	})
	sc.Step(`^the planning Recipe "([^"]*)" is a Whole meal$`, func(recipe string) error {
		rid, err := recipeID(recipe)
		if err != nil {
			return err
		}
		return exec(`UPDATE recipes SET whole_meal = 1 WHERE id = ?`, rid)
	})
	sc.Step(`^"([^"]*)" does not eat the Course "([^"]*)" at the planning Dinner$`, func(member, course string) error {
		mid, _ := w.Vars["plan:member:"+member].(int64)
		cid, err := courseID(course)
		if err != nil || mid == 0 {
			return fmt.Errorf("unknown Member %q or Course %q: %v", member, course, err)
		}
		return exec(`INSERT INTO meal_slot_course_opt_outs (meal_slot_id, course_id, member_id)
			SELECT meal_slot_id, ?, ? FROM meal_slot_courses WHERE course_id = ?`, cid, mid, cid)
	})
	sc.Step(`^the Dinner on `+planDate+` has (\d+) Planned Meals?$`, func(date string, n int) error {
		ms, err := mealsOn(date)
		if err != nil {
			return err
		}
		if len(ms) != n {
			return fmt.Errorf("%d Planned Meals on %s, want %d: %+v", len(ms), date, n, ms)
		}
		return nil
	})
	sc.Step(`^the Dinner on `+planDate+` plans one of "([^"]*)" in the Course "([^"]*)"$`, func(date, names, course string) error {
		m, ok, err := inCourse(date, course)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("no Planned Meal in the Course %q on %s", course, date)
		}
		for _, n := range strings.Split(names, ",") {
			if strings.TrimSpace(n) == m.recipe {
				return nil
			}
		}
		return fmt.Errorf("the %s on %s is %q, want one of %s", course, date, m.recipe, names)
	})
	sc.Step(`^the Dinner on `+planDate+` plans ([0-9.]+) portions in the Course "([^"]*)"$`, func(date string, want float64, course string) error {
		m, ok, err := inCourse(date, course)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("no Planned Meal in the Course %q on %s", course, date)
		}
		if m.portions != want {
			return fmt.Errorf("the %s on %s plans %v portions, want %v", course, date, m.portions, want)
		}
		return nil
	})
	sc.Step(`^the Dinner on `+planDate+` plans nothing in the Course "([^"]*)"$`, func(date, course string) error {
		_, ok, err := inCourse(date, course)
		if err != nil {
			return err
		}
		if ok {
			return fmt.Errorf("a Planned Meal in the Course %q on %s, want none", course, date)
		}
		return nil
	})
	sc.Step(`^the Course "([^"]*)" of the Dinner on `+planDate+` could not be planned because "([^"]*)"$`, func(course, date, reason string) error {
		var got string
		err := db().QueryRow(`SELECT u.reason FROM plan_unfilled u JOIN courses c ON c.id = u.course_id
			WHERE u.date = ? AND c.name = ?`, date, course).Scan(&got)
		if err == sql.ErrNoRows {
			return fmt.Errorf("the Course %q on %s has no 'couldn't plan' reason, want %q", course, date, reason)
		}
		if err != nil {
			return err
		}
		if got != reason {
			return fmt.Errorf("the Course %q on %s could not be planned because %q, want %q", course, date, got, reason)
		}
		return nil
	})
	sc.Step(`^the Course "([^"]*)" of the Dinner on `+planDate+` has no 'couldn't plan' reason$`, func(course, date string) error {
		var n int
		if err := db().QueryRow(`SELECT count(*) FROM plan_unfilled u JOIN courses c ON c.id = u.course_id
			WHERE u.date = ? AND c.name = ?`, date, course).Scan(&n); err != nil {
			return err
		}
		if n != 0 {
			return fmt.Errorf("the Course %q on %s has a 'couldn't plan' reason, want none", course, date)
		}
		return nil
	})
}
