package bdd

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("crs-c1", crsC1Steps) }

// Team C1 (docs/dev/design/crs-c1.md): Courses, Recipe Courses, Meal Slot Courses and Course Attendance.
// Fixtures that are not under test (Recipes with Courses, Planned Meals, Slot Rules) go straight to the database.

var (
	crsQuoted = regexp.MustCompile(`"([^"]*)"`)
	crsItem   = regexp.MustCompile(`"([^"]+)"( optional)?(?: without (nobody|(?:"[^"]+"(?: and )?)+))?`)
)

const (
	crsList  = `((?:"[^"]*"(?:, | and )?)+)`
	crsDate  = `(\d{4}-\d{2}-\d{2})`
	crsItems = `("[^"]+"(?: optional)?(?: without (?:nobody|(?:"[^"]+"(?: and )?)+))?(?:, "[^"]+"(?: optional)?(?: without (?:nobody|(?:"[^"]+"(?: and )?)+))?)*)`
)

func crsC1Steps(sc *godog.ScenarioContext, w *World) {
	admin := func() *testkit.Client {
		env := w.Ensure()
		if c, ok := w.Clients["household-admin"]; ok {
			return c
		}
		c := env.LoginAdmin(w.TB)
		w.Clients["household-admin"] = c
		return c
	}
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
	courseID := func(name string) (int64, error) { return one(`SELECT id FROM courses WHERE name = ?`, name) }
	recipeID := func(name string) (int64, error) { return one(`SELECT id FROM recipes WHERE name = ?`, name) }
	memberID := func(name string) (int64, error) {
		id, ok := w.Vars["member:"+name].(int64)
		if !ok {
			return 0, fmt.Errorf("no Member %q was set up", name)
		}
		return id, nil
	}
	memberName := func(id int64) string {
		for k, v := range w.Vars {
			if n, ok := v.(int64); ok && n == id && strings.HasPrefix(k, "member:") {
				return strings.TrimPrefix(k, "member:")
			}
		}
		return fmt.Sprint(id)
	}
	names := func(s string) []string {
		var out []string
		for _, m := range crsQuoted.FindAllStringSubmatch(s, -1) {
			out = append(out, m[1])
		}
		return out
	}
	courseIDs := func(list string) ([]int64, error) {
		var out []int64
		for _, n := range names(list) {
			id, err := courseID(n)
			if err != nil {
				return nil, err
			}
			out = append(out, id)
		}
		return out, nil
	}
	memberIDs := func(spec string) ([]int64, error) {
		out := []int64{}
		for _, n := range names(spec) {
			id, err := memberID(n)
			if err != nil {
				return nil, err
			}
			out = append(out, id)
		}
		return out, nil
	}
	// courseRequest turns `"Main", "Side" optional without "Sam"` into the request's courses list. A Course without
	// "without" omits optOutMemberIds (the stored opt-outs stay); "without nobody" sends [].
	courseRequest := func(spec string) ([]map[string]any, error) {
		out := []map[string]any{}
		for _, m := range crsItem.FindAllStringSubmatch(spec, -1) {
			id, err := courseID(m[1])
			if err != nil {
				return nil, err
			}
			c := map[string]any{"id": id}
			if m[2] != "" {
				c["optional"] = true
			}
			if m[3] != "" {
				ids, err := memberIDs(m[3])
				if err != nil {
					return nil, err
				}
				c["optOutMemberIds"] = ids
			}
			out = append(out, c)
		}
		return out, nil
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
	type slotView struct {
		ID         int64  `json:"id"`
		Weekday    int    `json:"weekday"`
		Name       string `json:"name"`
		Time       string `json:"time"`
		Attendance []struct {
			MemberID              int64    `json:"memberId"`
			PortionFactorOverride *float64 `json:"portionFactorOverride"`
		} `json:"attendance"`
		Courses []struct {
			ID              int64   `json:"id"`
			Name            string  `json:"name"`
			Main            bool    `json:"main"`
			Optional        bool    `json:"optional"`
			OptOutMemberIDs []int64 `json:"optOutMemberIds"`
		} `json:"courses"`
	}
	slot := func(name, day string) (slotView, error) {
		var list []slotView
		r := admin().Get("/api/meal-slots")
		if err := r.JSON(&list); err != nil {
			return slotView{}, fmt.Errorf("meal slots: %v: %s", err, r.Body)
		}
		for _, s := range list {
			if s.Name == name && s.Weekday == weekdays[day] {
				return s, nil
			}
		}
		return slotView{}, fmt.Errorf("no Meal Slot %q on %s", name, day)
	}
	saveSlot := func(name, day, spec string) error {
		s, err := slot(name, day)
		if err != nil {
			return err
		}
		courses, err := courseRequest(spec)
		if err != nil {
			return err
		}
		att := []map[string]any{}
		for _, a := range s.Attendance {
			att = append(att, map[string]any{"memberId": a.MemberID, "portionFactorOverride": a.PortionFactorOverride})
		}
		w.Last = admin().Patch(fmt.Sprintf("/api/meal-slots/%d", s.ID), map[string]any{
			"weekday": s.Weekday, "name": s.Name, "time": s.Time, "attendance": att, "courses": courses})
		return nil
	}
	batch := func(name, list, spec string, dry bool) error {
		courses, err := courseRequest(spec)
		if err != nil {
			return err
		}
		body := map[string]any{"match": name, "weekdays": days(strings.ReplaceAll(list, " and ", ",")), "set": map[string]any{"courses": courses}}
		if dry {
			body["dryRun"] = true
		}
		w.Last = admin().Patch("/api/meal-slots/batch", body)
		return nil
	}
	doc := func() (any, error) {
		var d any
		if err := w.Last.JSON(&d); err != nil {
			return nil, fmt.Errorf("response is not JSON: %v; body: %s", err, w.Last.Body)
		}
		return d, nil
	}
	// at walks a dotted path with numeric array indexes.
	at := func(d any, path string) (any, error) {
		cur := d
		for _, key := range strings.Split(path, ".") {
			switch v := cur.(type) {
			case map[string]any:
				next, ok := v[key]
				if !ok {
					return nil, fmt.Errorf("path %q: key %q missing; body: %s", path, key, w.Last.Body)
				}
				cur = next
			case []any:
				i, err := strconv.Atoi(key)
				if err != nil || i < 0 || i >= len(v) {
					return nil, fmt.Errorf("path %q: no item %q in a list of %d; body: %s", path, key, len(v), w.Last.Body)
				}
				cur = v[i]
			default:
				return nil, fmt.Errorf("path %q: %v is not an object or list; body: %s", path, cur, w.Last.Body)
			}
		}
		return cur, nil
	}
	list := func(path string) ([]any, error) {
		d, err := doc()
		if err != nil {
			return nil, err
		}
		v, err := at(d, path)
		if err != nil {
			return nil, err
		}
		l, ok := v.([]any)
		if !ok {
			return nil, fmt.Errorf("%q is not a list: %s", path, w.Last.Body)
		}
		return l, nil
	}
	field := func(item any, key string) any {
		m, _ := item.(map[string]any)
		return m[key]
	}
	today := "2026-11-09"

	// ---- Courses -------------------------------------------------------------------------------------------

	sc.Step(`^I list the Courses$`, func() { w.Ensure(); w.Last = w.Client.Get("/api/courses") })
	sc.Step(`^I list the Courses including archived ones$`, func() { w.Ensure(); w.Last = w.Client.Get("/api/courses?archived=1") })
	sc.Step(`^I add the Course "([^"]*)"$`, func(name string) { w.Ensure(); w.Last = w.Client.Post("/api/courses", map[string]any{"name": name}) })
	sc.Step(`^I rename the Course "([^"]*)" to "([^"]*)"$`, func(name, to string) error {
		id, err := courseID(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Patch(fmt.Sprintf("/api/courses/%d", id), map[string]any{"name": to})
		return nil
	})
	sc.Step(`^I make the Course "([^"]*)" the main Course$`, func(name string) error {
		id, err := courseID(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Patch(fmt.Sprintf("/api/courses/%d", id), map[string]any{"main": true})
		return nil
	})
	sc.Step(`^I reorder the Courses to `+crsList+`$`, func(spec string) error {
		ids, err := courseIDs(spec)
		if err != nil {
			return err
		}
		w.Last = w.Client.Put("/api/courses/order", map[string]any{"ids": ids})
		return nil
	})
	sc.Step(`^I ask what removing the Course "([^"]*)" changes$`, func(name string) error {
		id, err := courseID(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Get(fmt.Sprintf("/api/courses/%d/impact", id))
		return nil
	})
	sc.Step(`^I delete the Course "([^"]*)"(?: replacing it with "([^"]*)")?$`, func(name, with string) error {
		id, err := courseID(name)
		if err != nil {
			return err
		}
		q := ""
		if with != "" {
			rid, err := courseID(with)
			if err != nil {
				return err
			}
			q = fmt.Sprintf("?replacement=%d", rid)
		}
		w.Last = w.Client.Delete(fmt.Sprintf("/api/courses/%d%s", id, q))
		return nil
	})
	sc.Step(`^I archive the Course "([^"]*)"(?: replacing it with "([^"]*)")?$`, func(name, with string) error {
		id, err := courseID(name)
		if err != nil {
			return err
		}
		body := map[string]any{}
		if with != "" {
			rid, err := courseID(with)
			if err != nil {
				return err
			}
			body["replacementId"] = rid
		}
		w.Last = w.Client.Post(fmt.Sprintf("/api/courses/%d/archive", id), body)
		return nil
	})
	sc.Step(`^I unarchive the Course "([^"]*)"$`, func(name string) error {
		id, err := courseID(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Post(fmt.Sprintf("/api/courses/%d/unarchive", id), nil)
		return nil
	})
	sc.Step(`^the Courses are `+crsList+`$`, func(spec string) error {
		l, err := list("courses")
		if err != nil {
			return err
		}
		var got []string
		for _, c := range l {
			got = append(got, fmt.Sprint(field(c, "name")))
		}
		if want := names(spec); strings.Join(got, ",") != strings.Join(want, ",") {
			return fmt.Errorf("Courses = %v, want %v", got, want)
		}
		return nil
	})
	sc.Step(`^the Course "([^"]*)" is the main Course$`, func(name string) error {
		l, err := list("courses")
		if err != nil {
			return err
		}
		mains := 0
		ok := false
		for _, c := range l {
			if field(c, "main") == true {
				mains++
				ok = field(c, "name") == name
			}
		}
		if mains != 1 || !ok {
			return fmt.Errorf("want %s as the only main Course: %s", name, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Course answer is "([^"]*)", (main|not main) and (archived|not archived)$`, func(name, main, archived string) error {
		d, err := doc()
		if err != nil {
			return err
		}
		m, _ := d.(map[string]any)
		if m["name"] != name || (m["main"] == true) != (main == "main") || (m["archived"] == true) != (archived == "archived") {
			return fmt.Errorf("answer = %s, want %s, %s, %s", w.Last.Body, name, main, archived)
		}
		return nil
	})
	sc.Step(`^the answer JSON at "([^"]*)" is "([^"]*)"$`, func(path, want string) error {
		d, err := doc()
		if err != nil {
			return err
		}
		v, err := at(d, path)
		if err != nil {
			return err
		}
		if got := fmt.Sprint(v); got != want {
			return fmt.Errorf("%s = %q, want %q; body: %s", path, got, want, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the answer JSON at "([^"]*)" is the id of the Course "([^"]*)"$`, func(path, name string) error {
		id, err := courseID(name)
		if err != nil {
			return err
		}
		d, err := doc()
		if err != nil {
			return err
		}
		v, err := at(d, path)
		if err != nil {
			return err
		}
		if got := fmt.Sprint(v); got != strconv.FormatInt(id, 10) {
			return fmt.Errorf("%s = %s, want %d (%s); body: %s", path, got, id, name, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the error names the field "([^"]*)" and the reason "([^"]*)"$`, func(f, reason string) error {
		d, err := doc()
		if err != nil {
			return err
		}
		e, _ := d.(map[string]any)["error"].(map[string]any)
		if e["field"] != f || e["reason"] != reason {
			return fmt.Errorf("error = %v, want field %q reason %q", e, f, reason)
		}
		return nil
	})
	sc.Step(`^the error names the field "([^"]*)"$`, func(f string) error {
		d, err := doc()
		if err != nil {
			return err
		}
		if e, _ := d.(map[string]any)["error"].(map[string]any); e["field"] != f {
			return fmt.Errorf("error = %v, want field %q", e, f)
		}
		return nil
	})
	sc.Step(`^the impact counts (\d+) Recipes? \((\d+) only this\) and (\d+) Meal Slots? \((\d+) only this\)$`, func(r, ro, s, so int) error {
		d, err := doc()
		if err != nil {
			return err
		}
		m, _ := d.(map[string]any)
		got := []float64{m["recipes"].(float64), m["recipesOnlyThis"].(float64), m["mealSlots"].(float64), m["mealSlotsOnlyThis"].(float64)}
		if got[0] != float64(r) || got[1] != float64(ro) || got[2] != float64(s) || got[3] != float64(so) {
			return fmt.Errorf("impact counts = %v, want %d (%d), %d (%d); body: %s", got, r, ro, s, so, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the impact lists (\d+) Planned Meals? and (\d+) Slot Rules?$`, func(p, r int) error {
		pm, err := list("plannedMeals")
		if err != nil {
			return err
		}
		sr, err := list("slotRules")
		if err != nil {
			return err
		}
		if len(pm) != p || len(sr) != r {
			return fmt.Errorf("impact lists %d Planned Meals and %d Slot Rules, want %d and %d: %s", len(pm), len(sr), p, r, w.Last.Body)
		}
		return nil
	})

	// ---- Fixtures written straight to the database ---------------------------------------------------------

	sc.Step(`^the Household has the Recipe "([^"]*)" for the Courses `+crsList+`$`, func(name, spec string) error {
		ids, err := courseIDs(spec)
		if err != nil {
			return err
		}
		rid, err := exec(`INSERT INTO recipes (name, yield, created_at, updated_at) VALUES (?, 2, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`, name)
		if err != nil {
			return err
		}
		for _, id := range ids {
			if _, err := exec(`INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, rid, id); err != nil {
				return err
			}
		}
		return nil
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) has an? (Pinned|unpinned|cooked) Planned Meal of "([^"]*)" in "([^"]*)" on `+crsDate+`$`,
		func(slotName, day, kind, recipe, course, date string) error {
			s, err := slot(slotName, day)
			if err != nil {
				return err
			}
			cid, err := courseID(course)
			if err != nil {
				return err
			}
			rid, err := recipeID(recipe)
			if err != nil {
				return err
			}
			state, pinned := "planned", 0
			switch kind {
			case "Pinned":
				pinned = 1
			case "cooked":
				state = "cooked"
			}
			_, err = exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, created_at, updated_at)
				VALUES (?, ?, ?, ?, 1, 2, ?, ?, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`, date, s.ID, cid, rid, state, pinned)
			return err
		})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) has a Slot Rule for "([^"]*)" in "([^"]*)"$`, func(slotName, day, recipe, course string) error {
		s, err := slot(slotName, day)
		if err != nil {
			return err
		}
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		rid, err := recipeID(recipe)
		if err != nil {
			return err
		}
		_, err = exec(`INSERT INTO slot_rules (meal_slot_id, course_id, recipe_id) VALUES (?, ?, ?)`, s.ID, cid, rid)
		return err
	})
	sc.Step(`^the Course "([^"]*)" has been planned$`, func(course string) error {
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		sid, err := exec(`INSERT INTO meal_slots (weekday, name, time) VALUES (7, 'History', '10:00')`)
		if err != nil {
			return err
		}
		rid, err := exec(`INSERT INTO recipes (name, yield, created_at, updated_at) VALUES ('History dish', 2, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`)
		if err != nil {
			return err
		}
		_, err = exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, created_at, updated_at)
			VALUES ('2026-11-01', ?, ?, ?, 1, 2, 'cooked', 0, '2026-11-01T12:00:00Z', '2026-11-01T12:00:00Z')`, sid, cid, rid)
		return err
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) has (\d+) unresolved Planned Meals? in "([^"]*)" from today on$`, func(slotName, day string, want int, course string) error {
		s, err := slot(slotName, day)
		if err != nil {
			return err
		}
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		n, err := one(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND course_id = ? AND state = 'planned' AND date >= ?`, s.ID, cid, today)
		if err != nil {
			return err
		}
		if int(n) != want {
			return fmt.Errorf("%s on %s has %d unresolved Planned Meals in %s from today on, want %d", slotName, day, n, course, want)
		}
		return nil
	})
	remembered := map[string]int64{}
	countUnresolved := func(slotName, day, course string) (int64, error) {
		s, err := slot(slotName, day)
		if err != nil {
			return 0, err
		}
		cid, err := courseID(course)
		if err != nil {
			return 0, err
		}
		return one(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND course_id = ? AND state = 'planned' AND date >= ?`, s.ID, cid, today)
	}
	sc.Step(`^I note how many unresolved Planned Meals the Meal Slot "([^"]*)" on (\w+) has in "([^"]*)" from today on$`, func(slotName, day, course string) error {
		n, err := countUnresolved(slotName, day, course)
		remembered[slotName+"|"+day+"|"+course] = n
		return err
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) still has as many unresolved Planned Meals in "([^"]*)" from today on$`, func(slotName, day, course string) error {
		want, ok := remembered[slotName+"|"+day+"|"+course]
		if !ok {
			return fmt.Errorf("no count was noted for %s on %s in %s", slotName, day, course)
		}
		n, err := countUnresolved(slotName, day, course)
		if err != nil {
			return err
		}
		if n != want {
			return fmt.Errorf("%s on %s has %d unresolved Planned Meals in %s from today on, was %d: the preview wrote", slotName, day, n, course, want)
		}
		return nil
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) has (\d+) Slot Rules? in "([^"]*)"$`, func(slotName, day string, want int, course string) error {
		s, err := slot(slotName, day)
		if err != nil {
			return err
		}
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		n, err := one(`SELECT count(*) FROM slot_rules WHERE meal_slot_id = ? AND course_id = ?`, s.ID, cid)
		if err != nil {
			return err
		}
		if int(n) != want {
			return fmt.Errorf("%s on %s has %d Slot Rules in %s, want %d", slotName, day, n, course, want)
		}
		return nil
	})
	sc.Step(`^the Recipe "([^"]*)" is marked with the Courses `+crsList+`$`, func(recipe, spec string) error {
		rid, err := recipeID(recipe)
		if err != nil {
			return err
		}
		rows, err := w.Ensure().DB.Query(`SELECT c.name FROM recipe_courses rc JOIN courses c ON c.id = rc.course_id WHERE rc.recipe_id = ? ORDER BY c.position`, rid)
		if err != nil {
			return err
		}
		defer rows.Close()
		var got []string
		for rows.Next() {
			var n string
			if err := rows.Scan(&n); err != nil {
				return err
			}
			got = append(got, n)
		}
		if want := names(spec); strings.Join(got, ",") != strings.Join(want, ",") {
			return fmt.Errorf("%s is marked with %v, want %v", recipe, got, want)
		}
		return nil
	})

	// ---- Meal Slots ----------------------------------------------------------------------------------------

	sc.Step(`^the Admin saves the Meal Slot "([^"]*)" on (\w+) with the Courses `+crsItems+`$`, func(name, day, spec string) error {
		return saveSlot(name, day, spec)
	})
	sc.Step(`^the Admin creates the Meal Slot "([^"]*)" on (\w+) with the Courses `+crsItems+`$`, func(name, day, spec string) error {
		courses, err := courseRequest(spec)
		if err != nil {
			return err
		}
		w.Last = admin().Post("/api/meal-slots", map[string]any{"weekday": weekdays[day], "name": name, "time": "19:00", "attendance": []any{}, "courses": courses})
		return nil
	})
	sc.Step(`^the Admin saves the Meal Slot "([^"]*)" on (\w+) with an empty list of Courses$`, func(name, day string) error {
		s, err := slot(name, day)
		if err != nil {
			return err
		}
		w.Last = admin().Patch(fmt.Sprintf("/api/meal-slots/%d", s.ID), map[string]any{
			"weekday": s.Weekday, "name": s.Name, "time": s.Time, "attendance": []any{}, "courses": []any{}})
		return nil
	})
	sc.Step(`^the Admin saves "([^"]*)" on ([A-Za-z, ]+?) with the Courses `+crsItems+`$`, func(name, list, spec string) error {
		return batch(name, list, spec, false)
	})
	sc.Step(`^the Admin previews "([^"]*)" on ([A-Za-z, ]+?) with the Courses `+crsItems+`$`, func(name, list, spec string) error {
		return batch(name, list, spec, true)
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) serves `+crsItems+`$`, func(name, day, spec string) error {
		s, err := slot(name, day)
		if err != nil {
			return err
		}
		items := crsItem.FindAllStringSubmatch(spec, -1)
		if len(items) != len(s.Courses) {
			return fmt.Errorf("%s on %s serves %d Courses, want %d (%s)", name, day, len(s.Courses), len(items), spec)
		}
		for i, m := range items {
			got := s.Courses[i]
			var out []string
			for _, id := range got.OptOutMemberIDs {
				out = append(out, memberName(id))
			}
			sort.Strings(out)
			var want []string
			if m[3] != "" && m[3] != "nobody" {
				want = names(m[3])
				sort.Strings(want)
			}
			if got.Name != m[1] || got.Optional != (m[2] != "") || strings.Join(out, ",") != strings.Join(want, ",") {
				return fmt.Errorf("Course %d of %s on %s = %s (optional %v, without %v), want %s (optional %v, without %v)",
					i, name, day, got.Name, got.Optional, out, m[1], m[2] != "", want)
			}
		}
		return nil
	})
	sc.Step(`^the Meal Slot "([^"]*)" on (\w+) shows the main Course as "([^"]*)"$`, func(name, day, course string) error {
		s, err := slot(name, day)
		if err != nil {
			return err
		}
		for _, c := range s.Courses {
			if c.Main && c.Name == course {
				return nil
			}
		}
		return fmt.Errorf("%s on %s: no main Course %q in %+v", name, day, course, s.Courses)
	})
	sc.Step(`^the answer lists under removes the (Pinned |)Planned Meal of "([^"]*)" in "([^"]*)" on `+crsDate+`$`, func(pinned, recipe, course, date string) error {
		l, err := list("removes.plannedMeals")
		if err != nil {
			return err
		}
		for _, m := range l {
			if field(m, "recipeName") == recipe && field(m, "courseName") == course && field(m, "date") == date && (field(m, "pinned") == true) == (pinned != "") {
				return nil
			}
		}
		return fmt.Errorf("removes.plannedMeals has no %sPlanned Meal of %s in %s on %s: %s", pinned, recipe, course, date, w.Last.Body)
	})
	sc.Step(`^the answer lists under removes the Slot Rule for "([^"]*)" in "([^"]*)"$`, func(recipe, course string) error {
		l, err := list("removes.slotRules")
		if err != nil {
			return err
		}
		for _, m := range l {
			if field(m, "recipeName") == recipe && field(m, "courseName") == course {
				return nil
			}
		}
		return fmt.Errorf("removes.slotRules has no rule for %s in %s: %s", recipe, course, w.Last.Body)
	})
	sc.Step(`^the answer lists the Pinned Planned Meals first$`, func() error {
		l, err := list("removes.plannedMeals")
		if err != nil {
			return err
		}
		seenUnpinned := false
		for _, m := range l {
			if field(m, "pinned") != true {
				seenUnpinned = true
			} else if seenUnpinned {
				return fmt.Errorf("a Pinned meal comes after an unpinned one: %s", w.Last.Body)
			}
		}
		return nil
	})
	sc.Step(`^the answer removes nothing$`, func() error {
		pm, err := list("removes.plannedMeals")
		if err != nil {
			return err
		}
		sr, err := list("removes.slotRules")
		if err != nil {
			return err
		}
		if len(pm) != 0 || len(sr) != 0 {
			return fmt.Errorf("removes = %s, want two empty lists", w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the answer has no field "([^"]*)"$`, func(key string) error {
		d, err := doc()
		if err != nil {
			return err
		}
		if _, ok := d.(map[string]any)[key]; ok {
			return fmt.Errorf("the answer has %q: %s", key, w.Last.Body)
		}
		return nil
	})

	// ---- Date Attendance -----------------------------------------------------------------------------------

	attendanceURL := func(name, day, date string) (string, error) {
		s, err := slot(name, day)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("/api/meal-slots/%d/attendance?date=%s", s.ID, date), nil
	}
	sc.Step(`^on `+crsDate+` the Admin sets the opt-outs of the Course "([^"]*)" at the Meal Slot "([^"]*)" on (\w+) to (nobody|(?:"[^"]+"(?: and )?)+)$`,
		func(date, course, name, day, who string) error {
			u, err := attendanceURL(name, day, date)
			if err != nil {
				return err
			}
			cid, err := courseID(course)
			if err != nil {
				return err
			}
			ids, err := memberIDs(who)
			if err != nil {
				return err
			}
			w.Last = admin().Put(u, map[string]any{"courses": []any{map[string]any{"courseId": cid, "optOutMemberIds": ids}}})
			return nil
		})
	sc.Step(`^on `+crsDate+` the Admin resets the Course "([^"]*)" at the Meal Slot "([^"]*)" on (\w+) to usual$`, func(date, course, name, day string) error {
		u, err := attendanceURL(name, day, date)
		if err != nil {
			return err
		}
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		w.Last = admin().Put(u, map[string]any{"courses": []any{map[string]any{"courseId": cid, "optOutMemberIds": nil}}})
		return nil
	})
	sc.Step(`^on `+crsDate+` the Admin sets the opt-outs of the Course "([^"]*)" at the Meal Slot "([^"]*)" on (\w+) to "([^"]*)" while "([^"]*)" is away$`,
		func(date, course, name, day, out, away string) error {
			u, err := attendanceURL(name, day, date)
			if err != nil {
				return err
			}
			s, err := slot(name, day)
			if err != nil {
				return err
			}
			cid, err := courseID(course)
			if err != nil {
				return err
			}
			awayID, err := memberID(away)
			if err != nil {
				return err
			}
			outID, err := memberID(out)
			if err != nil {
				return err
			}
			var att []map[string]any
			for _, a := range s.Attendance {
				if a.MemberID != awayID {
					att = append(att, map[string]any{"memberId": a.MemberID, "portionFactorOverride": a.PortionFactorOverride})
				}
			}
			w.Last = admin().Put(u, map[string]any{"attendance": att,
				"courses": []any{map[string]any{"courseId": cid, "optOutMemberIds": []int64{outID}}}})
			return nil
		})
	sc.Step(`^on `+crsDate+` the Admin sets the opt-outs of a Course that is not on the Meal Slot "([^"]*)" on (\w+)$`, func(date, name, day string) error {
		u, err := attendanceURL(name, day, date)
		if err != nil {
			return err
		}
		w.Last = admin().Put(u, map[string]any{"courses": []any{map[string]any{"courseId": 99999, "optOutMemberIds": []int64{}}}})
		return nil
	})
	sc.Step(`^on `+crsDate+` the Admin sends no Attendance and no Courses for the Meal Slot "([^"]*)" on (\w+)$`, func(date, name, day string) error {
		u, err := attendanceURL(name, day, date)
		if err != nil {
			return err
		}
		w.Last = admin().Put(u, map[string]any{})
		return nil
	})
	sc.Step(`^on `+crsDate+` I read the Attendance of the Meal Slot "([^"]*)" on (\w+)$`, func(date, name, day string) error {
		u, err := attendanceURL(name, day, date)
		if err != nil {
			return err
		}
		w.Last = admin().Get(u)
		return nil
	})
	sc.Step(`^the Course "([^"]*)" is eaten by (nobody|(?:"[^"]+"(?:, | and )?)+) for ([0-9.]+) portions$`, func(course, who string, portions float64) error {
		l, err := list("courses")
		if err != nil {
			return err
		}
		for _, c := range l {
			if field(c, "name") != course {
				continue
			}
			var got []string
			att, _ := field(c, "attendance").([]any)
			for _, a := range att {
				got = append(got, memberName(int64(field(a, "memberId").(float64))))
			}
			sort.Strings(got)
			var want []string
			if who != "nobody" {
				want = names(who)
				sort.Strings(want)
			}
			if strings.Join(got, ",") != strings.Join(want, ",") || field(c, "portionsNeeded") != portions {
				return fmt.Errorf("%s is eaten by %v for %v portions, want %v for %v", course, got, field(c, "portionsNeeded"), want, portions)
			}
			return nil
		}
		return fmt.Errorf("no Course %q in %s", course, w.Last.Body)
	})
	sc.Step(`^the Course "([^"]*)" (has|has no) own opt-outs for that date$`, func(course, has string) error {
		l, err := list("courses")
		if err != nil {
			return err
		}
		for _, c := range l {
			if field(c, "name") == course {
				if (field(c, "isOverride") == true) != (has == "has") {
					return fmt.Errorf("%s isOverride = %v, want %v", course, field(c, "isOverride"), has == "has")
				}
				return nil
			}
		}
		return fmt.Errorf("no Course %q in %s", course, w.Last.Body)
	})

	// ---- Recipes -------------------------------------------------------------------------------------------

	recipeBody := func(name string, extra map[string]any) (map[string]any, error) {
		ing, err := one(`SELECT id FROM ingredients WHERE name = 'rice'`)
		if err != nil {
			if ing, err = exec(`INSERT INTO ingredients (name, name_key, base_unit, shelf_life_days, created_at, updated_at)
				VALUES ('rice', 'rice', 'g', NULL, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`); err != nil {
				return nil, err
			}
		}
		m := map[string]any{"name": name, "yield": 2, "tags": []string{},
			"lines": []map[string]any{{"ingredientId": ing, "quantity": 200, "unit": "g"}}}
		for k, v := range extra {
			m[k] = v
		}
		return m, nil
	}
	wholeMeal := func(flag string) map[string]any {
		switch flag {
		case " as a Whole meal":
			return map[string]any{"wholeMeal": true}
		case " not as a Whole meal":
			return map[string]any{"wholeMeal": false}
		}
		return nil
	}
	sc.Step(`^I create the Recipe "([^"]*)" for the Courses `+crsList+`( as a Whole meal| not as a Whole meal)?$`, func(name, spec, flag string) error {
		ids, err := courseIDs(spec)
		if err != nil {
			return err
		}
		extra := wholeMeal(flag)
		if extra == nil {
			extra = map[string]any{}
		}
		extra["courseIds"] = ids
		b, err := recipeBody(name, extra)
		if err != nil {
			return err
		}
		w.Ensure()
		w.Last = w.Client.Post("/api/recipes", b)
		return nil
	})
	sc.Step(`^I create the Recipe "([^"]*)" without Courses$`, func(name string) error {
		b, err := recipeBody(name, nil)
		if err != nil {
			return err
		}
		w.Ensure()
		w.Last = w.Client.Post("/api/recipes", b)
		return nil
	})
	sc.Step(`^I create the Recipe "([^"]*)" with an empty list of Courses$`, func(name string) error {
		b, err := recipeBody(name, map[string]any{"courseIds": []int64{}})
		if err != nil {
			return err
		}
		w.Ensure()
		w.Last = w.Client.Post("/api/recipes", b)
		return nil
	})
	sc.Step(`^I create the Ready Meal "([^"]*)"(?: for the Courses `+crsList+`)?$`, func(name, spec string) error {
		m := map[string]any{"name": name, "yield": 2, "readyMeal": true, "lines": []any{}}
		if spec != "" {
			ids, err := courseIDs(spec)
			if err != nil {
				return err
			}
			m["courseIds"] = ids
		}
		w.Ensure()
		w.Last = w.Client.Post("/api/recipes", m)
		return nil
	})
	sc.Step(`^I save the Recipe "([^"]*)" for the Courses `+crsList+`( as a Whole meal| not as a Whole meal)?$`, func(name, spec, flag string) error {
		ids, err := courseIDs(spec)
		if err != nil {
			return err
		}
		rid, err := recipeID(name)
		if err != nil {
			return err
		}
		extra := wholeMeal(flag)
		if extra == nil {
			extra = map[string]any{}
		}
		extra["courseIds"] = ids
		b, err := recipeBody(name, extra)
		if err != nil {
			return err
		}
		w.Last = w.Client.Put(fmt.Sprintf("/api/recipes/%d", rid), b)
		return nil
	})
	sc.Step(`^I save the Recipe "([^"]*)" without touching its Courses$`, func(name string) error {
		rid, err := recipeID(name)
		if err != nil {
			return err
		}
		b, err := recipeBody(name, nil)
		if err != nil {
			return err
		}
		w.Last = w.Client.Put(fmt.Sprintf("/api/recipes/%d", rid), b)
		return nil
	})
	sc.Step(`^I list the Recipes (marked|not marked) with the Course "([^"]*)"$`, func(how, course string) error {
		cid, err := courseID(course)
		if err != nil {
			return err
		}
		key := "course"
		if how == "not marked" {
			key = "notCourse"
		}
		w.Ensure()
		w.Last = w.Client.Get(fmt.Sprintf("/api/recipes?%s=%d", key, cid))
		return nil
	})
	sc.Step(`^I list the Recipes with the filter "([^"]*)"$`, func(q string) { w.Ensure(); w.Last = w.Client.Get("/api/recipes?" + q) })
	sc.Step(`^the listed Recipes are `+crsList+`$`, func(spec string) error {
		d, err := doc()
		if err != nil {
			return err
		}
		l, _ := d.([]any)
		var got []string
		for _, r := range l {
			got = append(got, fmt.Sprint(field(r, "name")))
		}
		sort.Strings(got)
		want := names(spec)
		sort.Strings(want)
		if strings.Join(got, ",") != strings.Join(want, ",") {
			return fmt.Errorf("listed Recipes = %v, want %v", got, want)
		}
		return nil
	})
	sc.Step(`^the Recipe answer shows the Courses `+crsList+`$`, func(spec string) error {
		l, err := list("courses")
		if err != nil {
			return err
		}
		var got []string
		for _, c := range l {
			got = append(got, fmt.Sprint(field(c, "name")))
		}
		if want := names(spec); strings.Join(got, ",") != strings.Join(want, ",") {
			return fmt.Errorf("Recipe Courses = %v, want %v", got, want)
		}
		return nil
	})
	sc.Step(`^the Recipe answer is (not )?a Whole meal$`, func(not string) error {
		d, err := doc()
		if err != nil {
			return err
		}
		got, ok := d.(map[string]any)["wholeMeal"].(bool)
		if !ok || got != (not == "") {
			return fmt.Errorf("wholeMeal = %v, want %v; body: %s", d.(map[string]any)["wholeMeal"], not == "", w.Last.Body)
		}
		return nil
	})
}
