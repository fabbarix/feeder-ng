package store_test

import (
	"fmt"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/store"
)

// b8-recipes: ListFilter.Tags is a list; a Recipe must carry EVERY Tag in it (AND; it narrows, like the other filters).
// docs/dev/design/b8-recipes.md 2.2.
func TestListFilterBySeveralTagsNeedsEveryOne(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	mk := func(name string, tags ...string) int64 {
		in := pancakes(i)
		in.Name, in.Tags = name, tags
		r, err := f.s.Create(ctx, in)
		if err != nil {
			t.Fatal(err)
		}
		return r.ID
	}
	mk("Fish pie", "fish", "oven", "family")
	mk("Fish fingers", "Fish", "quick", "kids")
	mk("Roast", "oven", "family")
	archived := mk("Old pie", "fish", "oven")
	mk("Plain")
	if _, err := f.s.SetArchived(ctx, archived, true); err != nil {
		t.Fatal(err)
	}
	names := func(fl store.ListFilter) []string {
		list, err := f.s.List(ctx, fl)
		if err != nil {
			t.Fatal(err)
		}
		out := []string{}
		for _, s := range list {
			out = append(out, s.Name)
		}
		return out
	}
	for _, tc := range []struct {
		name string
		f    store.ListFilter
		want []string
	}{
		{"no Tags = any", store.ListFilter{}, []string{"Fish fingers", "Fish pie", "Plain", "Roast"}},
		{"an empty list = any", store.ListFilter{Tags: []string{}}, []string{"Fish fingers", "Fish pie", "Plain", "Roast"}},
		{"one Tag, by key", store.ListFilter{Tags: []string{"FISH"}}, []string{"Fish fingers", "Fish pie"}},
		{"two Tags: every one is needed", store.ListFilter{Tags: []string{"fish", "oven"}}, []string{"Fish pie"}},
		{"order does not matter", store.ListFilter{Tags: []string{"oven", "fish"}}, []string{"Fish pie"}},
		{"three Tags", store.ListFilter{Tags: []string{"fish", "oven", "family"}}, []string{"Fish pie"}},
		{"two Tags no Recipe has together", store.ListFilter{Tags: []string{"quick", "oven"}}, []string{}},
		{"an unknown Tag empties the list", store.ListFilter{Tags: []string{"fish", "nope"}}, []string{}},
		{"a repeated Tag is the same as one", store.ListFilter{Tags: []string{"Fish", "FISH", " fish "}}, []string{"Fish fingers", "Fish pie"}},
		{"blank names are ignored", store.ListFilter{Tags: []string{"", "  ", "oven"}}, []string{"Fish pie", "Roast"}},
		{"only blank names = any", store.ListFilter{Tags: []string{" "}}, []string{"Fish fingers", "Fish pie", "Plain", "Roast"}},
		{"with the other filters (archived)", store.ListFilter{Tags: []string{"fish", "oven"}, Archived: "all"}, []string{"Fish pie", "Old pie"}},
		{"with the name query", store.ListFilter{Tags: []string{"oven"}, Query: "roa"}, []string{"Roast"}},
	} {
		if got := names(tc.f); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: %q, want %q", tc.name, got, tc.want)
		}
	}
}

// Review fix: no Recipe carries more than recipe.MaxTags Tags, so a filter with more keys matches none, and a long ?tag= list
// never reaches SQLite (1 000 ANDed EXISTS passed its maximum expression depth: "Expression tree is too large").
func TestListFilterMoreTagsThanARecipeCanCarryMatchesNone(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	in := pancakes(i)
	in.Tags = []string{}
	for n := 0; n < recipe.MaxTags; n++ {
		in.Tags = append(in.Tags, fmt.Sprintf("tag %d", n))
	}
	if _, err := f.s.Create(ctx, in); err != nil {
		t.Fatal(err)
	}
	all, err := f.s.List(ctx, store.ListFilter{Tags: in.Tags})
	if err != nil || len(all) != 1 {
		t.Fatalf("every one of its %d Tags: %d Recipes, %v; want 1", recipe.MaxTags, len(all), err)
	}
	for _, n := range []int{recipe.MaxTags + 1, 1500} {
		tags := append([]string{}, in.Tags...)
		for k := recipe.MaxTags; k < n; k++ {
			tags = append(tags, fmt.Sprintf("tag %d", k))
		}
		list, err := f.s.List(ctx, store.ListFilter{Tags: tags})
		if err != nil || len(list) != 0 {
			t.Errorf("%d Tags: %d Recipes, %v; want none and no error", n, len(list), err)
		}
	}
}
