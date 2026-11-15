package bdd

import (
	"fmt"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-25 (PC-04): steps for bdd/features/cook-board/timers_shell.feature. They read the household's timers the way the
// shell does (GET /api/cook/timers with no scope) and reuse the phone and tablet of the cook-board set.

func init() { RegisterSteps("b9-timers-shell", b9TimersShellSteps) }

func b9TimersShellSteps(sc *godog.ScenarioContext, w *World) {
	// listed returns the timer a device lists under a label.
	listed := func(dev, label string) (map[string]any, error) {
		c, ok := w.Vars["cook.device."+dev].(*testkit.Client)
		if !ok {
			return nil, fmt.Errorf("the %s is not signed in in this scenario", dev)
		}
		w.Last = c.Get("/api/cook/timers")
		var out struct {
			Timers []map[string]any `json:"timers"`
		}
		if err := w.Last.JSON(&out); err != nil {
			return nil, err
		}
		for _, t := range out.Timers {
			if t["label"] == label {
				return t, nil
			}
		}
		return nil, fmt.Errorf("%s lists no timer %q; body: %s", dev, label, w.Last.Body)
	}
	sc.Step(`^the (phone|tablet) shows the timer "([^"]*)" of the Recipe "([^"]*)" at Step (\d+)$`, func(dev, label, recipe string, step int) error {
		t, err := listed(dev, label)
		if err != nil {
			return err
		}
		if t["recipeName"] != recipe {
			return fmt.Errorf("timer %q names the Recipe %v, want %q", label, t["recipeName"], recipe)
		}
		if s, _ := t["step"].(float64); int(s) != step-1 {
			return fmt.Errorf("timer %q is at index %v, want %d (Step %d)", label, t["step"], step-1, step)
		}
		return nil
	})
	sc.Step(`^the (phone|tablet) shows the timer "([^"]*)" with no Recipe$`, func(dev, label string) error {
		t, err := listed(dev, label)
		if err != nil {
			return err
		}
		if name, _ := t["recipeName"].(string); name != "" {
			return fmt.Errorf("free timer %q names the Recipe %q", label, name)
		}
		return nil
	})
}
