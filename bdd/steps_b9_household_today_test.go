package bdd

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("b9-household-today", b9HouseholdTodaySteps) }

// Beta.9 B9-12 (PC-14, TB-06, TB-02): Earliest start, the first-run checklist's facts and Meal Slots in one go, and
// the Advance Steps due in the next 24 hours. Everything goes through the public API.
func b9HouseholdTodaySteps(sc *godog.ScenarioContext, w *World) {
	admin := func() *testkit.Client {
		env := w.Ensure()
		c, ok := w.Clients["b9-ht-admin"]
		if !ok {
			c = env.LoginAdmin(w.TB)
			w.Clients["b9-ht-admin"] = c
		}
		return c
	}
	// settle waits for the background planner to finish the replans the set-up caused, so a Planned Meal written
	// afterwards is not replaced by a run still pending.
	settle := func() error {
		for i := 0; i < 2; i++ {
			time.Sleep(150 * time.Millisecond)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err := w.Ensure().App.WaitIdle(ctx)
			cancel()
			if err != nil {
				return fmt.Errorf("the planner did not settle: %v", err)
			}
		}
		return nil
	}

	// ---- PC-14 ----
	sc.Step(`^the planning Recipe "([^"]*)" takes (\d+) hours to cook$`, func(name string, hours int) error {
		ing := admin().Post("/api/ingredients", map[string]any{"name": "pinch of " + strings.ToLower(name), "baseUnit": "g"})
		var in struct {
			ID int64 `json:"id"`
		}
		if ing.Status != 201 || ing.JSON(&in) != nil {
			return fmt.Errorf("create Ingredient: %d %s", ing.Status, ing.Body)
		}
		r := admin().Post("/api/recipes", map[string]any{
			"name": name, "yield": 2.0, "lines": []map[string]any{{"ingredientId": in.ID, "quantity": 1, "unit": "g"}},
			"steps": []map[string]any{{"text": "Simmer", "kind": "active", "durationMinutes": hours * 60, "leadTimeMinutes": 0, "after": []int{}, "uses": []any{}}},
		})
		if r.Status != 201 {
			return fmt.Errorf("create Recipe %s: %d %s", name, r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the plan slot on (\d{4}-\d{2}-\d{2}) lost (\d+) Recipes? to the Earliest start$`, func(date string, want int) error {
		r := w.Client.Get(fmt.Sprintf("/api/plan?from=%s&to=%s", date, date))
		slots, err := planJSON(r.Body, "slots")
		if err != nil {
			return err
		}
		list, _ := slots.([]any)
		if len(list) != 1 {
			return fmt.Errorf("plan for %s has %d slots, want 1", date, len(list))
		}
		u := slotUnfilled(list[0].(map[string]any))
		el, _ := u["eliminated"].(map[string]any)
		if got, _ := el["tooEarly"].(float64); int(got) != want {
			return fmt.Errorf("eliminated.tooEarly = %v, want %d; unfilled: %v", el["tooEarly"], want, u)
		}
		return nil
	})

	// ---- TB-06 ----
	sc.Step(`^every Meal Slot is attended by (\d+) Members?$`, func(want int) error {
		var list []struct {
			Name       string `json:"name"`
			Weekday    int    `json:"weekday"`
			Attendance []struct {
				MemberID              int64    `json:"memberId"`
				PortionFactorOverride *float64 `json:"portionFactorOverride"`
			} `json:"attendance"`
		}
		r := admin().Get("/api/meal-slots")
		if err := r.JSON(&list); err != nil || len(list) == 0 {
			return fmt.Errorf("meal slots: %v: %s", err, r.Body)
		}
		for _, s := range list {
			if len(s.Attendance) != want {
				return fmt.Errorf("%s on weekday %d has %d attendees, want %d", s.Name, s.Weekday, len(s.Attendance), want)
			}
			for _, a := range s.Attendance {
				if a.PortionFactorOverride != nil {
					return fmt.Errorf("%s on weekday %d: Member %d has a Portion Factor override", s.Name, s.Weekday, a.MemberID)
				}
			}
		}
		return nil
	})
	sc.Step(`^there are (\d+) Meal Slots$`, func(want int) error {
		var list []any
		if err := admin().Get("/api/meal-slots").JSON(&list); err != nil {
			return err
		}
		if len(list) != want {
			return fmt.Errorf("%d Meal Slots, want %d", len(list), want)
		}
		return nil
	})

	// ---- TB-02 ----
	sc.Step(`^the Recipe "([^"]*)" has an Advance Step "([^"]*)" (\d+) hours ahead and is planned on (\d{4}-\d{2}-\d{2}) in the Meal Slot "([^"]*)" on (\w+)$`,
		func(name, text string, hours int, date, slot, day string) error {
			ing := admin().Post("/api/ingredients", map[string]any{"name": "pinch of " + strings.ToLower(name), "baseUnit": "g"})
			var in struct {
				ID int64 `json:"id"`
			}
			if ing.Status != 201 || ing.JSON(&in) != nil {
				return fmt.Errorf("create Ingredient: %d %s", ing.Status, ing.Body)
			}
			r := admin().Post("/api/recipes", map[string]any{
				"name": name, "yield": 2.0, "lines": []map[string]any{{"ingredientId": in.ID, "quantity": 1, "unit": "g"}},
				"steps": []map[string]any{
					{"text": text, "kind": "advance", "durationMinutes": 0, "leadTimeMinutes": hours * 60, "after": []int{}, "uses": []any{}},
					{"text": "Cook", "kind": "active", "durationMinutes": 20, "leadTimeMinutes": 0, "after": []int{}, "uses": []any{}},
				},
			})
			var rec struct {
				ID int64 `json:"id"`
			}
			if r.Status != 201 || r.JSON(&rec) != nil {
				return fmt.Errorf("create Recipe %s: %d %s", name, r.Status, r.Body)
			}
			var slotID int64
			if err := w.Ensure().DB.QueryRow(`SELECT id FROM meal_slots WHERE name = ? AND weekday = ? AND removed_at IS NULL`, slot, weekdays[day]).Scan(&slotID); err != nil {
				return fmt.Errorf("no Meal Slot %q on %s: %v", slot, day, err)
			}
			// The background planner has already planned this slot (any Recipe): replace what it planned there.
			if err := settle(); err != nil {
				return err
			}
			if _, err := w.Ensure().DB.Exec(`DELETE FROM planned_meals WHERE date = ? AND meal_slot_id = ?`, date, slotID); err != nil {
				return err
			}
			_, err := w.Ensure().DB.Exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, created_at, updated_at)
				VALUES (?, ?, (SELECT id FROM courses WHERE is_main = 1), ?, 1, 2, 'planned', 0, '2026-11-08T12:00:00Z', '2026-11-08T12:00:00Z')`, date, slotID, rec.ID)
			return err
		})
	sc.Step(`^I mark the Planned Meal of "([^"]*)" on (\d{4}-\d{2}-\d{2}) Cooked$`, func(name, date string) error {
		var slotID, courseID int64
		if err := w.Ensure().DB.QueryRow(`SELECT pm.meal_slot_id, pm.course_id FROM planned_meals pm JOIN recipes r ON r.id = pm.recipe_id
			WHERE r.name = ? AND pm.date = ? AND pm.from_date IS NULL`, name, date).Scan(&slotID, &courseID); err != nil {
			return fmt.Errorf("no fresh Planned Meal of %q on %s: %v", name, date, err)
		}
		r := w.Client.Post(fmt.Sprintf("/api/plan/%s/%d/%d/cooked", date, slotID, courseID), map[string]any{})
		if r.Status != 200 {
			return fmt.Errorf("Cooked = %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the Advance Steps due list has (\d+) steps?$`, func(want int) error {
		var out struct {
			Steps []struct {
				Description string `json:"description"`
			} `json:"steps"`
		}
		if err := w.Last.JSON(&out); err != nil {
			return fmt.Errorf("%v: %s", err, w.Last.Body)
		}
		if len(out.Steps) != want {
			return fmt.Errorf("%d Advance Steps due, want %d: %s", len(out.Steps), want, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^I mark the first due Advance Step done$`, func() error {
		var out struct {
			Steps []struct {
				Scope string `json:"scope"`
				Step  int    `json:"step"`
			} `json:"steps"`
		}
		if err := w.Last.JSON(&out); err != nil || len(out.Steps) == 0 {
			return fmt.Errorf("no due Advance Step to mark: %v: %s", err, w.Last.Body)
		}
		s := out.Steps[0]
		w.Last = w.Client.Put("/api/cook/marks", map[string]any{"scope": s.Scope, "step": s.Step, "done": true})
		if w.Last.Status != 200 {
			return fmt.Errorf("mark = %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})
}
