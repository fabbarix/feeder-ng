package bdd

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("b9-removals", b9RemovalsSteps) }

// Beta.9 B9-04 (SAFE-02, SET-15, ADR 0021): Remove Member and Remove Meal Slot, Undo and the Removed Meal Slots read.
// Meals are written straight to the database (the steps stand in for the planner and Mark Cooked); everything else goes
// through the public API.
func b9RemovalsSteps(sc *godog.ScenarioContext, w *World) {
	actor := func(who string) *testkit.Client {
		email := testkit.AdminEmail
		if who == "User" {
			email = testkit.UserEmail
		}
		env := w.Ensure()
		c, ok := w.Clients[email]
		if !ok {
			c = env.LoginAs(w.TB, email)
			w.Clients[email] = c
		}
		return c
	}
	settle := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := w.Ensure().App.WaitIdle(ctx); err != nil {
			w.TB.Fatalf("the planner did not settle: %v", err)
		}
	}
	memberID := func(name string) (int64, error) {
		id, ok := w.Vars["member:"+name].(int64)
		if !ok {
			return 0, fmt.Errorf("no Member %q was set up", name)
		}
		return id, nil
	}
	// slotID finds a Meal Slot by name and weekday, removed ones included.
	slotID := func(name, day string) (int64, error) {
		var id int64
		err := w.Ensure().DB.QueryRow(`SELECT id FROM meal_slots WHERE name = ? AND weekday = ? ORDER BY id DESC LIMIT 1`, name, weekdays[day]).Scan(&id)
		if err != nil {
			return 0, fmt.Errorf("no Meal Slot %q on %s: %v", name, day, err)
		}
		return id, nil
	}
	removedKey := func(name, day string) string { return "b9:removed:" + name + ":" + day }
	recipe := func(name string) (int64, error) {
		db := w.Ensure().DB
		var id int64
		if err := db.QueryRow(`SELECT id FROM recipes WHERE name = ?`, name).Scan(&id); err == nil {
			return id, nil
		}
		res, err := db.Exec(`INSERT INTO recipes (name, yield, created_at, updated_at) VALUES (?, 4, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`, name)
		if err != nil {
			return 0, err
		}
		id, _ = res.LastInsertId()
		_, err = db.Exec(`INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, (SELECT id FROM courses WHERE is_main = 1))`, id)
		return id, err
	}
	meal := func(slotName, day, recipeName, date, state string) error {
		sid, err := slotID(slotName, day)
		if err != nil {
			return err
		}
		rid, err := recipe(recipeName)
		if err != nil {
			return err
		}
		_, err = w.Ensure().DB.Exec(`INSERT OR IGNORE INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, created_at, updated_at)
			VALUES (?, ?, (SELECT id FROM courses WHERE is_main = 1), ?, 1, 4, ?, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`, date, sid, rid, state)
		return err
	}
	count := func(slotName, day, where string) (int, error) {
		sid, err := slotID(slotName, day)
		if err != nil {
			return 0, err
		}
		var n int
		err = w.Ensure().DB.QueryRow(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND `+where, sid).Scan(&n)
		return n, err
	}
	listed := func(name, day string) (bool, error) {
		var list []struct {
			Name    string `json:"name"`
			Weekday int    `json:"weekday"`
		}
		r := actor("Admin").Get("/api/meal-slots")
		if err := r.JSON(&list); err != nil {
			return false, fmt.Errorf("meal slots: %v: %s", err, r.Body)
		}
		for _, s := range list {
			if s.Name == name && s.Weekday == weekdays[day] {
				return true, nil
			}
		}
		return false, nil
	}
	type removedRow struct {
		IDs         []int64 `json:"ids"`
		Name        string  `json:"name"`
		Weekdays    []int   `json:"weekdays"`
		CookedCount int     `json:"cookedCount"`
	}
	rowsOf := func() ([]removedRow, error) {
		var rows []removedRow
		if err := w.Last.JSON(&rows); err != nil {
			return nil, fmt.Errorf("removed list: %v: %s", err, w.Last.Body)
		}
		return rows, nil
	}

	// ---- Members ----
	sc.Step(`^"([^"]*)" has (\d+) Favourites, Dislikes or Exclusions$`, func(name string, n int) error {
		id, err := memberID(name)
		if err != nil {
			return err
		}
		for i := 0; i < n; i++ {
			rid, err := recipe(fmt.Sprintf("Preferred %d", i))
			if err != nil {
				return err
			}
			if _, err := w.Ensure().DB.Exec(`INSERT INTO member_recipe_preferences (member_id, recipe_id, state) VALUES (?, ?, 'favourite')`, id, rid); err != nil {
				return err
			}
		}
		return nil
	})
	sc.Step(`^"([^"]*)" signs in with "([^"]*)"$`, func(name, email string) error {
		id, err := memberID(name)
		if err != nil {
			return err
		}
		_, err = w.Ensure().DB.Exec(`UPDATE members SET email = ? WHERE id = ?`, email, id)
		return err
	})
	sc.Step(`^the (Admin|User) asks what removing the Member "([^"]*)" would do$`, func(who, name string) error {
		id, err := memberID(name)
		if err != nil {
			return err
		}
		w.Last = actor(who).Get(fmt.Sprintf("/api/members/%d/impact", id))
		return nil
	})
	sc.Step(`^the Member "([^"]*)" is still in the Household$`, func(name string) error {
		id, err := memberID(name)
		if err != nil {
			return err
		}
		var n int
		if err := w.Ensure().DB.QueryRow(`SELECT count(*) FROM members WHERE id = ?`, id).Scan(&n); err != nil || n != 1 {
			return fmt.Errorf("Member %s: %d rows (%v), want 1: asking what removal does must not remove", name, n, err)
		}
		return nil
	})
	sc.Step(`^the Admin undoes the removal of the Member "([^"]*)"$`, func(name string) error {
		id, err := memberID(name)
		if err != nil {
			return err
		}
		w.Last = actor("Admin").Post(fmt.Sprintf("/api/members/%d/restore", id), nil)
		settle()
		return nil
	})
	sc.Step(`^the Member "([^"]*)" is back with the same id$`, func(name string) error {
		id, err := memberID(name)
		if err != nil {
			return err
		}
		var list []struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		}
		if err := actor("Admin").Get("/api/members").JSON(&list); err != nil {
			return err
		}
		for _, m := range list {
			if m.Name == name {
				if m.ID != id {
					return fmt.Errorf("%s came back as id %d, want %d", name, m.ID, id)
				}
				return nil
			}
		}
		return fmt.Errorf("%s is not in the Household", name)
	})
	sc.Step(`^the response JSON list "([^"]*)" has (at least )?(\d+) entries$`, func(key, atLeast string, want int) error {
		var doc map[string]json.RawMessage
		if err := w.Last.JSON(&doc); err != nil {
			return fmt.Errorf("response is not a JSON object: %v; body: %s", err, w.Last.Body)
		}
		var list []any
		if err := json.Unmarshal(doc[key], &list); err != nil {
			return fmt.Errorf("field %q is not a list: %s", key, doc[key])
		}
		if (atLeast == "" && len(list) != want) || len(list) < want {
			return fmt.Errorf("%q has %d entries, want %s%d", key, len(list), atLeast, want)
		}
		return nil
	})

	// ---- Meal Slots ----
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) has the Cooked meal "([^"]*)" on (\d{4}-\d\d-\d\d)$`, func(slot, day, rec, date string) error {
		return meal(slot, day, rec, date, "cooked")
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) has the Not cooked meal "([^"]*)" on (\d{4}-\d\d-\d\d)$`, func(slot, day, rec, date string) error {
		return meal(slot, day, rec, date, "skipped")
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) has a meal of "([^"]*)" on (\d{4}-\d\d-\d\d) still (?:planned|to confirm)$`, func(slot, day, rec, date string) error {
		return meal(slot, day, rec, date, "planned")
	})
	sc.Step(`^the (Admin|User) asks what removing the Meal Slot "([^"]*)" on (\w+) would do$`, func(who, name, day string) error {
		id, err := slotID(name, day)
		if err != nil {
			return err
		}
		w.Last = actor(who).Get(fmt.Sprintf("/api/meal-slots/%d/impact", id))
		return nil
	})
	sc.Step(`^the (Admin|User) removes the Meal Slot "([^"]*)" on (\w+)$`, func(who, name, day string) error {
		id, err := slotID(name, day)
		if err != nil {
			return err
		}
		w.Vars[removedKey(name, day)] = id
		w.Last = actor(who).Delete(fmt.Sprintf("/api/meal-slots/%d", id))
		settle()
		return nil
	})
	sc.Step(`^the (Admin|User) undoes the removal of the Meal Slot "([^"]*)" on (\w+)$`, func(who, name, day string) error {
		id, ok := w.Vars[removedKey(name, day)].(int64)
		if !ok {
			return fmt.Errorf("the Meal Slot %q on %s was not removed in this scenario", name, day)
		}
		w.Last = actor(who).Post(fmt.Sprintf("/api/meal-slots/%d/restore", id), nil)
		settle()
		return nil
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) is (not )?in the Meal Slots list$`, func(name, day, not string) error {
		ok, err := listed(name, day)
		if err != nil {
			return err
		}
		if ok == (not != "") {
			return fmt.Errorf("Meal Slot %q on %s listed = %v, want %v", name, day, ok, not == "")
		}
		return nil
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) still has (\d+) resolved meals in the history$`, func(name, day string, want int) error {
		n, err := count(name, day, `state IN ('cooked', 'skipped')`)
		if err != nil {
			return err
		}
		if n != want {
			return fmt.Errorf("%s on %s has %d resolved meals, want %d", name, day, n, want)
		}
		return nil
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) has no unresolved meals$`, func(name, day string) error {
		n, err := count(name, day, `state = 'planned'`)
		if err != nil {
			return err
		}
		if n != 0 {
			return fmt.Errorf("%s on %s has %d unresolved meals, want none (nothing of a removed Meal Slot stays in To confirm)", name, day, n)
		}
		return nil
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) has an unresolved meal on (\d{4}-\d\d-\d\d)$`, func(name, day, date string) error {
		sid, err := slotID(name, day)
		if err != nil {
			return err
		}
		var n int
		if err := w.Ensure().DB.QueryRow(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND date = ? AND state = 'planned'`, sid, date).Scan(&n); err != nil || n != 1 {
			return fmt.Errorf("%s on %s has %d unresolved meals on %s (%v), want 1", name, day, n, date, err)
		}
		return nil
	})

	// ---- Removed Meal Slots (SET-15) ----
	sc.Step(`^the (Admin|User) reads the Removed Meal Slots$`, func(who string) {
		w.Last = actor(who).Get("/api/meal-slots?removed=with-history")
	})
	sc.Step(`^the Removed Meal Slots list has (\d+) rows$`, func(want int) error {
		rows, err := rowsOf()
		if err != nil {
			return err
		}
		if len(rows) != want {
			return fmt.Errorf("%d rows, want %d: %s", len(rows), want, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Removed Meal Slots row "([^"]*)" shows (\d+) Cooked meals on (\d+) weekdays$`, func(name string, cooked, days int) error {
		rows, err := rowsOf()
		if err != nil {
			return err
		}
		for _, r := range rows {
			if r.Name == name {
				if r.CookedCount != cooked || len(r.Weekdays) != days || len(r.IDs) != days {
					return fmt.Errorf("row %+v, want %d Cooked on %d weekdays", r, cooked, days)
				}
				return nil
			}
		}
		return fmt.Errorf("no row %q in %s", name, strings.TrimSpace(string(w.Last.Body)))
	})
	sc.Step(`^the Admin puts back every Meal Slot of the Removed Meal Slots row "([^"]*)"$`, func(name string) error {
		c := actor("Admin")
		w.Last = c.Get("/api/meal-slots?removed=with-history")
		rows, err := rowsOf()
		if err != nil {
			return err
		}
		for _, r := range rows {
			if r.Name != name {
				continue
			}
			for _, id := range r.IDs {
				if res := c.Post(fmt.Sprintf("/api/meal-slots/%d/restore", id), nil); res.Status != 200 {
					return fmt.Errorf("restore %d = %d %s", id, res.Status, res.Body)
				}
			}
			settle()
			return nil
		}
		return fmt.Errorf("no row %q to put back", name)
	})
}
