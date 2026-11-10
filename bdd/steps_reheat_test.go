package bdd

import (
	"fmt"
	"strconv"
	"time"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("reheat", reheatSteps) }

// reheatSteps are the few steps the Reheat feature adds to the planning ones (the Meal Slot ids are kept in
// w.Vars["plan:slot:<ISO weekday>"] by the planning steps).
func reheatSteps(sc *godog.ScenarioContext, w *World) {
	slotID := func(date string) (int64, error) {
		d, err := time.Parse("2006-01-02", date)
		if err != nil {
			return 0, err
		}
		wd := int(d.Weekday())
		if wd == 0 {
			wd = 7
		}
		v, _ := w.Vars["plan:slot:"+strconv.Itoa(wd)].(int64)
		if v == 0 {
			return 0, fmt.Errorf("no Meal Slot for %s", date)
		}
		return v, nil
	}
	timers := func() ([]map[string]any, error) {
		r := w.Client.Get("/api/cook/timers")
		if r.Status != 200 {
			return nil, fmt.Errorf("GET /api/cook/timers: %d %s", r.Status, r.Body)
		}
		var out struct {
			Timers []map[string]any `json:"timers"`
		}
		return out.Timers, r.JSON(&out)
	}
	sc.Step(`^I open Cook Mode for the slot on (\d{4}-\d{2}-\d{2})$`, func(date string) error {
		slot, err := slotID(date)
		if err != nil {
			return err
		}
		w.Last = w.Client.Get(fmt.Sprintf("/api/cook/meals/%s/%d", date, slot))
		return nil
	})
	sc.Step(`^the Cook timer "([^"]*)" lasts (\d+) seconds on the meal of (\d{4}-\d{2}-\d{2})$`, func(label string, secs int, date string) error {
		slot, err := slotID(date)
		if err != nil {
			return err
		}
		l, err := timers()
		if err != nil {
			return err
		}
		for _, t := range l {
			if t["label"] != label {
				continue
			}
			if t["scope"] != fmt.Sprintf("meal:%s/%d", date, slot) || t["durationSeconds"] != float64(secs) {
				return fmt.Errorf("timer %q = %v, want scope meal:%s/%d and %d seconds", label, t, date, slot, secs)
			}
			return nil
		}
		return fmt.Errorf("no Cook timer %q", label)
	})
	sc.Step(`^I cancel the Cook timer "([^"]*)"$`, func(label string) error {
		l, err := timers()
		if err != nil {
			return err
		}
		for _, t := range l {
			if t["label"] == label {
				if r := w.Client.Delete(fmt.Sprintf("/api/cook/timers/%v", t["id"])); r.Status != 204 {
					return fmt.Errorf("cancel %q: %d %s", label, r.Status, r.Body)
				}
				return nil
			}
		}
		return fmt.Errorf("no Cook timer %q", label)
	})
}
