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

func init() { RegisterSteps("b9-meal-slots", b9MealSlotsSteps) }

// Beta.9 B9-42 (SAFE-02, user ruling): Remove and Put back of a Meal Slot on several days, one call each, all or nothing
// (POST /api/meal-slots/remove and /restore with {"ids":[…]}). The other steps are b9-removals'.
func b9MealSlotsSteps(sc *godog.ScenarioContext, w *World) {
	const batchKey = "b9-42:removed-ids"
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
	// "Monday, Tuesday and Wednesday" -> the ids of the newest Meal Slot of that name on each day, removed ones included.
	slotIDs := func(name, days string) ([]int64, error) {
		ids := []int64{}
		for _, day := range strings.FieldsFunc(strings.ReplaceAll(days, " and ", ","), func(r rune) bool { return r == ',' }) {
			day = strings.TrimSpace(day)
			n, ok := weekdays[day]
			if !ok {
				return nil, fmt.Errorf("%q is not a weekday", day)
			}
			var id int64
			if err := w.Ensure().DB.QueryRow(`SELECT id FROM meal_slots WHERE name = ? AND weekday = ? ORDER BY id LIMIT 1`, name, n).Scan(&id); err != nil {
				return nil, fmt.Errorf("no Meal Slot %q on %s: %v", name, day, err)
			}
			ids = append(ids, id)
		}
		return ids, nil
	}

	sc.Step(`^the (Admin|User) removes the Meal Slot "([^"]*)" on ([\w, ]+ and \w+) at once$`, func(who, name, days string) error {
		ids, err := slotIDs(name, days)
		if err != nil {
			return err
		}
		w.Vars[batchKey] = ids
		w.Last = actor(who).Post("/api/meal-slots/remove", map[string]any{"ids": ids})
		settle()
		return nil
	})
	sc.Step(`^the Admin undoes the removal of those Meal Slots at once$`, func() error {
		ids, ok := w.Vars[batchKey].([]int64)
		if !ok {
			return fmt.Errorf("no Meal Slots were removed at once in this scenario")
		}
		w.Last = actor("Admin").Post("/api/meal-slots/restore", map[string]any{"ids": ids})
		settle()
		return nil
	})
	sc.Step(`^the Admin puts back the Removed Meal Slots row "([^"]*)" in one call$`, func(name string) error {
		c := actor("Admin")
		var rows []struct {
			IDs  []int64 `json:"ids"`
			Name string  `json:"name"`
		}
		if err := json.Unmarshal(c.Get("/api/meal-slots?removed=with-history").Body, &rows); err != nil {
			return err
		}
		for _, r := range rows {
			if r.Name == name {
				w.Last = c.Post("/api/meal-slots/restore", map[string]any{"ids": r.IDs})
				settle()
				return nil
			}
		}
		return fmt.Errorf("no Removed Meal Slots row %q", name)
	})
}
