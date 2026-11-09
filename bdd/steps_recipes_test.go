package bdd

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/cucumber/godog"
	"golang.org/x/image/webp"

	"github.com/fabbarix/feeder-ng/internal/recipe/store"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() {
	RegisterSteps("recipes", recipesSteps)
	store.RegisterPlannedChecker("bdd planned recipes", bddPlanned{})
}

// bddPlanned stands in for the planning feature: Recipes marked by the step
// `the Recipe "X" has been planned` count as planned.
type bddPlanned struct{}

var (
	plannedMu  sync.Mutex
	plannedIDs = map[int64]bool{}
)

func (bddPlanned) WasPlanned(_ context.Context, _ store.Querier, id int64) (bool, error) {
	plannedMu.Lock()
	defer plannedMu.Unlock()
	return plannedIDs[id], nil
}

var placeholder = regexp.MustCompile(`<(id|image):([^>]+)>`)

// recipeVars resolves <id:flour> (an Ingredient id) and <image:last> in a body.
func recipeVars(w *World, s string) string {
	return placeholder.ReplaceAllStringFunc(s, func(m string) string {
		parts := placeholder.FindStringSubmatch(m)
		switch parts[1] {
		case "id":
			return fmt.Sprint(w.Vars["ingredient:"+parts[2]])
		default:
			return fmt.Sprint(w.Vars["image:"+parts[2]])
		}
	})
}

