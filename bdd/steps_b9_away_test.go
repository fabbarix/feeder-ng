package bdd

import (
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("b9_away", b9AwaySteps) }

// b9AwaySteps drives B9-24 (PC-08): an Away on a Member over the API. It builds on the planning steps
// (steps_planning_test.go: the Members and the Dinner of every weekday) and on the B9-11 steps for the undo token.
func b9AwaySteps(sc *godog.ScenarioContext, w *World) {
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
	post := func(name, query string, body map[string]any) error {
		id, err := member(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Post(fmt.Sprintf("/api/members/%d/away%s", id, query), body)
		if w.Last.Status == 201 {
			var a struct {
				ID int64 `json:"id"`
			}
			if err := json.Unmarshal(w.Last.Body, &a); err != nil || a.ID == 0 {
				return fmt.Errorf("the answer has no Away id: %s", w.Last.Body)
			}
			w.Vars["away:id:"+name] = a.ID
		}
		return nil
	}
	listOf := func(name string) ([]map[string]any, error) {
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
	slotAway := func(d string) ([]any, error) {
		r := w.Client.Get(fmt.Sprintf("/api/plan?from=%s&to=%s", d, d))
		var doc struct {
			Slots []struct {
				Away []any `json:"away"`
			} `json:"slots"`
		}
		if r.Status != 200 || json.Unmarshal(r.Body, &doc) != nil || len(doc.Slots) != 1 {
			return nil, fmt.Errorf("GET /api/plan for %s: %d %s", d, r.Status, r.Body)
		}
		return doc.Slots[0].Away, nil
	}

	sc.Step(`^I (?:try to )?mark "([^"]*)" away from `+date+` through `+date+`$`, func(name, from, through string) error {
		return post(name, "", map[string]any{"from": from, "through": through})
	})
	sc.Step(`^I mark "([^"]*)" away from `+date+` with no last day$`, func(name, from string) error {
		return post(name, "", map[string]any{"from": from})
	})
	sc.Step(`^I preview marking "([^"]*)" away from `+date+` through `+date+`$`, func(name, from, through string) error {
		return post(name, "?dryRun=1", map[string]any{"from": from, "through": through})
	})
	sc.Step(`^I end the Away of "([^"]*)"$`, func(name string) error {
		id, _ := w.Vars["away:id:"+name].(int64)
		if id == 0 {
			return fmt.Errorf("no Away of %s was made", name)
		}
		w.Last = w.Client.Post(fmt.Sprintf("/api/away/%d/end", id), nil)
		return nil
	})
	sc.Step(`^"([^"]*)" eats at the Dinner on `+date+` anyway$`, func(name, d string) error {
		slot, err := dinnerOn(d)
		if err != nil {
			return err
		}
		var att []map[string]any
		for _, n := range []string{"Anna", "Ben"} {
			id, err := member(n)
			if err != nil {
				return err
			}
			a := map[string]any{"memberId": id}
			if n == name {
				a["despiteAway"] = true
			}
			att = append(att, a)
		}
		w.Last = w.Client.Put(fmt.Sprintf("/api/meal-slots/%d/attendance?date=%s", slot, d), map[string]any{"attendance": att})
		return nil
	})

	sc.Step(`^the preview says (\d+) Meal Slots are without "([^"]*)" and (\d+) meals change$`, func(slots int, _ string, meals int) error {
		var s struct {
			SlotsWithout int `json:"slotsWithout"`
			MealsChanged int `json:"mealsChanged"`
		}
		if err := json.Unmarshal(w.Last.Body, &s); err != nil {
			return fmt.Errorf("the preview is not JSON: %s", w.Last.Body)
		}
		if s.SlotsWithout != slots || s.MealsChanged != meals {
			return fmt.Errorf("the preview says %d Meal Slots and %d meals, want %d and %d: %s", s.SlotsWithout, s.MealsChanged, slots, meals, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^"([^"]*)" has (\d+) Aways?$`, func(name string, n int) error {
		got, err := listOf(name)
		if err != nil {
			return err
		}
		if len(got) != n {
			return fmt.Errorf("%s has %d Aways, want %d: %v", name, len(got), n, got)
		}
		return nil
	})
	sc.Step(`^the plan slot on `+date+` lists "([^"]*)" as away$`, func(d, name string) error {
		id, err := member(name)
		if err != nil {
			return err
		}
		away, err := slotAway(d)
		if err != nil {
			return err
		}
		for _, a := range away {
			if int64(a.(float64)) == id {
				return nil
			}
		}
		return fmt.Errorf("the slot on %s lists %v as away, want %s (%d)", d, away, name, id)
	})
	sc.Step(`^the plan slot on `+date+` lists nobody as away$`, func(d string) error {
		away, err := slotAway(d)
		if err != nil {
			return err
		}
		if len(away) != 0 {
			return fmt.Errorf("the slot on %s lists %v as away, want nobody", d, away)
		}
		return nil
	})
	sc.Step(`^the plan lists the Away of "([^"]*)"$`, func(name string) error {
		var doc struct {
			Away []struct {
				MemberName string `json:"memberName"`
			} `json:"away"`
		}
		if err := json.Unmarshal(w.Last.Body, &doc); err != nil {
			return err
		}
		for _, a := range doc.Away {
			if a.MemberName == name {
				return nil
			}
		}
		return fmt.Errorf("the plan's \"away\" has no Away of %s: %s", name, w.Last.Body)
	})
}
