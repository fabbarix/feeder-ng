package bdd

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"time"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("crs-crx", crsCRXSteps) }

// Team C-RX (docs/dev/design/crs-crx.md): GET /api/plan/couldnt-plan/exclusions. The household and Recipes come from the
// C2 steps (steps_crs_c2_test.go); these add Exclusions, replanning and reading the new route.

type crxAnswer struct {
	Cells []struct {
		Date       string `json:"date"`
		CourseName string `json:"courseName"`
		Attendance []struct {
			Name string `json:"name"`
		} `json:"attendance"`
		OptOuts []struct {
			Name string `json:"name"`
		} `json:"optOuts"`
		Exclusions *[]struct {
			Member struct {
				Name string `json:"name"`
			} `json:"member"`
			Ingredient *struct {
				Name string `json:"name"`
			} `json:"ingredient"`
			Recipes []struct {
				Name string `json:"name"`
			} `json:"recipes"`
			RecipeCount int `json:"recipeCount"`
		} `json:"exclusions"`
		MoreExclusions int `json:"moreExclusions"`
	} `json:"cells"`
}

func crsCRXSteps(sc *godog.ScenarioContext, w *World) {
	member := func(name string) (int64, error) {
		id, ok := w.Vars["c2:member:"+name].(int64)
		if !ok {
			return 0, fmt.Errorf("the C2 household has no Member %q", name)
		}
		return id, nil
	}
	one := func(query string, args ...any) (int64, error) {
		var id int64
		if err := w.Ensure().DB.QueryRow(query, args...).Scan(&id); err != nil {
			return 0, fmt.Errorf("%s %v: %v", query, args, err)
		}
		return id, nil
	}
	names := func(list string) []string {
		var out []string
		for _, m := range crsQuoted.FindAllStringSubmatch(list, -1) {
			out = append(out, m[1])
		}
		return out
	}
	cell := func(n int) (int, error) {
		var a crxAnswer
		if err := json.Unmarshal(w.Last.Body, &a); err != nil {
			return 0, fmt.Errorf("not the Review Exclusions answer: %v: %s", err, w.Last.Body)
		}
		if n < 1 || n > len(a.Cells) {
			return 0, fmt.Errorf("no cell %d among %d: %s", n, len(a.Cells), w.Last.Body)
		}
		return n - 1, nil
	}
	answer := func() (crxAnswer, error) {
		var a crxAnswer
		if err := json.Unmarshal(w.Last.Body, &a); err != nil {
			return a, fmt.Errorf("not the Review Exclusions answer: %v: %s", err, w.Last.Body)
		}
		return a, nil
	}
	settle := func() error {
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
	setExclusion := func(memberName, ing string, excluded bool) error {
		mid, err := member(memberName)
		if err != nil {
			return err
		}
		iid, err := one(`SELECT id FROM ingredients WHERE name = ?`, ing)
		if err != nil {
			return err
		}
		r := w.Ensure().LoginAdmin(w.TB).Put(fmt.Sprintf("/api/ingredient-exclusions/%d", iid), map[string]any{"excluded": excluded, "memberId": mid})
		if r.Status != 200 && r.Status != 204 {
			return fmt.Errorf("set the Exclusion of %s for %s: %d %s", ing, memberName, r.Status, r.Body)
		}
		return nil
	}

	// --- Setting up ---

	sc.Step(`^the C2 Member "([^"]*)" excludes the C2 Ingredient "([^"]*)"$`, func(m, ing string) error { return setExclusion(m, ing, true) })
	sc.Step(`^the C2 Member "([^"]*)" no longer excludes the C2 Ingredient "([^"]*)"$`, func(m, ing string) error { return setExclusion(m, ing, false) })
	sc.Step(`^the C2 Member "([^"]*)" excludes the C2 Recipe "([^"]*)"$`, func(m, recipe string) error {
		mid, err := member(m)
		if err != nil {
			return err
		}
		rid, err := one(`SELECT id FROM recipes WHERE name = ?`, recipe)
		if err != nil {
			return err
		}
		r := w.Ensure().LoginAdmin(w.TB).Put(fmt.Sprintf("/api/recipes/%d/preference", rid), map[string]any{"state": "exclusion", "memberId": mid})
		if r.Status != 200 {
			return fmt.Errorf("exclude %s for %s: %d %s", recipe, m, r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the C2 Member "([^"]*)" opts out of the Course "([^"]*)" at that Dinner$`, func(m, course string) error {
		mid, err := member(m)
		if err != nil {
			return err
		}
		cid, err := one(`SELECT id FROM courses WHERE name = ?`, course)
		if err != nil {
			return err
		}
		slot, _ := w.Vars["c2:slot"].(int64)
		_, err = w.Ensure().DB.Exec(`INSERT INTO meal_slot_course_opt_outs (meal_slot_id, course_id, member_id) VALUES (?, ?, ?)`, slot, cid, mid)
		return err
	})
	// The C2 household keeps the planner quiet; this asks it to plan from the household as it is now, then waits.
	sc.Step(`^the planner replans everything$`, func() error {
		if err := settle(); err != nil {
			return err
		}
		if r := w.Ensure().LoginAdmin(w.TB).Post("/api/plan/regenerate", nil); r.Status != 200 {
			return fmt.Errorf("regenerate: %d %s", r.Status, r.Body)
		}
		return settle()
	})
	// A reason written before the detail was recorded: an Exclusion count and no exclusions_json.
	sc.Step(`^the C2 plan could not fill the Course "([^"]*)" on (\d{4}-\d{2}-\d{2}) with (\d+) Recipes excluded and no detail stored$`, func(course, date string, n int) error {
		cid, err := one(`SELECT id FROM courses WHERE name = ?`, course)
		if err != nil {
			return err
		}
		slot, _ := w.Vars["c2:slot"].(int64)
		elim := fmt.Sprintf(`{"considered":%d,"exclusion":%d,"coolDown":0,"varietyRule":0,"advanceStep":0}`, n+1, n)
		_, err = w.Ensure().DB.Exec(`INSERT INTO plan_unfilled (date, meal_slot_id, course_id, reason, slot_rule_claimed, eliminated_json, exclusions_json)
			VALUES (?, ?, ?, 'no_candidates', 0, ?, NULL)`, date, slot, cid, elim)
		return err
	})

	// --- Reading ---

	sc.Step(`^I list the Review Exclusions cells$`, func() { w.Last = w.Client.Get("/api/plan/couldnt-plan/exclusions") })
	sc.Step(`^the Review Exclusions list has (\d+) cells$`, func(n int) error {
		a, err := answer()
		if err != nil {
			return err
		}
		if len(a.Cells) != n {
			return fmt.Errorf("%d cells, want %d: %s", len(a.Cells), n, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Review Exclusions cell (\d+) is the Course "([^"]*)" on (\d{4}-\d{2}-\d{2})$`, func(n int, course, date string) error {
		i, err := cell(n)
		if err != nil {
			return err
		}
		a, _ := answer()
		if c := a.Cells[i]; c.CourseName != course || c.Date != date {
			return fmt.Errorf("cell %d is %s on %s, want %s on %s", n, c.CourseName, c.Date, course, date)
		}
		return nil
	})
	sc.Step(`^the Review Exclusions cell (\d+) is eaten by (.+) and skipped by (nobody|.+)$`, func(n int, eaters, skippers string) error {
		i, err := cell(n)
		if err != nil {
			return err
		}
		a, _ := answer()
		var eat, skip []string
		for _, m := range a.Cells[i].Attendance {
			eat = append(eat, m.Name)
		}
		for _, m := range a.Cells[i].OptOuts {
			skip = append(skip, m.Name)
		}
		wantSkip := names(skippers)
		if skippers == "nobody" {
			wantSkip = nil
		}
		if !reflect.DeepEqual(eat, names(eaters)) || !reflect.DeepEqual(skip, wantSkip) {
			return fmt.Errorf("cell %d: eaten by %v, skipped by %v; want %v and %v", n, eat, skip, names(eaters), wantSkip)
		}
		return nil
	})
	sc.Step(`^the Review Exclusions cell (\d+) has (\d+) records$`, func(n, count int) error {
		i, err := cell(n)
		if err != nil {
			return err
		}
		a, _ := answer()
		if a.Cells[i].Exclusions == nil || len(*a.Cells[i].Exclusions) != count {
			return fmt.Errorf("cell %d records = %v, want %d: %s", n, a.Cells[i].Exclusions, count, w.Last.Body)
		}
		return nil
	})
	record := func(n, m int, ingredient, who string, count int, recipes string) error {
		i, err := cell(n)
		if err != nil {
			return err
		}
		a, _ := answer()
		ex := a.Cells[i].Exclusions
		if ex == nil || m < 1 || m > len(*ex) {
			return fmt.Errorf("cell %d has no record %d: %s", n, m, w.Last.Body)
		}
		rec := (*ex)[m-1]
		var got []string
		for _, r := range rec.Recipes {
			got = append(got, r.Name)
		}
		gotIng := ""
		if rec.Ingredient != nil {
			gotIng = rec.Ingredient.Name
		}
		if rec.Member.Name != who || gotIng != ingredient || rec.RecipeCount != count || !reflect.DeepEqual(got, names(recipes)) {
			return fmt.Errorf("cell %d record %d = %s / %q ruling out %d %v; want %s / %q ruling out %d %v",
				n, m, rec.Member.Name, gotIng, rec.RecipeCount, got, who, ingredient, count, names(recipes))
		}
		return nil
	}
	sc.Step(`^the Review Exclusions cell (\d+) record (\d+) is the Exclusion of "([^"]*)" by "([^"]*)" ruling out (\d+) Recipes: (.+)$`,
		func(n, m int, ing, who string, count int, recipes string) error {
			return record(n, m, ing, who, count, recipes)
		})
	sc.Step(`^the Review Exclusions cell (\d+) record (\d+) is the direct Exclusion by "([^"]*)" ruling out (\d+) Recipes: (.+)$`,
		func(n, m int, who string, count int, recipes string) error {
			return record(n, m, "", who, count, recipes)
		})
	sc.Step(`^the Review Exclusions cell (\d+) has no more Exclusions$`, func(n int) error {
		i, err := cell(n)
		if err != nil {
			return err
		}
		a, _ := answer()
		if a.Cells[i].MoreExclusions != 0 {
			return fmt.Errorf("moreExclusions = %d", a.Cells[i].MoreExclusions)
		}
		return nil
	})
	sc.Step(`^the Review Exclusions cell (\d+) has no detail yet$`, func(n int) error {
		i, err := cell(n)
		if err != nil {
			return err
		}
		a, _ := answer()
		if a.Cells[i].Exclusions != nil || !strings.Contains(string(w.Last.Body), `"exclusions":null`) {
			return fmt.Errorf("exclusions should be null: %s", w.Last.Body)
		}
		return nil
	})
}
