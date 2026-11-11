package bdd

import (
	"fmt"
	"strings"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("crs-b", crsBSteps) }

// crsBSteps holds the steps for the planner with soft Cool-down and Variety Rules (ADR 0009, docs/dev/design/crs-b.md).
// They reuse the world of the "planning" steps (w.Vars "plan:recipe:<name>" and "plan:tags:<name>").
func crsBSteps(sc *godog.ScenarioContext, w *World) {
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
	// Fresh meals tagged <tag> that carry no variety_relaxed chip are the ones that keep the rule.
	sc.Step(`^the planned fresh meals tagged "([^"]*)" that keep the Variety Rule number at most (\d+)$`, func(tag string, max int) error {
		v, err := planJSON(w.Last.Body, "slots")
		if err != nil {
			return err
		}
		var kept, relaxed []string
		for _, s := range v.([]any) {
			slot := s.(map[string]any)
			m, _ := slot["meal"].(map[string]any)
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
