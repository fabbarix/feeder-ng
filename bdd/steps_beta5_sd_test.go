package bdd

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("beta5-sd", beta5SDSteps) }

// Beta.5 SD (ADR 0014, bdd/features/beta5/slot_dates.feature): a Meal Slot on one date. It reuses the C2 household
// ("the C2 household has a Dinner on Monday ...", Recipes, "the C2 plan has ...", "I view the C2 plan for ...") and the
// planning steps ("the planner has finished", "the planning household plans N days ahead"); the C2 variables are
// "c2:slot" (the Dinner's id). Every step here goes through the public API as the signed-in User.
func beta5SDSteps(sc *godog.ScenarioContext, w *World) {
	date := `(\d{4}-\d{2}-\d{2})`
	slot := func() int64 { v, _ := w.Vars["c2:slot"].(int64); return v }
	datesPath := func(d string) string { return fmt.Sprintf("/api/meal-slots/%d/dates/%s", slot(), d) }
	whoPath := func(d string) string { return fmt.Sprintf("/api/meal-slots/%d/attendance?date=%s", slot(), d) }
	type dateDoc struct {
		Date      string  `json:"date"`
		NotServed bool    `json:"notServed"`
		Time      *string `json:"time"`
		UsualTime string  `json:"usualTime"`
		Guests    int     `json:"guests"`
	}
	readDate := func(d string) (dateDoc, error) {
		var doc dateDoc
		r := w.Client.Get(datesPath(d))
		if r.Status != 200 || r.JSON(&doc) != nil {
			return doc, fmt.Errorf("GET %s: %d %s", datesPath(d), r.Status, r.Body)
		}
		return doc, nil
	}
	lastPlan := func(path string) (any, error) {
		var cur any
		if err := json.Unmarshal(w.Last.Body, &cur); err != nil {
			return nil, fmt.Errorf("not JSON: %s", w.Last.Body)
		}
		for _, key := range strings.Split(path, ".") {
			switch n := cur.(type) {
			case map[string]any:
				v, ok := n[key]
				if !ok {
					return nil, fmt.Errorf("path %q: key %q missing in %s", path, key, w.Last.Body)
				}
				cur = v
			case []any:
				i, err := strconv.Atoi(key)
				if err != nil || i < 0 || i >= len(n) {
					return nil, fmt.Errorf("path %q: bad index %q in %s", path, key, w.Last.Body)
				}
				cur = n[i]
			default:
				return nil, fmt.Errorf("path %q: not a container in %s", path, w.Last.Body)
			}
		}
		return cur, nil
	}
	course := func(name string) (map[string]any, error) {
		v, err := lastPlan("slots.0.courses")
		if err != nil {
			return nil, err
		}
		for _, c := range v.([]any) {
			if m := c.(map[string]any); m["name"] == name {
				return m, nil
			}
		}
		return nil, fmt.Errorf("no Course row %q in %s", name, w.Last.Body)
	}
	patch := func(d string, body map[string]any) { w.Last = w.Client.Patch(datesPath(d), body) }
	mustOK := func(what string) error {
		if w.Last.Status != 200 && w.Last.Status != 204 {
			return fmt.Errorf("%s: %d %s", what, w.Last.Status, w.Last.Body)
		}
		return nil
	}
	put := func(d string, body map[string]any) { w.Last = w.Client.Put(whoPath(d), body) }
	waitIdle := func() error {
		for i := 0; i < 2; i++ {
			time.Sleep(150 * time.Millisecond)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err := w.Ensure().App.WaitIdle(ctx)
			cancel()
			if err != nil {
				return err
			}
		}
		return nil
	}

	// --- Not served ---

	sc.Step(`^I mark the Dinner of `+date+` Not served$`, func(d string) error {
		patch(d, map[string]any{"notServed": true})
		return mustOK("mark Not served")
	})
	sc.Step(`^I try to mark the Dinner of `+date+` Not served$`, func(d string) { patch(d, map[string]any{"notServed": true}) })
	sc.Step(`^I mark the Dinner of `+date+` served again$`, func(d string) error {
		patch(d, map[string]any{"notServed": false})
		return mustOK("serve again")
	})
	sc.Step(`^I ask what Not served would remove from the Dinner of `+date+`$`, func(d string) error {
		w.Last = w.Client.Patch(datesPath(d)+"?dryRun=1", map[string]any{"notServed": true})
		return mustOK("dry run")
	})
	sc.Step(`^Not served would remove "([^"]*)" from the Course "([^"]*)"( as Pinned)?$`, func(recipe, courseName, pinned string) error {
		v, err := lastPlan("removes.plannedMeals")
		if err != nil {
			return err
		}
		for _, e := range v.([]any) {
			m := e.(map[string]any)
			if m["courseName"] == courseName && m["recipeName"] == recipe {
				if got, _ := m["pinned"].(bool); got != (pinned != "") {
					return fmt.Errorf("%s in %s: pinned = %v, want %v", recipe, courseName, got, pinned != "")
				}
				return nil
			}
		}
		return fmt.Errorf("the dry run does not list %s in %s: %s", recipe, courseName, w.Last.Body)
	})
	sc.Step(`^the plan slot shows the Dinner Not served$`, func() error {
		v, err := lastPlan("slots.0.notServed")
		if err != nil {
			return err
		}
		if v != true {
			return fmt.Errorf("slot notServed = %v, want true", v)
		}
		return nil
	})
	sc.Step(`^the plan slot shows (\d+) Guests$`, func(n int) error {
		v, err := lastPlan("slots.0.guests")
		if err != nil {
			return err
		}
		if f, _ := v.(float64); int(f) != n {
			return fmt.Errorf("slot guests = %v, want %d", v, n)
		}
		return nil
	})
	sc.Step(`^the C2 answer lists no Courses$`, func() error {
		v, err := lastPlan("slots")
		if err != nil {
			return err
		}
		if n := len(v.([]any)); n != 0 {
			return fmt.Errorf("%d entries, want none: %s", n, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Dinner of `+date+` is (served|Not served)$`, func(d, which string) error {
		doc, err := readDate(d)
		if err != nil {
			return err
		}
		if doc.NotServed != (which == "Not served") {
			return fmt.Errorf("%s: notServed = %v", d, doc.NotServed)
		}
		return nil
	})
	sc.Step(`^the Dinner of `+date+` has no Planned Meal$`, func(d string) error {
		var n int
		if err := w.Ensure().DB.QueryRow(`SELECT count(*) FROM planned_meals WHERE date = ? AND meal_slot_id = ?`, d, slot()).Scan(&n); err != nil {
			return err
		}
		if n != 0 {
			return fmt.Errorf("%d Planned Meals on %s, want none", n, d)
		}
		return nil
	})
	sc.Step(`^the Dinner answers (\d+) ([a-z_]+)$`, func(status int, reason string) error {
		var e struct {
			Error struct {
				Code   string `json:"code"`
				Reason string `json:"reason"`
			} `json:"error"`
		}
		_ = w.Last.JSON(&e)
		if w.Last.Status != status || e.Error.Reason != reason {
			return fmt.Errorf("answer %d reason %q (%s), want %d %s", w.Last.Status, e.Error.Reason, w.Last.Body, status, reason)
		}
		return nil
	})
	sc.Step(`^nobody usually attends the Dinner$`, func() error {
		_, err := w.Ensure().DB.Exec(`DELETE FROM meal_slot_attendees WHERE slot_id = ?`, slot())
		return err
	})
	sc.Step(`^the planner replans because Who's eating changed$`, func() error {
		w.Ensure().App.Deps.Events.Publish("household", map[string]string{"changed": "attendance"})
		return waitIdle()
	})

	// --- Time today ---

	sc.Step(`^I set the Dinner time on `+date+` to (\d\d:\d\d)$`, func(d, hhmm string) error {
		patch(d, map[string]any{"time": hhmm})
		return mustOK("set the time")
	})
	sc.Step(`^I try to set the Dinner time on `+date+` to (\d\d:\d\d)$`, func(d, hhmm string) { patch(d, map[string]any{"time": hhmm}) })
	sc.Step(`^I put the Dinner time on `+date+` back to the usual one$`, func(d string) error {
		patch(d, map[string]any{"time": nil})
		return mustOK("back to the usual time")
	})
	sc.Step(`^the Dinner of `+date+` is at (\d\d:\d\d), usually at (\d\d:\d\d)$`, func(d, at, usual string) error {
		doc, err := readDate(d)
		if err != nil {
			return err
		}
		eff := doc.UsualTime
		if doc.Time != nil {
			eff = *doc.Time
		}
		if eff != at || doc.UsualTime != usual {
			return fmt.Errorf("%s: at %s usually %s, want at %s usually %s", d, eff, doc.UsualTime, at, usual)
		}
		return nil
	})
	sc.Step(`^the Dinner of `+date+` has no time of its own$`, func(d string) error {
		doc, err := readDate(d)
		if err != nil {
			return err
		}
		if doc.Time != nil {
			return fmt.Errorf("%s has its own time %s", d, *doc.Time)
		}
		return nil
	})
	sc.Step(`^the C2 slot should be started by (\d\d:\d\d)$`, func(want string) error {
		v, err := lastPlan("slots.0.startBy")
		if err != nil {
			return err
		}
		if v != want {
			return fmt.Errorf("startBy = %v, want %s", v, want)
		}
		return nil
	})
	sc.Step(`^the sd Recipe "([^"]*)" for the Course "([^"]*)" has a (\d+) minute Advance Step$`, func(name, courseName string, lead int) error {
		var cid, ing int64
		db := w.Ensure().DB
		if err := db.QueryRow(`SELECT id FROM courses WHERE name = ?`, courseName).Scan(&cid); err != nil {
			return err
		}
		r := w.Ensure().LoginAdmin(w.TB).Post("/api/ingredients", map[string]any{"name": "marinade " + name, "baseUnit": "g"})
		var out struct {
			ID int64 `json:"id"`
		}
		if r.Status != 201 || r.JSON(&out) != nil {
			return fmt.Errorf("create Ingredient: %d %s", r.Status, r.Body)
		}
		ing = out.ID
		rr := w.Ensure().LoginAdmin(w.TB).Post("/api/recipes", map[string]any{"name": name, "yield": 2, "courseIds": []int64{cid},
			"lines": []map[string]any{{"ingredientId": ing, "quantity": 100, "unit": "g"}},
			"steps": []map[string]any{
				{"text": "Marinate", "kind": "advance", "durationMinutes": 0, "leadTimeMinutes": lead, "after": []int{}, "uses": []any{}},
				{"text": "Roast", "kind": "active", "durationMinutes": 20, "leadTimeMinutes": 0, "after": []int{}, "uses": []any{}}}})
		if rr.Status != 201 {
			return fmt.Errorf("create Recipe %s: %d %s", name, rr.Status, rr.Body)
		}
		return nil
	})
	sc.Step(`^today's Advance Step "([^"]*)" is due at (\d\d:\d\d)$`, func(text, want string) error {
		r := w.Client.Get("/api/today/advance-steps")
		var out struct {
			Steps []struct {
				Description string `json:"description"`
				DueTime     string `json:"dueTime"`
			} `json:"steps"`
		}
		if r.Status != 200 || r.JSON(&out) != nil {
			return fmt.Errorf("advance steps: %d %s", r.Status, r.Body)
		}
		for _, s := range out.Steps {
			if s.Description == text {
				if s.DueTime != want {
					return fmt.Errorf("%s is due at %s, want %s", text, s.DueTime, want)
				}
				return nil
			}
		}
		return fmt.Errorf("no Advance Step %q today: %s", text, r.Body)
	})

	// --- Guests and Who's eating ---

	sc.Step(`^I set (\d+) Guests at the Dinner of `+date+`$`, func(n int, d string) error {
		put(d, map[string]any{"guests": n})
		return mustOK("set Guests")
	})
	sc.Step(`^I try to set (\d+) Guests at the Dinner of `+date+`$`, func(n int, d string) { put(d, map[string]any{"guests": n}) })
	sc.Step(`^I save Who's eating for the Dinner of `+date+` with nobody and no Guests$`, func(d string) error {
		put(d, map[string]any{"attendance": []any{}, "guests": 0})
		return mustOK("save Who's eating")
	})
	sc.Step(`^I save Who's eating for the Dinner of `+date+` with nobody and (\d+) Guests$`, func(d string, n int) error {
		put(d, map[string]any{"attendance": []any{}, "guests": n})
		return mustOK("save Who's eating")
	})
	sc.Step(`^I reset Who's eating for the Dinner of `+date+`$`, func(d string) error {
		w.Last = w.Client.Delete(whoPath(d))
		return mustOK("reset Who's eating")
	})
	sc.Step(`^the Dinner of `+date+` has (\d+) Guests$`, func(d string, n int) error {
		doc, err := readDate(d)
		if err != nil {
			return err
		}
		if doc.Guests != n {
			return fmt.Errorf("%s has %d Guests, want %d", d, doc.Guests, n)
		}
		return nil
	})
	sc.Step(`^the Dinner of `+date+` plans for (\d+) portions in the Course "([^"]*)"$`, func(d string, n int, name string) error {
		c, err := course(name)
		if err != nil {
			return err
		}
		m, _ := c["meal"].(map[string]any)
		if m == nil {
			return fmt.Errorf("Course %s has no meal: %v", name, c)
		}
		if f, _ := m["portions"].(float64); int(f) != n {
			return fmt.Errorf("Course %s plans for %v portions, want %d", name, m["portions"], n)
		}
		return nil
	})
	sc.Step(`^the Course "([^"]*)" on `+date+` is (pinned|not pinned) with (\d+) Batches$`, func(name, d, pin string, n int) error {
		var batches float64
		var pinned int
		err := w.Ensure().DB.QueryRow(`SELECT batches, pinned FROM planned_meals WHERE date = ? AND meal_slot_id = ?
			AND course_id = (SELECT id FROM courses WHERE name = ?)`, d, slot(), name).Scan(&batches, &pinned)
		if err != nil {
			return err
		}
		if int(batches) != n || (pinned == 1) != (pin == "pinned") {
			return fmt.Errorf("%s on %s: %v Batches, pinned %d; want %d Batches, %s", name, d, batches, pinned, n, pin)
		}
		return nil
	})

	// --- B5-SD, second round ---

	sc.Step(`^I save Who's eating for the Dinner of `+date+` with Anna$`, func(d string) error {
		anna, _ := w.Vars["c2:member:Anna"].(int64)
		put(d, map[string]any{"attendance": []map[string]any{{"memberId": anna}}})
		return mustOK("save Who's eating")
	})
	sc.Step(`^the Dinner answers (\d+) with the code "([a-z_]+)"$`, func(status int, code string) error {
		var e struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		_ = w.Last.JSON(&e)
		if w.Last.Status != status || e.Error.Code != code {
			return fmt.Errorf("answer %d code %q (%s), want %d %s", w.Last.Status, e.Error.Code, w.Last.Body, status, code)
		}
		return nil
	})
	// For the planning household (steps_planning_test.go): the Dinner of that weekday has no usual attendees.
	sc.Step(`^nobody usually attends the Dinner on `+date+`$`, func(d string) error {
		t, err := time.Parse("2006-01-02", d)
		if err != nil {
			return err
		}
		wd := int(t.Weekday())
		if wd == 0 {
			wd = 7
		}
		id, _ := w.Vars["plan:slot:"+strconv.Itoa(wd)].(int64)
		if _, err := w.Ensure().DB.Exec(`DELETE FROM meal_slot_attendees WHERE slot_id = ?`, id); err != nil {
			return err
		}
		w.Ensure().App.Deps.Events.Publish("household", map[string]string{"changed": "mealSlots"})
		return nil
	})
	sc.Step(`^the plan slot on `+date+` is Not served$`, func(d string) error {
		r := w.Client.Get(fmt.Sprintf("/api/plan?from=%s&to=%s", d, d))
		var out struct {
			Slots []struct {
				NotServed bool `json:"notServed"`
			} `json:"slots"`
		}
		if r.Status != 200 || r.JSON(&out) != nil || len(out.Slots) != 1 {
			return fmt.Errorf("plan of %s: %d %s", d, r.Status, r.Body)
		}
		if !out.Slots[0].NotServed {
			return fmt.Errorf("the slot on %s is not Not served: %s", d, r.Body)
		}
		return nil
	})
}
