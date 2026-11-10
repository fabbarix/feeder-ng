package bdd

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("shopping-scan", shoppingScanSteps) }

const ssDate = `(\d{4}-\d{2}-\d{2})`

// ssPath walks a JSON document by dotted path (a number indexes an array).
func ssPath(body []byte, path string) (any, error) {
	var cur any
	if err := json.Unmarshal(body, &cur); err != nil {
		return nil, fmt.Errorf("response is not JSON: %v; body: %s", err, body)
	}
	if path == "" {
		return cur, nil
	}
	for _, key := range strings.Split(path, ".") {
		switch n := cur.(type) {
		case map[string]any:
			v, ok := n[key]
			if !ok {
				return nil, fmt.Errorf("key %q missing (path %q); body: %s", key, path, body)
			}
			cur = v
		case []any:
			i, err := strconv.Atoi(key)
			if err != nil || i < 0 || i >= len(n) {
				return nil, fmt.Errorf("index %q out of range (path %q)", key, path)
			}
			cur = n[i]
		default:
			return nil, fmt.Errorf("cannot descend into %v at %q", cur, key)
		}
	}
	return cur, nil
}

func ssNum(v any) float64 { f, _ := v.(float64); return f }

// ssGTIN14 left-pads a barcode with zeros to the canonical GTIN-14 form (what a phone sends).
func ssGTIN14(code string) string {
	for len(code) < 14 {
		code = "0" + code
	}
	return code
}

// ssWeekday maps a date to the 1 (Monday) .. 7 (Sunday) weekday the Meal Slots use.
func ssWeekday(date string) (int, error) {
	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		return 0, err
	}
	wd := int(d.Weekday())
	if wd == 0 {
		wd = 7
	}
	return wd, nil
}

