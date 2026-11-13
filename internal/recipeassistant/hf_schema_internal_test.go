package recipeassistant

import "testing"

// HF-schema: the none sentinels of the four Base recipe fields, in pruneNone.

func TestPruneNoneMapsTheHotfixSentinelsBackToAbsent(t *testing.T) {
	line := func(extra map[string]any) map[string]any {
		m := map[string]any{"ingredient": "milk", "quantity": float64(1), "unit": "l", "note": "", "optional": false}
		for k, v := range extra {
			m[k] = v
		}
		return m
	}
	answer := map[string]any{"format": "feeder-recipe-file", "version": float64(1), "recipes": []any{
		map[string]any{"name": "A", "yield": float64(1), "baseRecipe": false, "yieldUnit": "", "ingredients": []any{
			line(map[string]any{"recipe": map[string]any{"name": "", "cue": ""}, "neededAtStep": float64(-1)}),
			line(map[string]any{"recipe": map[string]any{"name": "", "cue": "see page 4"}, "neededAtStep": float64(-1)}),
			line(map[string]any{"recipe": map[string]any{"name": "B", "cue": ""}, "neededAtStep": float64(0)}),
		}},
		map[string]any{"name": "B", "yield": float64(1), "baseRecipe": true, "yieldUnit": "l", "ingredients": []any{}},
	}}
	recs := pruneNone(answer)["recipes"].([]any)
	a := recs[0].(map[string]any)
	for _, k := range []string{"baseRecipe", "yieldUnit"} {
		if _, has := a[k]; has {
			t.Errorf("%s none must be dropped, got %v", k, a[k])
		}
	}
	lines := a["ingredients"].([]any)
	l0 := lines[0].(map[string]any)
	for _, k := range []string{"recipe", "neededAtStep"} {
		if _, has := l0[k]; has {
			t.Errorf("line 0: %s none must be dropped, got %v", k, l0[k])
		}
	}
	l2 := lines[2].(map[string]any)
	if l2["recipe"].(map[string]any)["name"] != "B" || l2["neededAtStep"] != float64(0) {
		t.Errorf("neededAtStep 0 and a named recipe stay: %v", l2)
	}
	b := recs[1].(map[string]any)
	if b["baseRecipe"] != true || b["yieldUnit"] != "l" {
		t.Errorf("a Base recipe keeps baseRecipe and yieldUnit: %v", b)
	}
	if _, has := lines[1].(map[string]any)["recipe"]; has {
		// a cue without a name is still none: the name is what points at the recipe.
		t.Errorf("an empty name means none even when the cue is filled: %v", lines[1])
	}
}
