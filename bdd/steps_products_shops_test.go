package bdd

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("products-shops", productsShopsSteps) }

// Fixtures are created through the HTTP API as the Admin. Their ids live in w.Vars under
// "ps:<kind>:<name>" and are substituted into paths, bodies and expectations written as
// {shop:Name}, {product:Name}, {ingredient:Name}, {rule:Shop/prefix}, {shopbarcode:Shop/code}, {purchase:Product/Shop/date}, {price:Product/Shop/date}.
var psPlaceholder = regexp.MustCompile(`\{(shop|product|ingredient|rule|shopbarcode|purchase|price):([^}]*)\}`)

func productsShopsSteps(sc *godog.ScenarioContext, w *World) {
	expand := func(s string) (string, error) {
		var missing []string
		out := psPlaceholder.ReplaceAllStringFunc(s, func(m string) string {
			g := psPlaceholder.FindStringSubmatch(m)
			id, ok := w.Vars["ps:"+g[1]+":"+g[2]].(int64)
			if !ok {
				missing = append(missing, m)
				return m
			}
			return strconv.FormatInt(id, 10)
		})
		if len(missing) > 0 {
			return "", fmt.Errorf("nothing was set up for %s", strings.Join(missing, ", "))
		}
		return out, nil
	}
	admin := func() *testkit.Client { return w.Ensure().LoginAdmin(w.TB) }
	create := func(kind, name, path, body string) error {
		b, err := expand(body)
		if err != nil {
			return err
		}
		p, err := expand(path)
		if err != nil {
			return err
		}
		res := admin().Do("POST", p, []byte(b))
		if res.Status != 201 && res.Status != 200 {
			return fmt.Errorf("setting up %s %q: status %d: %s", kind, name, res.Status, res.Body)
		}
		var v struct {
			ID int64 `json:"id"`
		}
		if err := res.JSON(&v); err != nil {
			return err
		}
		w.Vars["ps:"+kind+":"+name] = v.ID
		return nil
	}

	// ---- fixtures ----
	sc.Step(`^an Ingredient "([^"]*)" counted in (g|ml|piece) exists for Products$`, func(name, base string) error {
		return create("ingredient", name, "/api/ingredients", fmt.Sprintf(`{"name":%q,"baseUnit":%q}`, name, base))
	})
	sc.Step(`^the Household shops at "([^"]*)"$`, func(name string) error {
		return create("shop", name, "/api/shops", fmt.Sprintf(`{"name":%q}`, name))
	})
	sc.Step(`^the Product "([^"]*)" of Ingredient "([^"]*)" with pack size ([\d.]+)(?: and global barcode "([^"]*)")? exists$`,
		func(name, ing, size, code string) error {
			body := fmt.Sprintf(`{"name":%q,"ingredientId":{ingredient:%s},"packSize":%s`, name, ing, size)
			if code != "" {
				body += fmt.Sprintf(`,"barcodes":[%q]`, code)
			}
			return create("product", name, "/api/products", body+"}")
		})
	sc.Step(`^the Shop "([^"]*)" has a (weight|price) rule with prefix "(\d+)", item digits (\d+)-(\d+), value digits (\d+)-(\d+), unit "([^"]*)" and (\d+) decimal places$`,
		func(shop, kind, prefix, is, ie, vs, ve, unit, dp string) error {
			n := func(a, b string) string {
				x, _ := strconv.Atoi(a)
				y, _ := strconv.Atoi(b)
				return strconv.Itoa(y - x + 1)
			}
			body := fmt.Sprintf(`{"prefix":%q,"item":{"start":%s,"length":%s},"value":{"start":%s,"length":%s},"valueKind":%q,"valueUnit":%q,"decimalPlaces":%s}`,
				prefix, is, n(is, ie), vs, n(vs, ve), kind, unit, dp)
			return create("rule", shop+"/"+prefix, "/api/shops/{shop:"+shop+"}/weight-rules", body)
		})
	sc.Step(`^at the Shop "([^"]*)" the item code "([^"]*)" of rule "([^"]*)" is the Product "([^"]*)"$`,
		func(shop, item, prefix, prod string) error {
			body := fmt.Sprintf(`{"productId":{product:%s},"ruleId":{rule:%s/%s},"itemCode":%q}`, prod, shop, prefix, item)
			return create("shopbarcode", shop+"/"+item, "/api/shops/{shop:"+shop+"}/barcodes", body)
		})
	sc.Step(`^at the Shop "([^"]*)" the code "([^"]*)" is the Product "([^"]*)"$`, func(shop, code, prod string) error {
		body := fmt.Sprintf(`{"productId":{product:%s},"code":%q}`, prod, code)
		return create("shopbarcode", shop+"/"+code, "/api/shops/{shop:"+shop+"}/barcodes", body)
	})
	sc.Step(`^the Product "([^"]*)" cost (\d+) cents? at the Shop "([^"]*)" on (\d{4}-\d{2}-\d{2})$`, func(prod, cents, shop, date string) error {
		return psPut(w, expand, prod+"/"+shop+"/"+date, "/api/products/{product:"+prod+"}/prices", fmt.Sprintf(`{"shopId":{shop:%s},"date":%q,"priceCents":%s}`, shop, date, cents))
	})
	sc.Step(`^the Product "([^"]*)" cost (\d+) cents per kg at the Shop "([^"]*)" on (\d{4}-\d{2}-\d{2})$`, func(prod, cents, shop, date string) error {
		return psPut(w, expand, prod+"/"+shop+"/"+date, "/api/products/{product:"+prod+"}/prices", fmt.Sprintf(`{"shopId":{shop:%s},"date":%q,"pricePerKgCents":%s}`, shop, date, cents))
	})
	sc.Step(`^the Product "([^"]*)" was bought at the Shop "([^"]*)" on (\d{4}-\d{2}-\d{2})$`, func(prod, shop, date string) error {
		return create("purchase", prod+"/"+shop+"/"+date, "/api/purchases", fmt.Sprintf(`{"productId":{product:%s},"shopId":{shop:%s},"date":%q}`, prod, shop, date))
	})
	sc.Step(`^the Product "([^"]*)" was bought at home on (\d{4}-\d{2}-\d{2})$`, func(prod, date string) error {
		return create("purchase", prod+"/home/"+date, "/api/purchases", fmt.Sprintf(`{"productId":{product:%s},"date":%q}`, prod, date))
	})

	sc.Step(`^the Product "([^"]*)" is archived$`, func(prod string) error {
		p, err := expand("/api/products/{product:" + prod + "}/archive")
		if err != nil {
			return err
		}
		if res := admin().Do("POST", p, []byte(`{}`)); res.Status != 200 {
			return fmt.Errorf("archiving %q: status %d: %s", prod, res.Status, res.Body)
		}
		return nil
	})

	// ---- requests with placeholders ----
	sc.Step(`^I send (GET|DELETE) "([^"]*)" for Products$`, func(method, path string) error {
		p, err := expand(path)
		if err != nil {
			return err
		}
		w.Ensure()
		w.Last = w.Client.Do(method, p, nil)
		return nil
	})
	sc.Step(`^I send (POST|PUT|PATCH) "([^"]*)" for Products with JSON:$`, func(method, path string, body *godog.DocString) error {
		p, err := expand(path)
		if err != nil {
			return err
		}
		b, err := expand(body.Content)
		if err != nil {
			return err
		}
		w.Ensure()
		w.Last = w.Client.Do(method, p, []byte(b))
		return nil
	})

	// ---- assertions ---- (paths may use placeholders too)
	val := func(path string) (any, error) {
		p, err := expand(path)
		if err != nil {
			return nil, err
		}
		return psValue(w, p)
	}
	sc.Step(`^the Products response value at "([^"]*)" is "([^"]*)"$`, func(path, want string) error {
		want, err := expand(want)
		if err != nil {
			return err
		}
		got, err := val(path)
		if err != nil {
			return err
		}
		if fmt.Sprint(got) != want {
			return fmt.Errorf("%s = %v, want %s; body: %s", path, got, want, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Products response value at "([^"]*)" is null$`, func(path string) error {
		got, err := val(path)
		if err != nil {
			return err
		}
		if got != nil {
			return fmt.Errorf("%s = %v, want null; body: %s", path, got, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Products response has (\d+) entries(?: at "([^"]*)")?$`, func(n int, path string) error {
		got, err := val(path)
		if err != nil {
			return err
		}
		arr, ok := got.([]any)
		if !ok {
			return fmt.Errorf("%q is not an array: %v", path, got)
		}
		if len(arr) != n {
			return fmt.Errorf("%d entries, want %d; body: %s", len(arr), n, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Products response text contains "([^"]*)"$`, func(want string) error {
		want, err := expand(want)
		if err != nil {
			return err
		}
		if !strings.Contains(string(w.Last.Body), want) {
			return fmt.Errorf("body does not contain %q: %s", want, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the Products response is JSON null$`, func() error {
		if s := strings.TrimSpace(string(w.Last.Body)); s != "null" {
			return fmt.Errorf("body = %s, want null", s)
		}
		return nil
	})
	sc.Step(`^the Products response has no value at "([^"]*)"$`, func(path string) error {
		if _, err := val(path); err == nil {
			return fmt.Errorf("%q is present; body: %s", path, w.Last.Body)
		}
		return nil
	})
}

func psPut(w *World, expand func(string) (string, error), key, path, body string) error {
	p, err := expand(path)
	if err != nil {
		return err
	}
	b, err := expand(body)
	if err != nil {
		return err
	}
	res := w.Ensure().LoginAdmin(w.TB).Do("PUT", p, []byte(b))
	if res.Status != 200 {
		return fmt.Errorf("PUT %s: status %d: %s", p, res.Status, res.Body)
	}
	var v struct {
		ID int64 `json:"id"`
	}
	if err := res.JSON(&v); err != nil {
		return err
	}
	w.Vars["ps:price:"+key] = v.ID
	return nil
}

// psValue walks the last response: "" is the root; segments are object keys or array indexes.
// A missing key is an error; a JSON null is returned as nil.
func psValue(w *World, path string) (any, error) {
	var doc any
	if err := json.Unmarshal(w.Last.Body, &doc); err != nil {
		return nil, fmt.Errorf("response is not JSON: %v; body: %s", err, w.Last.Body)
	}
	if path == "" {
		return doc, nil
	}
	cur := doc
	for _, key := range strings.Split(path, ".") {
		switch c := cur.(type) {
		case map[string]any:
			v, ok := c[key]
			if !ok {
				return nil, fmt.Errorf("key %q missing in %q; body: %s", key, path, w.Last.Body)
			}
			cur = v
		case []any:
			i, err := strconv.Atoi(key)
			if err != nil || i < 0 || i >= len(c) {
				return nil, fmt.Errorf("index %q out of range in %q (len %d)", key, path, len(c))
			}
			cur = c[i]
		default:
			return nil, fmt.Errorf("%q: cannot descend into %v", path, cur)
		}
	}
	return cur, nil
}
