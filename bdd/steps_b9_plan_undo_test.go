package bdd

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("b9_plan_undo", b9PlanUndoSteps) }

// b9PlanUndoSteps drives B9-11: what a replanning write says it changed, its undo token and POST /api/plan/restore, and
// Undo of Cooked and Not cooked (POST .../reopen). It builds on the planning steps (steps_planning_test.go): the Meal
// Slot ids are in w.Vars["plan:slot:<weekday>"], and the Dinner serves the main Course only.
func b9PlanUndoSteps(sc *godog.ScenarioContext, w *World) {
	date := `(\d{4}-\d{2}-\d{2})`
	slotOn := func(d string) (int64, error) {
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
			return 0, fmt.Errorf("no Dinner Meal Slot on %s was set up", d)
		}
		return id, nil
	}
	cell := func(d, suffix string) (string, error) {
		slot, err := slotOn(d)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("/api/plan/%s/%d/%d%s", d, slot, mainCourseID(w), suffix), nil
	}
	type change struct {
		Date   string `json:"date"`
		Before *struct {
			RecipeName         string `json:"recipeName"`
			ServedFromLeftover bool   `json:"servedFromLeftover"`
		} `json:"before"`
	}
	answer := func() (struct {
		Changes   []change `json:"changes"`
		UndoToken string   `json:"undoToken"`
	}, error) {
		var out struct {
			Changes   []change `json:"changes"`
			UndoToken string   `json:"undoToken"`
		}
		if w.Last == nil {
			return out, fmt.Errorf("there is no answer yet")
		}
		if err := json.Unmarshal(w.Last.Body, &out); err != nil {
			return out, fmt.Errorf("the answer is not JSON: %v: %s", err, w.Last.Body)
		}
		return out, nil
	}
	// planPicture is what the plan holds from Monday 9 to Wednesday 11: Recipe, Pinned, state and Leftover per day.
	planPicture := func() (string, error) {
		r := w.Client.Get("/api/plan?from=2026-11-09&to=2026-11-11")
		if r.Status != 200 {
			return "", fmt.Errorf("GET /api/plan: %d %s", r.Status, r.Body)
		}
		var doc struct {
			Slots []struct {
				Date    string `json:"date"`
				Courses []struct {
					Meal *struct {
						RecipeName         string `json:"recipeName"`
						Pinned             bool   `json:"pinned"`
						State              string `json:"state"`
						ServedFromLeftover any    `json:"servedFromLeftover"`
					} `json:"meal"`
				} `json:"courses"`
			} `json:"slots"`
		}
		if err := json.Unmarshal(r.Body, &doc); err != nil {
			return "", err
		}
		var b strings.Builder
		for _, s := range doc.Slots {
			for _, c := range s.Courses {
				if c.Meal == nil {
					fmt.Fprintf(&b, "%s: empty\n", s.Date)
					continue
				}
				fmt.Fprintf(&b, "%s: %s pinned=%v state=%s leftover=%v\n", s.Date, c.Meal.RecipeName, c.Meal.Pinned, c.Meal.State, c.Meal.ServedFromLeftover != nil)
			}
		}
		return b.String(), nil
	}

	// ---- what a write says ----
	sc.Step(`^the answer has an undo token$`, func() error {
		a, err := answer()
		if err != nil {
			return err
		}
		if a.UndoToken == "" {
			return fmt.Errorf("the answer has no undoToken: %s", w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the answer has no undo token$`, func() error {
		a, err := answer()
		if err != nil {
			return err
		}
		if a.UndoToken != "" {
			return fmt.Errorf("the answer has an undoToken, although nothing changed: %s", w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the answer lists the meal of `+date+` as changed from "([^"]*)"$`, func(d, recipe string) error {
		a, err := answer()
		if err != nil {
			return err
		}
		for _, c := range a.Changes {
			if c.Date == d {
				if c.Before == nil || c.Before.RecipeName != recipe {
					return fmt.Errorf("the change on %s says it was %+v, want %q", d, c.Before, recipe)
				}
				return nil
			}
		}
		return fmt.Errorf("the answer lists no change on %s: %s", d, w.Last.Body)
	})
	sc.Step(`^the answer does not list the meal of `+date+` as changed$`, func(d string) error {
		a, err := answer()
		if err != nil {
			return err
		}
		for _, c := range a.Changes {
			if c.Date == d {
				return fmt.Errorf("the answer lists %s as changed: %s", d, w.Last.Body)
			}
		}
		return nil
	})
	sc.Step(`^the answer lists (\d+) changed meals?$`, func(n int) error {
		a, err := answer()
		if err != nil {
			return err
		}
		if len(a.Changes) != n {
			return fmt.Errorf("the answer lists %d changed meals, want %d: %s", len(a.Changes), n, w.Last.Body)
		}
		return nil
	})

	// ---- Swaps chosen by what is planned (the plan's jitter decides what each day holds) ----
	pinAs := func(d string, recipeID int64) error {
		p, err := cell(d, "")
		if err != nil {
			return err
		}
		w.Last = w.Client.Put(p, map[string]any{"recipeId": recipeID})
		if w.Last.Status != 200 {
			return fmt.Errorf("pin %s as Recipe %d: %d %s", d, recipeID, w.Last.Status, w.Last.Body)
		}
		return nil
	}
	recipeByName := func(name string) (int64, error) {
		id, _ := w.Vars["plan:recipe:"+name].(int64)
		if id == 0 {
			return 0, fmt.Errorf("no planning Recipe %q was set up", name)
		}
		return id, nil
	}
	sc.Step(`^I pin the plan slot on `+date+` as the remembered Recipe$`, func(d string) error {
		name, _ := w.Vars["plan:remembered"].(string)
		id, err := recipeByName(name)
		if err != nil {
			return err
		}
		return pinAs(d, id)
	})
	// A Recipe that is neither the remembered one nor the one the day holds, so the Swap changes the day and puts no later
	// meal inside its Cool-down: the first such Recipe by name.
	sc.Step(`^I pin the plan slot on `+date+` as a Recipe other than the remembered one$`, func(d string) error {
		remembered, _ := w.Vars["plan:remembered"].(string)
		r := w.Client.Get("/api/plan?from=" + d + "&to=" + d)
		var doc struct {
			Slots []struct {
				Courses []struct {
					Meal *struct {
						RecipeName string `json:"recipeName"`
					} `json:"meal"`
				} `json:"courses"`
			} `json:"slots"`
		}
		if err := json.Unmarshal(r.Body, &doc); err != nil {
			return fmt.Errorf("the plan of %s: %v %s", d, err, r.Body)
		}
		current := ""
		if len(doc.Slots) == 1 && len(doc.Slots[0].Courses) > 0 && doc.Slots[0].Courses[0].Meal != nil {
			current = doc.Slots[0].Courses[0].Meal.RecipeName
		}
		var names []string
		for k := range w.Vars {
			if n, ok := strings.CutPrefix(k, "plan:recipe:"); ok && n != remembered && n != current {
				names = append(names, n)
			}
		}
		if len(names) == 0 {
			return fmt.Errorf("no planning Recipe other than %q and %q", remembered, current)
		}
		sort.Strings(names)
		id, err := recipeByName(names[0])
		if err != nil {
			return err
		}
		return pinAs(d, id)
	})
	sc.Step(`^the answer lists the meal of `+date+` as changed from the remembered Recipe$`, func(d string) error {
		name, _ := w.Vars["plan:remembered"].(string)
		a, err := answer()
		if err != nil {
			return err
		}
		for _, c := range a.Changes {
			if c.Date == d {
				if c.Before == nil || c.Before.RecipeName != name {
					return fmt.Errorf("the change on %s says it was %+v, want %q", d, c.Before, name)
				}
				return nil
			}
		}
		return fmt.Errorf("the answer lists no change on %s: %s", d, w.Last.Body)
	})

	// ---- Undo ----
	restore := func(token string) { w.Last = w.Client.Post("/api/plan/restore", map[string]any{"undoToken": token}) }
	sc.Step(`^I remember the undo token$`, func() error {
		a, err := answer()
		if err != nil {
			return err
		}
		w.Vars["b9.token"] = a.UndoToken
		return nil
	})
	sc.Step(`^I undo the change$`, func() error {
		a, err := answer()
		if err != nil {
			return err
		}
		restore(a.UndoToken)
		return nil
	})
	sc.Step(`^I undo the change with the remembered undo token$`, func() error {
		tok, _ := w.Vars["b9.token"].(string)
		restore(tok)
		return nil
	})
	sc.Step(`^I remember the plan$`, func() error {
		p, err := planPicture()
		w.Vars["b9.plan"] = p
		return err
	})
	sc.Step(`^the plan is as I remembered it$`, func() error {
		want, _ := w.Vars["b9.plan"].(string)
		got, err := planPicture()
		if err != nil {
			return err
		}
		if got != want {
			return fmt.Errorf("the plan is\n%s\nwant\n%s", got, want)
		}
		return nil
	})

	// ---- Reopen ----
	sc.Step(`^I reopen the slot on `+date+`$`, func(d string) error {
		p, err := cell(d, "/reopen")
		if err != nil {
			return err
		}
		w.Last = w.Client.Post(p, nil)
		return nil
	})
	sc.Step(`^I have (\d+) portions? of the Leftover cooked on `+date+`$`, func(n int, d string) error {
		var out struct {
			Leftovers []struct {
				ID       int64  `json:"id"`
				FromDate string `json:"fromDate"`
			} `json:"leftovers"`
		}
		if err := w.Client.Get("/api/plan/leftovers").JSON(&out); err != nil {
			return err
		}
		for _, l := range out.Leftovers {
			if l.FromDate == d {
				r := w.Client.Post(fmt.Sprintf("/api/plan/leftovers/%d/had-it", l.ID), map[string]any{"portions": n})
				if r.Status != 200 {
					return fmt.Errorf("had-it: %d %s", r.Status, r.Body)
				}
				return nil
			}
		}
		return fmt.Errorf("no Leftover cooked on %s: %v", d, out.Leftovers)
	})
	resolutionOn := func(d string) (map[string]any, error) {
		r := w.Client.Get("/api/plan?from=" + d + "&to=" + d)
		var doc struct {
			Slots []struct {
				Courses []struct {
					Meal map[string]any `json:"meal"`
				} `json:"courses"`
			} `json:"slots"`
		}
		if err := json.Unmarshal(r.Body, &doc); err != nil || len(doc.Slots) != 1 {
			return nil, fmt.Errorf("the plan of %s: %v %s", d, err, r.Body)
		}
		for _, c := range doc.Slots[0].Courses {
			if c.Meal != nil {
				res, _ := c.Meal["resolution"].(map[string]any)
				return res, nil
			}
		}
		return nil, fmt.Errorf("no meal on %s", d)
	}
	sc.Step(`^the plan slot on `+date+` says it can be undone$`, func(d string) error {
		res, err := resolutionOn(d)
		if err != nil {
			return err
		}
		if res == nil || res["canUndo"] != true {
			return fmt.Errorf("resolution on %s = %v, want canUndo true", d, res)
		}
		return nil
	})
	sc.Step(`^the plan slot on `+date+` says it cannot be undone because "([^"]*)"$`, func(d, why string) error {
		res, err := resolutionOn(d)
		if err != nil {
			return err
		}
		if res == nil || res["canUndo"] != false || res["cannotUndo"] != why {
			return fmt.Errorf("resolution on %s = %v, want canUndo false because %q", d, res, why)
		}
		return nil
	})

	// ---- a second User ----
	sc.Step(`^the live-update stream receives a plan event by "([^"]*)" listing (\d+) changed meals?$`, func(name string, n int) error {
		s, _ := w.Vars["stream"].(*liveStream)
		if s == nil {
			return fmt.Errorf("no stream open")
		}
		deadline := time.After(5 * time.Second)
		for {
			select {
			case l, ok := <-s.lines:
				if !ok {
					return fmt.Errorf("the stream closed")
				}
				data, found := strings.CutPrefix(l, "data: ")
				if !found {
					continue
				}
				var ev struct {
					Changed string `json:"changed"`
					By      *struct {
						Name string `json:"name"`
					} `json:"by"`
					Changes   []json.RawMessage `json:"changes"`
					UndoToken string            `json:"undoToken"`
				}
				if json.Unmarshal([]byte(data), &ev) != nil || ev.Changed != "plan" || ev.By == nil {
					continue
				}
				if ev.By.Name != name || len(ev.Changes) != n {
					return fmt.Errorf("plan event by %q with %d changes, want by %q with %d: %s", ev.By.Name, len(ev.Changes), name, n, data)
				}
				if ev.UndoToken != "" {
					return fmt.Errorf("the event carries the undo token: %s", data)
				}
				return nil
			case <-deadline:
				return fmt.Errorf("no plan event by %q within 5 s", name)
			}
		}
	})
}
