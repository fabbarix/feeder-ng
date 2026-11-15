package bdd

import (
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("b9_away_ui", b9AwayUISteps) }

// b9AwayUISteps adds the reads the Away UI relies on (B9-46, SET-16): the Member's list of Aways, soonest first, with the Meal Slot an
// Away starts at. It builds on steps_b9_away_test.go (marking a Member away, ending an Away) and the planning steps.
func b9AwayUISteps(sc *godog.ScenarioContext, w *World) {
	date := `(\d{4}-\d{2}-\d{2})`
	member := func(name string) (int64, error) {
		id, _ := w.Vars["plan:member:"+name].(int64)
		if id == 0 {
			return 0, fmt.Errorf("no Member %q was set up", name)
		}
		return id, nil
	}
	dinnerOn := func(d string) (int64, error) {
		t, err := time.Parse("2006-01-02", d)
		if err != nil {
			return 0, err
		}
		wd := int(t.Weekday())
		if wd == 0 {
			wd = 7
		}
		id, _ := w.Vars["plan:slot:"+strconv.Itoa(wd)].(int64)
		if id == 0 {
			return 0, fmt.Errorf("no Dinner on %s", d)
		}
		return id, nil
	}
	list := func(name string) ([]map[string]any, error) {
		id, err := member(name)
		if err != nil {
			return nil, err
		}
		r := w.Client.Get(fmt.Sprintf("/api/members/%d/away", id))
		if r.Status != 200 {
			return nil, fmt.Errorf("GET away of %s: %d %s", name, r.Status, r.Body)
		}
		var out []map[string]any
		if err := json.Unmarshal(r.Body, &out); err != nil {
			return nil, err
		}
		return out, nil
	}

	sc.Step(`^I mark "([^"]*)" away from the Dinner on `+date+` through `+date+`$`, func(name, from, through string) error {
		id, err := member(name)
		if err != nil {
			return err
		}
		slot, err := dinnerOn(from)
		if err != nil {
			return err
		}
		w.Last = w.Client.Post(fmt.Sprintf("/api/members/%d/away", id), map[string]any{"from": from, "fromMealSlotId": slot, "through": through})
		return nil
	})
	sc.Step(`^the Aways of "([^"]*)" start on `+date+` and on `+date+`, soonest first$`, func(name, first, second string) error {
		got, err := list(name)
		if err != nil {
			return err
		}
		if len(got) != 2 || got[0]["from"] != first || got[1]["from"] != second {
			return fmt.Errorf("the Aways of %s are %v, want %s then %s", name, got, first, second)
		}
		return nil
	})
	sc.Step(`^the Away of "([^"]*)" on `+date+` is not started and has no last day yet$`, func(name, from string) error {
		got, err := list(name)
		if err != nil {
			return err
		}
		for _, a := range got {
			if a["from"] == from {
				if a["started"] != false || a["through"] != nil {
					return fmt.Errorf("the Away from %s is %v, want not started and no last day", from, a)
				}
				return nil
			}
		}
		return fmt.Errorf("no Away of %s from %s in %v", name, from, got)
	})
	sc.Step(`^the Away of "([^"]*)" on `+date+` starts at the Dinner$`, func(name, from string) error {
		got, err := list(name)
		if err != nil {
			return err
		}
		slot, err := dinnerOn(from)
		if err != nil {
			return err
		}
		for _, a := range got {
			if a["from"] == from {
				if v, _ := a["fromMealSlotId"].(float64); int64(v) != slot {
					return fmt.Errorf("the Away from %s starts at Meal Slot %v, want the Dinner (%d)", from, a["fromMealSlotId"], slot)
				}
				return nil
			}
		}
		return fmt.Errorf("no Away of %s from %s in %v", name, from, got)
	})
}
