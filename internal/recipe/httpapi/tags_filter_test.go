package httpapi_test

import (
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// b8-recipes: GET /api/recipes?tag=a&tag=b keeps the Recipes that carry every Tag; ?tag=a still works
// (docs/dev/design/b8-recipes.md 2.3).
func TestListByRepeatedTagParamsNeedsEveryTag(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	ing := seedIngredient(t, env)
	for _, r := range []struct {
		name string
		tags []string
	}{
		{"Fish pie", []string{"fish", "oven"}},
		{"Fish fingers", []string{"fish", "quick"}},
		{"Roast", []string{"oven"}},
	} {
		m := body(ing, r.name, map[string]any{"tags": r.tags})
		if res := user.Post("/api/recipes", m); res.Status != 201 {
			t.Fatalf("create %s: %d %s", r.name, res.Status, res.Body)
		}
	}
	names := func(path string) []string {
		var list []struct {
			Name string `json:"name"`
		}
		res := user.Get(path)
		if res.Status != 200 {
			t.Fatalf("GET %s = %d %s", path, res.Status, res.Body)
		}
		res.MustJSON(t, &list)
		out := []string{}
		for _, s := range list {
			out = append(out, s.Name)
		}
		return out
	}
	for _, tc := range []struct {
		path string
		want []string
	}{
		{"/api/recipes?tag=fish", []string{"Fish fingers", "Fish pie"}},
		{"/api/recipes?tag=FISH&tag=oven", []string{"Fish pie"}},
		{"/api/recipes?tag=oven&tag=fish", []string{"Fish pie"}},
		{"/api/recipes?tag=fish&tag=quick", []string{"Fish fingers"}},
		{"/api/recipes?tag=quick&tag=oven", []string{}},
		{"/api/recipes?tag=fish&tag=fish", []string{"Fish fingers", "Fish pie"}},
		{"/api/recipes?tag=&tag=oven", []string{"Fish pie", "Roast"}},
		{"/api/recipes?tag=fish&tag=nope", []string{}},
		{"/api/recipes?tag=fish&tag=oven&q=pie", []string{"Fish pie"}},
	} {
		if got := names(tc.path); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s = %q, want %q", tc.path, got, tc.want)
		}
	}
}
