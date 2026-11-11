package bdd

import (
	"fmt"
	"strconv"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("r13", r13Steps) }

// R13: Attendance defaults to everyone. These steps create Meal Slots through the public API with the
// "attendance" field left out (everyone) or sent empty (nobody).
func r13Steps(sc *godog.ScenarioContext, w *World) {
	admin := func() *testkit.Client {
		env := w.Ensure()
		if c, ok := w.Clients["household-admin"]; ok {
			return c
		}
		c := env.LoginAdmin(w.TB)
		w.Clients["household-admin"] = c
		return c
	}
	slotsByDay := func() ([]slotJSON, error) {
		var list []slotJSON
		r := admin().Get("/api/meal-slots")
		if err := r.JSON(&list); err != nil {
			return nil, fmt.Errorf("meal slots: %v: %s", err, r.Body)
		}
		return list, nil
	}
	find := func(name, day string) (slotJSON, error) {
		list, err := slotsByDay()
		if err != nil {
			return slotJSON{}, err
		}
		for _, s := range list {
			if s.Name == name && s.Weekday == weekdays[day] {
				return s, nil
			}
		}
		return slotJSON{}, fmt.Errorf("no Meal Slot %q on %s", name, day)
	}
	memberName := func(id int64) string {
		for k, v := range w.Vars {
			if n, ok := v.(int64); ok && n == id && len(k) > 7 && k[:7] == "member:" {
				return k[7:]
			}
		}
		return strconv.FormatInt(id, 10)
	}

	sc.Step(`^the Admin adds the Meal Slot "([^"]*)" on (\w+) at (\d\d:\d\d) without naming who attends$`, func(name, day, at string) error {
		w.Last = admin().Post("/api/meal-slots", map[string]any{"weekday": weekdays[day], "name": name, "time": at})
		return nil
	})
	sc.Step(`^the Admin adds the Meal Slot "([^"]*)" on (\w+) at (\d\d:\d\d) for nobody$`, func(name, day, at string) error {
		w.Last = admin().Post("/api/meal-slots", map[string]any{"weekday": weekdays[day], "name": name, "time": at, "attendance": []any{}})
		return nil
	})
	sc.Step(`^the Admin adds a Dinner at (\d\d:\d\d) every day without naming who attends$`, func(at string) error {
		for wd := 1; wd <= 7; wd++ {
			r := admin().Post("/api/meal-slots", map[string]any{"weekday": wd, "name": "Dinner", "time": at})
			var s struct{ ID int64 }
			if r.Status != 201 || r.JSON(&s) != nil {
				return fmt.Errorf("create the Dinner Meal Slot: %d %s", r.Status, r.Body)
			}
			w.Vars["plan:slot:"+strconv.Itoa(wd)] = s.ID // the planning steps look slots up by weekday
		}
		return nil
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) is attended by (.+)$`, func(name, day, who string) error {
		s, err := find(name, day)
		if err != nil {
			return err
		}
		want := map[string]bool{}
		for _, m := range quoted.FindAllStringSubmatch(who, -1) {
			want[m[1]] = true
		}
		got := map[string]bool{}
		for _, a := range s.Attendance {
			got[memberName(a.MemberID)] = true
		}
		if len(got) != len(want) {
			return fmt.Errorf("%s on %s is attended by %v, want %v", name, day, got, want)
		}
		for n := range want {
			if !got[n] {
				return fmt.Errorf("%s on %s is attended by %v, want %v", name, day, got, want)
			}
		}
		return nil
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) has no Portion Factor override for "([^"]*)"$`, func(name, day, member string) error {
		s, err := find(name, day)
		if err != nil {
			return err
		}
		for _, a := range s.Attendance {
			if memberName(a.MemberID) == member {
				if a.PortionFactorOverride != nil {
					return fmt.Errorf("%s has an override of %v on %s", member, *a.PortionFactorOverride, name)
				}
				return nil
			}
		}
		return fmt.Errorf("%s does not attend %s on %s", member, name, day)
	})
}
