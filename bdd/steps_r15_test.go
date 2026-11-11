package bdd

import (
	"fmt"
	"strings"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("r15", r15Steps) }

// R15: multi-day Meal Slot edit through PATCH /api/meal-slots/batch.
func r15Steps(sc *godog.ScenarioContext, w *World) {
	admin := func() *testkit.Client {
		env := w.Ensure()
		if c, ok := w.Clients["household-admin"]; ok {
			return c
		}
		c := env.LoginAdmin(w.TB)
		w.Clients["household-admin"] = c
		return c
	}
	days := func(list string) []int {
		var out []int
		for _, p := range strings.FieldsFunc(list, func(r rune) bool { return r == ',' || r == ' ' }) {
			if d, ok := weekdays[p]; ok {
				out = append(out, d)
			}
		}
		return out
	}
	send := func(match, list string, set map[string]any) {
		w.Last = admin().Patch("/api/meal-slots/batch", map[string]any{"match": match, "weekdays": days(list), "set": set})
	}
	dayName := func(n int) string {
		for k, v := range weekdays {
			if v == n {
				return k
			}
		}
		return "?"
	}
	var out struct {
		Updated []struct {
			Weekday int `json:"weekday"`
		} `json:"updated"`
		Skipped []struct {
			Weekday int `json:"weekday"`
		} `json:"skipped"`
	}
	decode := func() error {
		if err := w.Last.JSON(&out); err != nil {
			return fmt.Errorf("batch response: %v: %s", err, w.Last.Body)
		}
		return nil
	}

	sc.Step(`^the Admin changes the time of "([^"]*)" on ([A-Za-z, ]+?) to (\d\d:\d\d)$`, func(name, list, at string) error {
		send(name, strings.ReplaceAll(list, " and ", ","), map[string]any{"time": at})
		return nil
	})
	sc.Step(`^the Admin renames "([^"]*)" on ([A-Za-z, ]+?) to "([^"]*)"$`, func(name, list, to string) error {
		send(name, strings.ReplaceAll(list, " and ", ","), map[string]any{"name": to})
		return nil
	})
	sc.Step(`^the Admin makes "([^"]*)" attend "([^"]*)" on ([A-Za-z, ]+)$`, func(member, name, list string) error {
		var anna, mid int64
		anna, _ = w.Vars["member:Anna"].(int64)
		mid, _ = w.Vars["member:"+member].(int64)
		send(name, strings.ReplaceAll(list, " and ", ","), map[string]any{"attendance": []map[string]any{
			{"memberId": anna, "portionFactorOverride": nil}, {"memberId": mid, "portionFactorOverride": nil}}})
		return nil
	})
	sc.Step(`^the batch updated "([^"]*)" on ([A-Za-z, ]+)$`, func(_, list string) error {
		if err := decode(); err != nil {
			return err
		}
		want := days(strings.ReplaceAll(list, " and ", ","))
		if len(out.Updated) != len(want) {
			return fmt.Errorf("updated %d days, want %v: %s", len(out.Updated), want, w.Last.Body)
		}
		for i, u := range out.Updated {
			if u.Weekday != want[i] {
				return fmt.Errorf("updated[%d] = %s, want %s", i, dayName(u.Weekday), dayName(want[i]))
			}
		}
		return nil
	})
	sc.Step(`^the batch skipped (\w+)$`, func(day string) error {
		if err := decode(); err != nil {
			return err
		}
		if len(out.Skipped) != 1 || out.Skipped[0].Weekday != weekdays[day] {
			return fmt.Errorf("skipped = %+v, want only %s: %s", out.Skipped, day, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) is at (\d\d:\d\d)$`, func(name, day, at string) error {
		var list []struct {
			Weekday int    `json:"weekday"`
			Name    string `json:"name"`
			Time    string `json:"time"`
		}
		if err := admin().Get("/api/meal-slots").JSON(&list); err != nil {
			return err
		}
		for _, s := range list {
			if s.Name == name && s.Weekday == weekdays[day] {
				if s.Time != at {
					return fmt.Errorf("%s on %s is at %s, want %s", name, day, s.Time, at)
				}
				return nil
			}
		}
		return fmt.Errorf("no Meal Slot %q on %s", name, day)
	})
}