func recipesSteps(sc *godog.ScenarioContext, w *World) {
	if w.Vars == nil {
		w.Vars = map[string]any{}
	}
	sc.After(func(ctx context.Context, _ *godog.Scenario, err error) (context.Context, error) {
		plannedMu.Lock()
		plannedIDs = map[int64]bool{}
		plannedMu.Unlock()
		return ctx, nil
	})

	adminJSON := func(method, path string, body any) *testkit.Response {
		return w.Ensure().LoginAdmin(w.TB).Do(method, path, body)
	}
	idOf := func(r *testkit.Response) int64 {
		var v struct {
			ID int64 `json:"id"`
		}
		r.MustJSON(w.TB, &v)
		return v.ID
	}

	// Ingredients and Members (set up through the other features' public API).
	sc.Step(`^the Ingredient "([^"]*)" exists with Base Unit "(g|ml|piece)"$`, func(name, base string) error {
		r := adminJSON("POST", "/api/ingredients", map[string]any{"name": name, "baseUnit": base})
		if r.Status != 201 {
			return fmt.Errorf("creating Ingredient %q: %d %s", name, r.Status, r.Body)
		}
		w.Vars["ingredient:"+name] = idOf(r)
		return nil
	})
	sc.Step(`^the Ingredient "([^"]*)" exists with Base Unit "(g|ml|piece)" and the Unit Conversion "([^"]*)" = ([0-9.]+)$`,
		func(name, base, unit, toBase string) error {
			f, _ := strconv.ParseFloat(toBase, 64)
			r := adminJSON("POST", "/api/ingredients", map[string]any{
				"name": name, "baseUnit": base, "conversions": []map[string]any{{"unit": unit, "toBase": f}},
			})
			if r.Status != 201 {
				return fmt.Errorf("creating Ingredient %q: %d %s", name, r.Status, r.Body)
			}
			w.Vars["ingredient:"+name] = idOf(r)
			return nil
		})
	sc.Step(`^I save the Unit Conversion "([^"]*)" = ([0-9.]+) for the Ingredient "([^"]*)"$`, func(unit, toBase, name string) error {
		f, _ := strconv.ParseFloat(toBase, 64)
		path := fmt.Sprintf("/api/ingredients/%v/conversions/%s", w.Vars["ingredient:"+name], unit)
		r := w.Client.Do("PUT", path, map[string]any{"toBase": f})
		if r.Status != 200 {
			return fmt.Errorf("saving Unit Conversion: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the household has the Member "([^"]*)" linked to "([^"]*)"$`, func(name, email string) error {
		r := adminJSON("POST", "/api/members", map[string]any{"name": name, "colour": "#336699", "portionFactor": 1})
		if r.Status != 201 {
			return fmt.Errorf("creating Member: %d %s", r.Status, r.Body)
		}
		id := idOf(r)
		w.Vars["member:"+name] = id
		u, err := w.Ensure().Auth.UserByEmail(context.Background(), email)
		if err != nil {
			return err
		}
		l := adminJSON("PUT", fmt.Sprintf("/api/members/%d/user", id), map[string]any{"userId": u.ID})
		if l.Status != 200 && l.Status != 204 {
			return fmt.Errorf("linking Member: %d %s", l.Status, l.Body)
		}
		return nil
	})
	sc.Step(`^the household has the Member "([^"]*)" without a sign-in$`, func(name string) error {
		r := adminJSON("POST", "/api/members", map[string]any{"name": name, "colour": "#996633", "portionFactor": 1})
		if r.Status != 201 {
			return fmt.Errorf("creating Member: %d %s", r.Status, r.Body)
		}
		w.Vars["member:"+name] = idOf(r)
		return nil
	})

	// Recipes.
	remember := func(r *testkit.Response) {
		if r.Status == 200 || r.Status == 201 {
			var v struct {
				ID   int64  `json:"id"`
				Name string `json:"name"`
			}
			if json.Unmarshal(r.Body, &v) == nil && v.Name != "" {
				w.Vars["recipe:"+v.Name] = v.ID
			}
		}
	}
	sc.Step(`^I create a Recipe with JSON:$`, func(body *godog.DocString) {
		w.Last = w.Client.Do("POST", "/api/recipes", []byte(recipeVars(w, body.Content)))
		remember(w.Last)
	})
	sc.Step(`^I replace the Recipe "([^"]*)" with JSON:$`, func(name string, body *godog.DocString) {
		w.Last = w.Client.Do("PUT", fmt.Sprintf("/api/recipes/%v", w.Vars["recipe:"+name]), []byte(recipeVars(w, body.Content)))
		remember(w.Last)
	})
	sc.Step(`^I have created the Recipe "([^"]*)" tagged "([^"]*)"$`, func(name, tags string) error {
		var tagList []string
		for _, t := range strings.Split(tags, ",") {
			tagList = append(tagList, strings.TrimSpace(t))
		}
		body := map[string]any{
			"name": name, "yield": 2, "tags": tagList,
			"lines": []map[string]any{{"ingredientId": w.Vars["ingredient:flour"], "quantity": 100, "unit": "g"}},
			"steps": []map[string]any{{"text": "Cook", "kind": "active", "durationMinutes": 5}},
		}
		r := w.Client.Do("POST", "/api/recipes", body)
		if r.Status != 201 {
			return fmt.Errorf("creating Recipe %q: %d %s", name, r.Status, r.Body)
		}
		remember(r)
		return nil
	})
	sc.Step(`^I open the Recipe "([^"]*)"$`, func(name string) {
		w.Last = w.Client.Do("GET", fmt.Sprintf("/api/recipes/%v", w.Vars["recipe:"+name]), nil)
	})
	sc.Step(`^I open the Recipe with id (\d+)$`, func(id int) { w.Last = w.Client.Do("GET", fmt.Sprintf("/api/recipes/%d", id), nil) })
	sc.Step(`^I (archive|unarchive) the Recipe "([^"]*)"$`, func(verb, name string) {
		w.Last = w.Client.Do("POST", fmt.Sprintf("/api/recipes/%v/%s", w.Vars["recipe:"+name], verb), nil)
	})
	sc.Step(`^I delete the Recipe "([^"]*)"$`, func(name string) {
		w.Last = w.Client.Do("DELETE", fmt.Sprintf("/api/recipes/%v", w.Vars["recipe:"+name]), nil)
	})
	sc.Step(`^the Recipe "([^"]*)" has been planned$`, func(name string) {
		plannedMu.Lock()
		plannedIDs[w.Vars["recipe:"+name].(int64)] = true
		plannedMu.Unlock()
	})
	sc.Step(`^I list the Recipes$`, func() { w.Last = w.Client.Get("/api/recipes") })
	sc.Step(`^I list the Recipes with query "([^"]*)"$`, func(q string) { w.Last = w.Client.Get("/api/recipes?q=" + q) })
	sc.Step(`^I list the Recipes tagged "([^"]*)"$`, func(tag string) { w.Last = w.Client.Get("/api/recipes?tag=" + tag) })
	sc.Step(`^I list the Recipes including archived$`, func() { w.Last = w.Client.Get("/api/recipes?archived=all") })
	sc.Step(`^I list only archived Recipes$`, func() { w.Last = w.Client.Get("/api/recipes?archived=yes") })
	sc.Step(`^the Recipe names are "([^"]*)"$`, func(want string) error { return namesAre(w, want) })
	sc.Step(`^I list the Tags$`, func() { w.Last = w.Client.Get("/api/tags") })
	sc.Step(`^the Tag names are "([^"]*)"$`, func(want string) error { return namesAre(w, want) })
	sc.Step(`^the Recipe JSON "([^"]*)" is "([^"]*)"$`, func(path, want string) error { return recipeJSONIs(w, path, want) })

	// Images.
	// Photos travel as JSON data URLs (the Recipe File form): multipart bodies
	// are refused by the CSRF guard.
	upload := func(data []byte) {
		body := map[string]string{"dataUrl": "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)}
		w.Last = w.Client.Do("POST", "/api/images", body)
		var v struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(w.Last.Body, &v) == nil && v.ID != "" {
			w.Vars["image:last"] = v.ID
		}
	}
	sc.Step(`^I upload a (\d+)x(\d+) PNG as a Recipe image$`, func(wd, ht int) {
		var b bytes.Buffer
		if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, wd, ht))); err != nil {
			panic(err)
		}
		upload(b.Bytes())
	})
	sc.Step(`^I upload the text "([^"]*)" as a Recipe image$`, func(text string) { upload([]byte(text)) })
	sc.Step(`^I upload a Recipe image of (\d+) MB$`, func(mb int) { upload(make([]byte, mb<<20)) })
	sc.Step(`^I fetch the uploaded image$`, func() {
		w.Last = w.Client.Get(fmt.Sprintf("/api/images/%v", w.Vars["image:last"]))
	})
	sc.Step(`^I fetch the uploaded image without signing in$`, func() {
		w.Last = w.Ensure().Anonymous().Get(fmt.Sprintf("/api/images/%v", w.Vars["image:last"]))
	})
	sc.Step(`^the fetched image is a WebP of (\d+)x(\d+)$`, func(wd, ht int) error {
		if ct := w.Last.Header.Get("Content-Type"); ct != "image/webp" {
			return fmt.Errorf("Content-Type = %q, want image/webp", ct)
		}
		cfg, err := webp.DecodeConfig(bytes.NewReader(w.Last.Body))
		if err != nil {
			return fmt.Errorf("not a WebP: %v", err)
		}
		if cfg.Width != wd || cfg.Height != ht {
			return fmt.Errorf("image is %dx%d, want %dx%d", cfg.Width, cfg.Height, wd, ht)
		}
		return nil
	})

	// Preferences.
	memberBody := func(who string, extra map[string]any) map[string]any {
		if who != "" {
			extra["memberId"] = w.Vars["member:"+who]
		}
		return extra
	}
	setState := func(recipe, state, member string, memberID any) {
		body := memberBody(member, map[string]any{"state": state})
		if memberID != nil {
			body["memberId"] = memberID
		}
		w.Last = w.Client.Do("PUT", fmt.Sprintf("/api/recipes/%v/preference", w.Vars["recipe:"+recipe]), body)
	}
	sc.Step(`^I set the Recipe "([^"]*)" to "([^"]*)" for my Member$`, func(r, s string) { setState(r, s, "", nil) })
	sc.Step(`^I set the Recipe "([^"]*)" to "([^"]*)" for the Member "([^"]*)"$`, func(r, s, m string) { setState(r, s, m, nil) })
	sc.Step(`^I set the Recipe "([^"]*)" to "([^"]*)" for the Member with id (\d+)$`, func(r, s string, id int) { setState(r, s, "", id) })
	setExcluded := func(ing, member string, excluded bool) {
		body := memberBody(member, map[string]any{"excluded": excluded})
		w.Last = w.Client.Do("PUT", fmt.Sprintf("/api/ingredient-exclusions/%v", w.Vars["ingredient:"+ing]), body)
	}
	sc.Step(`^I exclude the Ingredient "([^"]*)" for the Member "([^"]*)"$`, func(i, m string) { setExcluded(i, m, true) })
	sc.Step(`^I allow the Ingredient "([^"]*)" again for the Member "([^"]*)"$`, func(i, m string) { setExcluded(i, m, false) })

	prefs := func(member string) (map[string]string, []float64, error) {
		r := w.Client.Get(fmt.Sprintf("/api/recipe-preferences?memberId=%v", w.Vars["member:"+member]))
		if r.Status != 200 {
			return nil, nil, fmt.Errorf("preferences: %d %s", r.Status, r.Body)
		}
		var v struct {
			Recipes             map[string]string `json:"recipes"`
			ExcludedIngredients []float64         `json:"excludedIngredients"`
		}
		r.MustJSON(w.TB, &v)
		return v.Recipes, v.ExcludedIngredients, nil
	}
	sc.Step(`^the preferences of the Member "([^"]*)" show the Recipe "([^"]*)" as "([^"]*)"$`, func(m, recipe, want string) error {
		recipes, _, err := prefs(m)
		if err != nil {
			return err
		}
		got := recipes[fmt.Sprint(w.Vars["recipe:"+recipe])]
		if got == "" {
			got = "none"
		}
		if got != want {
			return fmt.Errorf("%s sees %q as %q, want %q", m, recipe, got, want)
		}
		return nil
	})
	excludes := func(m, ing string) (bool, error) {
		_, ids, err := prefs(m)
		if err != nil {
			return false, err
		}
		for _, id := range ids {
			if fmt.Sprint(int64(id)) == fmt.Sprint(w.Vars["ingredient:"+ing]) {
				return true, nil
			}
		}
		return false, nil
	}
	sc.Step(`^the preferences of the Member "([^"]*)" exclude the Ingredient "([^"]*)"$`, func(m, ing string) error {
		if ok, err := excludes(m, ing); err != nil || !ok {
			return fmt.Errorf("%s does not exclude %s (%v)", m, ing, err)
		}
		return nil
	})
	sc.Step(`^the preferences of the Member "([^"]*)" do not exclude the Ingredient "([^"]*)"$`, func(m, ing string) error {
		if ok, err := excludes(m, ing); err != nil || ok {
			return fmt.Errorf("%s still excludes %s (%v)", m, ing, err)
		}
		return nil
	})
}

