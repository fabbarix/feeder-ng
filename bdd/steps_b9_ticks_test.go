package bdd

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/cucumber/godog"
)

// B9-23 (SSP-01, SSP-02, RES-03): steps for bdd/features/shopping-scan/tick_additions.feature and offline_ticks.feature.
// They reuse the shopping-scan set for the household, Recipes, Products, Stock and the phone's queue and sync.

func init() { RegisterSteps("b9-ticks", b9TickSteps) }

func b9TickSteps(sc *godog.ScenarioContext, w *World) {
	ingID := func(name string) (int64, error) {
		if v, _ := w.Vars["ss:ingredient:"+name].(int64); v != 0 {
			return v, nil
		}
		return 0, fmt.Errorf("Ingredient %q was not set up in this scenario", name)
	}
	// fresh reads the Shopping List as the signed-in User sees it now.
	fresh := func() (map[string]any, error) {
		w.Ensure()
		r := w.Client.Get("/api/shopping/list")
		if r.Status != 200 {
			return nil, fmt.Errorf("GET /api/shopping/list: %d %s", r.Status, r.Body)
		}
		var doc map[string]any
		if err := json.Unmarshal(r.Body, &doc); err != nil {
			return nil, err
		}
		return doc, nil
	}
	lineFor := func(name string) (map[string]any, map[string]any, error) {
		doc, err := fresh()
		if err != nil {
			return nil, nil, err
		}
		arr, _ := doc["lines"].([]any)
		for _, x := range arr {
			if m, _ := x.(map[string]any); m != nil && strings.EqualFold(fmt.Sprint(m["name"]), name) {
				return m, doc, nil
			}
		}
		return nil, doc, fmt.Errorf("no Line for %q in %v", name, doc["lines"])
	}
	tickOf := func(name string) (map[string]any, error) {
		l, _, err := lineFor(name)
		if err != nil {
			return nil, err
		}
		t, _ := l["tick"].(map[string]any)
		if t == nil {
			return nil, fmt.Errorf("Line %q has no tick: %v", name, l)
		}
		return t, nil
	}
	postTick := func(name string, qty float64, uuid string) error {
		iid, err := ingID(name)
		if err != nil {
			return err
		}
		doc, err := fresh()
		if err != nil {
			return err
		}
		r := w.Client.Post("/api/shopping/ticks", map[string]any{"ingredientId": iid, "to": doc["to"], "quantity": qty, "clientUuid": uuid})
		if r.Status != 200 {
			return fmt.Errorf("tick %s: %d %s", name, r.Status, r.Body)
		}
		return nil
	}
	patchTick := func(name string, qty float64, uuid string) error {
		iid, err := ingID(name)
		if err != nil {
			return err
		}
		doc, err := fresh()
		if err != nil {
			return err
		}
		body := map[string]any{"ingredientId": iid, "to": doc["to"], "quantity": qty}
		if uuid != "" {
			body["clientUuid"] = uuid
		}
		w.Last = w.Client.Patch("/api/shopping/ticks", body)
		if w.Last.Status != 200 {
			return fmt.Errorf("PATCH /api/shopping/ticks: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	}

	sc.Step(`^I tick "([^"]*)" with the pack the Shopping List suggests$`, func(name string) error {
		l, _, err := lineFor(name)
		if err != nil {
			return err
		}
		// What the phone sends: the pack (count × size) when the Line has one, else what is still to get (the more of a ticked Line).
		qty := ssNum(l["quantity"])
		if more := ssNum(l["more"]); more > 0 {
			qty = more
		}
		if pack, _ := l["pack"].(map[string]any); pack != nil && ssNum(pack["count"]) > 0 {
			qty = ssNum(pack["count"]) * ssNum(pack["size"])
		}
		w.Vars["b9:tickn"] = ssNumInt(w.Vars["b9:tickn"]) + 1
		return postTick(name, qty, fmt.Sprintf("one-tap-%d", ssNumInt(w.Vars["b9:tickn"])))
	})
	sc.Step(`^I tick "([^"]*)" with (\d+) g as tick "([^"]*)"$`, func(name string, qty int, uuid string) error {
		return postTick(name, float64(qty), uuid)
	})
	sc.Step(`^I tick "([^"]*)" without adding Stock as tick "([^"]*)"$`, func(name, uuid string) error {
		return postTick(name, 0, uuid)
	})
	sc.Step(`^I change my tick of "([^"]*)" to (\d+) g$`, func(name string, qty int) error { return patchTick(name, float64(qty), "") })
	sc.Step(`^I take back what I added to "([^"]*)"$`, func(name string) error { return patchTick(name, 0, "") })

	sc.Step(`^the line "([^"]*)" says it added (\d+) g to Stock$`, func(name string, want int) error {
		t, err := tickOf(name)
		if err != nil {
			return err
		}
		if ssNum(t["added"]) != float64(want) {
			return fmt.Errorf("tick.added of %s = %v, want %d", name, t["added"], want)
		}
		return nil
	})
	sc.Step(`^the line "([^"]*)" says it added nothing to Stock$`, func(name string) error {
		t, err := tickOf(name)
		if err != nil {
			return err
		}
		if t["added"] != nil {
			return fmt.Errorf("tick.added of %s = %v, want null", name, t["added"])
		}
		return nil
	})
	sc.Step(`^the line "([^"]*)" was ticked by (hand|scan)$`, func(name, by string) error {
		l, _, err := lineFor(name)
		if err != nil {
			return err
		}
		t, _ := l["tick"].(map[string]any)
		if l["ticked"] != true || t == nil || t["by"] != by {
			return fmt.Errorf("Line %s = %v, want ticked by %s", name, l, by)
		}
		return nil
	})
	sc.Step(`^the line "([^"]*)" is open$`, func(name string) error {
		l, _, err := lineFor(name)
		if err != nil {
			return err
		}
		if l["ticked"] == true || l["tick"] != nil {
			return fmt.Errorf("Line %s = %v, want open with no tick", name, l)
		}
		return nil
	})
	sc.Step(`^the line "([^"]*)" has (\d+) additions?$`, func(name string, want int) error {
		t, err := tickOf(name)
		if err != nil {
			return err
		}
		if got := len(t["additions"].([]any)); got != want {
			return fmt.Errorf("Line %s has %d additions, want %d: %v", name, got, want, t["additions"])
		}
		return nil
	})
	sc.Step(`^the line "([^"]*)" is ticked and shows (\d+) g more since the tick$`, func(name string, want int) error {
		l, _, err := lineFor(name)
		if err != nil {
			return err
		}
		if l["ticked"] != true || ssNum(l["more"]) != float64(want) {
			return fmt.Errorf("Line %s = ticked %v more %v, want ticked with %d more", name, l["ticked"], l["more"], want)
		}
		return nil
	})
	sc.Step(`^the line "([^"]*)" shows nothing more since the tick$`, func(name string) error {
		l, _, err := lineFor(name)
		if err != nil {
			return err
		}
		if _, has := l["more"]; has {
			return fmt.Errorf("Line %s still has more: %v", name, l["more"])
		}
		return nil
	})
	sc.Step(`^the line "([^"]*)" has an addition of (\d+) g by "([^"]*)" that is (mine|not mine)$`, func(name string, qty int, who, mine string) error {
		t, err := tickOf(name)
		if err != nil {
			return err
		}
		for _, x := range t["additions"].([]any) {
			a, _ := x.(map[string]any)
			if a != nil && ssNum(a["quantity"]) == float64(qty) && a["who"] == who && (a["mine"] == true) == (mine == "mine") {
				return nil
			}
		}
		return fmt.Errorf("Line %s has no addition of %d g by %s that is %s: %v", name, qty, who, mine, t["additions"])
	})

	// --- the phone's queue (the shopping-scan set keeps it in Vars["ss:queue"] and sends it with "the phone syncs its queue") ---
	queue := func(op map[string]any) {
		ops, _ := w.Vars["ss:queue"].([]map[string]any)
		w.Vars["ss:queue"] = append(ops, op)
	}
	sc.Step(`^the phone queues a tick of "([^"]*)" for (\d+) g covering (\d+) g as "([^"]*)"$`, func(name string, qty, covers int, uuid string) error {
		iid, err := ingID(name)
		if err != nil {
			return err
		}
		doc, err := fresh()
		if err != nil {
			return err
		}
		shop, _ := w.Vars["ss:shop:Coop"].(int64)
		queue(map[string]any{"clientUuid": uuid, "kind": "shop_tick", "scannedAt": w.Ensure().Clock.Now().Add(-90 * time.Minute).Format(time.RFC3339),
			"shopId": shop, "ingredientId": iid, "quantity": qty, "covers": covers, "rangeTo": doc["to"]})
		return nil
	})
	sc.Step(`^the phone queues an untick of the tick "([^"]*)" as "([^"]*)"$`, func(tick, uuid string) error {
		queue(map[string]any{"clientUuid": uuid, "kind": "shop_untick", "scannedAt": w.Ensure().Clock.Now().Format(time.RFC3339), "tickClientUuid": tick})
		return nil
	})
	result := func(uuid string) (map[string]any, error) {
		r, ok := w.Vars["ss:result:"+uuid].(map[string]any)
		if !ok {
			return nil, fmt.Errorf("tick %q has no sync result in this scenario", uuid)
		}
		return r, nil
	}
	sc.Step(`^tick "([^"]*)" was (applied|a duplicate|rejected)$`, func(uuid, state string) error {
		r, err := result(uuid)
		if err != nil {
			return err
		}
		if want := map[string]string{"applied": "applied", "a duplicate": "duplicate", "rejected": "rejected"}[state]; r["status"] != want {
			return fmt.Errorf("tick %s status = %v, want %s: %v", uuid, r["status"], want, r)
		}
		return nil
	})
	sc.Step(`^tick "([^"]*)" was rejected with "([^"]*)"$`, func(uuid, code string) error {
		r, err := result(uuid)
		if err != nil {
			return err
		}
		e, _ := r["error"].(map[string]any)
		if r["status"] != "rejected" || e == nil || e["code"] != code {
			return fmt.Errorf("tick %s = %v, want rejected with %s", uuid, r, code)
		}
		return nil
	})
	sc.Step(`^tick "([^"]*)" says "([^"]*)" had also ticked it for (\d+) g$`, func(uuid, who string, qty int) error {
		r, err := result(uuid)
		if err != nil {
			return err
		}
		tk, _ := r["tick"].(map[string]any)
		also, _ := tk["alsoTickedBy"].([]any)
		for _, x := range also {
			a, _ := x.(map[string]any)
			if a != nil && a["name"] == who && ssNum(a["quantity"]) == float64(qty) {
				return nil
			}
		}
		return fmt.Errorf("tick %s alsoTickedBy = %v, want %s for %d g", uuid, also, who, qty)
	})
}

func ssNumInt(v any) int { n, _ := v.(int); return n }
