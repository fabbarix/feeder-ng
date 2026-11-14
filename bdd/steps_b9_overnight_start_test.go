package bdd

import (
	"fmt"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("b9-overnight-start", b9OvernightStartSteps) }

// Beta.9 B9-58 (A2): the Planned Meal that has to be started on an earlier day says so in the plan read
// (meal.startsAt {date, time}). The Latest start, the planner and the settings use the steps of B9-12.
func b9OvernightStartSteps(sc *godog.ScenarioContext, w *World) {
	mealOn := func(date string) (map[string]any, error) {
		r := w.Client.Get(fmt.Sprintf("/api/plan?from=%s&to=%s", date, date))
		slots, err := planJSON(r.Body, "slots")
		if err != nil {
			return nil, err
		}
		list, _ := slots.([]any)
		if len(list) != 1 {
			return nil, fmt.Errorf("plan for %s has %d slots, want 1", date, len(list))
		}
		m := slotMeal(list[0].(map[string]any))
		if m == nil {
			return nil, fmt.Errorf("slot on %s has no Planned Meal: %s", date, r.Body)
		}
		return m, nil
	}
	sc.Step(`^the plan slot on (\d{4}-\d{2}-\d{2}) starts cooking on (\d{4}-\d{2}-\d{2}) at "(\d\d:\d\d)"$`, func(date, startDate, at string) error {
		m, err := mealOn(date)
		if err != nil {
			return err
		}
		s, _ := m["startsAt"].(map[string]any)
		if s == nil || s["date"] != startDate || s["time"] != at {
			return fmt.Errorf("meal.startsAt = %v, want {date %s, time %s}", m["startsAt"], startDate, at)
		}
		return nil
	})
	sc.Step(`^the plan slot on (\d{4}-\d{2}-\d{2}) has no earlier start day$`, func(date string) error {
		m, err := mealOn(date)
		if err != nil {
			return err
		}
		if v, ok := m["startsAt"]; ok {
			return fmt.Errorf("meal.startsAt = %v, want it omitted", v)
		}
		return nil
	})
}
