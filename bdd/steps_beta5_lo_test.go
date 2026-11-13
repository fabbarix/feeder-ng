package bdd

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("beta5-lo", beta5LOSteps) }

// Beta.5 LO (ADR 0012, bdd/features/beta5/leftovers.feature): Leftovers by hand. It reuses the C2 household ("the C2
// household has a Dinner on Monday ...", Recipes, "the C2 plan is empty", "I mark as Cooked the Course ..."), the
// pantry step that makes a Storage Place ("the Household keeps food in the freezer ..." and "I delete the Storage Place ..."; its ids are kept as
// "pantry.place.<name>"), the household clock and scheduler steps of planning, "the Household was created on" and the
// streak steps of Today. A Leftover is named by its Recipe; its id is kept as "lo:<Recipe>". Every action goes through
// the public API as the signed-in User; the Thens read the API too, except where noted.
func beta5LOSteps(sc *godog.ScenarioContext, w *World) {
	date := `(\d{4}-\d{2}-\d{2})`
	num := `(\d+(?:\.\d+)?)`
	one := func(query string, args ...any) (int64, error) {
		var id int64
		if err := w.Ensure().DB.QueryRow(query, args...).Scan(&id); err != nil {
			return 0, fmt.Errorf("%s %v: %v", query, args, err)
		}
		return id, nil
	}
	exec := func(query string, args ...any) (int64, error) {
		res, err := w.Ensure().DB.Exec(query, args...)
		if err != nil {
			return 0, fmt.Errorf("%s: %v", query, err)
		}
		id, _ := res.LastInsertId()
		return id, nil
	}
	slot := func() int64 { v, _ := w.Vars["c2:slot"].(int64); return v }
	place := func(name string) (int64, error) {
		id, ok := w.Vars["pantry.place."+name].(int64)
		if !ok {
			return 0, fmt.Errorf("no Storage Place %q", name)
		}
		return id, nil
	}
	leftoverID := func(recipe string) (int64, error) {
		id, ok := w.Vars["lo:"+recipe].(int64)
		if !ok {
			return 0, fmt.Errorf("no Leftover of %q was set up", recipe)
		}
		return id, nil
	}
	path := func(recipe, action string) (string, error) {
		id, err := leftoverID(recipe)
		return fmt.Sprintf("/api/plan/leftovers/%d/%s", id, action), err
	}
	type leftover struct {
		ID               int64   `json:"id"`
		RecipeName       string  `json:"recipeName"`
		Portions         float64 `json:"portions"`
		UseBy            string  `json:"useBy"`
		StoragePlaceID   *int64  `json:"storagePlaceId"`
		StoragePlaceName *string `json:"storagePlaceName"`
		Frozen           bool    `json:"frozen"`
		FrozenOn         *string `json:"frozenOn"`
		ToAnswer         bool    `json:"toAnswer"`
		PlannedPortions  float64 `json:"plannedPortions"`
	}
	list := func() ([]leftover, error) {
		r := w.Client.Get("/api/plan/leftovers")
		var out struct {
			Leftovers []leftover `json:"leftovers"`
		}
		if r.Status != 200 || r.JSON(&out) != nil {
			return nil, fmt.Errorf("GET /api/plan/leftovers: %d %s", r.Status, r.Body)
		}
		return out.Leftovers, nil
	}
	// find is the Leftover named by its Recipe (the id set up by the Given); ok is false when it is not listed (no
	// portions left, or gone).
	find := func(recipe string) (leftover, bool, error) {
		id, err := leftoverID(recipe)
		if err != nil {
			return leftover{}, false, err
		}
		ls, err := list()
		if err != nil {
			return leftover{}, false, err
		}
		for _, l := range ls {
			if l.ID == id {
				return l, true, nil
			}
		}
		return leftover{}, false, nil
	}
	mustFind := func(recipe string) (leftover, error) {
		l, ok, err := find(recipe)
		if err == nil && !ok {
			err = fmt.Errorf("the Leftover of %s is not listed", recipe)
		}
		return l, err
	}
	post := func(recipe, action string, body any) error {
		p, err := path(recipe, action)
		if err != nil {
			return err
		}
		w.Last = w.Client.Post(p, body)
		return nil
	}
	mustOK := func(what string) error {
		if w.Last.Status != 200 && w.Last.Status != 204 {
			return fmt.Errorf("%s: %d %s", what, w.Last.Status, w.Last.Body)
		}
		return nil
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
	cellMeal := func(course, d string) (recipeID int64, fromLeftover *int64, pinned bool, err error) {
		var from *int64
		var pin int
		var fl int64
		var isNull int
		err = w.Ensure().DB.QueryRow(`SELECT recipe_id, COALESCE(from_leftover_id, 0), from_leftover_id IS NULL, pinned FROM planned_meals
			WHERE date = ? AND meal_slot_id = ? AND course_id = (SELECT id FROM courses WHERE name = ?)`, d, slot(), course).
			Scan(&recipeID, &fl, &isNull, &pin)
		if err != nil {
			return 0, nil, false, fmt.Errorf("no Planned Meal in the Course %s on %s: %v", course, d, err)
		}
		if isNull == 0 {
			from = &fl
		}
		return recipeID, from, pin == 1, nil
	}
	setUp := func(recipe string, portions float64, useBy string, placeName, frozenOn string) error {
		rid, err := one(`SELECT id FROM recipes WHERE name = ?`, recipe)
		if err != nil {
			return err
		}
		main, err := one(`SELECT id FROM courses WHERE is_main = 1`)
		if err != nil {
			return err
		}
		var p, f any
		if placeName != "" {
			id, err := place(placeName)
			if err != nil {
				return err
			}
			p, f = id, frozenOn
		}
		id, err := exec(`INSERT INTO leftovers (recipe_id, from_date, from_meal_slot_id, from_course_id, portions, cooked_on, use_by, status, created_at, storage_place_id, frozen_on)
			VALUES (?, '2026-11-05', ?, ?, ?, '2026-11-05', ?, 'available', '2026-11-05T20:00:00Z', ?, ?)`, rid, slot(), main, portions, useBy, p, f)
		w.Vars["lo:"+recipe] = id
		return err
	}

	// --- Set-up ---

	sc.Step(`^the Leftover "([^"]*)" has `+num+` portions? to use by `+date+`$`, func(recipe, n, useBy string) error {
		p, _ := strconv.ParseFloat(n, 64)
		return setUp(recipe, p, useBy, "", "")
	})
	sc.Step(`^the Leftover "([^"]*)" has `+num+` portions? to use by `+date+` and has been frozen on `+date+` in the "([^"]*)"$`,
		func(recipe, n, useBy, frozenOn, where string) error {
			p, _ := strconv.ParseFloat(n, 64)
			return setUp(recipe, p, useBy, where, frozenOn)
		})
	sc.Step(`^the C2 plan has the Course "([^"]*)" on `+date+` served from the Leftover "([^"]*)"( and pinned)?$`, func(course, d, recipe, pinned string) error {
		id, err := leftoverID(recipe)
		if err != nil {
			return err
		}
		cid, err := one(`SELECT id FROM courses WHERE name = ?`, course)
		if err != nil {
			return err
		}
		rid, err := one(`SELECT recipe_id FROM leftovers WHERE id = ?`, id)
		if err != nil {
			return err
		}
		pin := 0
		if pinned != "" {
			pin = 1
		}
		_, err = exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, from_leftover_id, from_date, from_meal_slot_id, from_course_id, created_at, updated_at)
			VALUES (?, ?, ?, ?, 0, 2, 'planned', ?, ?, '2026-11-05', ?, ?, '2026-11-08T12:00:00Z', '2026-11-08T12:00:00Z')`, d, slot(), cid, rid, pin, id, slot(), cid)
		return err
	})
	sc.Step(`^the planner plans again$`, func() error {
		w.Ensure().App.Deps.Events.Publish("household", map[string]string{"changed": "mealSlots"})
		return settle()
	})

	// --- Actions ---

	sc.Step(`^I had `+num+` portions? of the Leftover "([^"]*)"$`, func(n, recipe string) error {
		p, _ := strconv.ParseFloat(n, 64)
		if err := post(recipe, "had-it", map[string]any{"portions": p}); err != nil {
			return err
		}
		return mustOK("Had it")
	})
	sc.Step(`^I try to have `+num+` portions? of the Leftover "([^"]*)"$`, func(n, recipe string) error {
		p, _ := strconv.ParseFloat(n, 64)
		return post(recipe, "had-it", map[string]any{"portions": p})
	})
	sc.Step(`^I threw out `+num+` portions? of the Leftover "([^"]*)"$`, func(n, recipe string) error {
		p, _ := strconv.ParseFloat(n, 64)
		if err := post(recipe, "threw-out", map[string]any{"portions": p}); err != nil {
			return err
		}
		return mustOK("Threw it out")
	})
	freeze := func(recipe, where string, portions *float64) error {
		pid, err := place(where)
		if err != nil {
			return err
		}
		body := map[string]any{"storagePlaceId": pid}
		if portions != nil {
			body["portions"] = *portions
		}
		return post(recipe, "freeze", body)
	}
	sc.Step(`^I freeze the Leftover "([^"]*)" in the "([^"]*)"$`, func(recipe, where string) error {
		if err := freeze(recipe, where, nil); err != nil {
			return err
		}
		return mustOK("Freeze it")
	})
	sc.Step(`^I freeze `+num+` portions? of the Leftover "([^"]*)" in the "([^"]*)"$`, func(n, recipe, where string) error {
		p, _ := strconv.ParseFloat(n, 64)
		if err := freeze(recipe, where, &p); err != nil {
			return err
		}
		return mustOK("Freeze it")
	})
	sc.Step(`^I try to freeze the Leftover "([^"]*)" in the "([^"]*)"$`, func(recipe, where string) error {
		return freeze(recipe, where, nil)
	})
	sc.Step(`^I take the Leftover "([^"]*)" out of the freezer$`, func(recipe string) error {
		if err := post(recipe, "take-out", map[string]any{"storagePlaceId": nil}); err != nil {
			return err
		}
		return mustOK("Take out")
	})
	answer := func(recipe, what string) error {
		code := map[string]string{"had it": "had_it", "threw it out": "threw_out", "wasn't there": "wasnt_there"}[what]
		return post(recipe, "answer", map[string]any{"answer": code})
	}
	sc.Step(`^I answer that I (had it|threw it out|wasn't there) for the Leftover "([^"]*)"$`, func(what, recipe string) error {
		if err := answer(recipe, what); err != nil {
			return err
		}
		return mustOK("answer")
	})
	sc.Step(`^I try to answer that I (had it|threw it out|wasn't there) for the Leftover "([^"]*)"$`, func(what, recipe string) error {
		return answer(recipe, what)
	})
	sc.Step(`^I choose the frozen Leftover "([^"]*)" for the Course "([^"]*)" on `+date+`$`, func(recipe, course, d string) error {
		id, err := leftoverID(recipe)
		if err != nil {
			return err
		}
		cid, err := one(`SELECT id FROM courses WHERE name = ?`, course)
		if err != nil {
			return err
		}
		w.Last = w.Client.Put(fmt.Sprintf("/api/plan/%s/%d/%d", d, slot(), cid), map[string]any{"leftoverId": id})
		return mustOK("choose the Leftover")
	})

	// --- Outcomes ---

	sc.Step(`^the Leftover "([^"]*)" has `+num+` portions? left$`, func(recipe, n string) error {
		want, _ := strconv.ParseFloat(n, 64)
		l, ok, err := find(recipe)
		if err != nil {
			return err
		}
		if got := l.Portions; (!ok && want != 0) || (ok && got != want) {
			return fmt.Errorf("the Leftover of %s has %v portions left (listed %v), want %v", recipe, got, ok, want)
		}
		return nil
	})
	sc.Step(`^the Leftover "([^"]*)" has `+num+` portions? planned$`, func(recipe, n string) error {
		want, _ := strconv.ParseFloat(n, 64)
		l, err := mustFind(recipe)
		if err != nil {
			return err
		}
		if l.PlannedPortions != want {
			return fmt.Errorf("%v portions planned from the Leftover of %s, want %v", l.PlannedPortions, recipe, want)
		}
		return nil
	})
	sc.Step(`^the Leftover "([^"]*)" is frozen in the "([^"]*)"$`, func(recipe, where string) error {
		l, err := mustFind(recipe)
		if err != nil {
			return err
		}
		if !l.Frozen || l.FrozenOn == nil || l.StoragePlaceName == nil || *l.StoragePlaceName != where {
			return fmt.Errorf("the Leftover of %s is %+v, want frozen in the %s", recipe, l, where)
		}
		return nil
	})
	sc.Step(`^the Leftover "([^"]*)" is frozen and Not sorted$`, func(recipe string) error {
		l, err := mustFind(recipe)
		if err != nil {
			return err
		}
		if !l.Frozen || l.StoragePlaceID != nil || l.StoragePlaceName != nil {
			return fmt.Errorf("the Leftover of %s is %+v, want frozen with no Storage Place", recipe, l)
		}
		return nil
	})
	sc.Step(`^the Leftover "([^"]*)" is not frozen$`, func(recipe string) error {
		l, err := mustFind(recipe)
		if err != nil {
			return err
		}
		if l.Frozen || l.FrozenOn != nil {
			return fmt.Errorf("the Leftover of %s is frozen: %+v", recipe, l)
		}
		return nil
	})
	sc.Step(`^`+`(\d+) portions of "([^"]*)" are frozen in the "([^"]*)"$`, func(n int, recipe, where string) error {
		ls, err := list()
		if err != nil {
			return err
		}
		var sum float64
		for _, l := range ls {
			if l.RecipeName == recipe && l.Frozen && l.StoragePlaceName != nil && *l.StoragePlaceName == where {
				sum += l.Portions
			}
		}
		if sum != float64(n) {
			return fmt.Errorf("%v portions of %s are frozen in the %s, want %d: %+v", sum, recipe, where, n, ls)
		}
		return nil
	})
	sc.Step(`^the Leftover "([^"]*)" is to be used by `+date+`$`, func(recipe, d string) error {
		l, err := mustFind(recipe)
		if err != nil {
			return err
		}
		if l.UseBy != d {
			return fmt.Errorf("the Leftover of %s is to be used by %s, want %s", recipe, l.UseBy, d)
		}
		return nil
	})
	sc.Step(`^the Leftover "([^"]*)" is to be answered$`, func(recipe string) error {
		l, err := mustFind(recipe)
		if err != nil {
			return err
		}
		if !l.ToAnswer {
			return fmt.Errorf("the Leftover of %s is not waiting for an answer: %+v", recipe, l)
		}
		return nil
	})
	sc.Step(`^the Leftover "([^"]*)" is gone$`, func(recipe string) error {
		id, err := leftoverID(recipe)
		if err != nil {
			return err
		}
		var n int
		if err := w.Ensure().DB.QueryRow(`SELECT count(*) FROM leftovers WHERE id = ?`, id).Scan(&n); err != nil {
			return err
		}
		if n != 0 {
			return fmt.Errorf("the Leftover of %s is still there", recipe)
		}
		return nil
	})
	sc.Step(`^the Household has recorded no waste$`, func() error {
		var n int
		if err := w.Ensure().DB.QueryRow(`SELECT count(*) FROM stock_waste`).Scan(&n); err != nil {
			return err
		}
		if n != 0 {
			return fmt.Errorf("%d waste records, want none", n)
		}
		return nil
	})
	sc.Step(`^the Household has recorded waste of `+num+` portions? dated `+date+`$`, func(n, d string) error {
		q, _ := strconv.ParseFloat(n, 64)
		var count int
		if err := w.Ensure().DB.QueryRow(`SELECT count(*) FROM stock_waste WHERE reason = 'leftover_discarded' AND quantity = ? AND wasted_on = ?`, q, d).Scan(&count); err != nil {
			return err
		}
		if count != 1 {
			return fmt.Errorf("%d waste records of %v portions dated %s, want exactly 1", count, q, d)
		}
		return nil
	})
	sc.Step(`^the Course "([^"]*)" on `+date+` is (not )?served from the Leftover "([^"]*)"$`, func(course, d, not, recipe string) error {
		id, err := leftoverID(recipe)
		if err != nil {
			return err
		}
		_, from, _, err := cellMeal(course, d)
		if err != nil {
			if not != "" {
				return nil // planned again with nothing yet is also "not served from it"
			}
			return err
		}
		if got := from != nil && *from == id; got == (not != "") {
			return fmt.Errorf("the Course %s on %s: served from the Leftover of %s = %v", course, d, recipe, got)
		}
		return nil
	})
	sc.Step(`^the Course "([^"]*)" on `+date+` is (not )?pinned$`, func(course, d, not string) error {
		_, _, pinned, err := cellMeal(course, d)
		if err != nil {
			return err
		}
		if pinned == (not != "") {
			return fmt.Errorf("the Course %s on %s: pinned = %v", course, d, pinned)
		}
		return nil
	})
	sc.Step(`^the Course "([^"]*)" on `+date+` has a fresh Planned Meal of "([^"]*)"$`, func(course, d, recipe string) error {
		rid, from, _, err := cellMeal(course, d)
		if err != nil {
			return err
		}
		want, err := one(`SELECT id FROM recipes WHERE name = ?`, recipe)
		if err != nil {
			return err
		}
		if from != nil || rid != want {
			return fmt.Errorf("the Course %s on %s: recipe %d from Leftover %v, want a fresh %s", course, d, rid, from, recipe)
		}
		return nil
	})
	sc.Step(`^the Leftover answer is (\d+) with the code "([a-z_]+)"$`, func(status int, code string) error {
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
}
