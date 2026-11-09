package bdd

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"regexp"
	"sort"
	"strings"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/units"
)

func init() { RegisterSteps("import-export", importExportSteps) }

var rfPlaceholder = regexp.MustCompile(`<id:([^>]+)>`)

// importExportSteps drives Recipe File export, Import Review and the Agent Prompt over HTTP.
// State lives in w.Vars under "rf-" keys: rf-review (review id), rf-plan (recipefile.Plan),
// rf-download ([]byte), rf-answers (the last answers body), rf-ingredient:<key>, rf-recipe:<key>.
func importExportSteps(sc *godog.ScenarioContext, w *World) {
	if w.Vars == nil {
		w.Vars = map[string]any{}
	}
	key := func(name string) string { return units.NormalizeName(name) }
	fail := func(f string, a ...any) error { return fmt.Errorf(f+"; last response: %s", append(a, w.Last.Body)...) }

	resolve := func(s string) string {
		return rfPlaceholder.ReplaceAllStringFunc(s, func(m string) string {
			name := rfPlaceholder.FindStringSubmatch(m)[1]
			return fmt.Sprint(w.Vars["rf-ingredient:"+key(name)])
		})
	}
	idOf := func(body []byte) int64 {
		var v struct {
			ID int64 `json:"id"`
		}
		_ = json.Unmarshal(body, &v)
		return v.ID
	}
	ingredient := func(name, base string) error {
		r := w.Client.Do("POST", "/api/ingredients", map[string]any{"name": name, "baseUnit": base})
		if r.Status != 201 {
			return fmt.Errorf("creating Ingredient %q: %d %s", name, r.Status, r.Body)
		}
		w.Vars["rf-ingredient:"+key(name)] = idOf(r.Body)
		return nil
	}
	pngDataURL := func() string {
		var b bytes.Buffer
		_ = png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 32, 24)))
		return "data:image/png;base64," + base64.StdEncoding.EncodeToString(b.Bytes())
	}
	recipeWith := func(name, ing string, photo bool) error {
		if _, ok := w.Vars["rf-ingredient:"+key(ing)]; !ok {
			if err := ingredient(ing, "g"); err != nil {
				return err
			}
		}
		body := map[string]any{
			"name": name, "yield": 2,
			"lines": []map[string]any{{"ingredientId": w.Vars["rf-ingredient:"+key(ing)], "quantity": 100, "unit": "g"}},
			"steps": []map[string]any{{"text": "Cook", "kind": "active", "durationMinutes": 5}},
		}
		if photo {
			up := w.Client.Do("POST", "/api/images", map[string]any{"dataUrl": pngDataURL()})
			if up.Status != 201 {
				return fmt.Errorf("uploading photo: %d %s", up.Status, up.Body)
			}
			var v struct{ ID string }
			up.MustJSON(w.TB, &v)
			body["image"] = v.ID
		}
		r := w.Client.Do("POST", "/api/recipes", body)
		if r.Status != 201 {
			return fmt.Errorf("creating Recipe %q: %d %s", name, r.Status, r.Body)
		}
		w.Vars["rf-recipe:"+key(name)] = idOf(r.Body)
		return nil
	}

	// Household set-up.
	sc.Step(`^the household already has the Ingredient "([^"]*)" with Base Unit "(g|ml|piece)"$`, ingredient)
	sc.Step(`^the household already has the Recipe "([^"]*)"$`, func(name string) error { return recipeWith(name, "filler water", false) })
	sc.Step(`^the household has the Recipe File Recipe "([^"]*)" with a photo, using the Ingredient "([^"]*)" in g$`,
		func(name, ing string) error { return recipeWith(name, ing, true) })
	sc.Step(`^the household has the Recipe File Recipe "([^"]*)", using the Ingredient "([^"]*)" in g$`,
		func(name, ing string) error { return recipeWith(name, ing, false) })
	sc.Step(`^the Recipe "([^"]*)" is deleted behind the review's back$`, func(name string) error {
		r := w.Client.Do("DELETE", fmt.Sprintf("/api/recipes/%v", w.Vars["rf-recipe:"+key(name)]), nil)
		if r.Status != 204 {
			return fmt.Errorf("deleting Recipe: %d %s", r.Status, r.Body)
		}
		return nil
	})

	// Export.
	download := func(path string) {
		w.Last = w.Client.Do("GET", path, nil)
		if w.Last.Status == 200 {
			w.Vars["rf-download"] = append([]byte(nil), w.Last.Body...)
		}
	}
	sc.Step(`^I export all Recipes$`, func() { download("/api/recipe-file/export?all=1") })
	sc.Step(`^I export the Recipe "([^"]*)"$`, func(name string) {
		download(fmt.Sprintf("/api/recipe-file/export?ids=%v", w.Vars["rf-recipe:"+key(name)]))
	})
	sc.Step(`^I export the Recipe with id (\d+)$`, func(id int) { download(fmt.Sprintf("/api/recipe-file/export?ids=%d", id)) })
	sc.Step(`^the download is named "([^"]*)"$`, func(name string) error {
		want := fmt.Sprintf(`attachment; filename=%q`, name)
		if got := w.Last.Header.Get("Content-Disposition"); got != want {
			return fmt.Errorf("Content-Disposition = %q, want %q", got, want)
		}
		return nil
	})
	downloaded := func() (recipefile.File, error) {
		data, _ := w.Vars["rf-download"].([]byte)
		return recipefile.Parse(data)
	}
	sc.Step(`^the downloaded Recipe File is valid and holds the Recipes "([^"]*)"$`, func(names string) error {
		f, err := downloaded()
		if err != nil {
			return fmt.Errorf("the download does not validate: %v", err)
		}
		var got []string
		for _, r := range f.Recipes {
			got = append(got, r.Name)
		}
		return sameSet("Recipes", got, names)
	})
	sc.Step(`^the downloaded Recipe File defines the Ingredients "([^"]*)"$`, func(names string) error {
		f, err := downloaded()
		if err != nil {
			return err
		}
		var got []string
		for _, i := range f.Ingredients {
			got = append(got, strings.ToLower(i.Name))
		}
		return sameSet("Ingredients", got, names)
	})
	sc.Step(`^the Recipe "([^"]*)" in the downloaded Recipe File has its photo embedded$`, func(name string) error {
		f, err := downloaded()
		if err != nil {
			return err
		}
		for _, r := range f.Recipes {
			if r.Name == name {
				if !strings.HasPrefix(r.Image, "data:image/webp;base64,") {
					return fmt.Errorf("image = %.40q", r.Image)
				}
				return nil
			}
		}
		return fmt.Errorf("no Recipe %q in the download", name)
	})

	// Import Review.
	open := func(text string) {
		w.Last = w.Client.Do("POST", "/api/imports", map[string]any{"text": text})
		if w.Last.Status == 201 {
			saveReview(w)
		}
	}
	sc.Step(`^I review the example Recipe File$`, func() { open(string(spec.Example)) })
	sc.Step(`^I review this Recipe File:$`, func(doc *godog.DocString) { open(doc.Content) })
	sc.Step(`^I review the text (.*)$`, func(text string) { open(text) })
	sc.Step(`^I review the downloaded Recipe File$`, func() {
		data, _ := w.Vars["rf-download"].([]byte)
		open(string(data))
	})
	sc.Step(`^I answer the review with:$`, func(doc *godog.DocString) {
		body := resolve(doc.Content)
		w.Vars["rf-answers"] = body
		w.Last = w.Client.Do("POST", fmt.Sprintf("/api/imports/%v/plan", w.Vars["rf-review"]), []byte(body))
		if w.Last.Status == 200 {
			saveReview(w)
		}
	})
	sc.Step(`^I confirm the review with no answers$`, func() {
		w.Last = w.Client.Do("POST", fmt.Sprintf("/api/imports/%v/confirm", w.Vars["rf-review"]), []byte(`{"decisions":{}}`))
	})
	sc.Step(`^I confirm the review with the same answers$`, func() {
		body, _ := w.Vars["rf-answers"].(string)
		w.Last = w.Client.Do("POST", fmt.Sprintf("/api/imports/%v/confirm", w.Vars["rf-review"]), []byte(body))
	})

	plan := func() recipefile.Plan { p, _ := w.Vars["rf-plan"].(recipefile.Plan); return p }
	sc.Step(`^the review is ready$`, func() error {
		if !plan().Ready {
			return fail("the review is not ready: %+v", plan())
		}
		return nil
	})
	sc.Step(`^the review is not ready$`, func() error {
		if plan().Ready {
			return fail("the review is ready")
		}
		return nil
	})
	sc.Step(`^the review lists the Ingredient "([^"]*)" as "(exact|new|suggested|conflict|undefined)"$`, func(name, status string) error {
		for _, m := range plan().Ingredients {
			if m.Key == key(name) {
				if m.Status != status {
					return fail("%q is %q, want %q", name, m.Status, status)
				}
				return nil
			}
		}
		return fail("no row for the Ingredient %q", name)
	})
	sc.Step(`^the review lists (\d+) Ingredients and (\d+) Recipes$`, func(i, r int) error {
		if p := plan(); len(p.Ingredients) != i || len(p.Recipes) != r {
			return fail("%d Ingredients and %d Recipes", len(p.Ingredients), len(p.Recipes))
		}
		return nil
	})
	sc.Step(`^the first suggestion for "([^"]*)" is "([^"]*)"$`, func(name, want string) error {
		for _, m := range plan().Ingredients {
			if m.Key == key(name) {
				if len(m.Suggestions) == 0 || m.Suggestions[0].Name != want {
					return fail("suggestions = %+v", m.Suggestions)
				}
				return nil
			}
		}
		return fail("no row for %q", name)
	})
	sc.Step(`^the review has a conflict for the Recipe "([^"]*)"$`, func(name string) error {
		for _, r := range plan().Recipes {
			if key(r.Name) == key(name) && r.Status == recipefile.RecipeConflict {
				return nil
			}
		}
		return fail("no Recipe conflict for %q", name)
	})
	sc.Step(`^the review asks for a Unit Conversion of "([^"]*)" for "([^"]*)"$`, func(unit, name string) error {
		for _, u := range plan().UnitPrompts {
			if u.Unit == unit && u.Key == key(name) && !u.Answered {
				return nil
			}
		}
		return fail("no open prompt for %q of %q: %+v", unit, name, plan().UnitPrompts)
	})
	sc.Step(`^the review has (\d+) Unit Conversion prompts?$`, func(n int) error {
		if got := len(plan().UnitPrompts); got != n {
			return fail("%d prompts, want %d", got, n)
		}
		return nil
	})
	sc.Step(`^the review has a warning at "([^"]*)"$`, func(path string) error {
		for _, wn := range plan().Warnings {
			if wn.Path == path {
				return nil
			}
		}
		return fail("no warning at %s: %+v", path, plan().Warnings)
	})
	sc.Step(`^the file errors include the path "([^"]*)"$`, func(path string) error {
		var v struct {
			Error struct{ Errors []recipefile.PathError }
		}
		w.Last.MustJSON(w.TB, &v)
		for _, e := range v.Error.Errors {
			if e.Path == path {
				return nil
			}
		}
		return fail("no error at %s: %+v", path, v.Error.Errors)
	})

	// What the household holds afterwards.
	recipes := func() ([]map[string]any, error) {
		r := w.Client.Do("GET", "/api/recipes?archived=all", nil)
		var list []map[string]any
		return list, json.Unmarshal(r.Body, &list)
	}
	ingredients := func() ([]map[string]any, error) {
		r := w.Client.Do("GET", "/api/ingredients", nil)
		var list []map[string]any
		return list, json.Unmarshal(r.Body, &list)
	}
	byName := func(list []map[string]any, name string) map[string]any {
		for _, m := range list {
			if key(fmt.Sprint(m["name"])) == key(name) {
				return m
			}
		}
		return nil
	}
	recipeJSON := func(name string) (map[string]any, error) {
		list, err := recipes()
		if err != nil {
			return nil, err
		}
		m := byName(list, name)
		if m == nil {
			return nil, fmt.Errorf("no Recipe %q", name)
		}
		r := w.Client.Do("GET", fmt.Sprintf("/api/recipes/%v", m["id"]), nil)
		var full map[string]any
		return full, json.Unmarshal(r.Body, &full)
	}
	sc.Step(`^the household has the Recipes "([^"]*)"$`, func(names string) error {
		list, err := recipes()
		if err != nil {
			return err
		}
		var got []string
		for _, m := range list {
			got = append(got, fmt.Sprint(m["name"]))
		}
		return sameSet("Recipes", got, names)
	})
	sc.Step(`^the household has (\d+) Recipes?$`, func(n int) error {
		list, err := recipes()
		if err == nil && len(list) != n {
			err = fmt.Errorf("%d Recipes, want %d", len(list), n)
		}
		return err
	})
	sc.Step(`^the household has (\d+) Ingredients?$`, func(n int) error {
		list, err := ingredients()
		if err == nil && len(list) != n {
			err = fmt.Errorf("%d Ingredients, want %d", len(list), n)
		}
		return err
	})
	sc.Step(`^the household has the Ingredient "([^"]*)"$`, func(name string) error {
		list, err := ingredients()
		if err == nil && byName(list, name) == nil {
			err = fmt.Errorf("no Ingredient %q", name)
		}
		return err
	})
	sc.Step(`^the household has no Ingredient "([^"]*)"$`, func(name string) error {
		list, err := ingredients()
		if err == nil && byName(list, name) != nil {
			err = fmt.Errorf("Ingredient %q exists", name)
		}
		return err
	})
	sc.Step(`^the stored Ingredient "([^"]*)" has Base Unit "(g|ml|piece)"$`, func(name, base string) error {
		list, err := ingredients()
		if err != nil {
			return err
		}
		if m := byName(list, name); m == nil || m["baseUnit"] != base {
			return fmt.Errorf("Ingredient %q = %v", name, m)
		}
		return nil
	})
	sc.Step(`^the stored Ingredient "([^"]*)" has the Unit Conversion "([^"]*)" = ([0-9.]+)$`, func(name, unit string, toBase float64) error {
		list, err := ingredients()
		if err != nil {
			return err
		}
		m := byName(list, name)
		if m == nil {
			return fmt.Errorf("no Ingredient %q", name)
		}
		convs, _ := m["conversions"].([]any)
		for _, c := range convs {
			if cm := c.(map[string]any); cm["unit"] == unit && cm["toBase"] == toBase {
				return nil
			}
		}
		return fmt.Errorf("Ingredient %q conversions = %v", name, convs)
	})
	sc.Step(`^the Recipe "([^"]*)" has (\d+) lines and (\d+) Steps$`, func(name string, lines, steps int) error {
		m, err := recipeJSON(name)
		if err != nil {
			return err
		}
		if l, s := len(m["lines"].([]any)), len(m["steps"].([]any)); l != lines || s != steps {
			return fmt.Errorf("%d lines and %d Steps", l, s)
		}
		return nil
	})
	sc.Step(`^the Recipe "([^"]*)" uses the Ingredient "([^"]*)"$`, func(name, ing string) error {
		m, err := recipeJSON(name)
		if err != nil {
			return err
		}
		for _, l := range m["lines"].([]any) {
			if key(fmt.Sprint(l.(map[string]any)["ingredient"])) == key(ing) {
				return nil
			}
		}
		return fmt.Errorf("no line with %q: %v", ing, m["lines"])
	})
	sc.Step(`^the Recipe "([^"]*)" keeps its id$`, func(name string) error {
		m, err := recipeJSON(name)
		if err != nil {
			return err
		}
		if fmt.Sprint(m["id"]) != fmt.Sprint(w.Vars["rf-recipe:"+key(name)]) {
			return fmt.Errorf("id = %v, was %v", m["id"], w.Vars["rf-recipe:"+key(name)])
		}
		return nil
	})
	sc.Step(`^the Recipe "([^"]*)" has no photo$`, func(name string) error {
		m, err := recipeJSON(name)
		if err == nil && m["imageUrl"] != "" {
			err = fmt.Errorf("imageUrl = %v", m["imageUrl"])
		}
		return err
	})

	// Agent Prompt.
	prompt := func() (string, error) {
		var v struct{ Prompt string }
		if err := w.Last.JSON(&v); err != nil {
			return "", err
		}
		return v.Prompt, nil
	}
	sc.Step(`^the Agent Prompt starts with "([^"]*)"$`, func(prefix string) error {
		p, err := prompt()
		if err == nil && !strings.HasPrefix(p, prefix) {
			err = fmt.Errorf("prompt starts with %.60q", p)
		}
		return err
	})
	sc.Step(`^the Agent Prompt contains the schema and the example$`, func() error {
		p, err := prompt()
		if err == nil && !(strings.Contains(p, strings.TrimSpace(string(spec.Schema))) && strings.Contains(p, strings.TrimSpace(string(spec.Example)))) {
			err = fmt.Errorf("schema or example missing")
		}
		return err
	})
	sc.Step(`^the Agent Prompt has no template placeholders left$`, func() error {
		p, err := prompt()
		if err == nil && strings.Contains(p, "{{") {
			err = fmt.Errorf("placeholders left")
		}
		return err
	})
}

// saveReview remembers the review id and plan from the last {id, plan} response.
func saveReview(w *World) {
	var v struct {
		ID   string          `json:"id"`
		Plan recipefile.Plan `json:"plan"`
	}
	w.Last.MustJSON(w.TB, &v)
	if v.ID != "" {
		w.Vars["rf-review"] = v.ID
	}
	w.Vars["rf-plan"] = v.Plan
}

// sameSet compares a list with a comma-separated expectation, ignoring order.
func sameSet(what string, got []string, want string) error {
	var w []string
	for _, s := range strings.Split(want, ",") {
		w = append(w, strings.TrimSpace(s))
	}
	sort.Strings(got)
	sort.Strings(w)
	if strings.Join(got, "|") != strings.Join(w, "|") {
		return fmt.Errorf("%s = %v, want %v", what, got, w)
	}
	return nil
}
