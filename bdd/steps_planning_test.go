package bdd

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("planning", planningSteps) }

var (
	planDate = `(\d{4}-\d{2}-\d{2})`
	planNeed = regexp.MustCompile(`^(\d+) g (.+)$`)
)

// planJSON walks a dotted path through a JSON document; a numeric key indexes an array.
func planJSON(body []byte, path string) (any, error) {
	var doc any
	if err := jsonUnmarshal(body, &doc); err != nil {
		return nil, fmt.Errorf("response is not JSON: %v; body: %s", err, body)
	}
	cur := doc
	for _, key := range strings.Split(path, ".") {
		switch node := cur.(type) {
		case map[string]any:
			v, ok := node[key]
			if !ok {
				return nil, fmt.Errorf("path %q: key %q missing; body: %s", path, key, body)
			}
			cur = v
		case []any:
			i, err := strconv.Atoi(key)
			if err != nil || i < 0 || i >= len(node) {
				return nil, fmt.Errorf("path %q: index %q out of range (len %d); body: %s", path, key, len(node), body)
			}
			cur = node[i]
		default:
			return nil, fmt.Errorf("path %q: %v is not an object or array at %q; body: %s", path, cur, key, body)
		}
	}
	return cur, nil
}

func planningSteps(sc *godog.ScenarioContext, w *World) {
	admin := func() *testkit.Client { return w.Ensure().LoginAdmin(w.TB) }
	id := func(kind, name string) int64 {
		v, _ := w.Vars["plan:"+kind+":"+name].(int64)
		return v
	}
	createdID := func(r *testkit.Response, what string) (int64, error) {
		var v struct {
			ID int64 `json:"id"`
		}
		if (r.Status != 201 && r.Status != 200) || r.JSON(&v) != nil {
			return 0, fmt.Errorf("%s: %d %s", what, r.Status, r.Body)
		}
		return v.ID, nil
	}
	ingredient := func(name string) (int64, error) {
		if v := id("ingredient", name); v != 0 {
			return v, nil
		}
		r := admin().Post("/api/ingredients", map[string]any{"name": name, "baseUnit": "g"})
		n, err := createdID(r, "create Ingredient "+name)
		if err == nil {
			w.Vars["plan:ingredient:"+name] = n
		}
		return n, err
	}
	slotOn := func(date string) (int64, error) {
		d, err := time.Parse("2006-01-02", date)
		if err != nil {
			return 0, err
		}
		wd := int(d.Weekday())
		if wd == 0 {
			wd = 7
		}
		return id("slot", strconv.Itoa(wd)), nil
	}
	slotPath := func(date, suffix string) (string, error) {
		slot, err := slotOn(date)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("/api/plan/%s/%d%s", date, slot, suffix), nil
	}
	// planSlot fetches the plan for one date and returns that date's slot object (without touching w.Last).
	planSlot := func(date string) (map[string]any, error) {
		r := w.Client.Get(fmt.Sprintf("/api/plan?from=%s&to=%s", date, date))
		if r.Status != 200 {
			return nil, fmt.Errorf("GET /api/plan for %s: %d %s", date, r.Status, r.Body)
		}
		slots, err := planJSON(r.Body, "slots")
		if err != nil {
			return nil, err
		}
		list, _ := slots.([]any)
		if len(list) != 1 {
			return nil, fmt.Errorf("plan for %s has %d slots, want 1; body: %s", date, len(list), r.Body)
		}
		return list[0].(map[string]any), nil
	}
	mealOn := func(date string) (map[string]any, error) {
		s, err := planSlot(date)
		if err != nil {
			return nil, err
		}
		m, _ := s["meal"].(map[string]any)
		return m, nil
	}
	settled := func() error {
		deadline := time.Now().Add(5 * time.Second)
		quiet := 0
		for time.Now().Before(deadline) {
			r := w.Client.Get("/api/plan?from=2000-01-01&to=2000-01-01")
			updating, _ := planJSON(r.Body, "updating")
			if r.Status == 200 && updating == false {
				if quiet++; quiet >= 3 {
					return nil
				}
			} else {
				quiet = 0
			}
			time.Sleep(30 * time.Millisecond)
		}
		return fmt.Errorf("the planner did not finish within 5 s")
	}
	post := func(path string, body any) { w.Last = w.Client.Post(path, body) }
	mustOK := func(what string) error {
		if w.Last.Status != 200 {
			return fmt.Errorf("%s: %d %s", what, w.Last.Status, w.Last.Body)
		}
		return nil
	}
	recipeID := func(name string) int64 {
		if v := id("recipe", name); v != 0 {
			return v
		}
		return 999999 // an unknown Recipe
	}
	pin := func(date, recipe string) error {
		path, err := slotPath(date, "")
		if err != nil {
			return err
		}
		w.Last = w.Client.Put(path, map[string]any{"recipeId": recipeID(recipe)})
		return nil
	}

	// --- Household and Recipe set-up (admin, through the public APIs) ---

	sc.Step(`^the planning household has the Members "([^"]*)" and "([^"]*)"$`, func(a, b string) error {
		for _, name := range []string{a, b} {
			r := admin().Post("/api/members", map[string]any{"name": name, "colour": "#3366cc", "portionFactor": 1})
			n, err := createdID(r, "create Member "+name)
			if err != nil {
				return err
			}
			w.Vars["plan:member:"+name] = n
		}
		return nil
	})
	sc.Step(`^the planning household has a Dinner at (\d\d:\d\d) every day attended by "([^"]*)" and "([^"]*)"$`, func(at, a, b string) error {
		for wd := 1; wd <= 7; wd++ {
			r := admin().Post("/api/meal-slots", map[string]any{"weekday": wd, "name": "Dinner", "time": at, "attendance": []map[string]any{
				{"memberId": id("member", a)}, {"memberId": id("member", b)}}})
			n, err := createdID(r, "create the Dinner Meal Slot")
			if err != nil {
				return err
			}
			w.Vars["plan:slot:"+strconv.Itoa(wd)] = n
		}
		return nil
	})
	sc.Step(`^the planning household plans (\d+) days ahead$`, func(days int) error {
		var cur map[string]any
		g := admin().Get("/api/household/settings")
		if g.Status != 200 || g.JSON(&cur) != nil {
			return fmt.Errorf("read settings: %d %s", g.Status, g.Body)
		}
		body := map[string]any{}
		for _, k := range []string{"timeZone", "defaultCooldownDays", "defaultLeftoverUseByDays", "quietHours", "plannerStyle", "location", "currency"} {
			body[k] = cur[k]
		}
		body["planningHorizonDays"] = days
		if r := admin().Put("/api/household/settings", body); r.Status != 200 {
			return fmt.Errorf("save settings: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the planning Recipes:$`, func(table *godog.Table) error {
		for _, row := range table.Rows[1:] {
			cell := func(i int) string { return strings.TrimSpace(row.Cells[i].Value) }
			name := cell(0)
			yield, _ := strconv.ParseFloat(cell(1), 64)
			var tags []string
			for _, tg := range strings.Split(cell(2), ",") {
				if tg = strings.TrimSpace(tg); tg != "" {
					tags = append(tags, tg)
				}
			}
			var lines []map[string]any
			for _, need := range strings.Split(cell(3), ",") {
				m := planNeed.FindStringSubmatch(strings.TrimSpace(need))
				if m == nil {
					return fmt.Errorf("bad needs cell %q (want \"100 g flour\")", need)
				}
				ing, err := ingredient(m[2])
				if err != nil {
					return err
				}
				qty, _ := strconv.ParseFloat(m[1], 64)
				lines = append(lines, map[string]any{"ingredientId": ing, "quantity": qty, "unit": "g"})
			}
			r := admin().Post("/api/recipes", map[string]any{"name": name, "yield": yield, "tags": tags, "lines": lines})
			n, err := createdID(r, "create Recipe "+name)
			if err != nil {
				return err
			}
			w.Vars["plan:recipe:"+name] = n
			w.Vars["plan:recipename:"+strconv.FormatInt(n, 10)] = name
			w.Vars["plan:tags:"+name] = tags
		}
		return nil
	})
	sc.Step(`^every planning Recipe except "([^"]*)" is archived$`, func(keep string) error {
		for k, v := range w.Vars {
			if name, ok := strings.CutPrefix(k, "plan:recipe:"); ok && name != keep {
				if r := admin().Post(fmt.Sprintf("/api/recipes/%d/archive", v.(int64)), nil); r.Status != 200 {
					return fmt.Errorf("archive %s: %d %s", name, r.Status, r.Body)
				}
			}
		}
		return nil
	})
	sc.Step(`^I archive the planning Recipe "([^"]*)"$`, func(name string) error {
		r := w.Client.Post(fmt.Sprintf("/api/recipes/%d/archive", recipeID(name)), nil)
		if r.Status != 200 {
			return fmt.Errorf("archive %s: %d %s", name, r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^I delete the planning Recipe "([^"]*)"$`, func(name string) {
		w.Last = w.Client.Delete(fmt.Sprintf("/api/recipes/%d", recipeID(name)))
	})
	sc.Step(`^I remember the Recipe planned on `+planDate+`$`, func(date string) error {
		m, err := mealOn(date)
		if err != nil || m == nil {
			return fmt.Errorf("nothing planned on %s (%v)", date, err)
		}
		w.Vars["plan:remembered"] = m["recipeName"]
		return nil
	})
	sc.Step(`^I archive the remembered planning Recipe$`, func() error {
		name, _ := w.Vars["plan:remembered"].(string)
		r := w.Client.Post(fmt.Sprintf("/api/recipes/%d/archive", recipeID(name)), nil)
		if r.Status != 200 {
			return fmt.Errorf("archive %s: %d %s", name, r.Status, r.Body)
		}
		return nil
	})

	// --- Clock and scheduler ---

	sc.Step(`^the household clock is `+planDate+` (\d\d:\d\d) UTC$`, func(date, hhmm string) error {
		t, err := time.Parse("2006-01-02 15:04", date+" "+hhmm)
		if err != nil {
			return err
		}
		w.Ensure().Clock.Set(t.UTC())
		return nil
	})
	sc.Step(`^the scheduler runs its due jobs$`, func() error {
		if _, err := w.Ensure().App.Deps.Scheduler.RunDue(context.Background()); err != nil {
			return fmt.Errorf("scheduler: %v", err)
		}
		return settled()
	})
	sc.Step(`^the planner has finished$`, settled)

	// --- Stock (T10's HTTP API) ---

	sc.Step(`^planning Stock holds (\d+) g of "([^"]*)"$`, func(qty int, name string) error {
		ing, err := ingredient(name)
		if err != nil {
			return err
		}
		r := admin().Post("/api/stock/lots", map[string]any{"ingredientId": ing, "quantity": qty})
		if r.Status != 201 {
			return fmt.Errorf("add a Stock Lot: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^planning Stock holds (\d+) g of "([^"]*)" in total$`, func(want int, name string) error {
		r := admin().Get("/api/stock")
		var out struct {
			Ingredients []struct {
				Name  string  `json:"name"`
				Total float64 `json:"total"`
			} `json:"ingredients"`
		}
		if r.Status != 200 || r.JSON(&out) != nil {
			return fmt.Errorf("GET /api/stock: %d %s", r.Status, r.Body)
		}
		for _, i := range out.Ingredients {
			if i.Name == name {
				if i.Total != float64(want) {
					return fmt.Errorf("Stock holds %v g of %s, want %d", i.Total, name, want)
				}
				return nil
			}
		}
		if want == 0 {
			return nil // Stock lists only Ingredients with Stock > 0
		}
		return fmt.Errorf("Stock has no %s; body: %s", name, r.Body)
	})
	sc.Step(`^I correct Stock to (\d+) g of "([^"]*)" from the warning$`, func(total int, name string) error {
		ing, err := ingredient(name)
		if err != nil {
			return err
		}
		r := w.Client.Put(fmt.Sprintf("/api/stock/ingredients/%d/total", ing), map[string]any{"total": total})
		if r.Status != 200 {
			return fmt.Errorf("Set total: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^planning Stock waste has a "([^"]*)" record of (\d+)$`, func(reason string, qty int) error {
		r := admin().Get("/api/stock/waste")
		var out struct {
			Records []struct {
				Reason   string  `json:"reason"`
				Quantity float64 `json:"quantity"`
			} `json:"records"`
		}
		if r.Status != 200 || r.JSON(&out) != nil {
			return fmt.Errorf("GET /api/stock/waste: %d %s", r.Status, r.Body)
		}
		n := 0
		for _, rec := range out.Records {
			if rec.Reason == reason && rec.Quantity == float64(qty) {
				n++
			}
		}
		if n != 1 {
			return fmt.Errorf("%d %q records of %d (want exactly 1); body: %s", n, reason, qty, r.Body)
		}
		return nil
	})

	// --- Reading the plan ---

	sc.Step(`^I view the plan$`, func() { w.Last = w.Client.Get("/api/plan") })
	sc.Step(`^I view the plan from `+planDate+` to `+planDate+`$`, func(from, to string) {
		w.Last = w.Client.Get(fmt.Sprintf("/api/plan?from=%s&to=%s", from, to))
	})
	sc.Step(`^the plan has (\d+) slots$`, func(n int) error {
		v, err := planJSON(w.Last.Body, "slots")
		if err != nil {
			return err
		}
		if got := len(v.([]any)); got != n {
			return fmt.Errorf("plan has %d slots, want %d", got, n)
		}
		return nil
	})
	sc.Step(`^every plan slot has a Planned Meal( that is not pinned)?$`, func(notPinned string) error {
		v, err := planJSON(w.Last.Body, "slots")
		if err != nil {
			return err
		}
		for _, s := range v.([]any) {
			m, _ := s.(map[string]any)["meal"].(map[string]any)
			if m == nil {
				return fmt.Errorf("slot without a Planned Meal: %v", s)
			}
			if notPinned != "" && m["pinned"] == true {
				return fmt.Errorf("meal is pinned: %v", m)
			}
		}
		return nil
	})
	sc.Step(`^the plan slot on `+planDate+` has ([0-9.]+) portions$`, func(date string, want float64) error {
		s, err := planSlot(date)
		if err != nil {
			return err
		}
		if s["portions"] != want {
			return fmt.Errorf("portions = %v, want %v", s["portions"], want)
		}
		return nil
	})
	sc.Step(`^the plan slot on `+planDate+` is empty$`, func(date string) error {
		m, err := mealOn(date)
		if err != nil {
			return err
		}
		if m != nil {
			return fmt.Errorf("slot on %s has a Planned Meal: %v", date, m)
		}
		return nil
	})
	sc.Step(`^the plan slot on `+planDate+` has a Planned Meal$`, func(date string) error {
		m, err := mealOn(date)
		if err != nil {
			return err
		}
		if m == nil {
			return fmt.Errorf("slot on %s is empty", date)
		}
		return nil
	})
	recipeIs := func(date, name string, want bool) error {
		m, err := mealOn(date)
		if err != nil {
			return err
		}
		if m == nil {
			return fmt.Errorf("slot on %s is empty", date)
		}
		if got := m["recipeName"] == name; got != want {
			return fmt.Errorf("slot on %s has the Recipe %v; want %q: %v", date, m["recipeName"], name, want)
		}
		return nil
	}
	sc.Step(`^the plan slot on `+planDate+` has the Recipe "([^"]*)"$`, func(d, n string) error { return recipeIs(d, n, true) })
	sc.Step(`^the plan slot on `+planDate+` does not have the Recipe "([^"]*)"$`, func(d, n string) error { return recipeIs(d, n, false) })
	sc.Step(`^the plan slot on `+planDate+` has the remembered Recipe$`, func(d string) error {
		return recipeIs(d, w.Vars["plan:remembered"].(string), true)
	})
	sc.Step(`^the plan slot on `+planDate+` does not have the remembered Recipe$`, func(d string) error {
		return recipeIs(d, w.Vars["plan:remembered"].(string), false)
	})
	sc.Step(`^the plan slot on `+planDate+` is (pinned|not pinned|planned|cooked|skipped)$`, func(date, what string) error {
		m, err := mealOn(date)
		if err != nil || m == nil {
			return fmt.Errorf("no Planned Meal on %s (%v)", date, err)
		}
		switch what {
		case "pinned", "not pinned":
			if (m["pinned"] == true) != (what == "pinned") {
				return fmt.Errorf("slot on %s: pinned = %v", date, m["pinned"])
			}
		default:
			if m["state"] != what {
				return fmt.Errorf("slot on %s: state = %v, want %s", date, m["state"], what)
			}
		}
		return nil
	})
	sc.Step(`^the plan slot on `+planDate+` is cooked fresh$`, func(date string) error {
		m, err := mealOn(date)
		if err != nil || m == nil {
			return fmt.Errorf("no Planned Meal on %s (%v)", date, err)
		}
		if m["servedFromLeftover"] != nil {
			return fmt.Errorf("slot on %s is served from a Leftover: %v", date, m["servedFromLeftover"])
		}
		return nil
	})
	sc.Step(`^the plan slot on `+planDate+` is served from the Leftover of `+planDate+`$`, func(date, from string) error {
		m, err := mealOn(date)
		if err != nil || m == nil {
			return fmt.Errorf("no Planned Meal on %s (%v)", date, err)
		}
		src, _ := m["servedFromLeftover"].(map[string]any)
		if src == nil || src["date"] != from {
			return fmt.Errorf("slot on %s servedFromLeftover = %v, want the meal of %s", date, m["servedFromLeftover"], from)
		}
		return nil
	})
	sc.Step(`^the plan slot on `+planDate+` has the why chip "([^"]*)"$`, func(date, code string) error {
		m, err := mealOn(date)
		if err != nil || m == nil {
			return fmt.Errorf("no Planned Meal on %s (%v)", date, err)
		}
		chips, _ := m["why"].([]any)
		for _, c := range chips {
			if c.(map[string]any)["code"] == code {
				return nil
			}
		}
		return fmt.Errorf("slot on %s has no %q why chip: %v", date, code, chips)
	})
	sc.Step(`^the plan slot on `+planDate+` could not be planned because "([^"]*)"$`, func(date, reason string) error {
		s, err := planSlot(date)
		if err != nil {
			return err
		}
		u, _ := s["unfilled"].(map[string]any)
		if u == nil || u["reason"] != reason {
			return fmt.Errorf("slot on %s unfilled = %v, want reason %q", date, s["unfilled"], reason)
		}
		return nil
	})
	sc.Step(`^the plan JSON "([^"]*)" is "([^"]*)"$`, func(path, want string) error {
		v, err := planJSON(w.Last.Body, path)
		if err != nil {
			return err
		}
		if got := fmt.Sprint(v); got != want {
			return fmt.Errorf("%s = %q, want %q; body: %s", path, got, want, w.Last.Body)
		}
		return nil
	})

	// --- Actions ---

	sc.Step(`^I pin the plan slot on `+planDate+` as "([^"]*)"$`, func(date, recipe string) error {
		if err := pin(date, recipe); err != nil {
			return err
		}
		return mustOK("pin " + date + " as " + recipe)
	})
	sc.Step(`^I try to pin the plan slot on `+planDate+` as "([^"]*)"$`, pin)
	sc.Step(`^I (confirm|unpin) the plan slot on `+planDate+`$`, func(verb, date string) error {
		path, err := slotPath(date, "/"+verb)
		if err != nil {
			return err
		}
		post(path, nil)
		return nil
	})
	sc.Step(`^I regenerate the plan$`, func() error {
		post("/api/plan/regenerate", nil)
		if err := mustOK("regenerate"); err != nil {
			return err
		}
		return settled()
	})
	sc.Step(`^nobody attends the Dinner on `+planDate+`$`, func(date string) error {
		slot, err := slotOn(date)
		if err != nil {
			return err
		}
		r := w.Client.Put(fmt.Sprintf("/api/meal-slots/%d/attendance?date=%s", slot, date), map[string]any{"attendance": []any{}})
		if r.Status != 200 {
			return fmt.Errorf("set Attendance: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^I ask for alternatives for the slot on `+planDate+`$`, func(date string) error {
		path, err := slotPath(date, "/alternatives")
		if err != nil {
			return err
		}
		w.Last = w.Client.Get(path)
		return nil
	})
	sc.Step(`^there are (\d+) alternatives$`, func(n int) error {
		v, err := planJSON(w.Last.Body, "alternatives")
		if err != nil {
			return err
		}
		if got := len(v.([]any)); got != n {
			return fmt.Errorf("%d alternatives, want %d", got, n)
		}
		return nil
	})
	sc.Step(`^none of the alternatives is the remembered Recipe$`, func() error {
		v, _ := planJSON(w.Last.Body, "alternatives")
		for _, a := range v.([]any) {
			if a.(map[string]any)["recipeName"] == w.Vars["plan:remembered"] {
				return fmt.Errorf("the current Recipe is offered as an alternative")
			}
		}
		return nil
	})
	sc.Step(`^no alternative is the Recipe "([^"]*)"$`, func(name string) error {
		v, err := planJSON(w.Last.Body, "alternatives")
		if err != nil {
			return err
		}
		for _, a := range v.([]any) {
			if a.(map[string]any)["recipeName"] == name {
				return fmt.Errorf("%q is offered as an alternative although it is reserved for a Slot Rule", name)
			}
		}
		return nil
	})
	sc.Step(`^every alternative has at least one why chip with a code$`, func() error {
		v, _ := planJSON(w.Last.Body, "alternatives")
		for _, a := range v.([]any) {
			chips, _ := a.(map[string]any)["why"].([]any)
			if len(chips) == 0 || chips[0].(map[string]any)["code"] == "" {
				return fmt.Errorf("alternative without a why chip: %v", a)
			}
		}
		return nil
	})
	sc.Step(`^Monday's dinner is marked Cooked$`, func() error {
		path, _ := slotPath("2026-11-09", "/cooked")
		post(path, map[string]any{})
		return mustOK("mark Monday's dinner Cooked")
	})
	sc.Step(`^I mark the slot on `+planDate+` as Cooked( with (\d+) Leftover portions)?$`, func(date, _, portions string) error {
		path, err := slotPath(date, "/cooked")
		if err != nil {
			return err
		}
		body := map[string]any{}
		if portions != "" {
			n, _ := strconv.ParseFloat(portions, 64)
			body["leftoverPortions"] = n
		}
		post(path, body)
		return nil
	})
	sc.Step(`^I mark the slot on `+planDate+` as Not cooked$`, func(date string) error {
		path, err := slotPath(date, "/not-cooked")
		if err != nil {
			return err
		}
		post(path, nil)
		return nil
	})
	// ---- Cook timers around Mark as Cooked (N4) ----
	cookTimers := func() ([]map[string]any, error) {
		r := w.Client.Get("/api/cook/timers")
		if r.Status != 200 {
			return nil, fmt.Errorf("GET /api/cook/timers: %d %s", r.Status, r.Body)
		}
		var out struct {
			Timers []map[string]any `json:"timers"`
		}
		return out.Timers, r.JSON(&out)
	}
	startCookTimer := func(body map[string]any) error {
		r := w.Client.Post("/api/cook/timers", body)
		if r.Status != 201 {
			return fmt.Errorf("start timer %v: %d %s", body, r.Status, r.Body)
		}
		return nil
	}
	sc.Step(`^I start the timer "([^"]*)" for (\d+) seconds on the meal of `+planDate+`$`, func(label string, secs int, date string) error {
		slot, err := slotOn(date)
		if err != nil {
			return err
		}
		return startCookTimer(map[string]any{"scope": fmt.Sprintf("meal:%s/%d", date, slot), "label": label, "durationSeconds": secs})
	})
	sc.Step(`^I start the free timer "([^"]*)" for (\d+) seconds$`, func(label string, secs int) error {
		return startCookTimer(map[string]any{"label": label, "durationSeconds": secs})
	})
	sc.Step(`^I pause the Cook timer "([^"]*)"$`, func(label string) error {
		l, err := cookTimers()
		if err != nil {
			return err
		}
		for _, t := range l {
			if t["label"] == label {
				if r := w.Client.Post(fmt.Sprintf("/api/cook/timers/%v/pause", t["id"]), nil); r.Status != 200 {
					return fmt.Errorf("pause %q: %d %s", label, r.Status, r.Body)
				}
				return nil
			}
		}
		return fmt.Errorf("no Cook timer %q", label)
	})
	sc.Step(`^the Cook timers are exactly "([^"]*)"$`, func(want string) error {
		l, err := cookTimers()
		if err != nil {
			return err
		}
		var got []string
		for _, t := range l {
			got = append(got, fmt.Sprint(t["label"]))
		}
		sort.Strings(got)
		wanted := []string{}
		for _, x := range strings.Split(want, ",") {
			wanted = append(wanted, strings.TrimSpace(x))
		}
		sort.Strings(wanted)
		if strings.Join(got, "|") != strings.Join(wanted, "|") {
			return fmt.Errorf("Cook timers = %v, want %v", got, wanted)
		}
		return nil
	})
	sc.Step(`^there are no Cook timers$`, func() error {
		l, err := cookTimers()
		if err != nil {
			return err
		}
		if len(l) != 0 {
			return fmt.Errorf("%d Cook timers left: %v", len(l), l)
		}
		return nil
	})
	// R11b: a meal stored before R10 has a Leftover id but no source date or slot (what Reconcile now fills in).
	sc.Step(`^the stored meal on `+planDate+` has lost its Leftover source date$`, func(date string) error {
		res, err := w.Env.DB.Exec(`UPDATE planned_meals SET from_date = '', from_meal_slot_id = 0 WHERE date = ? AND from_leftover_id IS NOT NULL`, date)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return fmt.Errorf("no stored meal on %s is served from a Leftover", date)
		}
		return nil
	})
	sc.Step(`^I preview Cooking the slot on `+planDate+`$`, func(date string) error {
		path, err := slotPath(date, "/cook")
		if err != nil {
			return err
		}
		w.Last = w.Client.Get(path)
		return nil
	})
	sc.Step(`^I list the meals to confirm$`, func() { w.Last = w.Client.Get("/api/plan/to-confirm") })
	sc.Step(`^the plan has no meals to confirm$`, func() error {
		v, err := planJSON(w.Last.Body, "slots")
		if err != nil {
			return err
		}
		if n := len(v.([]any)); n != 0 {
			return fmt.Errorf("%d meals to confirm, want none", n)
		}
		return nil
	})
	sc.Step(`^I list the slots the planner could not plan$`, func() { w.Last = w.Client.Get("/api/plan/couldnt-plan") })
	sc.Step(`^I list the Leftovers$`, func() { w.Last = w.Client.Get("/api/plan/leftovers") })
	sc.Step(`^the plan JSON "([^"]*)" has (\d+) items$`, func(path, n string) error {
		v, err := planJSON(w.Last.Body, path)
		if err != nil {
			return err
		}
		list, ok := v.([]any)
		if !ok {
			return fmt.Errorf("%s is not a list; body: %s", path, w.Last.Body)
		}
		if want, _ := strconv.Atoi(n); len(list) != want {
			return fmt.Errorf("%s has %d items, want %s; body: %s", path, len(list), n, w.Last.Body)
		}
		return nil
	})
	// B8: every "leftover_fits" why chip must name a day whose meal is really served from that chip's meal.
	sc.Step(`^no "leftover_fits" why chip names a day that is not served from its meal$`, func() error {
		r := w.Client.Get("/api/plan?from=2026-11-01&to=2026-12-31")
		slots, err := planJSON(r.Body, "slots")
		if err != nil {
			return err
		}
		list, _ := slots.([]any)
		servedFrom := map[string]string{} // "date/slot" of a dependant -> "date/slot" of its source
		for _, it := range list {
			sl := it.(map[string]any)
			m, _ := sl["meal"].(map[string]any)
			if m == nil {
				continue
			}
			if src, _ := m["servedFromLeftover"].(map[string]any); src != nil {
				servedFrom[fmt.Sprintf("%v/%v", sl["date"], sl["mealSlotId"])] = fmt.Sprintf("%v/%v", src["date"], src["mealSlotId"])
			}
		}
		for _, it := range list {
			sl := it.(map[string]any)
			m, _ := sl["meal"].(map[string]any)
			if m == nil {
				continue
			}
			chips, _ := m["why"].([]any)
			for _, c := range chips {
				chip := c.(map[string]any)
				if chip["code"] != "leftover_fits" {
					continue
				}
				me := fmt.Sprintf("%v/%v", sl["date"], sl["mealSlotId"])
				ok := false
				for dep, src := range servedFrom {
					if src == me && strings.HasPrefix(dep, fmt.Sprint(chip["date"])+"/") {
						ok = true
					}
				}
				if !ok {
					return fmt.Errorf("meal %s has a stale leftover_fits chip for %v; plan: %s", me, chip["date"], r.Body)
				}
			}
		}
		return nil
	})
	sc.Step(`^the plan has no Leftovers$`, func() error {
		v, err := planJSON(w.Last.Body, "leftovers")
		if err != nil {
			return err
		}
		if n := len(v.([]any)); n != 0 {
			return fmt.Errorf("%d Leftovers, want none", n)
		}
		return nil
	})

	// --- Slot Rules and Variety Rules ---

	fridayDinner := func() int64 { return id("slot", "5") }
	addRule := func(body map[string]any) {
		w.Last = w.Client.Post("/api/slot-rules", body)
		var v struct {
			ID int64 `json:"id"`
		}
		if w.Last.Status == 201 && w.Last.JSON(&v) == nil {
			w.Vars["plan:rule"] = v.ID
		}
	}
	sc.Step(`^I add a Slot Rule for the Dinner on Friday with the Tag "([^"]*)"$`, func(tag string) {
		addRule(map[string]any{"mealSlotId": fridayDinner(), "tag": tag})
	})
	sc.Step(`^I add a Slot Rule for the Dinner on Friday with the Recipe "([^"]*)"$`, func(name string) {
		addRule(map[string]any{"mealSlotId": fridayDinner(), "recipeId": recipeID(name)})
	})
	sc.Step(`^I add a Slot Rule with (both a Tag and a Recipe|neither a Tag nor a Recipe|an unknown Meal Slot|an unknown Recipe)$`, func(what string) {
		body := map[string]any{"mealSlotId": fridayDinner()}
		switch what {
		case "both a Tag and a Recipe":
			body["tag"], body["recipeId"] = "pizza", recipeID("curry")
		case "an unknown Meal Slot":
			body["mealSlotId"], body["tag"] = 99999, "pizza"
		case "an unknown Recipe":
			body["recipeId"] = 99999
		}
		addRule(body)
	})
	sc.Step(`^I list the Slot Rules$`, func() { w.Last = w.Client.Get("/api/slot-rules") })
	sc.Step(`^I remove that Slot Rule$`, func() {
		w.Last = w.Client.Delete(fmt.Sprintf("/api/slot-rules/%v", w.Vars["plan:rule"]))
	})
	variety := func(tag string, body any) { w.Last = w.Client.Put("/api/variety-rules/"+tag, body) }
	sc.Step(`^I set the Variety Rule "([^"]*)" to at most (\d+) per week$`, func(tag string, n int) {
		variety(tag, map[string]any{"maxPerWeek": n, "notConsecutiveDays": false})
	})
	sc.Step(`^I set the Variety Rule "([^"]*)" to never on consecutive days$`, func(tag string) {
		variety(tag, map[string]any{"maxPerWeek": 0, "notConsecutiveDays": true})
	})
	sc.Step(`^I set the Variety Rule "([^"]*)" with JSON (.+)$`, func(tag, body string) { variety(tag, []byte(body)) })
	sc.Step(`^I list the Variety Rules$`, func() { w.Last = w.Client.Get("/api/variety-rules") })
	sc.Step(`^I remove the Variety Rule "([^"]*)"$`, func(tag string) { w.Last = w.Client.Delete("/api/variety-rules/" + tag) })

	freshTagged := func(tag string) (map[string]bool, error) {
		v, err := planJSON(w.Last.Body, "slots")
		if err != nil {
			return nil, err
		}
		days := map[string]bool{}
		for _, s := range v.([]any) {
			slot := s.(map[string]any)
			m, _ := slot["meal"].(map[string]any)
			if m == nil || m["servedFromLeftover"] != nil {
				continue
			}
			tags, _ := w.Vars["plan:tags:"+fmt.Sprint(m["recipeName"])].([]string)
			for _, tg := range tags {
				if strings.EqualFold(strings.Join(strings.Fields(tg), " "), tag) {
					days[fmt.Sprint(slot["date"])] = true
				}
			}
		}
		return days, nil
	}
	sc.Step(`^the planned fresh meals tagged "([^"]*)" this week number at most (\d+)$`, func(tag string, max int) error {
		days, err := freshTagged(tag)
		if err != nil {
			return err
		}
		if len(days) > max {
			return fmt.Errorf("%d fresh %q meals in the week (%v), the rule allows %d", len(days), tag, days, max)
		}
		return nil
	})
	sc.Step(`^no two consecutive days both have a fresh meal tagged "([^"]*)"$`, func(tag string) error {
		days, err := freshTagged(tag)
		if err != nil {
			return err
		}
		for d := range days {
			t, _ := time.Parse("2006-01-02", d)
			if days[t.AddDate(0, 0, 1).Format("2006-01-02")] {
				return fmt.Errorf("%q meals on consecutive days %s and the next: %v", tag, d, days)
			}
		}
		return nil
	})
}

func jsonUnmarshal(b []byte, v any) error { return json.Unmarshal(b, v) }
