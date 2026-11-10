package bdd

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("household", householdSteps) }

var weekdays = map[string]int{"Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6, "Sunday": 7}

var quoted = regexp.MustCompile(`"([^"]*)"`)

type slotJSON struct {
	ID             int64   `json:"id"`
	Weekday        int     `json:"weekday"`
	Name           string  `json:"name"`
	PortionsNeeded float64 `json:"portionsNeeded"`
	Attendance     []struct {
		MemberID              int64    `json:"memberId"`
		PortionFactorOverride *float64 `json:"portionFactorOverride"`
	} `json:"attendance"`
}

func householdSteps(sc *godog.ScenarioContext, w *World) {
	sc.Step(`^the response JSON has no field "([^"]*)"$`, func(key string) error {
		var doc map[string]any
		if err := w.Last.JSON(&doc); err != nil {
			return fmt.Errorf("response is not a JSON object: %v; body: %s", err, w.Last.Body)
		}
		if _, ok := doc[key]; ok {
			return fmt.Errorf("field %q present; body: %s", key, w.Last.Body)
		}
		return nil
	})
	admin := func() *testkit.Client {
		env := w.Ensure()
		if c, ok := w.Clients["household-admin"]; ok {
			return c
		}
		c := env.LoginAdmin(w.TB)
		w.Clients["household-admin"] = c
		return c
	}
	memberID := func(name string) (int64, error) {
		id, ok := w.Vars["member:"+name].(int64)
		if !ok {
			return 0, fmt.Errorf("no Member %q was set up", name)
		}
		return id, nil
	}
	findSlot := func(name string, weekday int) (slotJSON, error) {
		var list []slotJSON
		r := admin().Get("/api/meal-slots")
		if err := r.JSON(&list); err != nil {
			return slotJSON{}, fmt.Errorf("meal slots: %v: %s", err, r.Body)
		}
		for _, s := range list {
			if s.Name == name && s.Weekday == weekday {
				return s, nil
			}
		}
		return slotJSON{}, fmt.Errorf("no Meal Slot %q on weekday %d", name, weekday)
	}
	attendee := func(m int64, override *float64) map[string]any {
		return map[string]any{"memberId": m, "portionFactorOverride": override}
	}

	sc.Step(`^the Household has the Member "([^"]*)" with Portion Factor ([0-9.]+)$`, func(name string, factor float64) error {
		r := admin().Post("/api/members", map[string]any{"name": name, "colour": "#3366cc", "portionFactor": factor})
		var m struct{ ID int64 }
		if r.Status != 201 || r.JSON(&m) != nil {
			return fmt.Errorf("create Member %s: %d %s", name, r.Status, r.Body)
		}
		w.Vars["member:"+name] = m.ID
		return nil
	})
	sc.Step(`^the Household has the Meal Slot "([^"]*)" on (\w+) at (\d\d:\d\d) attended by (.+?)(?: with (\w+) at ([0-9.]+))?$`,
		func(name, day, at, who, overrideWho, overrideFactor string) error {
			var att []map[string]any
			for _, m := range quoted.FindAllStringSubmatch(who, -1) {
				id, err := memberID(m[1])
				if err != nil {
					return err
				}
				var override *float64
				if m[1] == overrideWho {
					v, _ := strconv.ParseFloat(overrideFactor, 64)
					override = &v
				}
				att = append(att, attendee(id, override))
			}
			r := admin().Post("/api/meal-slots", map[string]any{"weekday": weekdays[day], "name": name, "time": at, "attendance": att})
			if r.Status != 201 {
				return fmt.Errorf("create Meal Slot: %d %s", r.Status, r.Body)
			}
			return nil
		})
	sc.Step(`^I link the Member "([^"]*)" to the User "([^"]*)"$`, func(member, email string) error {
		mid, err := memberID(member)
		if err != nil {
			return err
		}
		uid, err := userID(w, email)
		if err != nil {
			return err
		}
		n, _ := strconv.ParseInt(uid, 10, 64)
		w.Last = w.Client.Put(fmt.Sprintf("/api/members/%d/user", mid), map[string]any{"userId": n})
		return nil
	})
	sc.Step(`^the Member "([^"]*)" is linked to the User "([^"]*)"$`, func(name, email string) error {
		uid, err := userID(w, email)
		if err != nil {
			return err
		}
		var list []struct {
			Name   string `json:"name"`
			UserID *int64 `json:"userId"`
		}
		if err := admin().Get("/api/members").JSON(&list); err != nil {
			return err
		}
		for _, m := range list {
			if m.Name == name {
				if m.UserID == nil || strconv.FormatInt(*m.UserID, 10) != uid {
					return fmt.Errorf("%s is not linked to %s (user id %s): %v", name, email, uid, m.UserID)
				}
				return nil
			}
		}
		return fmt.Errorf("no Member %q", name)
	})
	sc.Step(`^the error message mentions "([^"]*)"$`, func(text string) error {
		if !strings.Contains(string(w.Last.Body), text) {
			return fmt.Errorf("error body %s does not mention %q", w.Last.Body, text)
		}
		return nil
	})
	sc.Step(`^the Member "([^"]*)" is not linked to any User$`, func(name string) error {
		var list []struct {
			Name   string `json:"name"`
			UserID *int64 `json:"userId"`
		}
		if err := admin().Get("/api/members").JSON(&list); err != nil {
			return err
		}
		for _, m := range list {
			if m.Name == name {
				if m.UserID != nil {
					return fmt.Errorf("%s is linked to User %d", name, *m.UserID)
				}
				return nil
			}
		}
		return fmt.Errorf("no Member %q", name)
	})
	sc.Step(`^the Member "([^"]*)" still has Portion Factor ([0-9.]+)$`, func(name string, want float64) error {
		var list []struct {
			Name          string  `json:"name"`
			PortionFactor float64 `json:"portionFactor"`
		}
		if err := admin().Get("/api/members").JSON(&list); err != nil {
			return err
		}
		for _, m := range list {
			if m.Name == name && m.PortionFactor == want {
				return nil
			}
		}
		return fmt.Errorf("Member %q with Portion Factor %v not found in %+v", name, want, list)
	})
	sc.Step(`^the Admin deletes the Member "([^"]*)"$`, func(name string) error {
		id, err := memberID(name)
		if err != nil {
			return err
		}
		w.Last = admin().Delete(fmt.Sprintf("/api/members/%d", id))
		return nil
	})

	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) needs ([0-9.]+) portions$`, func(name, day string, want float64) error {
		s, err := findSlot(name, weekdays[day])
		if err != nil {
			return err
		}
		if s.PortionsNeeded != want {
			return fmt.Errorf("%s on %s needs %v portions, want %v", name, day, s.PortionsNeeded, want)
		}
		return nil
	})
	sc.Step(`^on (\d{4}-\d{2}-\d{2}) the Meal Slot "([^"]*)" on (\w+) needs ([0-9.]+) portions$`, func(date, name, day string, want float64) error {
		s, err := findSlot(name, weekdays[day])
		if err != nil {
			return err
		}
		var d struct {
			PortionsNeeded float64 `json:"portionsNeeded"`
		}
		r := admin().Get(fmt.Sprintf("/api/meal-slots/%d/attendance?date=%s", s.ID, date))
		if err := r.JSON(&d); err != nil || r.Status != 200 {
			return fmt.Errorf("attendance %s: %d %s", date, r.Status, r.Body)
		}
		if d.PortionsNeeded != want {
			return fmt.Errorf("on %s %s needs %v portions, want %v", date, name, d.PortionsNeeded, want)
		}
		return nil
	})
	sc.Step(`^"([^"]*)" is away from the Meal Slot "([^"]*)" on (\w+) on (\d{4}-\d{2}-\d{2})$`, func(away, name, day, date string) error {
		s, err := findSlot(name, weekdays[day])
		if err != nil {
			return err
		}
		awayID, err := memberID(away)
		if err != nil {
			return err
		}
		var keep []map[string]any
		for _, a := range s.Attendance {
			if a.MemberID != awayID {
				keep = append(keep, attendee(a.MemberID, a.PortionFactorOverride))
			}
		}
		w.Last = w.Client.Put(fmt.Sprintf("/api/meal-slots/%d/attendance?date=%s", s.ID, date), map[string]any{"attendance": keep})
		return nil
	})
	sc.Step(`^nobody attends the Meal Slot "([^"]*)" on (\w+) on (\d{4}-\d{2}-\d{2})$`, func(name, day, date string) error {
		s, err := findSlot(name, weekdays[day])
		if err != nil {
			return err
		}
		w.Last = w.Client.Put(fmt.Sprintf("/api/meal-slots/%d/attendance?date=%s", s.ID, date), map[string]any{"attendance": []any{}})
		return nil
	})
	sc.Step(`^I reset the Attendance of the Meal Slot "([^"]*)" on (\w+) on (\d{4}-\d{2}-\d{2})$`, func(name, day, date string) error {
		s, err := findSlot(name, weekdays[day])
		if err != nil {
			return err
		}
		w.Last = w.Client.Delete(fmt.Sprintf("/api/meal-slots/%d/attendance?date=%s", s.ID, date))
		return nil
	})
}
