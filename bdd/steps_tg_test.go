package bdd

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("tg", tgSteps) }

// Team TG-API (docs/dev/design/tg-api.md): the Tags routes as a User who is not an Admin. Fixtures that are
// not under test (Recipes, Meal Slots, rules) go straight to the database; the planner scenarios reuse the
// planning steps (steps_planning_test.go). A Tag is named in a step by its name; its key is the name
// trimmed, collapsed and lower-cased.

var tgDate = `(\d{4}-\d{2}-\d{2})`

func tgKey(name string) string { return strings.ToLower(strings.Join(strings.Fields(name), " ")) }

func tgSteps(sc *godog.ScenarioContext, w *World) {
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
	tagID := func(name string) (int64, error) { return one(`SELECT id FROM tags WHERE key = ?`, tgKey(name)) }
	// ensureTag finds or creates (in a colour, or the next one) the Tag row and returns its id.
	ensureTag := func(name, colour string) (int64, error) {
		if id, err := tagID(name); err == nil {
			return id, nil
		}
		if colour == "" {
			colour = "tomato"
		}
		return exec(`INSERT INTO tags (key, name, colour) VALUES (?, ?, ?)`, tgKey(name), strings.Join(strings.Fields(name), " "), colour)
	}
	slotID := func(name string, weekday int) (int64, error) {
		if id, err := one(`SELECT id FROM meal_slots WHERE name = ? AND weekday = ?`, name, weekday); err == nil {
			return id, nil
		}
		id, err := exec(`INSERT INTO meal_slots (weekday, name, time) VALUES (?, ?, '19:00')`, weekday, name)
		if err != nil {
			return 0, err
		}
		for i, c := range []string{"Main", "Side"} {
			cid, err := one(`SELECT id FROM courses WHERE name = ?`, c)
			if err != nil {
				return 0, err
			}
			if _, err := exec(`INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional) VALUES (?, ?, ?, 0)`, id, cid, i); err != nil {
				return 0, err
			}
		}
		return id, nil
	}
	get := func(path string) { w.Ensure(); w.Last = w.Client.Get(path) }
	listing := func() ([]map[string]any, error) {
		r := w.Client.Get("/api/tags")
		if r.Status != 200 {
			return nil, fmt.Errorf("GET /api/tags = %d %s", r.Status, r.Body)
		}
		var out []map[string]any
		if err := r.JSON(&out); err != nil {
			return nil, err
		}
		return out, nil
	}
	listed := func(name string) (map[string]any, error) {
		l, err := listing()
		if err != nil {
			return nil, err
		}
		for _, t := range l {
			if t["key"] == tgKey(name) {
				return t, nil
			}
		}
		return nil, fmt.Errorf("the Tag %q is not in the list", name)
	}
	names := func(s string) []string {
		var out []string
		for _, m := range regexp.MustCompile(`"([^"]*)"`).FindAllStringSubmatch(s, -1) {
			out = append(out, m[1])
		}
		return out
	}

	// --- Given: fixtures ---

	sc.Step(`^the Tag "([^"]*)" exists(?: in the colour "([^"]*)")?$`, func(name, colour string) error {
		_, err := ensureTag(name, colour)
		return err
	})
	sc.Step(`^the Recipe "([^"]*)" carries the Tags (.+)$`, func(recipe, list string) error {
		id, err := exec(`INSERT INTO recipes (name, yield, created_at, updated_at) VALUES (?, 2, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`, recipe)
		if err != nil {
			return err
		}
		main, err := one(`SELECT id FROM courses WHERE name = 'Main'`)
		if err != nil {
			return err
		}
		if _, err := exec(`INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, id, main); err != nil {
			return err
		}
		for i, n := range names(list) {
			tid, err := ensureTag(n, "")
			if err != nil {
				return err
			}
			if _, err := exec(`INSERT INTO recipe_tags (recipe_id, tag_id, position) VALUES (?, ?, ?)`, id, tid, i); err != nil {
				return err
			}
		}
		return nil
	})
	sc.Step(`^a Slot Rule names the Tag "([^"]*)" for the Meal Slot "([^"]*)" on (\w+) in the Course "([^"]*)"$`, func(tag, slot, day, course string) error {
		sid, err := slotID(slot, weekdays[day])
		if err != nil {
			return err
		}
		cid, err := one(`SELECT id FROM courses WHERE name = ?`, course)
		if err != nil {
			return err
		}
		_, err = exec(`INSERT INTO slot_rules (meal_slot_id, course_id, tag) VALUES (?, ?, ?)`, sid, cid, tgKey(tag))
		return err
	})
	sc.Step(`^a Variety Rule names the Tag "([^"]*)" with at most (\d+) a week$`, func(tag string, n int) error {
		_, err := exec(`INSERT INTO variety_rules (tag, max_per_week, not_consecutive_days) VALUES (?, ?, 0)`, tgKey(tag), n)
		return err
	})

	// --- When ---

	sc.Step(`^I add the Tag "([^"]*)"(?: in the colour "([^"]*)")?$`, func(name, colour string) {
		w.Ensure()
		body := map[string]any{"name": name}
		if colour != "" {
			body["colour"] = colour
		}
		w.Last = w.Client.Post("/api/tags", body)
	})
	sc.Step(`^I rename the Tag "([^"]*)" to "([^"]*)"$`, func(name, to string) error {
		id, err := tagID(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Patch(fmt.Sprintf("/api/tags/%d", id), map[string]any{"name": to})
		return nil
	})
	sc.Step(`^I recolour the Tag "([^"]*)" to "([^"]*)"$`, func(name, colour string) error {
		id, err := tagID(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Patch(fmt.Sprintf("/api/tags/%d", id), map[string]any{"colour": colour})
		return nil
	})
	sc.Step(`^I update the Tag "([^"]*)" with JSON (.+)$`, func(name, body string) error {
		id, err := tagID(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("PATCH", fmt.Sprintf("/api/tags/%d", id), []byte(body))
		return nil
	})
	sc.Step(`^I read the impact of the Tag "([^"]*)"(?: for a merge into "([^"]*)")?$`, func(name, into string) error {
		id, err := tagID(name)
		if err != nil {
			return err
		}
		path := fmt.Sprintf("/api/tags/%d/impact", id)
		if into != "" {
			to, err := tagID(into)
			if err != nil {
				return err
			}
			path += fmt.Sprintf("?into=%d", to)
		}
		get(path)
		return nil
	})
	sc.Step(`^I read the impact of the Tag "([^"]*)" for a merge into itself$`, func(name string) error {
		id, err := tagID(name)
		if err != nil {
			return err
		}
		get(fmt.Sprintf("/api/tags/%d/impact?into=%d", id, id))
		return nil
	})
	sc.Step(`^I merge the Tag "([^"]*)" into "([^"]*)"$`, func(name, into string) error {
		id, err := tagID(name)
		if err != nil {
			return err
		}
		to, err := tagID(into)
		if err != nil {
			return err
		}
		w.Last = w.Client.Post(fmt.Sprintf("/api/tags/%d/merge", id), map[string]any{"into": to})
		return nil
	})
	sc.Step(`^I merge the Tag "([^"]*)" into (itself|a Tag nobody has)$`, func(name, what string) error {
		id, err := tagID(name)
		if err != nil {
			return err
		}
		into := int64(99999)
		if what == "itself" {
			into = id
		}
		w.Last = w.Client.Post(fmt.Sprintf("/api/tags/%d/merge", id), map[string]any{"into": into})
		return nil
	})
	sc.Step(`^I delete the Tag "([^"]*)"$`, func(name string) error {
		id, err := tagID(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Delete(fmt.Sprintf("/api/tags/%d", id))
		return nil
	})
	sc.Step(`^I (update|read the impact of|merge|delete) a Tag nobody has$`, func(what string) {
		w.Ensure()
		switch what {
		case "update":
			w.Last = w.Client.Patch("/api/tags/99999", map[string]any{"colour": "sky"})
		case "read the impact of":
			w.Last = w.Client.Get("/api/tags/99999/impact")
		case "merge":
			w.Last = w.Client.Post("/api/tags/99999/merge", map[string]any{"into": 1})
		default:
			w.Last = w.Client.Delete("/api/tags/99999")
		}
	})

	// --- Then: the answer ---

	sc.Step(`^the Tag answer JSON "([^"]*)" is "([^"]*)"$`, func(path, want string) error {
		v, err := planJSON(w.Last.Body, path)
		if err != nil {
			return err
		}
		if got := fmt.Sprint(v); got != want {
			return fmt.Errorf("%s = %q, want %q; body: %s", path, got, want, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Tag answer JSON "([^"]*)" is (null|true|false)$`, func(path, want string) error {
		v, err := planJSON(w.Last.Body, path)
		if err != nil {
			return err
		}
		if got := fmt.Sprint(v); (want == "null" && v != nil) || (want != "null" && got != want) {
			return fmt.Errorf("%s = %v, want %s; body: %s", path, v, want, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Tag answer JSON "([^"]*)" is the id of the Tag "([^"]*)"$`, func(path, name string) error {
		id, err := tagID(name)
		if err != nil {
			return err
		}
		v, err := planJSON(w.Last.Body, path)
		if err != nil {
			return err
		}
		if got, want := fmt.Sprint(v), fmt.Sprint(id); got != want {
			return fmt.Errorf("%s = %q, want the id of %q (%s); body: %s", path, got, name, want, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Tag answer JSON "([^"]*)" lists (\d+) items?$`, func(path string, want int) error {
		v, err := planJSON(w.Last.Body, path)
		if err != nil {
			return err
		}
		l, ok := v.([]any)
		if !ok || len(l) != want {
			return fmt.Errorf("%s = %v, want a list of %d; body: %s", path, v, want, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Tag answer names the other Tag "([^"]*)" in the colour "([^"]*)"$`, func(name, colour string) error {
		for path, want := range map[string]string{"error.tag.name": name, "error.tag.colour": colour} {
			v, err := planJSON(w.Last.Body, path)
			if err != nil {
				return err
			}
			if fmt.Sprint(v) != want {
				return fmt.Errorf("%s = %v, want %q; body: %s", path, v, want, w.Last.Body)
			}
		}
		return nil
	})
	sc.Step(`^the Tag answer has a refusal on the field "([^"]*)"(?: with the reason "([^"]*)")?$`, func(field, reason string) error {
		want := map[string]string{"error.code": "validation_failed", "error.field": field}
		if reason != "" {
			want["error.reason"] = reason
		}
		for path, v := range want {
			got, err := planJSON(w.Last.Body, path)
			if err != nil {
				return err
			}
			if fmt.Sprint(got) != v {
				return fmt.Errorf("%s = %v, want %q; body: %s", path, got, v, w.Last.Body)
			}
		}
		return nil
	})

	// --- Then: the list and the rules, read afresh ---

	sc.Step(`^the Tags are (.+)$`, func(list string) error {
		l, err := listing()
		if err != nil {
			return err
		}
		var got []string
		for _, t := range l {
			got = append(got, fmt.Sprint(t["name"]))
		}
		if want := names(list); strings.Join(got, "|") != strings.Join(want, "|") {
			return fmt.Errorf("Tags = %v, want %v (by name)", got, want)
		}
		return nil
	})
	sc.Step(`^there are no Tags$`, func() error {
		l, err := listing()
		if err != nil || len(l) != 0 {
			return fmt.Errorf("Tags = %v (%v), want none", l, err)
		}
		return nil
	})
	sc.Step(`^the Tag "([^"]*)" has the colour "([^"]*)"$`, func(name, colour string) error {
		t, err := listed(name)
		if err != nil {
			return err
		}
		if t["colour"] != colour {
			return fmt.Errorf("the Tag %q has the colour %v, want %s", name, t["colour"], colour)
		}
		return nil
	})
	sc.Step(`^the Tag "([^"]*)" shows (\d+) Recipes?, (\d+) Slot Rules? and (a|no) Variety Rule$`, func(name string, recipes, rules int, variety string) error {
		t, err := listed(name)
		if err != nil {
			return err
		}
		if fmt.Sprint(t["recipes"]) != fmt.Sprint(recipes) || fmt.Sprint(t["slotRules"]) != fmt.Sprint(rules) || (t["varietyRule"] == true) != (variety == "a") {
			return fmt.Errorf("the Tag %q shows %v Recipes, %v Slot Rules, Variety Rule %v", name, t["recipes"], t["slotRules"], t["varietyRule"])
		}
		return nil
	})
	sc.Step(`^the Recipe "([^"]*)" carries exactly the Tags (.+)$`, func(recipe, list string) error {
		r := w.Client.Get("/api/recipes")
		var l []struct {
			Name string   `json:"name"`
			Tags []string `json:"tags"`
		}
		if err := r.JSON(&l); err != nil {
			return err
		}
		for _, x := range l {
			if x.Name == recipe {
				got, want := tgKeys(x.Tags), tgKeys(names(list))
				sort.Strings(got)
				sort.Strings(want)
				if strings.Join(got, "|") != strings.Join(want, "|") {
					return fmt.Errorf("the Recipe %q carries %v, want %v", recipe, x.Tags, names(list))
				}
				return nil
			}
		}
		return fmt.Errorf("no Recipe %q", recipe)
	})
	sc.Step(`^the Slot Rules name (?:only )?the Tags? (.+)$`, func(list string) error {
		return tgRuleKeys(w, "/api/slot-rules", names(list))
	})
	sc.Step(`^no Slot Rule names a Tag$`, func() error { return tgRuleKeys(w, "/api/slot-rules", nil) })
	sc.Step(`^the Variety Rules name (?:only )?the Tags? (.+)$`, func(list string) error {
		return tgRuleKeys(w, "/api/variety-rules", names(list))
	})
	sc.Step(`^no Variety Rule names a Tag$`, func() error { return tgRuleKeys(w, "/api/variety-rules", nil) })
	sc.Step(`^the Variety Rule for the Tag "([^"]*)" allows at most (\d+) a week$`, func(tag string, n int) error {
		got, err := one(`SELECT max_per_week FROM variety_rules WHERE tag = ?`, tgKey(tag))
		if err != nil || got != int64(n) {
			return fmt.Errorf("the Variety Rule for %q allows %d (%v), want %d", tag, got, err, n)
		}
		return nil
	})

	// --- Then: the plan (planning scenarios) ---

	tgPlanMeal := func(date string) (map[string]any, error) {
		v, err := planJSON(w.Last.Body, "slots")
		if err != nil {
			return nil, err
		}
		for _, s := range v.([]any) {
			slot := s.(map[string]any)
			if slot["date"] == date {
				m := slotMeal(slot)
				return m, nil
			}
		}
		return nil, fmt.Errorf("no slot on %s", date)
	}
	recipeTagKeys := func(recipe string) ([]string, error) {
		rows, err := w.Ensure().DB.Query(`SELECT t.key FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id JOIN recipes r ON r.id = rt.recipe_id WHERE r.name = ?`, recipe)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var out []string
		for rows.Next() {
			var k string
			rows.Scan(&k)
			out = append(out, k)
		}
		return out, rows.Err()
	}
	sc.Step(`^the plan slot on `+tgDate+` has a Recipe tagged "([^"]*)"$`, func(date, tag string) error {
		m, err := tgPlanMeal(date)
		if err != nil || m == nil {
			return fmt.Errorf("no Planned Meal on %s (%v)", date, err)
		}
		keys, err := recipeTagKeys(fmt.Sprint(m["recipeName"]))
		if err != nil {
			return err
		}
		for _, k := range keys {
			if k == tgKey(tag) {
				return nil
			}
		}
		return fmt.Errorf("the Recipe %v on %s carries %v, want %q", m["recipeName"], date, keys, tag)
	})
	sc.Step(`^the plan slot on `+tgDate+` does not have the why chip "([^"]*)"$`, func(date, code string) error {
		m, err := tgPlanMeal(date)
		if err != nil || m == nil {
			return fmt.Errorf("no Planned Meal on %s (%v)", date, err)
		}
		chips, _ := m["why"].([]any)
		for _, c := range chips {
			if c.(map[string]any)["code"] == code {
				return fmt.Errorf("slot on %s still has the %q why chip: %v", date, code, chips)
			}
		}
		return nil
	})
	// Fresh meals whose Recipe carries the Tag and that carry no variety_relaxed chip keep the rule.
	sc.Step(`^the planned fresh meals whose Recipe carries the Tag "([^"]*)" and keep the Variety Rule number at most (\d+)$`, func(tag string, max int) error {
		v, err := planJSON(w.Last.Body, "slots")
		if err != nil {
			return err
		}
		var kept []string
		for _, s := range v.([]any) {
			slot := s.(map[string]any)
			m := slotMeal(slot)
			if m == nil || m["servedFromLeftover"] != nil {
				continue
			}
			keys, err := recipeTagKeys(fmt.Sprint(m["recipeName"]))
			if err != nil {
				return err
			}
			tagged := false
			for _, k := range keys {
				tagged = tagged || k == tgKey(tag)
			}
			relaxed := false
			chips, _ := m["why"].([]any)
			for _, c := range chips {
				relaxed = relaxed || c.(map[string]any)["code"] == "variety_relaxed"
			}
			if tagged && !relaxed {
				kept = append(kept, fmt.Sprint(slot["date"]))
			}
		}
		if len(kept) > max {
			return fmt.Errorf("%d fresh %q meals keep the rule (%v), it allows %d", len(kept), tag, kept, max)
		}
		return nil
	})
}

func tgKeys(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		out = append(out, tgKey(s))
	}
	return out
}

// tgRuleKeys checks the distinct Tag keys the rules at path name.
func tgRuleKeys(w *World, path string, want []string) error {
	r := w.Client.Get(path)
	var l []struct {
		Tag string `json:"tag"`
	}
	if err := r.JSON(&l); err != nil {
		return fmt.Errorf("%s: %v (%d %s)", path, err, r.Status, r.Body)
	}
	set := map[string]bool{}
	for _, x := range l {
		if x.Tag != "" {
			set[x.Tag] = true
		}
	}
	var got []string
	for k := range set {
		got = append(got, k)
	}
	sort.Strings(got)
	wk := tgKeys(want)
	sort.Strings(wk)
	if strings.Join(got, "|") != strings.Join(wk, "|") {
		return fmt.Errorf("%s names the Tags %v, want %v", path, got, wk)
	}
	return nil
}
