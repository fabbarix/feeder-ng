package recipe_test

import (
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe"
)

// b8-recipes: TagKeys turns the Tag names of a list filter (repeated ?tag=) into the keys the store matches, in order
// (docs/dev/design/b8-recipes.md 2.1).
func TestTagKeysNormalisesDropsEmptiesAndRepeatsKeepingOrder(t *testing.T) {
	for _, tc := range []struct {
		name string
		in   []string
		want []string
	}{
		{"nothing", nil, []string{}},
		{"one", []string{"Fish"}, []string{"fish"}},
		{"trimmed and case folded, whitespace collapsed", []string{"  Slow   Cooker "}, []string{"slow cooker"}},
		{"blanks are dropped", []string{"", "  ", "fish"}, []string{"fish"}},
		{"a repeat by key is dropped, the first keeps its place", []string{"Fish", "roast", "FISH", " Roast"}, []string{"fish", "roast"}},
		{"order is the order given", []string{"b", "a", "c"}, []string{"b", "a", "c"}},
	} {
		if got := recipe.TagKeys(tc.in); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: TagKeys(%q) = %q, want %q", tc.name, tc.in, got, tc.want)
		}
	}
}

func TestTagKeysAgreesWithTagKey(t *testing.T) {
	got := recipe.TagKeys([]string{"Épicé  Fort"})
	if len(got) != 1 || got[0] != recipe.TagKey("Épicé  Fort") {
		t.Errorf("TagKeys = %q, want [%q]", got, recipe.TagKey("Épicé  Fort"))
	}
}
