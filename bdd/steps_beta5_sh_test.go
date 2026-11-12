package bdd

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/cucumber/godog"
)

// Step definitions for bdd/features/beta5/shopping.feature (team B5-SH). They reuse the Shopping List steps of
// steps_shopping_scan_test.go (set-up, "I view the Shopping List", the line assertions) and its scenario variables
// "ss:list" (the last list viewed) and "ss:ingredient:<name>".

func init() { RegisterSteps("beta5-sh", beta5ShoppingSteps) }

func beta5ShoppingSteps(sc *godog.ScenarioContext, w *World) {
	id := func(name string) int64 { v, _ := w.Vars["ss:ingredient:"+name].(int64); return v }
	list := func() (map[string]any, error) {
		if l, ok := w.Vars["ss:list"].(map[string]any); ok {
			return l, nil
		}
		return nil, fmt.Errorf("no Shopping List was viewed in this scenario")
	}
	refresh := func(to string) error {
		path := "/api/shopping/list"
		if to != "" {
			path += "?to=" + url.QueryEscape(to)
		}
		w.Ensure()
		w.Last = w.Client.Get(path)
		if w.Last.Status != 200 {
			return fmt.Errorf("GET %s: %d %s", path, w.Last.Status, w.Last.Body)
		}
		var doc map[string]any
		_ = json.Unmarshal(w.Last.Body, &doc)
		w.Vars["ss:list"] = doc
		return nil
	}
	currentTo := func() (string, error) {
		l, err := list()
		if err != nil {
			if err := refresh(""); err != nil {
				return "", err
			}
			l, _ = list()
		}
		to, _ := l["to"].(string)
		return to, nil
	}
	mark := func(name, to string) error {
		if to == "" {
			var err error
			if to, err = currentTo(); err != nil {
				return err
			}
		}
		w.Last = w.Client.Post("/api/shopping/not-needed", map[string]any{"ingredientId": id(name), "to": to})
		return nil
	}
	entries := func(key string) []map[string]any {
		l, _ := list()
		var out []map[string]any
		arr, _ := l[key].([]any)
		for _, x := range arr {
			if m, ok := x.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	}
	find := func(key, name string) map[string]any {
		for _, m := range entries(key) {
			if strings.EqualFold(fmt.Sprint(m["name"]), name) {
				return m
			}
		}
		return nil
	}

	sc.Step(`^I mark "([^"]*)" as Not needed on the Shopping List(?: for the range ending `+ssDate+`)?$`, func(name, to string) error {
		w.Ensure()
		if err := mark(name, to); err != nil {
			return err
		}
		if w.Last.Status != 200 {
			return fmt.Errorf("Not needed: %d %s", w.Last.Status, w.Last.Body)
		}
		return refresh(to)
	})
	sc.Step(`^I try to mark "([^"]*)" as Not needed on the Shopping List$`, func(name string) error {
		w.Ensure()
		return mark(name, "")
	})
	sc.Step(`^I say "([^"]*)" is needed after all on the Shopping List$`, func(name string) error {
		to, err := currentTo()
		if err != nil {
			return err
		}
		w.Last = w.Client.Delete(fmt.Sprintf("/api/shopping/not-needed/%d?to=%s", id(name), to))
		if w.Last.Status != 200 {
			return fmt.Errorf("Needed after all: %d %s", w.Last.Status, w.Last.Body)
		}
		return refresh(to)
	})
	sc.Step(`^the Shopping List answers (\d+) ([a-z_]+)$`, func(status int, code string) error {
		if w.Last.Status != status || w.Last.ErrorCode() != code {
			return fmt.Errorf("answer %d %s, want %d %s", w.Last.Status, w.Last.Body, status, code)
		}
		return nil
	})
	sc.Step(`^the Shopping List lists "([^"]*)" as Not needed with (\d+) (?:g|ml|piece)$`, func(name string, want int) error {
		m := find("notNeeded", name)
		if m == nil {
			return fmt.Errorf("no Not needed line for %q in %s", name, w.Last.Body)
		}
		if got, _ := m["quantity"].(float64); got != float64(want) {
			return fmt.Errorf("%s Not needed quantity %v, want %d", name, m["quantity"], want)
		}
		return nil
	})
	sc.Step(`^the Shopping List does not list "([^"]*)" as Not needed$`, func(name string) error {
		if m := find("notNeeded", name); m != nil {
			return fmt.Errorf("unexpected Not needed line: %v", m)
		}
		return nil
	})
	past := func(name, date string) (bool, error) {
		m := find("lines", name)
		if m == nil {
			m = find("notNeeded", name)
		}
		if m == nil {
			return false, fmt.Errorf("no line for %q", name)
		}
		arr, ok := m["pastPlannedMeals"].([]any)
		if !ok {
			return false, fmt.Errorf("line %q has no pastPlannedMeals array: %v", name, m)
		}
		for _, x := range arr {
			p, _ := x.(map[string]any)
			if p["date"] == date && p["mealSlotName"] == "Dinner" {
				return true, nil
			}
		}
		return false, nil
	}
	sc.Step(`^the Shopping List line "([^"]*)" includes the unconfirmed Dinner of `+ssDate+`$`, func(name, date string) error {
		ok, err := past(name, date)
		if err == nil && !ok {
			err = fmt.Errorf("%q does not name the Dinner of %s as unconfirmed", name, date)
		}
		return err
	})
	sc.Step(`^the Shopping List line "([^"]*)" does not include the unconfirmed Dinner of `+ssDate+`$`, func(name, date string) error {
		ok, err := past(name, date)
		if err == nil && ok {
			err = fmt.Errorf("%q names the Dinner of %s as unconfirmed", name, date)
		}
		return err
	})
	// Parked with @wip until the Bought backend lands (team BO).
	sc.Step(`^the Planned Meal of `+ssDate+` is not Bought$`, func(date string) error {
		return fmt.Errorf("pending: needs the Bought backend (migration 1520)")
	})
}