// namesAre checks the "name" of each element of a JSON array response, in order.
func namesAre(w *World, want string) error {
	var items []struct {
		Name string `json:"name"`
	}
	if err := w.Last.JSON(&items); err != nil {
		return fmt.Errorf("not a JSON array: %v; body: %s", err, w.Last.Body)
	}
	var names []string
	for _, it := range items {
		names = append(names, it.Name)
	}
	if got := strings.Join(names, ", "); got != want {
		return fmt.Errorf("names = %q, want %q", got, want)
	}
	return nil
}

// recipeJSONIs is like the common JSON field step but a numeric path segment indexes an array.
func recipeJSONIs(w *World, path, want string) error {
	var cur any
	if err := w.Last.JSON(&cur); err != nil {
		return fmt.Errorf("response is not JSON: %v; body: %s", err, w.Last.Body)
	}
	for _, key := range strings.Split(path, ".") {
		switch node := cur.(type) {
		case map[string]any:
			v, ok := node[key]
			if !ok {
				return fmt.Errorf("path %q: key %q missing; body: %s", path, key, w.Last.Body)
			}
			cur = v
		case []any:
			i, err := strconv.Atoi(key)
			if err != nil || i < 0 || i >= len(node) {
				return fmt.Errorf("path %q: bad index %q; body: %s", path, key, w.Last.Body)
			}
			cur = node[i]
		default:
			return fmt.Errorf("path %q: %v is not a container; body: %s", path, cur, w.Last.Body)
		}
	}
	want = recipeVars(w, want)
	if got := fmt.Sprint(cur); got != want {
		return fmt.Errorf("field %q = %q, want %q", path, got, want)
	}
	return nil
}
