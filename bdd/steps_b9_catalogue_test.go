package bdd

import (
	"fmt"
	"strings"

	"github.com/cucumber/godog"
)

// B9-06 (SSP-13, SSP-14): reads of the Shopping List viewed by `I view the Shopping List` (kept in w.Vars["ss:list"]).

func init() { RegisterSteps("b9-catalogue", b9CatalogueSteps) }

func b9CatalogueSteps(sc *godog.ScenarioContext, w *World) {
	line := func(name string) (map[string]any, error) {
		l, ok := w.Vars["ss:list"].(map[string]any)
		if !ok {
			return nil, fmt.Errorf("no Shopping List was viewed in this scenario")
		}
		lines, _ := l["lines"].([]any)
		for _, it := range lines {
			if m, ok := it.(map[string]any); ok && strings.EqualFold(fmt.Sprint(m["name"]), name) {
				return m, nil
			}
		}
		return nil, fmt.Errorf("no Line for %q", name)
	}
	sc.Step(`^the pack for "([^"]*)" is (bought|not bought yet)$`, func(name, state string) error {
		l, err := line(name)
		if err != nil {
			return err
		}
		pack, _ := l["pack"].(map[string]any)
		if pack == nil {
			return fmt.Errorf("Line %q has no pack", name)
		}
		got, ok := pack["bought"].(bool)
		if !ok {
			return fmt.Errorf("pack of %q has no boolean \"bought\": %v", name, pack)
		}
		if got != (state == "bought") {
			return fmt.Errorf("pack of %q: bought = %v, want %s", name, got, state)
		}
		return nil
	})
	sc.Step(`^the Shopping List has (\d+) lines? with no price$`, func(want int) error {
		l, ok := w.Vars["ss:list"].(map[string]any)
		if !ok {
			return fmt.Errorf("no Shopping List was viewed in this scenario")
		}
		if got, _ := l["unpricedLines"].(float64); int(got) != want {
			return fmt.Errorf("unpricedLines = %v, want %d", l["unpricedLines"], want)
		}
		return nil
	})
	meals := func(name string) ([]any, error) {
		l, err := line(name)
		if err != nil {
			return nil, err
		}
		pm, ok := l["plannedMeals"].([]any)
		if !ok {
			return nil, fmt.Errorf("Line %q has no \"plannedMeals\" array: %v", name, l)
		}
		return pm, nil
	}
	sc.Step(`^the Shopping List line "([^"]*)" is for (\d+) Planned Meals?$`, func(name string, want int) error {
		pm, err := meals(name)
		if err != nil {
			return err
		}
		if len(pm) != want {
			return fmt.Errorf("Line %q is for %d Planned Meals, want %d: %v", name, len(pm), want, pm)
		}
		return nil
	})
	sc.Step(`^Planned Meal (\d+) of "([^"]*)" is on (\d{4}-\d{2}-\d{2}) at "([^"]*)" for "([^"]*)"$`, func(n int, name, date, slot, recipe string) error {
		pm, err := meals(name)
		if err != nil {
			return err
		}
		if n < 1 || n > len(pm) {
			return fmt.Errorf("Line %q has %d Planned Meals, no number %d", name, len(pm), n)
		}
		m, _ := pm[n-1].(map[string]any)
		if m["date"] != date || m["mealSlotName"] != slot || m["recipeName"] != recipe {
			return fmt.Errorf("Planned Meal %d of %q = %v, want %s %s %s", n, name, m, date, slot, recipe)
		}
		return nil
	})
}
