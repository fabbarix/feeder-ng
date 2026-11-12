package bdd

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("crs-c2", crsC2Steps) }

// Team C2 (docs/dev/design/crs-c2.md): the plan, cook, Today and board API per Course. The household is built straight
// in the database (no events, so the planner stays quiet); Recipes go through the API; Planned Meals are rows. The
// fixed clock reads Monday 2026-11-09 12:00 UTC, the household zone is UTC.

const c2Date = `(\d{4}-\d{2}-\d{2})`

func crsC2Steps(sc *godog.ScenarioContext, w *World) {
	exec := func(query string, args ...any) (int64, error) {
		res, err := w.Ensure().DB.Exec(query, args...)
		if err != nil {
			return 0, fmt.Errorf("%s: %v", query, err)
		}
		id, _ := res.LastInsertId()
		return id, nil
	}
	one := func(query string, args ...any) (int64, error) {
		var id int64
		if err := w.Ensure().DB.QueryRow(query, args...).Scan(&id); err != nil {
			return 0, fmt.Errorf("%s %v: %v", query, args, err)
		}
		return id, nil
	}
	str := func(query string, args ...any) string {
		var s string
		_ = w.Ensure().DB.QueryRow(query, args...).Scan(&s)
		return s
	}
	admin := func() *testkit.Client { return w.Ensure().LoginAdmin(w.TB) }
	user := func() *testkit.Client { return w.Ensure().LoginUser(w.TB) }
	courseID := func(name string) (int64, error) { return one(`SELECT id FROM courses WHERE name = ?`, name) }
	recipeID := func(name string) (int64, error) { return one(`SELECT id FROM recipes WHERE name = ?`, name) }
	slotID := func() int64 { v, _ := w.Vars["c2:slot"].(int64); return v }
	ingredient := func(name string) (int64, error) {
		if v, ok := w.Vars["c2:ing:"+name].(int64); ok {
			return v, nil
		}
		r := admin().Post("/api/ingredients", map[string]any{"name": name, "baseUnit": "g"})
		var out struct {
			ID int64 `json:"id"`
		}
		if r.Status != 201 || r.JSON(&out) != nil {
			return 0, fmt.Errorf("create Ingredient %s: %d %s", name, r.Status, r.Body)
		}
		w.Vars["c2:ing:"+name] = out.ID
		return out.ID, nil
	}
	cell := func(date, course string) (string, error) {
		cid, err := courseID(course)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("/api/plan/%s/%d/%d", date, slotID(), cid), nil
	}
	body := func() (map[string]any, error) {
		var m map[string]any
		if err := json.Unmarshal(w.Last.Body, &m); err != nil {
			return nil, fmt.Errorf("not a JSON object: %v: %s", err, w.Last.Body)
		}
		return m, nil
	}
	// at walks a dotted path through the last answer; a numeric key indexes an array.
	at := func(path string) (any, error) {
		var cur any
		if err := json.Unmarshal(w.Last.Body, &cur); err != nil {
			return nil, err
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
					return nil, fmt.Errorf("path %q: bad index %q (len %d) in %s", path, key, len(n), w.Last.Body)
				}
				cur = n[i]
			default:
				return nil, fmt.Errorf("path %q: %v is not a container", path, cur)
			}
		}
		return cur, nil
	}
	// courseRow finds the Course row of the last GET /api/plan answer (one slot).
	courseRow := func(name string) (map[string]any, error) {
		v, err := at("slots.0.courses")
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

	// --- Household and Recipes ---

	sc.Step(`^the C2 household has a Dinner on Monday at 19:00 serving (.+) attended by Anna and Sam$`, func(list string) error {
		a, err := exec(`INSERT INTO members (name, colour, portion_factor, created_at) VALUES ('Anna', '#3366cc', 1, '2026-11-01T00:00:00Z')`)
		if err != nil {
			return err
		}
		s, err := exec(`INSERT INTO members (name, colour, portion_factor, created_at) VALUES ('Sam', '#81b29a', 1, '2026-11-01T00:00:00Z')`)
		if err != nil {
			return err
		}
		w.Vars["c2:member:Anna"], w.Vars["c2:member:Sam"] = a, s
		slot, err := exec(`INSERT INTO meal_slots (weekday, name, time) VALUES (1, 'Dinner', '19:00')`)
		if err != nil {
			return err
		}
		w.Vars["c2:slot"] = slot
		for _, m := range []int64{a, s} {
			if _, err := exec(`INSERT INTO meal_slot_attendees (slot_id, member_id) VALUES (?, ?)`, slot, m); err != nil {
				return err
			}
		}
		for i, name := range crsQuoted.FindAllStringSubmatch(list, -1) {
			cid, err := courseID(name[1])
			if err != nil {
				return err
			}
			if _, err := exec(`INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional) VALUES (?, ?, ?, 0)`, slot, cid, i); err != nil {
				return err
			}
		}
		return nil
	})
	sc.Step(`^the Course "([^"]*)" of that Dinner is optional$`, func(course string) error {
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		_, err = exec(`UPDATE meal_slot_courses SET optional = 1 WHERE meal_slot_id = ? AND course_id = ?`, slotID(), cid)
		return err
	})
	sc.Step(`^Anna and Sam both skip the Course "([^"]*)" at that Dinner$`, func(course string) error {
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		for _, m := range []string{"Anna", "Sam"} {
			if _, err := exec(`INSERT INTO meal_slot_course_opt_outs (meal_slot_id, course_id, member_id) VALUES (?, ?, ?)`, slotID(), cid, w.Vars["c2:member:"+m]); err != nil {
				return err
			}
		}
		return nil
	})
	// A Recipe: "the C2 Recipe "X" for the Course "Side" with yield 4 using 100 g of "beans" has a 10 minute active Step".
	sc.Step(`^the C2 Recipe "([^"]*)" for the Course "([^"]*)"( as a Whole meal)? uses (\d+) g of "([^"]*)" and has (?:a (\d+) minute (active|passive) Step|no Steps)(?: with yield (\d+))?$`,
		func(name, course, whole, grams, ing, minutes, kind, yield string) error {
			cid, err := courseID(course)
			if err != nil {
				return err
			}
			iid, err := ingredient(ing)
			if err != nil {
				return err
			}
			g, _ := strconv.ParseFloat(grams, 64)
			y := 2.0
			if yield != "" {
				y, _ = strconv.ParseFloat(yield, 64)
			}
			steps := []map[string]any{}
			if minutes != "" {
				m, _ := strconv.Atoi(minutes)
				steps = append(steps, map[string]any{"text": "Cook " + name, "kind": kind, "durationMinutes": m, "after": []int{}, "uses": []any{}})
			}
			r := admin().Post("/api/recipes", map[string]any{"name": name, "yield": y, "courseIds": []int64{cid}, "wholeMeal": whole != "",
				"lines": []map[string]any{{"ingredientId": iid, "quantity": g, "unit": "g"}}, "steps": steps})
			if r.Status != 201 {
				return fmt.Errorf("create Recipe %s: %d %s", name, r.Status, r.Body)
			}
			return nil
		})
	sc.Step(`^the C2 Recipe "([^"]*)" is also marked for the Course "([^"]*)"$`, func(recipe, course string) error {
		rid, err := recipeID(recipe)
		if err != nil {
			return err
		}
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		_, err = exec(`INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, rid, cid)
		return err
	})
	sc.Step(`^the C2 Stock holds (\d+) g of "([^"]*)"$`, func(g int, ing string) error {
		iid, err := ingredient(ing)
		if err != nil {
			return err
		}
		if r := admin().Post("/api/stock/lots", map[string]any{"ingredientId": iid, "quantity": g}); r.Status != 201 {
			return fmt.Errorf("add a Stock Lot: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the C2 Stock of "([^"]*)" is (\d+) g$`, func(ing string, want int) error {
		iid, err := ingredient(ing)
		if err != nil {
			return err
		}
		var out struct {
			Ingredients []struct {
				ID    int64   `json:"ingredientId"`
				Total float64 `json:"total"`
			} `json:"ingredients"`
		}
		r := admin().Get("/api/stock")
		if err := r.JSON(&out); err != nil {
			return err
		}
		var got float64
		for _, i := range out.Ingredients {
			if i.ID == iid {
				got = i.Total
			}
		}
		if got != float64(want) {
			return fmt.Errorf("Stock holds %v g of %s, want %d", got, ing, want)
		}
		return nil
	})
	// The planner may have run on the setup; the scenario then writes the plan rows it needs.
	sc.Step(`^the C2 plan is empty$`, func() error {
		for i := 0; i < 2; i++ { // let the planner finish what the setup started
			time.Sleep(150 * time.Millisecond)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err := w.Ensure().App.WaitIdle(ctx)
			cancel()
			if err != nil {
				return err
			}
		}
		for _, q := range []string{`DELETE FROM planned_meals`, `DELETE FROM plan_unfilled`, `DELETE FROM leftovers`} {
			if _, err := exec(q); err != nil {
				return err
			}
		}
		return nil
	})
	sc.Step(`^the C2 plan has "([^"]*)" in the Course "([^"]*)" on `+c2Date+` as (planned|cooked|skipped)( and pinned)?$`, func(recipe, course, date, state, pinned string) error {
		rid, err := recipeID(recipe)
		if err != nil {
			return err
		}
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		p := 0
		if pinned != "" {
			p = 1
		}
		_, err = exec(`INSERT OR REPLACE INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, created_at, updated_at)
			VALUES (?, ?, ?, ?, 1, 2, ?, ?, '2026-11-08T12:00:00Z', '2026-11-08T12:00:00Z')`, date, slotID(), cid, rid, state, p)
		return err
	})
	sc.Step(`^the C2 plan has "([^"]*)" on `+c2Date+` served in the Course "([^"]*)" from the Leftover of `+c2Date+`$`, func(recipe, date, course, from string) error {
		rid, err := recipeID(recipe)
		if err != nil {
			return err
		}
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		_, err = exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, from_date, from_meal_slot_id, from_course_id, created_at, updated_at)
			VALUES (?, ?, ?, ?, 0, 2, 'planned', 0, ?, ?, ?, '2026-11-08T12:00:00Z', '2026-11-08T12:00:00Z')`, date, slotID(), cid, rid, from, slotID(), cid)
		return err
	})
	sc.Step(`^the C2 plan could not fill the Course "([^"]*)" on `+c2Date+` because "([^"]*)"$`, func(course, date, reason string) error {
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		_, err = exec(`INSERT INTO plan_unfilled (date, meal_slot_id, course_id, reason, slot_rule_claimed, eliminated_json) VALUES (?, ?, ?, ?, 0, '{}')`, date, slotID(), cid, reason)
		return err
	})

	// --- Reading the plan ---

	sc.Step(`^I view the C2 plan for `+c2Date+`$`, func(date string) { w.Last = user().Get("/api/plan?from=" + date + "&to=" + date) })
	sc.Step(`^the C2 plan lists the Courses (.+) in that order$`, func(list string) error {
		v, err := at("slots.0.courses")
		if err != nil {
			return err
		}
		var got []string
		for _, c := range v.([]any) {
			got = append(got, c.(map[string]any)["name"].(string))
		}
		var want []string
		for _, n := range crsQuoted.FindAllStringSubmatch(list, -1) {
			want = append(want, n[1])
		}
		if strings.Join(got, ",") != strings.Join(want, ",") {
			return fmt.Errorf("Courses %v, want %v", got, want)
		}
		return nil
	})
	sc.Step(`^the C2 Course "([^"]*)" holds "([^"]*)"$`, func(course, recipe string) error {
		c, err := courseRow(course)
		if err != nil {
			return err
		}
		m, _ := c["meal"].(map[string]any)
		if m == nil || m["recipeName"] != recipe {
			return fmt.Errorf("Course %s has meal %v, want %s", course, c["meal"], recipe)
		}
		return nil
	})
	sc.Step(`^the C2 Course "([^"]*)" is covered by "([^"]*)"$`, func(course, recipe string) error {
		c, err := courseRow(course)
		if err != nil {
			return err
		}
		cb, _ := c["coveredBy"].(map[string]any)
		if cb == nil || cb["recipeName"] != recipe || c["meal"] != nil || c["unfilled"] != nil {
			return fmt.Errorf("Course %s = %v, want covered by %s with no meal and no reason", course, c, recipe)
		}
		return nil
	})
	sc.Step(`^the C2 Course "([^"]*)" is unserved because "([^"]*)"$`, func(course, why string) error {
		c, err := courseRow(course)
		if err != nil {
			return err
		}
		if c["unserved"] != why || c["meal"] != nil || c["unfilled"] != nil || c["coveredBy"] != nil {
			return fmt.Errorf("Course %s = %v, want unserved %q only", course, c, why)
		}
		return nil
	})
	sc.Step(`^the C2 Course "([^"]*)" has the reason "([^"]*)"$`, func(course, reason string) error {
		c, err := courseRow(course)
		if err != nil {
			return err
		}
		u, _ := c["unfilled"].(map[string]any)
		if u == nil || u["reason"] != reason {
			return fmt.Errorf("Course %s unfilled = %v, want %s", course, c["unfilled"], reason)
		}
		return nil
	})
	sc.Step(`^the C2 slot takes (\d+) minutes? to cook$`, func(n int) error {
		v, err := at("slots.0.cookMinutes")
		if err != nil {
			return err
		}
		if f, _ := v.(float64); int(f) != n {
			return fmt.Errorf("cookMinutes = %v, want %d", v, n)
		}
		return nil
	})
	sc.Step(`^the C2 slot has nothing left to cook$`, func() error {
		v, err := at("slots.0.cookMinutes")
		if err != nil {
			return err
		}
		if v != nil {
			return fmt.Errorf("cookMinutes = %v, want null", v)
		}
		return nil
	})

	// --- Acting on a Course ---

	sc.Step(`^I put "([^"]*)" in the Course "([^"]*)" on `+c2Date+`$`, func(recipe, course, date string) error {
		rid, err := recipeID(recipe)
		if err != nil {
			return err
		}
		p, err := cell(date, course)
		if err != nil {
			return err
		}
		w.Last = user().Put(p, map[string]any{"recipeId": rid})
		return nil
	})
	sc.Step(`^I put "([^"]*)" in the main Course on `+c2Date+` by the old path$`, func(recipe, date string) error {
		rid, err := recipeID(recipe)
		if err != nil {
			return err
		}
		w.Last = user().Put(fmt.Sprintf("/api/plan/%s/%d", date, slotID()), map[string]any{"recipeId": rid})
		return nil
	})
	sc.Step(`^I (confirm|unpin|mark as Cooked|mark as Not cooked) the Course "([^"]*)" on `+c2Date+`$`, func(what, course, date string) error {
		p, err := cell(date, course)
		if err != nil {
			return err
		}
		suffix := map[string]string{"confirm": "/confirm", "unpin": "/unpin", "mark as Cooked": "/cooked", "mark as Not cooked": "/not-cooked"}[what]
		var b any
		if what == "mark as Cooked" {
			b = map[string]any{}
		}
		w.Last = user().Post(p+suffix, b)
		return nil
	})
	sc.Step(`^I ask for the alternatives of the Course "([^"]*)" on `+c2Date+`$`, func(course, date string) error {
		p, err := cell(date, course)
		if err != nil {
			return err
		}
		w.Last = user().Get(p + "/alternatives")
		return nil
	})
	sc.Step(`^I use the old per-slot path to mark `+c2Date+` as (Cooked|Not cooked)$`, func(date, what string) error {
		suffix, b := "/not-cooked", any(nil)
		if what == "Cooked" {
			suffix, b = "/cooked", map[string]any{}
		}
		w.Last = user().Post(fmt.Sprintf("/api/plan/%s/%d%s", date, slotID(), suffix), b)
		return nil
	})
	sc.Step(`^I mark all Courses on `+c2Date+` as Cooked keeping (\d+) portions of the Course "([^"]*)"$`, func(date string, n int, course string) error {
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		w.Last = user().Post(fmt.Sprintf("/api/plan/%s/%d/all/cooked", date, slotID()), map[string]any{"courses": []any{
			map[string]any{"courseId": cid, "leftoverPortions": n}}})
		return nil
	})
	sc.Step(`^I mark all Courses on `+c2Date+` as Cooked$`, func(date string) error {
		w.Last = user().Post(fmt.Sprintf("/api/plan/%s/%d/all/cooked", date, slotID()), map[string]any{})
		return nil
	})
	sc.Step(`^I mark the whole slot on `+c2Date+` as Not cooked$`, func(date string) error {
		w.Last = user().Post(fmt.Sprintf("/api/plan/%s/%d/all/not-cooked", date, slotID()), nil)
		return nil
	})
	sc.Step(`^I list the C2 (meals to confirm|slots the planner could not plan)$`, func(what string) error {
		p := "/api/plan/to-confirm"
		if what != "meals to confirm" {
			p = "/api/plan/couldnt-plan"
		}
		w.Last = user().Get(p)
		return nil
	})
	sc.Step(`^the C2 answer lists the Courses (.+) in that order$`, func(list string) error {
		v, err := at("slots")
		if err != nil {
			return err
		}
		var got []string
		for _, e := range v.([]any) {
			n, _ := e.(map[string]any)["courseName"].(string)
			got = append(got, n)
		}
		var want []string
		for _, n := range crsQuoted.FindAllStringSubmatch(list, -1) {
			want = append(want, n[1])
		}
		if strings.Join(got, ",") != strings.Join(want, ",") {
			return fmt.Errorf("entries for %v, want %v", got, want)
		}
		return nil
	})
	sc.Step(`^the C2 meal of the Course "([^"]*)" on `+c2Date+` is (planned|cooked|skipped)$`, func(course, date, state string) error {
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		if got := str(`SELECT state FROM planned_meals WHERE date = ? AND meal_slot_id = ? AND course_id = ?`, date, slotID(), cid); got != state {
			return fmt.Errorf("the %s on %s is %q, want %q", course, date, got, state)
		}
		return nil
	})
	sc.Step(`^the C2 Course "([^"]*)" on `+c2Date+` has no Planned Meal$`, func(course, date string) error {
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		if got := str(`SELECT state FROM planned_meals WHERE date = ? AND meal_slot_id = ? AND course_id = ?`, date, slotID(), cid); got != "" {
			return fmt.Errorf("the %s on %s is %q, want no row", course, date, got)
		}
		return nil
	})
	sc.Step(`^the answer covers the Course "([^"]*)"$`, func(course string) error {
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		m, err := body()
		if err != nil {
			return err
		}
		cov, _ := m["covered"].([]any)
		if len(cov) != 1 || int64(cov[0].(float64)) != cid {
			return fmt.Errorf("covered = %v, want [%d]", m["covered"], cid)
		}
		return nil
	})
	sc.Step(`^the answer's alternative (\d+) is "([^"]*)" and (relaxed|strict)$`, func(i int, recipe, mode string) error {
		v, err := at(fmt.Sprintf("alternatives.%d", i-1))
		if err != nil {
			return err
		}
		a := v.(map[string]any)
		if a["recipeName"] != recipe || a["relaxed"] != (mode == "relaxed") {
			return fmt.Errorf("alternative %d = %v, want %s %s", i, a, mode, recipe)
		}
		return nil
	})
	sc.Step(`^the answer's alternative (\d+) ends with the why chip "([^"]*)"$`, func(i int, code string) error {
		v, err := at(fmt.Sprintf("alternatives.%d.why", i-1))
		if err != nil {
			return err
		}
		ws := v.([]any)
		if len(ws) == 0 || ws[len(ws)-1].(map[string]any)["code"] != code {
			return fmt.Errorf("why = %v, want it to end with %s", ws, code)
		}
		return nil
	})
	sc.Step(`^the C2 Recipe "([^"]*)" was cooked in the Course "([^"]*)" on `+c2Date+`$`, func(recipe, course, date string) error {
		rid, err := recipeID(recipe)
		if err != nil {
			return err
		}
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		_, err = exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, resolved_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, 1, 2, 'cooked', 1, '2026-11-08T20:00:00Z', '2026-11-07T12:00:00Z', '2026-11-08T20:00:00Z')`, date, slotID(), cid, rid)
		return err
	})

	// --- Cook Mode ---

	sc.Step(`^I open the cooking timeline of `+c2Date+`$`, func(date string) { w.Last = user().Get(fmt.Sprintf("/api/cook/meals/%s/%d/all", date, slotID())) })
	sc.Step(`^I open Cook Mode for the Course "([^"]*)" on `+c2Date+`$`, func(course, date string) error {
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		w.Last = user().Get(fmt.Sprintf("/api/cook/meals/%s/%d/%d", date, slotID(), cid))
		return nil
	})
	sc.Step(`^I open Cook Mode for `+c2Date+` by the old two-part path$`, func(date string) {
		w.Last = user().Get(fmt.Sprintf("/api/cook/meals/%s/%d", date, slotID()))
	})
	sc.Step(`^the timeline takes (\d+) minutes and starts at ([0-9:]+) UTC$`, func(n int, hhmm string) error {
		tm, err := at("totalMinutes")
		if err != nil {
			return err
		}
		start, err := at("startAt")
		if err != nil {
			return err
		}
		f, _ := tm.(float64)
		st, _ := start.(string)
		if int(f) != n || !strings.Contains(st, "T"+hhmm) {
			return fmt.Errorf("totalMinutes %v startAt %v, want %d minutes from %s", tm, start, n, hhmm)
		}
		return nil
	})
	sc.Step(`^timeline item (\d+) is the (active|passive|reheat|serve) item of the Course "([^"]*)" from (\d+) to (\d+) seconds$`, func(i int, kind, course string, from, to int) error {
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		v, err := at(fmt.Sprintf("items.%d", i-1))
		if err != nil {
			return err
		}
		it, _ := v.(map[string]any)
		num := func(k string) int { f, _ := it[k].(float64); return int(f) }
		if it["kind"] != kind || int64(num("courseId")) != cid || num("startSeconds") != from || num("endSeconds") != to || num("number") != i {
			return fmt.Errorf("item %d = %v, want %s of %s from %d to %d", i, it, kind, course, from, to)
		}
		return nil
	})
	sc.Step(`^the timeline lists (\d+) items$`, func(n int) error {
		v, err := at("items")
		if err != nil {
			return err
		}
		if len(v.([]any)) != n {
			return fmt.Errorf("%d items, want %d", len(v.([]any)), n)
		}
		return nil
	})
	sc.Step(`^the board shows tonight's slot with (\d+) Courses taking (\d+) minutes$`, func(courses, minutes int) error {
		w.Last = user().Get("/api/board")
		v, err := at("slots.0.courses")
		if err != nil {
			return err
		}
		cm, _ := at("slots.0.cookMinutes")
		f, _ := cm.(float64)
		if len(v.([]any)) != courses || int(f) != minutes {
			return fmt.Errorf("board slot = %d Courses, cookMinutes %v; want %d and %d", len(v.([]any)), cm, courses, minutes)
		}
		return nil
	})
}
