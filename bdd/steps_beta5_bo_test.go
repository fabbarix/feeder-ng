package bdd

import (
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/cucumber/godog"
)

// Step definitions for bdd/features/beta5/plan-stability.feature (team B5-BO; ADR 0013). They reuse the Shopping List
// set-up of steps_shopping_scan_test.go (household, Shop, Recipes, Products, scans, Stock) and its scenario variables
// "ss:slot:<weekday>", "ss:recipe:<name>", "ss:ingredient:<name>", "ss:shop:<name>" and "ss:result:<uuid>"; the plan
// is read through GET /api/plan, which carries "bought" and "warning" on the meal (docs/dev/design/b5-bo.md §8).

func init() { RegisterSteps("beta5-bo", beta5BoughtSteps) }

func beta5BoughtSteps(sc *godog.ScenarioContext, w *World) {
	id := func(kind, name string) int64 { v, _ := w.Vars["ss:"+kind+":"+name].(int64); return v }
	slotOn := func(date string) (int64, error) {
		wd, err := ssWeekday(date)
		if err != nil {
			return 0, err
		}
		v := id("slot", strconv.Itoa(wd))
		if v == 0 {
			return 0, fmt.Errorf("no Dinner Meal Slot on %s was set up", date)
		}
		return v, nil
	}
	settle := func() error {
		w.Ensure()
		deadline := time.Now().Add(5 * time.Second)
		quiet := 0
		for time.Now().Before(deadline) {
			r := w.Client.Get("/api/plan?from=2000-01-01&to=2000-01-01")
			if v, err := ssPath(r.Body, "updating"); r.Status == 200 && err == nil && v == false {
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
	// meal is the main Course's Planned Meal of the Dinner on the date (nil when the cell is empty).
	meal := func(date string) (map[string]any, error) {
		w.Ensure()
		r := w.Client.Get("/api/plan?from=" + date + "&to=" + date)
		if r.Status != 200 {
			return nil, fmt.Errorf("GET /api/plan: %d %s", r.Status, r.Body)
		}
		var doc struct {
			Slots []struct {
				Courses []map[string]any `json:"courses"`
			} `json:"slots"`
		}
		if err := json.Unmarshal(r.Body, &doc); err != nil {
			return nil, err
		}
		if len(doc.Slots) != 1 {
			return nil, fmt.Errorf("the plan has %d slots on %s: %s", len(doc.Slots), date, r.Body)
		}
		main := float64(mainCourseID(w))
		for _, c := range doc.Slots[0].Courses {
			if c["courseId"] == main {
				m, _ := c["meal"].(map[string]any)
				return m, nil
			}
		}
		return nil, fmt.Errorf("no main Course on %s: %s", date, r.Body)
	}
	boughtNames := func(m map[string]any) []string {
		b, _ := m["bought"].(map[string]any)
		var out []string
		arr, _ := b["ingredients"].([]any)
		for _, x := range arr {
			if ing, ok := x.(map[string]any); ok {
				out = append(out, fmt.Sprint(ing["name"]))
			}
		}
		sort.Strings(out)
		return out
	}
	needMeal := func(date string) (map[string]any, error) {
		m, err := meal(date)
		if err == nil && m == nil {
			err = fmt.Errorf("the Dinner of %s has no Planned Meal", date)
		}
		return m, err
	}

	// --- Set-up ---

	sc.Step(`^the planned dinners:$`, func(table *godog.Table) error {
		w.Ensure()
		for _, row := range table.Rows[1:] {
			date, recipe := strings.TrimSpace(row.Cells[0].Value), strings.TrimSpace(row.Cells[1].Value)
			batches, _ := strconv.ParseFloat(strings.TrimSpace(row.Cells[2].Value), 64)
			slot, err := slotOn(date)
			if err != nil {
				return err
			}
			base := fmt.Sprintf("/api/plan/%s/%d/%d", date, slot, mainCourseID(w))
			// Choose the Recipe (which Pins it), then Unpin: an ordinary Planned Meal the planner keeps while it is valid.
			if r := w.Client.Put(base, map[string]any{"recipeId": id("recipe", recipe), "batches": batches}); r.Status != 200 {
				return fmt.Errorf("set %s on %s: %d %s", recipe, date, r.Status, r.Body)
			}
			if r := w.Client.Post(base+"/unpin", nil); r.Status != 200 {
				return fmt.Errorf("unpin %s: %d %s", date, r.Status, r.Body)
			}
		}
		return settle()
	})
	sc.Step(`^the shopping planner has finished$`, settle)
	sc.Step(`^every shopping Recipe except "([^"]*)" is archived$`, func(keep string) error {
		w.Ensure()
		for k, v := range w.Vars {
			name, ok := strings.CutPrefix(k, "ss:recipe:")
			if !ok || name == keep {
				continue
			}
			if r := w.Client.Post(fmt.Sprintf("/api/recipes/%d/archive", v.(int64)), nil); r.Status != 200 {
				return fmt.Errorf("archive %s: %d %s", name, r.Status, r.Body)
			}
		}
		return nil
	})
	sc.Step(`^I (archive|unarchive) the shopping Recipe "([^"]*)"$`, func(verb, name string) error {
		w.Ensure()
		r := w.Client.Post(fmt.Sprintf("/api/recipes/%d/%s", id("recipe", name), verb), nil)
		if r.Status != 200 {
			return fmt.Errorf("%s %s: %d %s", verb, name, r.Status, r.Body)
		}
		return nil
	})
	// The real path of ADR 0013's "a Recipe edit leaves a Bought Planned Meal in place": PUT /api/recipes/{id} with the Side Course
	// instead of the main one (the stored Recipe read back, so only the Courses change).
	sc.Step(`^I take the main Course off the shopping Recipe "([^"]*)"$`, func(name string) error {
		c := w.Ensure().LoginAdmin(w.TB)
		url := fmt.Sprintf("/api/recipes/%d", id("recipe", name))
		g := c.Get(url)
		var body map[string]any
		if g.Status != 200 || g.JSON(&body) != nil {
			return fmt.Errorf("GET %s: %d %s", url, g.Status, g.Body)
		}
		var side int64
		if err := w.Ensure().DB.QueryRow(`SELECT id FROM courses WHERE is_main = 0 AND archived = 0 ORDER BY position LIMIT 1`).Scan(&side); err != nil {
			return err
		}
		body["courseIds"] = []int64{side}
		w.Last = c.Put(url, body)
		if w.Last.Status != 200 {
			return fmt.Errorf("PUT %s: %d %s", url, w.Last.Status, w.Last.Body)
		}
		return settle()
	})
	sc.Step(`^the shopping Recipe "([^"]*)" carries the Tag "([^"]*)"$`, func(recipe, tag string) error {
		db := w.Ensure().DB
		if _, err := db.Exec(`INSERT OR IGNORE INTO tags (key, name, colour) VALUES (?, ?, 'tomato')`, tgKey(tag), tag); err != nil {
			return err
		}
		var tid int64
		if err := db.QueryRow(`SELECT id FROM tags WHERE key = ?`, tgKey(tag)).Scan(&tid); err != nil {
			return err
		}
		_, err := db.Exec(`INSERT INTO recipe_tags (recipe_id, tag_id, position) VALUES (?, ?, 0)`, id("recipe", recipe), tid)
		return err
	})
	sc.Step(`^I add a Slot Rule for the shopping Dinner on `+ssDate+` with the Tag "([^"]*)"$`, func(date, tag string) error {
		slot, err := slotOn(date)
		if err != nil {
			return err
		}
		w.Last = w.Ensure().LoginUser(w.TB).Post("/api/slot-rules", map[string]any{"mealSlotId": slot, "courseId": mainCourseID(w), "tag": tag})
		if w.Last.Status != 201 && w.Last.Status != 200 {
			return fmt.Errorf("add the Slot Rule: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^I scan the barcode "([^"]*)" at "([^"]*)" as scan "([^"]*)" for the range ending `+ssDate+`$`, func(code, shop, uuid, rangeTo string) error {
		w.Ensure()
		sid := id("shop", shop)
		r := w.Client.Get("/api/resolve?barcode=" + url.QueryEscape(code) + fmt.Sprintf("&shop=%d", sid))
		var doc map[string]any
		if r.Status != 200 || json.Unmarshal(r.Body, &doc) != nil {
			return fmt.Errorf("resolve %s: %d %s", code, r.Status, r.Body)
		}
		res, _ := doc["resolution"].(map[string]any)
		prod, _ := doc["product"].(map[string]any)
		if res["outcome"] != "product" {
			return fmt.Errorf("barcode %s resolves to %v, not a Product", code, res["outcome"])
		}
		op := map[string]any{"clientUuid": uuid, "scannedAt": w.Env.Clock.Now().Format(time.RFC3339), "kind": "shop_scan",
			"shopId": sid, "productId": res["productId"], "quantity": prod["packSize"], "rangeTo": rangeTo}
		w.Last = w.Client.Post("/api/scan", op)
		var out map[string]any
		_ = json.Unmarshal(w.Last.Body, &out)
		w.Vars["ss:result:"+uuid] = out
		if w.Last.Status != 200 {
			return fmt.Errorf("scan %s: %d %s", uuid, w.Last.Status, w.Last.Body)
		}
		return nil
	})

	// --- Actions ---

	sc.Step(`^I swap the Dinner of `+ssDate+` to "([^"]*)"$`, func(date, recipe string) error {
		slot, err := slotOn(date)
		if err != nil {
			return err
		}
		w.Last = w.Client.Put(fmt.Sprintf("/api/plan/%s/%d/%d", date, slot, mainCourseID(w)), map[string]any{"recipeId": id("recipe", recipe)})
		if w.Last.Status != 200 {
			return fmt.Errorf("swap to %s: %d %s", recipe, w.Last.Status, w.Last.Body)
		}
		return settle()
	})
	sc.Step(`^I pin the Dinner of `+ssDate+`$`, func(date string) error {
		slot, err := slotOn(date)
		if err != nil {
			return err
		}
		w.Last = w.Client.Post(fmt.Sprintf("/api/plan/%s/%d/%d/confirm", date, slot, mainCourseID(w)), nil)
		if w.Last.Status != 200 {
			return fmt.Errorf("pin %s: %d %s", date, w.Last.Status, w.Last.Body)
		}
		return settle()
	})
	sc.Step(`^I ask what Regenerate would replace$`, func() error {
		w.Ensure()
		w.Last = w.Client.Post("/api/plan/regenerate?dryRun=1", nil)
		if w.Last.Status != 200 {
			return fmt.Errorf("Regenerate dry run: %d %s", w.Last.Status, w.Last.Body)
		}
		var doc map[string]any
		_ = json.Unmarshal(w.Last.Body, &doc)
		w.Vars["bo:dryrun"] = doc
		return nil
	})

	// --- Assertions ---

	dryRun := func() (map[string]any, error) {
		d, ok := w.Vars["bo:dryrun"].(map[string]any)
		if !ok {
			return nil, fmt.Errorf("Regenerate's dry run was not asked for in this scenario")
		}
		return d, nil
	}
	sc.Step(`^Regenerate would replace (\d+) Planned Meals?$`, func(want int) error {
		d, err := dryRun()
		if err != nil {
			return err
		}
		if got, _ := d["replaces"].(float64); int(got) != want {
			return fmt.Errorf("Regenerate would replace %v, want %d: %s", d["replaces"], want, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^Regenerate would name (\d+) Bought Planned Meals?$`, func(want int) error {
		d, err := dryRun()
		if err != nil {
			return err
		}
		list, ok := d["bought"].([]any)
		if !ok {
			return fmt.Errorf("the dry run has no \"bought\" list: %s", w.Last.Body)
		}
		if len(list) != want {
			return fmt.Errorf("Regenerate would name %d Bought Planned Meals, want %d: %s", len(list), want, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^Regenerate would name the Dinner of `+ssDate+` as Bought with "([^"]*)"$`, func(date, ings string) error {
		d, err := dryRun()
		if err != nil {
			return err
		}
		list, _ := d["bought"].([]any)
		for _, x := range list {
			e, _ := x.(map[string]any)
			if e["date"] != date || e["mealSlotName"] != "Dinner" {
				continue
			}
			var got []string
			for _, n := range e["ingredients"].([]any) {
				got = append(got, fmt.Sprint(n))
			}
			if strings.Join(got, ", ") != ings {
				return fmt.Errorf("the dry run names %v for %s, want %q", got, date, ings)
			}
			return nil
		}
		return fmt.Errorf("the dry run does not name the Dinner of %s: %s", date, w.Last.Body)
	})
	sc.Step(`^the Dinner of `+ssDate+` is Bought for "([^"]*)"$`, func(date, ings string) error {
		m, err := needMeal(date)
		if err != nil {
			return err
		}
		got := boughtNames(m)
		want := strings.Split(ings, ", ")
		sort.Strings(want)
		if strings.Join(got, ", ") != strings.Join(want, ", ") {
			return fmt.Errorf("the Dinner of %s is Bought for %v, want %v (meal %v)", date, got, want, m)
		}
		return nil
	})
	sc.Step(`^the Dinner of `+ssDate+` is not Bought$`, func(date string) error {
		m, err := meal(date)
		if err != nil {
			return err
		}
		if m == nil {
			return nil
		}
		if _, ok := m["bought"]; !ok {
			return fmt.Errorf("the meal has no \"bought\" field at all (null when not Bought): %v", m)
		}
		if m["bought"] != nil {
			return fmt.Errorf("the Dinner of %s is Bought: %v", date, m["bought"])
		}
		return nil
	})
	sc.Step(`^the Dinner of `+ssDate+` is (not )?"([^"]*)"$`, func(date, not, recipe string) error {
		m, err := needMeal(date)
		if err != nil {
			return err
		}
		is := m["recipeName"] == recipe
		if is == (not != "") {
			return fmt.Errorf("the Dinner of %s is %q (want %s%q)", date, m["recipeName"], not, recipe)
		}
		return nil
	})
	sc.Step(`^the Dinner of `+ssDate+` has the warning "([^"]*)"$`, func(date, code string) error {
		m, err := needMeal(date)
		if err != nil {
			return err
		}
		wn, _ := m["warning"].(map[string]any)
		if wn == nil || wn["code"] != code {
			return fmt.Errorf("the Dinner of %s has the warning %v, want %q", date, m["warning"], code)
		}
		return nil
	})
}
