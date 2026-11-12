package bdd

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("beta5-r", beta5RSteps) }

// Beta.5 F7: Recipes sorted by last cooked. Planned Meals are written straight to the database (the steps stand in for
// the planner and the Mark cooked flow); the Recipe routes are read through the public API.
func beta5RSteps(sc *godog.ScenarioContext, w *World) {
	if w.Vars == nil {
		w.Vars = map[string]any{}
	}
	recipeID := func(name string) (int64, error) {
		id, ok := w.Vars["lc:recipe:"+name].(int64)
		if !ok {
			return 0, fmt.Errorf("no last-cooked Recipe %q", name)
		}
		return id, nil
	}
	course := func(name string) (int64, error) {
		var id int64
		err := w.Ensure().DB.QueryRow(`SELECT id FROM courses WHERE name = ?`, name).Scan(&id)
		return id, err
	}
	slot := func() (int64, error) {
		if id, ok := w.Vars["lc:slot"].(int64); ok {
			return id, nil
		}
		db := w.Ensure().DB
		res, err := db.Exec(`INSERT INTO meal_slots (weekday, name, time) VALUES (1, 'Dinner', '19:00')`)
		if err != nil {
			return 0, err
		}
		id, _ := res.LastInsertId()
		if _, err := db.Exec(`INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional)
			VALUES (?, (SELECT id FROM courses WHERE is_main = 1), 0, 0)`, id); err != nil {
			return 0, err
		}
		w.Vars["lc:slot"] = id
		return id, nil
	}
	// meal inserts one Planned Meal. fromDate != "" makes it a meal served from a Leftover.
	meal := func(name, date, courseName, state, fromDate, resolvedAt string) error {
		rid, err := recipeID(name)
		if err != nil {
			return err
		}
		cid, err := course(courseName)
		if err != nil {
			return err
		}
		sid, err := slot()
		if err != nil {
			return err
		}
		var from, fromSlot, fromCourse, resolved any
		if fromDate != "" {
			from, fromSlot, fromCourse = fromDate, sid, cid
		}
		if resolvedAt != "" {
			resolved = resolvedAt
		}
		_, err = w.Ensure().DB.Exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state,
			from_date, from_meal_slot_id, from_course_id, resolved_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, 1, 3, ?, ?, ?, ?, ?, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`,
			date, sid, cid, rid, state, from, fromSlot, fromCourse, resolved)
		return err
	}

	sc.Step(`^the last-cooked Recipes (.+) exist$`, func(list string) error {
		env := w.Ensure()
		for _, q := range strings.Split(list, ",") {
			name := strings.Trim(strings.TrimSpace(q), `"`)
			res, err := env.DB.Exec(`INSERT INTO recipes (name, yield, created_at, updated_at) VALUES (?, 4, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`, name)
			if err != nil {
				return err
			}
			id, _ := res.LastInsertId()
			if _, err := env.DB.Exec(`INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, (SELECT id FROM courses WHERE is_main = 1))`, id); err != nil {
				return err
			}
			w.Vars["lc:recipe:"+name] = id
		}
		return nil
	})
	sc.Step(`^the Recipe "([^"]*)" was Cooked fresh on (\d{4}-\d\d-\d\d)$`, func(name, date string) error {
		return meal(name, date, "Main", "cooked", "", "")
	})
	sc.Step(`^the Recipe "([^"]*)" was Cooked fresh as the (\w+) on (\d{4}-\d\d-\d\d) and marked on (\d{4}-\d\d-\d\d)$`, func(name, courseName, date, marked string) error {
		return meal(name, date, courseName, "cooked", "", marked+"T08:00:00Z")
	})
	sc.Step(`^the Recipe "([^"]*)" was served from a Leftover and Cooked on (\d{4}-\d\d-\d\d)$`, func(name, date string) error {
		return meal(name, date, "Main", "cooked", "2026-11-02", "")
	})
	sc.Step(`^the Recipe "([^"]*)" was planned but not Cooked on (\d{4}-\d\d-\d\d)$`, func(name, date string) error {
		return meal(name, date, "Main", "planned", "", "")
	})
	sc.Step(`^the Recipe "([^"]*)" was marked Not cooked on (\d{4}-\d\d-\d\d)$`, func(name, date string) error {
		return meal(name, date, "Main", "skipped", "", "")
	})

	sc.Step(`^I list the Recipes sorted by "([^"]*)"$`, func(sort string) {
		path := "/api/recipes"
		if sort != "" {
			path += "?sort=" + sort
		}
		w.Last = w.Client.Get(path)
	})
	sc.Step(`^the listed Recipes are "([^"]*)" in that order$`, func(want string) error {
		var list []struct{ Name string }
		if err := w.Last.JSON(&list); err != nil {
			return fmt.Errorf("list body: %v: %s", err, w.Last.Body)
		}
		var got []string
		for _, r := range list {
			got = append(got, r.Name)
		}
		if g := strings.Join(got, ", "); g != want {
			return fmt.Errorf("order = %q, want %q", g, want)
		}
		return nil
	})
	sc.Step(`^I read the Recipe "([^"]*)"$`, func(name string) error {
		id, err := recipeID(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Get(fmt.Sprintf("/api/recipes/%d", id))
		return nil
	})

	lastCookedOf := func(body []byte) (*string, error) {
		var one struct {
			LastCookedOn *string `json:"lastCookedOn"`
		}
		if err := json.Unmarshal(body, &one); err != nil {
			return nil, fmt.Errorf("body: %v: %s", err, body)
		}
		return one.LastCookedOn, nil
	}
	check := func(got *string, want string) error {
		switch {
		case want == "" && got != nil:
			return fmt.Errorf("lastCookedOn = %q, want null", *got)
		case want != "" && (got == nil || *got != want):
			return fmt.Errorf("lastCookedOn = %v, want %q", got, want)
		}
		return nil
	}
	sc.Step(`^the Recipe shows last cooked "([^"]*)"$`, func(want string) error {
		got, err := lastCookedOf(w.Last.Body)
		if err != nil {
			return err
		}
		return check(got, want)
	})
	sc.Step(`^the Recipe shows no last cooked date$`, func() error {
		got, err := lastCookedOf(w.Last.Body)
		if err != nil {
			return err
		}
		return check(got, "")
	})
	inList := func(name string) (*string, error) {
		var list []struct {
			Name         string  `json:"name"`
			LastCookedOn *string `json:"lastCookedOn"`
		}
		if err := w.Last.JSON(&list); err != nil {
			return nil, fmt.Errorf("list body: %v: %s", err, w.Last.Body)
		}
		for _, r := range list {
			if r.Name == name {
				return r.LastCookedOn, nil
			}
		}
		return nil, fmt.Errorf("%q is not in the list", name)
	}
	sc.Step(`^the Recipe "([^"]*)" in the list shows last cooked "([^"]*)"$`, func(name, want string) error {
		got, err := inList(name)
		if err != nil {
			return err
		}
		return check(got, want)
	})
	sc.Step(`^the Recipe "([^"]*)" in the list shows no last cooked date$`, func(name string) error {
		got, err := inList(name)
		if err != nil {
			return err
		}
		return check(got, "")
	})
}
