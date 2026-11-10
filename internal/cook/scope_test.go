package cook_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/cook"
)

func TestScopeStringsAndParse(t *testing.T) {
	if got := cook.MealScope("2026-11-09", 4); got != "meal:2026-11-09/4" {
		t.Errorf("MealScope = %q", got)
	}
	if got := cook.RecipeScope(12); got != "recipe:12" {
		t.Errorf("RecipeScope = %q", got)
	}
	m, err := cook.ParseScope("meal:2026-11-09/4")
	if err != nil || !m.IsMeal || m.Date != "2026-11-09" || m.MealSlotID != 4 {
		t.Errorf("meal parse = %+v, %v", m, err)
	}
	r, err := cook.ParseScope("recipe:12")
	if err != nil || r.IsMeal || r.RecipeID != 12 {
		t.Errorf("recipe parse = %+v, %v", r, err)
	}
}

func TestParseScopeRejectsEverythingElse(t *testing.T) {
	for _, s := range []string{"", "meal:", "meal:2026-11-09", "meal:2026-11-09/0", "meal:2026-02-30/1", "meal:2026-11-09/x", "meal:09-11-2026/1",
		"recipe:", "recipe:0", "recipe:-3", "recipe:1.5", "recipe:abc", "Recipe:1", "meal:2026-11-09/1 ", "other:1"} {
		if _, err := cook.ParseScope(s); !errors.Is(err, cook.ErrInvalidScope) {
			t.Errorf("ParseScope(%q) err = %v, want ErrInvalidScope", s, err)
		}
	}
}