func shoppingScanSteps(sc *godog.ScenarioContext, w *World) {
	admin := func() *testkit.Client { return w.Ensure().LoginAdmin(w.TB) }
	id := func(kind, name string) int64 { v, _ := w.Vars["ss:"+kind+":"+name].(int64); return v }
	created := func(r *testkit.Response, what string) (int64, error) {
		var v struct {
			ID int64 `json:"id"`
		}
		if (r.Status != 200 && r.Status != 201) || r.JSON(&v) != nil || v.ID == 0 {
			return 0, fmt.Errorf("%s: %d %s", what, r.Status, r.Body)
		}
		return v.ID, nil
	}
	ingredient := func(name, base string, shelf int) (int64, error) {
		if v := id("ingredient", name); v != 0 {
			return v, nil
		}
		body := map[string]any{"name": name, "baseUnit": base}
		if shelf > 0 {
			body["shelfLifeDays"] = shelf
		}
		n, err := created(w.Ensure().LoginUser(w.TB).Post("/api/ingredients", body), "create Ingredient "+name)
		if err == nil {
			w.Vars["ss:ingredient:"+name] = n
		}
		return n, err
	}
	shopID := func(name string) (int64, error) {
		if v := id("shop", name); v != 0 {
			return v, nil
		}
		return 0, fmt.Errorf("Shop %q was not set up in this scenario", name)
	}
	productID := func(name string) (int64, error) {
		if v := id("product", name); v != 0 {
			return v, nil
		}
		// A Product a scan created was never registered by a step: look it up by its name.
		var all []struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		}
		if err := w.Ensure().LoginUser(w.TB).Get("/api/products?q=" + url.QueryEscape(name)).JSON(&all); err == nil {
			for _, p := range all {
				if p.Name == name {
					w.Vars["ss:product:"+name] = p.ID
					return p.ID, nil
				}
			}
		}
		return 0, fmt.Errorf("Product %q was not set up in this scenario", name)
	}
	today := func() string { return w.Ensure().Clock.Now().Format("2006-01-02") }
	me := func() *testkit.Client { w.Ensure(); return w.Client }

	// view fetches the Shopping List and keeps it in w.Last and Vars["ss:list"].
	view := func(shop, until string) error {
		path := "/api/shopping/list"
		q := url.Values{}
		if shop != "" {
			sid, err := shopID(shop)
			if err != nil {
				return err
			}
			q.Set("shop", strconv.FormatInt(sid, 10))
		}
		if until != "" {
			q.Set("to", until)
		}
		if len(q) > 0 {
			path += "?" + q.Encode()
		}
		w.Last = me().Get(path)
		if w.Last.Status != 200 {
			return fmt.Errorf("GET %s: %d %s", path, w.Last.Status, w.Last.Body)
		}
		var doc map[string]any
		_ = json.Unmarshal(w.Last.Body, &doc)
		w.Vars["ss:list"] = doc
		return nil
	}
	list := func() (map[string]any, error) {
		if l, ok := w.Vars["ss:list"].(map[string]any); ok {
			return l, nil
		}
		return nil, fmt.Errorf("no Shopping List was viewed in this scenario")
	}
	defaultTo := func() (string, error) {
		if err := view("", ""); err != nil {
			return "", err
		}
		l, _ := list()
		to, _ := l["to"].(string)
		return to, nil
	}
	items := func(key string) []map[string]any {
		l, err := list()
		if err != nil {
			return nil
		}
		var out []map[string]any
		arr, _ := l[key].([]any)
		for _, x := range arr {
			if m, ok := x.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	}
	lineNamed := func(name string) map[string]any {
		for _, m := range items("lines") {
			if strings.EqualFold(fmt.Sprint(m["name"]), name) {
				return m
			}
		}
		return nil
	}
	extraNamed := func(name string) map[string]any {
		for _, m := range items("extras") {
			if strings.EqualFold(fmt.Sprint(m["name"]), name) || strings.EqualFold(fmt.Sprint(m["text"]), name) {
				return m
			}
		}
		return nil
	}

	// --- Household, catalogue and plan set-up ---

	sc.Step(`^the shopping household has a Shop "([^"]*)"$`, func(name string) error {
		n, err := created(admin().Post("/api/shops", map[string]any{"name": name}), "create Shop "+name)
		if err == nil {
			w.Vars["ss:shop:"+name] = n
		}
		return err
	})
	sc.Step(`^the shopping household has the Ingredient "([^"]*)" in (g|ml|piece)(?: with a Shelf Life of (\d+) days)?$`, func(name, base, shelf string) error {
		n, _ := strconv.Atoi(shelf)
		_, err := ingredient(name, base, n)
		return err
	})
	product := func(name, ing, base string, size int, barcode string) error {
		iid, err := ingredient(ing, base, 0)
		if err != nil {
			return err
		}
		body := map[string]any{"name": name, "ingredientId": iid, "packSize": size}
		if barcode != "" {
			body["barcodes"] = []string{barcode}
		}
		n, err := created(me().Post("/api/products", body), "create Product "+name)
		if err == nil {
			w.Vars["ss:product:"+name] = n
		}
		return err
	}
	sc.Step(`^the shopping catalogue has the Product "([^"]*)" of "([^"]*)" in (g|ml|piece) with pack size (\d+) and barcode "([^"]*)"$`, func(name, ing, base string, size int, code string) error {
		return product(name, ing, base, size, code)
	})
	sc.Step(`^the shopping catalogue has the Product "([^"]*)" of "([^"]*)" in (g|ml|piece) with pack size (\d+) and no barcode$`, func(name, ing, base string, size int) error {
		return product(name, ing, base, size, "")
	})
	sc.Step(`^"([^"]*)" has a Price of (\d+) cents at "([^"]*)"$`, func(prod string, cents int, shop string) error {
		pid, err := productID(prod)
		if err != nil {
			return err
		}
		sid, err := shopID(shop)
		if err != nil {
			return err
		}
		r := me().Put(fmt.Sprintf("/api/products/%d/prices", pid), map[string]any{"shopId": sid, "date": "2026-11-02", "priceCents": cents})
		if r.Status != 200 {
			return fmt.Errorf("record Price: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the household last bought "([^"]*)" at "([^"]*)"$`, func(prod, shop string) error {
		pid, err := productID(prod)
		if err != nil {
			return err
		}
		sid, err := shopID(shop)
		if err != nil {
			return err
		}
		if r := me().Post("/api/purchases", map[string]any{"productId": pid, "shopId": sid, "date": today()}); r.Status != 201 {
			return fmt.Errorf("record purchase: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the Shop "([^"]*)" has a weight rule with prefix "(\d+)" reading a (weight in grams|price in cents)$`, func(shop, prefix, kind string) error {
		sid, err := shopID(shop)
		if err != nil {
			return err
		}
		body := map[string]any{"prefix": prefix, "item": map[string]any{"start": 3, "length": 5}, "value": map[string]any{"start": 8, "length": 5}, "decimalPlaces": 0}
		if strings.HasPrefix(kind, "weight") {
			body["valueKind"], body["valueUnit"] = "weight", "g"
		} else {
			body["valueKind"] = "price"
		}
		n, err := created(admin().Post(fmt.Sprintf("/api/shops/%d/weight-rules", sid), body), "create weight rule")
		if err == nil {
			w.Vars["ss:rule:"+shop+":"+prefix] = n
		}
		return err
	})
	sc.Step(`^the weight rule "(\d+)" of "([^"]*)" knows "([^"]*)" as item "(\d+)"$`, func(prefix, shop, prod, item string) error {
		sid, err := shopID(shop)
		if err != nil {
			return err
		}
		pid, err := productID(prod)
		if err != nil {
			return err
		}
		rule := id("rule", shop+":"+prefix)
		r := me().Post(fmt.Sprintf("/api/shops/%d/barcodes", sid), map[string]any{"productId": pid, "ruleId": rule, "itemCode": item})
		if r.Status != 201 {
			return fmt.Errorf("add weighed Shop Barcode: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the shopping Stock holds (\d+) (?:g|ml|piece) of "([^"]*)" bought on `+ssDate+`$`, func(qty int, name, date string) error {
		iid := id("ingredient", name)
		if iid == 0 {
			return fmt.Errorf("Ingredient %q was not set up", name)
		}
		r := me().Post("/api/stock/lots", map[string]any{"ingredientId": iid, "quantity": qty, "purchased": date})
		if r.Status != 201 {
			return fmt.Errorf("add a Stock Lot: %d %s", r.Status, r.Body)
		}
		return nil
	})

	// Plan fixtures go through the Planning API (T11).
	sc.Step(`^the shopping household has a Dinner at (\d\d:\d\d) every day$`, func(at string) error {
		m, err := created(admin().Post("/api/members", map[string]any{"name": "Anna", "colour": "#3366cc", "portionFactor": 1}), "create Member")
		if err != nil {
			return err
		}
		for wd := 1; wd <= 7; wd++ {
			r := admin().Post("/api/meal-slots", map[string]any{"weekday": wd, "name": "Dinner", "time": at, "attendance": []map[string]any{{"memberId": m}}})
			n, err := created(r, "create the Dinner Meal Slot")
			if err != nil {
				return err
			}
			w.Vars["ss:slot:"+strconv.Itoa(wd)] = n
		}
		return nil
	})
	sc.Step(`^the shopping household plans (\d+) days ahead$`, func(days int) error {
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
	sc.Step(`^the shopping Recipes:$`, func(table *godog.Table) error {
		for _, row := range table.Rows[1:] {
			cell := func(i int) string { return strings.TrimSpace(row.Cells[i].Value) }
			yield, _ := strconv.ParseFloat(cell(1), 64)
			var lines []map[string]any
			for _, part := range strings.Split(cell(2), ",") {
				part = strings.TrimSpace(part)
				optional := strings.HasSuffix(part, "(optional)")
				part = strings.TrimSpace(strings.TrimSuffix(part, "(optional)"))
				f := strings.SplitN(part, " ", 3) // "400 g chicken thighs"
				if len(f) != 3 {
					return fmt.Errorf("bad needs entry %q (want \"400 g flour\")", part)
				}
				qty, _ := strconv.ParseFloat(f[0], 64)
				iid, err := ingredient(f[2], "g", 0)
				if err != nil {
					return err
				}
				lines = append(lines, map[string]any{"ingredientId": iid, "quantity": qty, "unit": f[1], "optional": optional})
			}
			n, err := created(admin().Post("/api/recipes", map[string]any{"name": cell(0), "yield": yield, "tags": []string{}, "lines": lines}), "create Recipe "+cell(0))
			if err != nil {
				return err
			}
			w.Vars["ss:recipe:"+cell(0)] = n
		}
		return nil
	})
	sc.Step(`^the shopping dinners are pinned:$`, func(table *godog.Table) error {
		for _, row := range table.Rows[1:] {
			date, recipe := strings.TrimSpace(row.Cells[0].Value), strings.TrimSpace(row.Cells[1].Value)
			batches, _ := strconv.ParseFloat(strings.TrimSpace(row.Cells[2].Value), 64)
			wd, err := ssWeekday(date)
			if err != nil {
				return err
			}
			r := me().Put(fmt.Sprintf("/api/plan/%s/%d", date, id("slot", strconv.Itoa(wd))), map[string]any{"recipeId": id("recipe", recipe), "batches": batches})
			if r.Status != 200 {
				return fmt.Errorf("pin %s on %s: %d %s", recipe, date, r.Status, r.Body)
			}
		}
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) { // the planner finishes in the background
			r := me().Get("/api/plan?from=2000-01-01&to=2000-01-01")
			if v, err := ssPath(r.Body, "updating"); r.Status == 200 && err == nil && v == false {
				return nil
			}
			time.Sleep(30 * time.Millisecond)
		}
		return fmt.Errorf("the planner did not finish within 5 s")
	})

	// --- Viewing and editing the Shopping List ---

	sc.Step(`^I view the Shopping List(?: at "([^"]*)")?(?: until `+ssDate+`)?$`, func(shop, until string) error { return view(shop, until) })
	sc.Step(`^I add the Shopping List extra "([^"]*)"$`, func(text string) error {
		w.Last = me().Post("/api/shopping/extras", map[string]any{"text": text})
		if w.Last.Status != 201 {
			return fmt.Errorf("add extra: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^I add the Shopping List extra of (\d+) (?:g|ml|piece) of "([^"]*)"$`, func(qty int, name string) error {
		iid, err := ingredient(name, map[bool]string{true: "ml", false: "g"}[name == "milk"], 0)
		if err != nil {
			return err
		}
		w.Last = me().Post("/api/shopping/extras", map[string]any{"ingredientId": iid, "quantity": qty})
		if w.Last.Status != 201 {
			return fmt.Errorf("add extra: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^I tick the Shopping List extra "([^"]*)"$`, func(name string) error {
		if err := view("", ""); err != nil {
			return err
		}
		x := extraNamed(name)
		if x == nil {
			return fmt.Errorf("no extra %q in %s", name, w.Last.Body)
		}
		w.Last = me().Post(fmt.Sprintf("/api/shopping/extras/%d/tick", int64(ssNum(x["id"]))), map[string]any{})
		if w.Last.Status != 200 {
			return fmt.Errorf("tick extra: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^I tick "([^"]*)" on the Shopping List by hand with (\d+) (?:g|ml|piece)$`, func(name string, qty int) error {
		iid := id("ingredient", name)
		to, err := defaultTo()
		if err != nil {
			return err
		}
		w.Last = me().Post("/api/shopping/ticks", map[string]any{"ingredientId": iid, "to": to, "quantity": qty})
		if w.Last.Status != 200 {
			return fmt.Errorf("tick by hand: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^I untick "([^"]*)" on the Shopping List$`, func(name string) error {
		to, err := defaultTo()
		if err != nil {
			return err
		}
		w.Last = me().Delete(fmt.Sprintf("/api/shopping/ticks?ingredientId=%d&to=%s", id("ingredient", name), to))
		if w.Last.Status != 204 {
			return fmt.Errorf("untick: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})

	// --- Reading the Shopping List ---

	sc.Step(`^the Shopping List needs (\d+) (?:g|ml|piece) of "([^"]*)"$`, func(want int, name string) error {
		l := lineNamed(name)
		if l == nil {
			return fmt.Errorf("no Line for %q in %s", name, w.Last.Body)
		}
		if ssNum(l["quantity"]) != float64(want) {
			return fmt.Errorf("%s: quantity %v, want %d", name, l["quantity"], want)
		}
		return nil
	})
	sc.Step(`^the Shopping List has no line for "([^"]*)"$`, func(name string) error {
		if l := lineNamed(name); l != nil {
			return fmt.Errorf("unexpected Line for %q: %v", name, l)
		}
		return nil
	})
	sc.Step(`^the Shopping List range ends on `+ssDate+`$`, func(want string) error {
		l, err := list()
		if err != nil {
			return err
		}
		if l["to"] != want {
			return fmt.Errorf("range ends on %v, want %s", l["to"], want)
		}
		return nil
	})
	sc.Step(`^the Shopping List suggests (\d+) × "([^"]*)" for "([^"]*)"$`, func(count int, prod, name string) error {
		l := lineNamed(name)
		if l == nil {
			return fmt.Errorf("no Line for %q", name)
		}
		pack, _ := l["pack"].(map[string]any)
		if pack == nil || ssNum(pack["count"]) != float64(count) || pack["name"] != prod {
			return fmt.Errorf("pack for %s = %v, want %d × %s", name, l["pack"], count, prod)
		}
		return nil
	})
	sc.Step(`^the Shopping List shows no pack for "([^"]*)"$`, func(name string) error {
		l := lineNamed(name)
		if l == nil || l["pack"] != nil {
			return fmt.Errorf("Line %q = %v, want a Line without a pack", name, l)
		}
		return nil
	})
	sc.Step(`^the line "([^"]*)" has an estimated cost of (\d+) cents$`, func(name string, want int) error {
		l := lineNamed(name)
		if l == nil || ssNum(l["estimatedCostCents"]) != float64(want) {
			return fmt.Errorf("Line %q = %v, want estimated cost %d", name, l, want)
		}
		return nil
	})
	sc.Step(`^the line "([^"]*)" has no price$`, func(name string) error {
		l := lineNamed(name)
		if l == nil || l["estimatedCostCents"] != nil {
			return fmt.Errorf("Line %q = %v, want no estimated cost", name, l)
		}
		return nil
	})
	sc.Step(`^the Shopping List estimates (\d+) cents$`, func(want int) error {
		l, err := list()
		if err != nil {
			return err
		}
		if ssNum(l["estimatedCostCents"]) != float64(want) {
			return fmt.Errorf("estimated cost %v, want %d", l["estimatedCostCents"], want)
		}
		return nil
	})
	sc.Step(`^the Shopping List shows the extra "([^"]*)"$`, func(text string) error {
		if extraNamed(text) == nil {
			return fmt.Errorf("no extra %q in %s", text, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Shopping List extra "([^"]*)" still needs (\d+) (?:g|ml|piece)$`, func(name string, want int) error {
		x := extraNamed(name)
		if x == nil || ssNum(x["quantity"]) != float64(want) {
			return fmt.Errorf("extra %q = %v, want %d remaining", name, x, want)
		}
		return nil
	})
	sc.Step(`^the Shopping List line "([^"]*)" is (ticked|not ticked)$`, func(name, state string) error {
		item := lineNamed(name)
		if item == nil {
			item = extraNamed(name)
		}
		if item == nil {
			return fmt.Errorf("no line or extra %q in %s", name, w.Last.Body)
		}
		if got := item["ticked"] == true; got != (state == "ticked") {
			return fmt.Errorf("%q ticked = %v, want %s", name, got, state)
		}
		return nil
	})
	sc.Step(`^the Shopping List progress is (\d+) of (\d+)$`, func(ticked, total int) error {
		l, err := list()
		if err != nil {
			return err
		}
		p, _ := l["progress"].(map[string]any)
		if ssNum(p["ticked"]) != float64(ticked) || ssNum(p["total"]) != float64(total) {
			return fmt.Errorf("progress %v, want %d of %d", p, ticked, total)
		}
		return nil
	})
	sc.Step(`^the Shopping List is (complete|not complete)$`, func(state string) error {
		l, err := list()
		if err != nil {
			return err
		}
		if (l["complete"] == true) != (state == "complete") {
			return fmt.Errorf("complete = %v, want %s", l["complete"], state)
		}
		return nil
	})
	sc.Step(`^the Shopping List summary is (\d+) lines, (\d+) cents spent and (\d+) Stock Lots added$`, func(n, spent, lots int) error {
		l, err := list()
		if err != nil {
			return err
		}
		s, _ := l["summary"].(map[string]any)
		if ssNum(s["lines"]) != float64(n) || ssNum(s["spentCents"]) != float64(spent) || ssNum(s["lotsAdded"]) != float64(lots) {
			return fmt.Errorf("summary %v, want %d lines, %d cents, %d Lots", s, n, spent, lots)
		}
		return nil
	})

	// --- Scanning (the phone resolves with the server's catalogue and sends an operation) ---

	resolve := func(code, shop string) (map[string]any, error) {
		path := "/api/resolve?barcode=" + url.QueryEscape(code)
		if shop != "" {
			sid, err := shopID(shop)
			if err != nil {
				return nil, err
			}
			path += fmt.Sprintf("&shop=%d", sid)
		}
		r := me().Get(path)
		if r.Status != 200 {
			return nil, fmt.Errorf("resolve %s: %d %s", code, r.Status, r.Body)
		}
		var doc map[string]any
		_ = json.Unmarshal(r.Body, &doc)
		return doc, nil
	}
	outcomeOf := func(doc map[string]any) (string, map[string]any) {
		res, _ := doc["resolution"].(map[string]any)
		out, _ := res["outcome"].(string)
		return out, res
	}
	storeResult := func(uuid string) error {
		var doc map[string]any
		if err := json.Unmarshal(w.Last.Body, &doc); err != nil {
			return fmt.Errorf("scan %s: not JSON: %s", uuid, w.Last.Body)
		}
		w.Vars["ss:result:"+uuid] = doc
		return nil
	}
	send := func(op map[string]any) error {
		w.Last = me().Post("/api/scan", op)
		return storeResult(op["clientUuid"].(string))
	}
	opBase := func(uuid, kind string) map[string]any {
		return map[string]any{"clientUuid": uuid, "scannedAt": w.Ensure().Clock.Now().Format(time.RFC3339), "kind": kind}
	}
	// scanOp builds the shop_scan operation for a barcode that resolves to a Product.
	scanOp := func(code, shop, uuid string) (map[string]any, error) {
		doc, err := resolve(code, shop)
		if err != nil {
			return nil, err
		}
		outcome, res := outcomeOf(doc)
		op := opBase(uuid, "shop_scan")
		sid, _ := shopID(shop)
		op["shopId"] = sid
		switch outcome {
		case "product":
			p, _ := doc["product"].(map[string]any)
			op["productId"], op["quantity"] = res["productId"], p["packSize"]
		case "weighed":
			op["productId"], op["quantity"] = res["productId"], res["weightGrams"]
			if res["priceCents"] != nil {
				op["priceCents"] = res["priceCents"]
			}
			if res["pricePerKgCents"] != nil {
				op["pricePerKgCents"] = res["pricePerKgCents"]
			}
		default:
			return nil, fmt.Errorf("barcode %s resolves to %q, not a Product (%v)", code, outcome, res)
		}
		return op, nil
	}
	sc.Step(`^I scan the barcode "([^"]*)" at "([^"]*)" as scan "([^"]*)"$`, func(code, shop, uuid string) error {
		op, err := scanOp(code, shop, uuid)
		if err != nil {
			return err
		}
		return send(op)
	})
	sc.Step(`^I ask for the weight of "([^"]*)" at "([^"]*)" as scan "([^"]*)" and say it weighs (\d+) g$`, func(code, shop, uuid string, grams int) error {
		doc, err := resolve(code, shop)
		if err != nil {
			return err
		}
		outcome, res := outcomeOf(doc)
		if outcome != "ask_weight" {
			return fmt.Errorf("barcode %s resolves to %q, want ask_weight", code, outcome)
		}
		price := int(ssNum(res["priceCents"]))
		op := opBase(uuid, "shop_scan")
		sid, _ := shopID(shop)
		op["shopId"], op["productId"], op["quantity"], op["priceCents"] = sid, res["productId"], grams, price
		op["pricePerKgCents"] = (price*1000 + grams/2) / grams // PricePerKgFromWeight, half up
		return send(op)
	})
	sc.Step(`^I save the unknown barcode "([^"]*)" at "([^"]*)" as scan "([^"]*)" with the form:$`, func(code, shop, uuid string, table *godog.Table) error {
		form := map[string]string{}
		for _, row := range table.Rows {
			form[strings.TrimSpace(row.Cells[0].Value)] = strings.TrimSpace(row.Cells[1].Value)
		}
		size, _ := strconv.ParseFloat(form["packSize"], 64)
		sid, err := shopID(shop)
		if err != nil {
			return err
		}
		op := opBase(uuid, "shop_unknown")
		op["shopId"], op["barcode"], op["quantity"], op["packSize"] = sid, ssGTIN14(code), size, size
		op["ingredient"] = map[string]any{"name": form["ingredient"], "baseUnit": form["baseUnit"]}
		op["productName"], op["scope"] = form["productName"], form["scope"]
		return send(op)
	})
	sc.Step(`^I name the unknown weighed code "([^"]*)" at "([^"]*)" as scan "([^"]*)" with Ingredient "([^"]*)" and Product name "([^"]*)"$`, func(code, shop, uuid, ing, name string) error {
		doc, err := resolve(code, shop)
		if err != nil {
			return err
		}
		outcome, res := outcomeOf(doc)
		if outcome != "unknown_weighed_product" {
			return fmt.Errorf("barcode %s resolves to %q, want unknown_weighed_product", code, outcome)
		}
		iid := id("ingredient", ing)
		sid, _ := shopID(shop)
		op := opBase(uuid, "shop_unknown")
		op["shopId"], op["ruleId"], op["itemCode"], op["quantity"] = sid, res["ruleId"], res["itemCode"], res["weightGrams"]
		op["ingredient"], op["productName"] = map[string]any{"id": iid}, name
		return send(op)
	})
	sc.Step(`^I scan the barcode "([^"]*)" at home and choose "(plus_pack|minus_pack)" as scan "([^"]*)"$`, func(code, action, uuid string) error {
		doc, err := resolve(code, "")
		if err != nil {
			return err
		}
		outcome, res := outcomeOf(doc)
		if outcome != "product" {
			return fmt.Errorf("barcode %s resolves to %q at home", code, outcome)
		}
		op := opBase(uuid, "stock_take")
		op["productId"], op["action"] = res["productId"], action
		return send(op)
	})
	sc.Step(`^I scan the barcode "([^"]*)" at home and choose "set_total" with total (\d+) as scan "([^"]*)"$`, func(code string, total int, uuid string) error {
		doc, err := resolve(code, "")
		if err != nil {
			return err
		}
		_, res := outcomeOf(doc)
		op := opBase(uuid, "stock_take")
		op["productId"], op["action"], op["total"] = res["productId"], "set_total", total
		return send(op)
	})
	sc.Step(`^I undo scan "([^"]*)"$`, func(uuid string) error {
		w.Last = me().Post("/api/scan/"+uuid+"/undo", nil)
		return nil
	})
	sc.Step(`^I change the price of scan "([^"]*)" to (\d+) cents$`, func(uuid string, cents int) error {
		w.Last = me().Patch("/api/scan/"+uuid, map[string]any{"priceCents": cents})
		return nil
	})

	scanField := func(uuid, path string) (any, error) {
		doc, ok := w.Vars["ss:result:"+uuid].(map[string]any)
		if !ok {
			return nil, fmt.Errorf("scan %q has no result in this scenario", uuid)
		}
		b, _ := json.Marshal(doc)
		return ssPath(b, path)
	}
	scanIs := func(uuid, path string, want any) error {
		got, err := scanField(uuid, path)
		if err != nil {
			return err
		}
		if fmt.Sprint(got) != fmt.Sprint(want) {
			return fmt.Errorf("scan %s: %s = %v, want %v", uuid, path, got, want)
		}
		return nil
	}
	sc.Step(`^scan "([^"]*)" was (applied|a duplicate|rejected)$`, func(uuid, state string) error {
		return scanIs(uuid, "status", map[string]string{"applied": "applied", "a duplicate": "duplicate", "rejected": "rejected"}[state])
	})
	sc.Step(`^scan "([^"]*)" was rejected with "([^"]*)"$`, func(uuid, code string) error {
		if err := scanIs(uuid, "status", "rejected"); err != nil {
			return err
		}
		return scanIs(uuid, "error.code", code)
	})
	sc.Step(`^scan "([^"]*)" added (\d+) (?:g|ml|piece) of "([^"]*)"$`, func(uuid string, qty int, name string) error {
		if err := scanIs(uuid, "scan.quantity", qty); err != nil {
			return err
		}
		return scanIs(uuid, "scan.ingredientName", name)
	})
	sc.Step(`^scan "([^"]*)" is on the list with (\d+) (?:g|ml|piece) remaining$`, func(uuid string, rem int) error {
		if err := scanIs(uuid, "scan.onList", true); err != nil {
			return err
		}
		return scanIs(uuid, "scan.remaining", rem)
	})
	sc.Step(`^scan "([^"]*)" is not on the list$`, func(uuid string) error { return scanIs(uuid, "scan.onList", false) })
	sc.Step(`^scan "([^"]*)" ticked the line$`, func(uuid string) error { return scanIs(uuid, "scan.ticked", true) })
	sc.Step(`^scan "([^"]*)" did not tick the line$`, func(uuid string) error { return scanIs(uuid, "scan.ticked", false) })
	sc.Step(`^scan "([^"]*)" shows the price (\d+) cents$`, func(uuid string, cents int) error { return scanIs(uuid, "scan.priceCents", cents) })
	sc.Step(`^scan "([^"]*)" created the Product "([^"]*)"$`, func(uuid, name string) error {
		if err := scanIs(uuid, "scan.productCreated", true); err != nil {
			return err
		}
		return scanIs(uuid, "scan.productName", name)
	})
	sc.Step(`^scan "([^"]*)" was merged into "([^"]*)"$`, func(uuid, name string) error {
		if err := scanIs(uuid, "scan.merged.productName", name); err != nil {
			return err
		}
		return scanIs(uuid, "scan.productCreated", false)
	})
	sc.Step(`^scan "([^"]*)" leaves (\d+) (?:g|ml|piece) in total$`, func(uuid string, total int) error { return scanIs(uuid, "scan.total", total) })
	sc.Step(`^the Stock Lot of scan "([^"]*)" was bought on `+ssDate+`$`, func(uuid, date string) error {
		lot, err := scanField(uuid, "scan.lotId")
		if err != nil {
			return err
		}
		r := me().Get("/api/stock/lots")
		var out struct {
			Lots []struct {
				ID        float64 `json:"id"`
				Purchased string  `json:"purchased"`
			} `json:"lots"`
		}
		if err := r.JSON(&out); err != nil {
			return err
		}
		for _, l := range out.Lots {
			if l.ID == ssNum(lot) {
				if l.Purchased != date {
					return fmt.Errorf("Lot %v bought on %s, want %s", lot, l.Purchased, date)
				}
				return nil
			}
		}
		return fmt.Errorf("Lot %v not found", lot)
	})

	// --- Resolution and catalogue checks ---

	sc.Step(`^the barcode "([^"]*)" is unknown at (?:"([^"]*)"|home)$`, func(code, shop string) error {
		doc, err := resolve(code, shop)
		if err != nil {
			return err
		}
		if outcome, _ := outcomeOf(doc); outcome != "unknown" {
			return fmt.Errorf("barcode %s resolves to %q, want unknown", code, outcome)
		}
		return nil
	})
	sc.Step(`^the barcode "([^"]*)" resolves to "([^"]*)" at (?:"([^"]*)"|home)$`, func(code, prod, shop string) error {
		doc, err := resolve(code, shop)
		if err != nil {
			return err
		}
		p, _ := doc["product"].(map[string]any)
		if p == nil || p["name"] != prod {
			return fmt.Errorf("barcode %s resolves to %v, want %q", code, doc, prod)
		}
		return nil
	})
	sc.Step(`^"([^"]*)" is (sold|not sold) at "([^"]*)"$`, func(prod, state, shop string) error {
		pid, err := productID(prod)
		if err != nil {
			return err
		}
		sid, err := shopID(shop)
		if err != nil {
			return err
		}
		r := me().Get(fmt.Sprintf("/api/products/%d", pid))
		var d struct {
			Shops []struct {
				ID int64 `json:"id"`
			} `json:"shops"`
		}
		if err := r.JSON(&d); err != nil {
			return err
		}
		sold := false
		for _, s := range d.Shops {
			sold = sold || s.ID == sid
		}
		if sold != (state == "sold") {
			return fmt.Errorf("%s sold at %s = %v, want %s", prod, shop, sold, state)
		}
		return nil
	})
	lastBought := func(ing string) (string, error) {
		r := me().Get(fmt.Sprintf("/api/products/last-bought?ingredient=%d", id("ingredient", ing)))
		if r.Status == 404 {
			return "", nil
		}
		if r.Status != 200 {
			return "", fmt.Errorf("last bought: %d %s", r.Status, r.Body)
		}
		var p struct {
			Name string `json:"name"`
		}
		return p.Name, r.JSON(&p)
	}
	sc.Step(`^the last bought Product for "([^"]*)" is "([^"]*)"$`, func(ing, want string) error {
		got, err := lastBought(ing)
		if err == nil && got != want {
			err = fmt.Errorf("last bought for %s = %q, want %q", ing, got, want)
		}
		return err
	})
	sc.Step(`^there is no last bought Product for "([^"]*)"$`, func(ing string) error {
		got, err := lastBought(ing)
		if err == nil && got != "" {
			err = fmt.Errorf("last bought for %s = %q, want none", ing, got)
		}
		return err
	})
	sc.Step(`^the last Price of "([^"]*)" at "([^"]*)" is (\d+) cents$`, func(prod, shop string, cents int) error {
		pid, err := productID(prod)
		if err != nil {
			return err
		}
		sid, err := shopID(shop)
		if err != nil {
			return err
		}
		r := me().Get(fmt.Sprintf("/api/products/%d/prices/latest?shop=%d", pid, sid))
		var p struct {
			PriceCents *int `json:"priceCents"`
		}
		if err := r.JSON(&p); err != nil || p.PriceCents == nil || *p.PriceCents != cents {
			return fmt.Errorf("latest Price = %s, want %d cents", r.Body, cents)
		}
		return nil
	})
	sc.Step(`^there is exactly (\d+) Ingredient named "([^"]*)"$`, func(want int, name string) error {
		var all []struct {
			Name string `json:"name"`
		}
		if err := me().Get("/api/ingredients").JSON(&all); err != nil {
			return err
		}
		n := 0
		for _, i := range all {
			if strings.EqualFold(i.Name, name) {
				n++
			}
		}
		if n != want {
			return fmt.Errorf("%d Ingredients named %q, want %d", n, name, want)
		}
		return nil
	})
	sc.Step(`^there is exactly (\d+) Product named "([^"]*)"$`, func(want int, name string) error {
		var all []struct {
			Name string `json:"name"`
		}
		if err := me().Get("/api/products?q=" + url.QueryEscape(name)).JSON(&all); err != nil {
			return err
		}
		n := 0
		for _, p := range all {
			if p.Name == name {
				n++
			}
		}
		if n != want {
			return fmt.Errorf("%d Products named %q, want %d", n, name, want)
		}
		return nil
	})

	// --- Stock checks ---

	lotsOf := func(name string) ([]map[string]any, error) {
		iid := id("ingredient", name)
		if iid == 0 {
			// An Ingredient a scan created was never registered by a step: look it up by its name.
			var all []struct {
				ID   int64  `json:"id"`
				Name string `json:"name"`
			}
			if err := me().Get("/api/ingredients").JSON(&all); err == nil {
				for _, i := range all {
					if strings.EqualFold(i.Name, name) {
						iid = i.ID
						w.Vars["ss:ingredient:"+name] = iid
					}
				}
			}
		}
		if iid == 0 {
			return nil, nil // never created: nothing in Stock
		}
		var out struct {
			Lots []map[string]any `json:"lots"`
		}
		r := me().Get(fmt.Sprintf("/api/stock/lots?ingredientId=%d", iid))
		if err := r.JSON(&out); err != nil || r.Status != 200 {
			return nil, fmt.Errorf("list Lots: %d %s", r.Status, r.Body)
		}
		return out.Lots, nil
	}
	sc.Step(`^the shopping Stock total of "([^"]*)" is (\d+) (?:g|ml|piece)$`, func(name string, want int) error {
		lots, err := lotsOf(name)
		if err != nil {
			return err
		}
		total := 0.0
		for _, l := range lots {
			total += ssNum(l["quantity"])
		}
		if total != float64(want) {
			return fmt.Errorf("Stock holds %v of %s, want %d", total, name, want)
		}
		return nil
	})
	sc.Step(`^the shopping Stock has (\d+) Lots of "([^"]*)"$`, func(want int, name string) error {
		lots, err := lotsOf(name)
		if err == nil && len(lots) != want {
			err = fmt.Errorf("%d Lots of %s, want %d", len(lots), name, want)
		}
		return err
	})
	sc.Step(`^the shopping Stock has a Lot of (\d+) (?:g|ml|piece) of "([^"]*)" from (?:"([^"]*)"|no Shop) for "([^"]*)"$`, func(qty int, name, shop, prod string) error {
		lots, err := lotsOf(name)
		if err != nil {
			return err
		}
		pid, err := productID(prod)
		if err != nil {
			return err
		}
		for _, l := range lots {
			if ssNum(l["quantity"]) != float64(qty) || ssNum(l["productId"]) != float64(pid) {
				continue
			}
			if shop == "" && l["shopId"] == nil {
				return nil
			}
			if sid, err := shopID(shop); shop != "" && err == nil && ssNum(l["shopId"]) == float64(sid) {
				return nil
			}
		}
		return fmt.Errorf("no Lot of %d %s for %q from %q in %v", qty, name, prod, shop, lots)
	})

	// --- Offline: the phone keeps a queue and sends it in order ---

	sc.Step(`^the phone caches the offline data for "([^"]*)"$`, func(shop string) error {
		sid, err := shopID(shop)
		if err != nil {
			return err
		}
		w.Last = me().Get(fmt.Sprintf("/api/scan/offline?shop=%d", sid))
		if w.Last.Status != 200 {
			return fmt.Errorf("offline: %d %s", w.Last.Status, w.Last.Body)
		}
		var doc map[string]any
		_ = json.Unmarshal(w.Last.Body, &doc)
		w.Vars["ss:offline"] = doc
		return nil
	})
	sc.Step(`^the offline data knows the barcode "([^"]*)" as "([^"]*)" with pack size (\d+)$`, func(code, prod string, size int) error {
		doc, _ := w.Vars["ss:offline"].(map[string]any)
		cat, _ := doc["catalog"].(map[string]any)
		global, _ := cat["globalBarcodes"].(map[string]any)
		pid, ok := global[ssGTIN14(code)]
		if !ok {
			return fmt.Errorf("catalog lacks %s: %v", code, global)
		}
		products, _ := doc["products"].([]any)
		for _, x := range products {
			if p, _ := x.(map[string]any); p != nil && p["id"] == pid {
				if p["name"] != prod || ssNum(p["packSize"]) != float64(size) {
					return fmt.Errorf("product %v, want %s of %d", p, prod, size)
				}
				return nil
			}
		}
		return fmt.Errorf("offline products lack %v", pid)
	})
	queue := func(op map[string]any) {
		ops, _ := w.Vars["ss:queue"].([]map[string]any)
		w.Vars["ss:queue"] = append(ops, op)
	}
	sc.Step(`^the phone queues the scan of "([^"]*)" at "([^"]*)" as "([^"]*)"(?: on `+ssDate+`)?$`, func(code, shop, uuid, on string) error {
		// Offline the phone resolves from the cached offline only: canonical code -> global Product id -> pack size.
		doc, _ := w.Vars["ss:offline"].(map[string]any)
		cat, _ := doc["catalog"].(map[string]any)
		global, _ := cat["globalBarcodes"].(map[string]any)
		pid, ok := global[ssGTIN14(code)]
		if !ok {
			return fmt.Errorf("the cached catalog does not know %s", code)
		}
		var size any
		products, _ := doc["products"].([]any)
		for _, x := range products {
			if p, _ := x.(map[string]any); p != nil && p["id"] == pid {
				size = p["packSize"]
			}
		}
		sid, err := shopID(shop)
		if err != nil {
			return err
		}
		op := opBase(uuid, "shop_scan")
		op["shopId"], op["productId"], op["quantity"] = sid, pid, size
		if on != "" {
			op["scannedAt"] = on + "T17:30:00Z"
		}
		queue(op)
		return nil
	})
	sc.Step(`^the phone queues a scan of an unknown Product as "([^"]*)"$`, func(uuid string) error {
		op := opBase(uuid, "shop_scan")
		sid, _ := shopID("Coop")
		op["shopId"], op["productId"], op["quantity"] = sid, 999999, 100
		queue(op)
		return nil
	})
	sc.Step(`^the phone queues the unknown barcode "([^"]*)" at "([^"]*)" as "([^"]*)" named "([^"]*)" for Ingredient "([^"]*)" of (\d+) g$`, func(code, shop, uuid, name, ing string, size int) error {
		sid, err := shopID(shop)
		if err != nil {
			return err
		}
		op := opBase(uuid, "shop_unknown")
		op["shopId"], op["barcode"], op["quantity"], op["packSize"], op["scope"] = sid, ssGTIN14(code), size, size, "global"
		op["ingredient"], op["productName"] = map[string]any{"name": ing, "baseUnit": "g"}, name
		queue(op)
		return nil
	})
	sc.Step(`^the phone syncs its queue$`, func() error {
		// The queue is kept after a sync: a phone that lost the response sends the same operations again.
		ops, _ := w.Vars["ss:queue"].([]map[string]any)
		w.Last = me().Post("/api/scan/sync", map[string]any{"ops": ops})
		if w.Last.Status != 200 {
			return fmt.Errorf("sync: %d %s", w.Last.Status, w.Last.Body)
		}
		var out struct {
			Results []map[string]any `json:"results"`
		}
		if err := w.Last.JSON(&out); err != nil {
			return err
		}
		var statuses []string
		for _, r := range out.Results {
			uuid, _ := r["clientUuid"].(string)
			if r["status"] != "duplicate" || w.Vars["ss:result:"+uuid] == nil {
				w.Vars["ss:result:"+uuid] = r
			}
			statuses = append(statuses, fmt.Sprint(r["status"]))
		}
		w.Vars["ss:statuses"] = strings.Join(statuses, ", ")
		return nil
	})
	sc.Step(`^the sync results are "([^"]*)"$`, func(want string) error {
		if got, _ := w.Vars["ss:statuses"].(string); got != want {
			return fmt.Errorf("sync results %q, want %q", got, want)
		}
		return nil
	})

	// --- Two shoppers: every write publishes a `shopping` event before it answers ---

	sc.Step(`^shopper "([^"]*)" is listening for Shopping List updates$`, func(email string) error {
		ch, cancel := w.Ensure().App.Deps.Events.Subscribe("shopping")
		w.TB.Cleanup(cancel)
		w.Vars["ss:listen:"+email] = ch
		return nil
	})
	sc.Step(`^shopper "([^"]*)" hears of the change within 1 second$`, func(email string) error {
		ch, _ := w.Vars["ss:listen:"+email].(<-chan events.Event)
		if ch == nil {
			return fmt.Errorf("shopper %q is not listening", email)
		}
		select {
		case ev := <-ch:
			if ev.Topic != "shopping" {
				return fmt.Errorf("heard %q, want a shopping event", ev.Topic)
			}
			return nil
		case <-time.After(time.Second):
			return fmt.Errorf("no shopping event within 1 s")
		}
	})
}
